# GM Monster Management — Alpha

> Status: Canonical Alpha Rule  
> Date: 2026-08-22  
> Scope: Defines the GM-facing Monster Management workspace required by the Hybrid Monster/NPC system, including fixed-damage Attack / Skill Profiles and the locked independent Monster damage Level curve.

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
12. Calculate each Profile's Level-adjusted Base Damage using Damage Growth Weight
13. Save generated instance
14. Permit GM final adjustment
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
Damage Variance
Damage Growth Weight
Range / Reach
Targeting
Optional Status / special-effect links
Optional MP / cooldown / usage restrictions
```

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

# 8. Locked Fixed-Damage Runtime

After a successful D100 hit:

```text
Final Base Damage
± Final Damage Variance
→ Raw Monster Damage
→ Defence / Resistance
→ Damage Result
→ HP loss only when Damage Result > 0
```

Variance uses a simple random integer in the configured ± range. It is not a D100 action check and has no Great Success / Great Failure meaning.

`Damage Variance = 0` means completely fixed damage.

---

# 9. Locked Independent Monster Damage Level Curve

Monster fixed Base Damage uses its own Level-growth layer and does not reuse the much stronger Attribute curve as a hidden second multiplier.

Canonical global curve:

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

The curve satisfies:

```text
MonsterDamageGrowth(1) = 0
MonsterDamageGrowth(100) = 7
```

Therefore with standard `Damage Growth Weight = 1.0`:

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

# 10. GM Damage Adjustment

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

Template / Calculated Damage Variance
GM Variance Adjustment
Final Damage Variance
```

Canonical order:

```text
Template Base Damage
→ global Monster Damage Level Curve
→ Damage Growth Weight
→ Calculated Base Damage
→ GM Base Damage Adjustment
→ Final Base Damage
```

A GM instance adjustment affects only that Monster unless GM explicitly edits the reusable Template/Profile.

Template values, calculated values and instance overrides must not be collapsed into one number internally.

---

# 11. Damage Growth Weight Editing

GM must be able to edit `Damage Growth Weight` separately for each Attack / Skill Profile.

Canonical meaning:

```text
0.0 → no Level-derived damage growth
0.5 → half standard damage-growth component
1.0 → standard damage growth; 8× total at Level 100
1.5 → 1.5× standard Level-derived growth component
```

The Weight only affects the Level-derived component and does not change the Level-1 baseline.

At Level 100:

```text
Weight 0.5 → 4.5× total damage baseline
Weight 1.0 → 8.0×
Weight 1.5 → 11.5×
```

---

# 12. Spawned Attack / Skill Inspection

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
Final Damage Variance
Displayed final damage band
Damage Type
Special-effect references
```

This keeps both accuracy and damage explainable.

---

# 13. Template vs Instance Editing

```text
Edit Template
→ changes reusable ranges / Growth Weights / Profiles / future Template behaviour

Edit Spawned Instance
→ changes only that individual Monster
```

Any recalculation of persistent instances after a deliberate Template change must be explicit and auditable rather than silently mutating historical values.

---

# 14. Superseded Simplified Monster Damage Fields

The GM UI should not require the older Simplified Monster fields:

```text
Damage Profile / damage dice
Apply STR + SIZ Character Damage Bonus
```

These are replaced by:

```text
Template Base Damage
Damage Variance
Damage Growth Weight
Calculated Base Damage
GM Damage Adjustment
Final Base Damage
```

Player Character damage configuration remains unaffected.

---

# 15. Current Unresolved Items

Still to be decided separately:

1. whether Damage Variance stays constant with Level or scales;
2. exact Effective Attribute → D100 hit conversion;
3. later Elite/Boss/richer-profile exceptions where needed.
