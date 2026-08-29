let encounterSchemaPromise = null;

const ENCOUNTER_STATUSES = new Set(['planned', 'active', 'resolved', 'skipped']);

export async function ensureRuntimeEncounterSchema(env) {
  if (!env?.DB) throw new Error('D1 binding DB is unavailable.');
  if (!encounterSchemaPromise) {
    encounterSchemaPromise = env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS runtime_encounter_states (
        id TEXT PRIMARY KEY,
        scene_run_id TEXT NOT NULL,
        encounter_id TEXT NOT NULL,
        definition_status_snapshot TEXT NOT NULL CHECK (definition_status_snapshot IN ('planned', 'active', 'resolved', 'skipped')),
        status TEXT NOT NULL CHECK (status IN ('planned', 'active', 'resolved', 'skipped')),
        activated_by_story_event_id TEXT,
        activated_by_user_id TEXT,
        activated_at INTEGER,
        resolved_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE (scene_run_id, encounter_id),
        FOREIGN KEY (scene_run_id) REFERENCES scene_runs(id) ON DELETE CASCADE,
        FOREIGN KEY (encounter_id) REFERENCES encounters(id) ON DELETE RESTRICT,
        FOREIGN KEY (activated_by_story_event_id) REFERENCES story_events(id) ON DELETE SET NULL,
        FOREIGN KEY (activated_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
      )`),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_runtime_encounter_scene_status ON runtime_encounter_states(scene_run_id, status, updated_at)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_runtime_encounter_definition ON runtime_encounter_states(encounter_id, updated_at)')
    ]).catch(error => {
      encounterSchemaPromise = null;
      throw error;
    });
  }
  await encounterSchemaPromise;
}

export async function ensureRuntimeEncounterRows(env, sceneRunId, sceneId) {
  await ensureRuntimeEncounterSchema(env);
  const now = Date.now();
  await env.DB.prepare(`
    INSERT OR IGNORE INTO runtime_encounter_states (
      id, scene_run_id, encounter_id, definition_status_snapshot, status,
      created_at, updated_at
    )
    SELECT 'runtime_encounter_' || lower(hex(randomblob(16))), ?, e.id, e.status, e.status, ?, ?
    FROM encounters e
    WHERE e.scene_id = ?
  `).bind(sceneRunId, now, now, sceneId).run();
}

export async function loadRuntimeEncounterRows(env, sceneRunId, sceneId) {
  await ensureRuntimeEncounterRows(env, sceneRunId, sceneId);
  const rows = await env.DB.prepare(`
    SELECT res.*, e.name, e.scene_id
    FROM runtime_encounter_states res
    JOIN encounters e ON e.id = res.encounter_id
    WHERE res.scene_run_id = ? AND e.scene_id = ?
    ORDER BY e.sort_order, e.created_at, e.id
  `).bind(sceneRunId, sceneId).all();
  return (rows.results || []).map(row => ({
    id: row.id,
    encounterId: row.encounter_id,
    name: row.name,
    sceneId: row.scene_id,
    definitionStatusSnapshot: row.definition_status_snapshot,
    status: row.status,
    activatedByStoryEventId: row.activated_by_story_event_id || null,
    activatedByUserId: row.activated_by_user_id || null,
    activatedAt: row.activated_at,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

export async function loadRuntimeEncounterMap(env, sceneRunId, sceneId) {
  const rows = await loadRuntimeEncounterRows(env, sceneRunId, sceneId);
  return new Map(rows.map(row => [row.encounterId, row]));
}

export async function activateRuntimeEncounter(env, {
  sceneRunId,
  sceneId,
  encounterId,
  actorUserId,
  storyEventId = null
}) {
  const map = await loadRuntimeEncounterMap(env, sceneRunId, sceneId);
  const current = map.get(encounterId);
  if (!current) {
    throw Object.assign(new Error(`Encounter does not belong to this Scene Run: ${encounterId}`), {
      status: 409,
      code: 'STORY_EFFECT_ENCOUNTER_NOT_FOUND'
    });
  }
  if (current.status === 'active') return { ...current, unchanged: true };
  if (current.status !== 'planned') {
    throw Object.assign(new Error(`Encounter cannot be activated from runtime status ${current.status}.`), {
      status: 409,
      code: 'STORY_EFFECT_ENCOUNTER_CLOSED'
    });
  }
  const now = Date.now();
  const result = await env.DB.prepare(`
    UPDATE runtime_encounter_states
    SET status = 'active', activated_by_story_event_id = ?, activated_by_user_id = ?,
        activated_at = COALESCE(activated_at, ?), updated_at = ?
    WHERE scene_run_id = ? AND encounter_id = ? AND status = 'planned'
  `).bind(storyEventId, actorUserId, now, now, sceneRunId, encounterId).run();
  if (Number(result?.meta?.changes || 0) !== 1) {
    throw Object.assign(new Error('Runtime Encounter changed before activation.'), {
      status: 409,
      code: 'STORY_EFFECT_ENCOUNTER_CHANGED'
    });
  }
  const refreshed = await loadRuntimeEncounterMap(env, sceneRunId, sceneId);
  return { ...refreshed.get(encounterId), unchanged: false };
}

export function normalizeRuntimeEncounterStatus(value) {
  const status = String(value || '').trim().toLowerCase();
  if (!ENCOUNTER_STATUSES.has(status)) throw new Error('Runtime Encounter status is invalid.');
  return status;
}
