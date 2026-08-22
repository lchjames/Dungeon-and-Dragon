# Monster Skill Profile — Alpha

> Status: Canonical Alpha Override  
> Date: 2026-08-22  
> Scope: Defines Simplified Monster dedicated Skills, including independent per-Skill Accuracy, over-100 Accuracy storage, D100 extreme-result precedence, Attribute-linked damage, and the current `Base Damage + Attribute Basis ± Spread` damage-band architecture.  
> This file supersedes older Monster-specific wording that derived hit chance from Effective Attributes / Attack Proficiency, used Attribute Ratios to widen damage, or gave Lower / Upper spread their own Monster Level curves.

---

# 1. Core Monster Skill Profile

A Simplified Monster Skill may define:

```text
Skill Name
Stored Accuracy
Damage Type
Template Base Damage
Damage Growth Weight
Template Lower Spread
Template Upper Spread
Damage Attribute Links
Range / Reach
Targeting
Status / special effects
MP cost
Cooldown
Usage restrictions
Other approved Skill flags
```

Accuracy and damage remain separate properties.

---

# 2. Independent Skill Accuracy

```text
Monster Skill Accuracy
= independent value stored on that Skill Profile
```

Stored Accuracy may exceed `100` and is not subject to the Player natural Skill-value cap of `98`.

```text
Modified Accuracy
= Stored Skill Accuracy + Total Hit Modifier

Effective Accuracy
= min(100, Modified Accuracy)
```

Accuracy above 100 acts as reserve against later negative Accuracy modifiers.

Accuracy is not automatically calculated from STR / DEX / CON / POW / INT / SIZ, Natural Attributes, Effective Attributes, Attack Proficiency, Player weapon specialization, or Player Skill Point progression.

---

# 3. Locked D100 Extreme Results

```text
raw D100 = 1   → Great Failure
raw D100 = 100 → Great Success
```

These raw extremes take precedence over the ordinary success threshold.

Even when `Effective Accuracy = 100`:

```text
raw 1     → Great Failure
raw 2–99  → ordinary success
raw 100   → Great Success
```

---

# 4. Damage Attribute Links

Each damaging Monster Skill may select zero, one or multiple Attribute links from:

```text
STR
DEX
CON
POW
INT
SIZ
```

Use current **Effective Attributes**.

One selected Attribute:

```text
Damage Attribute Basis
= selected Effective Attribute
```

Multiple selected Attributes:

```text
Damage Attribute Basis
= sum(selected Effective Attributes)
  / number of selected Attributes
```

The selected Attribute identifiers and their current Effective values must be preserved for audit/debugging.

Damage Attribute Basis affects damage only and does not alter Skill Accuracy by default.

---

# 5. Locked Base-Damage Level Curve

The Monster Skill Base Damage retains the dedicated Monster damage Level curve:

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

With `Damage Growth Weight = 1.0`:

```text
Lv1   → 1.00× Template Base Damage
Lv30  → ~2.11×
Lv50  → ~3.44×
Lv70  → ~5.07×
Lv90  → ~6.97×
Lv100 → 8.00× Template Base Damage
```

`Calculated Base Damage` is the Level-adjusted Skill base component used by the damage center formula below.

---

# 6. Locked Damage Center — Base Damage + Attribute Basis

The previous Attribute Ratio model is superseded.

Do **not** calculate Attribute-derived Lower / Upper Contributions using:

```text
Lower Attribute Ratio
Upper Attribute Ratio
```

and do not use the former default pair:

```text
0.10 / 0.50
```

Instead, for an Attribute-linked damaging Skill:

```text
Calculated Damage Center
= Calculated Base Damage + Damage Attribute Basis
```

If no Damage Attribute Links are selected:

```text
Damage Attribute Basis = 0
Calculated Damage Center = Calculated Base Damage
```

This means the Monster's relevant Effective Attribute value contributes directly to the Skill's central damage value rather than indirectly widening the damage band.

---

# 7. Lower / Upper Spread Is Applied After the Damage Center

Canonical damage-band structure:

```text
Calculated Minimum Raw Damage
= max(0, Calculated Damage Center - Final Lower Spread)

Calculated Maximum Raw Damage
= Calculated Damage Center + Final Upper Spread
```

The actual raw damage after a successful hit is a random integer within:

```text
Calculated Minimum Raw Damage
...
Calculated Maximum Raw Damage
```

The spread roll is not a second D100 action check and has no Great Success / Great Failure meaning.

---

# 8. Locked Design Intent for Spread

The spread exists to allow a successful hit to produce damage below or above the central value.

Canonical intent:

```text
Base Damage + Attribute Basis
→ central damage

low roll
→ central damage - Lower Spread

high roll
→ central damage + Upper Spread
```

At higher Monster power / Level:

```text
Lower Spread
→ may increase, but only modestly

Upper Spread
→ may increase more strongly
```

