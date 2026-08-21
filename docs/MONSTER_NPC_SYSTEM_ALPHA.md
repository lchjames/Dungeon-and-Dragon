# Monster / NPC System — Alpha

> Status: Canonical Alpha Rule  
> Date: 2026-08-21  
> Scope: Defines the structural model used for Monsters and NPCs in the Alpha ruleset.

---

# 1. Core Model — Hybrid

Alpha uses a **Hybrid Monster / NPC Model**.

## 1.1 Ordinary Monsters / Disposable Combatants

Ordinary Monsters use a **Simplified Profile** for fast GM creation and low database/UI overhead.

Simplified Monster templates use exactly these six core Attributes:

```text
STR
DEX
CON
POW
INT
SIZ
```

`APP / EDU / LUCK` are not mandatory for Simplified Monsters.

## 1.2 Elite / Boss Enemies

Elite and Boss enemies may use a richer Monster Profile when required by their mechanics. They are not automatically forced into the full Player Character model.

## 1.3 Important / Persistent / Growing NPCs

Important NPCs, persistent companions, recurring characters or NPCs that require long-term progression may use the **Full Character Model**.

---

# 2. Monster Template Attribute Ranges

A Simplified Monster Template stores an inclusive min/max range for each of the six core Attributes.

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

Every spawned Monster rolls each Attribute independently from the Template range. Template ranges are never overwritten by generated instance values.

---

# 3. Natural Attributes and Effective Attributes

Monster Attributes use a two-layer model.

## 3.1 Natural Attributes

Natural Attributes are the generated baseline after the base Template rolls and any Elite bonus:

```text
Base Template Roll
→ Elite Bonus, if any
→ Natural STR / DEX / CON / POW / INT / SIZ
```

Monster Level never rerolls or overwrites Natural Attributes.

## 3.2 Effective Attributes

Effective Attributes are the Level-adjusted values used by live combat/rules calculations:

```text
Natural Attribute
→ Monster Level Scaling
→ Effective Attribute
```

All ordinary derived Monster calculations use Effective Attributes unless a specific rule explicitly calls for Natural values.

Examples:

```text
Initiative basis → Effective DEX
HP basis → Effective CON / Effective SIZ
MP basis → Effective INT or other locked MP inputs
physical output → Effective STR / Effective SIZ
mental / supernatural checks → Effective POW / Effective INT
```

---

# 4. Level Does Not Change the Base Roll Range

A Level 1 and Level 100 Monster of the same Template begin from the same natural Attribute ranges.

Example:

```text
Goblin Lv1
Goblin Lv100

→ both roll from the same Goblin Template ranges
```

Level is applied only after Natural Attributes are finalized.

Full chain:

```text
Template Attribute Range
→ Base Roll
→ Elite Bonus, if any
→ Natural Attribute
→ Level Scaling
→ Effective Attribute
→ Derived Combat / Resource Values
→ GM Final Adjustment
```

---

# 5. Locked Monster Level Scaling

The exact Level scaling formula is defined in `MONSTER_LEVEL_SCALING_ALPHA.md` and is Canonical.

Global growth term:

```text
GlobalGrowth(Level)
= ((Level - 1) / 21.7)^2
```

Each Monster Template stores one independent Growth Weight for each core Attribute:

```text
STR Growth Weight
DEX Growth Weight
CON Growth Weight
POW Growth Weight
INT Growth Weight
SIZ Growth Weight
```

For each Attribute:

```text
Effective Attribute
= round(
    Natural Attribute
    × [1 + GlobalGrowth(Level) × Attribute Growth Weight]
  )
```

Equivalent:

```text
Effective Attribute
= round(
    Natural Attribute
    × [1 + ((Level - 1) / 21.7)^2 × Attribute Growth Weight]
  )
```

At Level 1:

```text
Effective Attribute = Natural Attribute
```

At Weight `1.0`, the growth shape matches the Player HP/MP Level growth multiplier, reaching approximately `21.81×` at Level 100.

Weight changes only the Level-derived growth component:

