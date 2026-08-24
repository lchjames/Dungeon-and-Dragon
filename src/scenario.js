import baseWorker from './life-correction.js';

const GM_ROLES = new Set(['gm', 'admin']);
const SCENARIO_STATUSES = new Set(['active', 'completed', 'archived']);
const SCENE_STATUSES = new Set(['locked', 'active', 'completed']);
const ENCOUNTER_STATUSES = new Set(['planned', 'active', 'resolved', 'skipped']);
let storySchemaPromise = null;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

function apiError(message, status = 400, code = 'BAD_REQUEST') {
  return json({ ok: false, error: { code, message } }, status);
}

function validOrigin(request) {
  const origin = request.headers.get('Origin');
  return !origin || origin === new URL(request.url).origin;
}

async function currentUser(request, env) {
  const authRequest = new Request(new URL('/api/auth/me', request.url), {
    method: 'GET',
    headers: { Accept: 'application/json', Cookie: request.headers.get('Cookie') || '' }
  });
  const response = await baseWorker.fetch(authRequest, env);
  if (!response.ok) return null;
  const payload = await response.json();
  return payload?.user || null;
}

async function requireGM(request, env) {
  const user = await currentUser(request, env);
  if (!user) throw Object.assign(new Error('未登入。'), { status: 401, code: 'UNAUTHENTICATED' });
  if (!GM_ROLES.has(String(user.role || '').toLowerCase())) {
    throw Object.assign(new Error('此 User 沒有 GM 權限。'), { status: 403, code: 'GM_ROLE_REQUIRED' });
  }
  return user;
}

async function readBody(request) {
  const contentType = request.headers.get('Content-Type') || '';
  if (!contentType.toLowerCase().includes('application/json')) {
    throw Object.assign(new Error('請使用 JSON 格式提交。'), { status: 415, code: 'UNSUPPORTED_MEDIA_TYPE' });
  }
  try {
    return await request.json();
  } catch {
    throw Object.assign(new Error('JSON 格式錯誤。'), { status: 400, code: 'INVALID_JSON' });
  }
}

function cleanText(value, max = 5000) {
  return String(value ?? '').trim().slice(0, max);
}

function requiredName(value, label = 'Name') {
  const name = cleanText(value, 120);
  if (!name) throw Object.assign(new Error(`${label} 必須填寫。`), { status: 400, code: 'VALIDATION_ERROR' });
  return name;
}

function intOrder(value, fallback = 0) {
  const number = Number(value);
  return Number.isInteger(number) ? number : fallback;
}

function checkedStatus(value, allowed, fallback) {
  const status = String(value || fallback).toLowerCase();
  if (!allowed.has(status)) {
    throw Object.assign(new Error(`無效 status: ${status}`), { status: 400, code: 'VALIDATION_ERROR' });
  }
  return status;
}

