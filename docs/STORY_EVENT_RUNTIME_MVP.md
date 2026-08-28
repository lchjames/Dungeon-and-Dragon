# Story Event Runtime — Alpha MVP

> Status: **Implemented Alpha Runtime Contract**  
> Date: 2026-08-28  
> Parent Canonical: `docs/WORLD_MAP_STORY_RUNTIME_ALPHA.md`

---

## 1. Purpose

This document records the implemented Alpha Story Event runtime slice that bridges authored Scene structure into server-authoritative gameplay effects.

The Canonical model remains:

```text
Trigger
+ Conditions
+ Approved Effects
```

Arbitrary JavaScript, SQL, browser-side scripts, or free-form code execution are not valid Story Event mechanisms.

---

## 2. Implemented Trigger Types

### 2.1 Manual GM activation

Implemented through the GM Runtime Story Event API.

A GM may explicitly activate an `active` Story Event belonging to the current Scene Run / Runtime Map.

### 2.2 Entity enters Zone — Player Move slice

Implemented for successful Player Character Map movement.

Canonical transition rule:

```text
origin cell is outside Runtime Zone
+ destination cell is inside Runtime Zone
→ enter_zone trigger candidate
```

The trigger references the stable Map Template Zone ID through:

```json
{
  "sourceZoneId": "zone_..."
}
```

The server resolves the corresponding Runtime Zone. Runtime row IDs are not authored into Story Event definitions.

Player visibility is not used to determine whether the trigger exists. A hidden GM trigger Zone can therefore fire without leaking that Zone to the Player payload before the Event chooses to reveal it.

Moving between two cells already inside the same Zone is not a new entry and must not refire an `enter_zone` Event merely because another Move occurred.

---

## 3. Implemented Conditions

The current structured condition vocabulary is:

```text
event_not_fired
flag_equals
flag_not_equals
scene_run_status
door_state
```

Conditions are evaluated server-side before effects are applied.

`once_per_scene_run` is additionally enforced using successful Runtime Story Event execution audit rows.

---

## 4. Implemented Approved Effects

The current executable effect vocabulary is:

```text
show_narrative
set_flag
reveal_zone
open_door
close_door
```

Effects operate on Runtime state only and do not mutate reusable Map Template definitions.

### `show_narrative`

Creates a Runtime Story Narrative tied to the Scene Run and Story Event. Player world responses expose the approved narrative.

### `set_flag`

Upserts a Scene Run Story Flag using a validated scalar JSON value.

### `reveal_zone`

Changes the Runtime Zone to Player-visible. It does not modify the Map Template's default visibility.

### `open_door` / `close_door`

Changes the Runtime Door state and movement-blocking state, with Runtime Door audit logging.

---

## 5. Runtime Storage

Durable D1 schema is defined in:

```text
schema/0016_story_event_runtime.sql
```

Tables:

```text
story_events
runtime_story_flags
runtime_story_narratives
runtime_story_event_executions
```

Runtime compatibility guards continue to use `CREATE TABLE IF NOT EXISTS` so an older long-lived production D1 can safely encounter this feature before an explicit migration operation.

No Story Event migration may drop or mass-delete Canonical runtime data.

---

## 6. Player Move Transaction Boundary

A legal Player Move is resolved by the existing server-authoritative movement resolver before automatic Story Event processing begins.

Locked Alpha behaviour:

```text
Player Move succeeds
→ authoritative position + Move allowance are committed
→ enter_zone Story Events are evaluated
```

If the subsequent automatic Story Event resolver fails unexpectedly:

```text
Move remains successful
Story trigger returns a warning / failed audit where possible
Move is not rolled back
```

This prevents a secondary narrative/effect failure from corrupting or reversing an already-valid movement transaction.

When automatic effects succeed, the Player world payload is refreshed so effects such as `show_narrative` and `reveal_zone` can be visible in the same post-Move response.

---

## 7. Audit Boundary

Every successfully applied Story Event produces a `runtime_story_event_executions` row containing:

```text
Story Event
Scene Run
Runtime Map
trigger type
status
approved effects applied
activating User
created timestamp
```

Failed effect execution is recorded as `failed` where the audit write itself remains available, including the error code/message and effects already applied before failure.

For an automatic `enter_zone` Event, the activating User is the Player whose authoritative Move caused the trigger.

---

## 8. Production Verification

The manual vertical slice is covered by:

```text
scripts/production-alpha-story-event-e2e.mjs
```

The automatic Player Move → hidden Zone → Story Event vertical slice is covered by:

```text
scripts/production-alpha-story-zone-e2e.mjs
```

The automatic E2E verifies:

```text
hidden trigger Zone does not leak before entry
Player has a legal Move into the Zone
Move commits from origin to destination
enter_zone Event fires automatically
structured Conditions pass
set_flag applies
show_narrative reaches Player
reveal_zone updates the refreshed Player payload
execution audit records trigger_type = enter_zone
Runtime closes cleanly
Scenario is archived after the test
```

Both Story Event runners are part of the fail-fast production Alpha live orchestrator.

---

## 9. Current Implementation Checkpoint

As of 2026-08-28, the World / Map / Story implementation order has reached:

```text
1. Definition foundation                IMPLEMENTED
2. Runtime foundation                   IMPLEMENTED
3. Position + visibility                IMPLEMENTED
4. Movement resolver                    IMPLEMENTED
5. Story Event foundation
   manual trigger                       IMPLEMENTED
   Player Move → enter_zone trigger     IMPLEMENTED
   structured conditions                IMPLEMENTED (initial vocabulary)
   Story flags                          IMPLEMENTED
   narrative / zone / door effects      IMPLEMENTED
```

The next major Canonical gap is the remainder of Story Event → Encounter / Combat integration, especially:

```text
spawn_monster
spawn_boss
activate_encounter
start_combat
```

The target playable loop remains:

```text
Scenario Run
→ Scene Run
→ Runtime Map
→ Player Move
→ enter Zone
→ Story Event
→ activate Encounter
→ Combat on the same Runtime Map / positions
→ resolve Encounter / Combat
→ continue Scene
```

---

## 10. Still Deferred / Not Yet Claimed by This MVP

This implementation does **not** claim completion of:

```text
Scene Run start trigger
Object interaction trigger
Encounter activated/resolved triggers
Combat started/ended triggers
Story flag changed trigger
entity-present-in-Zone condition
Encounter-status condition
Object-state condition
set_object_state
spawn_monster
spawn_boss
activate_encounter
start_combat
grant_item
apply_status
move_entity
activate_scene_run
complete_scene_run
advanced LOS / fog / perception trigger logic
AI Story generation or free-form script execution
```

Those remain later Alpha slices unless separately promoted and implemented.
