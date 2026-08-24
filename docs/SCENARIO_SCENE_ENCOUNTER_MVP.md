# Scenario / Scene / Encounter Foundation — MVP

> Status: Canonical MVP Architecture Boundary  
> Date: 2026-08-24  
> Scope: Define the minimum narrative/context layer required before Monster Runtime is integrated into the first end-to-end scenario.

---

# 1. Why This Layer Exists

The Campaign Hub must not become only a Character + Combat simulator.

The minimum playable architecture must preserve the relationship:

```text
Campaign
→ Scenario
→ Scene
→ Encounter
→ Combat
```

Combat remains the runtime battle state. Scenario / Scene / Encounter provide the narrative and encounter context around that battle.

---

# 2. MVP Ordering

This foundation is required **before Monster Runtime is connected into the first complete scenario flow**, but it does not block the current Player Combat Control or core D100 / Damage implementation slices.

Updated MVP order:

```text
Player Combat Control
→ D100 / Damage / HP 0
→ Scenario / Scene / Encounter Foundation
→ Monster Runtime
→ Boss Runtime
→ First End-to-End Scenario Test
```

---

# 3. Scenario MVP

A Scenario is a reusable / persistent adventure-level container.

Minimum design-time fields:

```text
Scenario ID
Name
Summary
GM Notes
Status
Scene Order
created / updated timestamps
```

Advanced branching story graphs, automatic narrative generation, rewards, quest chains and campaign publishing are not required for the first MVP.

---

# 4. Scene MVP

A Scene belongs to one Scenario.

Minimum fields:

```text
Scene ID
Scenario ID
Name
Description
GM Notes
Order
Status
Optional Map reference
```

Suggested Alpha status vocabulary may remain implementation-level until the Scene slice is coded, but the model must support at least active/current vs completed/locked-style progression without forcing every Scenario to be linear forever.

---

# 5. Encounter MVP

An Encounter belongs to a Scene and is the bridge between narrative context and runtime entities.

Minimum fields:

```text
Encounter ID
Scene ID
Name
Status
Trigger / start notes
GM Notes
Resolution notes
```

Encounter participation may include:

```text
Player Characters
Monster Instances
Boss Instances
```

Combat should be startable from an Encounter once the corresponding runtime entity systems exist.

---

# 6. Combat Relationship

The intended relationship is:

```text
Encounter
→ optional Combat
```

Not every Encounter must produce Combat.

Examples:

```text
social encounter
exploration encounter
trap / puzzle encounter
combat encounter
```

The existing Combat State Engine remains authoritative for Round / Turn state. Scenario / Scene / Encounter must reference Combat rather than duplicating Combat runtime state.

---

# 7. Map Boundary

The MVP may attach a Map reference to a Scene, but **does not require a full tactical map engine**.

Initial Map support may remain as simple metadata / image reference such as:

```text
Map ID
Name
image / asset reference
GM Notes
```

The following remain Deferred until after the first end-to-end scenario test unless they become a real implementation blocker:

```text
token dragging
movement distance
grid dimensions
terrain cost
walls / doors
line of sight
fog of war
cover
AoE templates
large-creature footprints
collision
forced movement
```

Existing Canonical rule remains:

```text
eight surrounding cells are adjacent
including diagonals
adjacent distance = 1
```

Do not invent a permanent movement-per-turn grid count before the Map system is intentionally designed.

---

# 8. First Scenario Test Target

The first representative vertical slice should eventually support:

```text
Create Scenario
→ Create Scene
→ Create Encounter
→ associate Player Characters
→ spawn Monster Instance(s)
→ Start Combat
→ complete Combat
→ mark Encounter resolved
→ continue Scene
```

A simple Boss may then be added as the next validation layer.
