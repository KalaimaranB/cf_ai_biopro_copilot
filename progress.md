# BioPro: Progress So Far

## Overview
BioPro is in active development. The current focus has been on establishing a clean, reliable database foundation using Cloudflare D1 (SQLite) to manage experiment logs and the AI Copilot's active notebook context.

## Tech Stack & Infrastructure
* **Database:** Cloudflare D1 (Remote serverless SQLite).
* **Tooling:** Wrangler CLI for remote database execution and schema management.
* **Planned Auth:** Google Authentication (schema existing, implementation deferred).

## Database State
We have audited the remote D1 database (`biopro-db`) and organized the tables into actionable categories. 

### 1. Active Schema
We executed a clean reset of the core experiment tracking table to ensure a fresh environment for development.
* **`experiments`**: Dropped and recreated. 
    * *Columns:* `experiment_id` (PK), `title`, `author`, `notebook_content`, `created_at`, `last_updated`.
    * *Current State:* Seeded with a single active row (`demo-exp-001`) to validate read/write operations for the Copilot.

### 2. Parked Schema (Auth & Legacy)
The database currently holds several other tables that have been identified and explicitly parked for later phases to maintain focus on the core Copilot functionality.
* **Auth Tables:** `user`, `session`, `account`, `verification`. Kept intact for the future Google Auth integration.
* **Legacy/Future App Tables:** `projects`, `experiment_logs`. Parked until the parent `experiments` architecture is fully wired to the frontend.
* **System Tables:** `_cf_KV` (Cloudflare internal, untouched).