async function ensureStorySchema(env) {
  if (!env.DB) throw new Error('D1 binding DB is unavailable.');
  if (!storySchemaPromise) {
    storySchemaPromise = env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS scenarios (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        summary TEXT NOT NULL DEFAULT '',
        gm_notes TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived')),
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_by_user_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS scenes (
        id TEXT PRIMARY KEY,
        scenario_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        gm_notes TEXT NOT NULL DEFAULT '',
        sort_order INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('locked', 'active', 'completed')),
        map_name TEXT NOT NULL DEFAULT '',
        map_asset_ref TEXT NOT NULL DEFAULT '',
        map_gm_notes TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (scenario_id) REFERENCES scenarios(id) ON DELETE CASCADE
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS encounters (
        id TEXT PRIMARY KEY,
        scene_id TEXT NOT NULL,
        name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'active', 'resolved', 'skipped')),
        sort_order INTEGER NOT NULL DEFAULT 0,
        trigger_notes TEXT NOT NULL DEFAULT '',
        gm_notes TEXT NOT NULL DEFAULT '',
        resolution_notes TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (scene_id) REFERENCES scenes(id) ON DELETE CASCADE
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS encounter_participants (
        id TEXT PRIMARY KEY,
        encounter_id TEXT NOT NULL,
        entity_type TEXT NOT NULL CHECK (entity_type IN ('character', 'monster_instance', 'boss_instance')),
        entity_id TEXT NOT NULL,
        display_name_snapshot TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE(encounter_id, entity_type, entity_id),
        FOREIGN KEY (encounter_id) REFERENCES encounters(id) ON DELETE CASCADE
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS encounter_combats (
        encounter_id TEXT PRIMARY KEY,
        combat_id TEXT NOT NULL UNIQUE,
        linked_at INTEGER NOT NULL,
        FOREIGN KEY (encounter_id) REFERENCES encounters(id) ON DELETE CASCADE,
        FOREIGN KEY (combat_id) REFERENCES combats(id) ON DELETE CASCADE
      )`),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_scenarios_status_order ON scenarios(status, sort_order, updated_at)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_scenes_scenario_order ON scenes(scenario_id, sort_order, updated_at)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_encounters_scene_order ON encounters(scene_id, sort_order, updated_at)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_encounter_participants_encounter ON encounter_participants(encounter_id, entity_type)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_encounter_combats_combat ON encounter_combats(combat_id)')
    ]).catch(error => {
      storySchemaPromise = null;
      throw error;
    });
  }
  await storySchemaPromise;
}

async function campaignName(env) {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'campaign_name' LIMIT 1").first();
  return row?.value || 'D&D Campaign';
}

async function storyOverview(request, env) {
  if (request.method !== 'GET') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  const user = await requireGM(request, env);
  await ensureStorySchema(env);

  const [name, scenarioRows, sceneRows, encounterRows, participantRows, linkRows, characterRows] = await Promise.all([
    campaignName(env),
    env.DB.prepare('SELECT * FROM scenarios ORDER BY sort_order, created_at, id').all(),
    env.DB.prepare('SELECT * FROM scenes ORDER BY scenario_id, sort_order, created_at, id').all(),
    env.DB.prepare('SELECT * FROM encounters ORDER BY scene_id, sort_order, created_at, id').all(),
    env.DB.prepare(`
      SELECT ep.id, ep.encounter_id, ep.entity_type, ep.entity_id, ep.display_name_snapshot,
             c.name AS current_character_name, c.status AS character_status
      FROM encounter_participants ep
      LEFT JOIN characters c ON ep.entity_type = 'character' AND c.id = ep.entity_id
      ORDER BY ep.created_at, ep.id
    `).all(),
    env.DB.prepare(`
      SELECT ec.encounter_id, ec.combat_id, ec.linked_at, c.status AS combat_status,
             c.round_number, c.started_at, c.ended_at
      FROM encounter_combats ec
      LEFT JOIN combats c ON c.id = ec.combat_id
    `).all(),
    env.DB.prepare(`
      SELECT c.id, c.name, c.owner_user_id, c.status, u.display_name AS owner_display_name
      FROM characters c
      LEFT JOIN users u ON u.id = c.owner_user_id
      WHERE c.status = 'active'
      ORDER BY c.name COLLATE NOCASE
    `).all()
  ]);

  const scenesByScenario = new Map();
  for (const row of sceneRows.results || []) {
    if (!scenesByScenario.has(row.scenario_id)) scenesByScenario.set(row.scenario_id, []);
    scenesByScenario.get(row.scenario_id).push(row);
  }

  const encountersByScene = new Map();
  for (const row of encounterRows.results || []) {
    if (!encountersByScene.has(row.scene_id)) encountersByScene.set(row.scene_id, []);
    encountersByScene.get(row.scene_id).push(row);
  }

  const participantsByEncounter = new Map();
  for (const row of participantRows.results || []) {
    if (!participantsByEncounter.has(row.encounter_id)) participantsByEncounter.set(row.encounter_id, []);
    participantsByEncounter.get(row.encounter_id).push({
      id: row.id,
      entityType: row.entity_type,
      entityId: row.entity_id,
      displayName: row.current_character_name || row.display_name_snapshot || row.entity_id,
      characterStatus: row.character_status || null
    });
  }

  const linksByEncounter = new Map((linkRows.results || []).map(row => [row.encounter_id, {
    combatId: row.combat_id,
    linkedAt: row.linked_at,
    status: row.combat_status || 'missing',
    roundNumber: row.round_number === null || row.round_number === undefined ? null : Number(row.round_number),
    startedAt: row.started_at,
    endedAt: row.ended_at
  }]));

  const scenarios = (scenarioRows.results || []).map(row => ({
    id: row.id,
    name: row.name,
    summary: row.summary,
    gmNotes: row.gm_notes,
    status: row.status,
    sortOrder: Number(row.sort_order || 0),
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    scenes: (scenesByScenario.get(row.id) || []).map(scene => ({
      id: scene.id,
      scenarioId: scene.scenario_id,
      name: scene.name,
      description: scene.description,
      gmNotes: scene.gm_notes,
      sortOrder: Number(scene.sort_order || 0),
      status: scene.status,
      map: {
        name: scene.map_name,
        assetRef: scene.map_asset_ref,
        gmNotes: scene.map_gm_notes
      },
      createdAt: scene.created_at,
      updatedAt: scene.updated_at,
      encounters: (encountersByScene.get(scene.id) || []).map(encounter => ({
        id: encounter.id,
        sceneId: encounter.scene_id,
        name: encounter.name,
        status: encounter.status,
        sortOrder: Number(encounter.sort_order || 0),
        triggerNotes: encounter.trigger_notes,
        gmNotes: encounter.gm_notes,
        resolutionNotes: encounter.resolution_notes,
        createdAt: encounter.created_at,
        updatedAt: encounter.updated_at,
        participants: participantsByEncounter.get(encounter.id) || [],
        combat: linksByEncounter.get(encounter.id) || null
      }))
    }))
  }));

  return json({
    ok: true,
    campaign: { name },
    user: { id: user.id, displayName: user.displayName, role: user.role },
    scenarios,
    characterCandidates: (characterRows.results || []).map(row => ({
      id: row.id,
      name: row.name,
      ownerUserId: row.owner_user_id,
      ownerDisplayName: row.owner_display_name || 'Unassigned',
      status: row.status
    }))
  });
}

async function createScenario(request, env) {
  if (request.method !== 'POST') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  if (!validOrigin(request)) return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
  const user = await requireGM(request, env);
  await ensureStorySchema(env);
  const body = await readBody(request);
  const id = `scenario_${crypto.randomUUID()}`;
  const now = Date.now();
  const values = {
    name: requiredName(body?.name, 'Scenario Name'),
    summary: cleanText(body?.summary, 5000),
    gmNotes: cleanText(body?.gmNotes, 10000),
    status: checkedStatus(body?.status, SCENARIO_STATUSES, 'active'),
    sortOrder: intOrder(body?.sortOrder)
  };
  await env.DB.prepare(`
    INSERT INTO scenarios (id, name, summary, gm_notes, status, sort_order, created_by_user_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, values.name, values.summary, values.gmNotes, values.status, values.sortOrder, user.id, now, now).run();
  return json({ ok: true, id }, 201);
}

async function updateScenario(request, env, scenarioId) {
  if (request.method !== 'PATCH') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  if (!validOrigin(request)) return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
  await requireGM(request, env);
  await ensureStorySchema(env);
  const existing = await env.DB.prepare('SELECT * FROM scenarios WHERE id = ? LIMIT 1').bind(scenarioId).first();
  if (!existing) return apiError('找不到 Scenario。', 404, 'SCENARIO_NOT_FOUND');
  const body = await readBody(request);
  const name = body?.name === undefined ? existing.name : requiredName(body.name, 'Scenario Name');
  const summary = body?.summary === undefined ? existing.summary : cleanText(body.summary, 5000);
  const gmNotes = body?.gmNotes === undefined ? existing.gm_notes : cleanText(body.gmNotes, 10000);
  const status = body?.status === undefined ? existing.status : checkedStatus(body.status, SCENARIO_STATUSES, existing.status);
  const sortOrder = body?.sortOrder === undefined ? Number(existing.sort_order || 0) : intOrder(body.sortOrder, Number(existing.sort_order || 0));
  await env.DB.prepare(`UPDATE scenarios SET name = ?, summary = ?, gm_notes = ?, status = ?, sort_order = ?, updated_at = ? WHERE id = ?`)
    .bind(name, summary, gmNotes, status, sortOrder, Date.now(), scenarioId).run();
  return json({ ok: true, id: scenarioId });
}

async function createScene(request, env, scenarioId) {
  if (request.method !== 'POST') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  if (!validOrigin(request)) return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
  await requireGM(request, env);
  await ensureStorySchema(env);
  const scenario = await env.DB.prepare('SELECT id, status FROM scenarios WHERE id = ? LIMIT 1').bind(scenarioId).first();
  if (!scenario) return apiError('找不到 Scenario。', 404, 'SCENARIO_NOT_FOUND');
  if (scenario.status === 'archived') return apiError('Archived Scenario 不能新增 Scene。', 409, 'SCENARIO_ARCHIVED');
  const body = await readBody(request);
  const id = `scene_${crypto.randomUUID()}`;
  const now = Date.now();
  await env.DB.prepare(`
    INSERT INTO scenes (
      id, scenario_id, name, description, gm_notes, sort_order, status,
      map_name, map_asset_ref, map_gm_notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    scenarioId,
    requiredName(body?.name, 'Scene Name'),
    cleanText(body?.description, 10000),
    cleanText(body?.gmNotes, 10000),
    intOrder(body?.sortOrder),
    checkedStatus(body?.status, SCENE_STATUSES, 'active'),
    cleanText(body?.mapName, 200),
    cleanText(body?.mapAssetRef, 2000),
    cleanText(body?.mapGmNotes, 5000),
    now,
    now
  ).run();
  return json({ ok: true, id }, 201);
}

async function updateScene(request, env, sceneId) {
  if (request.method !== 'PATCH') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  if (!validOrigin(request)) return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
  await requireGM(request, env);
  await ensureStorySchema(env);
  const existing = await env.DB.prepare('SELECT * FROM scenes WHERE id = ? LIMIT 1').bind(sceneId).first();
  if (!existing) return apiError('找不到 Scene。', 404, 'SCENE_NOT_FOUND');
  const body = await readBody(request);
  const pick = (key, oldValue, max) => body?.[key] === undefined ? oldValue : cleanText(body[key], max);
  await env.DB.prepare(`
    UPDATE scenes
    SET name = ?, description = ?, gm_notes = ?, sort_order = ?, status = ?,
        map_name = ?, map_asset_ref = ?, map_gm_notes = ?, updated_at = ?
    WHERE id = ?
  `).bind(
    body?.name === undefined ? existing.name : requiredName(body.name, 'Scene Name'),
    pick('description', existing.description, 10000),
    pick('gmNotes', existing.gm_notes, 10000),
    body?.sortOrder === undefined ? Number(existing.sort_order || 0) : intOrder(body.sortOrder, Number(existing.sort_order || 0)),
    body?.status === undefined ? existing.status : checkedStatus(body.status, SCENE_STATUSES, existing.status),
    pick('mapName', existing.map_name, 200),
    pick('mapAssetRef', existing.map_asset_ref, 2000),
    pick('mapGmNotes', existing.map_gm_notes, 5000),
    Date.now(),
    sceneId
  ).run();
  return json({ ok: true, id: sceneId });
}

async function createEncounter(request, env, sceneId) {
  if (request.method !== 'POST') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  if (!validOrigin(request)) return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
  await requireGM(request, env);
  await ensureStorySchema(env);
  const scene = await env.DB.prepare('SELECT id, status FROM scenes WHERE id = ? LIMIT 1').bind(sceneId).first();
  if (!scene) return apiError('找不到 Scene。', 404, 'SCENE_NOT_FOUND');
  if (scene.status === 'completed') return apiError('Completed Scene 不能新增 Encounter。', 409, 'SCENE_COMPLETED');
  const body = await readBody(request);
  const id = `encounter_${crypto.randomUUID()}`;
  const now = Date.now();
  await env.DB.prepare(`
    INSERT INTO encounters (
      id, scene_id, name, status, sort_order, trigger_notes, gm_notes, resolution_notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    sceneId,
    requiredName(body?.name, 'Encounter Name'),
    checkedStatus(body?.status, ENCOUNTER_STATUSES, 'planned'),
    intOrder(body?.sortOrder),
    cleanText(body?.triggerNotes, 10000),
    cleanText(body?.gmNotes, 10000),
    cleanText(body?.resolutionNotes, 10000),
    now,
    now
  ).run();
  return json({ ok: true, id }, 201);
}

async function updateEncounter(request, env, encounterId) {
  if (request.method !== 'PATCH') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  if (!validOrigin(request)) return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
  await requireGM(request, env);
  await ensureStorySchema(env);
  const existing = await env.DB.prepare('SELECT * FROM encounters WHERE id = ? LIMIT 1').bind(encounterId).first();
  if (!existing) return apiError('找不到 Encounter。', 404, 'ENCOUNTER_NOT_FOUND');
  const body = await readBody(request);
  const pick = (key, oldValue, max) => body?.[key] === undefined ? oldValue : cleanText(body[key], max);
  await env.DB.prepare(`
    UPDATE encounters
    SET name = ?, status = ?, sort_order = ?, trigger_notes = ?, gm_notes = ?, resolution_notes = ?, updated_at = ?
    WHERE id = ?
  `).bind(
    body?.name === undefined ? existing.name : requiredName(body.name, 'Encounter Name'),
    body?.status === undefined ? existing.status : checkedStatus(body.status, ENCOUNTER_STATUSES, existing.status),
    body?.sortOrder === undefined ? Number(existing.sort_order || 0) : intOrder(body.sortOrder, Number(existing.sort_order || 0)),
    pick('triggerNotes', existing.trigger_notes, 10000),
    pick('gmNotes', existing.gm_notes, 10000),
    pick('resolutionNotes', existing.resolution_notes, 10000),
    Date.now(),
    encounterId
  ).run();
  return json({ ok: true, id: encounterId });
}

async function setEncounterParticipants(request, env, encounterId) {
  if (request.method !== 'PUT') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  if (!validOrigin(request)) return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
  await requireGM(request, env);
  await ensureStorySchema(env);
  const encounter = await env.DB.prepare('SELECT id, status FROM encounters WHERE id = ? LIMIT 1').bind(encounterId).first();
  if (!encounter) return apiError('找不到 Encounter。', 404, 'ENCOUNTER_NOT_FOUND');
  if (encounter.status === 'resolved' || encounter.status === 'skipped') {
    return apiError('Resolved / skipped Encounter 不能再改參戰 Character。', 409, 'ENCOUNTER_CLOSED');
  }
  const linked = await env.DB.prepare('SELECT combat_id FROM encounter_combats WHERE encounter_id = ? LIMIT 1').bind(encounterId).first();
  if (linked) return apiError('Encounter 已經連結 Combat，不能再改 Character participants。', 409, 'ENCOUNTER_COMBAT_LINKED');

  const body = await readBody(request);
  const rawIds = Array.isArray(body?.characterIds) ? body.characterIds : [];
  const characterIds = [...new Set(rawIds.map(value => String(value || '').trim()).filter(Boolean))];
  if (characterIds.length > 50) return apiError('Encounter 最多 50 個 Character participants。', 400, 'VALIDATION_ERROR');

  let characters = [];
  if (characterIds.length) {
    const placeholders = characterIds.map(() => '?').join(',');
    const rows = await env.DB.prepare(`SELECT id, name, status FROM characters WHERE id IN (${placeholders})`).bind(...characterIds).all();
    characters = rows.results || [];
    if (characters.length !== characterIds.length) return apiError('部分 Character 不存在。', 400, 'CHARACTER_NOT_FOUND');
    const invalid = characters.find(character => character.status !== 'active');
    if (invalid) return apiError(`${invalid.name} 目前唔係 active Character。`, 409, 'CHARACTER_NOT_ACTIVE');
  }

  const byId = new Map(characters.map(character => [character.id, character]));
  const now = Date.now();
  const statements = [env.DB.prepare("DELETE FROM encounter_participants WHERE encounter_id = ? AND entity_type = 'character'").bind(encounterId)];
  for (const characterId of characterIds) {
    const character = byId.get(characterId);
    statements.push(env.DB.prepare(`
      INSERT INTO encounter_participants (
        id, encounter_id, entity_type, entity_id, display_name_snapshot, created_at, updated_at
      ) VALUES (?, ?, 'character', ?, ?, ?, ?)
    `).bind(`ep_${crypto.randomUUID()}`, encounterId, character.id, character.name, now, now));
  }
  await env.DB.batch(statements);
  return json({ ok: true, encounterId, characterIds });
}

async function startEncounterCombat(request, env, encounterId) {
  if (request.method !== 'POST') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  if (!validOrigin(request)) return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
  await requireGM(request, env);
  await ensureStorySchema(env);

  const encounter = await env.DB.prepare(`
    SELECT e.id, e.name, e.status, s.status AS scene_status
    FROM encounters e
    JOIN scenes s ON s.id = e.scene_id
    WHERE e.id = ?
    LIMIT 1
  `).bind(encounterId).first();
  if (!encounter) return apiError('找不到 Encounter。', 404, 'ENCOUNTER_NOT_FOUND');
  if (encounter.status === 'resolved' || encounter.status === 'skipped') {
    return apiError('Resolved / skipped Encounter 不能開始 Combat。', 409, 'ENCOUNTER_CLOSED');
  }
  if (encounter.scene_status === 'completed') {
    return apiError('Completed Scene 不能開始新 Combat。', 409, 'SCENE_COMPLETED');
  }

  const existingLink = await env.DB.prepare('SELECT combat_id FROM encounter_combats WHERE encounter_id = ? LIMIT 1').bind(encounterId).first();
  if (existingLink) return apiError('此 Encounter 已經有 linked Combat。', 409, 'ENCOUNTER_COMBAT_EXISTS');

  const rows = await env.DB.prepare(`
    SELECT ep.entity_id, c.name, c.status
    FROM encounter_participants ep
    JOIN characters c ON ep.entity_type = 'character' AND c.id = ep.entity_id
    WHERE ep.encounter_id = ?
    ORDER BY ep.created_at, ep.id
  `).bind(encounterId).all();
  const characters = rows.results || [];
  if (!characters.length) return apiError('Encounter 至少要有一個 active Character participant 先可以開始 Combat。', 409, 'ENCOUNTER_CHARACTER_REQUIRED');
  const invalid = characters.find(character => character.status !== 'active');
  if (invalid) return apiError(`${invalid.name} 已唔係 active Character。`, 409, 'CHARACTER_NOT_ACTIVE');

  const internal = new Request(new URL('/api/gm/combat/start', request.url), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Cookie: request.headers.get('Cookie') || '',
      Origin: new URL(request.url).origin
    },
    body: JSON.stringify({ characterIds: characters.map(character => character.entity_id) })
  });

  const combatResponse = await baseWorker.fetch(internal, env);
  if (!combatResponse.ok) return combatResponse;
  const payload = await combatResponse.clone().json();
  const combatId = payload?.combat?.id;
  if (!combatId) return apiError('Combat 已建立但缺少 Combat ID。', 500, 'COMBAT_LINK_FAILED');

  try {
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare('INSERT INTO encounter_combats (encounter_id, combat_id, linked_at) VALUES (?, ?, ?)').bind(encounterId, combatId, now),
      env.DB.prepare("UPDATE encounters SET status = 'active', updated_at = ? WHERE id = ? AND status IN ('planned', 'active')").bind(now, encounterId)
    ]);
  } catch (error) {
    console.error('Encounter Combat link failed; ending orphan Combat', error);
    try {
      await baseWorker.fetch(new Request(new URL(`/api/gm/combat/${encodeURIComponent(combatId)}/end`, request.url), {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Cookie: request.headers.get('Cookie') || '',
          Origin: new URL(request.url).origin
        },
        body: JSON.stringify({})
      }), env);
    } catch (cleanupError) {
      console.error('Unable to clean up orphan Combat', cleanupError);
    }
    return apiError('Combat 無法安全連結 Encounter；已嘗試結束該 Combat。', 500, 'COMBAT_LINK_FAILED');
  }

  return json({ ok: true, encounterId, combat: payload.combat }, 201);
}

