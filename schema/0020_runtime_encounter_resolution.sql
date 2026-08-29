-- Runtime Encounter resolution audit — additive Alpha migration.
-- Do not rewrite reusable Encounter Definition status from Runtime play.

CREATE TABLE IF NOT EXISTS runtime_encounter_resolution_log (
  id TEXT PRIMARY KEY,
  scene_run_id TEXT NOT NULL,
  encounter_id TEXT NOT NULL,
  from_status TEXT NOT NULL CHECK (from_status IN ('planned', 'active', 'resolved', 'skipped')),
  to_status TEXT NOT NULL CHECK (to_status = 'resolved'),
  resolution_source TEXT NOT NULL CHECK (resolution_source IN ('combat_hostiles_cleared', 'gm_manual')),
  combat_id TEXT,
  resolved_by_user_id TEXT,
  detail_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  FOREIGN KEY (scene_run_id, encounter_id) REFERENCES runtime_encounter_states(scene_run_id, encounter_id) ON DELETE CASCADE,
  FOREIGN KEY (combat_id) REFERENCES combats(id) ON DELETE SET NULL,
  FOREIGN KEY (resolved_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_runtime_encounter_resolution_scene
  ON runtime_encounter_resolution_log(scene_run_id, encounter_id, created_at);
CREATE INDEX IF NOT EXISTS idx_runtime_encounter_resolution_combat
  ON runtime_encounter_resolution_log(combat_id, created_at);
