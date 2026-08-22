# Monster / NPC System — Alpha

> Status: Canonical Alpha Rule  
> Date: 2026-08-22  
> Scope: Structural model for Simplified Monsters, Elite/Boss profiles and Full Character NPCs. Read with `MONSTER_LEVEL_SCALING_ALPHA.md`, `MONSTER_ATTACK_PROFILE_ALPHA.md`, and `GM_MONSTER_MANAGEMENT_ALPHA.md`.

---

# 1. Hybrid Model

Alpha uses a **Hybrid Monster / NPC Model**.

## Ordinary / Disposable Monsters

Use the Simplified Monster Profile with exactly six mandatory core Attributes:

```text
STR
DEX
CON
POW
INT
SIZ
```

`APP / EDU / LUCK` are not mandatory.

## Elite / Boss

May use richer Monster Profiles where mechanics require them; they are not automatically forced into the full Player model.

## Important / Persistent NPCs

May use the Full Character Model.

---

# 2. Template Attribute Ranges

Each Simplified Monster Template stores inclusive min/max ranges for all six Attributes.

Example:

```text
Goblin
STR 1–3
DEX 1–3
CON 1–3
POW 1–3
INT 1–3
SIZ 1–3
```

Every spawn rolls all six independently.

Monster Level never widens or replaces these natural Template ranges.

---

# 3. Natural / Effective Attribute Layers

```text
Template Roll
→ Elite Bonus, if any
→ Natural Attribute
→ Monster Level Scaling
→ Effective Attribute
```

Natural Attributes preserve generated identity.

Effective Attributes are the Level-adjusted live values.

Canonical Level scaling:

```text
GlobalGrowth(Level)
= ((Level - 1) / 21.7)^2

Effective Attribute
= round(
    Natural Attribute
    × [1 + GlobalGrowth(Level) × Attribute Growth Weight]
  )
```

Each Template has independent Growth Weights for:

```text
STR / DEX / CON / POW / INT / SIZ
```

At Level 1:

```text
Effective = Natural
```

---

# 4. Elite Generation

Each Ordinary Monster independently rolls:

```text
Elite Chance = 10%
```

If Elite:

```text
Elite Attribute Bonus = one random integer +1..+5
```

The same rolled bonus is added to all six base Attributes before Natural Attributes are finalized.

Because the Elite Bonus becomes part of Natural Attributes, it is subsequently Level-scaled.

---

# 5. Locked Monster Resources

Simplified Monster HP:

```text
Calculated Max HP
= ceil((Effective CON + Effective SIZ) / 2)
```

Simplified Monster MP:

```text
Calculated Max MP
= Effective INT × 3
```

Neither receives a second application of the global Attribute Level curve.

GM may perform final instance-level Max / Current HP and MP adjustments while calculated values remain preserved.

---

# 6. Dedicated Monster Skills

Simplified Monster offensive actions use dedicated **Monster Skill Profiles** rather than the Player weapon-proficiency progression model.

A Skill may define:

```text
Name
Stored Accuracy
Damage Type
Template Base Damage
Damage Growth Weight
Template Lower Variance / Growth Weight
Template Upper Variance / Growth Weight
Damage Attribute Links
Range / targeting
Status / special effects
MP cost
Cooldown
Usage restrictions
```

---

# 7. Independent Accuracy with Over-100 Storage

Monster Skill Accuracy is an independent Skill property.

It is not derived from Monster STR / DEX / other Attributes.

Stored Accuracy may exceed `100`.

Canonical:

```text
Modified Accuracy
= Stored Accuracy + Total Hit Modifier

Effective Accuracy
= min(100, Modified Accuracy)
```

Only Effective Accuracy enters the D100 threshold.

This means Accuracy above 100 acts as reserve against future penalties.

Example:

```text
Stored Accuracy 130
Penalty -40
→ Effective Accuracy 90
```

Example:

```text
Stored Accuracy 130
Penalty -20
→ Modified 110
→ Effective Accuracy 100
```

Monster Skill Accuracy is not subject to the Player natural Skill cap of 98.

Whether raw D100 `1` still forces Great Failure when Effective Accuracy reaches 100 remains a separate unresolved D100 interaction.

---

# 8. Damage Attribute Links

Monster Skill Accuracy is independent, but **Skill damage may explicitly link to Monster Attributes**.

Each damaging Skill may select zero, one or multiple:

```text
STR
DEX
CON
POW
INT
SIZ
```

