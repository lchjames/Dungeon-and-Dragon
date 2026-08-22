# Monster Skill Profile — Alpha

> Status: Canonical Alpha Override  
> Date: 2026-08-22  
> Scope: Defines how Simplified Monsters represent and resolve their dedicated skills, including independent per-skill Accuracy, fixed-range damage, Level damage scaling, and asymmetric damage variance.  
> This file supersedes older Monster-specific wording that derived hit chance from Effective Attributes, Attack Proficiency, Player weapon-specialization concepts, damage dice, Character Damage Bonus, or a single symmetric `± Damage Variance` field.

---

# 1. Core Model — Monster Skills Are Self-Contained Profiles

Simplified Monsters use dedicated **Monster Skill Profiles**.

A Monster Skill should be understood in the same broad design sense as a move in a creature-battling RPG: each skill carries its own execution properties rather than borrowing a Player weapon-proficiency progression model.

Examples:

```text
Goblin Slash
Goblin Short Bow Shot
Wolf Bite
Ogre Heavy Smash
Poison Spit
Fire Breath
```

A Monster Skill Profile can contain its own:

```text
Name
Accuracy
Damage Type
Template Base Damage
Damage Growth Weight
Template Lower Variance
Lower Variance Growth Weight
Template Upper Variance
Upper Variance Growth Weight
Range / Reach
Targeting
Status / special effects
MP cost
Cooldown
Usage restrictions
Other approved skill flags
```

The Monster's six Attributes are not automatically converted into skill Accuracy.

---

# 2. Accuracy Is an Independent Skill Property

Canonical:

```text
Monster Skill Accuracy
= independent value stored on that Skill Profile
```

Accuracy is **not** calculated from:

```text
STR
DEX
CON
POW
INT
SIZ
Effective Attribute
Attack Proficiency
Player weapon specialization
Player Skill Point progression
```

Therefore two skills used by the same Monster may intentionally have very different Accuracy values.

Example:

```text
Goblin Slash
Accuracy = 80

Goblin Wild Lunge
Accuracy = 55

Goblin Aimed Shot
Accuracy = 70
```

This difference belongs to the skills themselves.

---

# 3. D100 Hit Resolution

When a Monster Skill requires a hit check, the Skill's stored `Accuracy` is the attacker's base D100 success value.

Canonical integration with the existing D100 core:

```text
D100 Result
= Roll - [100 - (Skill Accuracy + Total Hit Modifier)]
```

where:

```text
Skill Accuracy
→ the Skill Profile's independent Accuracy value

Total Hit Modifier
→ active Buff / Debuff / Status / equipment-like effect / environment / GM modifier / other approved modifier
```

The Monster resolver does not insert STR, DEX or another Attribute into Accuracy unless a specific exceptional Skill Profile explicitly defines an additional effect that does so.

If the action is opposed by Dodge / Defence, both sides continue to use the Canonical opposed D100 resolver and compare final Results.

---

# 4. Superseded Hit Architecture

The following older Monster hit architecture is superseded:

```text
Attribute-Derived Hit Value
+ Attack Proficiency
+ Additional Hit Modifier
```

The following fields are therefore no longer required for standard Simplified Monster Skills:

```text
Primary Effective Attribute
Attack Proficiency
Attribute-Derived Hit Value
```

There is no remaining unresolved `Effective Attribute → D100 Hit Value` formula for standard Simplified Monsters.

Player Character attack/skill systems remain separate and are not changed by this override.

---

# 5. Accuracy and Damage Are Separate

Accuracy determines whether the Monster Skill lands.

Damage is resolved only after a successful hit.

Canonical runtime:

```text
Declare Monster Skill
→ D100 using Skill Accuracy
→ if miss: no normal hit damage
→ if hit: resolve Skill's final damage range
→ apply Defence / Resistance
→ calculate Damage Result
→ apply HP loss only when Damage Result > 0
→ resolve approved status / secondary effects as defined by the Skill Profile
```

A high-damage Skill may deliberately have low Accuracy.
A low-damage utility Skill may deliberately have high Accuracy.

The system must never collapse Accuracy and Damage into one generic `Attack Power` number.

---

# 6. Independent Monster Base-Damage Scaling

Monster fixed Base Damage does not use the global Monster Attribute curve or Player damage-dice model.

Canonical global damage curve:

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

The curve satisfies:

```text
MonsterDamageGrowth(1) = 0
MonsterDamageGrowth(100) = 7
```

With standard `Damage Growth Weight = 1.0`:

```text
Level 1   → 1.00× Template Base Damage
Level 30  → ~2.11×
Level 50  → ~3.44×
Level 70  → ~5.07×
Level 90  → ~6.97×
Level 100 → 8.00× Template Base Damage
```

Accuracy does not automatically use this damage-growth curve.

---

# 7. Asymmetric Damage Variance

Each Skill separately stores:

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

Canonical standard defaults for a normal new Skill Profile:

```text
Lower Variance Growth Weight = 1.50
Upper Variance Growth Weight = 2.00
```

These are editable defaults, not mandatory values for every Skill.

---

# 8. Final Damage Range

After automatic calculation and authorised GM adjustment:

```text
Minimum Raw Damage
= max(0, Final Base Damage - Final Lower Variance)

Maximum Raw Damage
= Final Base Damage + Final Upper Variance
```

