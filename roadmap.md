# BioPro: Development Roadmap

## Phase 1: Data Access Layer (Current Focus)
**Goal:** Connect the backend logic to the newly minted `experiments` table in Cloudflare D1.
* [ ] **API Route/Worker Setup:** Create the endpoint to query the D1 database.
* [ ] **Fetch Experiment:** Write the SQL query to pull `demo-exp-001`.
* [ ] **Update Experiment:** Write the mutation to allow appending new text to `notebook_content`.

## Phase 2: Frontend Interface
**Goal:** Build the UI to interact with the database.
* [ ] **Experiment Dashboard:** A simple list view to fetch and display all active experiments.
* [ ] **Notebook Workspace:** A text editor or markdown renderer to display `notebook_content`.
* [ ] **State Management:** Ensure the UI updates optimistically when notes are added.

## Phase 3: AI Copilot Integration (The Core Engine)
**Goal:** Wire the AI to read and write to the active experiment notebook.
* [ ] **Context Injection:** Pass the fetched `notebook_content` to the LLM as system context.
* [ ] **Action Execution:** Enable the Copilot to append observations, summarize data, or format complex immunology lab protocols directly into the database.
* [ ] **Bioinformatics Tooling:** Bridge the Copilot to external scripts (e.g., triggering automation tools like Protein Analyzer) and logging the outputs back into the `experiments` table.

## Phase 4: Authentication & Security
**Goal:** Secure the application using the parked schema.
* [ ] **Google Auth Integration:** Wire up the OAuth flow.
* [ ] **Schema Mapping:** Connect the Google user data to the existing `user`, `session`, and `account` tables.
* [ ] **Row-Level Security:** Ensure users can only query and edit `experiments` where they are the assigned `author`.