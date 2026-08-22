# Monster Skill Profile — Alpha

> Status: Canonical Alpha Override  
> Date: 2026-08-22  
> Scope: Defines Simplified Monster dedicated Skills, including independent per-Skill Accuracy, Accuracy values above 100, D100 extreme-result precedence, fixed-range damage, independent damage Level scaling, asymmetric variance, and Skill-to-Attribute damage links.  
> This file supersedes older Monster-specific wording that derived hit chance from Effective Attributes / Attack Proficiency or treated final damage range as completely independent from Monster Attributes.

---

# 1. Core Model — Dedicated Monster Skills

Simplified Monsters use dedicated **Monster Skill Profiles**.

A Monster Skill is a self-contained move-like entry. Each Skill may define:

```text
Skill Name
Accuracy
Damage Type
Template Base Damage
Damage Growth Weight
Template Lower Variance
Lower Variance Growth Weight
Template Upper Variance
Upper Variance Growth Weight
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

Canonical:

```text
Monster Skill Accuracy
= independent value stored on that Skill Profile
```

Accuracy is not automatically calculated from:

```text
STR / DEX / CON / POW / INT / SIZ
Natural Attributes
Effective Attributes
Attack Proficiency
Player weapon specialization
Player Skill Point progression
```

Two Skills on the same Monster may intentionally have very different Accuracy.

---

# 3. Stored Accuracy May Exceed 100

Monster Skill `Accuracy` is not hard-capped at 100 in storage.

Values such as:

```text
100
110
125
150
```

are valid.

Accuracy above 100 acts as **Accuracy reserve** against later negative modifiers.

Example:

```text
Stored Accuracy = 130
Hit penalty = -40
Modified Accuracy = 90
```

Another example:

```text
Stored Accuracy = 130
Hit penalty = -20
Modified Accuracy = 110
Effective Accuracy = 100
```

The stored value remains 130. Monster Skill Accuracy is not subject to the Player Character natural Skill-value cap of 98.

---

# 4. Effective Accuracy Cap

Canonical hit-value pipeline:

```text
Modified Accuracy
= Stored Skill Accuracy + Total Hit Modifier

Effective Accuracy
= min(100, Modified Accuracy)
```

Only `Effective Accuracy` enters the ordinary D100 success threshold:

```text
D100 Result
= Roll - [100 - Effective Accuracy]
```

`Total Hit Modifier` may include Buff, Debuff, Status, Skill properties, target avoidance modifiers, environment, GM modifiers and other approved effects.

The important distinction is:

```text
Stored Accuracy may be >100
Effective Accuracy used by the ordinary threshold may not be >100
```

---

# 5. Locked D100 Extreme Results — Great Failure and Great Success Always Exist

Monster Skill hit checks use the same global D100 extreme-result rule:

```text
raw D100 = 1   → Great Failure
raw D100 = 100 → Great Success
```

These raw extreme results take precedence over the ordinary success threshold.

Therefore even when:

```text
Effective Accuracy = 100
```

the resolution is:

```text
raw 1     → Great Failure
raw 2–99  → ordinary success
raw 100   → Great Success
```

Accuracy above 100 does **not** create automatic or absolute success by itself.

Its purpose is to resist negative Accuracy modifiers before the Effective Accuracy cap is applied.

Example:

```text
Stored Accuracy = 140
Debuff = -30
Modified Accuracy = 110
Effective Accuracy = 100

raw 1   → Great Failure
raw 57  → Success
raw 100 → Great Success
```

A future explicit Skill effect could define a special exception only if separately approved; no such default exception exists in the Simplified Monster model.

---

# 6. Superseded Hit Architecture

The following older Simplified Monster hit structure is superseded:

```text
Attribute-Derived Hit Value
+ Attack Proficiency
+ Additional Hit Modifier
```

Standard Monster Skills therefore do not require:

```text
Primary Effective Attribute for Accuracy
Attack Proficiency
Attribute-Derived Hit Value
```

A Skill may reference Attributes for damage or special effects, but that reference does not automatically change Skill Accuracy.

---

# 7. Skill Damage May Link to Monster Attributes

Each damaging Monster Skill may define a **Damage Attribute Links** list selected from:

```text
STR
DEX
CON
POW
INT
SIZ
```

GM UI should present this as a checkbox / multi-select list.

Selecting no Attribute is valid for a Skill whose damage is purely Profile-defined.

---

# 8. Composite Attribute Link = Average of Selected Effective Attributes

When exactly one Attribute is selected:

```text
Damage Attribute Basis
= selected Effective Attribute
```

When multiple Attributes are selected:

```text
Damage Attribute Basis
= sum(selected Effective Attributes)
  / number of selected Attributes
```

Use **Effective Attributes**, not Natural Attributes.

The resolver must preserve which Attributes were selected rather than storing only the final average.

---

# 9. Attribute Link Affects Damage, Not Accuracy

Canonical separation:

```text
Skill Accuracy
→ hit chance only

Damage Attribute Links
→ damage-range calculation input only
```

A Skill may therefore have:

```text
Accuracy = 130
Damage Attribute Links = STR + SIZ
```

without STR or SIZ being added to Accuracy.

---

# 10. Template-Side Damage Level Curve

The shared Monster damage growth term remains:

```text
MonsterDamageGrowth(Level)
= 7 × ((Level - 1) / 99)^1.5
```

Per Skill:

```text
Calculated Base Damage
= round(
    Template Base Damage
    × [1 + MonsterDamageGrowth(Level) × Damage Growth Weight]
  )
