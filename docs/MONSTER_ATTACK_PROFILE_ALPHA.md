# Monster Skill Profile — Alpha

> Status: Canonical Alpha Override  
> Date: 2026-08-22  
> Scope: Defines Simplified Monster dedicated Skills, including independent per-Skill Accuracy, over-100 Accuracy storage, D100 extreme-result precedence, Attribute-linked fixed-range damage, one dedicated Base-Damage Level curve, and the locked Attribute-ratio damage-range formula.  
> This file supersedes older Monster-specific wording that derived hit chance from Effective Attributes / Attack Proficiency or gave Lower / Upper damage spread their own Monster Level growth curves.

---

# 1. Core Model — Dedicated Monster Skills

Simplified Monsters use dedicated **Monster Skill Profiles**.

A Monster Skill may define:

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
Status / special effects
MP cost
Cooldown
Usage restrictions
Other approved Skill flags
```

Accuracy and damage are separate properties.

---

# 2. Independent Skill Accuracy

```text
Monster Skill Accuracy
= independent value stored on that Skill Profile
```

Accuracy is not automatically calculated from STR / DEX / CON / POW / INT / SIZ, Natural Attributes, Effective Attributes, Attack Proficiency, Player weapon specialization, or Player Skill Point progression.

Stored Accuracy may exceed `100` and is not subject to the Player natural Skill-value cap of `98`.

```text
Modified Accuracy
= Stored Skill Accuracy + Total Hit Modifier

Effective Accuracy
= min(100, Modified Accuracy)
```

Accuracy above 100 acts as reserve against future negative Accuracy modifiers.

---

# 3. Locked D100 Extreme Results

Monster Skill hit checks preserve the global raw D100 extreme rules:

```text
raw D100 = 1   → Great Failure
raw D100 = 100 → Great Success
```

These extreme results take precedence over the ordinary threshold.

Therefore even when:

```text
Effective Accuracy = 100
```

resolution remains:

```text
raw 1     → Great Failure
raw 2–99  → ordinary success
raw 100   → Great Success
```

Accuracy above 100 never removes the normal Great Failure / Great Success extreme faces by itself.

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

For exactly one selected Attribute:

```text
Damage Attribute Basis
= selected Effective Attribute
```

For multiple selected Attributes:

```text
Damage Attribute Basis
= sum(selected Effective Attributes)
  / number of selected Attributes
```

Examples:

```text
Effective STR = 40
Effective SIZ = 60
Links = STR + SIZ
→ Damage Attribute Basis = 50
```

```text
Effective INT = 30
Effective POW = 20
Links = INT + POW
→ Damage Attribute Basis = 25
```

The resolver must preserve the selected Attribute identifiers and current Effective values, not only the final average.

Damage Attribute Basis affects damage only. It does not modify Skill Accuracy by default.

---

# 5. Locked Base-Damage Level Curve

Monster Skill Base Damage retains one dedicated Monster damage Level curve:

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

This is the Skill's only dedicated Monster Level damage-growth curve.

---

# 6. Static Template Lower / Upper Spread

A damaging Skill may store:

```text
Template Lower Spread
Template Upper Spread
```

These are Profile-defined baseline spread values.

They do **not** have their own Level Growth Weights and must not independently apply `MonsterDamageGrowth(Level)`.

The former fields and defaults:

```text
Lower Variance Growth Weight
Upper Variance Growth Weight
Lower = 1.50
Upper = 2.00
```

are superseded.

For a Skill with no Damage Attribute Links, the Attribute-derived contribution is `0`, so the ordinary band is simply based on Calculated Base Damage plus/minus the static Template Spread.

---

# 7. Locked Attribute-Ratio Damage Formula

Each damaging Skill may store two independent ratios:

```text
Lower Attribute Ratio
Upper Attribute Ratio
```

Canonical Attribute contributions:

```text
Attribute-derived Lower Contribution
= round(Damage Attribute Basis × Lower Attribute Ratio)

