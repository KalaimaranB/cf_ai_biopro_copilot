# 🧬 BioPro Voice Copilot (Cloudflare AI Assignment)

An AI-powered, voice-activated laboratory assistant built for the [BioPro ecosystem](https://github.com/kalaimaran-balasothy/biopro). 

Researchers performing wet-lab protocols or analyzing gels using BioPro often have their hands full. This Copilot allows them to verbally query software documentation, ask for biological protocol guidance, and dictate lab notebook entries completely hands-free.

## 🚀 Live Demo
**Frontend:** [https://frontend.biopro.workers.dev](https://frontend.biopro.workers.dev)
*(Note: Please use Google Chrome or Microsoft Edge for Web Speech API compatibility)*

## 🛠️ Architecture & Requirements Fulfilled

* **User Input (Voice):** React frontend hosted on **Cloudflare Pages**. Utilizes the native browser `SpeechRecognition` API with a continuous keep-alive loop to stream transcribed voice commands.
* **LLM:** **Cloudflare Workers AI** running `Llama 3.3 70B Instruct`. The model is injected with a highly specific System Prompt containing the architectural knowledge of the BioPro Python codebase.
* **Workflow / Routing:** A **Cloudflare Worker** acts as the central API gateway, handling CORS and routing incoming voice transcripts to the correct state room.
* **Memory / State:** **Cloudflare Durable Objects** (SQLite-backed) maintain the context of the conversation. Each user session gets a dedicated Durable Object that stores the chat history, appending it to the AI payload so Llama 3.3 remembers the ongoing lab protocol.

## 💻 Running Locally

### Prerequisites
* Node.js & npm
* Wrangler CLI (`npm install -g wrangler`)

### Backend Setup
1. `cd backend`
2. `npm install`
3. `npm run dev` (Runs the Worker and Durable Object locally on port 8787)

### Frontend Setup
1. `cd frontend`
2. `npm install`
3. Update the `fetch` URL in `App.tsx` to `http://localhost:8787` if testing locally.
4. `npm run dev` (Runs the React app on port 5173)