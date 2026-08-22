# GM Monster Management — Alpha

> Status: Canonical Alpha Rule  
> Date: 2026-08-22  
> Scope: Defines the GM-facing Monster Management workspace required by the Hybrid Monster/NPC system, including independent Monster Skill Accuracy, fixed-damage Skill Profiles, independent Base Damage scaling, and asymmetric Level-scaled damage variance.

---

# 1. Dedicated GM Tab

The GM workspace must include a dedicated:

```text
Monster Management
```

tab/page.

This is the central GM interface for maintaining reusable Monster Templates, their dedicated Monster Skills, and spawned Monster Instances.

All persistent Monster data is D1-authoritative.

---

# 2. Monster Template Management

GM can create, view, edit and retire Monster Templates.

Required Simplified Monster Attribute configuration:

```text
STR min / max + STR Growth Weight
DEX min / max + DEX Growth Weight
CON min / max + CON Growth Weight
POW min / max + POW Growth Weight
INT min / max + INT Growth Weight
SIZ min / max + SIZ Growth Weight
```

The Template may additionally contain:

```text
Name
Description / notes
Default or allowed Level information
Elite configuration
Monster Skill Profiles
Other approved Monster metadata
```

Template editing must not silently erase already spawned instances or their generation history.

---

# 3. Spawn Workflow

For every requested Monster instance, the server independently runs:

```text
1. Roll six base Attributes from Template ranges
2. Roll that instance's 10% Elite check
3. If Elite, roll one +1 to +5 Elite Bonus and apply it to all six Attributes
4. Save post-Elite values as Natural Attributes
5. Calculate GlobalGrowth(Level) = ((Level - 1) / 21.7)^2
6. Apply six Attribute Growth Weights
7. Calculate Effective Attributes
8. Calculate Max HP = ceil((Effective CON + Effective SIZ) / 2)
9. Calculate Max MP = Effective INT × 3
10. Attach approved Monster Skill Profiles
11. Preserve each Skill's independent Accuracy value
12. Calculate MonsterDamageGrowth(Level) = 7 × ((Level - 1) / 99)^1.5
13. Calculate each damaging Skill's Level-adjusted Base Damage
14. Calculate each damaging Skill's Level-adjusted Lower Variance and Upper Variance independently
15. Save generated instance
16. Permit GM final adjustment
```

Requesting N Monsters runs the full generation pipeline N separate times. A group spawn never clones one generated result across the group.

---

# 4. Attribute and Resource Inspection

For each spawned Monster, GM should be able to inspect:

```text
Template source
Monster Level
Base rolled STR / DEX / CON / POW / INT / SIZ
Elite result
Elite Attribute Bonus
Natural STR / DEX / CON / POW / INT / SIZ
GlobalGrowth(Level)
Attribute Growth Weights
Effective STR / DEX / CON / POW / INT / SIZ
Calculated Max HP
HP GM adjustment
Final Max HP / Current HP
Calculated Max MP
MP GM adjustment
Final Max MP / Current MP
```

Automatic values and GM overrides must be visually distinguishable.

---

# 5. Locked Resource Handling

```text
Calculated Max HP
= ceil((Effective CON + Effective SIZ) / 2)

Calculated Max MP
= Effective INT × 3
```

Neither HP nor MP receives the global Level curve a second time because Effective Attributes already include Level scaling.

GM may adjust Final Max HP, Current HP, Final Max MP and Current MP at instance level. Calculated values and GM adjustments remain separate for audit/debugging.

---

# 6. Monster Skill Profile Management

The Monster Management tab must provide a dedicated **Monster Skills** section for each Monster Template.

A Simplified Monster offensive action is represented as a dedicated Monster Skill Profile rather than borrowing the Player weapon-proficiency progression model.

Examples:

```text
Goblin Slash
Goblin Short Bow Shot
Wolf Bite
Ogre Heavy Smash
Poison Spit
Fire Breath
```

Each Skill Profile should be able to expose as applicable:

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

For a normal new damaging Skill, the UI must prefill:

```text
Lower Variance Growth Weight = 1.50
Upper Variance Growth Weight = 2.00
```

GM may override either default before saving the Template Skill.

---

# 7. Locked Independent Skill Accuracy

Each Monster Skill has its own independent `Accuracy` value.

Canonical:

```text
Monster Skill Accuracy
= stored directly on the Skill Profile
```

Accuracy is not automatically calculated from:

```text
STR
DEX
CON
POW
INT
SIZ
Natural Attributes
Effective Attributes
Attack Proficiency
Player weapon specialization
Player Skill Point progression
```

Two Skills on the same Monster can therefore have different Accuracy values by design.

Example:

```text
Goblin Slash
Accuracy = 80

Goblin Wild Lunge
Accuracy = 55

Goblin Aimed Shot
Accuracy = 70
```

This supersedes the earlier Monster hit architecture based on:

```text
Attribute-Derived Hit Value
+ Attack Proficiency
+ Additional Hit Modifier
```

The standard Simplified Monster Skill UI must no longer require:

```text
Primary Effective Attribute
Attack Proficiency
Attribute-Derived Hit Value
```

