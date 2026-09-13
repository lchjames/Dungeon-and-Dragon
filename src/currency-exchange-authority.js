import { ensureInventoryWeaponAuthority } from './inventory-weapon-authority.js';

export const CURRENCY_CAMPAIGN_ID = 'alpha';
export const COINS = Object.freeze([
  { id: 'coin_bronze', name: 'Bronze Coin', label: 'Bronze', sortOrder: 1000 },
  { id: 'coin_silver', name: 'Silver Coin', label: 'Silver', sortOrder: 1001 },
  { id: 'coin_gold', name: 'Gold Coin', label: 'Gold', sortOrder: 1002 }
]);

const COIN_IDS = new Set(COINS.map(item => item.id));
const DIRECTIONS = Object.freeze([
  ['coin_bronze', 'coin_silver'],
  ['coin_silver', 'coin_bronze'],
  ['coin_silver', 'coin_gold'],
  ['coin_gold', 'coin_silver']
]);
const DIRECTION_KEYS = new Set(DIRECTIONS.map(([from, to]) => `${from}->${to}`));
let schemaPromise = null;

function fail(message, status = 400, code = 'CURRENCY_VALIDATION_ERROR') {
  throw Object.assign(new Error(message), { status, code });
}

function integer(value, label, { min = 0, max = 1_000_000_000 } = {}) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) fail(`${label} must be an integer from ${min} to ${max}.`);
  return number;
}

function numberValue(value, label, { min = 0, max = 1000 } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) fail(`${label} must be between ${min} and ${max}.`);
  return number;
}

function directionKey(fromId, toId) {
  return `${fromId}->${toId}`;
}

function rateId(rateSetId, fromId, toId) {
  return `rate_${rateSetId}_${fromId.replace('coin_', '')}_${toId.replace('coin_', '')}`;
}

function mapRate(row) {
  return {
    id: row.id,
    rateSetId: row.rate_set_id,
    fromItemDefinitionId: row.from_item_definition_id,
    toItemDefinitionId: row.to_item_definition_id,
    fromQuantity: Number(row.from_quantity),
    toQuantity: Number(row.to_quantity),
    enabled: Boolean(row.enabled),
    sortOrder: Number(row.sort_order || 0)
  };
}

function mapRateSet(row, rates = []) {
  if (!row) return null;
  return {
    id: row.id,
    campaignId: row.campaign_id,
    label: row.label,
    effectiveFrom: row.effective_from,
    effectiveUntil: row.effective_until ?? null,
    status: row.status,
    generationMode: row.generation_mode,
    randomSeed: row.random_seed || null,
    createdByGmId: row.created_by_gm_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    rates
  };
}

function mapSettings(row) {
  return {
    campaignId: row.campaign_id,
    bronzePerSilverReference: Number(row.bronze_per_silver_reference),
    silverPerGoldReference: Number(row.silver_per_gold_reference),
    lowToHighPremiumMinPct: Number(row.low_to_high_premium_min_pct),
    lowToHighPremiumMaxPct: Number(row.low_to_high_premium_max_pct),
    highToLowSpreadMinPct: Number(row.high_to_low_spread_min_pct),
    highToLowSpreadMaxPct: Number(row.high_to_low_spread_max_pct),
    updatedByGmId: row.updated_by_gm_id || null,
    updatedAt: row.updated_at
  };
}

export function normalizeGenerationSettings(body = {}, fallback = null) {
  const source = fallback || {
    bronzePerSilverReference: 100,
    silverPerGoldReference: 100,
    lowToHighPremiumMinPct: 2,
    lowToHighPremiumMaxPct: 10,
    highToLowSpreadMinPct: 0,
    highToLowSpreadMaxPct: 3
  };
  const result = {
    bronzePerSilverReference: integer(body.bronzePerSilverReference ?? source.bronzePerSilverReference, 'Bronze per Silver reference', { min: 1, max: 1_000_000 }),
    silverPerGoldReference: integer(body.silverPerGoldReference ?? source.silverPerGoldReference, 'Silver per Gold reference', { min: 1, max: 1_000_000 }),
    lowToHighPremiumMinPct: numberValue(body.lowToHighPremiumMinPct ?? source.lowToHighPremiumMinPct, 'Low→High premium minimum', { min: 0, max: 100 }),
    lowToHighPremiumMaxPct: numberValue(body.lowToHighPremiumMaxPct ?? source.lowToHighPremiumMaxPct, 'Low→High premium maximum', { min: 0, max: 100 }),
    highToLowSpreadMinPct: numberValue(body.highToLowSpreadMinPct ?? source.highToLowSpreadMinPct, 'High→Low haircut minimum', { min: 0, max: 99.99 }),
    highToLowSpreadMaxPct: numberValue(body.highToLowSpreadMaxPct ?? source.highToLowSpreadMaxPct, 'High→Low haircut maximum', { min: 0, max: 99.99 })
  };
  if (result.lowToHighPremiumMinPct > result.lowToHighPremiumMaxPct) fail('Low→High premium minimum cannot exceed maximum.');
  if (result.highToLowSpreadMinPct > result.highToLowSpreadMaxPct) fail('High→Low haircut minimum cannot exceed maximum.');
  return result;
}

