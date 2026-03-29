# 🧬 BioPro Copilot: Autonomous Biomedical Research Engine

BioPro Copilot is a voice-first, agentic research assistant built for biomedical scientists. It bridges the gap between private laboratory data and the global scientific consensus by fusing internal Standard Operating Procedures (SOPs) with live external literature (PubMed) into a single, hallucination-free reasoning stream.

Unlike standard chatbots, BioPro operates on a **"Parallel Fusion" RAG Architecture**. It listens to acoustic queries, deduces intent, concurrently searches multiple databases, aggressively filters irrelevant chunks using a semantic judge, and streams back sentence-level citations welded to an immutable laboratory notebook.

---

## 🏆 Cloudflare AI Assignment Requirements Mapping

This application was purpose-built entirely on the Cloudflare Developer Platform to fulfill the AI-powered application assignment requirements:

1. **LLM (Workers AI)** 🧠
   * **Main Synthesis Engine:** Uses `@cf/meta/llama-3.3-70b-instruct-fp8-fast` for complex biomedical reasoning and strict citation formatting.
   * **Utility Engines:** Uses the ultra-fast `@cf/meta/llama-3-8b-instruct` for instantaneous Intent Routing, Query Refinement, and acting as a "Semantic Judge" to filter RAG context.
2. **Workflow / Coordination** ⚙️
   * **Durable Objects:** The entire agentic pipeline is orchestrated by the `LabSessionDO` Durable Object. It manages the multi-step retrieval lifecycle, coordinates concurrent API calls (Vectorize & PubMed), and maintains the Server-Sent Events (SSE) streaming connection to the client.
3. **User Input via Chat or Voice** 🎙️
   * **Voice-First Input:** Utilizes `@cf/openai/whisper` on Workers AI to transcribe researcher audio in real-time, allowing hands-free operation at the lab bench. 
   * **React Frontend:** A custom Vite/React dashboard featuring an interactive "Thought Trail," real-time streaming Markdown, and clickable inline citations `[1]`.
4. **Memory or State** 💾
   * **Short-term Memory:** Durable Object Storage (`this.ctx.storage`) maintains the rolling chat history for conversational context.
   * **Long-term Semantic Memory:** Cloudflare **Vectorize** stores embedded document chunks (using `@cf/baai/bge-large-en-v1.5`).
   * **Relational State:** Cloudflare **D1** (SQLite) acts as the source of truth for the Immutable Log Stream (Notebook) and document metadata mapping.

---

## ✨ Key Features

* **Parallel Fusion RAG:** Instead of routing to *either* an internal database or the web, BioPro searches both Vectorize and PubMed concurrently, merging the context into a unified knowledge block.
* **Zero-Hallucination Citations:** The LLM is strictly constrained via prompt engineering to use mechanical tags (e.g., `[int_0]`). The backend dynamically maps these tags to authentic metadata, guaranteeing that every `[1]` badge in the UI points to a real, verifiable document chunk.
* **The "Ruthless Judge" Re-Ranker:** To prevent context poisoning, an 8B model grades the relevance of every retrieved text chunk *before* the 70B model sees it, purging off-topic data.
* **Typo-Resilient Intent Routing:** Voice-to-text can be messy (e.g., translating "heart pump" to "hard pump"). The pipeline intercepts the raw transcript, deduces the intent (`FOUNDATIONAL` vs `SPECIFIC`), and rewrites it into an optimized boolean query before searching.
* **Immutable Log Stream (Notebook Mode):** Responses, complete with their compiled bibliographies, are permanently etched into a D1-backed digital lab notebook for record-keeping.
* **Glass-Box Streaming:** The UI features a real-time "Thought Trail," exposing the Agent's internal actions (query refining, chunk filtering, database querying) to the user over a custom SSE pipeline.

---

## 🏗️ Architecture Deep Dive: The Pipeline

When a user speaks into the microphone, the following autonomous pipeline executes within the Cloudflare Durable Object:

1. **Acoustic Ingestion:** The React frontend streams audio to the Whisper model. The resulting text is sent to the backend.
2. **Intent Classification & Refinement (Llama 3 8B):** The raw text is classified as either a `FOUNDATIONAL` inquiry or a `SPECIFIC` data request. The AI rewrites the prompt into optimized search keywords (correcting phonetic typos).
3. **Parallel Retrieval:**
   * *Internal:* The query is embedded via `bge-large-en-v1.5` and queried against Cloudflare **Vectorize**.
   * *External:* The query is routed to the NIH **PubMed E-utils API** (appending strict filters if the intent is foundational).
4. **Semantic Re-Ranking (The Judge):** Llama 3 8B evaluates the retrieved chunks from both sources, dropping any that do not factually address the prompt.
5. **Synthesis (Llama 3.3 70B):** The verified chunks are fused into a `<context>` block. The 70B model synthesizes a comprehensive response, aggressively appending structural `[chunk_id]` tags to every sentence.
6. **Mechanical Citation Parsing:** The DO parses the raw text stream, stripping out hallucinated tags, converting valid tags into numerical indices, and securely binding them to their respective D1/PubMed URLs.
7. **SSE Delivery:** The final text is streamed word-by-word via Server-Sent Events to the React frontend, where custom Markdown components render interactive citation bubbles and a slide-out source drawer.

---

## 🛠️ Technology Stack

* **Compute:** Cloudflare Workers, Durable Objects
* **AI Models:** `@cf/meta/llama-3.3-70b-instruct-fp8-fast`, `@cf/meta/llama-3-8b-instruct`, `@cf/openai/whisper`, `@cf/baai/bge-large-en-v1.5`
* **Databases:** Cloudflare D1 (Relational), Cloudflare Vectorize (Vector)
* **Document Parsing:** LlamaParse API (Vision/Multimodal extraction)
* **Frontend:** React (Vite), TypeScript, React-Markdown, Web Audio API