Attribute-derived Upper Contribution
= round(Damage Attribute Basis × Upper Attribute Ratio)
```

Canonical damage limits:

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

This is the locked #18.9.8 Option A architecture.

The two ratios are intentionally separate so a Skill can expand its high-end ceiling faster than its low-end floor, or vice versa.

No separate Lower / Upper Monster Level curve is applied.

---

# 8. Example

```text
Calculated Base Damage = 64
Damage Attribute Basis = 65
Template Lower Spread = 2
Template Upper Spread = 2
Lower Attribute Ratio = 0.30
Upper Attribute Ratio = 0.45
```

Then:

```text
Attribute-derived Lower Contribution
= round(65 × 0.30)
= 20

Attribute-derived Upper Contribution
= round(65 × 0.45)
= 29
```

Therefore:

```text
Calculated Minimum Raw Damage
= 64 - 2 - 20
= 42

Calculated Maximum Raw Damage
= 64 + 2 + 29
= 95
```

Final calculated range:

```text
42–95
```

GM may then apply authorised instance-level lower / upper damage adjustments while preserving the calculated values.

---

# 9. Why This Replaces the Old Lower / Upper Curves

Monster Level already affects Skill damage through two explicit paths:

```text
Monster Level
→ MonsterDamageGrowth(Level)
→ Calculated Base Damage
```

and:

```text
Monster Level
→ Effective Attributes
→ Damage Attribute Basis
→ Attribute-derived Lower / Upper Contribution
```

Therefore Lower / Upper Spread does not need a third independent Monster Level growth curve.

This avoids hidden triple-scaling while still allowing high-Level Monsters to develop wider and more dangerous damage ranges.

---

# 10. Runtime Skill Resolution

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
→ random integer inside Final Minimum–Maximum range
→ Defence / Resistance
→ Damage Result
→ HP loss only when Damage Result > 0
→ resolve approved secondary effects
```

Damage-range randomisation is not a second D100 action check and has no Great Success / Great Failure meaning.

---

# 11. GM Final Adjustment / Audit

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
```

Template, calculated and GM-adjusted values must remain distinguishable.

---

# 12. GM Skill Editor Requirements

For each Monster Skill Profile, GM UI must allow:

```text
Skill Name
Stored Accuracy — may exceed 100
Damage Type
Template Base Damage
Damage Growth Weight
Template Lower Spread
Template Upper Spread
Damage Attribute Links — multi-select STR / DEX / CON / POW / INT / SIZ
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

The UI must no longer require:

```text
Primary Effective Attribute for Accuracy
Attack Proficiency
Attribute-Derived Hit Value
damage dice
Player STR + SIZ Damage Bonus
Lower Variance Growth Weight
Upper Variance Growth Weight
```

---

# 13. Locked Conclusions

1. Simplified Monster offensive actions use dedicated Monster Skill Profiles.
2. Each Skill has independent Stored Accuracy; storage may exceed 100.
3. Effective Accuracy used by the ordinary threshold is capped at 100 after modifiers.
4. Raw D100 `1` is Great Failure and raw D100 `100` is Great Success.
5. Accuracy is not Attribute-derived.
6. Skill damage may link to zero, one or multiple STR / DEX / CON / POW / INT / SIZ values.
7. Linked damage uses Effective Attributes.
8. Multiple linked Attributes use arithmetic mean: sum ÷ selected count.
9. Skill Base Damage retains the locked `7 × ((Level - 1) / 99)^1.5` Monster damage curve.
10. Lower / Upper Spread is static Profile baseline and has no independent Monster Level curve.
11. Each Skill stores `Lower Attribute Ratio` and `Upper Attribute Ratio`.
12. Lower contribution is `round(Damage Attribute Basis × Lower Attribute Ratio)`.
13. Upper contribution is `round(Damage Attribute Basis × Upper Attribute Ratio)`.
14. Minimum damage is `max(0, Base - Lower Spread - Lower Contribution)`.
15. Maximum damage is `Base + Upper Spread + Upper Contribution`.
16. GM may perform final instance adjustments while all calculation layers remain auditable.
17. The default values for Lower / Upper Attribute Ratio remain unresolved.

---

# 14. Next Decision

The next decision is the default pair used when a new standard damaging Monster Skill is created:

```text
Lower Attribute Ratio = ?
Upper Attribute Ratio = ?
```

These are defaults only; GM may override them per Skill.