function randomBetween(min, max) {
  if (max <= min) return min;
  const bucket = new Uint32Array(1);
  crypto.getRandomValues(bucket);
  return min + (bucket[0] / 0xFFFFFFFF) * (max - min);
}

export function generateExchangeRates(settings) {
  const value = normalizeGenerationSettings({}, settings);
  const pair = reference => {
    for (let attempt = 0; attempt < 32; attempt += 1) {
      const premium = randomBetween(value.lowToHighPremiumMinPct, value.lowToHighPremiumMaxPct);
      const haircut = randomBetween(value.highToLowSpreadMinPct, value.highToLowSpreadMaxPct);
      const lowToHighRequired = Math.ceil(reference * (1 + premium / 100));
      const highToLowReceive = Math.floor(reference * (1 - haircut / 100));
      if (lowToHighRequired > 0 && highToLowReceive > 0 && highToLowReceive < lowToHighRequired) {
        return { lowToHighRequired, highToLowReceive };
      }
    }
    fail('Unable to generate a no-arbitrage exchange pair from current settings.', 409, 'CURRENCY_RANDOM_NO_ARBITRAGE_FAILED');
  };
  const bronzeSilver = pair(value.bronzePerSilverReference);
  const silverGold = pair(value.silverPerGoldReference);
  return [
    { fromItemDefinitionId: 'coin_bronze', toItemDefinitionId: 'coin_silver', fromQuantity: bronzeSilver.lowToHighRequired, toQuantity: 1, enabled: true, sortOrder: 10 },
    { fromItemDefinitionId: 'coin_silver', toItemDefinitionId: 'coin_bronze', fromQuantity: 1, toQuantity: bronzeSilver.highToLowReceive, enabled: true, sortOrder: 20 },
    { fromItemDefinitionId: 'coin_silver', toItemDefinitionId: 'coin_gold', fromQuantity: silverGold.lowToHighRequired, toQuantity: 1, enabled: true, sortOrder: 30 },
    { fromItemDefinitionId: 'coin_gold', toItemDefinitionId: 'coin_silver', fromQuantity: 1, toQuantity: silverGold.highToLowReceive, enabled: true, sortOrder: 40 }
  ];
}

export function normalizeManualRates(input = []) {
  if (!Array.isArray(input)) fail('Exchange rates must be an array.');
  const byDirection = new Map();
  for (const row of input) {
    const fromId = String(row?.fromItemDefinitionId || '').trim();
    const toId = String(row?.toItemDefinitionId || '').trim();
    const key = directionKey(fromId, toId);
    if (!DIRECTION_KEYS.has(key)) fail(`Unsupported Alpha exchange direction: ${key}.`);
    if (byDirection.has(key)) fail(`Duplicate exchange direction: ${key}.`);
    byDirection.set(key, {
      fromItemDefinitionId: fromId,
      toItemDefinitionId: toId,
      fromQuantity: integer(row.fromQuantity, `${key} source quantity`, { min: 1 }),
      toQuantity: integer(row.toQuantity, `${key} destination quantity`, { min: 1 }),
      enabled: row.enabled !== false,
      sortOrder: Number.isInteger(Number(row.sortOrder)) ? Number(row.sortOrder) : 0
    });
  }
  for (const [fromId, toId] of DIRECTIONS) {
    const key = directionKey(fromId, toId);
    if (!byDirection.has(key)) fail(`Missing Alpha exchange direction: ${key}.`);
  }
  return DIRECTIONS.map(([fromId, toId], index) => ({
    ...byDirection.get(directionKey(fromId, toId)),
    sortOrder: byDirection.get(directionKey(fromId, toId)).sortOrder || (index + 1) * 10
  }));
}

