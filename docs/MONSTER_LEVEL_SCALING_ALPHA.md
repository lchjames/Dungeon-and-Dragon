# Monster Level Scaling — Alpha

> Status: Canonical Alpha Rule
> Date: 2026-08-21
> Scope: Defines the locked conversion from Monster Natural Attributes into Effective Attributes after per-instance generation and Elite adjustment, plus Monster HP/MP derivation from Effective Attributes.
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

---

# 2. Locked Global Monster Level Curve

```text
GlobalGrowth(Level)
= ((Level - 1) / 21.7)^2
```

At Level 1:

```text
GlobalGrowth(1) = 0
```

At Weight `1.0`, the total multiplier is:

```text
1 + GlobalGrowth(Level)
```

Selected standard-weight multipliers:

| Level | Multiplier |
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

---

# 3. Natural → Effective Attribute Formula

For each Attribute independently:

```text
Effective Attribute
= round(
    Natural Attribute
    × [1 + ((Level - 1) / 21.7)^2 × Attribute Growth Weight]
  )
```

Applies to:

```text
STR
DEX
CON
POW
INT
SIZ
```

At Level 1:

```text
Effective Attribute = Natural Attribute
```

Changing Monster Level recalculates Effective Attributes but never rerolls or overwrites Natural Attributes.

---

# 4. Growth Weight Meaning

```text
Weight 0.0
→ no Level-based growth

Weight 0.5
→ half standard Level-derived growth

Weight 1.0
→ standard global growth

Weight 1.5
→ 1.5× standard Level-derived growth
```

Growth Weight affects only the Level-derived component.

---

# 5. Generation / Calculation Order

```text
Template Range
→ Base Attribute Roll
→ Elite check
→ Elite Bonus, if any
→ Natural Attributes
→ Global Level Curve + Template Growth Weights
→ Effective Attributes
→ HP / MP / other Derived Stats
→ GM Final Adjustment
```

Elite Bonus is part of the Natural Attribute layer and therefore benefits from later Level scaling.

---

# 6. Locked Monster HP Formula

Simplified Monster Max HP is derived from Effective CON and Effective SIZ:

```text
Calculated Max HP
= ceil((Effective CON + Effective SIZ) / 2)
```

Rules:

1. Effective CON/SIZ already include Level scaling.
2. HP does not receive the global Level curve a second time.
3. No default Monster HP Weight is applied.
4. Spawned Monsters normally begin with `Current HP = Final Max HP` unless GM deliberately creates an injured instance.
5. GM may make an authorised final instance-level Max HP or Current HP adjustment.
6. Calculated Max HP must remain distinguishable from GM adjustment and Final Max HP.

---

# 7. Locked Monster MP Formula

Simplified Monster Max MP is derived directly from Effective INT using the same `INT × 3` basis as the Player resource model:

```text
Calculated Max MP
= Effective INT × 3
```

Rules:

1. Effective INT already includes Monster Level scaling and the Template INT Growth Weight.
2. MP therefore does **not** receive the global Level curve a second time.
3. Effective POW is not part of the default Max MP formula.
4. No default Monster MP Weight is applied.
5. Spawned Monsters normally begin with `Current MP = Final Max MP` unless GM deliberately sets another state.
6. GM may make an authorised final instance-level Max MP or Current MP adjustment.
7. Calculated Max MP must remain distinguishable from GM adjustment and Final Max MP.

Example:

```text
Effective INT = 20
Calculated Max MP = 20 × 3 = 60
```

---

# 8. Resource Adjustment / Recalculation Principle

When Monster Level, Natural Attributes, Template Growth Weights or other upstream inputs change, the server recalculates Effective Attributes and then recalculates Calculated Max HP / MP.

Automatic calculation must not erase GM-authored final adjustments or historical/audit information. The implementation should preserve an explainable chain such as:

```text
Effective INT
→ Calculated Max MP
→ GM Max MP Adjustment
→ Final Max MP
→ Current MP
```

and:

```text
Effective CON / SIZ
→ Calculated Max HP
→ GM Max HP Adjustment
→ Final Max HP
→ Current HP
```

Exact Current-resource reconciliation during later recalculation should follow the project's canonical permanent Max-resource reconciliation rules unless a Monster-specific override is explicitly locked.

---

# 9. GM Monster Management Requirement

For each spawned instance the GM UI should expose:

```text
Natural Attributes
Monster Level
Template Growth Weights
GlobalGrowth(Level)
Effective Attributes
Calculated Max HP
HP GM adjustment
Final Max HP / Current HP
Calculated Max MP
MP GM adjustment
Final Max MP / Current MP
```

so all final resource values are explainable and auditable.

---

# 10. Locked Conclusions

1. Global Monster Level growth is `((Level - 1) / 21.7)^2`.
2. Effective Attribute = `round(Natural × [1 + GlobalGrowth × Weight])`.
3. Each Template has six independent Attribute Growth Weights.
4. Level 1 preserves `Effective = Natural`.
5. Elite Bonus is applied before Level scaling.
6. Monster Max HP = `ceil((Effective CON + Effective SIZ) / 2)`.
7. Monster Max MP = `Effective INT × 3`.
8. Neither HP nor MP receives a second Level multiplier after Effective Attributes are calculated.
9. Effective POW is not used by the default Max MP formula.
10. GM may finally adjust Max HP, Current HP, Max MP and Current MP at instance level while calculated values remain auditable.

---

# 11. Next Unresolved Monster Design Item

The next Monster-system decision is the ordinary Monster Attack / Defence model and how Simplified Monsters participate in D100 combat checks.
