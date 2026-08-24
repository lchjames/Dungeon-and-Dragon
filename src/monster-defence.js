import baseWorker from './monster.js';
import { monsterEffectiveD100Defence, monsterFinalArmorDefence } from './monster-rules.js';

const GM_ROLES = new Set(['gm', 'admin']);
let schemaPromise = null;

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
  return String(value ?? '').trim().normalize('NFKC').slice(0, max);
}

function finite(value, label, { min = -1_000_000, max = 1_000_000 } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw Object.assign(new Error(`${label} 數值無效。`), { status: 400, code: 'VALIDATION_ERROR' });
  }
  return number;
}

function integer(value, label, { min = -10000, max = 10000 } = {}) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw Object.assign(new Error(`${label} 必須係 ${min}–${max} 整數。`), { status: 400, code: 'VALIDATION_ERROR' });
  }
  return number;
}

async function ensureColumn(env, table, column, definition) {
  const rows = await env.DB.prepare(`PRAGMA table_info(${table})`).all();
  if ((rows.results || []).some(row => row.name === column)) return;
  await env.DB.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
}

async function ensureDefenceArmorSchema(env) {
  if (!env.DB) throw new Error('D1 binding DB is unavailable.');
  if (!schemaPromise) {
    schemaPromise = (async () => {
      await ensureColumn(env, 'monster_templates', 'stored_defence', 'REAL NOT NULL DEFAULT 0');
      await ensureColumn(env, 'monster_templates', 'armor_name', "TEXT NOT NULL DEFAULT ''");
      await ensureColumn(env, 'monster_templates', 'armor_defence', 'REAL NOT NULL DEFAULT 0');
      await ensureColumn(env, 'monster_templates', 'armor_notes', "TEXT NOT NULL DEFAULT ''");

      await ensureColumn(env, 'monster_instances', 'stored_defence', 'REAL NOT NULL DEFAULT 0');
      await ensureColumn(env, 'monster_instances', 'defence_modifier', 'REAL NOT NULL DEFAULT 0');
      await ensureColumn(env, 'monster_instances', 'armor_name', "TEXT NOT NULL DEFAULT ''");
      await ensureColumn(env, 'monster_instances', 'armor_base_defence', 'REAL NOT NULL DEFAULT 0');
      await ensureColumn(env, 'monster_instances', 'armor_defence_adjustment', 'REAL NOT NULL DEFAULT 0');
      await ensureColumn(env, 'monster_instances', 'final_armor_defence', 'REAL NOT NULL DEFAULT 0');
      await ensureColumn(env, 'monster_instances', 'armor_notes', "TEXT NOT NULL DEFAULT ''");
    })().catch(error => {
      schemaPromise = null;
      throw error;
    });
  }
  await schemaPromise;
}

function templateDefence(row) {
  return {
    storedDefence: Number(row?.stored_defence || 0),
    armor: {
      name: row?.armor_name || '',
      defence: Number(row?.armor_defence || 0),
      notes: row?.armor_notes || ''
    }
  };
}

function instanceDefence(row) {
  const d100 = monsterEffectiveD100Defence(Number(row?.stored_defence || 0), Number(row?.defence_modifier || 0));
  const armor = monsterFinalArmorDefence(Number(row?.armor_base_defence || 0), Number(row?.armor_defence_adjustment || 0));
  return {
    storedDefence: d100.storedDefence,
    modifier: d100.modifier,
    modifiedDefence: d100.modifiedDefence,
    effectiveD100Defence: d100.effectiveDefence,
    armor: {
      name: row?.armor_name || '',
      baseDefence: armor.baseDefence,
      adjustment: armor.adjustment,
      finalDefence: armor.finalDefence,
      notes: row?.armor_notes || ''
    }
  };
}

async function addOverviewDefence(env, payload) {
  const [templateRows, instanceRows] = await Promise.all([
    env.DB.prepare('SELECT id, stored_defence, armor_name, armor_defence, armor_notes FROM monster_templates').all(),
    env.DB.prepare(`
      SELECT id, stored_defence, defence_modifier, armor_name, armor_base_defence,
             armor_defence_adjustment, final_armor_defence, armor_notes
      FROM monster_instances
    `).all()
  ]);
  const templates = new Map((templateRows.results || []).map(row => [row.id, templateDefence(row)]));
  const instances = new Map((instanceRows.results || []).map(row => [row.id, instanceDefence(row)]));
  payload.templates = (payload.templates || []).map(item => ({ ...item, defence: templates.get(item.id) || null }));
  payload.instances = (payload.instances || []).map(item => ({ ...item, defence: instances.get(item.id) || null }));
  return payload;
}

