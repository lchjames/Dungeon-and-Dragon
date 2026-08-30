# Story `combat_started` Trigger — Alpha Canonical

Status: Implemented Alpha Runtime Contract

## Purpose

`combat_started` is the automatic Story Event lifecycle trigger for a committed Runtime Encounter Combat.

It fires only for Combat that is linked to a Runtime Encounter and Runtime Map. The older global Character-only Combat surface does not have Scene Run / Encounter authoring context and therefore does not create this Story lifecycle occurrence.

Typical uses include:

- showing opening Combat narrative;
- setting Runtime Story flags;
- revealing Zones or changing Doors as Combat begins;
- activating a second Runtime Encounter;
- preparing later Story lifecycle chains.

It does not execute arbitrary JavaScript or SQL.

## Trigger shape

Canonical authoring shape:

```json
{
  "triggerType": "combat_started",
  "trigger": {
    "encounterId": "encounter_..."
  }
}
```

The authoring target is the stable Encounter Definition ID. Runtime execution resolves that ID against the current Scene Run's Runtime Encounter state.

The lifecycle occurrence itself uses the exact Runtime Combat identity:

```text
subject_type = combat
subject_id   = combat_<runtime id>
```

The dispatcher resolves the Combat back through `runtime_encounter_combats` to the authored `encounterId`.

## Authority boundary

The canonical Runtime Encounter Combat creation transaction already inserts:

```text
combats
combatants
runtime_encounter_combats
```

A SQLite `AFTER INSERT` trigger on `runtime_encounter_combats` materializes the durable Story occurrence:

```text
Runtime Encounter Combat batch
→ INSERT combats
→ INSERT combatants
→ INSERT runtime_encounter_combats
   ↳ AFTER INSERT trigger
      → INSERT runtime_story_lifecycle_occurrences(combat_started)
→ batch commits
```

Because the database trigger executes as part of the `runtime_encounter_combats` insert, the Combat link and the Story lifecycle occurrence share the same transaction boundary. A committed Runtime Encounter Combat cannot exist without its `combat_started` occurrence once the Alpha authority schema is active.

The trigger records:

- Scene Run ID from `runtime_encounter_combats`;
- `trigger_type = 'combat_started'`;
- `subject_type = 'combat'`;
- exact Runtime Combat ID;
- source time from `combats.started_at`;
- actor from `linked_by_user_id`.

The unique lifecycle key remains:

```text
(scene_run_id, trigger_type, subject_id)
```

so an idempotent retry of `startRuntimeEncounterCombat()` cannot create a second occurrence for the same Combat.

## Generic durable dispatcher

`combat_started` and `encounter_activated` use the same Runtime Story lifecycle dispatcher.

The dispatcher:

1. claims the next pending supported occurrence with a lease;
2. loads the active Scene Run / Runtime Map;
3. resolves the occurrence subject;
4. loads active Story Events of the exact trigger type;
5. applies the occurrence-time authoring cutoff;
6. matches the Event's stable Encounter ID;
7. evaluates approved Conditions;
8. executes approved Effects in authored order;
9. writes terminal per-Event lifecycle dispatch state;
10. completes the occurrence.

The occurrence-time cutoff is:

```text
story_events.created_at <= occurrence.source_at
```

A Story Event authored after the Combat had already started must not retroactively fire for that historical occurrence.

## Dispatch idempotency

For each lifecycle occurrence + Story Event pair, the dispatcher writes one terminal record in:

```text
runtime_story_lifecycle_dispatches
```

with a unique key:

```text
(occurrence_id, story_event_id)
```

Terminal states are:

- `applied`
- `failed`
- `skipped`

This prevents repeated HTTP requests or later queue drains from duplicating Narrative, Flag or other Story effects for the same Combat-start occurrence.

`oncePerSceneRun` remains an additional Event-level rule across lifecycle occurrences in the same Scene Run.

## Cross-trigger cascade

The lifecycle queue is generic, so an Event can create another supported lifecycle occurrence and the same bounded drain continues processing it.

Canonical example:

```text
Runtime Combat A starts
→ combat_started(A)
→ Story Event activates Encounter B
→ encounter_activated(B)
→ B Story Event applies
```

The reverse direction is also supported:

```text
encounter_activated(A)
→ Story start_combat(A)
→ runtime_encounter_combats INSERT
→ combat_started(A)
```

The shared per-request safety limit is 50 supported lifecycle occurrences. If the queue still contains supported pending occurrences after the limit, the request returns a lifecycle warning while already-committed Runtime mutations remain committed.

