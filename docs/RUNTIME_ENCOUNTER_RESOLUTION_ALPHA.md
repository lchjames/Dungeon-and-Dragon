# Runtime Encounter Resolution + `encounter_resolved` — Alpha

> Status: **Implemented Alpha Runtime Contract**  
> Updated: 2026-09-05  
> Parents: `docs/RUNTIME_ENCOUNTER_STATE_ALPHA.md`, `docs/RUNTIME_ENCOUNTER_SPAWN_COMBAT_ALPHA.md`  
> Durable Story Canonical: `docs/STORY_ENCOUNTER_RESOLVED_TRIGGER_ALPHA.md`  
> Flag Cascade Canonical: `docs/STORY_FLAG_CHANGED_TRIGGER_ALPHA.md`

## Purpose

This slice closes the Runtime Encounter lifecycle after same-Map Combat while preserving a strict separation between Combat state, Encounter state, and Story lifecycle state.

The canonical rule remains:

```text
Combat End != Encounter Resolved
```

Ending Combat only ends the Combat record. A Runtime Encounter changes from `active` to `resolved` through the dedicated Runtime Encounter resolution authority.

Reusable Encounter Definition state remains authoring data and is never rewritten by Runtime resolution.

## Runtime lifecycle

```text
planned
  ↓ activate_encounter
active
  ↓ runtime spawn / same-Map Combat
active + linked Combat
  ↓ Combat ends
active + ended Combat
  ↓ resolution authority
resolved
  ↓ durable encounter_resolved occurrence
  ↓ generic Runtime Story lifecycle dispatcher
post-Encounter Scene continuation
```

`skipped` remains a separate terminal Runtime status and is not converted to `resolved` by this slice.

## Automatic resolution after Combat

After a GM successfully ends a Combat linked through `runtime_encounter_combats`, the Runtime resolution gateway checks the Runtime Encounter roster.

Hostile participants are:

```text
monster_instance
boss_instance
```

Terminal hostile statuses are:

```text
defeated
removed
```

Automatic resolution requires:

```text
Runtime Encounter = active
linked Combat = ended
at least one Runtime hostile participant exists
all Runtime hostiles = defeated or removed
```

A Runtime Encounter with **zero hostile participants does not auto-resolve** from Combat End. This prevents a social, puzzle, or non-hostile Encounter from being completed merely because a Combat happened to end.

The locked Combat-driven ordering is:

```text
Combat End commit
→ durable combat_ended Story drain
→ hostile readiness check
→ Runtime Encounter active → resolved commit
→ runtime_encounter_resolution_log
→ durable encounter_resolved occurrence
→ generic Story lifecycle drain
```

This ordering is intentional. During `combat_ended`, the linked Encounter may still be `active`; during `encounter_resolved`, the same Encounter is already committed as `resolved`.

## Active hostiles block automatic resolution

Example:

```text
Character + Monster Combat
→ GM ends Combat while Monster is still active
→ Combat status = ended
→ Runtime Encounter remains active
→ readiness blocker = hostile_active
```

The Combat End response reports:

```text
resolved = false
changed = false
reason = HOSTILES_REMAIN
```

The already-committed Combat End is not rolled back.

## Manual GM resolution

GM route:

```text
POST /api/gm/world/runtime/maps/:mapId/encounters/:encounterId/resolve
```

Manual resolution exists for valid non-lethal or scripted outcomes, including surrender, negotiation, hostile retreat, objective completion, scripted transitions, and other GM-adjudicated conclusions.

Manual resolution requirements:

```text
Runtime Map = active
Runtime Encounter = active
linked Combat, if any, must not be active
```

Manual resolution intentionally does **not** require all hostile instances to be defeated/removed.

It also does **not** end an active Combat automatically. The GM must explicitly end the Combat first.

Manual resolution uses the same durable lifecycle path:

```text
GM resolution authority
→ Encounter resolved + audit commit
→ durable encounter_resolved occurrence
→ generic Runtime Story lifecycle dispatcher
```

