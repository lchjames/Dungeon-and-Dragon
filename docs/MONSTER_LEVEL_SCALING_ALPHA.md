# Monster Level Scaling — Alpha

> Status: Canonical Alpha Working Rule
> Date: 2026-08-21
> Scope: Defines the architecture for converting Monster Natural Attributes into Effective Attributes after per-instance generation and Elite adjustment. Exact numeric curve/formula is decided incrementally.
> Use together with `MONSTER_NPC_SYSTEM_ALPHA.md` and `GM_MONSTER_MANAGEMENT_ALPHA.md`.

---

# 1. Locked Scaling Architecture

Monster Level scaling uses:

```text
Global Monster Level Curve
×
Monster Template Attribute Growth Weight
```

All Simplified Monsters share one global Level-growth curve, but each Monster Template stores a separate growth weight for each of its six core Attributes:

```text
STR Growth Weight
DEX Growth Weight
CON Growth Weight
POW Growth Weight
INT Growth Weight
SIZ Growth Weight
```

The purpose is to preserve species/template identity at high Level instead of making every Monster scale into the same six-sided stat profile.

Example direction only:

```text
Goblin
STR Weight  = lower
DEX Weight  = higher
CON Weight  = medium
POW Weight  = lower
INT Weight  = lower
SIZ Weight  = very low

Ogre
STR Weight  = higher
DEX Weight  = lower
CON Weight  = higher
POW Weight  = lower
INT Weight  = lower
SIZ Weight  = higher
```

Exact default numeric weights are not yet locked.

---

# 2. Relationship to Natural / Effective Attributes

Generation order remains:

```text
Template Range
→ Base Attribute Roll
→ Elite check
→ Elite Bonus, if any
→ Natural Attributes
→ Global Level Curve + Template Growth Weights
→ Effective Attributes
→ Derived Stats
→ GM Final Adjustment
```

The Level system must never reroll or overwrite the stored Natural Attributes.

For every Attribute, the final Effective value must be derived from:

```text
that instance's Natural Attribute
+
Monster Level
+
that Template's Growth Weight for that Attribute
```

The exact mathematical combination is still TBD.

---

# 3. Level 1 Invariant

A Level 1 Monster must not be artificially changed merely because its Template has non-neutral Growth Weights.

Canonical requirement:

```text
At Level 1:
Effective Attribute = Natural Attribute
```

for all six Simplified Monster Attributes, before any explicit later GM final adjustment.

Therefore the final formula must apply Growth Weight to the **Level-derived growth component**, not use a formula that causes the Template weight alone to increase/decrease Level 1 Attributes.

This preserves the previously locked principle that a Level 1 and Level 100 Goblin begin from the same natural Goblin generation system.

---

# 4. Template-Level Configuration

The Monster Template must store six independent Growth Weights:

```text
STR
DEX
CON
POW
INT
SIZ
```

These are Template configuration values, not per-spawn random rolls.

Two spawned Monsters from the same Template may have different Natural Attributes because of random generation, but they normally share the same Attribute Growth Weights because those weights describe the species/template's Level-scaling tendency.

If GM edits a Template Growth Weight, that changes the Template configuration used for future calculation/spawns. Existing persisted Monster Instances must not silently lose their historical Natural values or prior audit data.

How already-spawned persistent instances react to later Template weight changes will be explicitly handled by implementation/audit rules; the system must not silently mutate historical generation data.

---

# 5. GM Monster Management Requirement

The GM Monster Management tab must expose the six Template Growth Weights alongside the six Attribute min/max ranges.

GM must be able to maintain, at Template level:

```text
STR min / max + STR Growth Weight
DEX min / max + DEX Growth Weight
CON min / max + CON Growth Weight
POW min / max + POW Growth Weight
INT min / max + INT Growth Weight
SIZ min / max + SIZ Growth Weight
```

For a spawned instance, the GM inspection view should be able to show the calculation chain:

```text
Natural Attribute
Monster Level
Template Growth Weight
Global Level Curve output
Effective Attribute
GM final adjustment
```

so the final value is explainable rather than appearing as an opaque generated number.

---

# 6. Still To Be Decided

The next decision is the exact **Global Monster Level Curve / Natural-to-Effective formula**.

The final formula must satisfy at least:

1. `Level 1 Effective = Natural` before GM adjustment.
2. Level increase never rerolls Natural Attributes.
3. Template Growth Weight affects only the Level-growth behaviour.
4. The same global Level curve is used by all Simplified Monster Templates.
5. Each Attribute can scale differently through its Template Growth Weight.
6. The calculation is deterministic and auditable.
7. GM can still perform a final authorised instance adjustment after automatic calculation.
