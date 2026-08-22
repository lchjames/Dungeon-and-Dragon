# Monster Skill Profile — Alpha

> Status: Canonical Alpha Override  
> Date: 2026-08-22  
> Scope: Defines Simplified Monster dedicated Skills, including independent per-Skill Accuracy, Accuracy values above 100, fixed-range damage, independent damage Level scaling, asymmetric variance, and Skill-to-Attribute damage links.  
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

Example:

```text
Goblin Slash      Accuracy = 85
Goblin Throw      Accuracy = 70
Goblin Wild Lunge Accuracy = 45
```

---

# 3. Stored Accuracy May Exceed 100

Monster Skill `Accuracy` is **not hard-capped at 100 in storage**.

Values such as:

```text
100
110
125
150
```

are valid Profile values where the Skill design requires them.

This represents **Accuracy reserve** against later negative modifiers.

Example:

```text
Stored Accuracy = 130
Hit penalty = -40

Modified Accuracy = 90
```

The Skill therefore resolves as a 90-value D100 hit basis after the penalty.

Another example:

```text
Stored Accuracy = 130
Hit penalty = -20

Modified Accuracy = 110
Effective Accuracy = 100
```

The stored value remains 130; only the value entering the D100 threshold is capped.

Monster Skill Accuracy is not subject to the Player Character natural Skill-value cap of 98.

---

# 4. Effective Accuracy Cannot Exceed 100

Canonical hit-value pipeline:

```text
Modified Accuracy
= Stored Skill Accuracy + Total Hit Modifier

Effective Accuracy
= min(100, Modified Accuracy)
```

`Total Hit Modifier` may include:

```text
Buff
Debuff
Status
Skill property
Target evasion / avoidance modifier
Environment
GM modifier
other approved effects
```

The important distinction is:

```text
Stored Accuracy may be > 100
Effective Accuracy used by the D100 threshold may not be > 100
```

This allows later mechanics to reduce very accurate Skills without erasing their excess Accuracy.

The existing high-roll D100 formula then uses `Effective Accuracy`:

```text
D100 Result
= Roll - [100 - Effective Accuracy]
```

In the ordinary hit-threshold sense, `Effective Accuracy = 100` produces a 100% success threshold.

The separate question of whether raw D100 `1` still triggers the global Great Failure extreme rule even when Effective Accuracy is 100 is not silently changed here and must be resolved explicitly.

---

# 5. Superseded Hit Architecture

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

A Skill may still reference Attributes for **damage or special effects**, but that reference does not automatically change Skill Accuracy.

---

# 6. Skill Damage May Link to Monster Attributes

The previous interpretation that Simplified Monster damage was completely independent from Monster Attributes is superseded.

Each damaging Monster Skill may define a **Damage Attribute Links** list selected from:

```text
STR
DEX
CON
POW
INT
SIZ
```

GM UI should present this as a small checkbox / multi-select list.

Examples:

```text
Heavy Smash
Damage Attribute Links: STR, SIZ

Quick Slash
Damage Attribute Links: DEX

Arcane Burst
Damage Attribute Links: INT, POW
```

Selecting no Attribute is valid for a Skill whose damage is intended to be purely Profile-defined.

---

# 7. Composite Attribute Link = Average of Selected Effective Attributes

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

Examples:

```text
STR 40 + DEX 20
selected count = 2
→ Damage Attribute Basis = 30
```

```text
STR 30 + DEX 24 + SIZ 36
selected count = 3
→ Damage Attribute Basis = 30
```

Use **Effective Attributes**, not Natural Attributes, so Elite and Monster Level can naturally matter to the Skill through the Attribute layer.

The resolver must preserve which Attributes were selected rather than storing only the final average.

---

# 8. Attribute Link Affects Damage Range, Not Accuracy

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

Likewise, an Accuracy penalty does not automatically reduce damage unless the Skill / Status explicitly says so.

---

# 9. Existing Template-Side Damage Level Curve Remains Locked

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

This remains the **Template-side damage-growth component**.

It must not be mistaken for the complete final damage-range formula once a Skill has Damage Attribute Links.

---

# 10. Asymmetric Template-Side Variance Remains Locked

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

# 11. Damage-Range Pipeline After Attribute-Link Redesign

The final Skill damage architecture is now:

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

The **exact numerical formula** by which `Damage Attribute Basis` changes the lower and upper damage limits is not yet locked.

Therefore the old formula:

```text
Minimum Raw Damage = Base Damage - Lower Variance
Maximum Raw Damage = Base Damage + Upper Variance
```

is no longer the complete final formula for Skills that use Damage Attribute Links.

It remains only the Template-side band before Attribute contribution.

Implementation must not invent an Attribute coefficient until the Canonical formula is chosen.

---

# 12. Damage Range Safety Floor

Whatever final Attribute-linked damage formula is selected, final raw damage must not become negative through the lower-side calculation.

Canonical safety rule:

```text
Final Minimum Raw Damage >= 0
```

Negative raw damage must never become accidental healing.

---

# 13. Runtime Skill Resolution

Normal damaging Skill flow:

```text
Declare Monster Skill
→ Stored Accuracy + active Hit Modifiers
→ cap Effective Accuracy at 100
→ D100 hit / opposed resolution
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

# 14. GM Final Adjustment / Audit

For each spawned Skill, preserve at least:

```text
Template Stored Accuracy
Current Hit Modifiers
Modified Accuracy
Effective Accuracy after 100 cap
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

# 15. GM Monster Management Requirements

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
Effective Accuracy capped at 100
```

and, for linked damage Skills:

```text
selected Attributes
current Effective values
composite Damage Attribute Basis
```

---

# 16. Locked Conclusions

1. Simplified Monster offensive actions use dedicated Monster Skill Profiles.
2. Each Skill has independent `Accuracy`.
3. Stored Accuracy may exceed 100 and is not subject to the Player natural 98 cap.
4. After modifiers, the Accuracy value entering the D100 threshold is capped at 100.
5. Accuracy above 100 acts as reserve against future negative Accuracy modifiers.
6. Attribute-derived Accuracy and Attack Proficiency are removed from standard Simplified Monsters.
7. A damaging Skill may select zero, one or multiple Damage Attribute Links from STR / DEX / CON / POW / INT / SIZ.
8. Linked damage uses Effective Attributes.
9. Multiple linked Attributes are combined by arithmetic mean: sum ÷ selected count.
10. Damage Attribute Basis affects damage calculation, never Accuracy by default.
11. The existing 1.5-power Monster Damage Level Curve remains the Template-side Base Damage growth component.
12. Asymmetric Lower / Upper Variance scaling remains, with default weights `1.50 / 2.00`.
13. The final Attribute-linked lower/upper damage formula is still unresolved and must not be invented by implementation.
14. Final raw damage floor cannot be below 0.
15. GM can inspect and adjust Skill values while preserving audit layers.

---

# 17. Next Unresolved Decisions

Resolve separately, one at a time:

1. when `Effective Accuracy = 100`, whether raw D100 `1` still invokes the global Great Failure rule or the Skill is absolutely successful;
2. exact formula for converting `Damage Attribute Basis` into the Skill's lower and upper damage limits;
3. whether Skill Accuracy itself ever receives automatic Level scaling, rather than remaining a Profile value modified only by effects / GM changes;
4. later Elite / Boss / richer-profile exceptions.
