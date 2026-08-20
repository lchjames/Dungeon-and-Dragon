# GM Monster Management — Alpha

> Status: Canonical Alpha Working Rule  
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

For Simplified Monster Templates, the required Attribute ranges are:

```text
STR min / max
DEX min / max
CON min / max
POW min / max
INT min / max
SIZ min / max
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

Editing a Template affects the reusable definition/future spawns; it does not silently rewrite already spawned instances.

---

# 3. Spawn Workflow

From Monster Management, GM must be able to request one or multiple instances from a selected Template.

If GM requests N Monsters, the server runs the full spawn pipeline N separate times.

For every instance:

```text
1. Roll six natural/base Attributes from the Template ranges
2. Roll that instance's 10% Elite check
3. If Elite, roll one +1 to +5 Elite Bonus and apply it to all six Attributes
4. Apply Monster Level Scaling
5. Recalculate derived values
6. Save the generated instance
7. Permit GM final adjustment
```

A group spawn never clones one generated result across the group.

---

# 4. Instance Inspection

GM should be able to inspect, for each generated Monster Instance:

```text
Template source
Monster Level
Natural/base rolled STR / DEX / CON / POW / INT / SIZ
Elite result
Elite Attribute Bonus
Post-Elite base state
Level-adjusted values
Derived values
GM adjustments
Final current state
```

The UI should make automatic generation and later GM adjustment distinguishable.

---

# 5. GM Final Adjustment

GM may adjust a generated Monster Instance after automatic generation and Level Scaling.

This adjustment applies only to that individual instance unless GM explicitly edits the Template.

The system should preserve enough audit data to distinguish:

```text
Generated value
Level-adjusted value
GM adjustment
Final value
```

---

# 6. Level Principle

Monster Level does not change the Template's natural Attribute ranges before rolling.

Example:

```text
Goblin Lv1
Goblin Lv100
```

both begin by rolling from the same Goblin Template ranges.

Only after the natural/base state and any Elite bonus are known does the Monster Level Scaling layer transform the Monster into its level-appropriate final state.

The exact Level Scaling formula is defined separately in `MONSTER_NPC_SYSTEM_ALPHA.md` once locked.
