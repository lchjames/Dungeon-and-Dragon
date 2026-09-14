export const ABILITY_ATTRIBUTE_TYPES = Object.freeze(['PHYSICAL', 'LIGHT', 'DARK', 'FIRE', 'WATER', 'WIND', 'EARTH', 'LIGHTNING', 'WOOD']);
export const MAGIC_ABILITY_ATTRIBUTE_TYPES = Object.freeze(['LIGHT', 'DARK', 'FIRE', 'WATER', 'WIND', 'EARTH', 'LIGHTNING', 'WOOD']);
export const ABILITY_DEFAULT_MP_COSTS = Object.freeze({ '1': 1, '2': 5, '3': 10, '4': 20, '5': 40, '6': 80, '7': 160, '8': 320, '9': 640 });
const ATTRIBUTE_SET = new Set(ABILITY_ATTRIBUTE_TYPES);
const RANK_CODES = new Set(['1','2','3','4','5','6','7','8','9','SPECIAL']);
const TARGET_PATTERNS = new Set(['SELF','SINGLE','MULTI_TARGET','AREA','LINE','CONE']);

export function abilityRuleError(message, code = 'ABILITY_VALIDATION_ERROR') {
  return Object.assign(new Error(message), { status: 400, code });
}

export function parseObject(value, fallback = {}) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value || '{}'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function defaultAbilityMpCost(rankCode) {
  const key = String(rankCode ?? '').trim().toUpperCase();
  return Object.prototype.hasOwnProperty.call(ABILITY_DEFAULT_MP_COSTS, key) ? ABILITY_DEFAULT_MP_COSTS[key] : null;
}

export function normalizeAbilityMpCost(value, { required = false } = {}) {
  if (value === null || value === undefined || String(value).trim() === '') {
    if (required) throw abilityRuleError('Approved Ability MP cost is required.', 'ABILITY_MP_COST_REQUIRED');
    return null;
  }
  const cost = Number(value);
  if (!Number.isSafeInteger(cost) || cost < 1) {
    throw abilityRuleError('Ability MP cost must be a positive integer.', 'ABILITY_MP_COST_INVALID');
  }
  return cost;
}

export function resolveAbilityResourceAffordability(definition, currentMp = null, maxMp = null) {
  const mpCost = normalizeAbilityMpCost(definition?.mpCost, { required: false });
  const referenceMpCost = defaultAbilityMpCost(definition?.rankCode);
  if (mpCost === null) {
    return { status: 'PENDING_PROFILE', affordable: null, mpCost: null, referenceMpCost, currentMp: currentMp == null ? null : Number(currentMp), maxMp: maxMp == null ? null : Number(maxMp) };
  }
  if (currentMp === null || currentMp === undefined || maxMp === null || maxMp === undefined) {
    return { status: 'MP_RESOURCE_MISSING', affordable: false, mpCost, referenceMpCost, currentMp: null, maxMp: null };
  }
  const current = Number(currentMp);
  const maximum = Number(maxMp);
  if (!Number.isFinite(current) || !Number.isFinite(maximum) || current < 0 || maximum < 0 || current > maximum) {
    return { status: 'MP_RESOURCE_INVALID', affordable: false, mpCost, referenceMpCost, currentMp: current, maxMp: maximum };
  }
  const affordable = current >= mpCost;
  return { status: affordable ? 'AFFORDABLE' : 'INSUFFICIENT_MP', affordable, mpCost, referenceMpCost, currentMp: current, maxMp: maximum };
}

function text(value, max, field, { required = false, upper = false } = {}) {
  let output = String(value ?? '').trim().normalize('NFKC');
  if (upper) output = output.toUpperCase();
  if (required && !output) throw abilityRuleError(`${field} is required.`);
  if (output.length > max) throw abilityRuleError(`${field} is too long.`);
  return output;
}

function attribute(value, required) {
  const output = String(value ?? '').trim().toUpperCase();
  if (!output && !required) return null;
  if (!ATTRIBUTE_SET.has(output)) throw abilityRuleError('Ability Attribute is invalid.', 'ABILITY_ATTRIBUTE_INVALID');
  return output;
}

function rank(value, required) {
  const output = String(value ?? '').trim().toUpperCase();
  if (!output && !required) return null;
  if (!RANK_CODES.has(output)) throw abilityRuleError('Ability Rank must be 1–9 or SPECIAL.', 'ABILITY_RANK_INVALID');
  return output;
}

function target(value) {
  const output = String(value ?? '').trim().toUpperCase();
  if (!output) return null;
  if (!TARGET_PATTERNS.has(output)) throw abilityRuleError('Ability Target Pattern is invalid.', 'ABILITY_TARGET_PATTERN_INVALID');
  return output;
}