async function handleStoryApi(request, env, pathname) {
  if (pathname === '/api/gm/story') return storyOverview(request, env);
  if (pathname === '/api/gm/scenarios') return createScenario(request, env);

  let match = pathname.match(/^\/api\/gm\/scenarios\/([^/]+)$/);
  if (match) return updateScenario(request, env, decodeURIComponent(match[1]));

  match = pathname.match(/^\/api\/gm\/scenarios\/([^/]+)\/scenes$/);
  if (match) return createScene(request, env, decodeURIComponent(match[1]));

  match = pathname.match(/^\/api\/gm\/scenes\/([^/]+)$/);
  if (match) return updateScene(request, env, decodeURIComponent(match[1]));

  match = pathname.match(/^\/api\/gm\/scenes\/([^/]+)\/encounters$/);
  if (match) return createEncounter(request, env, decodeURIComponent(match[1]));

  match = pathname.match(/^\/api\/gm\/encounters\/([^/]+)$/);
  if (match) return updateEncounter(request, env, decodeURIComponent(match[1]));

  match = pathname.match(/^\/api\/gm\/encounters\/([^/]+)\/participants$/);
  if (match) return setEncounterParticipants(request, env, decodeURIComponent(match[1]));

  match = pathname.match(/^\/api\/gm\/encounters\/([^/]+)\/start-combat$/);
  if (match) return startEncounterCombat(request, env, decodeURIComponent(match[1]));

  return apiError('Not found.', 404, 'NOT_FOUND');
}

function isStoryPath(pathname) {
  return pathname === '/api/gm/story'
    || pathname === '/api/gm/scenarios'
    || pathname.startsWith('/api/gm/scenarios/')
    || pathname.startsWith('/api/gm/scenes/')
    || pathname.startsWith('/api/gm/encounters/');
}

export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname;
    try {
      if (isStoryPath(pathname)) return await handleStoryApi(request, env, pathname);
      return baseWorker.fetch(request, env);
    } catch (err) {
      console.error('Scenario / Scene / Encounter gateway error', err);
      if (err?.status) return apiError(err.message, err.status, err.code || 'STORY_API_ERROR');
      if (String(err?.message || err).includes('D1 binding DB is unavailable')) {
        return apiError('資料庫尚未完成配置。', 503, 'DATABASE_UNAVAILABLE');
      }
      return apiError('暫時無法完成 Scenario / Scene / Encounter 要求。', 500, 'STORY_SERVICE_ERROR');
    }
  }
};
