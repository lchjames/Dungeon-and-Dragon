const DB_KEY = 'dnd-platform-v5';
const LEGACY_KEYS = ['dnd-vault-v4', 'vault-v3.2.7a'];

const uid = (prefix='id') =>
  `${prefix}_${globalThis.crypto?.randomUUID?.().slice(0, 8) || Math.random().toString(36).slice(2, 10)}`;

const num = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const text = value => String(value ?? '').trim();

const defaultDb = () => ({
  version: 5,
  settings: {
    campaignName: 'D&D Campaign',
    updatedAt: Date.now()
  },
  players: [],
  characters: [],
  assets: []
});

function normaliseAttribute(raw, index = 0) {
  return {
    id: text(raw?.id) || uid('attr'),
    key: text(raw?.key) || `ATTR_${index + 1}`,
    label: text(raw?.label) || text(raw?.key) || `Attribute ${index + 1}`,
    value: raw?.value ?? 0,
    description: text(raw?.description)
  };
}

function normaliseResource(raw, index = 0) {
  const max = num(raw?.max, 0);
  return {
    id: text(raw?.id) || uid('res'),
    key: text(raw?.key) || `RES_${index + 1}`,
    label: text(raw?.label) || text(raw?.key) || `Resource ${index + 1}`,
    current: num(raw?.current, max),
    max,
    description: text(raw?.description)
  };
}

function normaliseInventory(raw, index = 0) {
  return {
    id: text(raw?.id) || uid('item'),
    name: text(raw?.name) || `Item ${index + 1}`,
    qty: Math.max(0, num(raw?.qty, 1)),
    notes: text(raw?.notes ?? raw?.description)
  };
}

function normaliseAbility(raw, index = 0) {
  return {
    id: text(raw?.id) || uid('ability'),
    name: text(raw?.name) || `Ability ${index + 1}`,
    type: text(raw?.type) || 'Ability',
    description: text(raw?.description ?? raw?.desc),
    proficient: Boolean(raw?.proficient)
  };
}

function normalisePlayer(raw = {}) {
  return {
    id: text(raw.id) || uid('player'),
    displayName: text(raw.displayName ?? raw.name) || 'Unnamed Player',
    status: ['active', 'inactive'].includes(raw.status) ? raw.status : 'active',
    notes: text(raw.notes),
    createdAt: num(raw.createdAt, Date.now())
  };
}

function normaliseCharacter(raw = {}) {
  const attrs = Array.isArray(raw.attributes) ? raw.attributes : [];
  const resources = Array.isArray(raw.resources) ? raw.resources : [];
  const inventory = Array.isArray(raw.inventory) ? raw.inventory : (Array.isArray(raw.items) ? raw.items : []);
  const abilities = Array.isArray(raw.abilities) ? raw.abilities : (Array.isArray(raw.skills) ? raw.skills : []);

  return {
    id: text(raw.id) || uid('char'),
    ownerPlayerId: text(raw.ownerPlayerId) || null,
    name: text(raw.name ?? raw.playercharacter) || 'Unnamed Character',
    role: text(raw.role ?? raw.job),
    level: Math.max(0, num(raw.level, 1)),
    status: ['active', 'inactive', 'retired'].includes(raw.status) ? raw.status : 'active',
    template: text(raw.template) || 'generic',
    portraitAssetId: text(raw.portraitAssetId) || null,
    summary: text(raw.summary),
    attributes: attrs.map(normaliseAttribute),
    resources: resources.map(normaliseResource),
    inventory: inventory.map(normaliseInventory),
    abilities: abilities.map(normaliseAbility),
    notes: text(raw.notes),
    createdAt: num(raw.createdAt, Date.now()),
    updatedAt: num(raw.updatedAt, Date.now())
  };
}

function normaliseAsset(raw = {}) {
  return {
    id: text(raw.id) || uid('asset'),
    name: text(raw.name) || 'Asset',
    type: text(raw.type) || 'image',
    url: text(raw.url),
    dataUrl: text(raw.dataUrl),
    createdAt: num(raw.createdAt, Date.now())
  };
}

function migrateLegacy(raw) {
  const db = defaultDb();
  const sourceCharacters = Array.isArray(raw?.characters) ? raw.characters : [];
  const playerByName = new Map();

  const ensurePlayer = name => {
    const clean = text(name);
    if (!clean) return null;
    const key = clean.toLocaleLowerCase();
    if (playerByName.has(key)) return playerByName.get(key);
    const player = normalisePlayer({ displayName: clean });
    db.players.push(player);
    playerByName.set(key, player.id);
    return player.id;
  };

  const statLabels = {
    str: 'STR', dex: 'DEX', con: 'CON', app: 'APP',
    pow: 'POW', int: 'INT', siz: 'SIZ', edu: 'EDU',
    san: 'SAN', idea: 'IDEA', luck: 'LUCK', know: 'KNOW'
  };

  for (const legacy of sourceCharacters) {
    const ownerPlayerId = ensurePlayer(legacy.player ?? legacy.playername ?? legacy.pl);
    const stats = legacy.stats && typeof legacy.stats === 'object' ? legacy.stats : {};
    const attributes = Object.entries(statLabels)
      .filter(([key]) => stats[key] !== undefined || legacy[key] !== undefined || legacy[key.toUpperCase()] !== undefined)
      .map(([key, label]) => ({
        id: uid('attr'),
        key: label,
        label,
        value: stats[key] ?? legacy[key] ?? legacy[key.toUpperCase()] ?? 0,
        description: ''
      }));

    db.characters.push(normaliseCharacter({
      id: legacy.id,
      ownerPlayerId,
      name: legacy.name ?? legacy.playercharacter,
      role: legacy.role ?? legacy.job,
      level: legacy.level ?? 1,
      status: legacy.status ?? 'active',
      summary: legacy.summary ?? [legacy.align, legacy.gender, legacy.age ? `Age ${legacy.age}` : ''].filter(Boolean).join(' · '),
      attributes,
      resources: legacy.resources ?? [],
      inventory: legacy.inventory ?? legacy.items ?? [],
      abilities: legacy.abilities ?? legacy.skills ?? [],
      notes: legacy.notes ?? ''
    }));
  }

  const sourceMedia = Array.isArray(raw?.media) ? raw.media : [];
  db.assets = sourceMedia.map(normaliseAsset);
  return db;
}

