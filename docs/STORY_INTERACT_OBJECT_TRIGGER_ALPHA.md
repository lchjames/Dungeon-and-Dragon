# Runtime Object + `interact_object` Story Trigger — Alpha

> Status: **Implemented Alpha Runtime Contract**  
> Updated: 2026-09-05  
> Parents: `docs/WORLD_MAP_STORY_RUNTIME_ALPHA.md`, `docs/STORY_FLAG_CHANGED_TRIGGER_ALPHA.md`

## Purpose

`interact_object` turns a Player Character's explicit interaction with a structured Map Object into a server-authoritative Story lifecycle occurrence.

The Alpha contract deliberately separates four concepts:

```text
Map Object Definition
→ Runtime Object snapshot
→ Object Interaction audit
→ interact_object Story occurrence
```

A reusable Map Object Definition is authoring data. A Runtime Object is per-Scene-Run mutable state. An interaction is a Character Action. Story processing happens only after the interaction audit commits.

## Authoring contract

Canonical trigger shape:

```json
{
  "triggerType": "interact_object",
  "trigger": {
    "sourceObjectId": "object_..."
  }
}
```

`sourceObjectId` is the stable `map_objects.id` Definition identity. Story Events must not target a per-run `runtime_map_objects.id`.

The trigger normalizer strips unrelated fields and requires a non-empty `sourceObjectId`.

## Map Object Definition

Canonical Definition table:

```text
map_objects
```

Alpha Definition fields include:

```text
id                         stable sourceObjectId
map_template_id
name
x / y
object_type
player_visible_default
interactable_default
interaction_range          0 or 1
single_use
initial_state_key
gm_notes
created_by_user_id
created_at / updated_at
```

Object edits increment the Map Template version. An Object may only be placed within Map bounds and not on a blocked template Cell.

## Runtime snapshot

Canonical Runtime table:

```text
runtime_map_objects
```

When a new `runtime_map_instances` row is inserted, the database snapshots every current `map_objects` row for that Map Template into the new Runtime Map.

Important fields:

```text
id                         per-run Runtime Object id
map_instance_id
source_object_id            stable Definition id
name_snapshot
x / y
object_type
player_visible
interactable
interaction_range
single_use
state_key
interaction_count
last_interacted_at
```

Definition changes after Scene Run creation do not rewrite existing Runtime Objects. A later Scene Run receives a fresh snapshot.

## Interaction is a Character Action

Object interaction is a normal Character Action under the locked Alpha turn rules.

Exploration:

```text
Character must own the current Action
Action available = 1
turn not completed
no active Combat
```

Combat:

```text
Character must be the active Combatant
Action available = 1
controller User must match
```

A successful interaction consumes that Action. It does not consume the Character's Move.

A Resting Character cannot perform Object Interaction because Rest blocks normal Character Action / Move.

## Visibility and reach

Player interaction requires:

```text
Runtime Map = active
Runtime Object player_visible = true
Runtime Object interactable = true
Character = active + alive + not action-locked
Character not resting
Object within interaction_range
```

Alpha `interaction_range` is limited to:

```text
0 = same Cell only
1 = same or adjacent Cell
```

Blocking Map edges matter. A closed/locked Door or blocking Wall prevents orthogonal reach. Diagonal reach requires at least one valid two-leg orthogonal route around the corner, matching the Map movement corner principle rather than allowing interaction through a fully blocked diagonal.

## Authoritative interaction boundary

Canonical audit table:

```text
runtime_object_interaction_log
```

The successful audit insert is the authoritative fact that an interaction occurred.

It preserves:

```text
id
scene_run_id
map_instance_id
runtime_object_id
source_object_id
character_id
actor_user_id
interaction_mode
exploration_round_number OR combat_id / combat_round_number
from_state_key
to_state_key
object_interaction_count_before
created_at
```

The database then applies the related state mutations from the committed interaction audit:

```text
interaction audit
→ consume Action
→ increment Runtime Object interaction_count
→ set last_interacted_at
→ apply single-use state if applicable
→ optional Runtime Object state audit
→ durable interact_object Story occurrence
```

This prevents an accepted interaction from existing without a durable audit identity.

## Single-use Objects

For `single_use = true`, the first accepted interaction performs:

```text
state_key: <current> → used
interactable: true → false
interaction_count: +1
```

A later request cannot create another successful interaction while `interactable = false` unless GM Runtime authority explicitly corrects the Object.

Repeatable Objects keep their current `state_key` and remain interactable while still incrementing `interaction_count`.

## Runtime Object state audit

Canonical state audit:

```text
runtime_object_state_log
```

State-changing interactions produce:

```text
change_reason = interaction
interaction_id = exact runtime_object_interaction_log.id
```

GM Runtime correction may change `state_key`, `player_visible`, or `interactable`. A GM state-key change records:

```text
change_reason = gm_override
```

