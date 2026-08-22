# Monster Attack / Skill Profile — Alpha

> Status: Canonical Alpha Override  
> Date: 2026-08-22  
> Scope: Defines how Simplified Monsters resolve offensive Attacks / Skills after the fixed-damage redesign, including the locked independent Monster damage-scaling architecture and global damage Level curve.  
> This file supersedes older Monster-specific wording that used damage dice, Character Damage Bonus, or Player-style damage scaling for ordinary Simplified Monster attacks.

---

# 1. Core Decision — Hit Check + Fixed-Band Damage

Simplified Monster offensive actions use:

```text
Declare Monster Attack / Skill
→ resolve D100 hit / opposed check
→ if miss: no damage
→ if hit: resolve Level-adjusted fixed damage ± configured variance
→ apply defence / resistance
→ calculate Damage Result
→ apply HP loss only when Damage Result > 0
```

The meaningful combat check is whether the Monster hits. Simplified Monsters do not roll a Player-style damage-dice package after a successful hit.

Player Character damage rules are unaffected.

---

# 2. Fixed-Band Damage Profile

A Simplified Monster offensive Profile stores at minimum:

```text
Template Base Damage
Damage Variance
Damage Growth Weight
```

Example Level-1 Template values:

```text
Goblin Short Sword
Template Base Damage = 8
Damage Variance = 2
Damage Growth Weight = 1.0
```

At Level 1, before GM adjustment:

```text
Calculated Base Damage = Template Base Damage
```

The final damage band is based on the calculated Level-adjusted Base Damage plus/minus the configured variance rule.

`Damage Variance = 0` remains valid and means fully fixed damage.

---

# 3. Locked Independent Monster Damage Scaling

Monster fixed damage does **not** use:

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
→ GM Final Damage Adjustment
→ Final Base Damage
```

Canonical architecture:

```text
Calculated Base Damage
= round(
    Template Base Damage
    × [1 + MonsterDamageGrowth(Level) × Damage Growth Weight]
  )
```

where:

```text
MonsterDamageGrowth(Level)
= 7 × ((Level - 1) / 99)^1.5
```

and:

```text
Damage Growth Weight
→ per Attack / Skill Profile scaling weight
```

This curve is deliberately smoother than the Monster Attribute Level curve. It gives high-Level Monsters materially stronger damage without automatically inheriting the much larger Attribute multiplier.

---

# 4. Locked Global Monster Damage Level Curve

Canonical global curve:

```text
MonsterDamageGrowth(Level)
= 7 × ((Level - 1) / 99)^1.5
```

For standard `Damage Growth Weight = 1.0`, the total Base Damage multiplier is:

```text
1 + MonsterDamageGrowth(Level)
```

Selected standard-weight multipliers:

| Level | Base Damage Multiplier |
|---:|---:|
| 1 | 1.00× |
| 10 | ~1.19× |
| 20 | ~1.59× |
| 30 | ~2.11× |
| 40 | ~2.73× |
| 50 | ~3.44× |
| 60 | ~4.22× |
| 70 | ~5.07× |
| 75 | ~5.52× |
| 80 | ~5.99× |
| 90 | ~6.97× |
| 95 | ~7.48× |
| 99 | ~7.89× |
| 100 | 8.00× |

Therefore, with standard Weight `1.0`:

```text
Level 1  → 1× Template Base Damage
Level 100 → 8× Template Base Damage
```

Example:

```text
Template Base Damage = 8
Damage Growth Weight = 1.0

Level 1
→ Calculated Base Damage = 8

Level 100
→ Calculated Base Damage = 64
```

---

# 5. Level 1 Invariant

The locked Monster Damage Level Curve satisfies:

```text
MonsterDamageGrowth(1) = 0
```

Therefore:

```text
Level 1
→ Calculated Base Damage = Template Base Damage
```

A Damage Growth Weight only affects Level-derived growth; it never changes the Level-1 baseline by itself.

---

# 6. Damage Growth Weight Meaning

Each Attack / Skill Profile has its own Damage Growth Weight.

Canonical meaning:

```text
Weight 0
→ no Level-derived damage growth

