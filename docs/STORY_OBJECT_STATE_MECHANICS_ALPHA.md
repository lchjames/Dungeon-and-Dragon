# Story Object State Mechanics — Alpha

> Status: **Implemented Alpha Runtime Contract**  
> Date: 2026-09-07  
> Parent: `docs/STORY_INTERACT_OBJECT_TRIGGER_ALPHA.md`

## Purpose

Runtime Objects now expose first-class Story state predicates and state mutations without converting Object state into Story flags.

The canonical primitives are:

```text
object_state condition
set_object_state effect
```

Object state remains authoritative in:

```text
runtime_map_objects.state_key
```

and every real state transition remains auditable through the existing canonical table:

```text
runtime_object_state_log
```

No parallel Story-only Object-state table is introduced.

## Stable authoring identity

Story authoring targets the stable Map Object Definition identity:

```text
sourceObjectId = map_objects.id
```

A Story Event never stores a per-run `runtime_map_objects.id` as its authoring target.

At execution time the server resolves the current Scene Run's Runtime Object snapshot with the matching `source_object_id`.

## State-key vocabulary

Object state keys are normalized as:

```text
lowercase
1–80 characters
[a-z0-9._-]
```

Examples:

```text
ready
locked
open
powered
broken
used
puzzle.stage_2
```

State keys are intentionally extensible rather than limited to a fixed door-style enum.

## `object_state` condition

Canonical shape:

```json
{
  "type": "object_state",
  "sourceObjectId": "object_terminal",
  "stateKey": "locked"
}
```

The condition succeeds only when the resolved Runtime Object has exactly that normalized `state_key`.

A missing Object target is a definition/runtime-target error rather than a false condition:

```text
STORY_CONDITION_OBJECT_NOT_FOUND
```

A present Object whose state differs produces the normal condition failure:

```text
object_state_mismatch
```

## `set_object_state` effect

Canonical shape:

```json
{
  "type": "set_object_state",
  "sourceObjectId": "object_terminal",
  "stateKey": "open"
}
```

The effect changes only:

```text
runtime_map_objects.state_key
```

It does **not** implicitly change:

```text
player_visible
interactable
single_use
interaction_count
position
Definition Object defaults
```

Those remain separate Runtime/Definition concerns.

## Same-state writes

A Story effect that requests the already-current state is idempotent:

```text
open → open
```

returns:

```text
unchanged = true
auditId = null
```

and does not manufacture a new `runtime_object_state_log` row.

## Real transition audit

A genuine Story transition such as:

```text
locked → open
```

updates the Runtime Object and writes one canonical state-audit row with:

```text
change_reason = story_effect
changed_by_user_id = actual Runtime actor
story_event_id = executing Story Event
story_effect_index = effect position within that Event
interaction_id = null
```

The existing sources remain distinct:

```text
interaction  → Player Object interaction
GM override  → gm_override
Story effect → story_effect
```

Therefore Object state history remains one ordered authority surface rather than multiple competing logs.

## Schema upgrade

`schema/0028_story_object_state_mechanics.sql` upgrades the existing `runtime_object_state_log` while preserving historical rows.

The Runtime lazy authority guard in `src/runtime-object-state.js` performs the same compatibility upgrade for already-deployed D1 databases because normal Worker deployment does not itself apply repository SQL migration files.

The upgrade:

```text
preserves interaction / gm_override rows
adds story_effect to change_reason
adds nullable story_event_id
adds nullable story_effect_index
recreates the interaction state-log trigger against the canonical table
```

A partially upgraded database with an unresolved legacy table fails closed instead of guessing which audit is authoritative.

## Optimistic concurrency

`set_object_state` is not a blind last-write-wins update.

The effect requires the Runtime Object still to match the state and `updated_at` snapshot that was resolved for the executing Story Event.

If another authority changes the Object first, execution fails with:

```text
STORY_EFFECT_OBJECT_CHANGED
```

This prevents an older Story execution from silently overwriting a newer GM, Player interaction or Story mutation.

## Sequential Event semantics

