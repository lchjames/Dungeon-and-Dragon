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

Ordinary Monster templates use a selected subset of Attributes rather than the full Player Character Attribute model. Exact mandatory Attribute keys are decided separately.

## 1.2 Elite / Boss Enemies

Elite and Boss enemies may use a **richer Monster Profile** when required by their mechanics.

They are not automatically forced to become full Player-style Characters, but the model must be extensible enough to support additional Attributes, Resources, Abilities, Status rules and encounter-specific mechanics.

The automatic Elite upgrade process for spawned Ordinary Monsters is defined in Section 3.

## 1.3 Important / Persistent / Growing NPCs

Important NPCs, persistent companions, recurring characters or NPCs that require long-term progression may use the **Full Character Model**.

When Full Character Model is used, the NPC may participate in the same authoritative Character systems as appropriate, including Attributes, derived Resources, Skills, progression and Abilities.

Whether every Full-Model NPC uses EXP/Level progression identically to a Player Character is a separate decision and is not implied by this section.

---

# 2. Monster Template Attribute Ranges

A Simplified Monster is defined by a reusable **Monster Template**.

Instead of storing one fixed Attribute value for the entire species/type, the template stores an allowed range for each selected Attribute.

Example:

```text
Goblin Template
STR: 1–3
DEX: 1–3
CON: 1–3
...
```

When the system spawns a Monster instance, it rolls each stored Attribute independently inside that template's configured inclusive range.

Therefore the template describes the normal statistical range of that Monster type, while each spawned creature receives its own concrete values.

The stored template range is not overwritten by the generated instance values.

---

# 3. Per-Instance Spawn Generation

Every spawned Monster instance runs the generation pipeline independently.

Canonical spawn flow:

```text
1. Read Monster Template
2. Roll every configured Attribute inside its min/max range
3. Resolve the concrete base Attribute set for this instance
4. Roll Elite check for this instance
5. If Elite, apply Elite Attribute Bonus
6. Recalculate any derived stats from the final Attributes
7. Allow GM final adjustment
8. Save/use this individual Monster instance
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

Each Goblin may therefore have different STR, DEX, CON and other configured Attributes, and each has its own independent chance to become Elite.

---

# 4. Automatic Elite Check

After the base Attribute rolls are complete, each spawned Ordinary Monster independently makes an Elite check.

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

## 4.1 Elite Attribute Bonus

If the Monster passes the Elite check:

```text
Elite Attribute Bonus = random integer from 1 to 5
```

One Elite Bonus value is rolled for that Monster instance and the same bonus is added to **all Attributes present on that Monster's generated Attribute Profile**.

Example:

```text
Goblin base:
STR 2
DEX 3
CON 1

Elite check: Success
Elite Attribute Bonus roll: +4

Final:
STR 6
DEX 7
CON 5
```

This bonus is applied before derived combat/resource values are finalized, so any derived values that depend on Attributes must be recalculated using the post-Elite Attribute values.

Elite status and the rolled Elite Bonus should be stored on the individual instance for audit/debugging and GM visibility.

---

# 5. GM Final Adjustment

After automatic generation is complete, the GM may manually adjust the spawned Monster's final values.

This is an authorised **instance-level override/adjustment**, not a silent mutation of the base Monster Template.

Therefore:

```text
Template Range
→ automatic instance rolls
→ optional Elite upgrade
→ derived stat calculation
→ GM final adjustment
```

GM adjustment must be able to alter the final spawned instance without changing future Monsters of the same template unless the GM explicitly edits the template itself.

Where practical, automatic rolled values and GM-adjusted final values should remain distinguishable in D1/audit history.

---

# 6. Canonical Principle

```text
Ordinary Monster
→ Simplified Template with selected Attribute ranges
→ every spawned instance rolls its own Attributes
→ every instance independently has 10% Elite chance
→ Elite adds one random +1 to +5 bonus to all present Attributes
→ derived values recalculate
→ GM may finally adjust the individual instance

Elite / Boss
→ Richer Monster Profile when needed

Important / Persistent / Growing NPC
→ Full Character Model
```

The profile type is chosen according to gameplay complexity, not simply whether the entity is friendly or hostile.

---

# 7. D1 / Alpha Implementation Requirement

All Monster / NPC Profiles used by the live Alpha remain server-authoritative and persist in D1 where persistence is required.

The data model must distinguish at least:

```text
Monster Template
→ configured Attribute min/max ranges
→ spawn/default settings

Monster Instance
→ concrete rolled Attributes
→ Elite result
→ Elite Attribute Bonus
→ derived stats
→ GM adjustments
```

The Hybrid approach must not duplicate unrelated Player-only fields into every ordinary Monster record.

---

# 8. Still To Be Decided

The following are deliberately unresolved and must be decided one by one:

- exact mandatory selected Attributes for Simplified Monster templates;
- HP / MP generation and scaling;
- Attack / Defence values;
- Boss-specific generation/modifiers beyond the automatic Elite rule;
- Skill / D100 handling;
- Ability handling;
- Status / Resistance / Immunity fields;
- EXP rewards;
- NPC progression behaviour;
- encounter difficulty contribution.
