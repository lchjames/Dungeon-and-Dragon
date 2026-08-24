export const PLAYER_ATTRIBUTE_ORDER = ['STR', 'DEX', 'CON', 'APP', 'POW', 'INT', 'SIZ', 'EDU', 'LUCK'];
export const PRIMARY_ATTRIBUTE_KEYS = ['STR', 'DEX', 'CON', 'APP', 'POW', 'INT', 'SIZ', 'EDU'];
export const PRIMARY_ATTRIBUTE_TOTAL_MIN = 84;
export const PRIMARY_ATTRIBUTE_TOTAL_MAX = 100;
export const CREATION_SKILL_POINTS = 200;
export const CREATION_SKILL_CAP = 30;
export const NATURAL_SKILL_CAP = 98;
export const MAX_LEVEL = 100;
export const STARTING_EXP = 1;

export const BASIC_SKILLS = Object.freeze([
  { key: 'perception', label: '察覺', category: '感知／心智' },
  { key: 'investigation', label: '調查', category: '感知／心智' },
  { key: 'insight', label: '洞察', category: '感知／心智' },
  { key: 'tracking', label: '追蹤', category: '感知／心智' },
  { key: 'general_knowledge', label: '通識', category: '感知／心智' },
  { key: 'concentration', label: '專注', category: '感知／心智' },
  { key: 'athletics', label: '運動', category: '身體／野外' },
  { key: 'acrobatics', label: '身法', category: '身體／野外' },
  { key: 'stealth', label: '潛行', category: '身體／野外' },
  { key: 'survival', label: '生存', category: '身體／野外' },
  { key: 'endurance', label: '耐力', category: '身體／野外' },
  { key: 'persuasion', label: '說服', category: '社交' },
  { key: 'deception', label: '欺瞞', category: '社交' },
  { key: 'intimidation', label: '威嚇', category: '社交' },
  { key: 'negotiation', label: '談判', category: '社交' },
  { key: 'leadership', label: '領導', category: '社交' },
  { key: 'first_aid', label: '急救', category: '實務' },
  { key: 'craft_repair', label: '製作與維修', category: '實務' },
  { key: 'operation', label: '操作', category: '實務' },
  { key: 'navigation', label: '導航', category: '實務' },
  { key: 'research', label: '研究', category: '實務' },
  { key: 'throwing', label: '投擲', category: '通用行動／防禦' },
  { key: 'dodge', label: '閃避', category: '通用行動／防禦' }
]);

function secureUint32() {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0];
}

export function rollDie(sides, randomUint32 = secureUint32) {
  if (!Number.isInteger(sides) || sides < 2) throw new RangeError('Dice sides must be an integer >= 2.');
  const range = 0x100000000;
  const limit = range - (range % sides);
  let value;
  do value = randomUint32(); while (value >= limit);
  return (value % sides) + 1;
}

export function rollDice(count, sides, randomUint32 = secureUint32) {
  let total = 0;
  for (let index = 0; index < count; index += 1) total += rollDie(sides, randomUint32);
  return total;
}

export function primaryAttributeTotal(attributes) {
  return PRIMARY_ATTRIBUTE_KEYS.reduce((sum, key) => sum + Number(attributes?.[key] || 0), 0);
}

export function isValidPrimaryAttributeTotal(total) {
  return Number.isInteger(total) && total >= PRIMARY_ATTRIBUTE_TOTAL_MIN && total <= PRIMARY_ATTRIBUTE_TOTAL_MAX;
}

export function rollPlayerAttributes(randomUint32 = secureUint32) {
  for (let attempt = 0; attempt < 10000; attempt += 1) {
    const attributes = {
      STR: rollDice(3, 6, randomUint32),
      DEX: rollDice(3, 6, randomUint32),
      CON: rollDice(3, 6, randomUint32),
      APP: rollDice(3, 6, randomUint32),
      POW: rollDice(3, 6, randomUint32),
      INT: rollDice(2, 6, randomUint32) + 6,
      SIZ: rollDice(2, 6, randomUint32) + 6,
      EDU: rollDice(3, 6, randomUint32) + 3,
      LUCK: rollDice(3, 6, randomUint32) * 5
    };
    const total = primaryAttributeTotal(attributes);
    if (isValidPrimaryAttributeTotal(total)) return { attributes, primaryTotal: total };
  }
  throw new Error('Unable to generate a valid Character Attribute set.');
}

export function levelGrowthMultiplier(level) {
  const safeLevel = Math.max(1, Math.min(MAX_LEVEL, Math.trunc(Number(level) || 1)));
  return 1 + ((safeLevel - 1) / 21.7) ** 2;
}

export function calculatePlayerResources(attributes, level = 1, hpMaxModifier = 0, mpMaxModifier = 0) {
  const con = Number(attributes?.CON);
  const siz = Number(attributes?.SIZ);
  const int = Number(attributes?.INT);
  if (![con, siz, int].every(Number.isFinite)) throw new TypeError('CON, SIZ and INT are required to calculate HP/MP.');
  const growth = levelGrowthMultiplier(level);
  const baseHP = Math.ceil((con + siz) / 2);
  const baseMP = int * 3;
  const calculatedMaxHP = Math.ceil(baseHP * growth);
  const calculatedMaxMP = Math.floor(baseMP * growth);
  return {
    baseHP,
    baseMP,
    growth,
    calculatedMaxHP,
    calculatedMaxMP,
    finalMaxHP: Math.max(0, calculatedMaxHP + Number(hpMaxModifier || 0)),
    finalMaxMP: Math.max(0, calculatedMaxMP + Number(mpMaxModifier || 0))
  };
}

