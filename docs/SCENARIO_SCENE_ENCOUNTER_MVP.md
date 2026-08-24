# Scenario / Scene / Encounter Foundation — MVP

> Status: Canonical MVP Implementation Contract  
> Date: 2026-08-24  
> Scope: Minimum narrative/context layer required before Monster Runtime is integrated into the first end-to-end scenario.

---

# 1. Core Relationship

The Campaign Hub must not become only a Character + Combat simulator.

The MVP relationship is:

```text
Campaign
→ Scenario
→ Scene
→ Encounter
→ optional Combat
```

Combat remains the authoritative Round / Turn runtime. Scenario / Scene / Encounter provide story and encounter context around that runtime rather than duplicating it.

---

# 2. Campaign Boundary

The current product remains a **single-campaign MVP**.

Canonical implementation:

```text
Campaign name
= settings.campaign_name
```

The MVP does **not** create multi-campaign CRUD or a `campaigns` table merely to represent the one existing campaign.

If multi-campaign support is required later, Scenario ownership can be migrated to a dedicated Campaign entity without changing the Scenario → Scene → Encounter relationship.

---

# 3. Scenario

A Scenario is a persistent adventure-level container inside the current Campaign.

Stored fields:

```text
Scenario ID
Name
Summary
GM Notes
Status
Sort Order
created / updated timestamps
created-by GM User
```

MVP status vocabulary:

```text
active
completed
archived
```

The MVP does not implement branching story graphs, automatic narrative generation, rewards, quest chains or publishing.

---

# 4. Scene

A Scene belongs to exactly one Scenario.

Stored fields:

```text
Scene ID
Scenario ID
Name
Description
GM Notes
Sort Order
Status
Map Name
Map Asset Reference
Map GM Notes
created / updated timestamps
```

MVP status vocabulary:

```text
locked
active
completed
```

Scene status is GM-controlled in this slice. The system does not yet force a strictly linear progression graph.

## 4.1 Map boundary

Map support in this MVP is metadata only:

```text
Map Name
Asset Reference
GM Notes
```

The following remain Deferred:

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

Existing Canonical adjacency remains unchanged:

```text
eight surrounding cells are adjacent
including diagonals
adjacent distance = 1
```

Do not invent a permanent movement-per-turn grid count in this slice.

---

# 5. Encounter

An Encounter belongs to exactly one Scene and bridges narrative context to runtime participants.

Stored fields:

```text
Encounter ID
Scene ID
Name
Status
Sort Order
Trigger / Start Notes
GM Notes
Resolution Notes
created / updated timestamps
```

MVP status vocabulary:

```text
planned
active
resolved
skipped
```

Not every Encounter must create Combat. Social, exploration, puzzle and trap encounters can resolve without Combat.

---

# 6. Encounter Participants

The persistent participant relationship is generic from the beginning:

```text
character
monster_instance
boss_instance
```

However this Foundation slice only allows GM assignment of:

```text
active Player Characters
```

`monster_instance` and `boss_instance` are reserved for the following runtime slices and must not be faked before those entities exist.

Player Characters are associated with the Encounter before starting its Combat. The server validates Character existence and active status rather than trusting browser-supplied display information.

---

# 7. Encounter → Combat

MVP relationship:

```text
Encounter
→ zero or one linked Combat
```

An Encounter may resolve without Combat. If the GM starts Combat from an Encounter:

```text
Encounter Character participants
→ existing Combat Start resolver
→ DEX Initiative / Turn state
→ Combat linked back to Encounter
→ Encounter status = active
```

The existing Combat engine remains authoritative. Scenario code must not create a second Round / Turn model.

For this MVP, one Encounter may link to at most one Combat. Multi-wave encounters requiring several separate Combats are a future extension after the first end-to-end scenario test.

Ending Combat does not automatically mark the Encounter `resolved`; the GM records resolution explicitly so non-combat objectives and narrative consequences can be completed first.

---

# 8. GM Authority

Scenario / Scene / Encounter authoring and participant assignment are GM / admin writes.

Normal Players do not author or arbitrarily mutate narrative structure in this slice.

All persistent state is stored in D1. Browser localStorage is not authoritative Scenario storage.

The MVP intentionally provides status updates rather than destructive hard-delete flows, avoiding premature deletion / archive semantics for linked story data.

---

# 9. First Scenario Test Target

The first representative vertical slice should support:

```text
Create Scenario
→ Create Scene
→ Create Encounter
→ associate Player Characters
→ Start Encounter Combat
→ later spawn Monster Instance(s)
→ complete Combat
→ mark Encounter resolved
→ mark / continue Scene
```

A simple Boss may then be added as the next validation layer.

---

# 10. Deferred Systems

The following remain outside this Foundation slice unless they become a genuine blocker:

```text
full tactical Map engine
Quest engine
story branching graph executor
automatic Scene transitions
loot / rewards
economy
Encounter difficulty calculator
multi-Combat Encounter waves
Player-authored Scenario structure
```
