# Monster Attack / Skill Profile — Alpha

> Status: Canonical Alpha Override  
> Date: 2026-08-22  
> Scope: Defines how Simplified Monsters resolve offensive Attacks / Skills after the fixed-damage redesign, including independent Base Damage scaling and asymmetric Level-scaled damage variance.  
> This file supersedes older Monster-specific wording that used damage dice, Character Damage Bonus, or a single symmetric `± Damage Variance` field for ordinary Simplified Monster attacks.

---

# 1. Core Decision — Hit Check + Fixed-Band Damage

Simplified Monster offensive actions use:

```text
Declare Monster Attack / Skill
→ resolve D100 hit / opposed check
→ if miss: no damage
→ if hit: resolve Level-adjusted fixed damage inside an asymmetric configured range
→ apply defence / resistance
→ calculate Damage Result
→ apply HP loss only when Damage Result > 0
```

The meaningful combat check is whether the Monster hits. Simplified Monsters do not roll a Player-style damage-dice package after a successful hit.

Player Character damage rules are unaffected.

---

# 2. Offensive Profile Damage Fields

A Simplified Monster offensive Profile stores at minimum:

```text
Template Base Damage
Damage Growth Weight
Template Lower Variance
Lower Variance Growth Weight
Template Upper Variance
Upper Variance Growth Weight
```

The previous single symmetric field:

```text
Damage Variance
```

is superseded for Simplified Monsters by separate lower and upper variance values.

This allows Level progression to produce a wider and intentionally asymmetric damage band.

Example Level-1 Template values:

```text
Goblin Short Sword
Template Base Damage = 8
Damage Growth Weight = 1.0
Template Lower Variance = 2
Lower Variance Growth Weight = 0.5
Template Upper Variance = 2
Upper Variance Growth Weight = 1.0
```

At Level 1, before GM adjustment:

```text
Calculated Base Damage = Template Base Damage
Calculated Lower Variance = Template Lower Variance
Calculated Upper Variance = Template Upper Variance
```

The Level-1 Profile may still be symmetric. Higher Levels are not required to remain symmetric.

---

# 3. Locked Independent Monster Base-Damage Scaling

Monster fixed Base Damage does **not** use:

```text
Global Monster Attribute Curve
Player HP/MP curve applied a second time
Effective STR + SIZ Character Damage Bonus
Player weapon-specialization damage scaling
```

Instead it has its own dedicated progression layer:

```text
Template Base Damage
→ Monster Damage Level Curve
→ Attack / Skill Damage Growth Weight
→ Calculated Base Damage
→ GM Final Base Damage Adjustment
→ Final Base Damage
```

Canonical formula:

```text
MonsterDamageGrowth(Level)
= 7 × ((Level - 1) / 99)^1.5

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

Therefore standard `Damage Growth Weight = 1.0` gives:

```text
Level 1   → 1.00× Template Base Damage
Level 30  → ~2.11×
Level 50  → ~3.44×
Level 70  → ~5.07×
Level 90  → ~6.97×
Level 100 → 8.00× Template Base Damage
```

---

# 4. Locked Asymmetric Damage Variance Architecture

Damage variance uses its own Level-scaling weights and is no longer required to be symmetric around Base Damage.

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

The two weights are independent.

This means a Monster Profile may deliberately make the high-end damage ceiling grow faster while also allowing the low-end floor to move farther downward.

Conceptually:

```text
Level rises
→ Base Damage rises
→ Upper Variance can expand strongly
→ Lower Variance can also expand
→ final possible damage band becomes wider
```

The system must not collapse the two sides into a single symmetric `±` value.

---

# 5. Final Damage Range

After automatic scaling and authorised GM adjustments:

```text
Minimum Raw Damage
= max(0, Final Base Damage - Final Lower Variance)

Maximum Raw Damage
= Final Base Damage + Final Upper Variance
```

A successful hit then resolves:

```text
Raw Monster Damage
= random integer from Minimum Raw Damage to Maximum Raw Damage
```

The random damage selection is **not** a D100 action check and has no Great Success / Great Failure meaning.

The hard floor of `0` prevents a wide lower variance from producing negative raw damage or accidental healing.

---

# 6. Higher Upper Limit / Lower Bottom Limit Principle

Canonical design intent:

```text
higher-Level Monster
→ may have a noticeably higher damage ceiling
→ may also have a lower relative damage floor
→ wider volatility than the Level-1 Profile
```

Therefore the Profile model must support:

```text
Upper Variance Growth Weight ≠ Lower Variance Growth Weight
```

and should not assume the two sides scale equally.

A Template can intentionally configure a stronger high-end expansion, for example:

```text
Upper Variance Growth Weight > Lower Variance Growth Weight
```

while still increasing Lower Variance enough to push the possible minimum farther below the Level-adjusted Base Damage.

The exact default relationship between the two growth weights is a separate Alpha tuning decision.

---

# 7. Level 1 Invariants

Because `MonsterDamageGrowth(1) = 0`:

```text
Calculated Base Damage = Template Base Damage
Calculated Lower Variance = Template Lower Variance
Calculated Upper Variance = Template Upper Variance
```

at Level 1 before GM adjustment.

Growth Weights only control Level-derived expansion; they do not alter the Level-1 Template baseline by themselves.

---

# 8. Hit Architecture Remains Separate

The Monster hit architecture remains:

```text
D100 Attack Base
= Attribute-Derived Hit Value
+ Attack Proficiency
+ Additional Hit Modifier
```

Each offensive Profile explicitly stores:

```text
Primary Effective Attribute
Attack Proficiency
Additional Hit Modifier
```

Monster Level and Elite status may improve accuracy through Effective Attributes.

The exact shared Effective Attribute → D100 `Attribute-Derived Hit Value` conversion remains unresolved and is separate from damage scaling.

Accuracy and damage must never be merged into one vague Attack Bonus.

---

# 9. Defence / Resistance

After Raw Monster Damage is generated:

```text
Damage Result
= Raw Monster Damage - Effective Defence / Resistance
```

Then:

```text
Damage Result > 0
→ target loses that much HP