export function reconcileResourceCurrentOnMaxChange(current, oldMax, newMax) {
  const safeCurrent = Math.max(0, Number(current) || 0);
  const safeOldMax = Math.max(0, Number(oldMax) || 0);
  const safeNewMax = Math.max(0, Number(newMax) || 0);
  if (safeNewMax > safeOldMax) return Math.min(safeNewMax, safeCurrent + (safeNewMax - safeOldMax));
  return Math.min(safeCurrent, safeNewMax);
}

export function expRequiredForNextLevel(level) {
  const safeLevel = Math.max(1, Math.min(MAX_LEVEL - 1, Math.trunc(Number(level) || 1)));
  return 5 * safeLevel * Math.ceil(6 * safeLevel ** 1.5);
}

const LEVEL_THRESHOLDS = (() => {
  const thresholds = [null, STARTING_EXP];
  let total = STARTING_EXP;
  for (let level = 1; level < MAX_LEVEL; level += 1) {
    total += expRequiredForNextLevel(level);
    thresholds[level + 1] = total;
  }
  return Object.freeze(thresholds);
})();

export function expThresholdForLevel(level) {
  const safeLevel = Math.max(1, Math.min(MAX_LEVEL, Math.trunc(Number(level) || 1)));
  return LEVEL_THRESHOLDS[safeLevel];
}

export function levelFromExp(exp) {
  const safeExp = Math.max(STARTING_EXP, Math.trunc(Number(exp) || STARTING_EXP));
  let low = 1;
  let high = MAX_LEVEL;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (LEVEL_THRESHOLDS[mid] <= safeExp) low = mid;
    else high = mid - 1;
  }
  return low;
}

function randomIndex(maxExclusive, randomUint32 = secureUint32) {
  if (!Number.isInteger(maxExclusive) || maxExclusive < 1) throw new RangeError('maxExclusive must be a positive integer.');
  const range = 0x100000000;
  const limit = range - (range % maxExclusive);
  let value;
  do value = randomUint32(); while (value >= limit);
  return value % maxExclusive;
}

export function buildCombatInitiative(combatants, randomUint32 = secureUint32) {
  if (!Array.isArray(combatants) || combatants.length < 1) {
    throw new RangeError('At least one combatant is required.');
  }

  const normalized = combatants.map((combatant, index) => {
    const id = String(combatant?.id || '').trim();
    const dex = Number(combatant?.dex);
    if (!id) throw new RangeError(`Combatant ${index + 1} requires an id.`);
    if (!Number.isFinite(dex)) throw new RangeError(`Combatant ${id} requires a numeric DEX.`);
    return { ...combatant, id, dex };
  });

  if (new Set(normalized.map(combatant => combatant.id)).size !== normalized.length) {
    throw new RangeError('Combatant ids must be unique.');
  }

  const byDex = new Map();
  for (const combatant of normalized) {
    if (!byDex.has(combatant.dex)) byDex.set(combatant.dex, []);
    byDex.get(combatant.dex).push(combatant);
  }

  const ordered = [];
  const dexValues = [...byDex.keys()].sort((left, right) => right - left);
  for (const dex of dexValues) {
    const group = [...byDex.get(dex)];
    for (let index = group.length - 1; index > 0; index -= 1) {
      const swapIndex = randomIndex(index + 1, randomUint32);
      [group[index], group[swapIndex]] = [group[swapIndex], group[index]];
    }
    ordered.push(...group);
  }

  return ordered.map((combatant, initiativeOrder) => ({
    ...combatant,
    initiativeOrder
  }));
}

export function validateCreationSkillAllocations(
  input = {},
  { requireFullSpend = false, requireAllSkills = false } = {}
) {
  const allowed = new Set(BASIC_SKILLS.map(skill => skill.key));
  const allocations = {};
  let spent = 0;
  for (const [key, rawValue] of Object.entries(input || {})) {
    if (!allowed.has(key)) throw new RangeError(`Unknown base skill: ${key}`);
    const value = Number(rawValue);
    if (!Number.isInteger(value) || value < 0 || value > CREATION_SKILL_CAP) {
      throw new RangeError(`Creation allocation for ${key} must be an integer from 0 to ${CREATION_SKILL_CAP}.`);
    }
    allocations[key] = value;
    spent += value;
  }
  if (requireAllSkills) {
    const missing = BASIC_SKILLS.filter(skill => !(skill.key in allocations)).map(skill => skill.key);
    if (missing.length) throw new RangeError(`Missing base skill allocations: ${missing.join(', ')}`);
  }
  if (spent > CREATION_SKILL_POINTS) throw new RangeError(`Creation Skill allocations cannot exceed ${CREATION_SKILL_POINTS}.`);
  if (requireFullSpend && spent !== CREATION_SKILL_POINTS) throw new RangeError(`Creation Skill allocations must total ${CREATION_SKILL_POINTS}.`);
  return { allocations, spent, remaining: CREATION_SKILL_POINTS - spent };
}
