PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS story_script_sources (
  story_event_id TEXT PRIMARY KEY,
  source_text TEXT NOT NULL,
  updated_by_user_id TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (story_event_id) REFERENCES story_events(id) ON DELETE CASCADE,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_story_script_sources_updated
  ON story_script_sources(updated_at, story_event_id);
