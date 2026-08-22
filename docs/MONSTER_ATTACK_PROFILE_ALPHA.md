# Monster Skill Profile — Alpha

> Status: Canonical Alpha Override  
> Date: 2026-08-22  
> Scope: Defines Simplified Monster dedicated Skills, including independent per-Skill Accuracy, Accuracy values above 100, D100 extreme-result precedence, Attribute-linked damage, and the revised damage-range architecture.  
> This file supersedes older Monster-specific wording that derived hit chance from Effective Attributes / Attack Proficiency or made Lower / Upper damage variance follow their own Monster Level growth curves.

---

# 1. Core Model — Dedicated Monster Skills

Simplified Monsters use dedicated **Monster Skill Profiles**.

A Monster Skill is a self-contained move-like entry. Each Skill may define:

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

Accuracy and damage are separate properties.

---

# 2. Accuracy Is an Independent Skill Property

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

Use **Effective Attributes**.

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

Damage Attribute Basis affects damage only. It does not modify Skill Accuracy unless a future Skill explicitly says so.

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

# 6. Revised Damage-Range Architecture — Attribute Growth Replaces Lower / Upper Level Curves

The previous Simplified Monster model gave Lower Variance and Upper Variance their own Level Growth Weights:

```text
Lower Variance Growth Weight
Upper Variance Growth Weight
```

including the former defaults:

```text
Lower = 1.50
Upper = 2.00
```

That architecture is now **superseded**.

Lower / Upper spread must not independently apply `MonsterDamageGrowth(Level)` again.

Reason:

```text
Monster Level
→ already scales Effective Attributes
→ already scales Skill Base Damage through MonsterDamageGrowth(Level)
```

Adding a third independent Lower / Upper Level-growth curve would over-stack Level scaling.

The revised architecture is:

```text
Template Base Damage
→ Monster Damage Level Curve
→ Calculated Base Damage

Damage Attribute Links
→ selected Effective Attributes
→ Damage Attribute Basis

Template Lower Spread / Template Upper Spread
+ Attribute-derived Lower / Upper contribution
→ Calculated Minimum / Maximum Raw Damage
→ GM final adjustment
→ Final Minimum / Maximum Raw Damage
```

Therefore higher-Level Monsters naturally widen or reshape linked Skill damage ranges because their **Effective Attributes** are higher, rather than because Lower / Upper spread receives another hidden Level multiplier.

---

# 7. Template Lower / Upper Spread

A damaging Skill may keep static Template-side spread values:

```text
Template Lower Spread
Template Upper Spread
```

These are Level-1 / Profile-defined baseline spread components.

They do **not** have their own Level Growth Weights.

For a Skill with no Damage Attribute Links, these Template spread values may define the ordinary fixed band around Calculated Base Damage.

For a Skill with Damage Attribute Links, the selected Effective Attributes additionally contribute to the lower and upper spread through the Skill Damage Range Resolver.

---

# 8. Exact Attribute Contribution Formula Still Pending

The following is now locked:

```text
Damage Attribute Basis
= selected Effective Attribute
or arithmetic mean of selected Effective Attributes
```

The following is **not yet locked**:

```text
how much Damage Attribute Basis contributes to Lower Spread
how much Damage Attribute Basis contributes to Upper Spread
```

Implementation must not invent this coefficient / ratio.

The final formula should support the intended behaviour:

```text
stronger linked Effective Attributes
→ can push Minimum farther below the Level-adjusted Base Damage
→ can push Maximum farther above the Level-adjusted Base Damage
→ Upper contribution may be stronger than Lower contribution
```

without introducing another independent Monster Level curve.

---

# 9. Damage Safety Floor

Whatever final Attribute-linked formula is selected:

```text
Final Minimum Raw Damage >= 0
```

Negative raw damage must never become accidental healing.

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
→ hit: resolve final Skill damage range
→ random integer inside final Minimum–Maximum range
→ Defence / Resistance
→ Damage Result
→ HP loss only when Damage Result > 0
→ resolve approved secondary effects
```

Damage-range randomisation is not a second D100 action check and has no Great Success / Great Failure meaning.

---

# 11. GM / Audit Requirements

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
GM Base Damage adjustment

Template Lower Spread
Template Upper Spread
Attribute-derived Lower contribution
Attribute-derived Upper contribution
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
10. Lower / Upper damage spread no longer has independent Monster Level Growth Weights.
11. Former `Lower = 1.50 / Upper = 2.00` variance-growth defaults are superseded by the Attribute-linked range architecture.
12. Template Lower / Upper Spread may remain as static Profile-defined baseline spread.
13. Effective Attributes now provide the Level-sensitive lower / upper damage contribution.
14. Exact Attribute Basis → Lower / Upper contribution coefficients remain unresolved.
15. Final raw damage cannot be below 0.
16. GM may perform final instance adjustments while all calculation layers remain auditable.

---

# 14. Next Decision

The next decision is the exact mathematical rule that converts:

```text
Damage Attribute Basis
```

into:

```text
Attribute-derived Lower contribution
Attribute-derived Upper contribution
```

for the final Monster Skill damage range.