export function normalizeAbilityDefinition(input, { allowUnclassified = false } = {}) {
  const requestedClass = String(input?.classificationStatus || 'CLASSIFIED').toUpperCase();
  const unclassified = allowUnclassified && requestedClass === 'NEEDS_CLASSIFICATION';
  const mechanicalProfile = parseObject(input?.mechanicalProfile ?? input?.mechanical_profile_json, {});
  const prerequisites = parseObject(input?.prerequisites ?? input?.prerequisites_json, {});
  const result = {
    canonicalNameZh: text(input?.canonicalNameZh ?? input?.canonical_name_zh ?? input?.name, 120, 'Ability name', { required: true }),
    attributeType: attribute(input?.attributeType ?? input?.attribute_type, !unclassified),
    rankCode: rank(input?.rankCode ?? input?.rank_code ?? input?.rank, !unclassified),
    abilityType: text(input?.abilityType ?? input?.ability_type ?? 'ABILITY', 80, 'Ability type', { required: true, upper: true }),
    targetPattern: target(input?.targetPattern ?? input?.target_pattern),
    physicalSourceCategory: text(input?.physicalSourceCategory ?? input?.physical_source_category ?? input?.requiredMasteryType, 80, 'Physical mastery type', { upper: true }) || null,
    descriptionZh: text(input?.descriptionZh ?? input?.description_zh ?? input?.description, 8000, 'Ability description'),
    mechanicalProfile,
    prerequisites,
    libraryVisibility: String(input?.libraryVisibility ?? input?.library_visibility ?? 'CAMPAIGN').trim().toUpperCase(),
    status: String(input?.status || 'active').trim().toLowerCase(),
    classificationStatus: unclassified ? 'NEEDS_CLASSIFICATION' : 'CLASSIFIED'
  };
  if (!['CAMPAIGN','PRIVATE'].includes(result.libraryVisibility)) throw abilityRuleError('Ability visibility is invalid.', 'ABILITY_VISIBILITY_INVALID');
  if (!['active','inactive'].includes(result.status)) throw abilityRuleError('Ability status is invalid.', 'ABILITY_STATUS_INVALID');
  if (result.attributeType !== 'PHYSICAL' && result.physicalSourceCategory) throw abilityRuleError('Physical mastery type requires PHYSICAL Ability classification.', 'ABILITY_PHYSICAL_SOURCE_INVALID');
  if (!unclassified && result.attributeType === 'PHYSICAL' && !result.physicalSourceCategory) throw abilityRuleError('PHYSICAL Ability requires a physical mastery type.', 'ABILITY_PHYSICAL_MASTERY_REQUIRED');
  return result;
}

export function resolveAbilityUsability(definition, character, currentAttributeRank = 0, currentMasteryRank = null) {
  const blockers = [];
  const unresolved = [];
  if (!definition || definition.status !== 'active') blockers.push({ code: 'ABILITY_DEFINITION_INACTIVE', message: '能力定義目前未啟用。' });
  if (String(character?.status || '').toLowerCase() !== 'active') blockers.push({ code: 'CHARACTER_NOT_ACTIVE', message: '角色目前不是 Active 狀態。' });

  if (definition?.classificationStatus !== 'CLASSIFIED' || !definition?.attributeType || !definition?.rankCode) {
    unresolved.push({ code: 'ABILITY_CLASSIFICATION_REQUIRED', message: '此舊能力尚未完成屬性／階級分類，需要 GM 重新分類。' });
  } else if (definition.rankCode === 'SPECIAL') {
    unresolved.push({ code: 'ABILITY_SPECIAL_USAGE_POLICY_PENDING', message: 'SPECIAL 能力需要獨立使用資格規則；SPECIAL 不是 Rank 10。' });
  } else {
    const requiredRank = Number(definition.rankCode);
    if (definition.attributeType === 'PHYSICAL') {
      const masteryType = String(definition.physicalSourceCategory || '').trim().toUpperCase();
      if (!masteryType) {
        unresolved.push({ code: 'ABILITY_PHYSICAL_MASTERY_REQUIRED', message: '物理 Ability 未指定所需武器／戰鬥方式專精，需要 GM 修正。' });
      } else {
        const masteryRank = Number(currentMasteryRank || 0);
        if (masteryRank < requiredRank) blockers.push({ code: 'PHYSICAL_MASTERY_RANK_INSUFFICIENT', message: `${masteryType} 專精階級不足：目前 ${masteryRank} 階，需要 ${requiredRank} 階。`, currentRank: masteryRank, requiredRank, masteryType });
      }
    } else {
      const currentRank = Number(currentAttributeRank || 0);
      if (currentRank < requiredRank) blockers.push({ code: 'ATTRIBUTE_RANK_INSUFFICIENT', message: `${definition.attributeType} 階級不足：目前 ${currentRank} 階，需要 ${requiredRank} 階。`, currentRank, requiredRank, attributeType: definition.attributeType });
    }
  }

  const prerequisites = parseObject(definition?.prerequisites, {});
  if (Object.prototype.hasOwnProperty.call(prerequisites, 'minimumCharacterLevel')) {
    const minimumLevel = Number(prerequisites.minimumCharacterLevel);
    if (!Number.isInteger(minimumLevel) || minimumLevel < 1 || minimumLevel > 100) unresolved.push({ code: 'ABILITY_PREREQUISITE_INVALID', message: '能力最低角色等級前置資料無效，需要 GM 修正。' });
    else if (Number(character?.level || 1) < minimumLevel) blockers.push({ code: 'CHARACTER_LEVEL_INSUFFICIENT', message: `角色 Level 不足：目前 ${Number(character?.level || 1)}，需要 Level ${minimumLevel}。`, currentLevel: Number(character?.level || 1), requiredLevel: minimumLevel });
  }
  const pendingKeys = Object.keys(prerequisites).filter(key => key !== 'minimumCharacterLevel');
  if (pendingKeys.length) unresolved.push({ code: 'ABILITY_ADDITIONAL_PREREQUISITES_PENDING', message: `尚未由本 Alpha resolver 支援的前置條件：${pendingKeys.join(', ')}。`, keys: pendingKeys });

  const status = unresolved.length ? 'UNRESOLVED' : (blockers.length ? 'UNUSABLE' : 'USABLE');
  return {
    status,
    usable: status === 'USABLE',
    blockers,
    unresolved,
    currentAttributeRank: definition?.attributeType && definition.attributeType !== 'PHYSICAL' ? Number(currentAttributeRank || 0) : null,
    currentMasteryRank: definition?.attributeType === 'PHYSICAL' ? Number(currentMasteryRank || 0) : null,
    requiredMasteryType: definition?.attributeType === 'PHYSICAL' ? (definition.physicalSourceCategory || null) : null
  };
}