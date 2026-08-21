# GM Monster Management — Alpha

> Status: Canonical Alpha Rule  
> Date: 2026-08-21  
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

The UI should visually distinguish:

```text
Natural
→ generated identity after Elite processing

Effective
→ current Level-scaled Attribute used by live rules

Calculated HP / MP
→ automatic resource results from Effective Attributes

Template Attack Profile
→ reusable approved ordinary-attack definition

Instance Attack Override
→ later authorised change affecting only this spawned Monster

GM Adjustment
→ later authorised manual change
```

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

GM may adjust a generated Monster Instance's final Max HP, Current HP, Max MP or Current MP after automatic calculation.

The UI/audit layer must preserve:

```text
Calculated Max HP
GM Max HP adjustment
Final Max HP
Current HP

Calculated Max MP
GM Max MP adjustment
Final Max MP
Current MP
```

GM instance adjustment does not change the Monster Template or future spawned Monsters unless GM explicitly edits Template data.

---

# 6. Monster Attack Profile Management

Simplified Monsters use the Canonical simplified Player-style Monster attack model defined in `MONSTER_ATTACK_PROFILE_ALPHA.md`.

The Monster Management tab must provide a dedicated **Attack Profiles** section for each Monster Template.

A Template may contain multiple ordinary Attack Profiles, for example:

```text
Goblin Short Sword
Goblin Short Bow
```

GM must be able to:

```text
add an Attack Profile
edit an Attack Profile
remove / retire an Attack Profile
reorder attacks
edit D100 hit-source / basis fields once the physical Attack Mapping is locked
edit hit modifier separately from damage
edit Damage Profile / damage dice
edit fixed damage modifier
set whether Effective STR + Effective SIZ Damage Bonus applies
edit range / reach / targeting fields where relevant
link exceptional actions to the Ability system instead of forcing them into an ordinary Attack Profile
```

Monster Attack Profiles use the same core D100 → successful hit → Damage Profile → Defence → Damage Result resolver as Player ordinary attacks, but do not require the full Player Skill-tree, learning, weapon-practice, or specialization-growth administration merely to execute an ordinary Monster attack.

Template and instance editing remain separate:

```text
Edit Template Attack Profile
→ changes reusable definition / future use

Edit Spawned Instance Attack Override
→ changes only that Monster
```

The system should keep Template attack values and instance overrides distinguishable for audit/debugging.

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
