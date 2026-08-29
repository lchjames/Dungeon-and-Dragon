# Story `scene_run_start` Trigger — Alpha Canonical

Status: Implemented Alpha Runtime Contract

## Purpose

`scene_run_start` is the automatic Story Event trigger that runs after a Scene Run and its Runtime Map have been successfully created.

It exists for Scene-opening automation such as:

- showing opening narrative;
- setting initial Runtime Story flags;
- revealing Runtime Zones;
- changing Runtime Door state;
- activating a Runtime Encounter;
- spawning Runtime Monsters or Bosses;
- starting Runtime Combat when the Runtime Encounter roster and positions are valid.

It does not execute arbitrary JavaScript or SQL.

## Trigger shape

Canonical authoring shape:

```json
{
  "triggerType": "scene_run_start",
  "trigger": {}
}
```

`scene_run_start` has no target payload. `normalizeStoryTrigger('scene_run_start', ...)` canonicalizes the trigger payload to `{}` so unrelated authoring keys do not become runtime semantics.

## Committed-boundary rule

The Runtime authority commits first.

Canonical order:

```text
GM creates Scene Run
→ authoritative Scene Run / Runtime Map creation succeeds
→ Runtime Encounter snapshots exist
→ scene_run_start Story executor runs
→ each matching active Story Event is evaluated and audited
→ response includes sceneRunStartStoryEvents
```

A Story Event failure must never make an already-created Runtime appear to have failed creation.

If the lifecycle Story infrastructure itself throws after Runtime creation committed, the create response remains successful and includes:

```json
{
  "sceneRunStartStoryWarning": {
    "code": "STORY_SCENE_RUN_START_TRIGGER_ERROR"
  }
}
```

If the authenticated actor cannot be recovered after the committed creation boundary, the warning code is:

```text
STORY_SCENE_RUN_START_ACTOR_UNAVAILABLE
```

## Event execution

The executor reads active `story_events` for the current Scene where:

```text
trigger_type = 'scene_run_start'
```

Events execute in deterministic Definition order (`created_at`, then `id`).

For every Event it evaluates:

1. once-per-Scene-Run execution history;
2. approved Story Conditions;
3. stable Runtime targets;
4. approved Story Effects in authored array order.

Every applied or failed execution is written to `runtime_story_event_executions`.

A failed Event does not stop later lifecycle processing by rolling back the Scene Run. Its partial effects follow the same established Story Event semantics: already-committed effects remain committed and the failed execution audit records the effects that completed before failure.

## Approved effects

`scene_run_start` uses the same shared approved Effect vocabulary as the other Story executors:

- `show_narrative`
- `set_flag`
- `reveal_zone`
- `open_door`
- `close_door`
- `activate_encounter`
- `spawn_monster`
- `spawn_boss`
- `start_combat`

No lifecycle-specific duplicate spawn/combat implementation is permitted.

Monster and Boss effects call the existing replay-safe Runtime Encounter service directly. Automatic Story execution must not fake a GM browser HTTP request.

## Runtime Encounter authority

Encounter conditions and effects use per-Scene-Run Runtime Encounter state.

Definition data remains authoring input only.

Forbidden lifecycle side effects include:

```text
UPDATE encounters SET status = ...
INSERT INTO encounter_participants ...
INSERT INTO encounter_combats ...
```

Runtime mutations use the existing authorities:

```text
runtime_encounter_states
runtime_encounter_participants
runtime_encounter_combats
runtime_entity_positions
```

## Once-per-Scene-Run semantics

For an Event authored with:

```json
{
  "oncePerSceneRun": true
}
```

an already-applied Event is not applied again in the same Scene Run.

Replay-safe spawn effects continue to use `(scene_run_id, story_event_id, effect_index)` provenance when applicable.

## GM authoring

The existing GM Story Events GUI already exposes `scene_run_start` in its Trigger Type selector.

Recommended opening Event:

```json
{
  "name": "Scene Opening",
  "status": "active",
  "triggerType": "scene_run_start",
  "trigger": {},
  "conditions": [
    { "type": "event_not_fired" },
    { "type": "scene_run_status", "status": "active" }
  ],
  "effects": [
    { "type": "show_narrative", "text": "The scene begins." },
    { "type": "set_flag", "key": "scene.opened", "value": true }
  ],
  "oncePerSceneRun": true
}
```

## Production E2E contract

`scripts/production-alpha-story-scene-run-start-e2e.mjs` is write-gated by:

```text
DND_ALPHA_EXECUTE=1
DND_ALPHA_GM_PASSWORD=...
```

Plan-only mode performs no production writes.

The production-writing flow creates two `scene_run_start` Events:

1. a successful Event that applies narrative, flag, and `activate_encounter`;
2. an intentionally failing Event that calls `start_combat` without a Character participant.

The runner requires all of the following:

- Scene Run / Runtime Map creation still returns success;
- the successful Event is audited `applied`;
- its narrative, flag, and Runtime Encounter activation persist;
- the intentional failure is audited `failed`;
- the failure does not roll back the Runtime;
- Encounter Definition status remains `planned`;
- legacy Definition Combat remains `null`;
- Runtime is closed and Scenario archived after verification.

## Remaining lifecycle triggers

This contract does not claim implementation of every vocabulary trigger.

After `scene_run_start`, lifecycle triggers that still require their own committed-boundary integration include, as applicable:

- `encounter_activated`
- `combat_started`
- `combat_ended`
- `flag_changed`

`interact_object` should not be implemented until there is a concrete Runtime Object interaction authority to attach it to.