Use current **Effective Attributes**.

For one selection:

```text
Damage Attribute Basis
= selected Effective Attribute
```

For multiple selections:

```text
Damage Attribute Basis
= sum(selected Effective Attributes)
  / number of selected Attributes
```

Examples:

```text
STR 40 + DEX 20
→ Basis 30
```

```text
STR 30 + DEX 24 + SIZ 36
→ Basis 30
```

This basis contributes to Skill damage, not Skill Accuracy.

The exact numerical lower/upper damage contribution formula is still unresolved.

---

# 9. Template-Side Monster Damage Scaling

Locked global damage growth term:

```text
MonsterDamageGrowth(Level)
= 7 × ((Level - 1) / 99)^1.5
```

Per damaging Skill:

```text
Calculated Base Damage
= round(
    Template Base Damage
    × [1 + MonsterDamageGrowth(Level) × Damage Growth Weight]
  )
```

Standard `Damage Growth Weight = 1.0` gives 1× at Lv1 and 8× at Lv100.

This is now the **Template-side damage component**. It is not the complete final damage-range formula where Damage Attribute Links are present.

---

# 10. Asymmetric Variance

Each damaging Skill stores independent lower and upper variance values.

```text
Calculated Lower Variance
= round(
    Template Lower Variance
    × [1 + MonsterDamageGrowth(Level) × Lower Variance Growth Weight]
  )

Calculated Upper Variance
= round(
    Template Upper Variance
    × [1 + MonsterDamageGrowth(Level) × Upper Variance Growth Weight]
  )
```

Canonical defaults:

```text
Lower Variance Growth Weight = 1.50
Upper Variance Growth Weight = 2.00
```

This intentionally allows high-Level Skills to have a higher ceiling and a lower relative floor.

Final raw damage can never be below 0.

---

# 11. Current Skill Damage Pipeline

```text
Template damage values
→ Monster damage Level curve
→ Base / lower / upper calculated components

Damage Attribute Links
→ selected Effective Attributes
→ arithmetic-mean Damage Attribute Basis

calculated Template-side components
+ Damage Attribute Basis
→ final Skill Damage Range Resolver
→ GM adjustments
→ Final Minimum / Maximum Raw Damage
```

The exact formula joining the Attribute Basis to the lower / upper limits remains pending and must not be invented by implementation.

---

# 12. Full Spawn Pipeline

```text
1. Read Template
2. Roll six Attributes independently
3. Roll Elite check
4. Apply Elite Bonus if any
5. Save Natural Attributes
6. Apply Level curve + six Attribute Growth Weights
7. Save Effective Attributes
8. Calculate HP / MP
9. Attach Monster Skills
10. Preserve Stored Accuracy values, including >100
11. Resolve each Skill's selected Damage Attribute Links
12. Calculate Damage Attribute Basis values
13. Calculate Template-side Skill damage components
14. Resolve final damage ranges once the Attribute contribution formula is locked
15. Allow GM final adjustments
16. Save/use instance
```

Group spawn runs the full pipeline independently for every Monster.

---

# 13. GM / D1 Requirements

D1 must preserve enough data to distinguish:

```text
Monster Template
→ Attribute ranges / Growth Weights
→ Skill definitions
→ Stored Accuracy
→ damage settings
→ Damage Attribute Links

Monster Instance
→ Level
→ base rolls
→ Elite result / bonus
→ Natural Attributes
→ Effective Attributes
→ calculated HP / MP
→ per-Skill Accuracy calculations
→ per-Skill linked Attribute values / Basis
→ calculated damage components
→ GM overrides
→ final state
```

Changing Level recalculates Effective Attributes from preserved Natural values and never rerolls Natural Attributes.

---

# 14. GM Final Adjustment

GM may adjust a generated Monster Instance after automatic generation and calculation.

Instance adjustment does not mutate the reusable Template unless GM explicitly edits it.

Template, calculated and GM-adjusted layers should remain auditable.

---

# 15. Current Unresolved Items

Resolve separately:

1. Effective Accuracy 100 vs raw D100 `1` / Great Failure interaction;
2. exact Damage Attribute Basis → lower / upper damage formula;
3. whether Monster Skill Accuracy itself automatically scales with Level;
4. Boss-specific generation / modifiers beyond the ordinary Elite rule;
5. Skill status / Resistance / Immunity details;
6. Monster EXP rewards;
7. NPC progression behaviour;
8. encounter difficulty contribution.
