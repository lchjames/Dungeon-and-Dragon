# Monster Attack / Skill Profile — Alpha

> Status: Canonical Alpha Override  
> Date: 2026-08-22  
> Scope: Defines how Simplified Monsters resolve offensive Attacks / Skills after the fixed-damage redesign, including the locked independent Monster damage-scaling architecture.  
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
→ one shared global Monster damage-growth curve

Damage Growth Weight
→ per Attack / Skill Profile scaling weight
```

The exact numerical formula for `MonsterDamageGrowth(Level)` is still unresolved and must be locked separately.

---

# 4. Level 1 Invariant

The future Monster Damage Level Curve must satisfy:

```text
MonsterDamageGrowth(1) = 0
```

Therefore:

```text
Level 1
→ Calculated Base Damage = Template Base Damage
```

A Damage Growth Weight must only affect Level-derived growth; it must not alter the Level-1 baseline by itself.

---

# 5. Damage Growth Weight Meaning

Each Attack / Skill Profile has its own Damage Growth Weight.

Conceptually:

```text
Weight 0
→ no Level-derived damage growth

Weight 0.5
→ half of standard Monster damage growth

Weight 1.0
→ standard Monster damage growth

Weight 1.5
→ 1.5× the Level-derived damage-growth component
```

This permits attacks on the same Monster Template to scale differently without changing their Level-1 damage.

Example:

```text
Goblin Short Sword
Damage Growth Weight = 1.0

Goblin Short Bow
Damage Growth Weight = 0.8

Goblin Poison Spit
Damage Growth Weight = 0.5
```

Exact default weights remain Template/Profile configuration, not globally hard-coded by attack name.

---

# 6. Hit Architecture Remains Separate

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

# 7. Damage Variance

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

# 8. Defence / Resistance

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

# 9. Monster Skills

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

# 10. GM Final Adjustment

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

GM instance adjustment affects only that Monster unless GM explicitly edits the reusable Template/Profile.

Changing the Template must not silently erase historical instance calculations or overrides.

---

# 11. GM Monster Management Requirements

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

The UI should make automatic calculation and GM override visibly distinct.

---

# 12. No Damage Dice / No Character Damage Bonus

For ordinary Simplified Monster offensive Profiles:

```text
no standard damage_dice requirement
no Player STR + SIZ Damage Bonus table
no hidden Attribute damage multiplier
no second application of the Monster Attribute Level Curve
```

Richer Boss / Full Character NPC profiles may explicitly use other mechanics, but those are not the default Simplified Monster rule.

---

# 13. Locked Conclusions

1. Simplified Monster Attacks / offensive Skills use D100 for hit / opposed resolution.
2. A miss deals no damage.
3. A hit uses fixed-band damage rather than Player-style damage dice.
4. Monster Base Damage has a separate Monster Damage Level Curve.
5. Each Attack / Skill Profile stores its own Damage Growth Weight.
6. The independent damage curve is deliberately separate from Attribute, HP and MP scaling.
7. Level 1 must preserve `Calculated Base Damage = Template Base Damage` before GM adjustment.
8. GM may apply final per-instance damage adjustments after automatic scaling.
9. Template values, calculated values and GM overrides must remain auditable and separate.
10. The exact `MonsterDamageGrowth(Level)` formula remains unresolved.
11. Whether Damage Variance itself scales with Level remains unresolved.
12. The exact Effective Attribute → D100 hit conversion also remains unresolved.

---

# 14. Next Decision

The next decision is the exact global:

```text
MonsterDamageGrowth(Level)
```

curve used to scale Simplified Monster fixed Base Damage from Level 1 to Level 100.
