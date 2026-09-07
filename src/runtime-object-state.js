const STATE_KEY = /^[a-z0-9][a-z0-9._-]{0,79}$/;
let schemaPromise = null;

function stateKey(value) {
  const key = String(value ?? '').trim().toLowerCase();
  if (!STATE_KEY.test(key)) {
    throw Object.assign(new Error('Runtime Object stateKey is invalid.'), {
      code: 'STORY_OBJECT_STATE_INVALID'
    });
  }
  return key;
}

const STATE_LOG_SQL = `CREATE TABLE IF NOT EXISTS runtime_object_state_log (
  id TEXT PRIMARY KEY,
  scene_run_id TEXT NOT NULL,
  map_instance_id TEXT NOT NULL,
  runtime_object_id TEXT NOT NULL,
  source_object_id TEXT NOT NULL,
  from_state_key TEXT NOT NULL,
  to_state_key TEXT NOT NULL,
  change_reason TEXT NOT NULL CHECK (change_reason IN ('interaction', 'gm_override', 'story_effect')),
  changed_by_user_id TEXT NOT NULL,
  interaction_id TEXT,
  story_event_id TEXT,
  story_effect_index INTEGER,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (scene_run_id) REFERENCES scene_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (map_instance_id) REFERENCES runtime_map_instances(id) ON DELETE CASCADE,
  FOREIGN KEY (runtime_object_id) REFERENCES runtime_map_objects(id) ON DELETE CASCADE,
  FOREIGN KEY (changed_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (interaction_id) REFERENCES runtime_object_interaction_log(id) ON DELETE SET NULL,
  FOREIGN KEY (story_event_id) REFERENCES story_events(id) ON DELETE SET NULL
)`;

const INTERACTION_STATE_TRIGGER_SQL = `CREATE TRIGGER IF NOT EXISTS trg_runtime_object_interaction_state_log
AFTER INSERT ON runtime_object_interaction_log
WHEN NEW.from_state_key IS NOT NEW.to_state_key
BEGIN
  INSERT INTO runtime_object_state_log (
    id, scene_run_id, map_instance_id, runtime_object_id, source_object_id,
    from_state_key, to_state_key, change_reason, changed_by_user_id,
    interaction_id, story_event_id, story_effect_index, created_at
  ) VALUES (
    'runtime_object_state_' || lower(hex(randomblob(16))),
    NEW.scene_run_id,
    NEW.map_instance_id,
    NEW.runtime_object_id,
    NEW.source_object_id,
    NEW.from_state_key,
    NEW.to_state_key,
    'interaction',
    NEW.actor_user_id,
    NEW.id,
    NULL,
    NULL,
    NEW.created_at
  );
END`;

