const ITEM_TYPES = new Set(['WEAPON', 'ARMOUR', 'ITEM']);
let inventorySchemaPromise = null;
let profileSourceReady = false;

function fail(message, status = 400, code = 'INVENTORY_VALIDATION_ERROR') {
  throw Object.assign(new Error(message), { status, code });
}

function text(value, max = 240) {
  return String(value ?? '').trim().normalize('NFKC').slice(0, max);
}

function jsonText(value, fallback = {}) {
  if (value === undefined || value === null || value === '') return JSON.stringify(fallback);
  if (typeof value === 'string') {
    try { return JSON.stringify(JSON.parse(value)); }
    catch { return JSON.stringify({ value }); }
  }
  return JSON.stringify(value);
}

async function tableExists(env, name) {
  const row = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1").bind(name).first();
  return Boolean(row);
}

async function tableColumns(env, name) {
  const rows = await env.DB.prepare(`PRAGMA table_info(${name})`).all();
  return new Set((rows.results || []).map(row => String(row.name)));
}

async function addMissingColumns(env, table, definitions) {
  const columns = await tableColumns(env, table);
  for (const [name, definition] of Object.entries(definitions)) {
    if (columns.has(name)) continue;
    await env.DB.prepare(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`).run();
    columns.add(name);
  }
  return columns;
}

export async function ensureInventoryWeaponAuthority(env) {
  if (!env.DB) throw new Error('D1 binding DB is unavailable.');
  if (!inventorySchemaPromise) {
    inventorySchemaPromise = (async () => {
      await env.DB.batch([
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS item_definitions (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          item_type TEXT NOT NULL CHECK (item_type IN ('WEAPON','ARMOUR','ITEM')),
          item_subtype TEXT,
          description TEXT NOT NULL DEFAULT '',
          stackable INTEGER NOT NULL DEFAULT 0,
          max_stack INTEGER,
          tradeable INTEGER NOT NULL DEFAULT 1,
          active INTEGER NOT NULL DEFAULT 1,
          image_ref TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          metadata TEXT NOT NULL DEFAULT '{}'
        )`),
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS weapon_definitions (
          item_definition_id TEXT PRIMARY KEY,
          weapon_group TEXT,
          linked_skill_id TEXT,
          damage_formula TEXT,
          damage_type TEXT,
          range_value REAL,
          attacks_per_round INTEGER,
          hit_modifier REAL NOT NULL DEFAULT 0,
          resource_cost TEXT,
          properties TEXT NOT NULL DEFAULT '{}',
          FOREIGN KEY (item_definition_id) REFERENCES item_definitions(id) ON DELETE CASCADE
        )`),
        env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_item_definitions_type_active ON item_definitions(item_type, active, name)'),
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS character_inventory_log (
          id TEXT PRIMARY KEY,
          character_id TEXT NOT NULL,
          inventory_id TEXT NOT NULL,
          item_definition_id TEXT NOT NULL,
          change_type TEXT NOT NULL,
          from_quantity INTEGER,
          to_quantity INTEGER,
          from_equipped INTEGER,
          to_equipped INTEGER,
          actor_user_id TEXT NOT NULL,
          actor_role TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
          FOREIGN KEY (item_definition_id) REFERENCES item_definitions(id) ON DELETE RESTRICT,
          FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE RESTRICT
        )`),
        env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_character_inventory_log_character ON character_inventory_log(character_id, created_at)')
      ]);

      if (!(await tableExists(env, 'character_inventory'))) {
        throw Object.assign(new Error('Canonical Character Inventory base table is unavailable.'), { code: 'CHARACTER_INVENTORY_BASE_MISSING' });
      }

      await addMissingColumns(env, 'character_inventory', {
        item_definition_id: 'TEXT',
        quantity: 'INTEGER',
        is_equipped: 'INTEGER NOT NULL DEFAULT 0',
        equip_slot: 'TEXT',
        custom_name: 'TEXT',
        custom_description: 'TEXT',
        condition_value: 'REAL',
        acquired_at: 'INTEGER',
        source: 'TEXT',
        revision: 'INTEGER',
        instance_metadata: "TEXT NOT NULL DEFAULT '{}'"
      });

      const invalid = await env.DB.prepare(`
        SELECT COUNT(*) AS count
        FROM character_inventory
        WHERE item_definition_id IS NULL
          AND (qty < 0 OR qty != CAST(qty AS INTEGER))
      `).first();
      if (Number(invalid?.count || 0) > 0) {
        throw Object.assign(new Error('Legacy Inventory contains negative or fractional quantity and cannot be silently converted.'), {
          code: 'INVENTORY_LEGACY_QUANTITY_INVALID'
        });
      }

      const now = Date.now();
      await env.DB.batch([
        env.DB.prepare(`
          INSERT OR IGNORE INTO item_definitions (
            id, name, item_type, item_subtype, description, stackable, max_stack,
            tradeable, active, image_ref, created_at, updated_at, metadata
          )
          SELECT 'legacy_item_' || id, name, 'ITEM', 'OTHER', notes,
                 1, NULL, 1, 1, NULL, ?, ?, '{"source":"legacy_character_inventory"}'
          FROM character_inventory
          WHERE item_definition_id IS NULL
        `).bind(now, now),
        env.DB.prepare(`
          UPDATE character_inventory
          SET item_definition_id = 'legacy_item_' || id,
              quantity = CAST(qty AS INTEGER),
              is_equipped = 0,
              equip_slot = NULL,
              custom_description = CASE WHEN notes = '' THEN NULL ELSE notes END,
              acquired_at = COALESCE(acquired_at, 0),
              source = COALESCE(source, 'legacy_migration'),
              revision = COALESCE(revision, 1),
              instance_metadata = COALESCE(instance_metadata, '{}')
          WHERE item_definition_id IS NULL
        `),
        env.DB.prepare(`
          UPDATE character_inventory
          SET quantity = COALESCE(quantity, CAST(qty AS INTEGER)),
              qty = COALESCE(quantity, CAST(qty AS INTEGER)),
              revision = COALESCE(revision, 1),
              acquired_at = COALESCE(acquired_at, 0),
              source = COALESCE(source, 'inventory'),
              instance_metadata = COALESCE(instance_metadata, '{}')
          WHERE item_definition_id IS NOT NULL
        `),
        env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_character_inventory_definition ON character_inventory(item_definition_id, character_id)'),
        env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_character_inventory_equipped ON character_inventory(character_id, is_equipped, equip_slot)')
      ]);
    })().catch(error => {
      inventorySchemaPromise = null;
      throw error;
    });
  }
  await inventorySchemaPromise;
}

