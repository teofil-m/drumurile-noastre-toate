CREATE TABLE scores (id INTEGER PRIMARY KEY AUTOINCREMENT, nickname TEXT NOT NULL, time_ms INTEGER NOT NULL, potholes INTEGER NOT NULL, client_version TEXT NOT NULL, ip_hash TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
CREATE INDEX idx_scores_fastest ON scores (time_ms, id);
CREATE INDEX idx_scores_potholes ON scores (potholes DESC, time_ms, id);
CREATE TABLE rate_limits (ip_hash TEXT NOT NULL, window_start INTEGER NOT NULL, count INTEGER NOT NULL, PRIMARY KEY (ip_hash, window_start));
