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
Ability/profile links when later implemented
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
8. Recalculate derived combat/resource values from Effective Attributes
9. Save the generated instance
10. Permit GM final adjustment
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
Derived values
GM adjustments
Final current state
```

The UI should visually distinguish:

```text
Natural
→ generated identity after Elite processing

Effective
→ current Level-scaled Attribute used by live rules

GM Adjustment
→ later authorised manual change
```

---

# 5. Level Principle

Monster Level never changes Template Attribute ranges before rolling and never rerolls Natural Attributes.

Example:

```text
Goblin Lv1
Goblin Lv100
```

both begin from the same Goblin Template ranges.

At Level 1:

```text
Effective = Natural
```

At higher Levels, Effective Attributes are recalculated from preserved Natural Attributes and Template Growth Weights.

A standard Weight `1.0` uses the same Level growth shape as Player HP/MP and reaches about `21.81×` Natural at Level 100.

---

# 6. GM Final Adjustment

GM may adjust a generated Monster Instance after automatic generation, Level scaling and derived-stat calculation.

This adjustment applies only to that individual instance unless GM explicitly edits the Template.

The system must preserve enough audit data to distinguish:

```text
Base roll
Elite Bonus
Natural Attribute
Calculated Effective Attribute
GM adjustment
Final value
```

GM editing must not erase Natural Attribute history.

---

# 7. Template vs Instance Editing

```text
Edit Template
→ changes reusable ranges / Growth Weights / future Template behaviour

Edit Spawned Instance
→ changes only that individual Monster
```

Where persistent instances are recalculated after a deliberate Template Growth Weight change, the operation must be explicit/auditable rather than silently mutating historical values.
