import { DurableObject } from "cloudflare:workers";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Env {
  AI: any; 
  VECTOR_INDEX: VectorizeIndex;
  DB: D1Database;
}

interface ChunkMeta {
  chunkId: string;
  sourceId: number;
  title: string;
  url?: string;
  text: string;
}

interface FusionContext {
  chunks: ChunkMeta[];
  sources: { id: number; title: string; url?: string; text?: string }[];
}

// ─── Durable Object ───────────────────────────────────────────────────────────

export class LabSessionDO extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

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
    const history: { role: string; content: string }[] = (await this.ctx.storage.get("chat_history")) || [];

    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
    const writer = writable.getWriter();
    const emit = this.makeEmitter(writer);

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
      // ── Step 1: Intent & Refinement ─────────────────────────────────────────
      await emit("thought", "🔧 Analyzing acoustic intent and optimizing search parameters...");
      
      const refinementPrompt = `Analyze this user query: "${userMessage}"
      1. Classify intent as "FOUNDATIONAL" (general biology/overview/how things work) or "SPECIFIC" (niche data/mechanisms).
      2. Generate 3-5 highly specific, correctly spelled search keywords. Fix typos.
      Output ONLY valid JSON in this exact format: {"intent": "FOUNDATIONAL", "keywords": "heart pumping mechanism cardiac"}`;

      const refinedRes = await (this.env as any).AI.run("@cf/meta/llama-3-8b-instruct", {
        messages: [{ role: "user", content: refinementPrompt }],
        max_tokens: 60
      });
      
      let searchParams = { intent: "SPECIFIC", keywords: userMessage };
      try {
        searchParams = JSON.parse(refinedRes.response?.match(/\{[\s\S]*\}/)?.[0] || "{}");
      } catch (e) { /* fallback */ }

      await emit("thought", `🔍 Parallel retrieval for: [${searchParams.keywords}] (Mode: ${searchParams.intent})...`);

      // ── Step 2: Parallel Retrieval ──────────────────────────────────────────
      const [internalResult, pubmedResult] = await Promise.allSettled([
        this.searchInternal(searchParams.keywords, emit), 
        this.searchPubMed(searchParams.keywords, searchParams.intent, emit)
      ]);

      // ── Step 3: Fuse & Judge ────────────────────────────────────────────────
      const rawFusedContext = this.fuseContext(internalResult, pubmedResult);
      const verifiedChunks = await this.judgeAndFilterChunks(userMessage, rawFusedContext.chunks, emit);
      
      if (verifiedChunks.length === 0) {
        await emit("thought", "❌ No verified literature found. Short-circuiting to prevent hallucinations.");
        const fallbackMsg = "I couldn't find any verified literature on this topic in your internal database or PubMed. Could you clarify or broaden your search terms?";
        
        const words = fallbackMsg.split(" ");
        for (const word of words) await emit("text_delta", word + " ");

        history.push({ role: "user", content: userMessage });
        history.push({ role: "assistant", content: fallbackMsg });
        await this.ctx.storage.put("chat_history", history.slice(-20));
        await emit("done", { sources: [] });
        return;
      }

      const fusedContext = {
        chunks: verifiedChunks,
        sources: rawFusedContext.sources.filter(s => verifiedChunks.some(c => c.sourceId === s.id))
      };

      await emit("thought", `✅ Context loaded: ${fusedContext.chunks.length} chunks from ${fusedContext.sources.length} source(s).`);
      await emit("context_loaded", { sources: fusedContext.sources });

      const contextBlock = fusedContext.chunks.map(c => `[${c.chunkId}]\n${c.text}`).join("\n\n---\n\n");

      // ── Step 4: Synthesize ──────────────────────────────────────────────────
      await emit("thought", "🧠 Synthesizing response with sentence-level citations...");

      const systemPrompt = this.buildSystemPrompt(contextBlock, fusedContext.chunks);
      history.push({ role: "user", content: userMessage });

      const aiResponse = await (this.env as any).AI.run(
        "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
        {
          messages: [ { role: "system", content: systemPrompt }, ...history ],
          max_tokens: 2048,
          stream: false,
        }
      );

      const rawText: string = aiResponse.response?.trim() || "No response generated.";

      // ── Step 5: Citation Parsing (FIXED MAPPING) ────────────────────────────
      const { renderedText, finalSources } = this.parseCitations(rawText, fusedContext.chunks, fusedContext.sources);

      const words = renderedText.split(" ");
      for (const word of words) await emit("text_delta", word + " ");

      history.push({ role: "assistant", content: renderedText });
      await this.ctx.storage.put("chat_history", history.slice(-20)); 

      await emit("done", { sources: finalSources });

    } catch (err: any) {
      console.error("Pipeline crash:", err);
      await emit("error", { message: "A critical reasoning error occurred." });
    } finally {
      await writer.close();
    }
  }

  // ─── Semantic Re-Ranker (Balanced Judge) ──────────────────────────────────
  private async judgeAndFilterChunks(query: string, chunks: ChunkMeta[], emit: (type: string, data: unknown) => Promise<void>): Promise<ChunkMeta[]> {
    if (chunks.length === 0) return [];
    await emit("thought", "⚖️ Running semantic judge to verify literature relevance...");

    const prompt = `You are a relevance judge for a biomedical AI.
    User Query: "${query}"
    
    Evaluate these text chunks. Return a JSON array containing the numeric IDs of chunks that are RELEVANT to answering the query. 
    A chunk is relevant if it provides background physiology, mechanisms, or direct data related to the topic. 
    ONLY exclude a chunk if it is completely off-topic (e.g., about a totally different organ or disease).
    If NO chunks are relevant, output an empty array: []
    
    ${chunks.map((c, i) => `[ID: ${i}] ${c.text.substring(0, 400)}...`).join('\n\n')}
    
    Output strictly a valid JSON array of integers, e.g., [0, 2].`;
    
    try {
        const res = await (this.env as any).AI.run("@cf/meta/llama-3-8b-instruct", { messages: [{role: "user", content: prompt}], max_tokens: 30 });
        const match = res.response?.match(/\[([\d,\s]*)\]/);
        if (match) {
            const validIds = JSON.parse(match[0]) as number[];
            const survivors = chunks.filter((_, i) => validIds.includes(i));
            await emit("thought", `🧹 Judge removed ${chunks.length - survivors.length} off-topic chunk(s).`);
            return survivors;
        }
    } catch (e) {
        console.error("Judge failed", e);
    }
    
    // Failsafe: If the 8B model API hiccups, trust the vector search and let the chunks through
    return chunks; 
  }

  // ─── Internal Vector Search ─────────────────────────────────────────────────
  private async searchInternal(query: string, emit: (type: string, data: unknown) => Promise<void>): Promise<ChunkMeta[]> {
    await emit("thought", "📚 Searching internal knowledge base...");

    const embedding = await (this.env as any).AI.run("@cf/baai/bge-large-en-v1.5", { text: [query] });
    const results = await (this.env as any).VECTOR_INDEX.query(embedding.data[0], { topK: 4, returnMetadata: "all" });

    if (!results.matches || results.matches.length === 0) return [];

    const relevant = results.matches.filter((m: any) => m.score > 0.60);
    if (relevant.length === 0) return [];

    const chunks: ChunkMeta[] = [];
    let sourceId = 1;

    for (const match of relevant) {
      const docId = match.metadata?.document_id;
      let title = "Internal Document";
      if (docId) {
        const row = await (this.env as any).DB.prepare("SELECT filename FROM project_documents WHERE id = ?").bind(docId).first();
        if (row?.filename) title = row.filename as string;
      }
      chunks.push({ chunkId: `int_${chunks.length}`, sourceId, title, text: match.metadata?.text || "" });
      sourceId++;
    }
    return chunks;
  }

  // ─── PubMed Search ──────────────────────────────────────────────────────────
  private async searchPubMed(query: string, intent: string, emit: (type: string, data: unknown) => Promise<void>): Promise<ChunkMeta[]> {
    await emit("thought", "🔬 Querying PubMed for external literature...");
    try {
      const finalQuery = intent === "FOUNDATIONAL" ? `${query} AND Review[pt]` : query;
      const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(finalQuery)}&retmode=json&retmax=3&sort=relevance`;
      const searchRes = await fetch(searchUrl);
      const searchData = await searchRes.json() as any;
      const ids: string[] = searchData.esearchresult?.idlist || [];

      if (ids.length === 0) return [];

      await emit("thought", `🔬 PubMed: found ${ids.length} article(s). Fetching abstracts...`);
      const fetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${ids.join(",")}&rettype=abstract&retmode=text`;
      const text = await fetch(fetchUrl).then(r => r.text());
      const articleBlocks = text.split(/\n\n(?=\d+\.)/).slice(0, 3);

      return articleBlocks.map((block, i) => ({
        chunkId: `pub_${i}`,
        sourceId: 100 + i, 
        title: `PubMed: ${query} (${ids[i] || "abstract"})`,
        url: `https://pubmed.ncbi.nlm.nih.gov/${ids[i]}/`,
        text: block.trim(),
      }));
    } catch (err) { return []; }
  }

  // ─── Context Fusion ─────────────────────────────────────────────────────────
  private fuseContext(internalResult: PromiseSettledResult<ChunkMeta[]>, pubmedResult: PromiseSettledResult<ChunkMeta[]>): FusionContext {
    const internal = internalResult.status === "fulfilled" ? internalResult.value : [];
    const pubmed = pubmedResult.status === "fulfilled" ? pubmedResult.value : [];
    const allChunks = [...internal, ...pubmed];

    let counter = 1;
    const idMap = new Map<number, number>();

    for (const chunk of allChunks) {
      if (!idMap.has(chunk.sourceId)) idMap.set(chunk.sourceId, counter++);
      chunk.sourceId = idMap.get(chunk.sourceId)!;
    }

    const sources = allChunks
      .filter((c, i, arr) => arr.findIndex(x => x.sourceId === c.sourceId) === i)
      .map(c => ({ id: c.sourceId, title: c.title, url: c.url, text: c.text }));

    return { chunks: allChunks, sources };
  }

  // ─── System Prompt ──────────────────────────────────────────────────────────
  private buildSystemPrompt(contextBlock: string, chunks: ChunkMeta[]): string {
    const chunkIndex = chunks.map(c => `${c.chunkId} → Source [${c.sourceId}]: ${c.title}`).join("\n");

    return `You are BioPro Copilot, an expert biomedical research assistant.

CONTEXT BLOCK:
${contextBlock}

CHUNK → SOURCE MAP:
${chunkIndex}

CITATION RULES (STRICT):
1. After EVERY sentence that uses context, append the chunk ID in square brackets: e.g., "Actin regulates motility [int_0]."
2. Use EXACT chunk IDs.
3. NEVER write a "References" or "Sources" section at the end of your response.
4. Write in clear scientific prose using headers and bullets.`;
  }

  // ─── Citation Parser (THE FIX) ──────────────────────────────────────────────
  private parseCitations(
    rawText: string,
    chunks: ChunkMeta[],
    originalSources: { id: number; title: string; url?: string; text?: string }[]
  ): { renderedText: string; finalSources: any[] } {
    const chunkToSource = new Map(chunks.map(c => [c.chunkId, c.sourceId]));
    const sourceDisplayNum = new Map<number, number>();
    let displayCounter = 1;

    // Use case-insensitive regex in case LLM writes [INT_0]
    const renderedText = rawText.replace(/\[(int_\d+|pub_\d+)\]/gi, (_, chunkId) => {
      const sourceId = chunkToSource.get(chunkId.toLowerCase());
      if (sourceId === undefined) return ""; 

      if (!sourceDisplayNum.has(sourceId)) {
        sourceDisplayNum.set(sourceId, displayCounter++);
      }
      return `[${sourceDisplayNum.get(sourceId)}]`;
    });

    // Remap the source array IDs to match the newly generated display numbers
    const finalSources = originalSources
      .filter(s => sourceDisplayNum.has(s.id))
      .map(s => ({
        ...s,
        id: sourceDisplayNum.get(s.id)! // The magic link
      }))
      .sort((a, b) => a.id - b.id);

    return { renderedText, finalSources };
  }
}