export async function ensureCurrencyExchangeAuthority(env) {
  if (!env.DB) throw new Error('D1 binding DB is unavailable.');
  await ensureInventoryWeaponAuthority(env);
  if (!schemaPromise) {
    schemaPromise = (async () => {
      await env.DB.batch([
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS currency_exchange_generation_settings (
          campaign_id TEXT PRIMARY KEY,
          bronze_per_silver_reference INTEGER NOT NULL DEFAULT 100,
          silver_per_gold_reference INTEGER NOT NULL DEFAULT 100,
          low_to_high_premium_min_pct REAL NOT NULL DEFAULT 2,
          low_to_high_premium_max_pct REAL NOT NULL DEFAULT 10,
          high_to_low_spread_min_pct REAL NOT NULL DEFAULT 0,
          high_to_low_spread_max_pct REAL NOT NULL DEFAULT 3,
          updated_by_gm_id TEXT,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (updated_by_gm_id) REFERENCES users(id) ON DELETE SET NULL
        )`),
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS currency_exchange_rate_sets (
          id TEXT PRIMARY KEY,
          campaign_id TEXT NOT NULL,
          label TEXT NOT NULL,
          effective_from INTEGER,
          effective_until INTEGER,
          status TEXT NOT NULL CHECK (status IN ('ACTIVE','ARCHIVED','DRAFT')),
          generation_mode TEXT NOT NULL CHECK (generation_mode IN ('MANUAL','RANDOM')),
          random_seed TEXT,
          created_by_gm_id TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (created_by_gm_id) REFERENCES users(id) ON DELETE RESTRICT
        )`),
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS currency_exchange_rates (
          id TEXT PRIMARY KEY,
          rate_set_id TEXT NOT NULL,
          from_item_definition_id TEXT NOT NULL,
          to_item_definition_id TEXT NOT NULL,
          from_quantity INTEGER NOT NULL CHECK (from_quantity > 0),
          to_quantity INTEGER NOT NULL CHECK (to_quantity > 0),
          enabled INTEGER NOT NULL DEFAULT 1,
          sort_order INTEGER NOT NULL DEFAULT 0,
          metadata TEXT NOT NULL DEFAULT '{}',
          FOREIGN KEY (rate_set_id) REFERENCES currency_exchange_rate_sets(id) ON DELETE CASCADE,
          FOREIGN KEY (from_item_definition_id) REFERENCES item_definitions(id) ON DELETE RESTRICT,
          FOREIGN KEY (to_item_definition_id) REFERENCES item_definitions(id) ON DELETE RESTRICT,
          UNIQUE (rate_set_id, from_item_definition_id, to_item_definition_id)
        )`),
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS currency_exchange_transactions (
          id TEXT PRIMARY KEY,
          campaign_id TEXT NOT NULL,
          character_id TEXT NOT NULL,
          rate_set_id TEXT NOT NULL,
          rate_id TEXT NOT NULL,
          from_item_definition_id TEXT NOT NULL,
          from_quantity_total INTEGER NOT NULL CHECK (from_quantity_total > 0),
          to_item_definition_id TEXT NOT NULL,
          to_quantity_total INTEGER NOT NULL CHECK (to_quantity_total > 0),
          quoted_from_quantity INTEGER NOT NULL CHECK (quoted_from_quantity > 0),
          quoted_to_quantity INTEGER NOT NULL CHECK (quoted_to_quantity > 0),
          exchange_units INTEGER NOT NULL CHECK (exchange_units > 0),
          created_by_user_id TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          metadata TEXT NOT NULL DEFAULT '{}',
          FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE RESTRICT,
          FOREIGN KEY (rate_set_id) REFERENCES currency_exchange_rate_sets(id) ON DELETE RESTRICT,
          FOREIGN KEY (rate_id) REFERENCES currency_exchange_rates(id) ON DELETE RESTRICT,
          FOREIGN KEY (from_item_definition_id) REFERENCES item_definitions(id) ON DELETE RESTRICT,
          FOREIGN KEY (to_item_definition_id) REFERENCES item_definitions(id) ON DELETE RESTRICT,
          FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
        )`),
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS currency_exchange_admin_log (
          id TEXT PRIMARY KEY,
          campaign_id TEXT NOT NULL,
          action_type TEXT NOT NULL,
          rate_set_id TEXT,
          actor_user_id TEXT NOT NULL,
          payload TEXT NOT NULL DEFAULT '{}',
          created_at INTEGER NOT NULL,
          FOREIGN KEY (rate_set_id) REFERENCES currency_exchange_rate_sets(id) ON DELETE SET NULL,
          FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE RESTRICT
        )`),
        env.DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_currency_exchange_active_campaign
          ON currency_exchange_rate_sets(campaign_id) WHERE status = 'ACTIVE'`),
        env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_currency_exchange_sets_history
          ON currency_exchange_rate_sets(campaign_id, status, updated_at DESC)`),
        env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_currency_exchange_rates_set
          ON currency_exchange_rates(rate_set_id, sort_order, id)`),
        env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_currency_exchange_transactions_character
          ON currency_exchange_transactions(character_id, created_at DESC)`),
        env.DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_character_inventory_currency_stack
          ON character_inventory(character_id, item_definition_id)
          WHERE item_definition_id IN ('coin_bronze','coin_silver','coin_gold')`)
      ]);

      const now = Date.now();
      for (const coin of COINS) {
        await env.DB.prepare(`INSERT OR IGNORE INTO item_definitions (
          id, name, item_type, item_subtype, description, stackable, max_stack,
          tradeable, active, image_ref, created_at, updated_at, metadata
        ) VALUES (?, ?, 'ITEM', 'CURRENCY', ?, 1, NULL, 1, 1, NULL, ?, ?, ?)`)
          .bind(coin.id, coin.name, `${coin.label} visible Campaign currency.`, now, now, JSON.stringify({ currency: true, denomination: coin.label.toLowerCase() })).run();
      }
      await env.DB.prepare(`INSERT OR IGNORE INTO currency_exchange_generation_settings (
        campaign_id, bronze_per_silver_reference, silver_per_gold_reference,
        low_to_high_premium_min_pct, low_to_high_premium_max_pct,
        high_to_low_spread_min_pct, high_to_low_spread_max_pct,
        updated_by_gm_id, updated_at
      ) VALUES (?, 100, 100, 2, 10, 0, 3, NULL, ?)`)
        .bind(CURRENCY_CAMPAIGN_ID, now).run();

      await env.DB.batch([
        env.DB.prepare('DROP TRIGGER IF EXISTS trg_currency_exchange_apply'),
        env.DB.prepare(`CREATE TRIGGER trg_currency_exchange_apply
          BEFORE INSERT ON currency_exchange_transactions
          BEGIN
            SELECT RAISE(ABORT, 'CURRENCY_RATE_STALE')
            WHERE NOT EXISTS (
              SELECT 1
              FROM currency_exchange_rates r
              JOIN currency_exchange_rate_sets s ON s.id = r.rate_set_id
              WHERE r.id = NEW.rate_id
                AND r.rate_set_id = NEW.rate_set_id
                AND s.campaign_id = NEW.campaign_id
                AND s.status = 'ACTIVE'
                AND r.enabled = 1
                AND r.from_item_definition_id = NEW.from_item_definition_id
                AND r.to_item_definition_id = NEW.to_item_definition_id
                AND r.from_quantity = NEW.quoted_from_quantity
                AND r.to_quantity = NEW.quoted_to_quantity
            );

            SELECT RAISE(ABORT, 'CURRENCY_BUNDLE_INVALID')
            WHERE NEW.from_quantity_total != NEW.quoted_from_quantity * NEW.exchange_units
               OR NEW.to_quantity_total != NEW.quoted_to_quantity * NEW.exchange_units;

            UPDATE character_inventory
            SET quantity = quantity - NEW.from_quantity_total,
                qty = quantity - NEW.from_quantity_total,
                revision = revision + 1
            WHERE character_id = NEW.character_id
              AND item_definition_id = NEW.from_item_definition_id
              AND quantity >= NEW.from_quantity_total;

            SELECT RAISE(ABORT, 'CURRENCY_INSUFFICIENT_FUNDS') WHERE changes() != 1;

            UPDATE character_inventory
            SET quantity = quantity + NEW.to_quantity_total,
                qty = quantity + NEW.to_quantity_total,
                revision = revision + 1
            WHERE character_id = NEW.character_id
              AND item_definition_id = NEW.to_item_definition_id;

            SELECT RAISE(ABORT, 'CURRENCY_DESTINATION_STACK_MISSING') WHERE changes() != 1;

            INSERT INTO character_inventory_log (
              id, character_id, inventory_id, item_definition_id, change_type,
              from_quantity, to_quantity, from_equipped, to_equipped,
              actor_user_id, actor_role, created_at
            )
            SELECT NEW.id || ':out', NEW.character_id, ci.id, NEW.from_item_definition_id,
                   'currency_exchange_out', ci.quantity + NEW.from_quantity_total, ci.quantity,
                   0, 0, NEW.created_by_user_id, 'player', NEW.created_at
            FROM character_inventory ci
            WHERE ci.character_id = NEW.character_id AND ci.item_definition_id = NEW.from_item_definition_id;

            INSERT INTO character_inventory_log (
              id, character_id, inventory_id, item_definition_id, change_type,
              from_quantity, to_quantity, from_equipped, to_equipped,
              actor_user_id, actor_role, created_at
            )
            SELECT NEW.id || ':in', NEW.character_id, ci.id, NEW.to_item_definition_id,
                   'currency_exchange_in', ci.quantity - NEW.to_quantity_total, ci.quantity,
                   0, 0, NEW.created_by_user_id, 'player', NEW.created_at
            FROM character_inventory ci
            WHERE ci.character_id = NEW.character_id AND ci.item_definition_id = NEW.to_item_definition_id;
          END`)
      ]);
    })().catch(error => {
      schemaPromise = null;
      throw error;
    });
  }
  await schemaPromise;
}

