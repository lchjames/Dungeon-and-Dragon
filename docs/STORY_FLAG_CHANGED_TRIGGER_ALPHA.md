# Durable `flag_changed` Story Trigger — Alpha

> Status: **Implemented Alpha Runtime Contract**  
> Date: 2026-09-05  
> Parent: `docs/RUNTIME_ENCOUNTER_RESOLUTION_ALPHA.md`

## Purpose

`flag_changed` turns Runtime Story flags into a first-class durable Story lifecycle source.

The canonical chain is:

```text
approved Runtime mutation
→ set_flag
→ runtime_story_flags changes value
→ durable flag-change audit
→ durable flag_changed occurrence
→ generic Runtime Story lifecycle dispatcher
→ matching Story Event(s)
```

This is not an Event-local callback. The authority is the committed Runtime Story flag state itself, so every approved `set_flag` execution path uses the same lifecycle contract.

## Authoring shape

Canonical trigger:

```json
{
  "triggerType": "flag_changed",
  "trigger": {
    "key": "gate.powered"
  }
}
```

`key` is mandatory and uses the existing Story flag key normaliser:

```text
lowercase
1–80 characters
[a-z0-9._-]
```

The trigger matches the flag identity only. Result-value branching should use existing conditions:

```json
{
  "conditions": [
    { "type": "flag_equals", "key": "gate.powered", "value": true }
  ]
}
```

This keeps trigger identity separate from state predicates.

## What counts as a change

A lifecycle occurrence is created when:

```text
flag did not previously exist
→ first value is inserted
```

or:

```text
existing value_json != new value_json
→ value is updated
```

A repeated write of the same serialised JSON scalar is **not** a change:

```text
true → true      = no flag_changed occurrence
5 → 5            = no flag_changed occurrence
"ready" → "ready" = no flag_changed occurrence
```

This prevents idempotent Story retries from manufacturing false lifecycle events.

Alpha Story flags remain JSON scalars only:

```text
null
boolean
finite number
string
```

## Durable audit authority

Additive migration:

```text
schema/0026_story_flag_changed_trigger.sql
```

Audit table:

```text
runtime_story_flag_change_log
```

Important fields:

```text
id
scene_run_id
flag_key
from_value_json     nullable only when the flag did not previously exist
to_value_json
changed_by_user_id
changed_at
created_at
```

The actor comes from `runtime_story_flags.updated_by_user_id`, which is already supplied by the approved Story effect executor.

Therefore the lifecycle actor is the actual GM/Admin or other authorised Runtime actor whose Story execution caused the committed flag mutation. It is not inferred later from Event authorship.

## Database transaction boundary

Three SQLite triggers provide the durable boundary.

### First value

```text
AFTER INSERT ON runtime_story_flags
→ runtime_story_flag_change_log
```

### Changed existing value

```text
AFTER UPDATE OF value_json ON runtime_story_flags
WHEN OLD.value_json IS NOT NEW.value_json
→ runtime_story_flag_change_log
```

### Story occurrence

```text
AFTER INSERT ON runtime_story_flag_change_log
→ runtime_story_lifecycle_occurrences
```

Occurrence identity:

```text
trigger_type = flag_changed
subject_type = story_flag_change
subject_id = runtime_story_flag_change_log.id
source_at = changed_at
actor_user_id = changed_by_user_id
```

Because `subject_id` is the unique audit-row ID, the same flag may change repeatedly in one Scene Run and every real transition receives its own occurrence.

Existing flags are not retroactively backfilled when the migration or lazy schema guard is installed.

## Dispatcher subject validation

Before dispatch, the generic lifecycle executor reloads the exact `runtime_story_flag_change_log` row and validates:

```text
scene_run_id matches
changed_by_user_id matches occurrence.actor_user_id
changed_at matches occurrence.source_at
subject_type = story_flag_change
```

The dispatcher exposes the subject metadata in result rows:

```text
flagChangeId
flagKey
flagHadPreviousValue
flagFromValue
flagToValue
occurrenceId
```

`flagHadPreviousValue` distinguishes:

```text
absent → null
```

from:

```text
JSON null → another value
```

because both may otherwise display `fromValue = null`.

## Condition snapshot

When processing a `flag_changed` occurrence, the generic lifecycle dispatcher places the occurrence's `to_value_json` into the in-memory flag condition context for that key before evaluating matching Events.

