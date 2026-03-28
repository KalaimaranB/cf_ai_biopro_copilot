import { betterAuth } from "better-auth";
import { D1Dialect } from "kysely-d1";
import { handleKnowledgeRoutes } from "./api/knowledge";
import { handleProjectRoutes } from "./api/projects";
export { LabSessionDO } from "./agent"; // Re-export the DO so Cloudflare registers it!

export interface Env {
  AI: any; 
  LAB_SESSION: DurableObjectNamespace;
  VECTOR_INDEX: VectorizeIndex;
  DB: D1Database;
  AUTH_SECRET: string;
  GOOGLE_CLIENT_ID: string;     
  GOOGLE_CLIENT_SECRET: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("Origin") || "http://localhost:5173";
    
    const corsHeaders = {
      'Access-Control-Allow-Origin': origin, 
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Credentials': 'true'
    };

    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

    const auth = betterAuth({
      database: { dialect: new D1Dialect({ database: env.DB }), type: "sqlite" },
      socialProviders: { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } },
      trustedOrigins: ["http://localhost:5173", "https://frontend.biopro.workers.dev", "https://biopro-app.pages.dev"],
      baseURL: "https://backend.biopro.workers.dev", 
      secret: env.AUTH_SECRET,
      advanced: { defaultCookieAttributes: { sameSite: "none", secure: true } }
    });

    const url = new URL(request.url);

    // 1. HANDLE AUTHENTICATION
    if (url.pathname.startsWith("/api/auth")) {
      try {
        const authResponse = await auth.handler(request);
        const newHeaders = new Headers(authResponse.headers);
        newHeaders.set("Access-Control-Allow-Origin", origin);
        newHeaders.set("Access-Control-Allow-Credentials", "true");
        return new Response(authResponse.body, { status: authResponse.status, headers: newHeaders });
      } catch (e: any) {
        return new Response(`Auth crash: ${e.message}`, { status: 500, headers: corsHeaders });
      }
    }

    // 2. GLOBAL SESSION GATEKEEPER
    let userId = "";
    if (url.pathname.startsWith("/api/") || url.pathname === "/") {
      const sessionData = await auth.api.getSession({ headers: request.headers });
      if (!sessionData || !sessionData.user) return new Response("Unauthorized", { status: 401, headers: corsHeaders });
      userId = sessionData.user.id;
    }

    // 3. ROUTER (SOLID Delegation)
    
    // --> Knowledge Base Routes
    if (url.pathname.startsWith("/api/knowledge")) {
      return handleKnowledgeRoutes(request, url, env, corsHeaders);
    }

    // --> Projects, Experiments, & Logs Routes
    if (url.pathname.startsWith("/api/projects") || url.pathname.startsWith("/api/experiments") || url.pathname.startsWith("/api/logs")) {
      return handleProjectRoutes(request, url, env, corsHeaders, userId);
    }
    
    // --> Agentic Copilot Chat
    if (request.method === "POST" && url.pathname === "/") {
      try {
        const id = env.LAB_SESSION.idFromName(userId); 
        const doResponse = await env.LAB_SESSION.get(id).fetch(request);
        
        // We must pass the stream's body directly back to the frontend, 
        // while re-attaching your CORS headers so the browser doesn't block it.
        const streamHeaders = new Headers(doResponse.headers);
        Object.entries(corsHeaders).forEach(([k, v]) => streamHeaders.set(k, v));
        
        return new Response(doResponse.body, { 
          status: doResponse.status, 
          headers: streamHeaders 
        });
      } catch (err: any) {
        console.error("DO Fetch Error:", err);
        return new Response("Internal Copilot Error", { status: 500, headers: corsHeaders });
      }
    }

    return new Response("BioPro Backend Active", { status: 200, headers: corsHeaders });
  }
};