# GM Monster Management — Alpha

> Status: Canonical Alpha Rule  
> Date: 2026-08-22  
> Scope: Defines the GM-facing Monster Management workspace required by the Hybrid Monster/NPC system, including fixed-damage Attack / Skill Profiles, independent Base Damage scaling, and asymmetric Level-scaled damage variance.

---

# 1. Dedicated GM Tab

The GM workspace must include a dedicated:

```text
Monster Management
```

tab/page.

This is the central GM interface for maintaining reusable Monster Templates and inspecting or adjusting spawned Monster Instances.

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
Attack / Skill Profiles
Ability/profile links for exceptional actions
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
10. Attach approved Attack / Skill Profiles
11. Calculate MonsterDamageGrowth(Level) = 7 × ((Level - 1) / 99)^1.5
12. Calculate each Profile's Level-adjusted Base Damage
13. Calculate each Profile's Level-adjusted Lower Variance and Upper Variance independently
14. Save generated instance
15. Permit GM final adjustment
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

# 6. Attack / Skill Profile Management

The Monster Management tab must provide a dedicated **Attack / Skill Profiles** section for each Monster Template.

Each offensive Profile must expose at least:

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
Optional Status / special-effect links
Optional MP / cooldown / usage restrictions
```

The former single symmetric `Damage Variance` field is superseded for Simplified Monsters.

Simplified Monster offensive Profiles do not require Player-style `damage_dice` fields and do not use the Player STR + SIZ Damage Bonus table by default.

---

# 7. D100 Hit Architecture

Monster ordinary attacks and offensive Skills use:

```text
D100 Attack Base
= Attribute-Derived Hit Value
+ Attack Proficiency
+ Additional Hit Modifier
```

Each Profile explicitly chooses its `Primary Effective Attribute`.

`Attack Proficiency` is a direct Template/Profile value; ordinary Monsters do not need Player weapon-practice EXP, specialization growth history, or a learning workflow.

The exact Effective Attribute → `Attribute-Derived Hit Value` formula remains unresolved and must be defined separately.

---

# 8. Locked Base Damage Level Curve

Monster fixed Base Damage uses its own Level-growth layer:

```text
MonsterDamageGrowth(Level)
= 7 × ((Level - 1) / 99)^1.5
```

Per Profile:

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

The GM UI should expose the formula rather than showing only the final result.

---

# 9. Locked Asymmetric Damage Variance Scaling

Damage variance is not a single symmetric `±` value.

Each Profile separately stores and scales:

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

The two Growth Weights are independent.

This deliberately supports a higher upper damage ceiling and a lower relative bottom limit as Monster Level rises.

The exact default relationship between the two weights remains an Alpha tuning decision.

---

# 10. Final Damage Range

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

The random damage selection is not a D100 action check and has no Great Success / Great Failure meaning.

The `0` floor prevents negative raw damage or accidental healing.

The GM UI should show the actual range, for example:

```text
Base Damage: 64
Damage Range: 42–91
```

rather than an inaccurate symmetric `64 ± X` display.

---

# 11. GM Damage Adjustment

GM may perform final authorised per-instance damage adjustments after automatic Level scaling.

For each spawned offensive Profile, the UI/audit layer must preserve:

```text
Template Base Damage
Monster Level
MonsterDamageGrowth(Level)
Template Damage Growth Weight
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

A GM instance adjustment affects only that Monster unless GM explicitly edits the reusable Template/Profile.

Template values, calculated values and instance overrides must not be collapsed into one number internally.

---

# 12. Growth Weight Editing

GM must be able to edit independently for each Attack / Skill Profile:

```text
Damage Growth Weight
Lower Variance Growth Weight
Upper Variance Growth Weight
```

Base Damage Weight meaning:

```text
0.0 → no Level-derived Base Damage growth
0.5 → half standard Base Damage growth component
1.0 → standard Base Damage growth; 8× total at Level 100
1.5 → 1.5× standard Level-derived Base Damage growth component
```

Lower and Upper Variance weights follow the same "growth component only" principle but independently control the two sides of the final damage range.

At Level 1, all Growth Weights leave their Template baseline values unchanged.

---

# 13. Spawned Attack / Skill Inspection

For each offensive Profile on a spawned Monster, GM should be able to inspect:

```text
Primary Effective Attribute
Current Effective Attribute value
Attribute-Derived Hit Value
Attack Proficiency
Additional Hit Modifier
Final D100 attack basis

Template Base Damage
MonsterDamageGrowth(Level)
Damage Growth Weight
Calculated Base Damage
GM Base Damage Adjustment
Final Base Damage

Template Lower Variance
Lower Variance Growth Weight
Calculated / GM-adjusted / Final Lower Variance

Template Upper Variance
Upper Variance Growth Weight
Calculated / GM-adjusted / Final Upper Variance

Final Minimum Raw Damage
Final Maximum Raw Damage
Damage Type
Special-effect references
```

This keeps both accuracy and the full damage band explainable.

---

# 14. Template vs Instance Editing

```text
Edit Template
→ changes reusable ranges / Growth Weights / Profiles / future Template behaviour

Edit Spawned Instance
→ changes only that individual Monster
```

Any recalculation of persistent instances after a deliberate Template change must be explicit and auditable rather than silently mutating historical values.

---

# 15. Superseded Simplified Monster Damage Fields

The GM UI should not require the older Simplified Monster fields:

```text
Damage Profile / damage dice
Apply STR + SIZ Character Damage Bonus
single symmetric Damage Variance
```

These are replaced by:

```text
Template Base Damage
Damage Growth Weight
Template Lower Variance
Lower Variance Growth Weight
Template Upper Variance
Upper Variance Growth Weight
Calculated values
GM adjustments
Final damage range
```

Player Character damage configuration remains unaffected.

---

# 16. Current Unresolved Items

Still to be decided separately:

1. default relationship between Lower Variance Growth Weight and Upper Variance Growth Weight;
2. exact Effective Attribute → D100 hit conversion;
3. later Elite/Boss/richer-profile exceptions where needed.
