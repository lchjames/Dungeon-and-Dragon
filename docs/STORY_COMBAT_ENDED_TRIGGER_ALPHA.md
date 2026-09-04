# Story `combat_ended` Trigger — Alpha Canonical

## Status

This document defines the Alpha runtime contract for automatic Story Events triggered when a Runtime Encounter Combat ends.

The canonical ordering is:

**Combat commit → `combat_ended` Story → Encounter auto-resolution → `encounter_resolved` Story**

This ordering is intentional and is part of the runtime authority model.

---

## 1. Authoring contract

A `combat_ended` Story Event targets an Encounter Definition by stable Encounter ID:

```json
{
  "triggerType": "combat_ended",
  "trigger": {
    "encounterId": "encounter_..."
  }
}
```

Only `encounterId` is canonicalized for this trigger. Extra authored trigger fields are discarded by the Story rule normalizer.

The authoring target remains the stable Encounter Definition ID. The Runtime occurrence itself preserves the exact Combat instance ID that ended.

---

## 2. Authority boundary

`combat_ended` is not synthesized from a later HTTP callback and is not inferred from Encounter resolution.

The authoritative Combat End operation performs one D1 batch containing:

1. `combats.status: active → ended`, including `ended_at`;
2. one `runtime_combat_end_audit` row containing the actual GM/Admin who ended the Combat.

`runtime_combat_end_audit.ended_by_user_id` is the identity of the **actual GM/Admin who ended the Combat**. It must not be replaced with `combats.created_by_user_id`, because the user who started a Combat and the user who ended it can differ.

An SQLite `AFTER INSERT ON runtime_combat_end_audit` trigger materializes the durable Runtime Story lifecycle occurrence. Therefore the Combat state transition, ender audit, and occurrence materialization share one database transaction boundary.

For a Runtime Encounter Combat, the occurrence is stored as:

- `trigger_type = 'combat_ended'`
- `subject_type = 'combat'`
- `subject_id = <exact combat id>`
- `source_at = ended_at`
- `actor_user_id = ended_by_user_id`
- `scene_run_id` resolved from `runtime_encounter_combats`

A legacy/global Combat with no Runtime Encounter link does not create Scene Story lifecycle work.

---

## 3. Runtime dispatch target

When the dispatcher claims a `combat_ended` occurrence, it resolves the Runtime Encounter through:

`runtime_story_lifecycle_occurrences.subject_id`
→ `runtime_encounter_combats.combat_id`
→ `runtime_encounter_combats.encounter_id`.

The dispatcher requires that the linked Combat is already committed as `ended` and has an `ended_at` value. Otherwise the occurrence is invalid and must not be treated as a successful `combat_ended` trigger.

The Story Event matches only when its canonical trigger `encounterId` equals the Encounter linked to that exact Runtime Combat.

---

## 4. Required ordering with Encounter resolution

The Runtime Encounter resolution gateway must preserve this sequence:

1. existing Combat authority commits Combat End;
2. durable Runtime lifecycle queue drains `combat_ended`;
3. automatic Encounter resolution evaluates hostile readiness;
4. if the Runtime Encounter transitions to resolved, `encounter_resolved` Story processing runs;
5. lifecycle queue drains any new downstream lifecycle occurrences caused by Story Effects.

The key semantic boundary is step 2: while `combat_ended` Story Conditions and Effects are evaluated, the Combat is already `ended`, but the **Runtime Encounter is still `active`** unless it was already in another state before the End request.

This allows authoring such as:

```json
{
  "triggerType": "combat_ended",
  "trigger": { "encounterId": "encounter_A" },
  "conditions": [
    { "type": "encounter_status", "encounterId": "encounter_A", "status": "active" }
  ],
  "effects": [
    { "type": "show_narrative", "text": "The fight is over." },
    { "type": "set_flag", "key": "encounter.a.combat-ended", "value": true }
  ]
}
```

If hostile readiness subsequently permits auto-resolution, a separate `encounter_resolved` Story Event may then observe Encounter status `resolved`.

Combat End and Encounter resolution therefore remain distinct lifecycle moments.

---

## 5. Approved Effects

`combat_ended` uses the same approved structured Story Effects as the generic Runtime lifecycle dispatcher. No arbitrary JavaScript or SQL is permitted.

Current approved vocabulary includes:

- `show_narrative`
- `set_flag`
- `reveal_zone`
- `open_door`
- `close_door`
- `activate_encounter`
- `spawn_monster`
- `spawn_boss`
- `start_combat`

