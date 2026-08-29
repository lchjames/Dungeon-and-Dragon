let encounterSchemaPromise = null;

const ENCOUNTER_STATUSES = new Set(['planned', 'active', 'resolved', 'skipped']);
const PARTICIPANT_TYPES = new Set(['character', 'monster_instance', 'boss_instance']);
const PARTICIPANT_SOURCE_KINDS = new Set(['definition_character', 'runtime_spawn', 'runtime_manual']);

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
        FOREIGN KEY (activated_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS runtime_encounter_participants (
        id TEXT PRIMARY KEY,
        scene_run_id TEXT NOT NULL,
        encounter_id TEXT NOT NULL,
        entity_type TEXT NOT NULL CHECK (entity_type IN ('character', 'monster_instance', 'boss_instance')),
        entity_id TEXT NOT NULL,
        display_name_snapshot TEXT NOT NULL DEFAULT '',
        source_encounter_participant_id TEXT,
        source_kind TEXT NOT NULL DEFAULT 'definition_character' CHECK (source_kind IN ('definition_character', 'runtime_spawn', 'runtime_manual')),
        created_by_user_id TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE (scene_run_id, encounter_id, entity_type, entity_id),
        FOREIGN KEY (scene_run_id) REFERENCES scene_runs(id) ON DELETE CASCADE,
        FOREIGN KEY (encounter_id) REFERENCES encounters(id) ON DELETE RESTRICT,
        FOREIGN KEY (source_encounter_participant_id) REFERENCES encounter_participants(id) ON DELETE SET NULL,
        FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS runtime_encounter_combats (
        scene_run_id TEXT NOT NULL,
        encounter_id TEXT NOT NULL,
        map_instance_id TEXT NOT NULL,
        combat_id TEXT NOT NULL UNIQUE,
        linked_by_user_id TEXT NOT NULL,
        linked_at INTEGER NOT NULL,
        PRIMARY KEY (scene_run_id, encounter_id),
        FOREIGN KEY (scene_run_id) REFERENCES scene_runs(id) ON DELETE CASCADE,
        FOREIGN KEY (encounter_id) REFERENCES encounters(id) ON DELETE RESTRICT,
        FOREIGN KEY (map_instance_id) REFERENCES runtime_map_instances(id) ON DELETE CASCADE,
        FOREIGN KEY (combat_id) REFERENCES combats(id) ON DELETE CASCADE,
        FOREIGN KEY (linked_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
      )`),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_runtime_encounter_scene_status ON runtime_encounter_states(scene_run_id, status, updated_at)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_runtime_encounter_definition ON runtime_encounter_states(encounter_id, updated_at)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_runtime_encounter_participants_scene_encounter ON runtime_encounter_participants(scene_run_id, encounter_id, entity_type, created_at)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_runtime_encounter_participants_entity ON runtime_encounter_participants(entity_type, entity_id, scene_run_id)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_runtime_encounter_combats_map ON runtime_encounter_combats(map_instance_id, linked_at)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_runtime_encounter_combats_combat ON runtime_encounter_combats(combat_id)')
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
  await env.DB.batch([
    env.DB.prepare(`
      INSERT OR IGNORE INTO runtime_encounter_states (
        id, scene_run_id, encounter_id, definition_status_snapshot, status,
        created_at, updated_at
      )
      SELECT 'runtime_encounter_' || lower(hex(randomblob(16))), ?, e.id, e.status, e.status, ?, ?
      FROM encounters e
      WHERE e.scene_id = ?
    `).bind(sceneRunId, now, now, sceneId),
    env.DB.prepare(`
      INSERT OR IGNORE INTO runtime_encounter_participants (
        id, scene_run_id, encounter_id, entity_type, entity_id, display_name_snapshot,
        source_encounter_participant_id, source_kind, created_by_user_id, created_at, updated_at
      )
      SELECT 'runtime_ep_' || lower(hex(randomblob(16))), ?, ep.encounter_id, 'character', ep.entity_id,
             COALESCE(NULLIF(ep.display_name_snapshot, ''), c.name, ep.entity_id),
             ep.id, 'definition_character', NULL, ?, ?
      FROM encounter_participants ep
      JOIN encounters e ON e.id = ep.encounter_id
      LEFT JOIN characters c ON c.id = ep.entity_id
      WHERE e.scene_id = ? AND ep.entity_type = 'character'
    `).bind(sceneRunId, now, now, sceneId)
  ]);
}

export async function loadRuntimeEncounterParticipantRows(env, sceneRunId, encounterId = null) {
  await ensureRuntimeEncounterSchema(env);
  const query = encounterId
    ? env.DB.prepare(`
        SELECT * FROM runtime_encounter_participants
        WHERE scene_run_id = ? AND encounter_id = ?
        ORDER BY CASE entity_type WHEN 'character' THEN 0 WHEN 'monster_instance' THEN 1 ELSE 2 END, created_at, id
      `).bind(sceneRunId, encounterId)
    : env.DB.prepare(`
        SELECT * FROM runtime_encounter_participants
        WHERE scene_run_id = ?
        ORDER BY encounter_id, CASE entity_type WHEN 'character' THEN 0 WHEN 'monster_instance' THEN 1 ELSE 2 END, created_at, id
      `).bind(sceneRunId);
  const rows = await query.all();
  return (rows.results || []).map(row => ({
    id: row.id,
    sceneRunId: row.scene_run_id,
    encounterId: row.encounter_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    displayName: row.display_name_snapshot || row.entity_id,
    sourceEncounterParticipantId: row.source_encounter_participant_id || null,
    sourceKind: row.source_kind,
    createdByUserId: row.created_by_user_id || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

async function loadRuntimeEncounterCombatRows(env, sceneRunId) {
  const rows = await env.DB.prepare(`
    SELECT rec.*, c.status AS combat_status, c.round_number, c.started_at, c.ended_at
    FROM runtime_encounter_combats rec
    LEFT JOIN combats c ON c.id = rec.combat_id
    WHERE rec.scene_run_id = ?
    ORDER BY rec.linked_at, rec.encounter_id
  `).bind(sceneRunId).all();
  return (rows.results || []).map(row => ({
    sceneRunId: row.scene_run_id,
    encounterId: row.encounter_id,
    mapInstanceId: row.map_instance_id,
    combatId: row.combat_id,
    linkedByUserId: row.linked_by_user_id,
    linkedAt: row.linked_at,
    status: row.combat_status || 'missing',
    roundNumber: row.round_number === null || row.round_number === undefined ? null : Number(row.round_number),
    startedAt: row.started_at,
    endedAt: row.ended_at
  }));
}

export async function loadRuntimeEncounterRows(env, sceneRunId, sceneId) {
  await ensureRuntimeEncounterRows(env, sceneRunId, sceneId);
  const [rows, participants, combats] = await Promise.all([
    env.DB.prepare(`
      SELECT res.*, e.name, e.scene_id
      FROM runtime_encounter_states res
      JOIN encounters e ON e.id = res.encounter_id
      WHERE res.scene_run_id = ? AND e.scene_id = ?
      ORDER BY e.sort_order, e.created_at, e.id
    `).bind(sceneRunId, sceneId).all(),
    loadRuntimeEncounterParticipantRows(env, sceneRunId),
    loadRuntimeEncounterCombatRows(env, sceneRunId)
  ]);
  const participantsByEncounter = new Map();
  for (const participant of participants) {
    if (!participantsByEncounter.has(participant.encounterId)) participantsByEncounter.set(participant.encounterId, []);
    participantsByEncounter.get(participant.encounterId).push(participant);
  }
  const combatByEncounter = new Map(combats.map(combat => [combat.encounterId, combat]));
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
    participants: participantsByEncounter.get(row.encounter_id) || [],
    combat: combatByEncounter.get(row.encounter_id) || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

export async function loadRuntimeEncounterMap(env, sceneRunId, sceneId) {
  const rows = await loadRuntimeEncounterRows(env, sceneRunId, sceneId);
  return new Map(rows.map(row => [row.encounterId, row]));
}

export async function addRuntimeEncounterParticipant(env, {
  sceneRunId,
  sceneId,
  encounterId,
  entityType,
  entityId,
  displayName = '',
  actorUserId = null,
  sourceKind = 'runtime_spawn',
  sourceEncounterParticipantId = null
}) {
  const normalizedType = String(entityType || '').trim().toLowerCase();
  const normalizedEntityId = String(entityId || '').trim();
  const normalizedSourceKind = String(sourceKind || '').trim().toLowerCase();
  if (!PARTICIPANT_TYPES.has(normalizedType)) throw new Error('Runtime Encounter participant type is invalid.');
  if (!normalizedEntityId) throw new Error('Runtime Encounter participant entityId is required.');
  if (!PARTICIPANT_SOURCE_KINDS.has(normalizedSourceKind)) throw new Error('Runtime Encounter participant source kind is invalid.');
  const encounterMap = await loadRuntimeEncounterMap(env, sceneRunId, sceneId);
  if (!encounterMap.has(encounterId)) {
    throw Object.assign(new Error(`Encounter does not belong to this Scene Run: ${encounterId}`), {
      status: 409,
      code: 'RUNTIME_ENCOUNTER_NOT_FOUND'
    });
  }
  const now = Date.now();
  await env.DB.prepare(`
    INSERT INTO runtime_encounter_participants (
      id, scene_run_id, encounter_id, entity_type, entity_id, display_name_snapshot,
      source_encounter_participant_id, source_kind, created_by_user_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(scene_run_id, encounter_id, entity_type, entity_id) DO UPDATE SET
      display_name_snapshot = excluded.display_name_snapshot,
      updated_at = excluded.updated_at
  `).bind(
    `runtime_ep_${crypto.randomUUID()}`,
    sceneRunId,
    encounterId,
    normalizedType,
    normalizedEntityId,
    String(displayName || normalizedEntityId).trim().slice(0, 160) || normalizedEntityId,
    sourceEncounterParticipantId,
    normalizedSourceKind,
    actorUserId,
    now,
    now
  ).run();
  const participants = await loadRuntimeEncounterParticipantRows(env, sceneRunId, encounterId);
  return participants.find(item => item.entityType === normalizedType && item.entityId === normalizedEntityId) || null;
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

export async function linkRuntimeEncounterCombat(env, {
  sceneRunId,
  sceneId,
  encounterId,
  mapInstanceId,
  combatId,
  actorUserId
}) {
  const encounterMap = await loadRuntimeEncounterMap(env, sceneRunId, sceneId);
  const encounter = encounterMap.get(encounterId);
  if (!encounter) {
    throw Object.assign(new Error(`Encounter does not belong to this Scene Run: ${encounterId}`), {
      status: 409,
      code: 'RUNTIME_ENCOUNTER_NOT_FOUND'
    });
  }
  if (encounter.status !== 'active') {
    throw Object.assign(new Error('Runtime Encounter must be active before Combat can be linked.'), {
      status: 409,
      code: 'RUNTIME_ENCOUNTER_NOT_ACTIVE'
    });
  }
  if (encounter.combat) {
    if (encounter.combat.combatId === combatId) return { ...encounter.combat, unchanged: true };
    throw Object.assign(new Error('Runtime Encounter already has a linked Combat.'), {
      status: 409,
      code: 'RUNTIME_ENCOUNTER_COMBAT_EXISTS'
    });
  }
  const mapRow = await env.DB.prepare(`
    SELECT id FROM runtime_map_instances
    WHERE id = ? AND scene_run_id = ? AND scene_id = ? AND status = 'active'
    LIMIT 1
  `).bind(mapInstanceId, sceneRunId, sceneId).first();
  if (!mapRow) {
    throw Object.assign(new Error('Combat Map must be the active Runtime Map for this Scene Run.'), {
      status: 409,
      code: 'RUNTIME_ENCOUNTER_MAP_MISMATCH'
    });
  }
  const combat = await env.DB.prepare('SELECT id FROM combats WHERE id = ? LIMIT 1').bind(combatId).first();
  if (!combat) {
    throw Object.assign(new Error('Combat does not exist.'), { status: 404, code: 'COMBAT_NOT_FOUND' });
  }
  const now = Date.now();
  await env.DB.prepare(`
    INSERT INTO runtime_encounter_combats (
      scene_run_id, encounter_id, map_instance_id, combat_id, linked_by_user_id, linked_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).bind(sceneRunId, encounterId, mapInstanceId, combatId, actorUserId, now).run();
  const refreshed = await loadRuntimeEncounterMap(env, sceneRunId, sceneId);
  return { ...refreshed.get(encounterId).combat, unchanged: false };
}

export function normalizeRuntimeEncounterStatus(value) {
  const status = String(value || '').trim().toLowerCase();
  if (!ENCOUNTER_STATUSES.has(status)) throw new Error('Runtime Encounter status is invalid.');
  return status;
}