async function gmMonsterOverview(request, env) {
  const response = await baseWorker.fetch(request, env);
  if (!response.ok) return response;
  await ensureDefenceArmorSchema(env);
  const payload = await response.json();
  return json(await addOverviewDefence(env, payload), response.status);
}

async function updateTemplateDefenceArmor(request, env, templateId) {
  if (request.method !== 'PATCH') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  if (!validOrigin(request)) return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
  await requireGM(request, env);
  await ensureDefenceArmorSchema(env);
  const row = await env.DB.prepare('SELECT * FROM monster_templates WHERE id = ? LIMIT 1').bind(templateId).first();
  if (!row) return apiError('找不到 Monster Template。', 404, 'MONSTER_TEMPLATE_NOT_FOUND');
  const body = await readBody(request);
  const storedDefence = body?.storedDefence === undefined
    ? Number(row.stored_defence || 0)
    : integer(body.storedDefence, 'Stored Defence', { min: 0, max: 10000 });
  const armorName = body?.armorName === undefined ? row.armor_name || '' : cleanText(body.armorName, 160);
  const armorDefence = body?.armorDefence === undefined
    ? Number(row.armor_defence || 0)
    : finite(body.armorDefence, 'Armor Defence', { min: 0, max: 1_000_000 });
  const armorNotes = body?.armorNotes === undefined ? row.armor_notes || '' : cleanText(body.armorNotes, 5000);
  const now = Date.now();
  await env.DB.prepare(`
    UPDATE monster_templates
    SET stored_defence = ?, armor_name = ?, armor_defence = ?, armor_notes = ?, updated_at = ?
    WHERE id = ?
  `).bind(storedDefence, armorName, armorDefence, armorNotes, now, templateId).run();
  const refreshed = await env.DB.prepare('SELECT id, stored_defence, armor_name, armor_defence, armor_notes FROM monster_templates WHERE id = ?').bind(templateId).first();
  return json({ ok: true, templateId, defence: templateDefence(refreshed) });
}

async function updateInstanceDefenceArmor(request, env, instanceId) {
  if (request.method !== 'PATCH') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  if (!validOrigin(request)) return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
  await requireGM(request, env);
  await ensureDefenceArmorSchema(env);
  const row = await env.DB.prepare('SELECT * FROM monster_instances WHERE id = ? LIMIT 1').bind(instanceId).first();
  if (!row) return apiError('找不到 Monster Instance。', 404, 'MONSTER_INSTANCE_NOT_FOUND');
  const body = await readBody(request);
  const defenceModifier = body?.defenceModifier === undefined
    ? Number(row.defence_modifier || 0)
    : integer(body.defenceModifier, 'Defence Modifier', { min: -10000, max: 10000 });
  const armorAdjustment = body?.armorDefenceAdjustment === undefined
    ? Number(row.armor_defence_adjustment || 0)
    : finite(body.armorDefenceAdjustment, 'Armor Defence Adjustment');
  const finalArmor = monsterFinalArmorDefence(Number(row.armor_base_defence || 0), armorAdjustment);
  if (finalArmor.finalDefence < 0) return apiError('Final Armor Defence 不能低過 0。', 400, 'VALIDATION_ERROR');
  await env.DB.prepare(`
    UPDATE monster_instances
    SET defence_modifier = ?, armor_defence_adjustment = ?, final_armor_defence = ?, updated_at = ?
    WHERE id = ?
  `).bind(defenceModifier, armorAdjustment, finalArmor.finalDefence, Date.now(), instanceId).run();
  const refreshed = await env.DB.prepare(`
    SELECT id, stored_defence, defence_modifier, armor_name, armor_base_defence,
           armor_defence_adjustment, final_armor_defence, armor_notes
    FROM monster_instances WHERE id = ?
  `).bind(instanceId).first();
  return json({ ok: true, instanceId, defence: instanceDefence(refreshed) });
}

