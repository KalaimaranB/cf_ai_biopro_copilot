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

import { DurableObject } from "cloudflare:workers";
import { betterAuth } from "better-auth";
import { D1Dialect } from "kysely-d1";
import { getMigrations } from "better-auth/db/migration";

export interface Env {
  AI: any; 
  LAB_SESSION: DurableObjectNamespace;
  VECTOR_INDEX: VectorizeIndex;
  DB: D1Database;
  AUTH_SECRET: string;
  GOOGLE_CLIENT_ID: string;     
  GOOGLE_CLIENT_SECRET: string;
}
// ------------------------------------------------------------------
// 1. THE DURABLE OBJECT (Memory & RAG Logic)
// ------------------------------------------------------------------
export class LabSessionDO extends DurableObject {
  async fetch(request: Request) {
    // We now accept a "mode" from the frontend
    const { userMessage, mode } = await request.json() as { userMessage: string, mode: string };

    let history: { role: string, content: string }[] = await this.ctx.storage.get("chat_history") || [];
    let systemPrompt = `You are the BioPro Voice Copilot. Keep answers concise, technical, and helpful.`;
    let contextChunk = "";

    // If we are in Documentation mode, execute the RAG pipeline!
    if (mode === "documentation") {
      try {
        // 1. Convert the user's question into a mathematical vector
        const queryVector = await this.env.AI.run('@cf/baai/bge-large-en-v1.5', { text: [userMessage] });
        
        // 2. Search the database for the closest matching documentation
        const searchResults = await this.env.VECTOR_INDEX.query(queryVector.data[0], { 
          topK: 2, 
          returnMetadata: 'all' 
        });

        // 3. Extract the actual text from the database results
        if (searchResults.matches && searchResults.matches.length > 0) {
          contextChunk = searchResults.matches.map(match => match.metadata?.text).join("\n\n");
          
          // 4. Upgrade the system prompt with the actual BioPro code/docs
          systemPrompt = `You are the BioPro Voice Copilot. Answer the user's question using ONLY the following documentation from the BioPro GitHub repository. If the answer is not in the documentation, say so.
          
          --- REPOSITORY DOCUMENTATION ---
          ${contextChunk}
          --------------------------------`;
        }
      } catch (error) {
        console.error("Vector Search Failed:", error);
      }
    }

    history.push({ role: "user", content: userMessage });

    const messagesForAI = [
      { role: "system", content: systemPrompt },
      ...history
    ];

    const aiResponse = await this.env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
      messages: messagesForAI
    });

    const aiText = aiResponse.response;
    history.push({ role: "assistant", content: aiText });
    await this.ctx.storage.put("chat_history", history);

    return new Response(JSON.stringify({ response: aiText, modeUsed: mode }), {
      headers: { 'content-type': 'application/json' }
    });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("Origin") || "http://localhost:5173";
    
    // 1. Unified CORS Headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': origin, 
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Credentials': 'true'
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // 2. Initialize Auth
    const auth = betterAuth({
      database: { dialect: new D1Dialect({ database: env.DB }), type: "sqlite" },
      
      // THE UPGRADE: Enterprise Google OAuth
      socialProviders: {
         google: { 
            clientId: env.GOOGLE_CLIENT_ID, 
            clientSecret: env.GOOGLE_CLIENT_SECRET 
         }
      },

      trustedOrigins: ["http://localhost:5173", "https://frontend.biopro.workers.dev"],
      baseURL: "https://backend.biopro.workers.dev", 
      secret: env.AUTH_SECRET,
      advanced: {
        defaultCookieAttributes: {
          sameSite: "none",
          secure: true
        }
      }
    });

    const url = new URL(request.url);

    // 3. Auth Routes (With safety wrapper)
    if (url.pathname.startsWith("/api/auth")) {
      try {
        const authResponse = await auth.handler(request);
        
        // Forcefully inject our CORS headers onto the better-auth response
        const newHeaders = new Headers(authResponse.headers);
        newHeaders.set("Access-Control-Allow-Origin", origin);
        newHeaders.set("Access-Control-Allow-Credentials", "true");
        
        return new Response(authResponse.body, {
          status: authResponse.status,
          statusText: authResponse.statusText,
          headers: newHeaders
        });
      } catch (e: any) {
        console.error("Auth Error:", e.message); // This will show up in wrangler tail!
        return new Response(`Auth crash: ${e.message}`, { status: 500, headers: corsHeaders });
      }
    }

    // 4. API Routes
    if (url.pathname === "/api/notebook") {
      // SECURITY: Extract the user session from the incoming request cookies
      const sessionData = await auth.api.getSession({ headers: request.headers });
      
      if (!sessionData || !sessionData.user) {
        return new Response("Unauthorized", { status: 401, headers: corsHeaders });
      }

      const userId = sessionData.user.id; // The unique Google Identity

      if (request.method === "GET") {
        const { results } = await env.DB.prepare("SELECT notebook_content FROM experiments WHERE experiment_id = ?").bind(userId).all();
        const content = results.length > 0 ? results[0].notebook_content : "";
        return new Response(JSON.stringify({ content }), { headers: { 'content-type': 'application/json', ...corsHeaders } });
      }

      if (request.method === "POST") {
        const { content } = await request.json() as { content: string };
        
        // Safely UPSERT (Update if exists, Insert if new user)
        const { results } = await env.DB.prepare("SELECT experiment_id FROM experiments WHERE experiment_id = ?").bind(userId).all();
        
        if (results.length > 0) {
           await env.DB.prepare("UPDATE experiments SET notebook_content = ?, last_updated = CURRENT_TIMESTAMP WHERE experiment_id = ?").bind(content, userId).run();
        } else {
           await env.DB.prepare("INSERT INTO experiments (experiment_id, notebook_content) VALUES (?, ?)").bind(userId, content).run();
        }
        
        return new Response(JSON.stringify({ status: "saved" }), { headers: { 'content-type': 'application/json', ...corsHeaders } });
      }
    }

    // ==========================================
    // 5. AI COPILOT ROUTE: Isolated Memory
    // ==========================================
    if (request.method === "POST" && url.pathname === "/") {
      try {
        // SECURITY: Verify session before talking to the AI
        const sessionData = await auth.api.getSession({ headers: request.headers });
        if (!sessionData || !sessionData.user) {
          return new Response("Unauthorized Access to BioPro Copilot", { status: 401, headers: corsHeaders });
        }
        
        const userId = sessionData.user.id;
        
        // THE MAGIC: The Durable Object memory is now unique to the logged-in user!
        const id = env.LAB_SESSION.idFromName(userId); 
        const doResponse = await env.LAB_SESSION.get(id).fetch(request);
        
        const data = await doResponse.json();
        return new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json', ...corsHeaders } });
      } catch (error) {
        return new Response("Error processing request", { status: 500, headers: corsHeaders });
      }
    }

    return new Response("BioPro Backend Active", { status: 200, headers: corsHeaders });
  }
};