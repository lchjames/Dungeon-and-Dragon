# Runtime Encounter Spawn + Same-Map Combat — Alpha

> Status: **Implemented Alpha Runtime Contract**  
> Date: 2026-08-29  
> Parent: `docs/RUNTIME_ENCOUNTER_STATE_ALPHA.md`

## Purpose

This slice is the first Runtime-native replacement for the legacy Definition-level Encounter play path.

Canonical flow:

```text
Active Runtime Encounter
→ fresh Monster Instance
→ runtime_encounter_participants
→ Runtime Spawn Point
→ runtime_entity_positions
→ Runtime Encounter Combat start
→ runtime_encounter_combats
→ Combat reuses the same Runtime Map positions
```

The reusable Encounter Definition remains authoring data. Runtime spawning and Combat linking do not write `encounter_participants`, `encounter_combats`, or `encounters.status`.

## GM routes

```text
POST /api/gm/world/runtime/maps/:mapId/encounters/:encounterId/monsters
POST /api/gm/world/runtime/maps/:mapId/encounters/:encounterId/start-combat
```

Both routes are GM-authoritative, same-origin protected, and scoped by Runtime Map + Runtime Encounter.

## Runtime Monster spawn

Input:

```json
{
  "templateId": "monster_template_...",
  "sourceSpawnPointId": "spawn_...",
  "level": 5,
  "displayName": "Optional name"
}
```

Server requirements:

```text
Runtime Map = active
Runtime Encounter exists in that Scene Run
Runtime Encounter = active
Runtime Encounter has no Combat link yet
Monster Template = active
Runtime Spawn Point exists + enabled
Spawn type = monster or any
Spawn Cell = walkable
Spawn Cell = unoccupied
```

On success, one D1 batch creates:

```text
fresh monster_instances row
fresh monster_instance_skills snapshots
runtime_encounter_participants row (source_kind = runtime_spawn)
runtime_entity_positions row on the same Runtime Map
```

The Monster attribute, Elite, HP/MP and skill snapshot rules reuse the existing authoritative Monster rule functions.

A runtime-spawned Monster is **not** inserted into legacy `encounter_participants`.

## Same-Map Combat start

Combat start uses `runtimeEncounters[].participants`, not the reusable Encounter Definition roster.

Before Combat starts, every Runtime participant must already have a position on the selected Runtime Map.

```text
Character participant not positioned → reject
Monster participant not positioned → reject
wrong Runtime Map → reject
inactive Runtime Encounter → reject
existing Runtime Combat link → reject
```

The existing Combat engine is reused to create the base Character Combat. The Runtime resolver then rebuilds initiative from the authoritative Runtime participant roster, including active Runtime Monster Instances, and links the Combat through `runtime_encounter_combats`.

The link stores the exact Runtime Map ID, so the Combat continues to use the same exploration positions.

Failure during the rebuild/link stage attempts to end the newly-created Combat rather than leaving an unlinked active Combat behind.

## GM GUI

The World Map workspace now includes:

```text
Encounter Spawn & Combat
```

GM can select:

```text
Active Runtime Map
Runtime Encounter
Monster Template
Monster Spawn Point
Monster Level
optional Display Name
```

Actions:

```text
Spawn Monster
Start Combat on This Map
```

The panel also displays the per-Run participant roster, whether each participant is positioned, and any linked Runtime Combat.

## Explicit non-fallback rule

This Runtime route must never silently fall back to the legacy Definition path.

Forbidden Runtime writes:

```text
INSERT INTO encounter_participants
INSERT INTO encounter_combats
UPDATE encounters SET status = ...
```

Legacy `/api/gm/encounters/:id/start-combat` remains available only as compatibility infrastructure until migration is complete.

## Current Boss boundary

Runtime Boss participants are intentionally rejected by this Combat-start slice with:

```text
RUNTIME_BOSS_COMBAT_NOT_READY
```

This is deliberate. A Boss must receive the same fresh per-Run spawn + position authority before Runtime Combat is allowed; falling back to a Definition Boss Instance would violate replay isolation.

## Next Canonical slice

```text
Story Event activate_encounter
→ Story Effect spawn_monster
→ Runtime Spawn Point placement
→ Story Effect start_combat
→ same Runtime Map Combat
```

Then migrate Boss spawn through the same Runtime-native path and add Encounter resolution / `encounter_resolved` propagation.
