# Runtime Encounter Resolution + `encounter_resolved` — Alpha

> Status: **Implemented Alpha Runtime Contract**  
> Date: 2026-08-29  
> Parents: `docs/RUNTIME_ENCOUNTER_STATE_ALPHA.md`, `docs/RUNTIME_ENCOUNTER_SPAWN_COMBAT_ALPHA.md`

## Purpose

This slice closes the Runtime Encounter lifecycle after same-Map Combat.

The canonical rule is:

```text
Combat End != Encounter Resolved
```

Ending Combat only ends the Combat record. The Runtime Encounter changes from `active` to `resolved` through the dedicated Runtime Encounter resolution authority.

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
  ↓ encounter_resolved Story Event
post-Encounter Scene continuation
```

`skipped` remains a separate terminal Runtime status and is not converted to `resolved` by this slice.

## Automatic resolution after Combat

After a GM successfully ends a Combat linked through `runtime_encounter_combats`, the top-level Runtime resolution gateway checks the Runtime Encounter roster.

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

Then:

```text
active Runtime Encounter
→ resolved
→ resolved_at snapshot
→ runtime_encounter_resolution_log
→ encounter_resolved Story processing
```

A Runtime Encounter with **zero hostile participants does not auto-resolve** from Combat End. That avoids treating a non-hostile / social / puzzle Encounter as completed merely because a Combat happened to end.

## Active hostiles block automatic resolution

Example:

```text
Character + Monster Combat
→ GM ends Combat while Monster is still active
→ Combat status = ended
→ Runtime Encounter remains active
→ readiness blocker = hostile_active
```

The Combat End response reports the blocked resolution attempt, including:

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

Manual resolution exists for valid non-lethal or scripted outcomes, including:

```text
surrender
negotiation
hostiles flee
GM adjudicated objective completion
scripted transition
other non-kill Encounter conclusion
```

Manual resolution requirements:

```text
Runtime Map = active
Runtime Encounter = active
linked Combat, if any, must not be active
```

Manual resolution intentionally does **not** require all hostile instances to be defeated/removed.

It also does **not** end an active Combat automatically. The GM must explicitly end the Combat first.

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

Readiness is factual Runtime state. A manually resolved Encounter may still show a surviving hostile blocker because manual resolution represents a narrative outcome rather than rewriting the hostile instance into a fake defeated state.

## Resolution audit

Canonical additive schema:

```text
schema/0020_runtime_encounter_resolution.sql
```

Runtime table:

```text
runtime_encounter_resolution_log
```

Important fields:

```text
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

The service also lazily creates the table/indexes for long-lived production D1 compatibility.

## `encounter_resolved` Story trigger

Trigger type already belongs to the approved Story vocabulary. This slice gives it a concrete Runtime executor.

Canonical trigger shape:

```json
{
  "triggerType": "encounter_resolved",
  "trigger": {
    "encounterId": "encounter_..."
  }
}
```

`encounterId` is mandatory and is the stable Encounter Definition ID used to locate the per-Scene-Run Runtime Encounter state.

There is no broadcast / wildcard resolved trigger in Alpha.

Example post-Encounter event:

```json
{
  "triggerType": "encounter_resolved",
  "trigger": {
    "encounterId": "encounter_gate_guard"
  },
  "conditions": [
    {
      "type": "encounter_status",
      "encounterId": "encounter_gate_guard",
      "status": "resolved"
    }
  ],
  "effects": [
    {
      "type": "set_flag",
      "key": "gate.guard.cleared",
      "value": true
    },
    {
      "type": "show_narrative",
      "text": "The corridor falls silent."
    },
    {
      "type": "open_door",
      "sourceEdgeId": "edge_inner_gate"
    }
  ],
  "oncePerSceneRun": true
}
```

The executor reuses the existing approved Story effect authority. It does not execute arbitrary JavaScript or SQL.

## Post-resolution continuation

Because effects execute sequentially, an `encounter_resolved` Event may continue the Scene by using existing approved effects, for example:

```text
show_narrative
set_flag
reveal_zone
open_door / close_door
activate_encounter
spawn_monster
start_combat
```

Therefore a valid chain can be:

```text
Encounter A resolved
→ encounter_resolved Event
→ open exit Door
→ activate Encounter B
→ spawn Monster for Encounter B
→ start Encounter B Combat
```

The new Combat is allowed only because the previous linked Combat has already ended.

## Commit boundary and warnings

Combat End is committed by the existing Combat engine first.

After that:

```text
Combat End commit
→ Runtime Encounter lookup
→ auto-resolution attempt
→ encounter_resolved Story processing
```

If Runtime resolution or Story processing fails after Combat End:

```text
Combat remains ended
HTTP response remains the successful Combat End response
warning metadata is attached
```

Possible warning surfaces include:

```text
runtimeEncounterResolutionWarning
storyTriggerWarning
```

This prevents a post-commit Story failure from falsely telling the GM that Combat End failed.

Manual resolution follows the same principle for Story processing:

```text
Runtime Encounter resolution commits
→ encounter_resolved Story processing
→ Story failure returns warning
→ Encounter remains resolved
```

## GM GUI

World Map Runtime Encounter workspace includes a dedicated:

```text
Runtime Encounter Resolution
```

panel that follows the selected Runtime Map + Encounter.

It displays:

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
```

A later Scene Run receives a fresh Runtime snapshot from the reusable Definition.

## Production-writing verification

Operator-only runner:

```text
scripts/production-alpha-runtime-resolution-e2e.mjs
```

Plan-only unless:

```text
DND_ALPHA_EXECUTE=1
DND_ALPHA_GM_PASSWORD=<operator credential>
```

The runner creates two Runtime Encounters in one Scene Run.

### Auto path

```text
Runtime Encounter A active
→ fresh Runtime Monster
→ same-Map Combat
→ GM HP correction to 0 reconciles Monster = defeated
→ End Combat
→ auto Runtime Encounter resolve
→ encounter_resolved Event
→ Story flag + narrative
```

### Manual path

```text
Runtime Encounter B active
→ fresh Runtime Monster remains active
→ End Combat
→ auto resolution blocked: HOSTILES_REMAIN
→ Encounter remains active
→ GM Resolve Encounter
→ resolved with source = gm_manual
```

The runner then verifies both reusable Encounter Definitions remain `planned`, Character-only and without legacy Combat links.

## Next Canonical slice

With Runtime Encounter lifecycle complete, the next Story/runtime work can focus on:

```text
spawn_boss Story effect with per-Run provenance
interact_object automatic trigger
scene_run_start / combat_started / combat_ended trigger executors
Scene completion / transition policy
```