Damage Result <= 0
→ target loses no HP
```

The existing Damage Result / defence framework remains compatible with the Simplified Monster model.

---

# 10. Monster Skills

Ordinary offensive Monster Skills use the same fixed-range structure.

Example:

```text
Poison Spit
Primary Effective Attribute: DEX
Attack Proficiency: 18
Additional Hit Modifier: 0
Template Base Damage: 10
Damage Growth Weight: 0.6
Template Lower Variance: 1
Lower Variance Growth Weight: 0.4
Template Upper Variance: 3
Upper Variance Growth Weight: 0.9
Damage Type: Poison
Additional Effect: approved poison Status Profile
```

Damage, status, area, range, MP cost, cooldown and other special effects remain separate Profile fields.

A special effect does not silently modify damage unless explicitly configured.

---

# 11. GM Final Adjustment

GM may adjust an individual spawned Monster after all automatic Level calculations.

The system must preserve:

```text
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

GM instance adjustment affects only that Monster unless GM explicitly edits the reusable Template/Profile.

Changing the Template must not silently erase historical instance calculations or overrides.

---

# 12. GM Monster Management Requirements

For each Attack / Skill Profile, GM must be able to maintain:

```text
Name
Attack / Damage Type
Primary Effective Attribute
Attack Proficiency
Additional Hit Modifier
Template Base Damage
Damage Growth Weight
Template Lower Variance
Lower Variance Growth Weight
Template Upper Variance
Upper Variance Growth Weight
Range / Reach
Targeting
Status / special-effect links
MP / cooldown / usage restrictions where relevant
```

For a spawned instance, GM should be able to inspect:

```text
Monster Level
Template Base Damage
MonsterDamageGrowth(Level)
Damage Growth Weight
Calculated Base Damage
GM Base Damage Adjustment
Final Base Damage
Calculated / Final Lower Variance
Calculated / Final Upper Variance
Final Minimum Raw Damage
Final Maximum Raw Damage
```

The UI must make automatic calculation and GM override visibly distinct.

Recommended human-readable display:

```text
Damage: 64
Range: 42–91
```

rather than forcing an inaccurate symmetric form such as:

```text
64 ± X
```

when the lower and upper sides differ.

---

# 13. No Damage Dice / No Character Damage Bonus

For ordinary Simplified Monster offensive Profiles:

```text
no standard damage_dice requirement
no Player STR + SIZ Damage Bonus table
no hidden Attribute damage multiplier
no second application of the Monster Attribute Level Curve
```

Richer Boss / Full Character NPC profiles may explicitly use other mechanics, but those are not the default Simplified Monster rule.

---

# 14. Superseded Simplified Monster Variance Model

The previous single field:

```text
Damage Variance
```

and runtime form:

```text
Base Damage ± Damage Variance
```

are superseded for Simplified Monsters by:

```text
Lower Variance + Lower Variance Growth Weight
Upper Variance + Upper Variance Growth Weight
```

This is required so the upper ceiling and lower floor can evolve independently with Level.

---

# 15. Locked Conclusions

1. Simplified Monster Attacks / offensive Skills use D100 for hit / opposed resolution.
2. A miss deals no damage.
3. A hit uses a Level-scaled fixed damage range rather than Player-style damage dice.
4. Base Damage uses `MonsterDamageGrowth(Level) = 7 × ((Level - 1) / 99)^1.5` plus per-Profile `Damage Growth Weight`.
5. Damage variance is asymmetric: Lower and Upper Variance are separate values.
6. Lower and Upper Variance each have independent Level Growth Weights.
7. Higher-Level Profiles may have both a higher upper damage ceiling and a lower relative damage floor.
8. Minimum Raw Damage is clamped to `0`.
9. GM may separately adjust Base Damage, Lower Variance and Upper Variance at instance level.
10. Template, calculated and GM-adjusted values remain auditable and separate.
11. The exact default relationship between Lower and Upper Variance Growth Weights remains unresolved.
12. The exact Effective Attribute → D100 hit conversion remains unresolved.

---

# 16. Next Decision

The next Monster damage decision is the **default asymmetry** between:

```text
Lower Variance Growth Weight
Upper Variance Growth Weight
```

for standard Monster Attack / Skill Profiles.
