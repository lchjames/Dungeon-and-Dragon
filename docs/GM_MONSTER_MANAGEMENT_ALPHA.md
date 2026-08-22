# GM Monster Management — Alpha

> Status: Canonical Alpha Rule  
> Date: 2026-08-22  
> Scope: Defines the GM-facing Monster Management workspace required by the Hybrid Monster/NPC system.

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

For Simplified Monster Templates, the required Attribute configuration is:

```text
STR min / max + STR Growth Weight
DEX min / max + DEX Growth Weight
CON min / max + CON Growth Weight
POW min / max + POW Growth Weight
INT min / max + INT Growth Weight
SIZ min / max + SIZ Growth Weight
```

The template may additionally contain:

```text
Name
Description / notes
Default or allowed Level information
Elite configuration where allowed
Attack Profiles
Ability/profile links for special actions
Other approved Monster metadata
```

Editing a Template affects the reusable definition/future calculations; it does not silently erase already spawned instances or their Natural Attribute history.

---

# 3. Spawn Workflow

From Monster Management, GM must be able to request one or multiple instances from a selected Template.

If GM requests N Monsters, the server runs the full spawn pipeline N separate times.

For every instance:

```text
1. Roll six base Attributes from Template ranges
2. Roll that instance's 10% Elite check
3. If Elite, roll one +1 to +5 Elite Bonus and apply it to all six Attributes
4. Save the post-Elite values as Natural Attributes
5. Calculate GlobalGrowth(Level) = ((Level - 1) / 21.7)^2
6. Apply the Template's six Growth Weights
7. Calculate Effective Attributes
8. Calculate Max HP = ceil((Effective CON + Effective SIZ) / 2)
9. Calculate Max MP = Effective INT × 3
10. Recalculate other derived combat/resource values from Effective Attributes
11. Attach/use the Template's approved Attack Profiles
12. Save the generated instance
13. Permit GM final adjustment
```

A group spawn never clones one generated result across the group.

---

# 4. Locked Level Scaling Display

The GM UI must expose the Canonical calculation:

```text
Effective Attribute
= round(
    Natural Attribute
    × [1 + ((Level - 1) / 21.7)^2 × Attribute Growth Weight]
  )
```

For each spawned instance, GM should be able to inspect:

```text
Template source
Monster Level
Base rolled STR / DEX / CON / POW / INT / SIZ
Elite result
Elite Attribute Bonus
Natural STR / DEX / CON / POW / INT / SIZ
GlobalGrowth(Level)
STR / DEX / CON / POW / INT / SIZ Growth Weights
Effective STR / DEX / CON / POW / INT / SIZ
Calculated Max HP
HP GM adjustment
Final Max HP
Current HP
Calculated Max MP
MP GM adjustment
Final Max MP
Current MP
Attack Profiles
Attack instance overrides, if any
Other derived values
GM adjustments
Final current state
```

The UI should visually distinguish Natural, Effective, calculated resources, Template Attack Profiles, and instance-level GM overrides.

---

# 5. Locked Monster Resource Handling

## HP

```text
Calculated Max HP
= ceil((Effective CON + Effective SIZ) / 2)
```

## MP

```text
Calculated Max MP
= Effective INT × 3
```

Neither resource receives the global Level curve a second time because the relevant Effective Attributes already include Level scaling.

GM may adjust Final Max HP, Current HP, Final Max MP, or Current MP at instance level. Calculated values and GM adjustments must remain distinguishable for audit/debugging.

---

# 6. Monster Attack Profile Management

Simplified Monsters use the Canonical simplified Player-style attack model defined in `MONSTER_ATTACK_PROFILE_ALPHA.md`.

The Monster Management tab must provide a dedicated **Attack Profiles** section for each Monster Template.

A Template may contain multiple ordinary Attack Profiles, for example:

```text
Goblin Short Sword
Goblin Short Bow
```

Each Attack Profile must expose at least:

```text
Attack name
Attack / damage type
Primary Effective Attribute
Attack Proficiency
Additional Hit Modifier
Damage Profile / damage dice
Fixed Damage Modifier
Apply Effective STR + Effective SIZ Damage Bonus: yes/no
Range / reach
Targeting fields where relevant
Ability link when the action is exceptional rather than ordinary
```

## 6.1 Locked D100 Hit Architecture

Monster ordinary attacks use:

```text
D100 Attack Base
= Attribute-Derived Hit Value
+ Attack Proficiency
```

with any additional hit modifier stored separately.

The Attack Profile explicitly chooses its `Primary Effective Attribute`.

Example:

```text
Goblin Short Sword
Primary Effective Attribute: DEX
Attack Proficiency: 20
Additional Hit Modifier: +5
```

`Attack Proficiency` is a direct Template/Profile value. Ordinary Monsters do not need Player weapon-practice EXP, specialization growth history, or a learning workflow to maintain it.

The exact formula converting an Effective Attribute into `Attribute-Derived Hit Value` remains tied to the shared Player ordinary physical Attack Mapping and is not independently invented by the Monster system.

## 6.2 Instance Inspection

For each attack on a spawned Monster, GM should be able to inspect:

```text
Primary Effective Attribute
current Effective Attribute value
Attribute-Derived Hit Value
Template Attack Proficiency
Additional Hit Modifier
instance attack override, if any
final D100 attack basis
Damage Profile
Damage Bonus applicability
```

This keeps Level/Elite influence auditable:

```text
Natural Attribute
→ Elite / Level scaling
→ Effective Attribute
→ Attribute-Derived Hit Value
→ + Attack Proficiency
→ + separate Hit Modifier
→ final D100 basis
```

The global Monster Level curve must not be applied again after the Effective Attribute has already included it.

## 6.3 Template vs Instance Attack Editing

```text
Edit Template Attack Profile
→ changes reusable definition / future use

Edit Spawned Instance Attack Override
→ changes only that Monster
```

Template values, calculated values, and instance overrides must remain distinguishable.

---

# 7. Level Principle

Monster Level never changes Template Attribute ranges before rolling and never rerolls Natural Attributes.

At Level 1:

```text
Effective = Natural
```

At higher Levels, Effective Attributes are recalculated from preserved Natural Attributes and Template Growth Weights.

A standard Weight `1.0` uses the same Level growth shape as Player HP/MP and reaches about `21.81×` Natural at Level 100.

Attack components that read Effective Attributes naturally receive Level/Elite influence through those Effective values. The global Level curve must not be silently applied a second time to the same attack output.

---

# 8. GM Final Adjustment

GM may adjust a generated Monster Instance after automatic generation, Level scaling and derived-stat calculation.

This adjustment applies only to that individual instance unless GM explicitly edits the Template.

The system must preserve enough audit data to distinguish:

```text
Base roll
Elite Bonus
Natural Attribute
Calculated Effective Attribute
Calculated Resource / derived value
Template Attack Profile
Calculated Attribute-Derived Hit Value
Template Attack Proficiency
Instance Attack Override
GM adjustment
Final value
```

GM editing must not erase Natural Attribute history or calculated pre-adjustment values.

---

# 9. Template vs Instance Editing

```text
Edit Template
→ changes reusable ranges / Growth Weights / Attack Profiles / future Template behaviour

Edit Spawned Instance
→ changes only that individual Monster
```

Where persistent instances are recalculated after a deliberate Template Growth Weight or Attack Profile change, the operation must be explicit/auditable rather than silently mutating historical values.
