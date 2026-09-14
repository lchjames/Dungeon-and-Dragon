-- Ability MP Cost Authority — Alpha
-- Approved fixed MP cost is Definition-adjacent authority. Rank 1-9 reference costs are not backfilled as actual costs.

CREATE TABLE IF NOT EXISTS ability_resource_profiles (
  ability_definition_id TEXT PRIMARY KEY,
  mp_cost INTEGER NOT NULL,
  approved_by_user_id TEXT,
  approved_at INTEGER NOT NULL,
  updated_by_user_id TEXT,
  updated_at INTEGER NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  CHECK (mp_cost >= 1),
  FOREIGN KEY (ability_definition_id) REFERENCES ability_definitions(id) ON DELETE CASCADE,
  FOREIGN KEY (approved_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_ability_resource_profiles_cost
ON ability_resource_profiles(mp_cost, ability_definition_id);

-- Existing classified Ability Definitions intentionally remain without a row until a GM approves an actual MP cost.
-- The canonical Rank reference table is advisory authoring data, not a destructive backfill rule.
