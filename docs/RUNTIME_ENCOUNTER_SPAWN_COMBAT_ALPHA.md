# Runtime Encounter Spawn + Same-Map Combat — Alpha

> Status: **Implemented Alpha Runtime Contract**  
> Date: 2026-08-29  
> Parent: `docs/RUNTIME_ENCOUNTER_STATE_ALPHA.md`

## Purpose

This slice is the Runtime-native replacement for the legacy Definition-level Encounter play path.

Canonical hostile flow:

```text
Active Runtime Encounter
→ fresh Monster Instance and/or fresh Boss Instance
→ runtime_encounter_participants
→ typed Runtime Spawn Point
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

Both GM HTTP routes and Story Event Combat resolvers use this server-internal authority.

```text
GM HTTP → auth / input parsing → shared Runtime service
Story Event → validated Runtime context → shared Runtime service
```

A Player-triggered Story Event never fabricates a GM browser request, never forwards a Player Cookie to a GM route, and never maintains a second Combat implementation.

## GM routes

```text
POST /api/gm/world/runtime/maps/:mapId/encounters/:encounterId/monsters
POST /api/gm/world/runtime/maps/:mapId/encounters/:encounterId/bosses
POST /api/gm/world/runtime/maps/:mapId/encounters/:encounterId/start-combat
```

All routes are GM-authoritative, same-origin protected, scoped by Runtime Map + Runtime Encounter, and delegate gameplay writes to the shared service.

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

One D1 batch creates:

```text
fresh monster_instances row
fresh monster_instance_skills snapshots
runtime_encounter_participants row (monster_instance, source_kind = runtime_spawn)
runtime_entity_positions row on the same Runtime Map
```

The Monster attribute, Elite, HP/MP and skill snapshot rules reuse the authoritative Monster rule functions.

## Runtime Boss spawn

Input:

```json
{
  "profileId": "boss_...",
  "sourceSpawnPointId": "spawn_...",
  "displayName": "Optional name"
}
```

Boss Level is intentionally **not** a Runtime input. The active Boss Design Profile is the authoring authority for Level and the complete Boss build.

Server requirements:

```text
Runtime Map = active
Runtime Encounter exists in that Scene Run
Runtime Encounter = active
Runtime Encounter has no Combat link yet
Boss Design Profile = active
all linked Boss Skills exist + active
Runtime Spawn Point exists + enabled
Spawn type = boss or any
Spawn Cell exists + walkable
Spawn Cell = unoccupied
```

One D1 batch snapshots the current Profile into:

```text
fresh boss_instances row
fresh boss_instance_skills snapshots
fresh boss_instance_phases snapshots
runtime_encounter_participants row (boss_instance, source_kind = runtime_spawn)
runtime_entity_positions row on the same Runtime Map
```

The Boss snapshot freezes:

```text
Profile source/update reference
Level
final STR / DEX / CON / POW / INT / SIZ
Max HP / MP and current values
stored defence
armor name / defence / notes
Skill calculations
Phase definitions
initial Phase
```

A Runtime-created Boss is **not** inserted into Definition `encounter_participants`.

## Same-Map Combat start

Combat start uses the Runtime Encounter participant roster, not the reusable Encounter Definition roster.

Supported Runtime combatant types:

```text
character
monster_instance
boss_instance
```

Before Combat starts, every Runtime participant must already have a position on the selected Runtime Map.

```text
Character participant not positioned → reject
Monster participant not positioned → reject
Boss participant not positioned → reject
wrong Runtime Map → reject
inactive Runtime Encounter → reject
unrelated active global Combat → reject
```

Initiative authority:

```text
Character → authoritative Character DEX
Monster → Monster Instance effective DEX
Boss → Boss Instance final DEX snapshot
```

All participants enter the same existing DEX-based initiative ordering. The shared Runtime resolver creates the Combat, Combatants and `runtime_encounter_combats` link in one D1 batch.

It does **not** create a temporary Character-only Combat, does not call a privileged GM Combat HTTP route internally, and does not use legacy Encounter Combat authority.

If the Runtime Encounter already has a valid Combat link, the resolver returns that Combat idempotently rather than creating another Combat.

The link stores the exact Runtime Map ID, so Combat continues to use the same exploration positions.

## GM GUI

The World Map workspace includes:

```text
Encounter Spawn & Combat
```

GM can select and run:

```text
Monster Template + Level + Monster/any Spawn Point → Spawn Monster
Boss Design Profile + Boss/any Spawn Point → Spawn Boss
Runtime Encounter → Start Combat on This Map
```

The panel displays the per-Run participant roster, whether each Character / Monster / Boss is positioned, and any linked Runtime Combat.

## Story Event integration

Approved Story effects currently include:

```text
activate_encounter
spawn_monster
start_combat
```

The detailed Monster automation contract is documented in:

```text
docs/STORY_RUNTIME_SPAWN_COMBAT_EFFECTS_ALPHA.md
```

Because `start_combat` delegates to the shared Runtime service, it now accepts an already-materialised Runtime Boss participant as well as Characters and Monsters.

`spawn_boss` is **not yet** an approved Story effect. Boss spawning is currently a GM Runtime action. This is intentional: Story Boss spawn should receive its own per-Run effect provenance/idempotency contract rather than silently reusing Monster provenance.

## Explicit non-fallback rule

Runtime play must never silently fall back to the legacy Definition path.

Forbidden Runtime writes:

```text
INSERT INTO encounter_participants
INSERT INTO encounter_combats
UPDATE encounters SET status = ...
```

Legacy Boss/Encounter spawn and `/api/gm/encounters/:id/start-combat` remain compatibility infrastructure only until migration is complete.

## Replay boundary

Reusable definitions:

```text
Encounter Definition
Monster Template
Boss Design Profile
Map Template + Spawn Points
```

Per-run materialisation:

```text
runtime_encounter_states
runtime_encounter_participants
Monster / Boss Instances created for that playthrough
runtime_entity_positions
runtime_encounter_combats
```

Changing a Boss Profile after a Boss has been materialised does not retroactively rewrite that existing Boss Instance snapshot.

## Next Canonical slice

```text
Runtime Encounter Combat ends
→ determine Encounter resolution
→ Runtime Encounter active → resolved
→ encounter_resolved Story trigger
→ continuation effects / next Scene state
```

A later Story-authoring slice may add `spawn_boss` with explicit per-Run provenance once the resolution loop is stable.
