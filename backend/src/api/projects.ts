export async function handleProjectRoutes(request: Request, url: URL, env: any, corsHeaders: any, userId: string) {
  
  // 1. PROJECTS
  if (url.pathname.startsWith("/api/projects")) {
    if (request.method === "DELETE") {
      const projectId = url.searchParams.get("id");
      if (!projectId) return new Response("Missing ID", { status: 400, headers: corsHeaders });
      await env.DB.prepare("DELETE FROM projects WHERE id = ? AND user_id = ?").bind(projectId, userId).run();
      return new Response(JSON.stringify({ success: true }), { headers: { 'content-type': 'application/json', ...corsHeaders } });
    }
    
    if (request.method === "GET") {
      const { results } = await env.DB.prepare(`
        SELECT p.id, p.title, p.created_at, COUNT(e.id) as experiment_count 
        FROM projects p LEFT JOIN experiments e ON p.id = e.project_id 
        WHERE p.user_id = ? GROUP BY p.id ORDER BY p.created_at DESC
      `).bind(userId).all();
      return new Response(JSON.stringify({ projects: results }), { headers: { 'content-type': 'application/json', ...corsHeaders } });
    }
    
    if (request.method === "POST") {
      const { title } = await request.json() as { title: string };
      const newId = `proj-${Date.now()}`;
      await env.DB.prepare("INSERT INTO projects (id, user_id, title) VALUES (?, ?, ?)").bind(newId, userId, title).run();
      return new Response(JSON.stringify({ id: newId, title }), { headers: { 'content-type': 'application/json', ...corsHeaders } });
    }
  }

  // 2. EXPERIMENTS
  if (url.pathname.startsWith("/api/experiments")) {
    if (request.method === "GET") {
      const projectId = url.searchParams.get("projectId");
      if (!projectId) return new Response("Missing Project ID", { status: 400, headers: corsHeaders });
      const { results } = await env.DB.prepare("SELECT * FROM experiments WHERE project_id = ? ORDER BY created_at DESC").bind(projectId).all();
      return new Response(JSON.stringify({ experiments: results }), { headers: { 'content-type': 'application/json', ...corsHeaders } });
    }
    
    if (request.method === "POST") {
      const { projectId, title } = await request.json() as { projectId: string, title: string };
      const newExpId = `exp-${Date.now()}`;
      await env.DB.prepare("INSERT INTO experiments (id, project_id, title, status) VALUES (?, ?, ?, 'In Progress')").bind(newExpId, projectId, title).run();
      return new Response(JSON.stringify({ id: newExpId, title }), { headers: { 'content-type': 'application/json', ...corsHeaders } });
    }
  }

  // 3. LOGS
  if (url.pathname.startsWith("/api/logs")) {
    const expId = url.searchParams.get("experimentId");
    if (!expId) return new Response("Missing Experiment ID", { status: 400, headers: corsHeaders });

    if (request.method === "GET") {
      const { results } = await env.DB.prepare("SELECT * FROM experiment_logs WHERE experiment_id = ? ORDER BY created_at ASC").bind(expId).all();
      return new Response(JSON.stringify({ logs: results }), { headers: { 'content-type': 'application/json', ...corsHeaders } });
    }
    
    if (request.method === "POST") {
      const { content, source } = await request.json() as { content: string, source: string };
      const newLogId = `log-${Date.now()}`;
      await env.DB.prepare("INSERT INTO experiment_logs (id, experiment_id, content, source) VALUES (?, ?, ?, ?)").bind(newLogId, expId, content, source).run();
      return new Response(JSON.stringify({ status: "success", id: newLogId }), { headers: { 'content-type': 'application/json', ...corsHeaders } });
    }
  }

  return new Response("Not Found", { status: 404, headers: corsHeaders });
}