There is no separate authoritative manual-only `encounter_resolved` executor.

## Resolution readiness

GM Runtime Map detail enriches every Runtime Encounter with:

```json
{
  "resolution": {
    "readiness": {
      "hostileCount": 2,
      "terminalHostileCount": 1,
      "blockerCount": 1,
      "cleared": false,
      "hostiles": [],
      "blockers": []
    },
    "latest": null
  }
}
```

`cleared` is true only when:

```text
hostileCount > 0
AND blockerCount = 0
```

Readiness is factual Runtime state. A manually resolved Encounter may still show surviving hostile blockers because narrative resolution does not rewrite a living hostile into a fake defeated state.

## Resolution authority and audit

Canonical base schema:

```text
schema/0020_runtime_encounter_resolution.sql
```

Durable Story trigger migration:

```text
schema/0025_story_encounter_resolved_trigger.sql
```

Runtime audit table:

```text
runtime_encounter_resolution_log
```

Important fields:

```text
id
scene_run_id
encounter_id
from_status
to_status = resolved
resolution_source
combat_id
resolved_by_user_id
detail_json
created_at
```

Approved sources:

```text
combat_hostiles_cleared
gm_manual
```

The current Alpha resolver requires the actual resolving GM/Admin actor. For Combat-driven auto-resolution, the resolver prefers the identity preserved by `runtime_combat_end_audit`, so the Story actor is the actual Combat ender rather than the Combat creator or another inferred identity.

The first successful `active → resolved` transition and its resolution audit are committed together in one D1 batch. An SQLite `AFTER INSERT ON runtime_encounter_resolution_log` trigger then materialises the durable Story occurrence inside the same database transaction boundary.

## Durable `encounter_resolved` Story trigger

Canonical authoring shape:

```json
{
  "triggerType": "encounter_resolved",
  "trigger": {
    "encounterId": "encounter_..."
  }
}
```

The authored target is the stable Encounter Definition ID. The Runtime occurrence is anchored to the exact resolution audit row:

```text
trigger_type = encounter_resolved
subject_type = encounter_resolution
subject_id = runtime_encounter_resolution_log.id
actor_user_id = resolved_by_user_id
source_at = resolution audit created_at
```

Before Event evaluation, the generic lifecycle dispatcher verifies that the exact resolution audit exists and that the Runtime Encounter currently has:

```text
status = resolved
```

A new Story Event authored after the historical resolution does not retroactively fire because the generic dispatcher preserves:

```text
story_event.created_at <= occurrence.source_at
```

See `docs/STORY_ENCOUNTER_RESOLVED_TRIGGER_ALPHA.md` for the complete durable trigger, lease, dispatch, idempotency, cascade, and failure contract.

## Approved continuation effects

The durable trigger reuses the generic approved Story effect authority, including:

```text
show_narrative
set_flag
reveal_zone
open_door / close_door
activate_encounter
spawn_monster
spawn_boss
start_combat
```

A successful `set_flag` that genuinely changes a Runtime Story flag can now continue through the durable `flag_changed` lifecycle defined in `docs/STORY_FLAG_CHANGED_TRIGGER_ALPHA.md`; rewriting the same scalar value is intentionally lifecycle-silent.

Therefore valid continuations include:

```text
Encounter A resolved
→ encounter_resolved Event
→ open exit Door
→ activate Encounter B
→ spawn hostile
→ start Encounter B Combat
```

and:

```text
Encounter A resolved
→ set_flag quest.stage = 2
→ flag_changed(quest.stage)
→ another approved Story Event
```

Effects execute through server-internal Runtime services. Arbitrary JavaScript, arbitrary SQL, and privileged browser-route impersonation are not allowed.

## Idempotency and retry

Durable lifecycle execution uses:

```text
runtime_story_lifecycle_occurrences
runtime_story_lifecycle_dispatches
runtime_story_event_executions
```