async function tableSql(env, tableName) {
  return env.DB.prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`)
    .bind(tableName).first();
}

async function tableColumns(env, tableName) {
  const rows = await env.DB.prepare(`PRAGMA table_info(${tableName})`).all();
  return new Set((rows.results || []).map(row => String(row.name || '')));
}

async function createCurrentSchema(env) {
  await env.DB.batch([
    env.DB.prepare(STATE_LOG_SQL),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_runtime_object_state_object ON runtime_object_state_log(runtime_object_id, created_at)'),
    env.DB.prepare(INTERACTION_STATE_TRIGGER_SQL)
  ]);
}

async function upgradeLegacySchema(env) {
  const legacy = await tableSql(env, 'runtime_object_state_log_legacy_0028');
  if (legacy) {
    throw Object.assign(new Error('Runtime Object state-log schema upgrade has an unresolved legacy table.'), {
      code: 'RUNTIME_OBJECT_STATE_SCHEMA_UPGRADE_BLOCKED'
    });
  }

  await env.DB.batch([
    env.DB.prepare('DROP TRIGGER IF EXISTS trg_runtime_object_interaction_state_log'),
    env.DB.prepare('DROP INDEX IF EXISTS idx_runtime_object_state_object'),
    env.DB.prepare('ALTER TABLE runtime_object_state_log RENAME TO runtime_object_state_log_legacy_0028'),
    env.DB.prepare(STATE_LOG_SQL),
    env.DB.prepare(`INSERT INTO runtime_object_state_log (
      id, scene_run_id, map_instance_id, runtime_object_id, source_object_id,
      from_state_key, to_state_key, change_reason, changed_by_user_id,
      interaction_id, story_event_id, story_effect_index, created_at
    )
    SELECT
      id, scene_run_id, map_instance_id, runtime_object_id, source_object_id,
      from_state_key, to_state_key, change_reason, changed_by_user_id,
      interaction_id, NULL, NULL, created_at
    FROM runtime_object_state_log_legacy_0028`),
    env.DB.prepare('DROP TABLE runtime_object_state_log_legacy_0028'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_runtime_object_state_object ON runtime_object_state_log(runtime_object_id, created_at)'),
    env.DB.prepare(INTERACTION_STATE_TRIGGER_SQL)
  ]);
}

export async function ensureRuntimeObjectStateAuthoritySchema(env) {
  if (!env?.DB) throw new Error('D1 binding DB is unavailable.');
  if (!schemaPromise) {
    schemaPromise = (async () => {
      const current = await tableSql(env, 'runtime_object_state_log');
      if (!current?.sql) {
        await createCurrentSchema(env);
        return;
      }
      const columns = await tableColumns(env, 'runtime_object_state_log');
      const sql = String(current.sql || '').toLowerCase();
      const currentShape = columns.has('story_event_id')
        && columns.has('story_effect_index')
        && sql.includes('story_effect');
      if (currentShape) {
        await env.DB.batch([
          env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_runtime_object_state_object ON runtime_object_state_log(runtime_object_id, created_at)'),
          env.DB.prepare(INTERACTION_STATE_TRIGGER_SQL)
        ]);
        return;
      }
      await upgradeLegacySchema(env);
    })().catch(error => {
      schemaPromise = null;
      throw error;
    });
  }
  await schemaPromise;
}

export async function loadRuntimeObjectTargets(env, mapInstanceId) {
  await ensureRuntimeObjectStateAuthoritySchema(env);
  const rows = await env.DB.prepare(`
    SELECT id, map_instance_id, source_object_id, name_snapshot, object_type,
           player_visible, interactable, state_key, updated_at
    FROM runtime_map_objects
    WHERE map_instance_id = ? AND source_object_id IS NOT NULL
    ORDER BY created_at, id
  `).bind(mapInstanceId).all();
  return new Map((rows.results || []).map(row => [row.source_object_id, {
    id: row.id,
    mapInstanceId: row.map_instance_id,
    sourceObjectId: row.source_object_id,
    name: row.name_snapshot,
    objectType: row.object_type,
    playerVisible: Boolean(row.player_visible),
    interactable: Boolean(row.interactable),
    stateKey: row.state_key,
    updatedAt: row.updated_at
  }]));
}

export function runtimeObjectStateMap(objectBySource) {
  return new Map([...(objectBySource || new Map())].map(([sourceObjectId, object]) => [
    sourceObjectId,
    object?.stateKey || ''
  ]));
}

export async function applyRuntimeObjectStateEffect(env, {
  sceneRunId,
  mapInstanceId,
  target,
  sourceObjectId,
  nextStateKey,
  actorUserId,
  storyEventId,
  storyEffectIndex,
  objectStates = null
} = {}) {
  await ensureRuntimeObjectStateAuthoritySchema(env);
  if (!sceneRunId || !mapInstanceId || !actorUserId || !storyEventId) {
    throw Object.assign(new Error('Runtime Object Story effect context is incomplete.'), {
      code: 'STORY_EFFECT_OBJECT_CONTEXT_INVALID'
    });
  }
  const sourceId = String(sourceObjectId || target?.sourceObjectId || '').trim();
  if (!sourceId || !target || target.sourceObjectId !== sourceId) {
    throw Object.assign(new Error(`Runtime Object target not found: ${sourceId || 'missing'}`), {
      code: 'STORY_EFFECT_OBJECT_NOT_FOUND'
    });
  }
  const previousState = stateKey(target.stateKey);
  const nextState = stateKey(nextStateKey);
  if (previousState === nextState) {
    if (objectStates instanceof Map) objectStates.set(sourceId, nextState);
    return {
      sourceObjectId: sourceId,
      runtimeObjectId: target.id,
      stateKey: nextState,
      unchanged: true,
      auditId: null
    };
  }

  const now = Date.now();
  const auditId = `runtime_object_state_${crypto.randomUUID()}`;
  const effectIndex = Number(storyEffectIndex);
  const normalizedEffectIndex = Number.isInteger(effectIndex) && effectIndex >= 0 ? effectIndex : null;
  const results = await env.DB.batch([
    env.DB.prepare(`
      UPDATE runtime_map_objects
      SET state_key = ?, updated_at = ?
      WHERE id = ? AND map_instance_id = ? AND source_object_id = ?
        AND state_key = ? AND updated_at = ?
        AND EXISTS (SELECT 1 FROM runtime_map_instances WHERE id = ? AND status = 'active')
    `).bind(
      nextState, now, target.id, mapInstanceId, sourceId,
      previousState, target.updatedAt, mapInstanceId
    ),
    env.DB.prepare(`
      INSERT INTO runtime_object_state_log (
        id, scene_run_id, map_instance_id, runtime_object_id, source_object_id,
        from_state_key, to_state_key, change_reason, changed_by_user_id,
        interaction_id, story_event_id, story_effect_index, created_at
      )
      SELECT ?, ?, ?, ?, ?, ?, ?, 'story_effect', ?, NULL, ?, ?, ?
      WHERE EXISTS (
        SELECT 1 FROM runtime_map_objects
        WHERE id = ? AND map_instance_id = ? AND source_object_id = ?
          AND state_key = ? AND updated_at = ?
      )
    `).bind(
      auditId, sceneRunId, mapInstanceId, target.id, sourceId,
      previousState, nextState, actorUserId, storyEventId, normalizedEffectIndex, now,
      target.id, mapInstanceId, sourceId, nextState, now
    )
  ]);
  if (Number(results?.[0]?.meta?.changes || 0) !== 1 || Number(results?.[1]?.meta?.changes || 0) !== 1) {
    throw Object.assign(new Error('Runtime Object changed before Story effect execution.'), {
      code: 'STORY_EFFECT_OBJECT_CHANGED'
    });
  }

  target.stateKey = nextState;
  target.updatedAt = now;
  if (objectStates instanceof Map) objectStates.set(sourceId, nextState);
  return {
    sourceObjectId: sourceId,
    runtimeObjectId: target.id,
    stateKey: nextState,
    unchanged: false,
    auditId
  };
}
