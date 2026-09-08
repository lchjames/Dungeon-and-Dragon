# Shared Story Execution Authority — Alpha Canonical

Status: Canonical Alpha execution policy.

This document consolidates Story Event execution without changing trigger semantics, lifecycle ordering, or Runtime authority.

---

## 1. Purpose

Story trigger adapters remain responsible for deciding **which Story Event occurrence is eligible to be considered**.

The shared execution authority is responsible for deciding **whether that Event may execute now and for applying its approved effects**.

Canonical module:

```text
src/story-execution-authority.js
```

The shared authority owns:

1. Runtime target validation;
2. Story condition evaluation;
3. approved Story effect execution;
4. sequential in-request state propagation;
5. Story Event execution audit.

It does not own trigger matching, durable occurrence leasing, Player movement, Object interaction commits, Encounter resolution ordering, or Scene transition authority.

---

## 2. Supported execution adapters

All currently approved Story execution sources delegate their condition/effect execution to the same authority:

```text
manual
scene_run_start
enter_zone
interact_object
encounter_activated
combat_started
combat_ended
encounter_resolved
flag_changed
```

The five adapter families are:

```text
story-event-gateway.js              manual
scene-run-start-story.js            scene_run_start
story-zone-trigger-gateway.js       enter_zone
runtime-object-story.js             interact_object
runtime-story-lifecycle.js          durable generic lifecycle
```

No new trigger type is introduced by this consolidation.

---

## 3. Trigger adapters remain authoritative for occurrence semantics

The shared executor never invents an occurrence.

Each adapter still owns trigger-specific validation before delegation.

Examples:

- `scene_run_start` validates the canonical trigger structure;
- `enter_zone` matches the newly entered stable `sourceZoneId`;
- `interact_object` matches the committed stable `sourceObjectId`;
- durable lifecycle adapters match Encounter / Combat / Flag subjects;
- manual activation requires an explicit GM/Admin request.

This split is deliberate. Trigger occurrence identity and effect execution are different authorities.

---

## 4. Historical snapshot semantics remain unchanged

### `flag_changed`

A durable `flag_changed` occurrence evaluates the triggering flag using the committed change represented by the occurrence, rather than blindly reading a later Runtime flag value.

The occurrence still preserves:

- change-log identity;
- actor identity;
- source timestamp;
- from-value;
- to-value;
- historical Story Event cutoff.

### `interact_object`

An `interact_object` occurrence evaluates the triggering Object condition using that interaction's committed `to_state_key` even if the current Runtime Object has changed again before the queue drains.

The subsequent `set_object_state` effect still mutates the current Runtime Object through optimistic concurrency. An old occurrence cannot overwrite a newer Runtime state silently.

These snapshot overrides are prepared by the trigger adapter before it calls the shared executor.

---

## 5. Shared target validation

The shared authority validates stable Runtime targets for approved conditions/effects.

Condition targets:

```text
encounter_status   → Encounter Definition ID
 door_state         → sourceEdgeId
 object_state       → sourceObjectId
```

Effect targets:

```text
activate_encounter → Encounter Definition ID
spawn_monster      → Encounter + sourceSpawnPointId
spawn_boss         → Encounter + sourceSpawnPointId
start_combat       → Encounter Definition ID
reveal_zone        → sourceZoneId
open_door          → sourceEdgeId
close_door         → sourceEdgeId
set_object_state   → sourceObjectId
```

Missing Runtime targets fail closed.

---

## 6. Shared condition evaluation

Conditions continue to use `evaluateStoryConditions(...)` from the canonical Story rules module.

The execution context includes the same mutable in-request maps:

```text
flags
doors
objects
encounters
```

Therefore sequential Story effects remain visible to later Story Events processed in the same server-side sequence where the adapter already preserves a shared context.

Once-per-Scene-Run semantics remain based on successful `runtime_story_event_executions` rows.

---

## 7. Shared effect execution

Approved effects remain:

```text
show_narrative
set_flag
set_object_state
reveal_zone
open_door
close_door
activate_encounter
spawn_monster
spawn_boss
start_combat
```

The consolidation does not add arbitrary code execution.

Effects continue to call existing Runtime authorities where one already exists, including Runtime Object state and Runtime Encounter services.

Door and Zone mutation remain guarded by active Runtime Map checks.

---

## 8. Shared execution audit

Canonical audit table remains:

```text
runtime_story_event_executions
```

Successful and failed effect execution is recorded with:

- Story Event ID;
- Scene Run ID;
- Runtime Map ID;
- trigger type;
- applied effects up to the failure boundary;
- error code/message when failed;
- exact actor user ID;
- timestamp.

Condition-not-met skips do not create a failed execution row, matching existing Alpha semantics.

Durable lifecycle dispatch audit remains separate because occurrence delivery/idempotency is a different concern.

---

## 9. Manual execution semantics

Manual Story activation continues to require GM/Admin authority and an active Runtime Map.

The manual HTTP adapter converts the shared executor result back into the existing API behaviour:

- once-per-Scene-Run repeat → conflict;
- unmet conditions → `STORY_EVENT_CONDITIONS_NOT_MET` conflict;
- target/effect failure → corresponding shared error;
- success → refreshed Runtime Story state.

Manual execution no longer owns a separate effect implementation.

---

## 10. Ordering guarantees

This consolidation must not change existing ordering.

In particular:

```text
Combat commit
  → combat_ended Story
  → Encounter auto-resolution
  → encounter_resolved Story
```

and Object interaction remains:

```text
Object Interaction commit
  → durable interact_object occurrence
  → shared Story execution
```

Scene transition ordering is also unchanged.

---

## 11. Script Tool readiness

This shared authority is the required backend boundary for a future GM-facing **Script Tool**.

The Script Tool must not execute arbitrary JavaScript, SQL, Worker code, or D1 statements.

Its first Alpha version should compile GM-authored script steps into the same approved Story conditions/effects and submit them through this shared authority.

That means the Script Tool inherits:

- stable target validation;
- GM/Admin authentication;
- approved effect vocabulary;
- Runtime optimistic concurrency;
- Story execution audit;
- Encounter/Object/Map authority boundaries.

### Availability checkpoint

Developer/operator scripts under `scripts/*.mjs` are already usable now.

The GM-facing in-app Script Tool becomes safe to expose **after this consolidation is production-complete**. It is the next authoring milestone, not something that needs another Runtime rules redesign first.

---

## 12. Checkpoint

After this slice the Story stack is:

```text
Trigger-specific occurrence adapter
  → shared Story execution authority
    → canonical condition evaluation
    → canonical approved effects
    → Runtime subsystem authorities
    → runtime_story_event_executions audit
```

The next major authoring slice is **GM Script Tool Alpha**, followed by broader Scenario completion polish and player-facing progression presentation.
