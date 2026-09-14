# Ability Definition + Character Grant Authority — Alpha

> Status: Canonical Alpha Runtime Authority
> Scope: Ability Definition persistence, Character permanent acquisition by GM Grant, legacy Ability compatibility import, Player acquired-Ability read model, and the first dynamic usability diagnostics.

## 1. Authority split

The Runtime must keep three questions separate:

```text
Ability Definition exists
Character has acquired the Ability
Character can currently use the Ability
```

Therefore:

```text
acquired != usable
GM_GRANT != usability override
```

A GM may grant an Ability even when the Character does not currently satisfy its normal usage requirements. The acquired relationship remains present and the Player still sees the Ability.

## 2. Definition authority

Canonical Ability Definitions live in:

```text
ability_definitions
```

A classified normal Ability contains at least:

- Traditional-Chinese canonical name;
- one of the nine Ability Attributes: `PHYSICAL`, `LIGHT`, `DARK`, `FIRE`, `WATER`, `WIND`, `EARTH`, `LIGHTNING`, `WOOD`;
- Rank `1`–`9`, or `SPECIAL` where the broader canonical rules allow it;
- Ability type;
- optional target pattern;
- optional physical source category for `PHYSICAL` only;
- Traditional-Chinese description;
- structured mechanical profile JSON;
- structured prerequisites JSON;
- library visibility;
- active/inactive status.

Creating or editing a Definition is a separate operation from granting it to a Character. Editing a shared Definition changes the formal Definition referenced by every acquisition; Grant never silently edits the Definition.

Revision history is written to:

```text
ability_definition_revision_history
```

The Alpha change sources in this slice are:

```text
LEGACY_IMPORT
GM_CREATE
GM_EDIT
```

## 3. Character acquisition authority

Permanent acquired relationships live in:

```text
character_acquired_abilities
```

This slice implements:

```text
GM_GRANT
```

The data model deliberately leaves room for the already-canonical future acquisition routes:

```text
PLAYER_UNLOCK
PLAYER_ITEM
PLAYER_SHOP
```

Those routes are not implemented by this slice.

A GM Grant records:

- Character;
- Ability Definition;
- acquisition mode;
- optional source type;
- optional source name;
- optional GM note;
- granting GM;
- acquisition time;
- metadata.

Grant is idempotent by `(character_id, ability_definition_id)`. Retrying the same Grant does not create a second permanent acquisition.

Grant audit is written to:

```text
character_ability_grant_log
```

## 4. No ungrant in this slice

The current canonical documents define Ability acquisition and GM Grant, but do not yet lock a removal/revocation lifecycle.

Therefore this Runtime Authority does **not** invent one.

There is no canonical Player or GM `DELETE/ungrant` API in this slice. If permanent Ability revocation is required later, it needs an explicit rule for historical audit, temporary loss, restoration, Story consequences, and whether the original acquisition remains historically true.

## 5. Legacy `character_abilities` compatibility

The original platform schema contains the prototype table:

```text
character_abilities
```

It does not carry enough canonical information to infer one of the nine Ability Attributes or a canonical Rank.

The new authority therefore performs a lazy, non-destructive compatibility import:

```text
legacy character_abilities row
→ PRIVATE Ability Definition
→ classification_status = NEEDS_CLASSIFICATION
→ permanent compatibility acquisition
```

The Runtime does **not** guess `PHYSICAL`, an element, `POW`, or a Rank.

Legacy entries remain visible to the owning Player, but their usability is `UNRESOLVED` until a GM edits the Definition and supplies a canonical Attribute + Rank.

The old table remains in place for compatibility/history, but Player Ability display authority comes from `character_acquired_abilities + ability_definitions` through the Ability gateway.

## 6. Nine-Attribute progression substrate

The canonical Attribute progression storage used by the first usability resolver is:

```text
character_element_progression
```

with one row per Character per canonical Ability Attribute:

```text
character_id
attribute_type
rank             0..9
progression_exp
updated_at
metadata
```

