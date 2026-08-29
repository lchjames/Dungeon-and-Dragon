# Runtime Encounter Spawn + Same-Map Combat — Alpha

> Status: **Implemented Alpha Runtime Contract**  
> Date: 2026-08-29  
> Parent: `docs/RUNTIME_ENCOUNTER_STATE_ALPHA.md`

## Purpose

This slice is the Runtime-native replacement for the legacy Definition-level Encounter play path.

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

## Shared server-internal authority

The gameplay resolver lives in:

```text
src/runtime-encounter-service.js
```

Both the GM HTTP routes and Story Event resolvers call this service directly.

This is a deliberate authority boundary:

```text
GM HTTP → auth / input parsing → shared service
Story Event → validated Runtime context → shared service
```

A Player-triggered Story Event never fabricates a GM browser request, never forwards a Player Cookie to a GM route, and never maintains a second Monster/Combat implementation.

## GM routes

```text
POST /api/gm/world/runtime/maps/:mapId/encounters/:encounterId/monsters
POST /api/gm/world/runtime/maps/:mapId/encounters/:encounterId/start-combat
```

Both routes are GM-authoritative, same-origin protected, scoped by Runtime Map + Runtime Encounter, and delegate their gameplay writes to the shared service.

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
Spawn Cell exists + walkable
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

Combat start uses the Runtime Encounter participant roster, not the reusable Encounter Definition roster.

Before Combat starts, every Runtime participant must already have a position on the selected Runtime Map.

```text
Character participant not positioned → reject
Monster participant not positioned → reject
wrong Runtime Map → reject
inactive Runtime Encounter → reject
unrelated active global Combat → reject
```

The shared Runtime resolver loads authoritative Character DEX/owner state and Monster effective DEX/status, builds one combined initiative list, then creates the Combat, Combatants and `runtime_encounter_combats` link in one D1 batch.

It does **not** create a temporary Character-only Combat and does not rebuild through a privileged GM HTTP call.

If the Runtime Encounter already has a valid Combat link, the resolver returns that Combat idempotently rather than creating another Combat.

The link stores the exact Runtime Map ID, so Combat continues to use the same exploration positions.

## GM GUI

The World Map workspace includes:

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

The panel displays the per-Run participant roster, whether each participant is positioned, and any linked Runtime Combat.

## Story Event integration

The approved Story vocabulary now includes Runtime-native Monster spawn and Combat start. The detailed contract is documented in:

```text
docs/STORY_RUNTIME_SPAWN_COMBAT_EFFECTS_ALPHA.md
```

Canonical automatic flow:

```text
Player Move enters hidden trigger Zone
→ activate_encounter
→ spawn_monster
→ Monster appears at the stable Runtime Spawn Point
→ start_combat
→ Combat begins on the same Runtime Map
```

## Explicit non-fallback rule

This Runtime path must never silently fall back to the legacy Definition path.

Forbidden Runtime writes:

```text
INSERT INTO encounter_participants
INSERT INTO encounter_combats
UPDATE encounters SET status = ...
```

Legacy `/api/gm/encounters/:id/start-combat` remains compatibility infrastructure only until migration is complete.

## Current Boss boundary

Runtime Boss participants are intentionally rejected by Runtime Combat start with:

```text
RUNTIME_BOSS_COMBAT_NOT_READY
```

This is deliberate. A Boss must receive the same fresh per-Run spawn + position authority before Runtime Combat is allowed; falling back to a Definition Boss Instance would violate replay isolation.

## Next Canonical slice after Story automation

```text
Runtime-native Boss spawn
→ same participant/position authority
→ Encounter resolution
→ encounter_resolved propagation
→ continue Scene after Combat
```
