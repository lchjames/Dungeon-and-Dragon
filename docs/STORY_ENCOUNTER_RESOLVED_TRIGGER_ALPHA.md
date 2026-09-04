# Story `encounter_resolved` Trigger — Alpha Canonical

## Status

This document defines the Alpha runtime contract for automatic Story Events triggered when a Runtime Encounter is authoritatively resolved.

The canonical Combat-driven ordering is:

**Combat commit → `combat_ended` Story → Encounter auto-resolution commit → `encounter_resolved` Story**

Manual GM resolution enters at the Encounter resolution step and then uses the same durable Story lifecycle path.

---

## 1. Authoring contract

An `encounter_resolved` Story Event targets an Encounter Definition by stable Encounter ID:

```json
{
  "triggerType": "encounter_resolved",
  "trigger": {
    "encounterId": "encounter_..."
  }
}
```

Only `encounterId` is canonicalized for this trigger. Extra authored trigger fields are discarded by the Story rule normalizer.

The authored target remains the stable Encounter Definition ID. Runtime dispatch is anchored to the exact resolution audit row that caused the lifecycle occurrence.

---

## 2. Resolution authority

The authoritative Runtime Encounter resolver owns both state and audit.

A successful first resolution performs one D1 batch containing:

1. `runtime_encounter_states.status: active → resolved`, including `resolved_at`;
2. one `runtime_encounter_resolution_log` row describing the exact transition, source, linked Combat when applicable, and actual resolving User.

The resolver requires an actual actor identity. In the current Alpha the actor is:

- the GM/Admin who manually resolves the Encounter; or
- for Combat-driven auto-resolution, the GM/Admin recorded as the actual Combat ender.

The Story system must not replace that identity with the Combat creator, Encounter creator, Scenario creator, or a browser-supplied synthetic identity.

---

## 3. Durable occurrence materialization

An SQLite `AFTER INSERT ON runtime_encounter_resolution_log` trigger materializes the durable Story lifecycle occurrence.

Therefore the Encounter state transition, resolution audit row, and Story occurrence share the same authoritative database mutation boundary.

The occurrence stores:

```text
trigger_type  = encounter_resolved
subject_type  = encounter_resolution
subject_id    = exact runtime_encounter_resolution_log.id
source_at     = resolution_log.created_at
actor_user_id = resolution_log.resolved_by_user_id
```

The exact resolution audit row is the Runtime subject. The dispatcher resolves the stable authored `encounterId` from that audit row.

A later HTTP callback must not synthesize a second `encounter_resolved` occurrence.

---

## 4. Dispatcher validation

Before evaluating authored Story Events, the generic Runtime lifecycle dispatcher must verify all of the following:

```text
occurrence.subject_type = encounter_resolution
resolution audit row exists in the same Scene Run
resolution audit to_status = resolved
Runtime Encounter exists
Runtime Encounter current status = resolved
```

If these invariants do not hold, the occurrence is invalid and must not be treated as a successful `encounter_resolved` trigger.

At Condition evaluation time, an `encounter_status` Condition targeting the resolved Encounter therefore observes:

```text
status = resolved
```

This is deliberately different from `combat_ended`, which runs before automatic Encounter resolution and can observe the Encounter as `active`.

---

## 5. Combat-driven ordering

For a Runtime Encounter Combat that ends normally, the locked Alpha ordering is:

```text
Combat End commits
→ durable combat_ended occurrence
→ drain combat_ended Story
→ evaluate hostile-clear readiness
→ Runtime Encounter active → resolved commits
→ resolution audit + durable encounter_resolved occurrence
→ drain encounter_resolved Story
→ drain any downstream lifecycle occurrences caused by approved Effects
```

This ordering creates two distinct authoring moments:

- `combat_ended`: Combat has ended; Encounter may still be active.
- `encounter_resolved`: Encounter resolution has committed and is visible as resolved.

They must not be collapsed into one trigger.

---

## 6. Manual resolution ordering

Manual GM resolution uses the same resolver and durable lifecycle mechanism:

```text
GM resolves active Runtime Encounter
→ Encounter resolution commit + audit
→ durable encounter_resolved occurrence
→ generic lifecycle drain
```

