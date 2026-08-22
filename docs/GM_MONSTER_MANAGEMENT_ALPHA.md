# GM Monster Management — Alpha

> Status: Canonical Alpha Rule  
> Date: 2026-08-22  
> Scope: Defines the GM-facing Monster Management workspace for the Hybrid Monster/NPC system, including dedicated Monster Skills, over-100 Accuracy storage, Attribute-linked damage, one dedicated Skill Base-Damage Level curve, locked lower/upper Attribute ratios, and instance overrides.

---

# 1. Dedicated GM Workspace

The GM workspace must include a dedicated `Monster Management` page/tab for:

```text
Monster Templates
Monster Skill Profiles
spawned Monster Instances
instance-level GM adjustments
```

All persistent Monster data is D1-authoritative.

---

# 2. Monster Template Attributes

Required Simplified Monster Attribute configuration:

```text
STR min / max + STR Growth Weight
DEX min / max + DEX Growth Weight
CON min / max + CON Growth Weight
POW min / max + POW Growth Weight
INT min / max + INT Growth Weight
SIZ min / max + SIZ Growth Weight
```

Template editing must not silently erase spawned-instance history.

---

# 3. Spawn Workflow

For every spawned instance:

```text
1. Roll STR / DEX / CON / POW / INT / SIZ independently from Template ranges
2. Roll 10% Elite check
3. If Elite, roll one +1..+5 Elite Bonus and add it to all six Attributes
4. Save post-Elite values as Natural Attributes
5. Calculate GlobalGrowth(Level) = ((Level - 1) / 21.7)^2
6. Apply six Attribute Growth Weights
7. Calculate Effective Attributes
8. Calculate Max HP = ceil((Effective CON + Effective SIZ) / 2)
9. Calculate Max MP = Effective INT × 3
10. Attach approved Monster Skill Profiles
11. Preserve each Skill's Stored Accuracy, including values above 100
12. Resolve each Skill's Damage Attribute Links against current Effective Attributes
13. Calculate Damage Attribute Basis for linked Skills
14. Calculate MonsterDamageGrowth(Level) = 7 × ((Level - 1) / 99)^1.5
15. Calculate each damaging Skill's Level-adjusted Base Damage
16. Calculate Attribute-derived Lower / Upper Contributions from the Skill ratios
17. Calculate Minimum / Maximum Raw Damage
18. Save instance
19. Permit GM final adjustments
```

Group spawn runs the complete pipeline independently for every Monster.

---

# 4. Resource Handling

```text
Calculated Max HP = ceil((Effective CON + Effective SIZ) / 2)
Calculated Max MP = Effective INT × 3
```

HP/MP do not receive the global Level curve a second time because Effective Attributes already include Level scaling.

GM may adjust final/current HP and MP at instance level while calculated and manual values remain separate.

---

# 5. Monster Skill Profile Fields

Each Monster Skill Profile may expose:

```text
Skill Name
Stored Accuracy
Damage Type
Template Base Damage
Damage Growth Weight
Template Lower Spread
Template Upper Spread
Damage Attribute Links
Lower Attribute Ratio
Upper Attribute Ratio
Range / Reach
Targeting
Status / special-effect links
MP cost
Cooldown
Usage restrictions
Other approved flags
```

The former fields:

```text
Lower Variance Growth Weight
Upper Variance Growth Weight
```

are superseded and must not be required by the current Simplified Monster Skill editor.

---

# 6. Accuracy Rules

Stored Skill Accuracy may exceed 100.

```text
Modified Accuracy
= Stored Skill Accuracy + Total Hit Modifier

Effective Accuracy
= min(100, Modified Accuracy)
```

Monster Skill Accuracy is not subject to the Player natural Skill cap of 98.

Raw D100 extremes remain:

```text
1   → Great Failure
100 → Great Success
```

These extreme results take precedence over the ordinary threshold.

---

# 7. Accuracy Is Not Attribute-Derived

Standard Simplified Monster Skills do not calculate Accuracy from STR / DEX / CON / POW / INT / SIZ, Effective Attributes, Attack Proficiency or Player weapon specialization.

The older fields are superseded:

```text
Primary Effective Attribute for Accuracy
Attack Proficiency
Attribute-Derived Hit Value
```

Attributes may instead be explicitly linked to damage or other Skill effects.

---

# 8. Damage Attribute Links — GM Multi-Select

Each damaging Skill may provide:

```text
☐ STR
☐ DEX
☐ CON
☐ POW
☐ INT
☐ SIZ
```

The selected set is stored as `Damage Attribute Links`.

Selecting no Attribute is valid for a purely Profile-defined damage Skill.

