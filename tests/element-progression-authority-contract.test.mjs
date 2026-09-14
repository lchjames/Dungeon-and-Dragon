import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(new URL('../schema/0033_element_progression_authority.sql', import.meta.url), 'utf8');
const authority = await readFile(new URL('../src/element-progression-authority.js', import.meta.url), 'utf8');
const abilityAuthority = await readFile(new URL('../src/ability-authority.js', import.meta.url), 'utf8');
const gateway = await readFile(new URL('../src/ability-gateway.js', import.meta.url), 'utf8');
const gmUi = await readFile(new URL('../public/assets/gm-abilities.js', import.meta.url), 'utf8');
const playerUi = await readFile(new URL('../public/assets/player-abilities.js', import.meta.url), 'utf8');
const doc = await readFile(new URL('../docs/ELEMENT_PROGRESSION_AUTHORITY_ALPHA.md', import.meta.url), 'utf8');
const correction = await readFile(new URL('../docs/PHYSICAL_MASTERY_CORRECTION_ALPHA.md', import.meta.url), 'utf8');

// 0033 remains append-only historical schema. Its PHYSICAL allowance is compatibility only.
assert.match(migration, /CREATE TABLE IF NOT EXISTS character_element_progression_log/);
assert.match(migration, /CHECK \(attribute_type IN \('PHYSICAL','LIGHT','DARK','FIRE','WATER','WIND','EARTH','LIGHTNING','WOOD'\)\)/);
assert.match(migration, /CHECK \(to_rank BETWEEN 0 AND 9\)/);
assert.match(migration, /CHECK \(to_progression_exp >= 0\)/);
assert.match(migration, /CREATE TRIGGER IF NOT EXISTS trg_character_element_progression_log_validate/);
assert.match(migration, /RAISE\(ABORT, 'ELEMENT_PROGRESSION_STALE'\)/);
assert.match(migration, /CREATE TRIGGER IF NOT EXISTS trg_character_element_progression_log_apply/);
assert.match(migration, /UPDATE character_element_progression/);
assert.match(migration, /trg_character_element_progression_log_no_update/);
assert.match(migration, /trg_character_element_progression_log_no_delete/);
assert.match(migration, /ELEMENT_PROGRESSION_AUDIT_IMMUTABLE/);

assert.match(authority, /INSERT INTO character_element_progression_log/);
assert.match(authority, /ELEMENT_PROGRESSION_STALE/);
assert.match(authority, /progressionDelta/);
assert.match(authority, /toRank = hasRank \? integer\(input\.rank, 'Rank', 0, 9\)/);
assert.match(authority, /unchanged: true/);
assert.doesNotMatch(authority, /automatic.{0,20}rank/i);
assert.doesNotMatch(authority, /rankThreshold|progressionThreshold|expPerRank/i);

assert.match(abilityAuthority, /MAGIC_ABILITY_ATTRIBUTE_TYPES\.map/);
assert.match(abilityAuthority, /attribute_type <> 'PHYSICAL'/);
assert.match(gateway, /ability-progression\\\/audit/);
assert.match(gateway, /ability-progression\\\/\(\[\^\/\]\+\)/);
assert.match(gateway, /mutateCharacterElementProgression/);
assert.match(gateway, /PHYSICAL_PROGRESSION_REMOVED/);
assert.match(gateway, /assertCharacterUnlocked/);
assert.match(gateway, /CHARACTER_LOCKED_DEAD/);
assert.doesNotMatch(gateway, /api\\\/player\\\/characters\\\/\(\[\^\/\]\+\)\\\/ability-progression/);

assert.match(gmUi, /八元素 Rank \/ 修習進度/);
assert.doesNotMatch(gmUi, /九屬性 Rank \/ 修習進度/);
assert.match(gmUi, /Set Rank \+ EXP/);
assert.match(gmUi, /Award EXP/);
assert.match(gmUi, /Rank 不會自動提升/);
assert.match(gmUi, /ability-progression\/audit/);
assert.match(playerUi, /MAGIC_ATTRIBUTE_ORDER/);
assert.match(playerUi, /修習 \$\{escapeHtml\(row\.progressionExp\)\} \/ \?/);

assert.match(doc, /MUST NOT/);
assert.match(doc, /auto-rank/i);
assert.match(correction, /eight elemental progression tracks/i);
assert.match(correction, /PHYSICAL is \*\*not\*\* an authoritative Character progression axis/);
assert.match(correction, /historical compatibility/);

console.log('Eight-element progression authority and Physical Mastery override contract passed.');