async function snapshotSpawnedDefence(env, instanceId) {
  const instance = await env.DB.prepare('SELECT id, template_id FROM monster_instances WHERE id = ? LIMIT 1').bind(instanceId).first();
  if (!instance) return;
  const template = await env.DB.prepare(`
    SELECT stored_defence, armor_name, armor_defence, armor_notes
    FROM monster_templates WHERE id = ? LIMIT 1
  `).bind(instance.template_id).first();
  if (!template) return;
  await env.DB.prepare(`
    UPDATE monster_instances
    SET stored_defence = ?, defence_modifier = 0,
        armor_name = ?, armor_base_defence = ?, armor_defence_adjustment = 0,
        final_armor_defence = ?, armor_notes = ?, updated_at = ?
    WHERE id = ?
  `).bind(
    Number(template.stored_defence || 0), template.armor_name || '', Number(template.armor_defence || 0),
    Number(template.armor_defence || 0), template.armor_notes || '', Date.now(), instanceId
  ).run();
}

async function spawnWithDefenceSnapshot(request, env) {
  const response = await baseWorker.fetch(request, env);
  if (!response.ok) return response;
  await ensureDefenceArmorSchema(env);
  const payload = await response.json();
  if (payload?.id) await snapshotSpawnedDefence(env, payload.id);
  if (payload?.id) {
    const row = await env.DB.prepare(`
      SELECT stored_defence, defence_modifier, armor_name, armor_base_defence,
             armor_defence_adjustment, final_armor_defence, armor_notes
      FROM monster_instances WHERE id = ?
    `).bind(payload.id).first();
    payload.defence = instanceDefence(row);
  }
  return json(payload, response.status);
}

async function enrichCombatPayload(env, payload) {
  const combat = payload?.combat;
  const ids = (combat?.combatants || []).filter(item => item.entityType === 'monster_instance').map(item => item.entityId);
  if (!ids.length) return payload;
  const placeholders = ids.map(() => '?').join(',');
  const rows = await env.DB.prepare(`
    SELECT id, stored_defence, defence_modifier, armor_name, armor_base_defence,
           armor_defence_adjustment, final_armor_defence, armor_notes
    FROM monster_instances WHERE id IN (${placeholders})
  `).bind(...ids).all();
  const values = new Map((rows.results || []).map(row => [row.id, instanceDefence(row)]));
  const add = item => item?.entityType === 'monster_instance' ? { ...item, defence: values.get(item.entityId) || null } : item;
  payload.combat = {
    ...combat,
    combatants: (combat.combatants || []).map(add),
    currentCombatant: combat.currentCombatant ? add(combat.currentCombatant) : null
  };
  if (payload?.monsterTurn?.instance?.entityId) payload.monsterTurn.instance = add(payload.monsterTurn.instance);
  return payload;
}

async function combatOverview(request, env) {
  const response = await baseWorker.fetch(request, env);
  if (!response.ok) return response;
  await ensureDefenceArmorSchema(env);
  return json(await enrichCombatPayload(env, await response.json()), response.status);
}

export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname;
    try {
      if (pathname === '/api/gm/monsters' && request.method === 'GET') return await gmMonsterOverview(request, env);

      const templateMatch = pathname.match(/^\/api\/gm\/monster-templates\/([^/]+)\/defence-armor$/);
      if (templateMatch) return await updateTemplateDefenceArmor(request, env, decodeURIComponent(templateMatch[1]));

      const instanceMatch = pathname.match(/^\/api\/gm\/monster-instances\/([^/]+)\/defence-armor$/);
      if (instanceMatch) return await updateInstanceDefenceArmor(request, env, decodeURIComponent(instanceMatch[1]));

      if (pathname === '/api/gm/monster-instances' && request.method === 'POST') return await spawnWithDefenceSnapshot(request, env);

      if ((pathname === '/api/gm/combat' || pathname === '/api/player/combat') && request.method === 'GET') {
        return await combatOverview(request, env);
      }

      return baseWorker.fetch(request, env);
    } catch (err) {
      console.error('Monster Defence / Armor error', err);
      if (err?.status) return apiError(err.message, err.status, err.code || 'MONSTER_DEFENCE_API_ERROR');
      if (String(err?.message || err).includes('D1 binding DB is unavailable')) return apiError('資料庫尚未完成配置。', 503, 'DATABASE_UNAVAILABLE');
      return apiError('暫時無法完成 Monster Defence / Armor 要求。', 500, 'MONSTER_DEFENCE_SERVICE_ERROR');
    }
  }
};