## Approved Effects

`combat_started` uses the same approved Story Effect vocabulary as the other Runtime Story executors:

- `show_narrative`
- `set_flag`
- `reveal_zone`
- `open_door`
- `close_door`
- `activate_encounter`
- `spawn_monster`
- `spawn_boss`
- `start_combat`

Server-internal Runtime services remain authoritative. The lifecycle dispatcher does not impersonate a GM browser request and does not call `/api/gm/...` to execute effects.

The existing global single-active-Combat rule still applies. Therefore a `combat_started` Event attempting to start another Combat while the current one remains active will fail through the normal Runtime Combat authority.

## Direct GM Runtime Combat route

The top-level Runtime Story lifecycle gateway pre-installs the Combat lifecycle authority trigger before relevant Runtime mutations.

For the direct GM route:

```text
POST /api/gm/world/runtime/maps/:mapId/encounters/:encounterId/start-combat
```

the flow is:

```text
prepare lifecycle authority
→ existing Runtime Encounter Combat route commits
→ durable occurrence already exists from the SQL trigger
→ generic lifecycle queue drains
→ response exposes lifecycle results
```

Canonical response groupings are:

```text
storyLifecycleEvents
encounterActivatedStoryEvents
combatStartedStoryEvents
```

The older `encounterActivatedStoryEvents` field remains available for compatibility, but the top-level gateway filters it to actual `encounter_activated` results.

If lifecycle dispatch fails after Combat creation has committed, the Combat response remains successful and includes `storyLifecycleWarning` rather than pretending the Combat transaction failed.

## Retry rule

Calling the same Runtime Encounter `start-combat` route again after its Combat already exists returns the existing linked Combat with `unchanged: true`.

It does not insert another `runtime_encounter_combats` row, therefore it does not create another `combat_started` occurrence. A subsequent lifecycle drain has nothing new to dispatch.

## Definition / Runtime isolation

`combat_started` must not mutate reusable Encounter Definition state.

Forbidden lifecycle writes include:

```text
UPDATE encounters SET status = ...
INSERT INTO encounter_participants ...
INSERT INTO encounter_combats ...
```

Runtime authority continues to use:

```text
runtime_encounter_states
runtime_encounter_participants
runtime_encounter_combats
runtime_entity_positions
combats
combatants
runtime_story_lifecycle_occurrences
runtime_story_lifecycle_dispatches
```

Definition Encounter status, Definition participant roster and legacy Definition Combat linkage remain authoring/history data only.

## GM authoring

The existing GM Story Event editor already exposes `combat_started` in the Trigger Type selector.

Recommended Event:

```json
{
  "name": "Combat Opening",
  "status": "active",
  "triggerType": "combat_started",
  "trigger": {
    "encounterId": "encounter_..."
  },
  "conditions": [
    { "type": "event_not_fired" },
    { "type": "encounter_status", "encounterId": "encounter_...", "status": "active" }
  ],
  "effects": [
    { "type": "show_narrative", "text": "The battle begins." },
    { "type": "set_flag", "key": "combat.opened", "value": true }
  ],
  "oncePerSceneRun": true
}
```

## Production E2E contract

`scripts/production-alpha-story-combat-started-e2e.mjs` is write-gated by:

```text
DND_ALPHA_EXECUTE=1
DND_ALPHA_GM_PASSWORD=...
```

Plan-only mode performs no production writes.

The production-writing flow verifies:

1. a Scenario / Scene with planned Encounter A and Encounter B;
2. Character participant + Runtime Map + Monster Spawn Point;
3. a manual Event activates Encounter A;
4. a fresh Runtime Monster is spawned into A;
5. direct GM `start-combat` creates the Runtime Encounter Combat;
6. `combat_started(A)` writes Narrative + Flag and activates B;
7. `encounter_activated(B)` fires in the same generic lifecycle drain;
8. response grouping separates Combat-started and Encounter-activated results;
9. retrying start-combat is idempotent and creates zero duplicate lifecycle Narrative / dispatch;
10. Encounter Definitions remain `planned` and their reusable roster / legacy Combat state remain unchanged;
11. Combat is ended and Runtime / Scenario cleanup is attempted.

## Remaining lifecycle work

After this slice, lifecycle triggers still requiring their committed authority integration include:

- `combat_ended`
- `flag_changed`

`interact_object` should remain unimplemented until there is a concrete Runtime Object interaction authority to attach it to.