There is no separate manual-only Story Event executor.

The previous inline `processEncounterResolvedStoryEvents(...)` path is legacy implementation history and is not part of the authoritative Alpha dispatch path once this durable trigger is active.

---

## 7. Approved Effects

`encounter_resolved` uses the same approved structured Story Effect vocabulary as the generic Runtime lifecycle dispatcher.

Current approved Effects include:

- `show_narrative`
- `set_flag`
- `reveal_zone`
- `open_door`
- `close_door`
- `activate_encounter`
- `spawn_monster`
- `spawn_boss`
- `start_combat`

Arbitrary JavaScript, arbitrary SQL, browser-side authority, or free-form executable Story code is not permitted.

Effects may create later durable lifecycle occurrences. For example, an `encounter_resolved` Event may activate the next Encounter, which materializes an `encounter_activated` occurrence that is processed by the same cascade drain.

---

## 8. Idempotency and retry

Durability uses the shared tables:

```text
runtime_story_lifecycle_occurrences
runtime_story_lifecycle_dispatches
runtime_story_event_executions
```

The occurrence is unique for its Scene Run, trigger type, and exact resolution audit subject.

The lifecycle dispatcher uses a lease before processing an occurrence. A stale lease may be reclaimed after the shared timeout.

Each Story Event dispatch is unique per occurrence. If processing resumes after a partial failure, Events already represented in `runtime_story_lifecycle_dispatches` are not executed again for that occurrence.

The occurrence is marked complete only after the dispatcher finishes processing eligible authored Events.

A completed occurrence is not replayed by later requests.

---

## 9. Definition-time boundary

The dispatcher only considers Story Events whose definition existed no later than the lifecycle source timestamp:

```text
story_event.created_at <= occurrence.source_at
```

Creating a new `encounter_resolved` Story Event after an Encounter has already resolved must not retroactively fire it for that historical resolution.

---

## 10. Definition isolation

Resolving a Runtime Encounter must not mutate reusable authored Encounter Definitions.

The durable trigger operates on:

```text
Runtime Encounter state
Runtime resolution audit
Runtime Story occurrence
Runtime Story Effects
```

It must not silently update:

```text
encounters.status
encounter_participants
encounter_combats
```

Definition data remains reusable authoring data; Runtime state remains Scene Run-specific gameplay state.

---

## 11. Response compatibility

The generic response vocabulary includes:

```text
storyLifecycleEvents
encounterResolvedStoryEvents
```

For compatibility with the earlier Runtime Encounter resolution response shape, `storyEventsTriggered` may remain as a temporary alias containing the durable `encounterResolvedStoryEvents` results.

That alias does not represent a second execution path.

---

## 12. Failure boundary

Encounter resolution is authoritative gameplay state.

If the resolution commit succeeds but later Story lifecycle processing fails:

```text
Encounter remains resolved
resolution audit remains durable
Story occurrence remains retryable unless already completed
API may return a Story lifecycle warning
resolution is not rolled back
```

A Story Effect failure must not reverse a valid Encounter resolution.

---

## 13. Alpha implementation requirements

This slice is considered implemented only when the production path includes all of the following:

```text
resolution audit → durable occurrence trigger
generic lifecycle trigger support
resolved-state subject validation
lease + dispatch idempotency
manual resolution integration
Combat End → resolution ordering
response grouping
source-level regression contract
production runner coverage / safety gate
Canonical documentation
```

---

## 14. Locked summary

1. `encounter_resolved` targets a stable authored Encounter ID.
2. Runtime occurrence identity is anchored to the exact resolution audit row.
3. Resolution requires the actual resolving GM/Admin identity.
4. Resolution state, audit, and durable occurrence share the authoritative D1 boundary.
5. `encounter_resolved` runs only after Runtime Encounter status is committed as `resolved`.
6. Combat-driven ordering remains `combat_ended` Story before auto-resolution and `encounter_resolved` Story after auto-resolution.
7. Manual resolution uses the same durable dispatcher.
8. The old inline Encounter-resolved Story executor is not an additional authoritative path.
9. Existing lifecycle leases, dispatch idempotency, approved Effects, and cascade limits apply.
10. Resolution remains committed even if later Story processing returns a warning.
