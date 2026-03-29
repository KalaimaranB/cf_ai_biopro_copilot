import { DurableObject } from "cloudflare:workers";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChunkMeta {
  chunkId: string;
  sourceId: number;
  title: string;
  url?: string;
  text: string;
}

interface FusionContext {
  chunks: ChunkMeta[];
  sources: { id: number; title: string; url?: string }[];
}

// ─── Durable Object ───────────────────────────────────────────────────────────

export class LabSessionDO extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }
  // SSE helper: emits a typed event over the stream
  private makeEmitter(writer: WritableStreamDefaultWriter<Uint8Array>) {
    const encoder = new TextEncoder();
    return async (type: string, data: unknown) => {
      const payload = `data: ${JSON.stringify({ type, data })}\n\n`;
      await writer.write(encoder.encode(payload));
    };
  }

  async fetch(request: Request): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "*",
        },
      });
    }

    const { userMessage } = await request.json() as { userMessage: string };

    // Load conversation history from DO storage
    const history: { role: string; content: string }[] =
      (await this.ctx.storage.get("chat_history")) || [];

    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
    const writer = writable.getWriter();
    const emit = this.makeEmitter(writer);

    // Run the pipeline in the background so we can return the stream immediately
    this.ctx.waitUntil(this.runPipeline(userMessage, history, emit, writer));

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  }

  // ─── Main Pipeline ──────────────────────────────────────────────────────────

  private async runPipeline(
    userMessage: string,
    history: { role: string; content: string }[],
    emit: (type: string, data: unknown) => Promise<void>,
    writer: WritableStreamDefaultWriter<Uint8Array>
  ) {
    try {
      // ── Step 1: Parallel Retrieval ──────────────────────────────────────────
      await emit("thought", "🔍 Launching parallel retrieval across all knowledge sources...");

      const [internalResult, pubmedResult] = await Promise.allSettled([
        this.searchInternal(userMessage, emit),
        this.searchPubMed(userMessage, emit),
      ]);

      // ── Step 2: Fuse Context ────────────────────────────────────────────────
      const fusedContext = this.fuseContext(internalResult, pubmedResult);

      await emit("thought", `✅ Context loaded: ${fusedContext.chunks.length} chunks from ${fusedContext.sources.length} source(s).`);

      // Send source metadata immediately so the frontend can pre-build the bibliography
      await emit("context_loaded", { sources: fusedContext.sources });

      // ── Step 3: Build tagged context block ─────────────────────────────────
      const contextBlock = fusedContext.chunks
        .map(c => `[${c.chunkId}]\n${c.text}`)
        .join("\n\n---\n\n");

      // ── Step 4: Synthesize with strict citation rules ───────────────────────
      await emit("thought", "🧠 Synthesizing response with sentence-level citations...");

      const systemPrompt = this.buildSystemPrompt(contextBlock, fusedContext.chunks);

      history.push({ role: "user", content: userMessage });

      const aiResponse = await (this.env as any).AI.run(
        "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
        {
          messages: [
            { role: "system", content: systemPrompt },
            ...history,
          ],
          max_tokens: 2048,
          stream: false,
        }
      );

      const rawText: string = aiResponse.response?.trim() || "No response generated.";

      // ── Step 5: Parse chunk IDs → numbered citations ────────────────────────
      const { renderedText, citationMap } = this.parseCitations(rawText, fusedContext.chunks);

      // ── Step 6: Stream the rendered text word-by-word ──────────────────────
      const words = renderedText.split(" ");
      for (const word of words) {
        await emit("text_delta", word + " ");
      }

      // ── Step 7: Persist history & send final metadata ───────────────────────
      history.push({ role: "assistant", content: renderedText });
      await this.ctx.storage.put("chat_history", history.slice(-20)); // keep last 20 turns

      const usedSources = fusedContext.sources.filter(s =>
        citationMap.some(c => c.sourceId === s.id)
      );

      await emit("done", {
        sources: usedSources,
        citationMap,
      });

    } catch (err: any) {
      console.error("Pipeline crash:", err);
      await emit("error", { message: "A critical reasoning error occurred." });
    } finally {
      await writer.close();
    }
  }

  // ─── Internal Vector Search ─────────────────────────────────────────────────

  private async searchInternal(
    query: string,
    emit: (type: string, data: unknown) => Promise<void>
  ): Promise<ChunkMeta[]> {
    await emit("thought", "📚 Searching internal knowledge base...");

    const embedding = await (this.env as any).AI.run("@cf/baai/bge-large-en-v1.5", {
      text: [query],
    });

    const results = await (this.env as any).VECTOR_INDEX.query(
      embedding.data[0],
      { topK: 4, returnMetadata: "all" }
    );

    if (!results.matches || results.matches.length === 0) {
      await emit("thought", "📚 Internal: no relevant chunks found.");
      return [];
    }

    // Score threshold — only keep high-confidence matches
    const relevant = results.matches.filter((m: any) => m.score > 0.65);

    if (relevant.length === 0) {
      await emit("thought", "📚 Internal: chunks found but below relevance threshold.");
      return [];
    }

    await emit("thought", `📚 Internal: found ${relevant.length} relevant chunk(s).`);

    const chunks: ChunkMeta[] = [];
    let sourceId = 1;

    for (const match of relevant) {
      const docId = match.metadata?.document_id;
      let title = "Internal Document";

      if (docId) {
        const row = await (this.env as any).DB
          .prepare("SELECT filename FROM project_documents WHERE id = ?")
          .bind(docId)
          .first();
        if (row?.filename) title = row.filename as string;
      }

      const chunkIdx = chunks.length;
      chunks.push({
        chunkId: `int_${chunkIdx}`,
        sourceId,
        title,
        text: match.metadata?.text || "",
      });
      sourceId++;
    }

    return chunks;
  }

  // ─── PubMed Search ──────────────────────────────────────────────────────────

  private async searchPubMed(
    query: string,
    emit: (type: string, data: unknown) => Promise<void>
  ): Promise<ChunkMeta[]> {
    await emit("thought", "🔬 Querying PubMed for external literature...");

    try {
      const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmode=json&retmax=3&sort=relevance`;
      const searchRes = await fetch(searchUrl);
      const searchData = await searchRes.json() as any;
      const ids: string[] = searchData.esearchresult?.idlist || [];

      if (ids.length === 0) {
        await emit("thought", "🔬 PubMed: no articles found.");
        return [];
      }

      await emit("thought", `🔬 PubMed: found ${ids.length} article(s). Fetching abstracts...`);

      const fetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${ids.join(",")}&rettype=abstract&retmode=text`;
      const text = await fetch(fetchUrl).then(r => r.text());

      // Split into per-article chunks (rough split on double newline + PMID pattern)
      const articleBlocks = text.split(/\n\n(?=\d+\.)/).slice(0, 3);

      const chunks: ChunkMeta[] = articleBlocks.map((block, i) => ({
        chunkId: `pub_${i}`,
        sourceId: 100 + i, // offset so they don't collide with internal IDs
        title: `PubMed: ${query} (${ids[i] || "abstract"})`,
        url: `https://pubmed.ncbi.nlm.nih.gov/${ids[i]}/`,
        text: block.trim(),
      }));

      await emit("thought", `🔬 PubMed: ${chunks.length} abstract chunk(s) loaded.`);
      return chunks;

    } catch (err) {
      await emit("thought", "🔬 PubMed: request failed.");
      return [];
    }
  }

  // ─── Context Fusion ─────────────────────────────────────────────────────────

  private fuseContext(
    internalResult: PromiseSettledResult<ChunkMeta[]>,
    pubmedResult: PromiseSettledResult<ChunkMeta[]>
  ): FusionContext {
    const internal = internalResult.status === "fulfilled" ? internalResult.value : [];
    const pubmed = pubmedResult.status === "fulfilled" ? pubmedResult.value : [];

    const allChunks = [...internal, ...pubmed];

    // Re-number sourceIds sequentially after fusion
    let counter = 1;
    const idMap = new Map<number, number>();

    for (const chunk of allChunks) {
      if (!idMap.has(chunk.sourceId)) {
        idMap.set(chunk.sourceId, counter++);
      }
      chunk.sourceId = idMap.get(chunk.sourceId)!;
    }

    const sources = allChunks
      .filter((c, i, arr) => arr.findIndex(x => x.sourceId === c.sourceId) === i)
      .map(c => ({ id: c.sourceId, title: c.title, url: c.url }));

    return { chunks: allChunks, sources };
  }

  // ─── System Prompt ──────────────────────────────────────────────────────────

  private buildSystemPrompt(contextBlock: string, chunks: ChunkMeta[]): string {
    const chunkIndex = chunks
      .map(c => `${c.chunkId} → Source [${c.sourceId}]: ${c.title}`)
      .join("\n");

    return `You are BioPro Copilot, an expert biomedical research assistant.

You have been given a fused context block from two sources: internal lab documents and PubMed literature.

CONTEXT BLOCK:
${contextBlock || "(No relevant context found — answer from general knowledge.)"}

CHUNK → SOURCE MAP:
${chunkIndex || "(none)"}

CITATION RULES (STRICT):
1. After EVERY sentence that uses information from the context, append the chunk ID in square brackets, e.g.: "Actin regulates T-cell motility [int_0]."
2. Use the EXACT chunk ID from the CHUNK → SOURCE MAP above.
3. If a sentence uses multiple chunks, list all: "... [int_0][pub_1]."
4. If a sentence comes from your general knowledge (not the context), do NOT append any tag.
5. NEVER invent chunk IDs. Only use IDs listed above.
6. NEVER generate URLs yourself.
7. Write in clear, confident scientific prose. Use markdown headers and bullet points where helpful.`;
  }

  // ─── Citation Parser ─────────────────────────────────────────────────────────

  private parseCitations(
    rawText: string,
    chunks: ChunkMeta[]
  ): { renderedText: string; citationMap: { chunkId: string; sourceId: number }[] } {
    const chunkToSource = new Map(chunks.map(c => [c.chunkId, c.sourceId]));
    const citationMap: { chunkId: string; sourceId: number }[] = [];

    // Track which sourceIds have been assigned a display number
    const sourceDisplayNum = new Map<number, number>();
    let displayCounter = 1;

    // Replace [chunk_id] with [N] superscript notation
    const renderedText = rawText.replace(/\[(\w+_\d+)\]/g, (_, chunkId) => {
      const sourceId = chunkToSource.get(chunkId);
      if (sourceId === undefined) return ""; // unknown chunk id — strip it

      if (!sourceDisplayNum.has(sourceId)) {
        sourceDisplayNum.set(sourceId, displayCounter++);
        citationMap.push({ chunkId, sourceId });
      }

      const num = sourceDisplayNum.get(sourceId)!;
      return `[${num}]`;
    });

    return { renderedText, citationMap };
  }
}