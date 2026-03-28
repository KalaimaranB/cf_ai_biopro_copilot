/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.jsonc`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

export interface Env {
  LLAMAPARSE_API_KEY: string;
  DB: D1Database;
  VECTOR_INDEX: VectorizeIndex;
  AI: any;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': 'http://localhost:5173', // In production, add your deployed frontend URL
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Credentials': 'true'
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Handle CORS preflight
    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    
    const url = new URL(request.url);

    // =====================================================================
    // ROUTE 1: UPLOAD & PASS-THROUGH (The Timeout Bypass)
    // =====================================================================
    if (url.pathname === "/api/parse/upload" && request.method === "POST") {
      try {
        const formData = await request.formData();
        const file = formData.get('file') as File;
        const projectId = formData.get('projectId') as string;
        
        if (!file || !projectId) return new Response("Missing file or projectId", { status: 400, headers: corsHeaders });

        const docId = `doc-${Date.now()}`;

        // 1. Forward to LlamaParse securely
        const lpFormData = new FormData();
        lpFormData.append('file', file);
        // Optional: you can add premium flags here if you want vision features
        
        const lpRes = await fetch('https://api.cloud.llamaindex.ai/api/parsing/upload', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${env.LLAMAPARSE_API_KEY}` },
          body: lpFormData
        });
        
        if (!lpRes.ok) throw new Error(`LlamaParse Upload Failed: ${await lpRes.text()}`);
        const lpData = await lpRes.json() as { id: string };
        
        // 2. Log the "Processing" state to D1
        await env.DB.prepare(
          "INSERT INTO project_documents (id, project_id, filename, status) VALUES (?, ?, ?, 'Processing')"
        ).bind(docId, projectId, file.name).run();

        // 3. Instantly return the Job ID so the frontend can start polling
        return new Response(JSON.stringify({ jobId: lpData.id, documentId: docId }), { headers: corsHeaders });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
      }
    }

    // =====================================================================
    // ROUTE 2: POLL STATUS & INGESTION PIPELINE
    // =====================================================================
    if (url.pathname === "/api/parse/status" && request.method === "GET") {
      const jobId = url.searchParams.get("jobId");
      const docId = url.searchParams.get("documentId");

      if (!jobId || !docId) return new Response("Missing IDs", { status: 400, headers: corsHeaders });

      try {
        // 1. Check LlamaParse Job Status
        const statusRes = await fetch(`https://api.cloud.llamaindex.ai/api/parsing/job/${jobId}`, {
          headers: { 'Authorization': `Bearer ${env.LLAMAPARSE_API_KEY}` }
        });
        const statusData = await statusRes.json() as { status: string };

        // If it's still PENDING or IN_PROGRESS, tell the frontend to keep waiting
        if (statusData.status !== "SUCCESS") {
          return new Response(JSON.stringify({ status: statusData.status }), { headers: corsHeaders });
        }

        // 2. Job is SUCCESS! Fetch the Markdown payload
        const mdRes = await fetch(`https://api.cloud.llamaindex.ai/api/parsing/job/${jobId}/result/markdown`, {
          headers: { 'Authorization': `Bearer ${env.LLAMAPARSE_API_KEY}` }
        });
        const mdData = await mdRes.json() as { markdown: string };
        const markdown = mdData.markdown;

        // 3. TRUE CREDIT TRACKING
        // LlamaParse charges 4 credits per page for Vision/Multimodal extraction.
        // We look for the job metadata, or fallback to our math with the 4x Vision multiplier.
        const actualCreditsUsed = (statusData as any).job_metadata?.credits_used 
                                  || (Math.max(1, Math.ceil(markdown.length / 2500)) * 4);

        // 4. CPU-Safe Chunking
        const rawChunks = markdown.split(/\n\n+/).map(c => c.trim()).filter(c => c.length > 50);
        let chunks: string[] = [];
        let currentChunk = "";

        for (const text of rawChunks) {
          if ((currentChunk.length + text.length) < 800) {
            currentChunk += text + "\n\n";
          } else {
            if (currentChunk.trim()) chunks.push(currentChunk.trim());
            currentChunk = text + "\n\n";
          }
        }
        if (currentChunk.trim()) chunks.push(currentChunk.trim());

        // 5. Batch Vector Embedding
        const { data: embeddings } = await env.AI.run('@cf/baai/bge-large-en-v1.5', { text: chunks });
        
        const vectorInserts = embeddings.map((embedding: number[], index: number) => ({
          id: `${docId}-chunk-${index}`, // Predictable IDs so we can delete them later
          values: embedding,
          metadata: { document_id: docId, text: chunks[index] }
        }));

        await env.VECTOR_INDEX.upsert(vectorInserts);

        // 6. Commit True Credits & Chunk Count to D1
        await env.DB.prepare(
          "UPDATE project_documents SET status = 'Ready', pages_processed = ?, chunk_count = ? WHERE id = ?"
        ).bind(actualCreditsUsed, chunks.length, docId).run();

        return new Response(JSON.stringify({ status: "SUCCESS", pagesUsed: actualCreditsUsed }), { headers: corsHeaders });