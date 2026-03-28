CREATE TABLE IF NOT EXISTS project_documents (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    filename TEXT NOT NULL,
    status TEXT CHECK(status IN ('Processing', 'Ready', 'Failed')) DEFAULT 'Processing',
    pages_processed INTEGER DEFAULT 0, -- CREDIT TRACKING
    uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
);