The occurrence is unique to its Scene Run, trigger type, and exact resolution audit subject. Dispatch rows prevent the same authored Event from being executed twice for one occurrence. The shared lifecycle lease can be reclaimed after the standard stale timeout, and the shared 50-occurrence cascade limit prevents unbounded Story loops.

The former `src/encounter-resolved-story.js` module remains legacy source/reference compatibility only. Production Runtime Encounter resolution no longer calls it as a second inline executor, preventing duplicate `encounter_resolved` execution.

## Commit boundary and warnings

Authoritative gameplay state always commits before secondary Story processing.

Combat-driven path:

```text
Combat End commits
→ combat_ended Story drain
→ optional Runtime Encounter resolution commits
→ encounter_resolved Story drain
```

Manual path:

```text
Runtime Encounter resolution commits
→ encounter_resolved Story drain
```

If Story lifecycle processing fails after a valid resolution:

```text
Encounter remains resolved
resolution audit remains durable
Story occurrence remains retryable unless already completed
warning metadata may be attached
resolution is not rolled back
```

Current warning surfaces include:

```text
runtimeEncounterResolutionWarning
storyTriggerWarning                 (compatibility)
storyLifecycleWarning
encounterResolvedStoryWarning
```

Response grouping includes:

```text
storyLifecycleEvents
encounterResolvedStoryEvents
```

`storyEventsTriggered` remains a compatibility alias for the durable `encounterResolvedStoryEvents` result on the Encounter resolution response. It is not a second execution path.

## GM GUI

The World Map Runtime Encounter workspace includes a dedicated Runtime Encounter Resolution panel showing:

```text
Runtime Encounter status
linked Combat status
hostile readiness
active/non-terminal blockers
latest resolution audit
```

Action:

```text
Resolve Encounter
```

The button is disabled while the linked Combat is active or when the Encounter is no longer active.

## Definition / Runtime isolation

Runtime resolution must never perform:

```text
UPDATE encounters SET status = ...
INSERT INTO encounter_combats
DELETE / rewrite Definition encounter_participants
```

Expected after a completed Runtime Encounter:

```text
Encounter Definition status = planned        (unchanged)
Definition participant roster = authoring roster
Definition combat link = null                (unchanged)

Runtime Encounter status = resolved
Runtime Combat status = ended
Runtime resolution audit = present
Runtime encounter_resolved occurrence = durable
```

A later Scene Run receives a fresh Runtime snapshot from the reusable Definition.

## Production-writing verification

Operator-only runner:

```text
scripts/production-alpha-runtime-resolution-e2e.mjs
```

It remains plan-only unless:

```text
DND_ALPHA_EXECUTE=1
DND_ALPHA_GM_PASSWORD=<operator credential>
```

The auto path creates a Runtime Monster, starts same-Map Combat, defeats the Monster, ends Combat, verifies automatic Runtime Encounter resolution, and requires the authored `encounter_resolved` Event to be returned/applied with its Story flag and narrative persisted.

Because `storyEventsTriggered` is now only the compatibility alias produced from `encounterResolvedStoryEvents`, that existing live assertion exercises the durable dispatcher rather than the removed inline executor.

The manual path keeps an active hostile, verifies Combat End does not resolve the Encounter, then verifies GM manual resolution with `source = gm_manual`.

Both paths finish with Definition status, participant roster, and legacy Combat-link isolation checks.

## Current checkpoint

With durable `flag_changed` integrated, the primary Story lifecycle chain now includes:

```text
scene_run_start
→ enter_zone / manual Story entry
→ encounter_activated
→ combat_started
→ combat_ended
→ encounter_resolved
→ flag_changed cascades from genuine set_flag mutations
```

The remaining approved automatic trigger that needs a new Runtime authority model is `interact_object`. It should be implemented together with Runtime Object identity, interaction permission and object-state mechanics rather than as a trigger-only shell. Later work also includes Scene completion/transition policy and richer object-state mechanics.