For one selected Attribute:

```text
Damage Attribute Basis
= selected Effective Attribute
```

For multiple selected Attributes:

```text
Damage Attribute Basis
= sum(selected Effective Attributes)
  / selected Attribute count
```

Use **Effective Attributes** so Elite and Monster Level effects flow naturally into linked Skill damage.

This basis does not modify Accuracy.

---

# 9. Locked Skill Base-Damage Level Curve

The Monster Skill's dedicated Base-Damage Level curve remains:

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

Standard Weight `1.0` reaches 8× Template Base Damage at Level 100.

This remains the only dedicated Monster Level curve inside the Skill damage-range subsystem.

---

# 10. Locked Attribute-Ratio Damage Range

Each damaging Skill stores:

```text
Template Lower Spread
Template Upper Spread
Lower Attribute Ratio
Upper Attribute Ratio
```

The Template Spread values are static Profile baseline spread and do not have Level Growth Weights.

Canonical Attribute contribution formulas:

```text
Attribute-derived Lower Contribution
= round(Damage Attribute Basis × Lower Attribute Ratio)

Attribute-derived Upper Contribution
= round(Damage Attribute Basis × Upper Attribute Ratio)
```

Canonical range formulas:

```text
Calculated Minimum Raw Damage
= max(
    0,
    Calculated Base Damage
    - Template Lower Spread
    - Attribute-derived Lower Contribution
  )

Calculated Maximum Raw Damage
= Calculated Base Damage
  + Template Upper Spread
  + Attribute-derived Upper Contribution
```

If a Skill has no Damage Attribute Links, its Attribute-derived contributions are `0`.

The two ratios remain independent so Skill design may intentionally widen the upper ceiling more than the lower side.

Default ratio values remain a separate unresolved tuning decision.

---

# 11. Superseded Lower / Upper Level Curves

Do not calculate:

```text
Lower Spread × MonsterDamageGrowth(Level)
Upper Spread × MonsterDamageGrowth(Level)
```

and do not use the former standard variance-growth defaults:

```text
Lower Growth Weight = 1.50
Upper Growth Weight = 2.00
```

Monster Level already affects damage through:

```text
Level → Calculated Base Damage
Level → Effective Attributes → Damage Attribute Basis
```

No third Lower / Upper Level curve is permitted in the standard Simplified Monster Skill model.

---

# 12. Spawned Skill Inspection

For every spawned Monster Skill, GM should be able to inspect:

```text
Skill Name
Stored Accuracy
active Hit Modifiers
Modified Accuracy
Effective Accuracy capped at 100
raw D100 / extreme-result state

Damage Attribute Links
current linked Effective Attribute values
Damage Attribute Basis

Template Base Damage
MonsterDamageGrowth(Level)
Damage Growth Weight
Calculated Base Damage
GM Base Damage Adjustment

Template Lower Spread
Template Upper Spread
Lower Attribute Ratio
Upper Attribute Ratio
Attribute-derived Lower Contribution
Attribute-derived Upper Contribution
Calculated Minimum Raw Damage
Calculated Maximum Raw Damage
GM lower / upper damage adjustments
Final Minimum Raw Damage
Final Maximum Raw Damage

Damage Type
Status / special-effect references
MP / cooldown / usage state
```

Automatic, Template and GM-adjusted values must remain visually distinguishable.

---

# 13. Template vs Instance Editing

```text
Edit Template Skill
→ changes reusable Skill definition / future use

Edit Spawned Skill Override
→ changes only that Monster instance
```

Persistent instances must not silently lose historical calculated values or overrides after Template edits.

---

# 14. Superseded Simplified Monster Fields

Do not require:

```text
Primary Effective Attribute for Accuracy
Attack Proficiency
Attribute-Derived Hit Value
damage dice
Player STR + SIZ Damage Bonus
single symmetric Damage Variance
Lower Variance Growth Weight
Upper Variance Growth Weight
```

The current model uses:

```text
independent Stored Accuracy
Effective Accuracy capped at 100 after modifiers
raw D100 extreme handling
Damage Attribute Links
Damage Attribute Basis from Effective Attributes
one Skill Base-Damage Level curve
static Template Lower / Upper Spread
Lower / Upper Attribute Ratio
Attribute-derived lower / upper contribution
GM adjustments
final damage range
```

---

# 15. Current Unresolved Items

Resolve separately:

1. default `Lower Attribute Ratio` and `Upper Attribute Ratio` for a new standard damaging Monster Skill;
2. whether Monster Skill Accuracy itself automatically scales with Level;
3. later Elite / Boss / richer-profile exceptions where needed.
