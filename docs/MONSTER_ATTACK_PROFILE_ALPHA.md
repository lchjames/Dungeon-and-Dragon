# Monster Skill Profile — Alpha

> Status: Canonical Alpha Override  
> Date: 2026-08-22  
> Scope: Defines Simplified Monster dedicated Skills, including independent per-Skill Accuracy, over-100 Accuracy storage, D100 extreme-result precedence, Attribute-linked fixed-range damage, one dedicated Base-Damage Level curve, and strongly asymmetric lower/upper Attribute contribution.  
> This file supersedes older Monster-specific wording that derived hit chance from Effective Attributes / Attack Proficiency, gave Lower / Upper damage spread their own Monster Level growth curves, or treated the lower-side reduction as growing at a similar scale to the upper-side bonus.

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

Stored Accuracy may exceed `100` and is not subject to the Player natural Skill-value cap of `98`.

```text
Modified Accuracy
= Stored Skill Accuracy + Total Hit Modifier

Effective Accuracy
= min(100, Modified Accuracy)
```

Accuracy above 100 acts as reserve against future negative Accuracy modifiers.

Accuracy is not automatically calculated from STR / DEX / CON / POW / INT / SIZ, Natural Attributes, Effective Attributes, Attack Proficiency, Player weapon specialization, or Player Skill Point progression.

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

For a Skill with no Damage Attribute Links, Attribute-derived contributions are `0`, so the ordinary band is based on Calculated Base Damage plus/minus the static Template Spread.

---

# 7. Locked Attribute-Ratio Damage Formula

Each damaging Skill stores two independent ratios:

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

No separate Lower / Upper Monster Level curve is applied.

---

# 8. Locked Standard Asymmetry and Default Ratios

The lower and upper sides are **not intended to expand symmetrically**.

Canonical design intent:

```text
successful hit
→ may roll below Calculated Base Damage
→ may roll above Calculated Base Damage

higher Monster power / Effective Attributes
→ lower-side reduction may increase slightly
→ upper-side bonus may increase substantially
```

For ordinary damaging Monster Skills, the Canonical default pair is:

```text
Lower Attribute Ratio = 0.10
Upper Attribute Ratio = 0.50
```

These are defaults, not mandatory values for every Skill. GM may override either ratio per Skill/Profile or by authorised instance adjustment.

The normal relationship is therefore:

```text
Upper Attribute Contribution ≫ Lower Attribute Contribution
```

The lower side remains a real low-roll penalty, but it must not scale at a similar magnitude to the upper-side reward.

The earlier near-symmetric examples such as `0.30 / 0.45` are superseded as standard tuning examples.

---

# 9. Canonical Standard Example

```text
Calculated Base Damage = 64
Damage Attribute Basis = 65
Template Lower Spread = 2
Template Upper Spread = 2
Lower Attribute Ratio = 0.10
Upper Attribute Ratio = 0.50
```

Then:

```text
Lower Contribution = round(65 × 0.10) = 7
Upper Contribution = round(65 × 0.50) = 33

Minimum = 64 - 2 - 7 = 55
Maximum = 64 + 2 + 33 = 99
```

Final calculated range:

```text
55–99
```

This preserves the intended shape: low rolls can still fall below Base Damage, while the late-game upside is much larger than the downside.

---

# 10. Why This Uses Attributes Instead of Another Range Level Curve

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

This avoids hidden triple-scaling while still allowing high-Level Monsters to develop a larger upside and only a modestly larger downside.

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
→ random integer inside Final Minimum–Maximum range
→ Defence / Resistance
→ Damage Result
→ HP loss only when Damage Result > 0
→ resolve approved secondary effects
```

Damage-range randomisation is not a second D100 action check and has no Great Success / Great Failure meaning.

---

# 12. GM Final Adjustment / Audit

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

# 13. GM Skill Editor Requirements

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

For a new standard damaging Skill, the UI should prefill:

```text
Lower Attribute Ratio = 0.10
Upper Attribute Ratio = 0.50
```

The UI should make the asymmetry visible and may warn, rather than silently prevent, when a standard Skill is configured with `Lower Attribute Ratio >= Upper Attribute Ratio`. GM may deliberately configure exceptional Skills differently.

---

# 14. Locked Conclusions

1. Simplified Monster offensive actions use dedicated Monster Skill Profiles.
2. Each Skill has independent Stored Accuracy; storage may exceed 100.
3. Effective Accuracy used by the ordinary threshold is capped at 100 after modifiers.
4. Raw D100 `1` is Great Failure and raw D100 `100` is Great Success.
5. Accuracy is not Attribute-derived.
6. Skill damage may link to zero, one or multiple STR / DEX / CON / POW / INT / SIZ values.
7. Linked damage uses Effective Attributes; multiple links use arithmetic mean.
8. Skill Base Damage retains the locked `7 × ((Level - 1) / 99)^1.5` Monster damage curve.
9. Lower / Upper Spread is static Profile baseline and has no independent Monster Level curve.
10. Each Skill stores `Lower Attribute Ratio` and `Upper Attribute Ratio`.
11. Lower contribution is `round(Damage Attribute Basis × Lower Attribute Ratio)`.
12. Upper contribution is `round(Damage Attribute Basis × Upper Attribute Ratio)`.
13. Minimum damage is `max(0, Base - Lower Spread - Lower Contribution)`.
14. Maximum damage is `Base + Upper Spread + Upper Contribution`.
15. Standard Skill design requires strong asymmetry: the upper-side Attribute bonus should be substantially larger than the lower-side reduction.
16. Canonical standard defaults are `Lower Attribute Ratio = 0.10` and `Upper Attribute Ratio = 0.50`.
17. GM may override these defaults for exceptional Skills.
18. GM may perform final instance adjustments while all calculation layers remain auditable.

---

# 15. Next Decision

The next unresolved Monster Skill decision is whether Stored Skill Accuracy itself receives automatic Monster-Level scaling, or normally remains a Profile value changed only by explicit modifiers / GM changes.