```text
0.0 → no Level growth
0.5 → half standard growth
1.0 → standard growth
1.5 → 1.5× standard growth component
```

This lets Goblins favour DEX while Ogres favour STR/CON, even though every Monster shares the same global Level curve.

---

# 6. Per-Instance Spawn Generation

Every spawned Monster runs the complete generation pipeline independently.

```text
1. Read Monster Template
2. Roll STR / DEX / CON / POW / INT / SIZ independently
3. Resolve base Attribute rolls
4. Roll Elite check for this instance
5. If Elite, apply Elite Attribute Bonus
6. Save post-Elite values as Natural Attributes
7. Apply global Level curve + Template Growth Weights
8. Save Effective Attributes
9. Recalculate derived combat/resource values
10. Allow GM final adjustment
11. Save/use this individual Monster instance
```

Spawning 5 Goblins means the full pipeline runs 5 separate times. The system must never roll once and clone the result.

---

# 7. Automatic Elite Check

Each spawned Ordinary Monster independently makes an Elite check after the base Attribute rolls.

```text
Elite Chance = 10%
```

If successful:

```text
Elite Attribute Bonus = random integer from 1 to 5
```

One bonus value is rolled and added to all six core Attributes before Natural Attributes are finalized.

Example:

```text
Base:
STR 2 / DEX 3 / CON 1 / POW 2 / INT 1 / SIZ 2

Elite Bonus = +4

Natural:
STR 6 / DEX 7 / CON 5 / POW 6 / INT 5 / SIZ 6
```

Because Elite Bonus becomes part of Natural Attributes, it is subsequently affected by Level scaling.

Elite status and Elite Bonus must be stored per Monster instance.

---

# 8. GM Final Adjustment

After automatic generation, Level scaling and derived-stat calculation, GM may manually adjust the spawned Monster's final values.

This is an authorised instance-level adjustment and must not silently mutate the Monster Template.

Where practical, D1/audit history should distinguish:

```text
Base roll
Elite bonus
Natural value
Calculated Effective value
GM adjustment
Final value
```

---

# 9. GM Monster Management Tab

The GM workspace must include a dedicated **Monster Management** tab/page.

GM can maintain Monster Templates including:

```text
Name / description
STR min / max + STR Growth Weight
DEX min / max + DEX Growth Weight
CON min / max + CON Growth Weight
POW min / max + POW Growth Weight
INT min / max + INT Growth Weight
SIZ min / max + SIZ Growth Weight
Default / allowed Level information
Elite settings where configurable
Ability/profile links when later defined
Notes
```

GM can also inspect spawned Monster instances including:

```text
Template source
Monster Level
Base Attribute rolls
Elite result / Elite Bonus
Natural STR / DEX / CON / POW / INT / SIZ
GlobalGrowth(Level)
Template Growth Weights
Effective STR / DEX / CON / POW / INT / SIZ
Derived values
GM final adjustments
Final current state
```

Template editing affects future Template behaviour; instance editing affects only that Monster unless GM explicitly edits the Template.

---

# 10. D1 / Alpha Implementation Requirement

D1 must distinguish at least:

```text
Monster Template
→ six Attribute min/max ranges
→ six Attribute Growth Weights
→ spawn/default settings

Monster Instance
→ Monster Level
→ six base rolled Attributes
→ Elite result
→ Elite Attribute Bonus
→ six Natural Attributes
→ six Effective Attributes
→ derived stats
→ GM adjustments
→ final state
```

Changing Monster Level recalculates Effective Attributes from preserved Natural Attributes. It never rerolls Natural Attributes.

---

# 11. Still To Be Decided

The remaining Monster/NPC items are:

- HP / MP generation and scaling from Effective Attributes;
- Attack / Defence values;
- Boss-specific generation/modifiers beyond the automatic Elite rule;
- Skill / D100 handling;
- Ability handling;
- Status / Resistance / Immunity fields;
- EXP rewards;
- NPC progression behaviour;
- encounter difficulty contribution.