---

# 8. D100 Skill Hit Resolution

When a Monster Skill requires a hit check, its stored Accuracy is the base D100 success value.

Canonical integration with the existing D100 core:

```text
D100 Result
= Roll - [100 - (Skill Accuracy + Total Hit Modifier)]
```

where `Total Hit Modifier` may contain approved effects such as:

```text
Buff
Debuff
Status
Environment
GM modifier
other explicit Skill / encounter modifiers
```

STR / DEX / other Attributes are not inserted into Skill Accuracy unless a specific exceptional Skill explicitly defines a separate additional mechanic.

If the target uses an opposed Dodge / Defence check, continue using the Canonical opposed D100 resolver and compare final Results.

---

# 9. Accuracy and Damage Must Remain Separate

Canonical Monster Skill runtime:

```text
Declare Skill
→ resolve D100 using Skill Accuracy
→ miss: no normal hit damage
→ hit: resolve final damage range
→ Defence / Resistance
→ Damage Result
→ HP loss only when Damage Result > 0
→ resolve approved secondary effects according to Skill Profile
```

A Skill may intentionally be:

```text
high damage + low Accuracy
low damage + high Accuracy
high Accuracy + utility/status focused
low Accuracy + powerful control/effect
```

The UI and storage model must never collapse Accuracy and Damage into one generic Attack number.

---

# 10. Locked Base Damage Level Curve

Monster fixed Base Damage uses its own Level-growth layer:

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
Level 1   → 1.00× Template Base Damage
Level 30  → ~2.11×
Level 50  → ~3.44×
Level 70  → ~5.07×
Level 90  → ~6.97×
Level 100 → 8.00× Template Base Damage
```

Accuracy does not automatically use this damage-growth curve.

---

# 11. Locked Asymmetric Damage Variance Scaling

Each damaging Skill separately stores and scales:

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

Canonical defaults:

```text
Lower Variance Growth Weight = 1.50
Upper Variance Growth Weight = 2.00
```

The two weights remain independent and can be overridden per Skill.

Example:

```text
Template Base Damage = 8
Damage Growth Weight = 1.0
Template Lower Variance = 2
Template Upper Variance = 2
```

At Level 100:

```text
Calculated Base Damage = 64
Calculated Lower Variance = 23
Calculated Upper Variance = 30
Damage Range = 41–94
```

---

# 12. Final Damage Range

After automatic calculations and GM adjustments:

```text
Minimum Raw Damage
= max(0, Final Base Damage - Final Lower Variance)

Maximum Raw Damage
= Final Base Damage + Final Upper Variance
```

After a successful D100 hit:

```text
Raw Monster Damage
= random integer from Minimum Raw Damage to Maximum Raw Damage
```

This random damage selection is not a second D100 action check and has no Great Success / Great Failure meaning.

The `0` floor prevents negative raw damage or accidental healing.

---

# 13. GM Skill Adjustment and Inspection

GM may perform authorised per-instance Skill adjustments after automatic calculations.

For each spawned Skill, the UI/audit layer should preserve:

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
Damage Type
Status / effect references
MP / cooldown / usage state where relevant
```

Template values, calculated values and instance overrides must not be collapsed into one number internally.

---

# 14. Attributes Still Matter Outside Accuracy

Removing Attribute-derived Accuracy does not remove Monster Attributes from the rules.

Examples of existing uses remain:

```text
Effective DEX → Initiative basis
Effective CON / SIZ → Max HP basis
Effective INT → Max MP basis
Effective POW / INT → mental or supernatural checks where relevant
```

A specific Monster Skill may explicitly reference an Attribute for:

```text
secondary effect strength
forced movement
status potency
special opposed checks
requirements
other approved mechanics
```

Such explicit references do not automatically modify that Skill's Accuracy.

---

# 15. Template vs Instance Editing

```text
Edit Monster Skill on Template
→ changes reusable Skill definition / future use

Edit Spawned Monster Skill Override
→ changes only that Monster instance
```

Any recalculation of persistent instances after a deliberate Template change must be explicit and auditable rather than silently mutating historical values.

---

# 16. Superseded Simplified Monster Fields

The GM UI should no longer require the older standard Simplified Monster fields:

```text
Primary Effective Attribute for hit chance
Attack Proficiency
Attribute-Derived Hit Value
Damage Profile / damage dice
Apply STR + SIZ Character Damage Bonus
single symmetric Damage Variance
```

These are replaced by the self-contained Monster Skill model:

```text
Accuracy
Template Base Damage
Damage Growth Weight
Template Lower Variance
Lower Variance Growth Weight
Template Upper Variance
Upper Variance Growth Weight
Skill effects / restrictions
Calculated values
GM adjustments
Final damage range
```

Player Character attack configuration remains unaffected.

---

# 17. Current Unresolved Items

Still to be decided separately:

1. whether Monster Skill Accuracy stays fixed across Monster Levels by default or has its own Level scaling;
2. exact allowed Accuracy range / interaction with the D100 natural extreme rules if further tuning is needed;
3. later Elite/Boss/richer-profile exceptions where needed.