Therefore late-game low rolls can still deal less than the central damage, but the downside should be substantially smaller than the potential upside.

This asymmetry belongs to the Spread subsystem itself, not to an Attribute Ratio subsystem.

---

# 9. User-Confirmed Calculation Shape Example

Conceptual low-roll examples supplied during design:

```text
Lv1:
64 + 15 - 2
= 77

Lv2:
64 + 18 - 3
= 79
```

Read as:

```text
Base Damage
+ current Damage Attribute Basis
- current Lower Spread
```

The important locked structure is the order of operations:

```text
Base Damage
+ Attribute Basis
± Spread
```

The exact formula by which Lower Spread and Upper Spread themselves change with Level / Attributes is not yet locked.

---

# 10. Superseded Damage-Band Models

The following are superseded for standard Simplified Monster Skills:

```text
Lower Variance Growth Weight
Upper Variance Growth Weight

Lower Attribute Ratio
Upper Attribute Ratio

Attribute-derived Lower Contribution
Attribute-derived Upper Contribution
```

The current model instead uses:

```text
Calculated Base Damage
+ Damage Attribute Basis
→ Calculated Damage Center

Calculated Damage Center
- Final Lower Spread
→ Minimum Raw Damage

Calculated Damage Center
+ Final Upper Spread
→ Maximum Raw Damage
```

---

# 11. Runtime Skill Resolution

```text
Declare Monster Skill
→ Stored Accuracy + active Hit Modifiers
→ calculate Modified Accuracy
→ cap Effective Accuracy at 100
→ roll D100
→ raw 1: Great Failure
→ raw 100: Great Success
→ otherwise resolve ordinary hit / opposed threshold
→ miss: no normal hit damage
→ hit: use calculated / final Skill damage range
→ random integer inside Minimum–Maximum range
→ Defence / Resistance
→ Damage Result
→ HP loss only when Damage Result > 0
→ resolve approved secondary effects
```

---

# 12. GM / Audit Requirements

For each spawned Skill, preserve at least:

```text
Template Stored Accuracy
Current Hit Modifiers
Modified Accuracy
Effective Accuracy after 100 cap
raw D100 / Great Failure / Great Success state

Damage Attribute Links
selected Effective Attribute values
Damage Attribute Basis

Template Base Damage
MonsterDamageGrowth(Level)
Damage Growth Weight
Calculated Base Damage

Calculated Damage Center

Template / calculated Lower Spread inputs
Template / calculated Upper Spread inputs
Calculated Minimum Raw Damage
Calculated Maximum Raw Damage
GM lower / upper damage adjustments
Final Minimum Raw Damage
Final Maximum Raw Damage
```

Template, calculated and GM-adjusted values must remain distinguishable.

---

# 13. GM Skill Editor Requirements

For each Monster Skill Profile, the GM UI must support:

```text
Skill Name
Stored Accuracy — may exceed 100
Damage Type
Template Base Damage
Damage Growth Weight
Template Lower Spread
Template Upper Spread
Damage Attribute Links — multi-select STR / DEX / CON / POW / INT / SIZ
Range / Reach
Targeting
Status / special-effect links
MP cost
Cooldown
Usage restrictions
Other approved flags
```

The UI must no longer require:

```text
Lower Attribute Ratio
Upper Attribute Ratio
Lower Variance Growth Weight
Upper Variance Growth Weight
```

---

# 14. Locked Conclusions

1. Simplified Monster offensive actions use dedicated Monster Skill Profiles.
2. Stored Accuracy is independent, may exceed 100, and only Effective Accuracy is capped at 100 after modifiers.
3. Raw D100 `1` is Great Failure and raw D100 `100` is Great Success.
4. Skill Accuracy is not Attribute-derived.
5. Skill damage may link to zero, one or multiple STR / DEX / CON / POW / INT / SIZ values.
6. Multiple linked Attributes use arithmetic mean of current Effective Attributes.
7. Skill Base Damage retains the locked Monster damage Level curve.
8. The previous Lower / Upper Attribute Ratio model is superseded.
9. Attribute-linked damage center is `Calculated Base Damage + Damage Attribute Basis`.
10. Minimum damage is `max(0, Damage Center - Final Lower Spread)`.
11. Maximum damage is `Damage Center + Final Upper Spread`.
12. Lower Spread may grow modestly; Upper Spread is intended to have substantially stronger upside growth.
13. Exact Lower / Upper Spread scaling remains unresolved and must not be invented by implementation.
14. GM may perform final instance adjustments while preserving all calculation layers.

---

# 15. Next Decision

The next Monster damage decision is the exact rule for calculating:

```text
Final Lower Spread
Final Upper Spread
```

from their Template values and Monster progression, while preserving the locked design intent that the late-game downside grows much more slowly than the upside.
