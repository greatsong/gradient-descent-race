CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  teacher_code TEXT NOT NULL,
  status TEXT DEFAULT 'waiting',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT REFERENCES sessions(id),
  name TEXT NOT NULL,
  members TEXT DEFAULT '[]',
  color TEXT DEFAULT '#3b82f6',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS race_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT REFERENCES sessions(id),
  team_id INTEGER REFERENCES teams(id),
  map_level INTEGER NOT NULL,
  mode TEXT DEFAULT 'competitive',
  learning_rate REAL,
  momentum REAL,
  status TEXT,
  finish_time REAL,
  final_loss REAL,
  cumulative_loss REAL,
  rank INTEGER,
  gp_stage INTEGER,
  gp_points INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