```

With `Damage Growth Weight = 1.0`:

```text
Level 1   → 1.00× Template Base Damage
Level 30  → ~2.11×
Level 50  → ~3.44×
Level 70  → ~5.07×
Level 90  → ~6.97×
Level 100 → 8.00× Template Base Damage
```

This is the Template-side damage-growth component, not necessarily the complete final damage result for Attribute-linked Skills.

---

# 11. Asymmetric Template-Side Variance

Each damaging Skill stores:

```text
Template Lower Variance
Lower Variance Growth Weight
Template Upper Variance
Upper Variance Growth Weight
```

Canonical formulas:

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

Canonical standard defaults:

```text
Lower Variance Growth Weight = 1.50
Upper Variance Growth Weight = 2.00
```

These remain editable defaults.

---

# 12. Damage-Range Pipeline with Attribute Links

Current architecture:

```text
Template Base Damage
+ Monster Damage Level Curve
+ Damage Growth Weight
→ Calculated Base Damage

Template Lower / Upper Variance
+ their Growth Weights
→ Calculated Lower / Upper Variance

selected Damage Attribute Links
→ selected Effective Attributes
→ Damage Attribute Basis

Calculated damage components
+ Damage Attribute Basis
→ Skill Damage Range Resolver
→ calculated Minimum / Maximum Raw Damage
→ GM final adjustments
→ Final Minimum / Maximum Raw Damage
```

The exact numerical formula by which `Damage Attribute Basis` changes the lower and upper damage limits is not yet locked.

Implementation must not invent an Attribute coefficient until that formula is chosen.

---

# 13. Damage Range Safety Floor

Whatever final Attribute-linked damage formula is selected:

```text
Final Minimum Raw Damage >= 0
```

Negative raw damage must never become accidental healing.

---

# 14. Runtime Skill Resolution

Normal damaging Skill flow:

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
→ hit: calculate / use final Skill damage range
→ random integer inside final Minimum–Maximum range
→ Defence / Resistance
→ Damage Result
→ HP loss only when Damage Result > 0
→ resolve approved secondary effects
```

The damage-range randomisation is not a second D100 action check and has no Great Success / Great Failure meaning.

---

# 15. GM Final Adjustment / Audit

For each spawned Skill, preserve at least:

```text
Template Stored Accuracy
Current Hit Modifiers
Modified Accuracy
Effective Accuracy after 100 cap
raw D100 result
Great Failure / Great Success flag where applicable
GM Accuracy adjustment / override

Damage Attribute Links
selected Effective Attribute values
Damage Attribute Basis

Template Base Damage
MonsterDamageGrowth(Level)
Damage Growth Weight
Calculated Base Damage
GM Base Damage adjustment

Template Lower Variance
Lower Variance Growth Weight
Calculated Lower Variance
GM Lower adjustment

Template Upper Variance
Upper Variance Growth Weight
Calculated Upper Variance
GM Upper adjustment

Calculated / Final Minimum Raw Damage
Calculated / Final Maximum Raw Damage
```

Template, calculated and instance-level values must remain distinguishable.

---

# 16. GM Monster Management Requirements

For each Monster Skill Profile, GM UI must allow:

```text
Skill Name
Stored Accuracy — may exceed 100
Damage Type
Template Base Damage
Damage Growth Weight
Template Lower Variance
Lower Variance Growth Weight
Template Upper Variance
Upper Variance Growth Weight
Damage Attribute Links — multi-select STR / DEX / CON / POW / INT / SIZ
Range / Reach
Targeting
Status / special-effect links
MP cost
Cooldown
Usage restrictions
Other approved flags
```

The UI should explicitly show:

```text
Stored Accuracy
Current modifiers
Modified Accuracy
Effective Accuracy capped at 100
```

and preserve the fixed D100 extreme rule:

```text
1 = Great Failure
100 = Great Success
```

---

# 17. Locked Conclusions

1. Simplified Monster offensive actions use dedicated Monster Skill Profiles.
2. Each Skill has independent `Accuracy`.
3. Stored Accuracy may exceed 100 and is not subject to the Player natural 98 cap.
4. After modifiers, the value entering the ordinary D100 threshold is capped at 100.
5. Accuracy above 100 acts as reserve against future negative Accuracy modifiers.
6. Raw D100 `1` is always Great Failure under the normal Monster Skill rule.
7. Raw D100 `100` is always Great Success under the normal Monster Skill rule.
8. Extreme raw results take precedence over the ordinary threshold, so Effective Accuracy 100 is not absolute success.
9. Attribute-derived Accuracy and Attack Proficiency are removed from standard Simplified Monsters.
10. A damaging Skill may select zero, one or multiple Damage Attribute Links from STR / DEX / CON / POW / INT / SIZ.
11. Linked damage uses Effective Attributes.
12. Multiple linked Attributes are combined by arithmetic mean: sum ÷ selected count.
13. Damage Attribute Basis affects damage calculation, never Accuracy by default.
14. The existing 1.5-power Monster Damage Level Curve remains the Template-side Base Damage growth component.
15. Asymmetric Lower / Upper Variance scaling remains, with default weights `1.50 / 2.00`.
16. The final Attribute-linked lower/upper damage formula remains unresolved.
17. Final raw damage floor cannot be below 0.
18. GM can inspect and adjust Skill values while preserving audit layers.

---

# 18. Next Unresolved Decisions

Resolve separately, one at a time:

1. exact formula for converting `Damage Attribute Basis` into the Skill's lower and upper damage limits;
2. whether Skill Accuracy itself ever receives automatic Level scaling, rather than remaining a Profile value modified only by effects / GM changes;
3. later Elite / Boss / richer-profile exceptions.
