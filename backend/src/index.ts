import { betterAuth } from "better-auth";
import { D1Dialect } from "kysely-d1";
import { handleKnowledgeRoutes } from "./api/knowledge";
import { handleProjectRoutes } from "./api/projects";
export { LabSessionDO } from "./agent";
import { handleTranscribeRoute } from "./api/transcribe";

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
    const origin = request.headers.get("Origin") || "";
    
    // 1. Dynamic Origin Logic
    // 2. Allow Localhost, Pages, OR your specific Workers frontend domain
    const isAllowed = 
      origin.includes("localhost") || 
      origin.includes(".pages.dev") || 
      origin.includes("biopro.workers.dev"); // <-- ADDED THIS

    const allowedOrigin = isAllowed ? origin : "https://cf-ai-biopro-copilot.pages.dev"; 

    const corsHeaders = {
      'Access-Control-Allow-Origin': allowedOrigin,
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
      'Access-Control-Allow-Credentials': 'true',
    };

    // 2. Handle Preflight immediately
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // 3. Helper to wrap ANY response with our CORS headers
    const wrapResponse = (res: Response) => {
      const newHeaders = new Headers(res.headers);
      Object.entries(corsHeaders).forEach(([key, value]) => {
        newHeaders.set(key, value);
      });
      return new Response(res.body, {
        status: res.status,
        statusText: res.statusText,
        headers: newHeaders,
      });
    };

    // 4. Initialize Auth
    const auth = betterAuth({
      database: { dialect: new D1Dialect({ database: env.DB }), type: "sqlite" },
      socialProviders: {
        google: {
          clientId: env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET,
        },
      },
      // 1. HARD-CODE these for now to be 100% sure
      trustedOrigins: [
        "https://cf-ai-biopro-copilot.biopro.workers.dev",
        "https://cf-ai-biopro-copilot.pages.dev",
        "http://localhost:5173"
      ],
      baseURL: "https://backend.biopro.workers.dev",
      secret: env.AUTH_SECRET,
      
      // 2. THIS IS THE KEY: Tell the library we are cross-origin
      advanced: { 
        crossOrigin: true, // <--- ADD THIS
        defaultCookieAttributes: { 
          sameSite: "none", 
          secure: true 
        } 
      },
    });

    const url = new URL(request.url);

    try {
      // ── Auth Routes ──────
      if (url.pathname.startsWith("/api/auth")) {
        const authRes = await auth.handler(request);
        return wrapResponse(authRes);
      }

      // ── Session Gate ──────
      const session = await auth.api.getSession({ headers: request.headers });
      if (!session?.user && (url.pathname.startsWith("/api/") || url.pathname === "/")) {
        // Exempt public status check if needed, otherwise:
        return wrapResponse(new Response("Unauthorized", { status: 401 }));
      }
      const userId = session?.user?.id || "";

      // ── Route Handlers ──────
      let response: Response;

      if (url.pathname.startsWith("/api/knowledge")) {
        response = await handleKnowledgeRoutes(request, url, env, corsHeaders);
      } else if (url.pathname.startsWith("/api/projects") || url.pathname.startsWith("/api/logs")) {
        response = await handleProjectRoutes(request, url, env, corsHeaders, userId);
      } else if (url.pathname === "/api/status") {
        if (request.method === "GET") {
          const expId = url.searchParams.get("experimentId");
          const row = await env.DB.prepare("SELECT status FROM experiments WHERE id = ?").bind(expId).first();
          response = new Response(JSON.stringify({ status: row?.status || 'In Progress' }));
        } else {
          const { experimentId, status } = await request.json() as any;
          await env.DB.prepare("UPDATE experiments SET status = ? WHERE id = ?").bind(status, experimentId).run();
          response = new Response(JSON.stringify({ success: true }));
        }
      } else if (url.pathname === "/api/transcribe") {
        response = await handleTranscribeRoute(request, env, corsHeaders);
      } else if (request.method === "POST" && url.pathname === "/") {
        // SSE Special Case
        const doId = env.LAB_SESSION.idFromName(userId);
        const doStub = env.LAB_SESSION.get(doId);
        const doRes = await doStub.fetch(request);
        
        // We wrap SSE manually to keep the stream alive
        const sseHeaders = new Headers(doRes.headers);
        Object.entries(corsHeaders).forEach(([k, v]) => sseHeaders.set(k, v));
        return new Response(doRes.body, { headers: sseHeaders });
      } else {
        response = new Response("BioPro Backend Active", { status: 200 });
      }

      return wrapResponse(response);

    } catch (err) {
      console.error("Worker Error:", err);
      return wrapResponse(new Response("Internal Server Error", { status: 500 }));
    }
  },
};