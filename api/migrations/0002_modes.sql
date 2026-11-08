ALTER TABLE scores ADD COLUMN mode TEXT NOT NULL DEFAULT 'classic';
CREATE INDEX idx_scores_mode_fastest ON scores (mode, time_ms, id);
CREATE INDEX idx_scores_mode_potholes ON scores (mode, potholes DESC, time_ms, id);