export async function ensurePlayerAttackProfileSourceColumn(env) {
  await ensureInventoryWeaponAuthority(env);
  if (profileSourceReady) return true;
  if (!(await tableExists(env, 'player_attack_profiles'))) return false;
  const columns = await tableColumns(env, 'player_attack_profiles');
  if (!columns.has('source_inventory_id')) {
    await env.DB.prepare('ALTER TABLE player_attack_profiles ADD COLUMN source_inventory_id TEXT').run();
  }
  await env.DB.batch([
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_player_attack_profiles_source_inventory ON player_attack_profiles(source_inventory_id, character_id, is_active)'),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS player_attack_profile_source_log (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL,
      character_id TEXT NOT NULL,
      from_inventory_id TEXT,
      to_inventory_id TEXT,
      changed_by_user_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (profile_id) REFERENCES player_attack_profiles(id) ON DELETE CASCADE,
      FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
      FOREIGN KEY (changed_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
    )`),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_player_attack_profile_source_log_profile ON player_attack_profile_source_log(profile_id, created_at)')
  ]);
  profileSourceReady = true;
  return true;
}

function mapInventoryRow(row) {
  return {
    id: row.id,
    characterId: row.character_id,
    itemDefinitionId: row.item_definition_id,
    name: row.custom_name || row.definition_name || row.name || 'Item',
    description: row.custom_description || row.definition_description || row.notes || '',
    notes: row.custom_description || row.definition_description || row.notes || '',
    quantity: Number(row.quantity ?? row.qty ?? 0),
    qty: Number(row.quantity ?? row.qty ?? 0),
    isEquipped: Boolean(row.is_equipped),
    equipSlot: row.equip_slot || null,
    conditionValue: row.condition_value === null || row.condition_value === undefined ? null : Number(row.condition_value),
    acquiredAt: row.acquired_at ?? null,
    source: row.source || '',
    revision: Number(row.revision || 1),
    itemType: row.item_type || 'ITEM',
    itemSubtype: row.item_subtype || null,
    active: row.definition_active === undefined ? true : Boolean(row.definition_active),
    stackable: row.stackable === undefined ? true : Boolean(row.stackable),
    tradeable: row.tradeable === undefined ? true : Boolean(row.tradeable),
    weapon: row.item_type === 'WEAPON' ? {
      weaponGroup: row.weapon_group || null,
      linkedSkillId: row.linked_skill_id || null,
      damageFormula: row.damage_formula || null,
      damageType: row.damage_type || null,
      rangeValue: row.range_value === null || row.range_value === undefined ? null : Number(row.range_value),
      attacksPerRound: row.attacks_per_round === null || row.attacks_per_round === undefined ? null : Number(row.attacks_per_round),
      hitModifier: Number(row.hit_modifier || 0),
      resourceCost: row.resource_cost || null,
      properties: row.weapon_properties || '{}'
    } : null
  };
}

const INVENTORY_SELECT = `
  SELECT ci.*,
         d.name AS definition_name, d.description AS definition_description,
         d.item_type, d.item_subtype, d.stackable, d.tradeable, d.active AS definition_active,
         w.weapon_group, w.linked_skill_id, w.damage_formula, w.damage_type,
         w.range_value, w.attacks_per_round, w.hit_modifier, w.resource_cost,
         w.properties AS weapon_properties
  FROM character_inventory ci
  JOIN item_definitions d ON d.id = ci.item_definition_id
  LEFT JOIN weapon_definitions w ON w.item_definition_id = d.id
`;

export async function listCharacterInventory(env, characterId) {
  await ensureInventoryWeaponAuthority(env);
  const rows = await env.DB.prepare(`${INVENTORY_SELECT}
    WHERE ci.character_id = ?
    ORDER BY ci.is_equipped DESC, ci.sort_order, d.name COLLATE NOCASE, ci.id
  `).bind(characterId).all();
  return (rows.results || []).map(mapInventoryRow);
}

export async function loadInventoryEntry(env, characterId, inventoryId) {
  await ensureInventoryWeaponAuthority(env);
  const row = await env.DB.prepare(`${INVENTORY_SELECT}
    WHERE ci.character_id = ? AND ci.id = ? LIMIT 1
  `).bind(characterId, inventoryId).first();
  return row ? mapInventoryRow(row) : null;
}

function mapDefinition(row) {
  return {
    id: row.id,
    name: row.name,
    itemType: row.item_type,
    itemSubtype: row.item_subtype || null,
    description: row.description || '',
    stackable: Boolean(row.stackable),
    maxStack: row.max_stack === null || row.max_stack === undefined ? null : Number(row.max_stack),
    tradeable: Boolean(row.tradeable),
    active: Boolean(row.active),
    imageRef: row.image_ref || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    weapon: row.item_type === 'WEAPON' ? {
      weaponGroup: row.weapon_group || null,
      linkedSkillId: row.linked_skill_id || null,
      damageFormula: row.damage_formula || null,
      damageType: row.damage_type || null,
      rangeValue: row.range_value === null || row.range_value === undefined ? null : Number(row.range_value),
      attacksPerRound: row.attacks_per_round === null || row.attacks_per_round === undefined ? null : Number(row.attacks_per_round),
      hitModifier: Number(row.hit_modifier || 0),
      resourceCost: row.resource_cost || null,
      properties: row.weapon_properties || '{}'
    } : null
  };
}

export async function listWeaponDefinitions(env, { includeInactive = false } = {}) {
  await ensureInventoryWeaponAuthority(env);
  const rows = await env.DB.prepare(`
    SELECT d.*, w.weapon_group, w.linked_skill_id, w.damage_formula, w.damage_type,
           w.range_value, w.attacks_per_round, w.hit_modifier, w.resource_cost,
           w.properties AS weapon_properties
    FROM item_definitions d
    JOIN weapon_definitions w ON w.item_definition_id = d.id
    WHERE d.item_type = 'WEAPON' ${includeInactive ? '' : 'AND d.active = 1'}
    ORDER BY d.active DESC, d.name COLLATE NOCASE, d.created_at
  `).all();
  return (rows.results || []).map(mapDefinition);
}

export function normalizeWeaponDefinition(body = {}) {
  const name = text(body.name, 120);
  if (!name) fail('Weapon name is required.');
  const description = text(body.description, 2000);
  const weapon = body.weapon && typeof body.weapon === 'object' ? body.weapon : body;
  const weaponGroup = text(weapon.weaponGroup, 80) || null;
  const linkedSkillId = text(weapon.linkedSkillId, 180) || null;
  const damageFormula = text(weapon.damageFormula, 120) || null;
  const damageType = text(weapon.damageType, 80) || null;
  const rangeValue = weapon.rangeValue === '' || weapon.rangeValue === null || weapon.rangeValue === undefined ? null : Number(weapon.rangeValue);
  const attacksPerRound = weapon.attacksPerRound === '' || weapon.attacksPerRound === null || weapon.attacksPerRound === undefined ? null : Number(weapon.attacksPerRound);
  const hitModifier = weapon.hitModifier === '' || weapon.hitModifier === null || weapon.hitModifier === undefined ? 0 : Number(weapon.hitModifier);
  if (rangeValue !== null && (!Number.isFinite(rangeValue) || rangeValue < 0 || rangeValue > 100000)) fail('Weapon range must be a non-negative number.');
  if (attacksPerRound !== null && (!Number.isInteger(attacksPerRound) || attacksPerRound < 1 || attacksPerRound > 20)) fail('Attacks per round must be an integer from 1 to 20.');
  if (!Number.isFinite(hitModifier) || hitModifier < -1000 || hitModifier > 1000) fail('Weapon hit modifier is invalid.');
  return {
    name,
    description,
    active: body.active !== false,
    tradeable: body.tradeable !== false,
    weaponGroup,
    linkedSkillId,
    damageFormula,
    damageType,
    rangeValue,
    attacksPerRound,
    hitModifier,
    resourceCost: jsonText(weapon.resourceCost, {}),
    properties: jsonText(weapon.properties, {}),
    metadata: jsonText(body.metadata, {})
  };
}

export async function createWeaponDefinition(env, body, actorUserId) {
  await ensureInventoryWeaponAuthority(env);
  const value = normalizeWeaponDefinition(body);
  const id = `item_${crypto.randomUUID()}`;
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO item_definitions (
        id, name, item_type, item_subtype, description, stackable, max_stack,
        tradeable, active, image_ref, created_at, updated_at, metadata
      ) VALUES (?, ?, 'WEAPON', NULL, ?, 0, 1, ?, ?, NULL, ?, ?, ?)
    `).bind(id, value.name, value.description, value.tradeable ? 1 : 0, value.active ? 1 : 0, now, now, value.metadata),
    env.DB.prepare(`
      INSERT INTO weapon_definitions (
        item_definition_id, weapon_group, linked_skill_id, damage_formula, damage_type,
        range_value, attacks_per_round, hit_modifier, resource_cost, properties
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, value.weaponGroup, value.linkedSkillId, value.damageFormula, value.damageType,
      value.rangeValue, value.attacksPerRound, value.hitModifier, value.resourceCost, value.properties)
  ]);
  return (await listWeaponDefinitions(env, { includeInactive: true })).find(item => item.id === id) || null;
}

export async function updateWeaponDefinition(env, itemId, body) {
  await ensureInventoryWeaponAuthority(env);
  const existing = await env.DB.prepare(`
    SELECT d.*, w.weapon_group, w.linked_skill_id, w.damage_formula, w.damage_type,
           w.range_value, w.attacks_per_round, w.hit_modifier, w.resource_cost,
           w.properties AS weapon_properties
    FROM item_definitions d JOIN weapon_definitions w ON w.item_definition_id = d.id
    WHERE d.id = ? AND d.item_type = 'WEAPON' LIMIT 1
  `).bind(itemId).first();
  if (!existing) fail('Weapon Definition not found.', 404, 'WEAPON_DEFINITION_NOT_FOUND');
  const value = normalizeWeaponDefinition({
    name: body.name ?? existing.name,
    description: body.description ?? existing.description,
    active: body.active ?? Boolean(existing.active),
    tradeable: body.tradeable ?? Boolean(existing.tradeable),
    metadata: body.metadata ?? existing.metadata,
    weapon: {
      weaponGroup: body.weapon?.weaponGroup ?? body.weaponGroup ?? existing.weapon_group,
      linkedSkillId: body.weapon?.linkedSkillId ?? body.linkedSkillId ?? existing.linked_skill_id,
      damageFormula: body.weapon?.damageFormula ?? body.damageFormula ?? existing.damage_formula,
      damageType: body.weapon?.damageType ?? body.damageType ?? existing.damage_type,
      rangeValue: body.weapon?.rangeValue ?? body.rangeValue ?? existing.range_value,
      attacksPerRound: body.weapon?.attacksPerRound ?? body.attacksPerRound ?? existing.attacks_per_round,
      hitModifier: body.weapon?.hitModifier ?? body.hitModifier ?? existing.hit_modifier,
      resourceCost: body.weapon?.resourceCost ?? body.resourceCost ?? existing.resource_cost,
      properties: body.weapon?.properties ?? body.properties ?? existing.weapon_properties
    }
  });
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(`UPDATE item_definitions
      SET name = ?, description = ?, tradeable = ?, active = ?, updated_at = ?, metadata = ?
      WHERE id = ? AND item_type = 'WEAPON'`)
      .bind(value.name, value.description, value.tradeable ? 1 : 0, value.active ? 1 : 0, now, value.metadata, itemId),
    env.DB.prepare(`UPDATE weapon_definitions
      SET weapon_group = ?, linked_skill_id = ?, damage_formula = ?, damage_type = ?,
          range_value = ?, attacks_per_round = ?, hit_modifier = ?, resource_cost = ?, properties = ?
      WHERE item_definition_id = ?`)
      .bind(value.weaponGroup, value.linkedSkillId, value.damageFormula, value.damageType,
        value.rangeValue, value.attacksPerRound, value.hitModifier, value.resourceCost, value.properties, itemId),
    env.DB.prepare(`UPDATE character_inventory SET name = ?, updated_at = COALESCE(updated_at, ?)
      WHERE item_definition_id = ? AND custom_name IS NULL`).bind(value.name, now, itemId)
  ]).catch(async error => {
    // Older compatibility tables do not have updated_at. Retry the display mirror only.
    if (!String(error?.message || error).includes('updated_at')) throw error;
    await env.DB.prepare('UPDATE character_inventory SET name = ? WHERE item_definition_id = ? AND custom_name IS NULL').bind(value.name, itemId).run();
  });
  return (await listWeaponDefinitions(env, { includeInactive: true })).find(item => item.id === itemId) || null;
}

async function inventoryAudit(env, { characterId, inventoryId, itemDefinitionId, changeType, fromQuantity, toQuantity, fromEquipped, toEquipped, actorUserId, actorRole }) {
  await env.DB.prepare(`
    INSERT INTO character_inventory_log (
      id, character_id, inventory_id, item_definition_id, change_type,
      from_quantity, to_quantity, from_equipped, to_equipped,
      actor_user_id, actor_role, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(`invlog_${crypto.randomUUID()}`, characterId, inventoryId, itemDefinitionId, changeType,
    fromQuantity, toQuantity, fromEquipped ? 1 : 0, toEquipped ? 1 : 0,
    actorUserId, actorRole, Date.now()).run();
}

export async function grantWeaponToCharacter(env, characterId, itemDefinitionId, actor) {
  await ensureInventoryWeaponAuthority(env);
  const definition = (await listWeaponDefinitions(env, { includeInactive: false })).find(item => item.id === itemDefinitionId);
  if (!definition) fail('Active Weapon Definition not found.', 404, 'WEAPON_DEFINITION_NOT_FOUND');
  const inventoryId = `inv_${crypto.randomUUID()}`;
  const now = Date.now();
  await env.DB.prepare(`
    INSERT INTO character_inventory (
      id, character_id, sort_order, name, qty, notes,
      item_definition_id, quantity, is_equipped, equip_slot,
      custom_name, custom_description, condition_value, acquired_at,
      source, revision, instance_metadata
    ) VALUES (?, ?, 0, ?, 1, '', ?, 1, 0, NULL, NULL, NULL, NULL, ?, ?, 1, '{}')
  `).bind(inventoryId, characterId, definition.name, itemDefinitionId, now, `gm:${actor.id}`).run();
  await inventoryAudit(env, {
    characterId, inventoryId, itemDefinitionId, changeType: 'grant',
    fromQuantity: 0, toQuantity: 1, fromEquipped: false, toEquipped: false,
    actorUserId: actor.id, actorRole: actor.role || 'gm'
  });
  return loadInventoryEntry(env, characterId, inventoryId);
}

export async function updateInventoryEntry(env, characterId, inventoryId, body, actor) {
  const existing = await loadInventoryEntry(env, characterId, inventoryId);
  if (!existing) fail('Inventory entry not found.', 404, 'INVENTORY_ENTRY_NOT_FOUND');
  const expectedRevision = body.revision === undefined || body.revision === null ? null : Number(body.revision);
  if (expectedRevision !== null && (!Number.isInteger(expectedRevision) || expectedRevision !== existing.revision)) {
    fail('Inventory state changed; reload before saving.', 409, 'INVENTORY_REVISION_CHANGED');
  }

  let quantity = body.quantity === undefined && body.qty === undefined ? existing.quantity : Number(body.quantity ?? body.qty);
  if (!Number.isInteger(quantity) || quantity < 0) fail('Inventory quantity must be a non-negative integer.');
  let equipped = body.isEquipped === undefined ? existing.isEquipped : Boolean(body.isEquipped);

  if (existing.itemType === 'WEAPON') {
    if (quantity !== 1) fail('Weapon inventory entries use quantity 1 in Alpha.', 409, 'WEAPON_QUANTITY_FIXED');
  } else if (!existing.stackable && quantity > 1) {
    fail('This Item is not stackable.', 409, 'ITEM_NOT_STACKABLE');
  }
  if (equipped && existing.itemType !== 'WEAPON') fail('Only Weapon equipment is enabled in this Alpha slice.', 409, 'ITEM_EQUIP_NOT_SUPPORTED');
  if (equipped && (!existing.active || quantity < 1)) fail('Inactive or empty Item cannot be equipped.', 409, 'ITEM_NOT_EQUIPPABLE');
  if (quantity === 0) equipped = false;

  const nextRevision = existing.revision + 1;
  const result = await env.DB.prepare(`
    UPDATE character_inventory
    SET quantity = ?, qty = ?, is_equipped = ?, equip_slot = ?, revision = ?
    WHERE id = ? AND character_id = ? AND revision = ?
  `).bind(quantity, quantity, equipped ? 1 : 0, equipped ? 'weapon' : null, nextRevision,
    inventoryId, characterId, existing.revision).run();
  if (Number(result?.meta?.changes || 0) !== 1) fail('Inventory state changed; reload before saving.', 409, 'INVENTORY_REVISION_CHANGED');

  await inventoryAudit(env, {
    characterId, inventoryId, itemDefinitionId: existing.itemDefinitionId,
    changeType: existing.isEquipped !== equipped ? (equipped ? 'equip' : 'unequip') : 'quantity',
    fromQuantity: existing.quantity, toQuantity: quantity,
    fromEquipped: existing.isEquipped, toEquipped: equipped,
    actorUserId: actor.id, actorRole: actor.role || 'player'
  });
  return loadInventoryEntry(env, characterId, inventoryId);
}

export async function profileSourceStatus(env, profileId, characterId) {
  const ready = await ensurePlayerAttackProfileSourceColumn(env);
  if (!ready) return { profileExists: false, sourceInventoryId: null, available: false, reason: 'profile_schema_unavailable', source: null };
  const row = await env.DB.prepare(`
    SELECT p.id, p.source_inventory_id,
           ci.id AS inventory_id, ci.character_id AS inventory_character_id,
           ci.quantity, ci.is_equipped,
           d.id AS item_definition_id, d.name AS definition_name,
           d.item_type, d.active AS definition_active
    FROM player_attack_profiles p
    LEFT JOIN character_inventory ci ON ci.id = p.source_inventory_id
    LEFT JOIN item_definitions d ON d.id = ci.item_definition_id
    WHERE p.id = ? AND p.character_id = ?
    LIMIT 1
  `).bind(profileId, characterId).first();
  if (!row) return { profileExists: false, sourceInventoryId: null, available: false, reason: 'profile_not_found', source: null };
  if (!row.source_inventory_id) return { profileExists: true, sourceInventoryId: null, available: true, reason: 'legacy_bridge', source: null };
  const source = {
    inventoryId: row.inventory_id || row.source_inventory_id,
    itemDefinitionId: row.item_definition_id || null,
    name: row.definition_name || 'Weapon',
    quantity: Number(row.quantity || 0),
    isEquipped: Boolean(row.is_equipped),
    active: Boolean(row.definition_active)
  };
  const available = Boolean(
    row.inventory_id && row.inventory_character_id === characterId &&
    row.item_type === 'WEAPON' && Number(row.quantity) === 1 &&
    Number(row.is_equipped) === 1 && Number(row.definition_active) === 1
  );
  return {
    profileExists: true,
    sourceInventoryId: row.source_inventory_id,
    available,
    reason: available ? 'equipped_weapon' : 'weapon_not_equipped_or_unavailable',
    source
  };
}

export async function setProfileSourceInventory(env, profileId, characterId, sourceInventoryId, actorUserId) {
  const ready = await ensurePlayerAttackProfileSourceColumn(env);
  if (!ready) fail('Attack Profile authority is unavailable.', 409, 'ATTACK_PROFILE_SCHEMA_UNAVAILABLE');
  const profile = await env.DB.prepare('SELECT id, character_id, source_inventory_id FROM player_attack_profiles WHERE id = ? AND character_id = ? LIMIT 1')
    .bind(profileId, characterId).first();
  if (!profile) fail('Attack Profile not found.', 404, 'ATTACK_PROFILE_NOT_FOUND');

  const nextId = text(sourceInventoryId, 220) || null;
  if (nextId) {
    const source = await loadInventoryEntry(env, characterId, nextId);
    if (!source || source.itemType !== 'WEAPON' || source.quantity !== 1 || !source.active) {
      fail('Attack Profile source must be an active owned Weapon.', 409, 'ATTACK_PROFILE_WEAPON_SOURCE_INVALID');
    }
  }
  const previous = profile.source_inventory_id || null;
  if (previous === nextId) return profileSourceStatus(env, profileId, characterId);
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare('UPDATE player_attack_profiles SET source_inventory_id = ?, updated_at = ? WHERE id = ? AND character_id = ?')
      .bind(nextId, now, profileId, characterId),
    env.DB.prepare(`INSERT INTO player_attack_profile_source_log (
      id, profile_id, character_id, from_inventory_id, to_inventory_id, changed_by_user_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(`apsrc_${crypto.randomUUID()}`, profileId, characterId, previous, nextId, actorUserId, now)
  ]);
  return profileSourceStatus(env, profileId, characterId);
}

export async function enrichProfilesWithWeaponSource(env, characterId, profiles = [], { onlyAvailable = false } = {}) {
  const out = [];
  for (const profile of profiles) {
    const status = await profileSourceStatus(env, profile.id, characterId);
    if (onlyAvailable && !status.available) continue;
    out.push({
      ...profile,
      sourceInventoryId: status.sourceInventoryId,
      sourceType: status.sourceInventoryId ? 'weapon' : 'legacy_bridge',
      sourceAvailable: status.available,
      sourceWeapon: status.source
    });
  }
  return out;
}