Each Story executor maintains an in-memory Object-state map for its current execution sequence.

After a successful `set_object_state`, that map is updated immediately. Therefore a later Story Event evaluated in the same server-side sequence can observe the new state.

Example:

```text
Event A condition: chest = locked
Event A effect: set chest = open
Event B condition: chest = open
```

Event B can match after Event A commits.

## `interact_object` occurrence snapshot

A durable Object interaction is anchored to the exact `runtime_object_interaction_log` row.

For the Object that caused an `interact_object` occurrence, `object_state` condition evaluation uses that interaction's committed:

```text
to_state_key
```

rather than blindly substituting a newer stored value if the durable occurrence was delayed in the queue.

Example:

```text
interaction A commits terminal: ready → used
later authority changes terminal: used → reset
older interaction A occurrence drains
```

An Event attached to interaction A with:

```json
{"type":"object_state","sourceObjectId":"object_terminal","stateKey":"used"}
```

still evaluates against interaction A's committed `used` result.

This snapshot rule applies to condition evaluation for the triggering Object only. A subsequent `set_object_state` effect still executes against the latest resolved Runtime Object row with optimistic concurrency, so the historical occurrence cannot overwrite newer state accidentally.

## Supported Story execution sources

Object conditions and Object state effects use the same shared authority helper from all currently approved Story execution paths:

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

The generic durable lifecycle queue continues to cover its existing durable trigger set; this feature does not change which trigger names use that queue.

## Action economy

`set_object_state` is a Story effect, not a Player action.

It does not consume:

```text
Action
Move
Combat turn
Exploration turn
```

A Player-initiated Object interaction continues to consume one Action under `STORY_INTERACT_OBJECT_TRIGGER_ALPHA.md`. If that interaction causes Story Events which then mutate Object state, there is no second Action cost.

## No automatic `object_state_changed` trigger

This Alpha slice deliberately does **not** introduce a new lifecycle trigger named `object_state_changed`.

A state change can influence later approved Story Events through `object_state` conditions, but state mutation itself does not enqueue another durable Story occurrence.

This keeps the lifecycle graph bounded while Object-state authoring matures. A future state-change trigger, if required, should be separately specified with exact audit-row identity and loop controls.

## Definition / Runtime isolation

`set_object_state` may mutate only the current Scene Run's Runtime Object.

It must not rewrite:

```text
map_objects.initial_state_key
Map Template version
Scenario Definition
Scene Definition
Story Event Definition
```

A later Scene Run still snapshots the Definition Object's configured initial state independently.

## GM authoring surface

The Story Events panel exposes Runtime Object references alongside Doors, Zones and Encounters, including:

```text
sourceObjectId
name
current stateKey
interactable status
```

The JSON authoring surface documents both canonical shapes:

```json
{"type":"object_state","sourceObjectId":"object_terminal","stateKey":"locked"}
```

```json
{"type":"set_object_state","sourceObjectId":"object_terminal","stateKey":"open"}
```

## Production-writing verification

Operator-only runner:

```text
scripts/production-alpha-story-object-state-e2e.mjs
```

Plan-only unless:

```text
DND_ALPHA_EXECUTE=1
DND_ALPHA_GM_PASSWORD=<operator credential>
```

The live path verifies:

```text
Definition Object initial state = locked
→ Runtime snapshot = locked
→ manual Event condition object_state(locked)
→ set_object_state(open)
→ canonical story_effect audit
→ Runtime Object = open
→ Definition Object remains locked
→ second Event requiring locked is skipped
→ same-state open → open is audit-silent
```

Cleanup closes the Runtime and archives the Scenario rather than deleting Canonical audit data.

## Current checkpoint

The Story Runtime now has:

```text
stable Runtime Object identity
Player interaction authority
durable interact_object lifecycle
object_state conditions
set_object_state effects
single canonical Object state audit
```

The next major authority slice is **Scene completion / Scene transition policy**: what completes a Scene Run, how a next Scene is selected, what Runtime resources close, and which Story state is allowed to carry forward.
