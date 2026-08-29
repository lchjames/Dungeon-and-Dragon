# Story Runtime Boss Effect — Alpha Canonical

Status: **Implemented Alpha Runtime Contract**  
Date: 2026-08-29

## Purpose

`spawn_boss` is an approved structured Story Event effect that creates a fresh **Runtime Boss Instance** inside a specific per-Scene-Run Runtime Encounter and places it on a stable Runtime Spawn Point.

It is not arbitrary scripting. Story definitions never execute JavaScript or SQL.

## Approved effect shape

```json
{
  "type": "spawn_boss",
  "encounterId": "encounter_...",
  "profileId": "boss_profile_...",
  "sourceSpawnPointId": "spawn_...",
  "displayName": "Optional Runtime name"
}
```

Required stable authoring references:

- `encounterId` — Encounter Definition ID whose per-Scene-Run Runtime Encounter must already exist.
- `profileId` — active Boss Design Profile ID.
- `sourceSpawnPointId` — stable Map Template Spawn Point ID snapshotted into the active Runtime Map.

`displayName` is optional and only changes the Runtime display name.

## Boss Profile authority

Story **cannot** supply or override Boss Level, attributes, HP/MP, defence, armor, skills or phases.

Those values are snapshotted from the selected active Boss Design Profile by the same shared Runtime Boss spawn service used by GM Runtime controls.

Therefore this is invalid as an authority model even if extra JSON fields are supplied:

```json
{
  "type": "spawn_boss",
  "profileId": "boss_profile_...",
  "level": 99
}
```

The approved normalizer discards unsupported Boss override fields. Runtime Boss Level remains the Profile Level.

## Runtime prerequisites

The server validates all of the following:

1. Runtime Map exists and is active.
2. Runtime Map belongs to the expected Scene Run / Scene.
3. target Runtime Encounter exists and is `active`.
4. target Runtime Encounter has no linked Combat yet for a fresh spawn.
5. stable Spawn Point exists in the Runtime Map and is enabled.
6. Spawn Point type is `boss` or `any`.
7. Spawn Point cell exists and is walkable.
8. Spawn Point cell is not occupied.
9. Boss Design Profile exists and is active.
10. linked Boss skills/phases are valid for snapshotting.

A successful fresh Story spawn writes only Runtime instance state. It never adds the Boss Instance to the reusable Encounter Definition roster.

## Once-per-Scene-Run replay safety

For `oncePerSceneRun: true` Story Events, `spawn_boss` receives the stable pair:

- `storyEventId`
- `effectIndex`

Together with `sceneRunId`, these form the provenance key:

```text
(scene_run_id, story_event_id, effect_index)
```

The additive table is:

```text
runtime_story_boss_spawn_effects
```

It records:

- Scene Run
- Story Event
- stable effect index
- Runtime Map
- Runtime Encounter
- Boss Instance
- Boss Profile
- stable Spawn Point
- creation timestamp

### Atomic commit boundary

For a fresh Story Boss spawn, the following commit in the **same D1 batch**:

1. `boss_instances`
2. `runtime_encounter_participants`
3. `runtime_entity_positions`
4. Boss skill snapshots
5. Boss phase snapshots
6. `runtime_story_boss_spawn_effects`

There is no supported state where the Story-created Boss commits successfully but its provenance is intentionally written afterwards.

## Retry semantics

Consider this once-per-Scene-Run event:

```text
activate_encounter
→ spawn_boss
→ start_combat
```

If `activate_encounter` and `spawn_boss` succeed but `start_combat` fails, the Story execution is recorded as failed while the already-committed Runtime effects remain authoritative.

On retry of the **same Story Event in the same Scene Run**:

1. the existing Runtime Encounter activation may be treated as the same-event activation retry;
2. `spawn_boss` looks up its provenance before fresh-spawn state checks;
3. the exact same Boss Instance and Runtime position are returned;
4. `unchanged: true` / replay semantics are reported;
5. no second Boss Instance is created;
6. later Story effects continue from that point.

This protects against partial Story failure and concurrent duplicate execution.

If provenance exists but the referenced Boss Instance/profile/position is missing or inconsistent, the server fails closed with a provenance integrity error rather than silently spawning a replacement Boss.

## Non-once Story Events

When `oncePerSceneRun` is false, no stable Story provenance key is supplied to the shared Boss spawn service.

That is deliberate: a repeatable Story Event may create another fresh Boss when its other Runtime prerequisites allow it. Authors who require exactly-once Boss creation must use `oncePerSceneRun: true`.

## Supported Story executors

`spawn_boss` is approved in all currently concrete Runtime Story execution paths:

- manual GM Story Event execution;
- automatic `enter_zone` execution after committed Player movement;
- automatic `encounter_resolved` continuation.

All three call the same server-internal Runtime Boss service directly. Automatic Player-triggered Story execution does **not** impersonate a GM browser or call a GM HTTP spawn endpoint.

## Combat integration

A typical Boss encounter sequence is:

```text
activate_encounter
→ spawn_boss
→ start_combat
```

`start_combat` uses the per-Scene-Run Runtime participant roster and existing positions on the same Runtime Map. Boss initiative uses the snapshotted Boss DEX.

The Runtime Combat link is written to `runtime_encounter_combats`, not legacy Definition-level `encounter_combats`.

## Definition / Runtime isolation

Story `spawn_boss` must never perform these writes:

```text
INSERT INTO encounter_participants ...
INSERT INTO encounter_combats ...
UPDATE encounters SET status = ...
```

The reusable Encounter Definition remains reusable across Scene Runs.

Runtime authority remains:

```text
Runtime Encounter state
+ Runtime participant roster
+ Runtime entity positions
+ Runtime Combat link
+ Runtime Story Boss provenance
```

## Production verification target

The operator-only production Alpha runner proves the replay boundary by intentionally starting a Scene Run with the Character absent from the Runtime Map:

```text
activate_encounter ✅
spawn_boss ✅
start_combat ❌ RUNTIME_ENCOUNTER_POSITION_REQUIRED
```

It then positions the Character and retries the same Story Event:

```text
activate_encounter → unchanged
spawn_boss → same Boss ID, unchanged replay
start_combat → success
```

Required assertions include:

- exactly one Runtime Boss participant after retry;
- same Boss Instance ID before and after retry;
- Boss remains positioned on the stable Boss Spawn Point;
- Combat contains that same Boss and the Character;
- Encounter Definition status remains unchanged;
- Encounter Definition participant roster remains Character-only;
- legacy Definition Combat link remains empty.