Therefore this canonical Event remains meaningful even if a later mutation has already changed the stored flag again before an older occurrence is drained:

```json
{
  "triggerType": "flag_changed",
  "trigger": { "key": "door.mode" },
  "conditions": [
    { "type": "flag_equals", "key": "door.mode", "value": "open" }
  ]
}
```

The condition observes the value produced by that lifecycle occurrence for the changed key. Other Runtime conditions continue to use the current Runtime state loaded by the dispatcher.

Effects from earlier matching Events in the same occurrence still execute sequentially and can influence later Event evaluation through the shared Runtime state, consistent with existing Story lifecycle semantics.

## Event cutoff

The generic lifecycle rule remains:

```text
story_events.created_at <= occurrence.source_at
```

An Event authored after a historical flag change does not retroactively fire for that old occurrence.

## Cascades

`flag_changed` participates in the same durable cascade loop as:

```text
encounter_activated
combat_started
combat_ended
encounter_resolved
```

Example:

```text
manual Event
→ set_flag quest.stage = 2
→ flag_changed(quest.stage)
→ Event B set_flag gate.ready = true
→ flag_changed(gate.ready)
→ Event C activate Encounter
→ encounter_activated
→ Event D start Combat
→ combat_started
```

All occurrences use the shared queue, lease, dispatch idempotency and 50-occurrence per-request safety limit.

## Loop safety

Authors can intentionally create recurring flag logic with `oncePerSceneRun = false`, but cycles such as:

```text
A changed → set B
B changed → set A
```

can become unbounded if values continue alternating.

The existing lifecycle cascade limit therefore remains authoritative:

```text
maximum 50 supported lifecycle occurrences per drain
```

If the limit is exceeded, the Runtime mutation already committed remains authoritative and the lifecycle warning path reports `STORY_LIFECYCLE_CASCADE_LIMIT`.

## Idempotency

There are two separate idempotency layers.

### Mutation idempotency

Same-value writes do not create change-audit rows or occurrences.

### Dispatch idempotency

```text
runtime_story_lifecycle_dispatches
UNIQUE (occurrence_id, story_event_id)
```

prevents a matching Story Event from executing twice for the same flag-change occurrence.

Once-per-Scene-Run Event policy remains enforced independently through `runtime_story_event_executions`.

## Approved sources

Because the authority is attached to `runtime_story_flags`, no special case is required for each upstream Story executor.

Current approved `set_flag` sources include:

```text
manual Story Event
scene_run_start Story Event
enter_zone Story Event
encounter_activated Story lifecycle
combat_started Story lifecycle
combat_ended Story lifecycle
encounter_resolved Story lifecycle
flag_changed Story lifecycle
```

Future approved Story execution paths that mutate `runtime_story_flags` through the same table contract inherit `flag_changed` automatically once lifecycle authority is prepared before mutation.

## Response surface

Top-level Runtime Story lifecycle responses expose:

```text
storyLifecycleEvents
flagChangedStoryEvents
```

Each `flagChangedStoryEvents` item is also present in `storyLifecycleEvents`; the specialised array is a convenience grouping, not a second execution path.

## Definition / Runtime isolation

`flag_changed` is Runtime-only state.

It must not rewrite:

```text
Scenario Definition
Scene Definition
Encounter Definition
Map Template
Story Event Definition
```

Only per-Scene-Run Runtime state, audit and Story execution rows are mutated.

## Production-writing verification

Operator-only runner:

```text
scripts/production-alpha-story-flag-changed-e2e.mjs
```

Plan-only unless:

```text
DND_ALPHA_EXECUTE=1
DND_ALPHA_GM_PASSWORD=<operator credential>
```

The live path verifies:

```text
manual set_flag(source=true)
→ flag_changed(source)
→ set_flag(derived="ready")
→ flag_changed(derived)
→ set_flag(final=true)
```

It then performs a second manual Event that writes `source=true` again and verifies:

```text
same value write
→ zero flagChangedStoryEvents
→ zero duplicate derived/cascade executions
```

## Current lifecycle checkpoint

The durable automatic Story chain now includes:

```text
scene_run_start
enter_zone
encounter_activated
combat_started
combat_ended
encounter_resolved
flag_changed
```

The next major automatic trigger that still requires its own Runtime authority model is:

```text
interact_object
```

That slice should be built together with Runtime Object identity, interaction permission and object-state authority rather than as an empty trigger-only shell.
