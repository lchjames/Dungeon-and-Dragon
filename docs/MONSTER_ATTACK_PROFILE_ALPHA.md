# Monster Skill Profile — Alpha

> Status: Canonical Alpha Override  
> Date: 2026-08-22  
> Scope: Defines Simplified Monster dedicated Skills, including independent per-Skill Accuracy, over-100 Accuracy storage, D100 extreme-result precedence, Attribute-linked damage, and the signed Level-linked `Damage Spread Range` model.  
> This file supersedes older Monster-specific wording that derived hit chance from Effective Attributes / Attack Proficiency, used Attribute Ratios to widen damage, split spread into separate Lower / Upper mechanisms, or required a final fixed Spread progression formula before content tuning.

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

Spread is one signed interval:

```text
[Final Spread Min, Final Spread Max]
```

Examples of possible output shapes:

```text
[-2, +2]
[-5, +15]
[0, +8]
[-6, -1]
```

Canonical constraints:

```text
Final Spread Min <= Final Spread Max
```

Runtime:

```text
Spread Roll
= random integer from Final Spread Min to Final Spread Max, inclusive

Raw Monster Damage
= max(0, Calculated Damage Center + Spread Roll)
```

Equivalent display:

```text
Calculated Minimum Raw Damage
= max(0, Calculated Damage Center + Final Spread Min)

Calculated Maximum Raw Damage
= max(0, Calculated Damage Center + Final Spread Max)
```

Spread randomisation is not a second D100 action check and has no Great Success / Great Failure meaning.

---

# 8. Level-Linked System Generation — Canonical Architecture

The Spread Range is linked to **Monster Level**.

The system must first generate an approximate/suggested signed range from the Monster's Level:

```text
Monster Level
→ Spread Generation Rule / Tuning Table
→ System Suggested Spread Min
→ System Suggested Spread Max
```

Then GM may correct the generated result:

```text
System Suggested Spread Range
→ GM Spread Min Adjustment / Override
→ GM Spread Max Adjustment / Override
→ Final Spread Range
```

The generated range is a **starting point**, not the final balance authority.

Canonical responsibility split:

```text
System
→ quickly produces a plausible Level-appropriate range

GM
→ reviews and corrects the actual Skill / Monster instance
```

The final numbers are expected to be tuned during actual game-content creation and play balance work.

---

# 9. Spread Progression Design Intent

Low-Level ranges may be roughly symmetric, while higher-Level ranges may become increasingly positive-skewed.

Conceptual examples only:

```text
low Level  → about [-2, +2]
high Level → about [-5, +15]
```

These examples are **not a locked Level table**.

The intended shape is:

```text
negative edge
→ may move farther below 0, but relatively slowly

positive edge
→ may extend much farther above 0
```

So low rolls remain possible, while high-Level upside can grow much more strongly.

---

# 10. Spread Scaling Is Alpha Tuning, Not a Final Formula

The architecture is locked:

```text
Level
→ System Suggested Spread Range
→ GM correction
→ Final Spread Range
```

But the exact numerical generator is intentionally **not locked yet**.

It may later be implemented as a data-driven Level table, interpolation rule, curve, or another tuning mechanism, provided it obeys the Canonical architecture above.

Do not treat any temporary Alpha coefficients as permanent rules.

The preferred implementation should keep the Spread generation data easy to rebalance without changing the core combat model.

---

# 11. User-Confirmed Calculation Shape

Examples supplied during design:

```text
Lv1 low roll:
64 + 15 - 2
= 77

Lv2 low roll:
64 + 18 - 3
= 79
```

Read as:

```text
Calculated Base Damage
+ current Damage Attribute Basis
+ signed Spread Roll
```

The Spread value is an offset inside one signed Level-generated range.

---

# 12. Superseded Damage-Band Terms

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

Do not require fixed `Template Spread Min / Template Spread Max` as the sole source of the standard range either; standard Spread is generated from Level first, then reviewed by GM.

Use instead:

```text
System Suggested Spread Min
System Suggested Spread Max
GM Spread Min Adjustment / Override
GM Spread Max Adjustment / Override
Final Spread Min
Final Spread Max
Spread Roll
```

---

# 13. Runtime Skill Resolution

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
→ read Final Spread Range
→ roll one signed integer Spread Roll inside that range
→ Raw Damage = max(0, Damage Center + Spread Roll)
→ Defence / Resistance
→ Damage Result
→ HP loss only when Damage Result > 0
→ resolve approved secondary effects
```

---

# 14. GM / Audit Requirements

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

Monster Level used for Spread generation
System Suggested Spread Min
System Suggested Spread Max
GM Spread Min Adjustment / Override
GM Spread Max Adjustment / Override
Final Spread Min
Final Spread Max
Spread Roll when resolved
Calculated Minimum Raw Damage
Calculated Maximum Raw Damage
Final Raw Damage
```

System-generated, GM-corrected and runtime values must remain distinguishable.

---

# 15. GM Skill / Instance UI Requirements

The GM UI should show the Level-generated range and editable final controls together:

```text
Monster Level
Suggested Spread: -2 to +2
GM Min Adjustment / Override
GM Max Adjustment / Override
Final Spread: -2 to +2
```

At another Level it may display, for example:

```text
Suggested Spread: -5 to +15
```

The GM must be able to correct either boundary without editing the underlying global tuning rule.

---

# 16. Locked Conclusions

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
12. Standard Spread Range generation is linked to Monster Level.
13. The system generates an approximate/suggested Level-appropriate range first.
14. GM then manually corrects / overrides either boundary to obtain the Final Spread Range.
15. Low-Level ranges may be roughly symmetric; high-Level ranges may become more positive-skewed.
16. Exact Level-to-Spread numbers / curve remain Alpha Tuning and are intentionally deferred until content creation and play-balance work.
17. Implementation should keep Spread tuning data-driven / easy to rebalance rather than hard-coding temporary coefficients into the core combat model.

---

# 17. Next Unresolved Decision

The next Monster Skill decision is whether Stored Skill Accuracy itself normally receives automatic Monster-Level scaling, or remains a Profile value changed only by explicit modifiers / GM changes.
