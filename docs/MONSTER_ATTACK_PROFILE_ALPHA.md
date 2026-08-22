# Monster Skill Profile — Alpha

> Status: Canonical Alpha Override  
> Date: 2026-08-22  
> Scope: Defines Simplified Monster dedicated Skills, including independent per-Skill Accuracy, over-100 Accuracy storage, D100 extreme-result precedence, Attribute-linked damage, and the signed `Damage Spread Range` model.  
> This file supersedes older Monster-specific wording that derived hit chance from Effective Attributes / Attack Proficiency, used Attribute Ratios to widen damage, or split spread into separate Lower / Upper mechanisms.

---

# 1. Core Monster Skill Profile

A Simplified Monster Skill may define:

```text
Skill Name
Stored Accuracy
Damage Type
Template Base Damage
Damage Growth Weight
Damage Attribute Links
Template Spread Min
Template Spread Max
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

The selected Attribute identifiers and current Effective values must be preserved for audit/debugging.

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

---

# 6. Locked Damage Center — Base Damage + Attribute Basis

The previous Attribute Ratio model is superseded.

For an Attribute-linked damaging Skill:

```text
Calculated Damage Center
= Calculated Base Damage + Damage Attribute Basis
```

If no Damage Attribute Links are selected:

```text
Damage Attribute Basis = 0
Calculated Damage Center = Calculated Base Damage
```

The Monster's relevant Effective Attribute value therefore contributes directly to the Skill's central damage.

---

# 7. Signed Damage Spread Range

Spread is one signed interval, not separate Lower / Upper systems.

Each damaging Skill stores a Profile-side range:

```text
Template Spread Min
Template Spread Max
```

Examples:

```text
[-2, +2]
[-5, +15]
[0, +8]
[-6, -1]   // allowed for an intentionally downside-only exceptional Skill
```

Canonical constraints:

```text
Template Spread Min <= Template Spread Max
Final Spread Min <= Final Spread Max
```

For a normal standard damaging Skill, `0` will usually lie inside the range, but this is not an absolute requirement for exceptional Skill design.

The runtime spread result is:

```text
Spread Roll
= random integer from Final Spread Min to Final Spread Max, inclusive
```

Then:

```text
Raw Monster Damage
= max(0, Calculated Damage Center + Spread Roll)
```

Equivalent range display:

```text
Calculated Minimum Raw Damage
= max(0, Calculated Damage Center + Final Spread Min)

Calculated Maximum Raw Damage
= max(0, Calculated Damage Center + Final Spread Max)
```

Spread randomisation is not a second D100 action check and has no Great Success / Great Failure meaning.

---

# 8. Locked Spread Design Intent

The signed range exists to allow a successful hit to fluctuate around the Damage Center.

Example at low Level:

```text
Damage Center = Base Damage + Attribute Basis
Spread Range = [-2, +2]
```

A low roll applies `-2`; a high roll applies `+2`.

At higher progression, the same Skill may evolve conceptually toward a positively skewed range such as:

```text
[-5, +15]
```

The intended late-game shape is therefore:

```text
negative edge
→ may move farther below 0, but only modestly

positive edge
→ may extend much farther above 0
```

So low rolls remain possible, while the potential upside grows substantially more than the downside.

This asymmetry is a property of the **single signed Spread Range**.

---

# 9. User-Confirmed Calculation Shape

Examples supplied during design:

```text
Lv1 low roll:
64 + 15 - 2
= 77

Lv2 low roll:
64 + 18 - 3
= 79
```

These are read as:

```text
Calculated Base Damage
+ current Damage Attribute Basis
+ signed Spread Roll
```

For the first example:

```text
Spread Roll = -2
```

For the second:

```text
Spread Roll = -3
```

The exact formula by which `Template Spread Min / Max` become `Final Spread Min / Max` as the Monster progresses is not yet locked.

Implementation must not invent that scaling rule.

---

# 10. Superseded Damage-Band Terms

The following standard Simplified Monster fields / concepts are superseded:

```text
Template Lower Spread
Template Upper Spread
Final Lower Spread
Final Upper Spread
Lower Attribute Ratio
Upper Attribute Ratio
Lower Variance Growth Weight
Upper Variance Growth Weight
Attribute-derived Lower Contribution
Attribute-derived Upper Contribution
```

Use instead:

```text
Template Spread Min
Template Spread Max
Final Spread Min
Final Spread Max
Spread Roll
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
→ hit: calculate / read Damage Center
→ resolve Final Spread Range
→ roll one signed integer Spread Roll inside that range
→ Raw Damage = max(0, Damage Center + Spread Roll)
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

Template Spread Min
Template Spread Max
Final Spread Min
Final Spread Max
Spread Roll when resolved
Calculated Minimum Raw Damage
Calculated Maximum Raw Damage
GM spread / damage adjustments
Final Raw Damage
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
Damage Attribute Links — multi-select STR / DEX / CON / POW / INT / SIZ
Template Spread Min — signed integer
Template Spread Max — signed integer
Range / Reach
Targeting
Status / special-effect links
MP cost
Cooldown
Usage restrictions
Other approved flags
```

The UI should display the spread compactly as, for example:

```text
Spread: -2 to +2
Spread: -5 to +15
```

and validate only that Min does not exceed Max unless a future stronger constraint is explicitly locked.

---

# 14. Locked Conclusions

1. Simplified Monster offensive actions use dedicated Monster Skill Profiles.
2. Stored Accuracy is independent, may exceed 100, and only Effective Accuracy is capped at 100 after modifiers.
3. Raw D100 `1` is Great Failure and raw D100 `100` is Great Success.
4. Skill Accuracy is not Attribute-derived.
5. Skill damage may link to zero, one or multiple STR / DEX / CON / POW / INT / SIZ values.
6. Multiple linked Attributes use arithmetic mean of current Effective Attributes.
7. Skill Base Damage retains the locked Monster damage Level curve.
8. Attribute-linked Damage Center is `Calculated Base Damage + Damage Attribute Basis`.
9. Spread is one signed inclusive interval `[Final Spread Min, Final Spread Max]`.
10. Spread Roll is one random integer drawn from that signed interval after a successful hit.
11. Raw Monster Damage is `max(0, Damage Center + Spread Roll)`.
12. Standard late-game design may shift from ranges such as `[-2,+2]` toward positively skewed ranges such as `[-5,+15]`.
13. Negative spread growth should remain materially smaller than positive spread growth for the standard intended damage shape.
14. Exact Spread Min / Max progression remains unresolved and must not be invented by implementation.
15. GM may perform final instance adjustments while preserving calculation layers.

---

# 15. Next Decision

The next Monster damage decision is the exact rule that converts:

```text
Template Spread Min / Template Spread Max
```

into:

```text
Final Spread Min / Final Spread Max
```

as Monster Level / Effective Attribute progression increases, while preserving the intended transition from roughly symmetric low-Level spread toward a strongly positive-skewed high-Level spread.
