export async function handleKnowledgeRoutes(request: Request, url: URL, env: any, corsHeaders: any) {
  // 1. Get Global Credit Stats
  if (url.pathname === "/api/knowledge/stats" && request.method === "GET") {
    const { results } = await env.DB.prepare("SELECT SUM(pages_processed) as total_credits FROM project_documents WHERE status = 'Ready'").all();
    const total = results[0]?.total_credits || 0;
    return new Response(JSON.stringify({ totalCredits: total }), { headers: corsHeaders });
  }

  // 2. Get Document Library Roster
  if (url.pathname === "/api/knowledge/documents" && request.method === "GET") {
    const projectId = url.searchParams.get("projectId");
    
    let query = "SELECT * FROM project_documents ORDER BY uploaded_at DESC";
    let statement = env.DB.prepare(query);
    
    if (projectId) {
      query = "SELECT * FROM project_documents WHERE project_id = ? OR project_id = 'global' ORDER BY uploaded_at DESC";
      statement = env.DB.prepare(query).bind(projectId);
    }
    
    const { results } = await statement.all();
    return new Response(JSON.stringify({ documents: results }), { headers: corsHeaders });
  }

  // 3. Cascading Delete
  if (url.pathname === "/api/knowledge/documents" && request.method === "DELETE") {
    const docId = url.searchParams.get("id");
    if (!docId) return new Response("Missing Document ID", { status: 400, headers: corsHeaders });

    const doc = await env.DB.prepare("SELECT chunk_count FROM project_documents WHERE id = ?").bind(docId).first();
    
    if (doc && doc.chunk_count > 0) {
      const chunkIdsToDelete = Array.from({ length: doc.chunk_count as number }, (_, i) => `${docId}-chunk-${i}`);
      await env.VECTOR_INDEX.deleteByIds(chunkIdsToDelete);
    }

    await env.DB.prepare("DELETE FROM project_documents WHERE id = ?").bind(docId).run();
    return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
  }

  return new Response("Not Found", { status: 404, headers: corsHeaders });
}