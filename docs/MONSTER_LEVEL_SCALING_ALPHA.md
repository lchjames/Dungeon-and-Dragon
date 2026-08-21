# Monster Level Scaling — Alpha

> Status: Canonical Alpha Rule
> Date: 2026-08-21
> Scope: Defines the locked conversion from Monster Natural Attributes into Effective Attributes after per-instance generation and Elite adjustment.
> Use together with `MONSTER_NPC_SYSTEM_ALPHA.md` and `GM_MONSTER_MANAGEMENT_ALPHA.md`.

---

# 1. Locked Scaling Architecture

Monster Level scaling uses:

```text
Global Monster Level Curve
×
Monster Template Attribute Growth Weight
```

All Simplified Monsters share one global Level-growth curve, while each Monster Template stores a separate growth weight for each of its six core Attributes:

```text
STR Growth Weight
DEX Growth Weight
CON Growth Weight
POW Growth Weight
INT Growth Weight
SIZ Growth Weight
```

This preserves species/template identity at high Level instead of making every Monster scale into the same stat profile.

---

# 2. Locked Global Monster Level Curve

The Global Monster Level Curve uses the same quadratic growth term already used by Player HP/MP progression:

```text
GlobalGrowth(Level)
= ((Level - 1) / 21.7)^2
```

Therefore:

```text
GlobalGrowth(1) = 0
```

and a standard Weight `1.0` produces the same overall Level multiplier shape as the Player resource growth curve:

```text
1 + GlobalGrowth(Level)
```

Selected standard-weight multipliers:

| Level | Standard Multiplier at Weight 1.0 |
|---:|---:|
| 1 | 1.00× |
| 10 | ~1.17× |
| 20 | ~1.77× |
| 30 | ~2.79× |
| 40 | ~4.23× |
| 50 | ~6.10× |
| 60 | ~8.39× |
| 70 | ~11.11× |
| 75 | ~12.63× |
| 80 | ~14.25× |
| 85 | ~15.98× |
| 90 | ~17.82× |
| 95 | ~19.76× |
| 99 | ~21.40× |
| 100 | ~21.81× |

The Monster system therefore deliberately permits very large high-Level Effective Attributes when a Template uses standard or high Growth Weights.

---

# 3. Locked Natural → Effective Formula

For each Attribute independently:

```text
Effective Attribute
= round(
    Natural Attribute
    × [1 + GlobalGrowth(Level) × Attribute Growth Weight]
  )
```

Equivalent expanded form:

```text
Effective Attribute
= round(
    Natural Attribute
    × [1 + ((Level - 1) / 21.7)^2 × Attribute Growth Weight]
  )
```

This formula applies independently to:

```text
STR
DEX
CON
POW
INT
SIZ
```

The Template supplies a separate Growth Weight for each Attribute.

---

# 4. Growth Weight Meaning

Growth Weight only controls the Level-derived growth component.

Canonical meanings:

```text
Weight 0.0
→ no Level-based growth
→ Effective Attribute remains Natural Attribute

Weight 0.5
→ half of the standard global Level growth

Weight 1.0
→ standard global Level growth

Weight 1.5
→ 1.5× the standard Level-derived growth component
```

A Template is therefore free to scale different Attributes at different rates.

Example direction:

```text
Goblin
STR Weight  = lower
DEX Weight  = higher
CON Weight  = medium
POW Weight  = lower
INT Weight  = lower
SIZ Weight  = very low

Ogre
STR Weight  = higher
DEX Weight  = lower
CON Weight  = higher
POW Weight  = lower
INT Weight  = lower
SIZ Weight  = higher
```

Exact default Template weights are defined per Monster Template by GM/data configuration rather than globally hard-coded by species name.

---

# 5. Level 1 Invariant

At Level 1:

```text
GlobalGrowth(1) = 0
```

so:

```text
Effective Attribute
= round(Natural Attribute × 1)
= Natural Attribute
```

for all six Simplified Monster Attributes before any later GM final adjustment.

Template Growth Weight can never make a Level 1 Monster stronger or weaker by itself.

---

# 6. Relationship to Natural / Effective Attributes

Generation order remains:

```text
Template Range
→ Base Attribute Roll
→ Elite check
→ Elite Bonus, if any
→ Natural Attributes
→ Global Level Curve + Template Growth Weights
→ Effective Attributes
→ Derived Stats
→ GM Final Adjustment
```

The Level system must never reroll or overwrite stored Natural Attributes.

Changing Monster Level recalculates Effective Attributes from the preserved Natural Attributes and the Template Growth Weights.

All ordinary derived Monster calculations that depend on Attributes use Effective values unless a specific rule explicitly asks for Natural values.

---

# 7. Example

Assume a Goblin has:

```text
Natural STR = 3
Natural DEX = 3
Level = 100
```

and its Template uses:

```text
STR Growth Weight = 0.5
DEX Growth Weight = 1.0
```

At Level 100:

```text
GlobalGrowth ≈ 20.81
```

Therefore:

```text
Effective STR
= round(3 × [1 + 20.81 × 0.5])
≈ 34

Effective DEX
= round(3 × [1 + 20.81 × 1.0])
≈ 65
```

The same Natural roll can therefore become strongly DEX-biased at high Level because the Goblin Template gives DEX a higher growth weight.

---

# 8. Template-Level Configuration

The Monster Template stores six independent Growth Weights:

```text
STR
DEX
CON
POW
INT
SIZ
```

These are Template configuration values, not per-spawn random rolls.

Two spawned Monsters from the same Template may have different Natural Attributes because of random generation, but normally share the same Growth Weights.

Template editing must not erase existing Monster Instance Natural Attributes or historical generation/audit data.

---

# 9. GM Monster Management Requirement

The GM Monster Management tab must expose each Attribute range together with its Growth Weight:

```text
STR min / max + STR Growth Weight
DEX min / max + DEX Growth Weight
CON min / max + CON Growth Weight
POW min / max + POW Growth Weight
INT min / max + INT Growth Weight
SIZ min / max + SIZ Growth Weight
```

For a spawned instance, the GM inspection view should expose the calculation chain:

```text
Natural Attribute
Monster Level
Template Growth Weight
GlobalGrowth(Level)
Effective Attribute
GM final adjustment
```

so the final value is explainable and auditable.

---

# 10. Locked Conclusions

1. All Simplified Monsters use one global quadratic Level-growth curve.
2. The global growth term is `((Level - 1) / 21.7)^2`.
3. Each Template stores six independent Attribute Growth Weights.
4. Effective Attribute uses `round(Natural × [1 + GlobalGrowth × Weight])`.
5. Level 1 always preserves `Effective = Natural` before GM adjustment.
6. Elite Bonus is applied before the Natural layer is finalized and therefore scales with Level afterwards.
7. Changing Level does not reroll Natural Attributes.
8. Derived combat/resource values use Effective Attributes unless a specific rule says otherwise.
9. GM may still apply an authorised final instance adjustment after automatic calculation.

---

# 11. Next Unresolved Monster Design Item

The next decision is how Monster HP and MP are derived from the six Effective Attributes and whether those Resources receive any additional Monster-specific scaling beyond the Effective Attribute layer.