Weight 0.5
→ half of the global Level-derived damage-growth component

Weight 1.0
→ standard global damage growth
→ 8× total Base Damage at Level 100

Weight 1.5
→ 1.5× the Level-derived growth component
```

The Weight multiplies only the growth component, not the full damage value.

Example at Level 100:

```text
MonsterDamageGrowth(100) = 7

Weight 0.5
→ total multiplier = 1 + 7 × 0.5 = 4.5×

Weight 1.0
→ total multiplier = 1 + 7 × 1.0 = 8×

Weight 1.5
→ total multiplier = 1 + 7 × 1.5 = 11.5×
```

This permits attacks on the same Monster Template to scale differently without changing their Level-1 damage.

---

# 7. Hit Architecture Remains Separate

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

The exact shared Effective Attribute → D100 `Attribute-Derived Hit Value` conversion remains unresolved and is a separate decision from damage scaling.

Accuracy and damage must never be merged into one vague Attack Bonus.

---

# 8. Damage Variance

After a successful D100 hit:

```text
Variance Roll
= random integer from -Final Damage Variance to +Final Damage Variance

Raw Monster Damage
= Final Base Damage + Variance Roll
```

The variance roll is not a D100 check and has no Great Success / Great Failure meaning.

The exact rule for whether `Damage Variance` itself stays constant with Level or scales with the Monster Damage Level Curve is **not yet locked** and must be decided separately.

Until that decision is made, implementation must not silently invent variance scaling.

---

# 9. Defence / Resistance

After Raw Monster Damage is produced:

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

The existing Damage Result / defence framework therefore remains compatible with the Simplified Monster model.

---

# 10. Monster Skills

Ordinary offensive Monster Skills use the same fixed-band structure.

Example:

```text
Poison Spit
Primary Effective Attribute: DEX
Attack Proficiency: 18
Additional Hit Modifier: 0
Template Base Damage: 10
Damage Variance: 2
Damage Growth Weight: 0.6
Damage Type: Poison
Additional Effect: approved poison Status Profile
```

Damage, status, area, range, MP cost, cooldown and other special effects remain separate Profile fields.

A special effect does not silently modify damage unless explicitly configured.

---

# 11. GM Final Adjustment

GM may adjust an individual spawned Monster after automatic Level damage calculation.

The system must preserve:

```text
Template Base Damage
Monster Level
MonsterDamageGrowth(Level)
Damage Growth Weight
Calculated Base Damage
GM Base Damage Adjustment
Final Base Damage

Template / Calculated Damage Variance
GM Variance Adjustment
Final Damage Variance
```

Canonical order:

```text
Template Base Damage
→ global 1.5-power Monster Damage Level Curve
→ Damage Growth Weight
→ Calculated Base Damage
→ GM Base Damage Adjustment
→ Final Base Damage
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
Damage Variance
Damage Growth Weight
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
GM Damage Adjustment
Final Base Damage
Final Damage Variance
Displayed final damage band
```

The UI should display the global curve formula and enough intermediate values for the final damage to be explainable.

The UI must make automatic calculation and GM override visibly distinct.

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

# 14. Locked Conclusions

1. Simplified Monster Attacks / offensive Skills use D100 for hit / opposed resolution.
2. A miss deals no damage.
3. A hit uses fixed-band damage rather than Player-style damage dice.
4. Monster Base Damage uses an independent global Level curve: `7 × ((Level - 1) / 99)^1.5`.
5. Each Attack / Skill Profile stores its own Damage Growth Weight.
6. Standard Weight `1.0` produces `1×` Base Damage at Level 1 and `8×` at Level 100.
7. The independent damage curve is deliberately separate from Attribute, HP and MP scaling.
8. GM may apply final per-instance damage adjustments after automatic scaling.
9. Template values, calculated values and GM overrides remain auditable and separate.
10. Damage Variance Level scaling remains unresolved.
11. The exact Effective Attribute → D100 hit conversion remains unresolved.

---

# 15. Next Decision

The next Monster damage decision is whether `Damage Variance`:

```text
Base Damage ± Damage Variance
```

remains a fixed Template value across Level, or scales as Monster Level increases.
