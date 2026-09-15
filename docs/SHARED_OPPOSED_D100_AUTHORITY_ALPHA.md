# Shared Opposed D100 Authority — Alpha

> Status: Canonical Runtime Integration
> Scope: one GM-authorized opposed resolution between two Characters using canonical Basic Skills.

## 1. Authority boundary

This slice adds a shared opposed-D100 transaction. It does **not** add a second dice system.

Both sides use the existing canonical formula:

```text
Result = Raw D100 - [100 - (Natural Skill + Total Modifier)]
```

The authority compares the two final Result values only after both sides have been resolved with the same Basic Skill resolver.

This Alpha slice supports:

```text
Character Basic Skill vs Character Basic Skill
```

It does not pretend Monster / NPC data uses `character_skills`. Monster / NPC opposed support waits for a canonical percentile-skill authority for those entity types.

## 2. Comparison

Canonical comparison output:

```text
SOURCE_HIGHER
RESISTANCE_HIGHER
TIE
```

For a source attempting to impose a negative effect:

```text
source Result > resistance Result
→ sourceStrictlyBreaksResistance = true

source Result <= resistance Result
→ sourceStrictlyBreaksResistance = false
```

An exact tie sets:

```text
resistancePriorityOnTie = true
```

This is tie-resolution policy, not a numeric bonus.

## 3. Great results do not bypass Result comparison

Raw D100 extremes remain:

```text
1   = GREAT_FAILURE
100 = GREAT_SUCCESS
```

But neither raw 1 nor raw 100 replaces the opposed Result comparison.

Therefore:

- a source can roll raw 100 and still lose to a higher resistance Result;
- resistance can roll raw 100 and still be broken by a higher source Result;
- 100 vs 100 still compares final Result;
- an exact 100-vs-100 Result tie keeps resistance priority.

Great markers are preserved for later narrative/effect interpretation, but this authority does not invent those downstream consequences.

## 4. Atomic dual-check transaction

One GM POST resolves both sides and writes one D1 batch containing:

1. source `character_skill_check_log` row;
2. optional source Great-Success growth-eligibility row;
3. resistance `character_skill_check_log` row;
4. optional resistance Great-Success growth-eligibility row;
5. one `basic_skill_opposed_check_log` link/audit row.

The opposed row stores the two immutable Basic Skill check IDs and the comparison result.

There is no API sequence where the source can be committed while the resistance side is left missing by application logic.

## 5. Great Success growth eligibility remains independent

The existing Basic Skill growth rule remains unchanged:

```text
raw 100
→ valid / meaningful Basic Skill check
→ PENDING_BALANCE growth eligibility
```

Each side is evaluated independently.

A Character that rolls raw 100 keeps that pending growth eligibility even if that Character loses the opposed comparison.

This slice still does not define:

- progress granted per Great Success;
- progress required for Skill +1;
- high-Skill growth curve;
- post-creation SP expenditure curve.

No Skill value or growth progress is mutated by Opposed D100.

## 6. D1 schema

Migration:

```text
schema/0037_shared_opposed_d100_authority.sql
```

New immutable table:

```text
basic_skill_opposed_check_log
```

Important fields include:

- `source_check_id`;
- `resistance_check_id`;
- source/resistance Character IDs;
- `comparison`;
- `source_strictly_breaks_resistance`;
- `resistance_priority_on_tie`;
- meaningful reason;
- GM-only context JSON;
- actor User ID;
- timestamp.

Update/delete triggers keep the opposed audit immutable.

## 7. HTTP boundary

GM routes:

```text
POST /api/gm/basic-skill-opposed-checks
GET  /api/gm/basic-skill-opposed-checks?characterId=<id>&limit=<n>
```

POST requires:

- active authenticated GM/Admin;
- same-origin JSON request;
- existing source Character;
- existing resistance Character;
- neither Character may be death-locked;
- one canonical Basic Skill per side;
- integer total modifiers;
- optional raw D100 per side, otherwise server RNG;
- required meaningful reason;
- optional bounded context object.

No Player write route is introduced.

Each side's normal Basic Skill check row still appears in that Character's existing read-only Player Basic Skill history. Player projection continues to omit GM-only context and actor provenance.

## 8. Gateway chain

Wrangler outer entry remains unchanged.

Relevant chain:

```text
inventory-weapon-gateway
→ basic-skill-check-gateway
→ opposed-d100-gateway
→ currency-exchange-gateway
→ existing downstream Runtime / Story authority
```

The Opposed gateway is not a replacement for Basic Skill authority; it composes it.

## 9. GM UI

The GM Character workspace exposes a separate Shared Opposed D100 panel.

The currently opened Character is the source. GM then selects:

- resistance Character;
- source Basic Skill;
- resistance Basic Skill;
- total modifier for each side;
- optional external/physical raw D100 for each side;
- meaningful reason;
- optional context JSON.

A single button submits both sides together.

The result surface shows:

- both raw rolls;
- both Result values;
- Great markers;
- comparison;
- strict-breakthrough boolean;
- resistance tie priority.

The UI explicitly states that this authority does not apply damage, control, status, movement or other gameplay effects.

## 10. Explicit non-goals

This slice does **not**:

- resolve Damage;
- apply HP loss;
- apply Status Effects;
- resolve control/debuff duration or magnitude;
- move entities;
- consume Combat Action/Move;
- spend MP;
- generate AI narrative suggestions;
- grant fixed bonuses for Great Success;
- grant fixed penalties for Great Failure;
- implement the double-Great-Failure downstream effect interaction;
- support Monster/NPC percentile skills without a canonical authority.

Those belong to later adapters/effect authorities.

## 11. Production verification boundary

The production descriptor for this slice is plan-only. It must not log in or mutate production D1 automatically.

Release authority remains:

```text
feature CI
→ PR CI
→ squash main
→ main full node-checks
→ Cloudflare deploy
→ production route smoke
```

A successful deployment must not be described as credentialed live D1-writing Opposed E2E unless such a run is separately and explicitly executed.

## 12. Next authority boundary

After this slice, still deferred until canonical rules exist:

- Basic Skill Great-Success growth balance numbers;
- post-creation SP expenditure curve;
- Monster/NPC percentile-skill participation in opposed checks;
- downstream Exploration/Combat adapters that consume Action economy;
- Damage / Status / Control effect application;
- Ability execution until its output/effect scale authority is locked.
