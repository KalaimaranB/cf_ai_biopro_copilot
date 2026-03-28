DROP TABLE IF EXISTS experiments;
-- LEVEL 1: Projects
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- LEVEL 2: Experiments
CREATE TABLE IF NOT EXISTS experiments (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    status TEXT DEFAULT 'in_progress', 
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- LEVEL 3: Logs (The Notebook Entries)
CREATE TABLE IF NOT EXISTS experiment_logs (
    id TEXT PRIMARY KEY,
    experiment_id TEXT NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    source TEXT NOT NULL, -- 'researcher' or 'copilot'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);