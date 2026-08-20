# Monster / NPC System — Alpha

> Status: Canonical Alpha Working Rule  
> Date: 2026-08-21  
> Scope: Defines the structural model used for Monsters and NPCs in the Alpha ruleset. Detailed stat formulas and balance values are decided incrementally in later sections.

---

# 1. Core Model — Hybrid

Alpha uses a **Hybrid Monster / NPC Model**.

The system does not force every enemy, creature and NPC to use the full Player Character data model.

## 1.1 Ordinary Monsters / Disposable Combatants

Ordinary Monsters and similarly lightweight combatants use a **Simplified Profile**.

Purpose:

- fast GM creation;
- low database/UI overhead;
- suitable for encounters containing many units;
- avoids requiring irrelevant full Character fields for every minor creature.

Simplified Monster templates use exactly these six core Attributes:

```text
STR
DEX
CON
POW
INT
SIZ
```

The following Player-oriented Attributes are not mandatory on the Simplified Monster model:

```text
APP
EDU
LUCK
```

A richer Elite/Boss profile or Full Character NPC may carry additional fields when required.

## 1.2 Elite / Boss Enemies

Elite and Boss enemies may use a **richer Monster Profile** when required by their mechanics.

They are not automatically forced to become full Player-style Characters, but the model must be extensible enough to support additional Attributes, Resources, Abilities, Status rules and encounter-specific mechanics.

The automatic Elite upgrade process for spawned Ordinary Monsters is defined below.

## 1.3 Important / Persistent / Growing NPCs

Important NPCs, persistent companions, recurring characters or NPCs that require long-term progression may use the **Full Character Model**.

When Full Character Model is used, the NPC may participate in the same authoritative Character systems as appropriate, including Attributes, derived Resources, Skills, progression and Abilities.

Whether every Full-Model NPC uses EXP/Level progression identically to a Player Character is a separate decision and is not implied by this section.

---

# 2. Monster Template Attribute Ranges

A Simplified Monster is defined by a reusable **Monster Template**.

Instead of storing one fixed Attribute value for the entire species/type, the template stores an allowed inclusive range for each of the six Simplified Monster Attributes.

Example:

```text
Goblin Template
STR: 1–3
DEX: 1–3
CON: 1–3
POW: 1–3
INT: 1–3
SIZ: 1–3
```

When the system spawns a Monster instance, it rolls each Attribute independently inside that template's configured inclusive range.

Therefore the template describes the normal statistical range of that Monster type, while each spawned creature receives its own concrete values.

The stored template range is not overwritten by generated instance values.

---

# 3. Level Does Not Change the Base Roll Range

Monster Level is applied **after** the Monster's natural/base Attribute roll has been resolved.

Canonical principle:

```text
Goblin Lv1
and
Goblin Lv100

→ both begin from the same Goblin Template Attribute ranges
→ both first roll natural/base Attributes from those same ranges
```

Level must not silently widen or replace the template's natural range before the instance is rolled.

This preserves the species/template identity: a Level 100 Goblin is still generated from the same underlying Goblin baseline as a Level 1 Goblin.

After natural/base generation, a separate Monster Level Scaling calculation converts the generated base state into the final level-adjusted state.

The exact Level Scaling formula is **not yet locked** and will be decided separately.

The data model should preserve the distinction between:

```text
Template Attribute Range
→ Natural/Base Rolled Attribute
→ Elite Bonus, if any
→ Level-Adjusted Final Attribute / Derived Value
→ GM Final Adjustment
```

This allows the GM and system to explain why a Level 100 Goblin is much stronger without pretending the species' natural starting roll range itself was different.

---

# 4. Per-Instance Spawn Generation

Every spawned Monster instance runs the generation pipeline independently.

Canonical spawn flow:

```text
1. Read Monster Template
2. Roll STR / DEX / CON / POW / INT / SIZ independently inside configured ranges
3. Resolve the concrete natural/base Attribute set for this instance
4. Roll Elite check for this instance
5. If Elite, apply Elite Attribute Bonus
6. Apply Monster Level Scaling to the post-Elite base state
7. Recalculate all derived combat/resource values from the level-adjusted state
8. Allow GM final adjustment
9. Save/use this individual Monster instance
```

Spawning multiple Monsters never means rolling once and cloning the same final stats.

Example:

```text
Spawn 5 Goblins
→ Goblin #1 runs the full generation pipeline
→ Goblin #2 runs the full generation pipeline
→ Goblin #3 runs the full generation pipeline
→ Goblin #4 runs the full generation pipeline
→ Goblin #5 runs the full generation pipeline
```

Each Goblin may therefore have different natural Attributes, Elite result, Elite bonus and final level-adjusted values.

---

# 5. Automatic Elite Check

After the natural/base Attribute rolls are complete, each spawned Ordinary Monster independently makes an Elite check.

Current Alpha rule:

```text
Elite Chance = 10%
```

