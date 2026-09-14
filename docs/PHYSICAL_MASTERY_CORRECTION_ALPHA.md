# Physical Mastery Correction — Alpha

> Status: Canonical Runtime Integration
> Scope: correct the brief Runtime implementation that treated PHYSICAL as a Character-wide progression axis.

## Canonical override

`docs/移除物理總階級_改用武器專精成長_ALPHA.md` is the later Canonical Alpha Override for physical growth. It supersedes earlier wording that gave every Character a global PHYSICAL Rank / PHYSICAL training EXP track.

PHYSICAL remains valid as:

- an Ability classification;
- a UI grouping;
- a physical damage/source/reference context.

PHYSICAL is **not** an authoritative Character progression axis.

## Eight elemental progression tracks

The canonical Character element progression tracks are now:

`LIGHT, DARK, FIRE, WATER, WIND, EARTH, LIGHTNING, WOOD`.

Each keeps independent Rank 0–9 and progression EXP. Existing `character_element_progression` rows with `attribute_type='PHYSICAL'` are retained only as historical compatibility data. Runtime canonical reads do not return them, new Character progression initialization does not create them, and the GM progression mutation API rejects PHYSICAL with `PHYSICAL_PROGRESSION_REMOVED`.

No destructive migration deletes historical rows.

## Physical Mastery authority

Physical growth is stored by Character and Campaign-defined mastery type in `character_physical_masteries`:

- `character_id`
- `mastery_type`
- `rank` (0–9)
- `progression_exp`
- `updated_at`
- metadata

Examples of mastery keys may include `SWORD`, `SPEAR`, `HAMMER`, `BOW`, `UNARMED`, or other Campaign-defined categories. This Alpha slice deliberately does not hard-code an exhaustive mastery vocabulary.

Changes are explicit and audited in `character_physical_mastery_log`. Supported operations are Set Rank, Set Progression, Award Progression, or Set Both. There is no automatic Rank promotion and no fixed EXP threshold in this slice.

## Physical Ability usage gate

A classified PHYSICAL Ability must specify a required Physical Mastery type. The Ability's ordinary numeric Rank 1–9 is interpreted as the minimum required Rank of that mastery.

Example:

- Ability classification: `PHYSICAL`
- Ability Rank: `3`
- Required Physical Mastery: `SWORD`
- Character SWORD Mastery Rank: `2`
- Result: acquired Ability remains owned, but is currently unusable.

If SWORD Mastery reaches Rank 3, that mastery gate passes. Acquisition remains independent from usability.

`SPECIAL` remains unresolved by this slice and does not become Rank 10.

## Compatibility and safety

The correction does not:

- delete historical PHYSICAL element-progression rows;
- invent Physical Mastery damage multipliers;
- invent Rank EXP thresholds;
- auto-award mastery EXP from attacks;
- auto-promote mastery Rank;
- add Ability combat execution;
- add ungrant/delete behavior.

A DEAD / locked Character cannot be modified through ordinary GM mastery mutation routes.

## UI

Player Ability UI:

- may still group PHYSICAL Abilities under Physical;
- shows only the eight elemental Rank/progression tracks;
- shows Physical Mastery tracks separately;
- shows the required mastery on PHYSICAL Abilities.

GM Ability UI:

- authors PHYSICAL Abilities with a Required Physical Mastery;
- manages the eight elemental tracks separately;
- manages Physical Mastery Rank/progression through dedicated controls;
- does not present a global PHYSICAL Rank control.

## Verification

CI covers pure Ability usability rules plus static authority contracts. Production-writing mastery mutation remains operator-controlled; normal CI does not log into production or mutate live D1.

## Next authority boundary

Do not implement general Ability execution solely from this correction. Combat execution still requires canonical Action/resource/target/range/effect/SPECIAL semantics to be sufficiently locked. Physical damage scaling likewise waits for canonical mastery/source math rather than inventing a multiplier here.