Missing rows are lazily initialized to Rank 0 / progression 0. This slice does not define the progression-EXP thresholds and does not add the GM progression-editing workflow; those remain a later authority slice.

## 7. Dynamic usability resolver

`usable` is not stored as permanent Character data.

For every Player/GM Ability read, the service calculates current usability from live Character + Definition data.

This slice resolves:

1. Definition active/inactive state;
2. Character active state;
3. whether legacy classification is complete;
4. numeric Ability Rank against the Character's matching nine-Attribute Rank;
5. optional `minimumCharacterLevel` prerequisite.

The result is one of:

```text
USABLE
UNUSABLE
UNRESOLVED
```

`UNUSABLE` means the resolver understands the requirement and the Character currently fails it.

`UNRESOLVED` means the Ability contains a rule which this Alpha resolver must not guess. Examples:

- legacy Definition has no canonical Attribute/Rank yet;
- `SPECIAL` requires a separate usage policy and is not treated as Rank 10;
- prerequisites contain keys beyond the currently supported `minimumCharacterLevel`.

The Player receives diagnostic reasons instead of having the Ability hidden.

## 8. Death lock

Canonical Character death lock includes Abilities. Therefore ordinary GM Grant is rejected when `character_life_states.character_locked = 1`.

A future Revival/Unlock authority must explicitly reopen normal Character writes; GM Grant cannot act as an informal bypass.

## 9. APIs

GM Definition authority:

```text
GET   /api/gm/abilities
POST  /api/gm/abilities
GET   /api/gm/abilities/:abilityDefinitionId
PATCH /api/gm/abilities/:abilityDefinitionId
```

GM Character Ability authority:

```text
GET  /api/gm/characters/:characterId/abilities
POST /api/gm/characters/:characterId/abilities/grants
```

Player read authority:

```text
GET /api/player/characters/:characterId/abilities
```

Character detail reads are also augmented so `character.abilities` comes from this canonical authority rather than the legacy prototype table.

Player requests remain owner-scoped. GM writes require `gm/admin` role and same-origin validation.

## 10. Player UI

The Player Ability tab:

- shows only Abilities the current Character has acquired;
- groups classified Abilities by the nine canonical Attributes;
- shows current Attribute Rank/progression substrate;
- shows Ability Rank and type;
- shows `可使用`, `不可使用`, or `待判定`;
- displays diagnostic reasons;
- keeps legacy unclassified entries visible in an explicit compatibility section;
- does not show unacquired Ability Library entries;
- does not provide Learn/Unlock/Buy controls.

## 11. GM UI

The GM Character workspace can:

- create a classified Ability Definition;
- edit an existing Definition, including legacy classification;
- set active/inactive and Campaign/Private visibility;
- set the currently supported minimum Character Level prerequisite;
- grant an active classified Definition to the selected Character;
- record Grant source/type/name/note;
- inspect Character acquired Abilities and current usability diagnostics.

Grant and Definition edit remain separate controls.

## 12. Explicitly outside this slice

This Authority does not implement:

- AI Ability generation or balancing;
- Player custom-Ability proposal flow;
- Player skill-point unlock;
- Store/Item Ability acquisition;
- temporary Item-provided Abilities;
- permanent Ability revocation/ungrant;
- GM usability override;
- Attribute progression growth/editing thresholds;
- Ability combat execution/resolution;
- MP spending, damage, healing, control or status resolution;
- `SPECIAL` usage policy.

Those must attach to this persistent Definition/acquisition authority rather than create parallel Ability ownership stores.

## 13. Release verification rule

CI verifies syntax, pure usability rules, migration/schema contracts, gateway routing, Player/GM surfaces, death lock, no-ungrant scope and the complete existing regression suite.

The production Ability verification script in this slice is plan-only and does not contain production credentials or autonomously perform D1-writing login automation. Any live production-writing Ability test remains an explicit operator-controlled action and must not be reported as executed unless it was actually run.