export async function ensureCharacterCurrencyStacks(env, characterId) {
  await ensureCurrencyExchangeAuthority(env);
  const now = Date.now();
  for (const coin of COINS) {
    await env.DB.prepare(`INSERT OR IGNORE INTO character_inventory (
      id, character_id, sort_order, name, qty, notes,
      item_definition_id, quantity, is_equipped, equip_slot,
      custom_name, custom_description, condition_value, acquired_at,
      source, revision, instance_metadata
    ) VALUES (?, ?, ?, ?, 0, '', ?, 0, 0, NULL, NULL, NULL, NULL, ?, 'currency_authority', 1, '{}')`)
      .bind(`inv_${crypto.randomUUID()}`, characterId, coin.sortOrder, coin.name, coin.id, now).run();
  }
}

async function ratesForSet(env, rateSetId) {
  if (!rateSetId) return [];
  const rows = await env.DB.prepare(`SELECT * FROM currency_exchange_rates
    WHERE rate_set_id = ? ORDER BY sort_order, id`).bind(rateSetId).all();
  return (rows.results || []).map(mapRate);
}

async function setWithRates(env, row) {
  return row ? mapRateSet(row, await ratesForSet(env, row.id)) : null;
}

export async function getGenerationSettings(env) {
  await ensureCurrencyExchangeAuthority(env);
  const row = await env.DB.prepare('SELECT * FROM currency_exchange_generation_settings WHERE campaign_id = ? LIMIT 1')
    .bind(CURRENCY_CAMPAIGN_ID).first();
  return mapSettings(row);
}

