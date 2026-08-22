# Monster / NPC System — Alpha

> Status: Canonical Alpha Rule  
> Date: 2026-08-22  
> Scope: Structural model for Simplified Monsters, Elite/Boss profiles and Full Character NPCs. Read with `MONSTER_LEVEL_SCALING_ALPHA.md`, `MONSTER_ATTACK_PROFILE_ALPHA.md`, and `GM_MONSTER_MANAGEMENT_ALPHA.md`.

---

# 1. Hybrid Model

Alpha uses a **Hybrid Monster / NPC Model**.

Ordinary / disposable Monsters use the Simplified Monster Profile with exactly six mandatory core Attributes:

```text
STR
DEX
CON
POW
INT
SIZ
```

`APP / EDU / LUCK` are not mandatory.

Elite and Boss enemies may use richer Monster Profiles where mechanics require them. Important / persistent NPCs may use the Full Character Model.

---

# 2. Template Attribute Ranges

Each Simplified Monster Template stores inclusive min/max ranges for all six Attributes.

Every spawn rolls all six independently. Monster Level never widens or replaces these natural Template ranges.

---

# 3. Natural / Effective Attribute Layers

```text
Template Roll
→ Elite Bonus, if any
→ Natural Attribute
→ Monster Level Scaling
→ Effective Attribute
```

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

Each Template has independent Growth Weights for STR / DEX / CON / POW / INT / SIZ.

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

The same rolled bonus is added to all six base Attributes before Natural Attributes are finalized, then Level-scaled normally.

---

# 5. Locked Monster Resources

```text
Calculated Max HP
= ceil((Effective CON + Effective SIZ) / 2)

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

Monster Skill Accuracy is an independent Skill property and is not derived from Monster Attributes.

Stored Accuracy may exceed `100`.

Canonical:

```text
Modified Accuracy
= Stored Accuracy + Total Hit Modifier

Effective Accuracy
= min(100, Modified Accuracy)
```

Only Effective Accuracy enters the ordinary D100 threshold.

Accuracy above 100 therefore acts as reserve against future negative modifiers.

Monster Skill Accuracy is not subject to the Player natural Skill cap of 98.

---

# 8. Locked D100 Great Failure / Great Success Interaction

Monster Skills preserve the global raw D100 extreme rules:

```text
raw D100 = 1   → Great Failure
raw D100 = 100 → Great Success
```

These extreme results take precedence over the ordinary threshold.

Therefore when:

```text
Effective Accuracy = 100
```

resolution is:

```text
raw 1     → Great Failure
raw 2–99  → ordinary success
raw 100   → Great Success
```

Accuracy above 100 does not create absolute success by itself. Its normal role is to absorb negative Accuracy modifiers before the Effective Accuracy cap.

---

# 9. Damage Attribute Links

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

This basis contributes to Skill damage, not Skill Accuracy.

The exact numerical lower/upper damage contribution formula remains unresolved.

---

# 10. Template-Side Monster Damage Scaling

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

This is the Template-side damage component and is not the complete final damage-range formula where Damage Attribute Links are present.

---

# 11. Asymmetric Variance

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

Final raw damage can never be below 0.

---

# 12. Current Skill Damage Pipeline

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

# 13. Full Spawn Pipeline

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

# 14. GM / D1 Requirements

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
→ per-Skill raw D100 / extreme-result state when resolved
→ per-Skill linked Attribute values / Basis
→ calculated damage components
→ GM overrides
→ final state
```

Changing Level recalculates Effective Attributes from preserved Natural values and never rerolls Natural Attributes.

---

# 15. GM Final Adjustment

GM may adjust a generated Monster Instance after automatic generation and calculation.

Instance adjustment does not mutate the reusable Template unless GM explicitly edits it.

Template, calculated and GM-adjusted layers should remain auditable.

---

# 16. Current Unresolved Items

Resolve separately:

1. exact Damage Attribute Basis → lower / upper damage formula;
2. whether Monster Skill Accuracy itself automatically scales with Level;
3. Boss-specific generation / modifiers beyond the ordinary Elite rule;
4. Skill status / Resistance / Immunity details;
5. Monster EXP rewards;
6. NPC progression behaviour;
7. encounter difficulty contribution.
