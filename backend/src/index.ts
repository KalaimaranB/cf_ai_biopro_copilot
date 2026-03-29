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

const TRUSTED_ORIGINS = [
  "http://localhost:5173",
  "https://frontend.biopro.workers.dev",
  "https://biopro-app.pages.dev",
];

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("Origin") || "http://localhost:5173";

    const corsHeaders: Record<string, string> = {
      "Access-Control-Allow-Origin": TRUSTED_ORIGINS.includes(origin)
        ? origin
        : TRUSTED_ORIGINS[0],
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Credentials": "true",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const auth = betterAuth({
      database: { dialect: new D1Dialect({ database: env.DB }), type: "sqlite" },
      socialProviders: {
        google: {
          clientId: env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET,
        },
      },
      trustedOrigins: TRUSTED_ORIGINS,
      baseURL: "https://backend.biopro.workers.dev",
      secret: env.AUTH_SECRET,
      advanced: { defaultCookieAttributes: { sameSite: "none", secure: true } },
    });

    const url = new URL(request.url);

    // ── Auth ──────────────────────────────────────────────────────────────────
    if (url.pathname.startsWith("/api/auth")) {
      try {
        const authResponse = await auth.handler(request);
        const headers = new Headers(authResponse.headers);
        headers.set("Access-Control-Allow-Origin", corsHeaders["Access-Control-Allow-Origin"]);
        headers.set("Access-Control-Allow-Credentials", "true");
        return new Response(authResponse.body, {
          status: authResponse.status,
          headers,
        });
      } catch (e: any) {
        return new Response(`Auth error: ${e.message}`, {
          status: 500,
          headers: corsHeaders,
        });
      }
    }

    // ── Session gate for all /api/ and root POST ──────────────────────────────
    let userId = "";
    if (url.pathname.startsWith("/api/") || url.pathname === "/") {
      const session = await auth.api.getSession({ headers: request.headers });
      if (!session?.user) {
        return new Response("Unauthorized", { status: 401, headers: corsHeaders });
      }
      userId = session.user.id;
    }

    // ── Knowledge base ────────────────────────────────────────────────────────
    if (url.pathname.startsWith("/api/knowledge")) {
      return handleKnowledgeRoutes(request, url, env, corsHeaders);
    }

    // ── Projects / Experiments / Logs ─────────────────────────────────────────
    if (
      url.pathname.startsWith("/api/projects") ||
      url.pathname.startsWith("/api/experiments") ||
      url.pathname.startsWith("/api/logs")
    ) {
      return handleProjectRoutes(request, url, env, corsHeaders, userId);
    }
    
    if (url.pathname === "/api/transcribe" && request.method === "POST") {
      return handleTranscribeRoute(request, env, corsHeaders);
    }

    // ── Agentic Copilot (SSE stream) ──────────────────────────────────────────
    if (request.method === "POST" && url.pathname === "/") {
      try {
        // Each user gets their own persistent DO instance (chat history lives here)
        const doId = env.LAB_SESSION.idFromName(userId);
        const doStub = env.LAB_SESSION.get(doId);

        // Forward the request as-is to the DO
        const doResponse = await doStub.fetch(request);

        // Pipe the SSE stream back, injecting CORS headers
        const headers = new Headers({
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
          ...corsHeaders,
        });

        return new Response(doResponse.body, {
          status: doResponse.status,
          headers,
        });
      } catch (err: any) {
        console.error("DO fetch error:", err);
        return new Response(
          `data: ${JSON.stringify({ type: "error", data: { message: "Copilot unavailable." } })}\n\n`,
          {
            status: 500,
            headers: { "Content-Type": "text/event-stream", ...corsHeaders },
          }
        );
      }
    }

    return new Response("BioPro Backend Active", { status: 200, headers: corsHeaders });
  },
};