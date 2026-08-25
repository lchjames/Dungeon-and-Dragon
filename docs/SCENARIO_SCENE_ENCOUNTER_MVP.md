# Scenario / Scene / Encounter Foundation — MVP

> Status: Canonical MVP Implementation Contract  
> Date: 2026-08-24  
> Scope: Minimum narrative/context layer required before Monster Runtime is integrated into the first end-to-end scenario.  
> **2026-08-26 integration note:** `WORLD_MAP_STORY_RUNTIME_ALPHA.md` supersedes the older metadata-only / fully-Deferred Map boundary in this file. Existing Scene Map metadata remains a compatibility field until the structured World/Map runtime replaces it.

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

The active Alpha now extends this relationship with the World/Map runtime defined in `WORLD_MAP_STORY_RUNTIME_ALPHA.md`:

```text
Scenario Definition
→ Scenario Run
→ Scene Definition
→ Scene Run
→ reusable Location / Map Template reference
→ Runtime Map Instance
→ Encounter
→ optional Combat on the same Map Instance
```

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

A Scenario is a persistent adventure-level definition/container inside the current Campaign.

Stored MVP fields:

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

The existing Scenario record is definition/context data. Runtime playthrough state is being separated into Scenario / Scene Run instances by `WORLD_MAP_STORY_RUNTIME_ALPHA.md` so repeated groups/runs do not overwrite one another.

The current Alpha does not require automatic narrative generation, Word import or free-form story compilation.

---

# 4. Scene

A Scene belongs to exactly one Scenario definition.

Stored MVP fields currently include:

```text
Scene ID
Scenario ID
Name
Description
GM Notes
Sort Order
Status
legacy Map Name
legacy Map Asset Reference
legacy Map GM Notes
created / updated timestamps
```

MVP status vocabulary:

```text
locked
active
completed
```

Scene status is GM-controlled in this slice. The system does not yet force a strictly linear progression graph.

## 4.1 Structured Map boundary — superseded Alpha direction

The original Foundation implemented only Scene Map metadata:

```text
Map Name
Asset Reference
GM Notes
```

Those fields remain readable for compatibility, but they are no longer the target Map model.

The active Alpha Map direction is defined by `WORLD_MAP_STORY_RUNTIME_ALPHA.md`:

```text
reusable World Location / Map Template
→ Scene-specific Map Configuration
→ Runtime Map Instance
→ entity positions / runtime state
```

The following are therefore **promoted into the current Alpha integration path**:

```text
structured grid dimensions
walkable / blocked cells
walls / blocking doors
runtime Map Instance
Character / Monster / Boss positions
9-grid / eight-direction adjacency
one-cell Alpha Move
no diagonal wall-corner cutting
Player-token visibility with GM overrides
zones / spawn points required for Story/Encounter integration
```

Advanced VTT features remain Deferred, including:

```text
advanced line of sight / lighting
fog-of-war simulation
cover percentages
AoE drawing tools
large-creature footprints
terrain movement multipliers
forced-movement edge cases
```

Canonical adjacency is:

```text
eight surrounding cells are adjacent
including diagonals
adjacent distance = 1
```

The current Alpha movement rule is now explicitly:

```text
1 ordinary Move
→ at most 1 legal adjacent cell
```

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

The World/Map runtime may additionally bind an Encounter to structured spatial context such as:

```text
trigger Zone
spawn points
runtime Map Instance
Story Event activation
```

---

# 6. Encounter Participants

The persistent participant relationship is generic from the beginning:

```text
character
monster_instance
boss_instance
```

The Foundation originally enabled active Player Character assignment first; later Monster and Boss runtime slices have since implemented those entity types.

The server validates runtime entities rather than trusting browser-supplied display information.

Where positioned on a Runtime Map Instance, participants use the shared spatial position model defined by `WORLD_MAP_STORY_RUNTIME_ALPHA.md`.

---

# 7. Encounter → Combat

MVP relationship:

```text
Encounter
→ zero or one linked Combat
```

An Encounter may resolve without Combat. If the GM starts Combat from an Encounter:

```text
Encounter runtime participants
→ existing Combat Start resolver
→ DEX Initiative / Turn state
→ Combat linked back to Encounter
→ Encounter status = active
```

The existing Combat engine remains authoritative. Scenario code must not create a second Round / Turn model.

The World/Map integration adds one important invariant:

```text
Exploration position
→ Start Combat
→ same Runtime Map Instance
→ same x/y
```

Combat does not automatically teleport or re-layout participants. Ending Combat also does not automatically discard Map positions.

For this MVP, one Encounter may link to at most one Combat. Multi-wave encounters requiring several separate Combats remain a later extension.

Ending Combat does not automatically mark the Encounter `resolved`; the GM records resolution explicitly so non-combat objectives and narrative consequences can be completed first.

---

# 8. GM Authority

Scenario / Scene / Encounter authoring and participant assignment are GM / admin writes.

Normal Players do not author or arbitrarily mutate narrative structure in this slice.

All persistent state is stored in D1. Browser localStorage is not authoritative Scenario storage.

The GM also owns World/Map authoring and runtime visibility overrides. Normal Players may move only their authorised Character through server-side movement resolvers.

The MVP intentionally provides status updates rather than destructive hard-delete flows, avoiding premature deletion / archive semantics for linked story data.

---

# 9. Revised Playable Scenario Target

The earlier representative vertical slice proved that Scenario → Encounter → Combat relationships could connect. The current Alpha target is now a genuinely spatial Story loop:

```text
Create / select Scenario Definition
→ start Scenario Run
→ activate Scene Run
→ bind reusable Location / Map Template
→ create Runtime Map Instance
→ place Character(s)
→ Player sees Current Location + Map
→ Player uses 9-grid movement
→ entering / interacting with structured Map context can fire Story Event
→ Story Event activates Encounter / approved effects
→ Monster / Boss uses Spawn Point / Map position
→ Start Combat on the same Map Instance
→ Combat Move uses the same position model
→ complete Combat
→ resolve Encounter
→ continue Scene with positions / runtime state preserved
```

This is the next real playable E2E target.

---

# 10. Deferred Systems

The following remain outside the immediate World/Map/Story runtime slice unless they become a genuine blocker:

```text
AI Story Generator
Word / Google Docs story importer
Adventure Script Template implementation
free-form narrative compiler
Quest automation
advanced story branching graph editor
loot / rewards automation
economy
Encounter difficulty calculator
multi-Combat Encounter waves
Player-authored Scenario structure
advanced VTT lighting / line-of-sight / cover / AoE
```

The future Story Import / Generator direction should first define an Adventure Script Template so imported/generated material can be translated into structured Scenario / Scene / Map / Event / Encounter drafts more reliably.