This is evaluated separately for every spawned instance.

Example:

```text
Spawn 5 Goblins
→ 5 separate Elite checks
```

The system must not roll one Elite result for the whole group.

## 5.1 Elite Attribute Bonus

If the Monster passes the Elite check:

```text
Elite Attribute Bonus = random integer from 1 to 5
```

One Elite Bonus value is rolled for that Monster instance and the same bonus is added to all six Simplified Monster Attributes:

```text
STR
DEX
CON
POW
INT
SIZ
```

Example:

```text
Goblin natural/base roll:
STR 2
DEX 3
CON 1
POW 2
INT 1
SIZ 2

Elite check: Success
Elite Attribute Bonus roll: +4

Post-Elite base state:
STR 6
DEX 7
CON 5
POW 6
INT 5
SIZ 6
```

Level Scaling is applied only after this post-Elite base state has been resolved.

Elite status and the rolled Elite Bonus must be stored on the individual instance for audit/debugging and GM visibility.

---

# 6. Monster Level Scaling Layer

Monster Level is a separate scaling layer and must not be confused with natural species/template generation.

Required order:

```text
Natural Template Roll
→ Elite adjustment, if any
→ Level Scaling
→ Derived values
→ GM Final Adjustment
```

Consequences:

- Level 1 and Level 100 versions of the same Monster Template use the same natural Attribute ranges.
- Their rolled base states may coincidentally be identical.
- Their final combat states may still be dramatically different because Level Scaling is applied after generation.
- The final Level Scaling method must be deterministic/auditable once the formula is locked.

The exact scaling relationship for Attributes, HP, MP, Attack, Defence, Damage and other outputs remains the next design decision.

---

# 7. GM Final Adjustment

After all automatic generation and Level Scaling are complete, the GM may manually adjust the spawned Monster's final values.

This is an authorised **instance-level override/adjustment**, not a silent mutation of the base Monster Template.

Therefore:

```text
Template Range
→ automatic instance rolls
→ optional Elite upgrade
→ Level Scaling
→ derived stat calculation
→ GM final adjustment
```

GM adjustment must be able to alter the final spawned instance without changing future Monsters of the same template unless the GM explicitly edits the template itself.

Where practical, automatic rolled values, level-adjusted values and GM-adjusted final values should remain distinguishable in D1/audit history.

---

# 8. GM Monster Management Tab

The GM workspace must include a dedicated **Monster Management** tab/page for maintaining Monster data.

The GM must be able to manage reusable Monster Templates from this area, including at minimum:

```text
Monster Template identity / name
STR min / max
DEX min / max
CON min / max
POW min / max
INT min / max
SIZ min / max
Default / allowed Level information
Elite settings where configurable
Abilities / profile links when later defined
Notes / description
```

The same area should provide access to spawned Monster instances where persistence is useful, including visibility of:

```text
Template source
Monster Level
Natural/base rolled Attributes
Elite result
Elite Bonus
Level-adjusted values
GM final adjustments
Final current combat state
```

Template editing and instance editing are distinct operations:

```text
Edit Template
→ changes future spawns / template definition

Edit Spawned Instance
→ changes only that individual Monster
```

The Monster Management tab is a GM-only authoritative interface backed by D1.

---

# 9. Canonical Principle

```text
Ordinary Monster
→ Simplified Template with STR / DEX / CON / POW / INT / SIZ ranges
→ every spawned instance rolls its own six natural Attributes
→ every instance independently has 10% Elite chance
→ Elite adds one random +1 to +5 bonus to all six Attributes
→ Monster Level scaling applies only after the natural + Elite state is resolved
→ derived values recalculate
→ GM may finally adjust the individual instance

Elite / Boss
→ Richer Monster Profile when needed

Important / Persistent / Growing NPC
→ Full Character Model
```

The profile type is chosen according to gameplay complexity, not simply whether the entity is friendly or hostile.

---

# 10. D1 / Alpha Implementation Requirement

All Monster / NPC Profiles used by the live Alpha remain server-authoritative and persist in D1 where persistence is required.

The data model must distinguish at least:

```text
Monster Template
→ six Attribute min/max ranges
→ spawn/default settings

Monster Instance
→ Monster Level
→ six natural/base rolled Attributes
→ Elite result
→ Elite Attribute Bonus
→ level-adjusted Attributes / derived stats
→ GM adjustments
→ final state
```

The Hybrid approach must not duplicate unrelated Player-only fields into every ordinary Monster record.

---

# 11. Still To Be Decided

The following are deliberately unresolved and must be decided one by one:

- exact Monster Level Scaling formula/method;
- HP / MP generation and scaling;
- Attack / Defence values;
- Boss-specific generation/modifiers beyond the automatic Elite rule;
- Skill / D100 handling;
- Ability handling;
- Status / Resistance / Immunity fields;
- EXP rewards;
- NPC progression behaviour;
- encounter difficulty contribution.
