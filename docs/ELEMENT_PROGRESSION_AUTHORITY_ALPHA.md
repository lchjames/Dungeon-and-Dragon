# Nine-Attribute Rank / Progression Authority — Alpha

> Status: Canonical Alpha runtime authority implementation.
> Scope: GM-controlled Rank / training-progress mutation for PHYSICAL, LIGHT, DARK, FIRE, WATER, WIND, EARTH, LIGHTNING and WOOD.
> Source direction: `九屬性階級與修習進度_ALPHA.md`.

## 1. Authority boundary

`character_element_progression` remains the single Character authority for the nine Attribute tracks.

Each Character has exactly one row per Attribute:

- `rank`: integer 0–9
- `progression_exp`: non-negative integer
- `updated_at`
- metadata reserved for later canonical use

This slice does **not** introduce a parallel progression table or a Player-editable copy.

## 2. Rank and progression remain separate

Rank controls one Ability usability gate:

```text
Character current Attribute Rank >= normal Ability Rank
→ passes the Attribute Rank gate
```

Progression EXP represents training / growth accumulation only. It is not Character EXP and does not directly calculate Character Level.

Changing Character EXP / Level does not automatically alter any of the nine Attribute Ranks.

## 3. No Alpha threshold formula yet

The canonical rules intentionally do not yet define:

- EXP required for Rank 0 → 1, 1 → 2, etc.
- linear vs non-linear Rank curves
- breakthrough requirements
- whether reaching a threshold automatically grants a Rank

Therefore this authority MUST NOT:

- hardcode a Rank threshold table
- auto-rank when progression reaches a number
- infer Rank from Character Level
- award fixed progression merely because an Ability was cast

Player display continues to show:

```text
修習 EXP / ?
```

until a separate canonical threshold policy exists.

## 4. GM mutation operations

GM/Admin may change one Attribute using:

```text
PATCH /api/gm/characters/:characterId/ability-progression/:attributeType
```

Supported payload shapes:

### Explicit correction

```json
{
  "rank": 3,
  "progressionExp": 72,
  "sourceType": "GM_CORRECTION",
  "sourceName": "Session review",
  "reason": "Corrected after sheet audit"
}
```

Rank must be 0–9. Progression EXP must be a non-negative safe integer.

### Progression award

```json
{
  "progressionDelta": 15,
  "sourceType": "TRAINING",
  "sourceName": "Fire mentor lesson",
  "reason": "Completed formal training"
}
```

`progressionDelta` must be a positive safe integer.

Awarding progression does not change Rank automatically.

`progressionExp` and `progressionDelta` are mutually exclusive. Rank may be supplied alongside either if the GM explicitly intends both changes in one audited operation.

## 5. Meaningful source metadata

The source is recorded for audit. Suggested Alpha source types include:

- `GM_CORRECTION`
- `GM_REWARD`
- `TRAINING`
- `COMBAT`
- `MENTOR`
- `RESEARCH`
- `STORY`
- `QUEST`
- `ITEM`
- `OTHER`

The authority does not interpret these labels as automatic reward formulas. They are provenance.

## 6. Atomic audit-driven mutation

Every actual change is initiated by exactly one INSERT into:

`character_element_progression_log`

The audit row contains:

- Character
- Attribute
- operation
- from/to Rank
- from/to progression EXP
- award delta where applicable
- source type/name
- reason
- GM actor
- timestamp

A SQLite validation trigger checks that the current progression row still equals the recorded `from_*` values. If another write changed the row after it was read, the INSERT aborts with:

`ELEMENT_PROGRESSION_STALE`

The apply trigger then updates `character_element_progression` inside the same SQLite statement transaction boundary.

This prevents an authoritative progression mutation from succeeding without its audit record.

Same-value explicit corrections return `unchanged: true` and create no audit row.

## 7. Read APIs

GM:

```text
GET /api/gm/characters/:characterId/ability-progression
GET /api/gm/characters/:characterId/ability-progression/audit?limit=12
```

Player does not receive a progression mutation endpoint. The existing Player Ability endpoint remains the read surface:

```text
GET /api/player/characters/:characterId/abilities
```

and returns `abilityProgression` together with acquired Ability usability.

## 8. Death lock

A Character with `character_life_states.character_locked = 1` cannot receive ordinary Rank / progression edits.

The gateway returns the existing death-lock authority error:

`CHARACTER_LOCKED_DEAD`

A future Revival / Unlock authority must be explicit; GM progression correction does not bypass death lock.

## 9. Immediate Ability usability effect

Ability usability is dynamically resolved from current Character state. Therefore after a Rank correction:

```text
FIRE Rank 0 → FIRE Rank 2
```

an already acquired FIRE Rank 2 Ability may become usable immediately if its other requirements also pass.

The acquisition row itself is not changed.

Progression EXP alone does not change Ability usability unless a future canonical rule explicitly adds such a gate.

## 10. UI

GM Ability panel provides, per Attribute:

- current Rank and progression EXP
- `Set Rank + EXP`
- `Award EXP`
- source type
- source name
- reason
- recent immutable progression audit

Player Ability page remains read-only and displays all nine tracks with the unresolved next-Rank threshold as `?`.

## 11. Out of scope

This slice does not implement:

- Rank threshold configuration
- automatic Rank promotion
- breakthrough rolls / quests
- Player self-training buttons
- per-cast progression rewards
- Character-Level-to-Attribute conversion
- Ability combat execution
- SPECIAL Ability usage policy
- Specialisation progression

Those require separate canonical policy before implementation.

## 12. Production verification

CI covers JavaScript syntax, static authority contracts and the existing full MVP regressions. The dedicated Element Progression production descriptor is plan-only and performs no credentialed production write. Live D1-writing verification remains operator-controlled.