export async function updateGenerationSettings(env, body, actorUserId) {
  const current = await getGenerationSettings(env);
  const value = normalizeGenerationSettings(body, current);
  const now = Date.now();
  await env.DB.prepare(`UPDATE currency_exchange_generation_settings SET
    bronze_per_silver_reference = ?, silver_per_gold_reference = ?,
    low_to_high_premium_min_pct = ?, low_to_high_premium_max_pct = ?,
    high_to_low_spread_min_pct = ?, high_to_low_spread_max_pct = ?,
    updated_by_gm_id = ?, updated_at = ? WHERE campaign_id = ?`)
    .bind(value.bronzePerSilverReference, value.silverPerGoldReference,
      value.lowToHighPremiumMinPct, value.lowToHighPremiumMaxPct,
      value.highToLowSpreadMinPct, value.highToLowSpreadMaxPct,
      actorUserId, now, CURRENCY_CAMPAIGN_ID).run();
  await writeAdminLog(env, 'settings_updated', null, actorUserId, value, now);
  return getGenerationSettings(env);
}

async function writeAdminLog(env, actionType, rateSetId, actorUserId, payload = {}, now = Date.now()) {
  await env.DB.prepare(`INSERT INTO currency_exchange_admin_log (
    id, campaign_id, action_type, rate_set_id, actor_user_id, payload, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(`fxadmin_${crypto.randomUUID()}`, CURRENCY_CAMPAIGN_ID, actionType, rateSetId,
      actorUserId, JSON.stringify(payload), now).run();
}

async function draftRow(env) {
  return env.DB.prepare(`SELECT * FROM currency_exchange_rate_sets
    WHERE campaign_id = ? AND status = 'DRAFT' ORDER BY updated_at DESC LIMIT 1`)
    .bind(CURRENCY_CAMPAIGN_ID).first();
}

async function upsertDraft(env, actorUserId, generationMode, rates, randomSeed = null, label = '') {
  const normalized = normalizeManualRates(rates);
  const now = Date.now();
  let draft = await draftRow(env);
  let id = draft?.id || `fxset_${crypto.randomUUID()}`;
  const resolvedLabel = String(label || '').trim().slice(0, 120) || `${generationMode === 'RANDOM' ? 'Random' : 'Manual'} Draft ${new Date(now).toISOString().slice(0, 10)}`;
  if (!draft) {
    await env.DB.prepare(`INSERT INTO currency_exchange_rate_sets (
      id, campaign_id, label, effective_from, effective_until, status,
      generation_mode, random_seed, created_by_gm_id, created_at, updated_at
    ) VALUES (?, ?, ?, NULL, NULL, 'DRAFT', ?, ?, ?, ?, ?)`)
      .bind(id, CURRENCY_CAMPAIGN_ID, resolvedLabel, generationMode, randomSeed, actorUserId, now, now).run();
  } else {
    await env.DB.prepare(`UPDATE currency_exchange_rate_sets SET
      label = ?, generation_mode = ?, random_seed = ?, updated_at = ?
      WHERE id = ? AND status = 'DRAFT'`)
      .bind(resolvedLabel, generationMode, randomSeed, now, id).run();
    await env.DB.prepare('DELETE FROM currency_exchange_rates WHERE rate_set_id = ?').bind(id).run();
  }
  for (const rate of normalized) {
    await env.DB.prepare(`INSERT INTO currency_exchange_rates (
      id, rate_set_id, from_item_definition_id, to_item_definition_id,
      from_quantity, to_quantity, enabled, sort_order, metadata
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, '{}')`)
      .bind(rateId(id, rate.fromItemDefinitionId, rate.toItemDefinitionId), id,
        rate.fromItemDefinitionId, rate.toItemDefinitionId,
        rate.fromQuantity, rate.toQuantity, rate.enabled ? 1 : 0, rate.sortOrder).run();
  }
  await writeAdminLog(env, generationMode === 'RANDOM' ? 'draft_randomised' : 'draft_saved_manual', id, actorUserId, { rates: normalized }, now);
  draft = await env.DB.prepare('SELECT * FROM currency_exchange_rate_sets WHERE id = ?').bind(id).first();
  return setWithRates(env, draft);
}

export async function randomiseDraft(env, actorUserId, settingsPatch = null) {
  await ensureCurrencyExchangeAuthority(env);
  let settings = await getGenerationSettings(env);
  if (settingsPatch && typeof settingsPatch === 'object') settings = await updateGenerationSettings(env, settingsPatch, actorUserId);
  const rates = generateExchangeRates(settings);
  const randomSeed = crypto.randomUUID();
  return upsertDraft(env, actorUserId, 'RANDOM', rates, randomSeed);
}

export async function saveManualDraft(env, actorUserId, body = {}) {
  await ensureCurrencyExchangeAuthority(env);
  return upsertDraft(env, actorUserId, 'MANUAL', body.rates, null, body.label || '');
}

export async function activateDraft(env, actorUserId, draftId) {
  await ensureCurrencyExchangeAuthority(env);
  const draft = await env.DB.prepare(`SELECT * FROM currency_exchange_rate_sets
    WHERE id = ? AND campaign_id = ? AND status = 'DRAFT' LIMIT 1`)
    .bind(draftId, CURRENCY_CAMPAIGN_ID).first();
  if (!draft) fail('Exchange-rate Draft not found.', 404, 'CURRENCY_DRAFT_NOT_FOUND');
  const rates = await ratesForSet(env, draftId);
  if (rates.length !== DIRECTIONS.length) fail('Exchange-rate Draft is incomplete.', 409, 'CURRENCY_DRAFT_INCOMPLETE');
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(`UPDATE currency_exchange_rate_sets
      SET status = 'ARCHIVED', effective_until = ?, updated_at = ?
      WHERE campaign_id = ? AND status = 'ACTIVE'`).bind(now, now, CURRENCY_CAMPAIGN_ID),
    env.DB.prepare(`UPDATE currency_exchange_rate_sets
      SET status = 'ACTIVE', effective_from = ?, effective_until = NULL, updated_at = ?
      WHERE id = ? AND campaign_id = ? AND status = 'DRAFT'`).bind(now, now, draftId, CURRENCY_CAMPAIGN_ID),
    env.DB.prepare(`INSERT INTO currency_exchange_admin_log (
      id, campaign_id, action_type, rate_set_id, actor_user_id, payload, created_at
    ) VALUES (?, ?, 'rate_set_activated', ?, ?, ?, ?)`)
      .bind(`fxadmin_${crypto.randomUUID()}`, CURRENCY_CAMPAIGN_ID, draftId, actorUserId, JSON.stringify({ previousActiveArchived: true }), now)
  ]);
  const active = await env.DB.prepare('SELECT * FROM currency_exchange_rate_sets WHERE id = ? AND status = \'ACTIVE\'').bind(draftId).first();
  if (!active) fail('Exchange-rate activation lost a concurrent update.', 409, 'CURRENCY_ACTIVATION_CHANGED');
  return setWithRates(env, active);
}

export async function getExchangeAdminState(env) {
  await ensureCurrencyExchangeAuthority(env);
  const [settings, activeRow, draft, historyRows] = await Promise.all([
    getGenerationSettings(env),
    env.DB.prepare(`SELECT * FROM currency_exchange_rate_sets WHERE campaign_id = ? AND status = 'ACTIVE' LIMIT 1`).bind(CURRENCY_CAMPAIGN_ID).first(),
    draftRow(env),
    env.DB.prepare(`SELECT * FROM currency_exchange_rate_sets WHERE campaign_id = ? ORDER BY updated_at DESC LIMIT 12`).bind(CURRENCY_CAMPAIGN_ID).all()
  ]);
  return {
    settings,
    active: await setWithRates(env, activeRow),
    draft: await setWithRates(env, draft),
    history: (historyRows.results || []).map(row => mapRateSet(row, []))
  };
}

export async function setCharacterCurrencyQuantity(env, characterId, coinId, quantity, actor) {
  await ensureCharacterCurrencyStacks(env, characterId);
  if (!COIN_IDS.has(coinId)) fail('Unknown Currency Item.', 404, 'CURRENCY_ITEM_NOT_FOUND');
  const target = integer(quantity, 'Currency quantity', { min: 0, max: 1_000_000_000 });
  const row = await env.DB.prepare(`SELECT id, quantity, revision FROM character_inventory
    WHERE character_id = ? AND item_definition_id = ? LIMIT 1`).bind(characterId, coinId).first();
  if (!row) fail('Currency stack missing.', 500, 'CURRENCY_STACK_MISSING');
  const before = Number(row.quantity || 0);
  if (before === target) return getCharacterCurrency(env, characterId);
  const now = Date.now();
  const result = await env.DB.prepare(`UPDATE character_inventory
    SET quantity = ?, qty = ?, revision = revision + 1
    WHERE id = ? AND character_id = ? AND revision = ?`)
    .bind(target, target, row.id, characterId, Number(row.revision || 1)).run();
  if (Number(result?.meta?.changes || 0) !== 1) fail('Currency stack changed; reload before saving.', 409, 'CURRENCY_REVISION_CHANGED');
  await env.DB.prepare(`INSERT INTO character_inventory_log (
    id, character_id, inventory_id, item_definition_id, change_type,
    from_quantity, to_quantity, from_equipped, to_equipped,
    actor_user_id, actor_role, created_at
  ) VALUES (?, ?, ?, ?, 'gm_currency_set', ?, ?, 0, 0, ?, ?, ?)`)
    .bind(`invlog_${crypto.randomUUID()}`, characterId, row.id, coinId, before, target,
      actor.id, actor.role || 'gm', now).run();
  return getCharacterCurrency(env, characterId);
}

export async function getCharacterCurrency(env, characterId) {
  await ensureCharacterCurrencyStacks(env, characterId);
  const rows = await env.DB.prepare(`SELECT ci.id, ci.item_definition_id, ci.quantity, ci.revision, d.name
    FROM character_inventory ci JOIN item_definitions d ON d.id = ci.item_definition_id
    WHERE ci.character_id = ? AND ci.item_definition_id IN ('coin_bronze','coin_silver','coin_gold')
    ORDER BY ci.sort_order`).bind(characterId).all();
  const balances = Object.fromEntries((rows.results || []).map(row => [row.item_definition_id, {
    inventoryId: row.id,
    itemDefinitionId: row.item_definition_id,
    name: row.name,
    quantity: Number(row.quantity || 0),
    revision: Number(row.revision || 1)
  }]));
  for (const coin of COINS) if (!balances[coin.id]) fail(`Currency stack missing for ${coin.id}.`, 500, 'CURRENCY_STACK_MISSING');
  return { balances };
}

export async function getPlayerCurrencyState(env, characterId) {
  await ensureCurrencyExchangeAuthority(env);
  const currency = await getCharacterCurrency(env, characterId);
  const activeRow = await env.DB.prepare(`SELECT * FROM currency_exchange_rate_sets
    WHERE campaign_id = ? AND status = 'ACTIVE' LIMIT 1`).bind(CURRENCY_CAMPAIGN_ID).first();
  const active = await setWithRates(env, activeRow);
  return { ...currency, activeRateSet: active };
}

function mapExchangeError(error) {
  const message = String(error?.message || error || '');
  for (const code of [
    'CURRENCY_RATE_STALE',
    'CURRENCY_BUNDLE_INVALID',
    'CURRENCY_INSUFFICIENT_FUNDS',
    'CURRENCY_DESTINATION_STACK_MISSING'
  ]) {
    if (message.includes(code)) return Object.assign(new Error(code === 'CURRENCY_RATE_STALE' ? 'Exchange rate changed; reload current rates.' : code === 'CURRENCY_INSUFFICIENT_FUNDS' ? 'Character does not own enough source Currency.' : 'Currency exchange could not be applied.'), { status: 409, code });
  }
  return error;
}

export async function executeCurrencyExchange(env, characterId, userId, body = {}) {
  await ensureCharacterCurrencyStacks(env, characterId);
  const rateIdValue = String(body.rateId || '').trim();
  const expectedRateSetId = String(body.expectedRateSetId || '').trim();
  if (!rateIdValue || !expectedRateSetId) fail('Rate ID and expected Rate Set are required.');
  const rate = await env.DB.prepare(`SELECT r.*, s.campaign_id, s.status
    FROM currency_exchange_rates r
    JOIN currency_exchange_rate_sets s ON s.id = r.rate_set_id
    WHERE r.id = ? AND r.rate_set_id = ? LIMIT 1`).bind(rateIdValue, expectedRateSetId).first();
  if (!rate || rate.campaign_id !== CURRENCY_CAMPAIGN_ID || rate.status !== 'ACTIVE' || Number(rate.enabled) !== 1) {
    fail('Exchange rate changed; reload current rates.', 409, 'CURRENCY_RATE_STALE');
  }
  if (body.quotedFromQuantity !== undefined && Number(body.quotedFromQuantity) !== Number(rate.from_quantity)) fail('Exchange rate changed; reload current rates.', 409, 'CURRENCY_RATE_STALE');
  if (body.quotedToQuantity !== undefined && Number(body.quotedToQuantity) !== Number(rate.to_quantity)) fail('Exchange rate changed; reload current rates.', 409, 'CURRENCY_RATE_STALE');
  const sourceQuantity = integer(body.sourceQuantity, 'Source Currency quantity', { min: 1, max: 1_000_000_000 });
  const quotedFrom = Number(rate.from_quantity);
  const quotedTo = Number(rate.to_quantity);
  if (sourceQuantity % quotedFrom !== 0) fail(`Source quantity must be a whole multiple of ${quotedFrom}.`, 409, 'CURRENCY_BUNDLE_INVALID');
  const units = sourceQuantity / quotedFrom;
  const destinationQuantity = units * quotedTo;
  const transactionId = `fx_${crypto.randomUUID()}`;
  const now = Date.now();
  try {
    await env.DB.prepare(`INSERT INTO currency_exchange_transactions (
      id, campaign_id, character_id, rate_set_id, rate_id,
      from_item_definition_id, from_quantity_total,
      to_item_definition_id, to_quantity_total,
      quoted_from_quantity, quoted_to_quantity, exchange_units,
      created_by_user_id, created_at, metadata
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}')`)
      .bind(transactionId, CURRENCY_CAMPAIGN_ID, characterId, expectedRateSetId, rateIdValue,
        rate.from_item_definition_id, sourceQuantity, rate.to_item_definition_id, destinationQuantity,
        quotedFrom, quotedTo, units, userId, now).run();
  } catch (error) {
    throw mapExchangeError(error);
  }
  const state = await getPlayerCurrencyState(env, characterId);
  return {
    transaction: {
      id: transactionId,
      rateSetId: expectedRateSetId,
      rateId: rateIdValue,
      fromItemDefinitionId: rate.from_item_definition_id,
      fromQuantityTotal: sourceQuantity,
      toItemDefinitionId: rate.to_item_definition_id,
      toQuantityTotal: destinationQuantity,
      quotedFromQuantity: quotedFrom,
      quotedToQuantity: quotedTo,
      exchangeUnits: units,
      createdAt: now
    },
    ...state
  };
}
