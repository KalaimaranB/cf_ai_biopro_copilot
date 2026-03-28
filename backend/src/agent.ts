import { DurableObject } from "cloudflare:workers";

export class LabSessionDO extends DurableObject {
  async fetch(request: Request) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "*" }});
    }

    const { userMessage, mode } = await request.json() as { userMessage: string, mode: string };
    let history: { role: string, content: string }[] = await this.ctx.storage.get("chat_history") || [];
    
    // 1. THE ANTI-BIAS SYSTEM PROMPT
    const systemPrompt = `You are the BioPro Autonomous Research Agent. 

CRITICAL - STRICT TOOL ROUTING:
1. GENERAL SCIENCE: If the user asks a general biological or medical question (e.g., "how does the heart pump", "what is a macrophage"), you MUST use "search_pubmed". DO NOT search internal SOPs.
2. INTERNAL DATA: ONLY use "search_internal_sops" if the user explicitly references "my documents", "my protocol", "the uploaded paper", or specific internal lab data.

HOW TO USE A TOOL (XML FORMAT):
<use_tool>
<name>search_pubmed</name>
<query>your query here</query>
</use_tool>

ANTI-HALLUCINATION & CITATION RULES:
1. NEVER FORCE A CONNECTION. If a tool returns <context> about T-Cells, and the user is asking about the Heart, the context is useless. IGNORE IT entirely and answer from general knowledge.
2. If you use facts from the <context>, you MUST cite them inline using the provided [Source X] tags.
3. If you ignore the <context> because it is irrelevant, DO NOT use any [Source X] tags.
4. YOU ARE FORBIDDEN FROM GENERATING URLs.`;

    history.push({ role: "user", content: userMessage });
    let messagesForAI = [ { role: "system", content: systemPrompt }, ...history ];

    const encoder = new TextEncoder();
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();

    const sendEvent = async (type: string, data: string) => {
      await writer.write(encoder.encode(`data: ${JSON.stringify({ type, data })}\n\n`));
    };

    (async () => {
      let finalResponse = "";
      let isAgentFinished = false;
      let loopCount = 0;
      const maxLoops = 3; 
      let toolsUsed: string[] = [];
      let extractedSources: { id: number, title: string, url?: string }[] = [];
      let sourceCounter = 1;

      try {
        while (!isAgentFinished && loopCount < maxLoops) {
          loopCount++;
          await sendEvent("status", "Agent is reasoning...");

          const aiResponse = await this.env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
            messages: messagesForAI,
            max_tokens: 2048 
          });

          let output = aiResponse.response.trim();
          const toolRegex = /<use_tool>[\s\S]*?<name>(.*?)<\/name>[\s\S]*?<query>(.*?)<\/query>[\s\S]*?<\/use_tool>/i;
          const toolMatch = output.match(toolRegex);

          if (toolMatch) {
            const toolName = toolMatch[1].trim();
            const toolQuery = toolMatch[2].trim();
            toolsUsed.push(toolName);

            await sendEvent("status", `🔬 Consulting ${toolName.replace('search_', '').toUpperCase()} for '${toolQuery}'...`);

            let toolResult = "";
            
            if (toolName === "search_internal_sops") {
              const queryVector = await this.env.AI.run('@cf/baai/bge-large-en-v1.5', { text: [toolQuery] });
              const results = await this.env.VECTOR_INDEX.query(queryVector.data[0], { topK: 3, returnMetadata: 'all' });
              
              if (results.matches && results.matches.length > 0) {
                // We use a traditional for-loop so we can await the D1 database lookups!
                let compiledChunks = [];
                for (const m of results.matches) {
                  const sId = sourceCounter++;
                  let filename = 'Internal Doc';
                  
                  // THE MISSING FILENAME FIX: Fetch the real name directly from D1 using the document_id
                  if (m.metadata?.document_id) {
                    const docRecord = await this.env.DB.prepare("SELECT filename FROM project_documents WHERE id = ?").bind(m.metadata.document_id).first();
                    if (docRecord && docRecord.filename) filename = docRecord.filename as string;
                  }
                  
                  extractedSources.push({ id: sId, title: filename });
                  compiledChunks.push(`[Source ${sId}: ${filename}]\n${m.metadata?.text}`);
                }
                toolResult = compiledChunks.join("\n\n---\n\n");
                await sendEvent("status", `Reading ${results.matches.length} document chunks...`);
              } else {
                toolResult = "No internal documents found.";
              }
            } 
            
            else if (toolName === "search_pubmed") {
              const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(toolQuery)}&retmode=json&retmax=3&sort=relevance`;
              const searchRes = await fetch(searchUrl).then(r => r.json());
              const ids = searchRes.esearchresult?.idlist?.join(',');
              
              if (ids) {
                const fetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${ids}&rettype=abstract&retmode=text`;
                const textRes = await fetch(fetchUrl).then(r => r.text());
                
                const sId = sourceCounter++;
                const firstUrl = `https://pubmed.ncbi.nlm.nih.gov/${ids.split(',')[0]}/`;
                extractedSources.push({ id: sId, title: `PubMed Search: ${toolQuery}`, url: firstUrl });
                
                toolResult = `[Source ${sId}: PubMed Abstracts]\n\n${textRes}`;
              } else {
                toolResult = "No articles found on PubMed.";
              }
              await sendEvent("status", `Analyzing PubMed abstracts...`);
            }

            // SANITIZATION ARMOR
            const safeToolResult = toolResult.replace(/"/g, "'");

            messagesForAI.push({ role: "assistant", content: output }); 
            messagesForAI.push({ 
              role: "system", 
              content: `TOOL RESULT:\n<context>\n${safeToolResult}\n</context>\n\nCRITICAL INSTRUCTION: Read the <context>. If it is completely unrelated to the user's question, IGNORE IT and answer from general knowledge WITHOUT [Source X] tags. If it is relevant, answer and cite using [Source X]. DO NOT USE XML.` 
            });
          } 
          else {
            finalResponse = output;
            isAgentFinished = true;
          }
        }

        if (!finalResponse) finalResponse = "I reached my computational limit trying to gather data.";

        history.push({ role: "assistant", content: finalResponse });
        await this.ctx.storage.put("chat_history", history);

        await sendEvent("final", JSON.stringify({ response: finalResponse, toolsUsed, sources: extractedSources }));
        await writer.close();

      } catch (err: any) {
        console.error("Agent Loop Crash:", err);
        await sendEvent("final", JSON.stringify({ response: "I experienced a critical reasoning error.", toolsUsed: [], sources: [] }));
        await writer.close();
      }
    })();

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive"
      }
    });
  }
}