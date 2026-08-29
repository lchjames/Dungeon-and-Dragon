# Story `encounter_activated` Trigger — Alpha Canonical

Status: Implemented Alpha Runtime Contract

## Purpose

`encounter_activated` fires when a per-Scene-Run Runtime Encounter transitions from `planned` to `active`.

It is a Runtime lifecycle trigger. It does not use or mutate Encounter Definition status as runtime authority.

Canonical use cases include:

- reveal narrative when an Encounter becomes active;
- set Runtime Story flags;
- reveal a Zone or operate a Runtime Door;
- spawn Runtime Monsters or Bosses;
- activate a second Encounter;
- start Runtime Combat after the required participants are positioned.

## Trigger shape

```json
{
  "triggerType": "encounter_activated",
  "trigger": {
    "encounterId": "encounter_..."
  }
}
```

The trigger is canonicalized to the stable Encounter Definition ID only. Extra authoring keys are discarded.

## Authority boundary

The authoritative Runtime transition is:

```text
runtime_encounter_states.status: planned → active
```

`activateRuntimeEncounter()` commits two things in the same D1 batch:

1. the Runtime Encounter activation, including `activated_at` and actor provenance;
2. one durable `runtime_story_lifecycle_occurrences` row for `encounter_activated`.

Occurrence identity is:

```text
(scene_run_id, trigger_type, subject_id)
```

For this trigger the subject is the Runtime Encounter's stable `encounterId`.

An Encounter can transition `planned → active` only once in a Scene Run, so the lifecycle occurrence is one-shot even if an authored Event uses `oncePerSceneRun: false`.

## Durable dispatch

Lifecycle occurrences are drained after the enclosing Runtime mutation has committed.

The dispatcher uses:

```text
runtime_story_lifecycle_occurrences
runtime_story_lifecycle_dispatches
```

The occurrence row has a lease so concurrent successful requests cannot dispatch the same activation at the same time. A stale lease can be reclaimed after the safety timeout.

Each matching Story Event receives at most one terminal dispatch record for the occurrence:

```text
applied
failed
skipped
```

This prevents a normal HTTP retry or a later drain request from re-running an Event that has already reached a terminal dispatch result for the same activation occurrence.

Existing Story Effect semantics still apply inside one Event: effects are executed in authored order and already-committed partial effects are not transactionally rolled back if a later effect fails.

## No retroactive Event creation

Only `encounter_activated` Story Events that existed when the Encounter was activated are eligible:

```text
story_events.created_at <= occurrence.source_at
```

Creating a new Event after an Encounter is already active does not retroactively fire that Event for the old activation.

## Cascades

An `encounter_activated(A)` Event may use:

```json
{
  "type": "activate_encounter",
  "encounterId": "encounter_B"
}
```

That activation creates B's durable lifecycle occurrence in the same authority batch. The current drain loop then claims B and processes its matching Events.

The per-request lifecycle drain is bounded to 50 occurrences. If a malformed content graph exceeds that limit, processing stops with:

```text
STORY_LIFECYCLE_CASCADE_LIMIT
```

Already-committed Runtime changes remain committed.

## Existing mutation routes covered

The top-level Runtime gateway drains pending `encounter_activated` occurrences after the existing mutation boundaries that can cause Story-driven activation:

- Scene Run creation / `scene_run_start` Story execution;
- manual Story Event activation;
- Player movement / `enter_zone` Story execution;
- GM manual Encounter resolution followed by `encounter_resolved` Story execution;
- Combat End followed by automatic Encounter resolution / `encounter_resolved` Story execution.

The lower-level executors do not duplicate lifecycle callbacks.

If the lifecycle dispatcher itself fails after a committed mutation, the original request remains successful and includes:

```json
{
  "encounterActivatedStoryWarning": {
    "code": "..."
  }
}
```

The durable occurrence remains available for a later drain unless it was already completed.

## Approved effects

`encounter_activated` uses the same approved Story Effects as the other Runtime executors:

- `show_narrative`
- `set_flag`
- `reveal_zone`
- `open_door`
- `close_door`
- `activate_encounter`
- `spawn_monster`
- `spawn_boss`
- `start_combat`

Monster/Boss spawning and Runtime Combat always call the existing server-internal Runtime Encounter services. No GM browser impersonation is used.

## Definition / Runtime isolation

The lifecycle flow must not perform:

```text
UPDATE encounters SET status = ...
INSERT INTO encounter_participants ...
INSERT INTO encounter_combats ...
```

Encounter Definition state remains authoring state.

Runtime state remains in:

```text
runtime_encounter_states
runtime_encounter_participants
runtime_encounter_combats
runtime_entity_positions
```

## GM authoring

The existing Story Events GUI already exposes `encounter_activated` in Trigger Type.

Example:

```json
{
  "name": "Boss Room Wakes",
  "status": "active",
  "triggerType": "encounter_activated",
  "trigger": {
    "encounterId": "encounter_boss_room"
  },
  "conditions": [
    {
      "type": "encounter_status",
      "encounterId": "encounter_boss_room",
      "status": "active"
    }
  ],
  "effects": [
    {
      "type": "show_narrative",
      "text": "The chamber seals as the encounter begins."
    }
  ],
  "oncePerSceneRun": true
}
```

## Production E2E contract

`scripts/production-alpha-story-encounter-activated-e2e.mjs` is write-gated by:

```text
DND_ALPHA_EXECUTE=1
DND_ALPHA_GM_PASSWORD=...
```

Plan-only mode performs no production writes.

The production-writing flow proves:

```text
Scene Run starts
→ scene_run_start activates Encounter A
→ encounter_activated(A) fires
→ A's Event writes narrative + flag and activates Encounter B
→ encounter_activated(B) fires in the same drain cascade
→ both Runtime Encounters are active
→ a later manual attempt to activate already-active A is unchanged
→ no duplicate A/B lifecycle dispatch or narrative occurs
```

It also verifies both Encounter Definitions remain `planned` and have no legacy Definition Combat link.

## Reusable lifecycle foundation

The occurrence/dispatch tables are intentionally generic. Future committed lifecycle triggers such as `combat_started`, `combat_ended`, and `flag_changed` can reuse the same durable pattern rather than inventing route-specific callbacks.

`interact_object` remains deferred until there is a concrete Runtime Object interaction authority.