function normaliseDb(raw) {
  if (!raw || typeof raw !== 'object') return defaultDb();
  if (raw.version !== 5) return migrateLegacy(raw);

  return {
    version: 5,
    settings: {
      campaignName: text(raw.settings?.campaignName) || 'D&D Campaign',
      updatedAt: num(raw.settings?.updatedAt, Date.now())
    },
    players: Array.isArray(raw.players) ? raw.players.map(normalisePlayer) : [],
    characters: Array.isArray(raw.characters) ? raw.characters.map(normaliseCharacter) : [],
    assets: Array.isArray(raw.assets) ? raw.assets.map(normaliseAsset) : []
  };
}

function loadInitialDb() {
  try {
    const current = localStorage.getItem(DB_KEY);
    if (current) return normaliseDb(JSON.parse(current));

    for (const key of LEGACY_KEYS) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const migrated = normaliseDb(JSON.parse(raw));
      localStorage.setItem(DB_KEY, JSON.stringify(migrated));
      return migrated;
    }
  } catch (error) {
    console.error('Unable to load local data', error);
  }
  return defaultDb();
}

let db = loadInitialDb();

function persist() {
  db.settings.updatedAt = Date.now();
  localStorage.setItem(DB_KEY, JSON.stringify(db));
  window.dispatchEvent(new CustomEvent('dnd:datachange', { detail: snapshot() }));
}

function snapshot() {
  return structuredClone(db);
}

function mutate(fn) {
  const draft = snapshot();
  fn(draft);
  db = normaliseDb(draft);
  persist();
  return snapshot();
}

function findPlayer(id) {
  return db.players.find(player => player.id === id) || null;
}

function findCharacter(id) {
  return db.characters.find(character => character.id === id) || null;
}

function createPlayer(input) {
  const player = normalisePlayer(input);
  mutate(draft => draft.players.push(player));
  return player;
}

function updatePlayer(id, patch) {
  mutate(draft => {
    const index = draft.players.findIndex(player => player.id === id);
    if (index < 0) return;
    draft.players[index] = normalisePlayer({ ...draft.players[index], ...patch, id });
  });
}

function deletePlayer(id, { unassignCharacters = true } = {}) {
  mutate(draft => {
    draft.players = draft.players.filter(player => player.id !== id);
    if (unassignCharacters) {
      draft.characters = draft.characters.map(character =>
        character.ownerPlayerId === id ? { ...character, ownerPlayerId: null, updatedAt: Date.now() } : character
      );
    }
  });
}

function createCharacter(input) {
  const character = normaliseCharacter({ ...input, id: input?.id || uid('char') });
  mutate(draft => draft.characters.push(character));
  return character;
}

function updateCharacter(id, patch) {
  mutate(draft => {
    const index = draft.characters.findIndex(character => character.id === id);
    if (index < 0) return;
    draft.characters[index] = normaliseCharacter({
      ...draft.characters[index],
      ...patch,
      id,
      updatedAt: Date.now()
    });
  });
}

function deleteCharacter(id) {
  mutate(draft => {
    draft.characters = draft.characters.filter(character => character.id !== id);
  });
}

function createAsset(input) {
  const asset = normaliseAsset(input);
  mutate(draft => draft.assets.push(asset));
  return asset;
}

function deleteAsset(id) {
  mutate(draft => {
    draft.assets = draft.assets.filter(asset => asset.id !== id);
    draft.characters = draft.characters.map(character =>
      character.portraitAssetId === id ? { ...character, portraitAssetId: null } : character
    );
  });
}

function updateSettings(patch) {
  mutate(draft => {
    draft.settings = { ...draft.settings, ...patch };
  });
}

function replaceDb(next) {
  db = normaliseDb(next);
  persist();
}

function resetDb() {
  db = defaultDb();
  persist();
}

function exportJson() {
  return JSON.stringify(snapshot(), null, 2);
}

function importJson(textValue) {
  const parsed = JSON.parse(textValue);
  replaceDb(parsed);
  return snapshot();
}

window.addEventListener('storage', event => {
  if (event.key !== DB_KEY || !event.newValue) return;
  try {
    db = normaliseDb(JSON.parse(event.newValue));
    window.dispatchEvent(new CustomEvent('dnd:datachange', { detail: snapshot() }));
  } catch (error) {
    console.warn('Ignored invalid cross-tab data', error);
  }
});

export const Store = {
  key: DB_KEY,
  snapshot,
  mutate,
  findPlayer,
  findCharacter,
  createPlayer,
  updatePlayer,
  deletePlayer,
  createCharacter,
  updateCharacter,
  deleteCharacter,
  createAsset,
  deleteAsset,
  updateSettings,
  replaceDb,
  resetDb,
  exportJson,
  importJson
};

export const Model = {
  uid,
  normalisePlayer,
  normaliseCharacter,
  normaliseAttribute,
  normaliseResource,
  normaliseInventory,
  normaliseAbility,
  normaliseAsset
};