After a successful hit:

```text
Raw Monster Damage
= random integer from Minimum Raw Damage to Maximum Raw Damage
```

The damage-range randomisation is not a second D100 action check and has no Great Success / Great Failure meaning.

The hard floor of `0` prevents negative raw damage or accidental healing.

---

# 9. Standard High-Volatility Example

Example Skill:

```text
Goblin Slash
Accuracy = 80
Template Base Damage = 8
Damage Growth Weight = 1.0
Template Lower Variance = 2
Lower Variance Growth Weight = 1.50
Template Upper Variance = 2
Upper Variance Growth Weight = 2.00
```

At Level 1:

```text
Damage Range = 6–10
```

At Level 100:

```text
Calculated Base Damage = 64
Calculated Lower Variance = 23
Calculated Upper Variance = 30
Damage Range = 41–94
```

The Skill may still keep the same stored Accuracy unless a separate Accuracy-scaling rule is explicitly introduced later.

---

# 10. Attributes Still Matter Elsewhere

Removing Attribute-derived Accuracy does **not** make Monster Attributes meaningless.

Effective Attributes continue to drive the systems already locked for them, including examples such as:

```text
Effective DEX → Initiative basis
Effective CON / SIZ → Max HP basis
Effective INT → Max MP basis
Effective POW / INT → mental or supernatural checks where relevant
Effective STR / SIZ → other explicit physical checks or Skill effects where a Profile specifically references them
```

A Monster Skill may explicitly reference an Attribute for a secondary effect, requirement, opposed check, status strength, forced movement or other approved mechanic.

That explicit reference does not turn Accuracy itself back into an Attribute-derived value.

---

# 11. GM Final Adjustment

GM may adjust an individual spawned Monster Skill after automatic calculations.

The system should preserve at least:

```text
Template Skill Accuracy
GM Accuracy Adjustment / Override
Final Skill Accuracy

Template Base Damage
Monster Level
MonsterDamageGrowth(Level)
Damage Growth Weight
Calculated Base Damage
GM Base Damage Adjustment
Final Base Damage

Template Lower Variance
Lower Variance Growth Weight
Calculated Lower Variance
GM Lower Variance Adjustment
Final Lower Variance

Template Upper Variance
Upper Variance Growth Weight
Calculated Upper Variance
GM Upper Variance Adjustment
Final Upper Variance

Final Minimum Raw Damage
Final Maximum Raw Damage
```

Template values, automatic calculations and instance-level GM changes must remain distinguishable for audit/debugging.

---

# 12. GM Monster Management Requirements

For each Monster Skill Profile, the GM UI must allow maintenance of:

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
Range / Reach
Targeting
Status / special-effect links
MP cost
Cooldown
Usage restrictions
Other approved flags
```

For a normal new damage Skill, the UI should prefill:

```text
Lower Variance Growth Weight = 1.50
Upper Variance Growth Weight = 2.00
```

The UI must not require standard Simplified Monster fields for:

```text
Primary Effective Attribute
Attack Proficiency
Attribute-Derived Hit Value
damage dice
Player STR + SIZ Damage Bonus
single symmetric Damage Variance
```

Spawned Skill inspection should show:

```text
Template Accuracy
GM Accuracy adjustment / override
Final Accuracy

Template Base Damage
Calculated / GM-adjusted / Final Base Damage
Calculated / GM-adjusted / Final Lower Variance
Calculated / GM-adjusted / Final Upper Variance
Final Damage Range
Damage Type
Status / effect references
MP / cooldown / usage state where relevant
```

---

# 13. Template vs Instance Editing

```text
Edit Monster Skill on Template
→ changes reusable Skill definition / future use

Edit Spawned Monster Skill Override
→ changes only that Monster instance
```

Persistent instances must not silently lose their historical Template/calculated/override data after Template edits.

---

# 14. Locked Conclusions

1. Simplified Monster offensive actions are represented as dedicated Monster Skill Profiles.
2. Each Monster Skill has its own independent `Accuracy` value.
3. Skill Accuracy is not derived from STR / DEX / CON / POW / INT / SIZ or Effective Attributes.
4. Standard Monster Skills do not use Attack Proficiency or Player weapon-specialization progression.
5. D100 hit resolution uses `Skill Accuracy + Total Hit Modifier` inside the existing D100 core.
6. The old `Attribute-Derived Hit Value + Attack Proficiency` architecture is superseded.
7. Accuracy and Damage are separate Skill properties.
8. Base Damage uses the independent Monster damage Level curve `7 × ((Level - 1) / 99)^1.5` plus per-Skill Damage Growth Weight.
9. Damage variance remains asymmetric with separate Lower / Upper values and growth weights.
10. Standard variance-growth defaults remain `Lower = 1.50`, `Upper = 2.00`.
11. Minimum Raw Damage is clamped to `0`.
12. GM may adjust Skill Accuracy and damage parameters at instance level while preserving audit history.
13. Player Character attack rules are unaffected by this Monster-specific model.

---

# 15. Next Unresolved Decision

The next Monster Skill question is whether a Skill's stored `Accuracy` remains fixed across Monster Levels by default, or receives its own explicit Level-scaling rule.