GM correction does not impersonate a Player interaction and does not emit `interact_object`.

## Durable Story occurrence

A successful interaction audit creates:

```text
runtime_story_lifecycle_occurrences.trigger_type = interact_object
subject_type = object_interaction
subject_id = runtime_object_interaction_log.id
actor_user_id = actual interacting User
source_at = interaction created_at
```

The dispatcher resolves the exact interaction audit and verifies that it belongs to an active Scene Run / Runtime Map before Story Event evaluation.

Story Event selection retains the historical cutoff:

```text
story_events.created_at <= occurrence.source_at
```

An Event authored after an old interaction cannot retroactively fire for that interaction.

## Story result metadata

An `interact_object` dispatch result exposes:

```text
objectInteractionId
sourceObjectId
runtimeObjectId
objectName
objectType
objectStateBefore
objectStateAfter
characterId
interactionMode
occurrenceId
```

Response grouping includes:

```text
storyLifecycleEvents
interactObjectStoryEvents
```

Downstream durable cascades retain their normal groups, including `flagChangedStoryEvents`, `encounterActivatedStoryEvents`, `combatStartedStoryEvents`, `combatEndedStoryEvents`, and `encounterResolvedStoryEvents`.

## Story cascade

The Object dispatcher uses the same approved Story effect vocabulary as the existing Runtime Story system:

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

Example:

```text
Player interacts with terminal
→ interact_object(terminal)
→ set_flag power.restored = true
→ flag_changed(power.restored)
→ open_door
→ activate_encounter
→ encounter_activated
→ start_combat
→ combat_started
```

The Object lifecycle adapter writes to the same durable occurrence / dispatch / execution tables and then drains the existing generic Runtime Story lifecycle for downstream flags, Encounters, and Combat work.

## Idempotency and leases

The exact interaction audit row is the durable subject. The occurrence is unique for:

```text
scene_run_id + interact_object + interaction audit id
```

`runtime_story_lifecycle_dispatches` prevents one authored Story Event from executing twice for the same interaction occurrence.

Object lifecycle processing uses the same five-minute stale lease recovery pattern and a maximum of 50 Object interaction occurrences per drain. Downstream generic lifecycle retains its own 50-occurrence safety limit.

## Definition / Runtime isolation

Runtime interaction must never perform:

```text
UPDATE map_objects SET runtime state = ...
DELETE / rewrite a Map Object Definition because of play
change Map Template coordinates because a Runtime Object was used
```

Expected single-use result:

```text
Map Object Definition:
  initial_state_key = ready
  interactable_default = true
  unchanged

Runtime Object:
  state_key = used
  interactable = false
  interaction_count = 1
```

A new Scene Run snapshots the unchanged Definition and starts fresh.

## API surface

GM Definition authoring:

```text
GET    /api/gm/world/maps/:mapId/objects
POST   /api/gm/world/maps/:mapId/objects
PATCH  /api/gm/world/maps/:mapId/objects/:objectId
DELETE /api/gm/world/maps/:mapId/objects/:objectId
```

Player Runtime:

```text
GET  /api/player/world/characters/:characterId/objects
POST /api/player/world/characters/:characterId/objects/:runtimeObjectId/interact
```

GM Runtime correction:

```text
GET   /api/gm/world/runtime/maps/:mapId/objects
PATCH /api/gm/world/runtime/maps/:mapId/objects/:runtimeObjectId
```

## UI

GM World / Maps gains an Object authoring surface exposing each stable `sourceObjectId` for Story authoring.

Player Current World gains:

```text
visible Runtime Object list
Map-cell Object marker
current Object state
Interact button
blocked reason when interaction is unavailable
```

The button follows server authority; disabled UI is convenience only and never replaces server validation.

## Production verification

Operator-only runner:

```text
scripts/production-alpha-story-interact-object-e2e.mjs
```

It remains plan-only unless:

```text
DND_ALPHA_EXECUTE=1
DND_ALPHA_GM_PASSWORD=<operator credential>
```

The live path creates a Player Character, Scenario / Scene, reusable Map Object, `interact_object` Story Event, Runtime snapshot, and Player position. It verifies:

```text
Definition Object → Runtime Object snapshot
Player interaction consumes Action
single-use Runtime Object becomes used + non-interactable
interaction audit produces durable Story result
Story flag / narrative persist
second interaction is rejected
Definition Object remains unchanged
```

Cleanup closes the Runtime and archives the Scenario.

## Current checkpoint

The Story interaction surface now covers:

```text
scene_run_start
enter_zone
manual
interact_object
encounter_activated
combat_started
combat_ended
encounter_resolved
flag_changed
```

The next useful Story-runtime work is no longer another missing trigger name. It is richer Object-state mechanics / object conditions and Scene completion / transition policy, followed by consolidation of older direct Story processors where that improves maintainability without changing Canonical behaviour.
