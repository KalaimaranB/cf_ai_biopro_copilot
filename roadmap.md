# BioPro Phase 3: Multimodal Knowledge Base & Parallel Ingestion

## The Core Challenges
1. **The Figure Problem:** Standard PDF parsers strip out images. We need an AI that can "see" the paper to read Western blots, graphs, and their respective captions.
2. **The Time Limit:** Cloudflare Workers handling HTTP requests die after 10–30 seconds. A heavy PDF takes longer than that to parse, chunk, and embed.

## The Solution Architecture
We will introduce three new Cloudflare primitives to your stack:
* **Cloudflare R2 (Object Storage):** To store the actual physical PDF files.
* **Cloudflare Queues:** A message broker that allows us to spin up background Workers that have a massive **15-minute** execution limit instead of 10 seconds.
* **Workers AI Vision:** Using `@cf/meta/llama-3.2-11b-vision-instruct` to physically "look" at the PDF pages and extract the figures/captions.

---

## 🌊 The Parallel Data Flow (Step-by-Step)

### Phase 1: The Instant Upload (Frontend -> R2 -> D1)
When you drag and drop a paper into the UI, we don't process it immediately. We just safely store it.
1. The React frontend sends the PDF file to an `/api/documents/upload` route.
2. The Worker saves the physical PDF file into a **Cloudflare R2 Bucket** (e.g., `biopro-pdfs`).
3. The Worker inserts a row into the D1 `project_documents` table with `status: "Processing"`.
4. The Worker pushes a tiny message to a **Cloudflare Queue** containing `{ document_id: "123", r2_key: "paper.pdf" }`.
5. The Worker immediately returns a `200 OK` to the frontend. The UI shows a spinning "Processing..." indicator. (Total time: < 1 second).

### Phase 2: The Background Heavy Lifter (Queue Consumer)
Behind the scenes, the Queue triggers a *second* Worker function (a Consumer). This Worker runs asynchronously, meaning it has up to 15 minutes of compute time to do the heavy lifting.
1. The Consumer Worker reads the message and downloads the PDF from the R2 bucket.
2. **Multimodal Extraction:** It uses a lightweight PDF-to-image library to convert the PDF pages into images. 
3. It passes these images to the Cloudflare Vision AI model (`llama-3.2-11b-vision-instruct`) with the prompt: *"Extract all text from this page. Pay special attention to figures, graphs, and Western blots. Write out their captions and summarize the visual data."*
4. We now have a rich, text-based representation of the *entire* paper, including the visual science.

### Phase 3: Chunking & Vectorization
1. The Consumer Worker takes that rich text and splits it into 500-word chunks (with a 50-word overlap so context isn't lost).
2. It sends those chunks to the embedding model (`@cf/baai/bge-large-en-v1.5`) to turn them into math.
3. It inserts the vectors into **Vectorize**, attaching strict metadata: `{ project_id: "proj-abc", document_id: "doc-123" }`.
4. It updates the D1 database row to `status: "Ready"`. Your UI updates, and the Agent can now read the paper.

---

## 🗄️ Database & Infrastructure Upgrades

### 1. D1 Relational Schema Upgrade
We need a new table to track the files, tie them to projects, and handle the asynchronous "Processing/Ready" states.

\`\`\`sql
CREATE TABLE project_documents (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    filename TEXT NOT NULL,
    r2_key TEXT NOT NULL,
    status TEXT CHECK(status IN ('Processing', 'Ready', 'Failed')) DEFAULT 'Processing',
    uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
\`\`\`

### 2. Infrastructure (`wrangler.toml` Additions)
To make this work, we will bind the new services to your existing Worker. You will run a few terminal commands to create them, and then add this to your config:

\`\`\`toml
# Bind the R2 Bucket for PDF storage
[[r2_buckets]]
binding = "PDF_BUCKET"
bucket_name = "biopro-pdfs"

# Bind the Queue Producer (to send tasks)
[[queues.producers]]
binding = "DOCUMENT_QUEUE"
queue = "biopro-doc-processor"

# Bind the Queue Consumer (the background parallel worker)
[[queues.consumers]]
queue = "biopro-doc-processor"
max_batch_size = 1 # Process one heavy PDF at a time
max_retries = 2
max_wait_time_ms = 5000
\`\`\`

---

## 🗑️ Clean Deletion Architecture
When you are done with a paper and click "Delete" in the UI:
1. The backend deletes the PDF file from the **R2 Bucket**.
2. It deletes the record from the **D1 `project_documents` table**.
3. It queries **Vectorize** for all vectors where `metadata.document_id == target_id` and deletes them.
This guarantees no orphaned data and keeps your retrieval incredibly fast and highly isolated to your specific experiments.