Effects execute through the existing shared Runtime services. They must not impersonate GM browser HTTP calls internally.

---

## 6. Durable queue and idempotency

`combat_ended` uses the shared Runtime Story lifecycle tables:

- `runtime_story_lifecycle_occurrences`
- `runtime_story_lifecycle_dispatches`

The occurrence identity is unique per Scene Run, trigger type, and subject ID. The exact Combat ID is the subject ID, so a retry of an already-ended Combat cannot create a second valid End transition or duplicate lifecycle occurrence.

Per-Event dispatch rows are also unique per occurrence/Event pair. Once-per-Scene-Run Story rules remain enforced by the existing Story execution audit.

The dispatcher keeps the existing lease model, occurrence-time authoring cutoff, terminal dispatch de-duplication, and 50-occurrence per-request cascade safety bound.

In practical terms, the path is idempotent at both the Combat authority layer and the Story lifecycle layer.

---

## 7. Failure semantics

The successful Combat End transaction is authoritative.

A later Story lifecycle drain failure must not pretend that the Combat End rolled back. The response may surface Story warning metadata, but the Combat remains ended.

Likewise, an Encounter auto-resolution failure after Combat End and `combat_ended` Story processing must not rewrite the already-committed Combat transition.

This follows the existing Alpha post-commit rule: downstream Story or continuation failure is reported as warning/error metadata without falsifying an earlier committed runtime state change.

---

## 8. Response contract

Runtime lifecycle responses expose the generic and trigger-specific groups:

- `storyLifecycleEvents`
- `encounterActivatedStoryEvents`
- `combatStartedStoryEvents`
- `combatEndedStoryEvents`

For a successful `combat_ended` result, each lifecycle result preserves:

- `triggerType = 'combat_ended'`
- `encounterId`
- exact `combatId`
- `occurrenceId`
- Event execution status and execution ID where applicable.

The Combat End response can additionally contain:

- `runtimeEncounterResolution`
- `storyEventsTriggered` for `encounter_resolved`
- Story lifecycle warning metadata when post-commit processing fails.

---

## 9. Definition isolation

### Definition isolation is mandatory.

Runtime `combat_ended` processing must not mutate reusable Encounter Definition state.

Specifically, this slice must not write:

- `encounters.status`
- legacy `encounter_participants`
- legacy `encounter_combats`

Runtime state continues to live in Runtime-native tables such as:

- `combats`
- `runtime_encounter_combats`
- `runtime_encounter_states`
- `runtime_story_lifecycle_occurrences`
- `runtime_story_lifecycle_dispatches`
- `runtime_combat_end_audit`

Definition data remains authoring input only.

---

## 10. Production-writing proof

The Alpha production runner for this slice must prove at least:

1. create a Player and active Character;
2. create Scenario / Scene / planned Encounter Definition with Character Definition participant;
3. create Runtime Map, activate the Runtime Encounter, spawn a fresh Runtime Monster, and start Runtime Combat;
4. create a `combat_ended` Event scoped to that Encounter with an `encounter_status = active` condition;
5. create an `encounter_resolved` Event scoped to the same Encounter with `encounter_status = resolved`;
6. defeat the Runtime Monster before End Combat;
7. End Combat through the authoritative GM route;
8. prove `combatEndedStoryEvents` contains the applied `combat_ended` Event;
9. prove auto-resolution then transitions the Runtime Encounter to `resolved`;
10. prove `storyEventsTriggered` contains the later `encounter_resolved` Event;
11. prove both Story narratives/flags persist once;
12. prove Encounter Definition status, roster, and legacy Definition Combat remain unchanged;
13. close Runtime and archive the Scenario.

The normal CI path must remain plan-only. Production-writing execution requires the existing operator-only `DND_ALPHA_EXECUTE=1` workflow and GM secret.

---

## 11. Relationship to adjacent lifecycle triggers

Current durable Runtime lifecycle triggers are:

- `encounter_activated`
- `combat_started`
- `combat_ended`

`encounter_resolved` currently remains a resolution-specific post-transition Story executor rather than a durable occurrence in the generic lifecycle queue.

The important semantic distinctions are:

- `combat_started`: Combat has committed active and is linked to the Runtime Encounter;
- `combat_ended`: Combat has committed ended, Encounter has not yet been auto-resolved by this End request;
- `encounter_resolved`: Runtime Encounter has actually transitioned to resolved.

These are separate authoring moments and must not be collapsed into one trigger.
