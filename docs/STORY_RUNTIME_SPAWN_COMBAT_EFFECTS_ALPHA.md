# Story Runtime `spawn_monster` + `start_combat` Effects — Alpha

> Status: **Implemented Alpha Runtime Contract**  
> Date: 2026-08-29  
> Parents: `docs/RUNTIME_ENCOUNTER_STATE_ALPHA.md`, `docs/RUNTIME_ENCOUNTER_SPAWN_COMBAT_ALPHA.md`

## Purpose

This slice connects structured Story Events to the replay-safe Runtime Encounter / Runtime Map authority.

Primary playable flow:

```text
Player moves into hidden trigger Zone
→ enter_zone Story Event
→ activate_encounter
→ spawn_monster
→ start_combat
→ Combat continues on the same Runtime Map
```

No effect may execute arbitrary JavaScript or SQL.

## Approved effects

### `spawn_monster`

```json
{
  "type": "spawn_monster",
  "encounterId": "encounter_...",
  "templateId": "monster_template_...",
  "level": 5,
  "sourceSpawnPointId": "spawn_...",
  "displayName": "Optional display name"
}
```

Authoring references:

- `encounterId` — stable Encounter Definition ID. Runtime state is resolved for the current Scene Run.
- `templateId` — stable Monster Template ID.
- `sourceSpawnPointId` — stable Map Template Spawn Point ID copied into the active Runtime Map.
- `level` — integer 1–100.
- `displayName` — optional snapshot name, max 120 characters.

Execution requirements:

```text
active Runtime Map
matching active Runtime Encounter
active Monster Template
matching enabled Spawn Point
spawn type = monster or any
walkable, unoccupied Runtime Cell
no existing Runtime Encounter Combat for a fresh spawn
```

On success the shared Runtime Encounter service creates the Monster Instance, Monster Skill snapshots, Runtime participant and Runtime Map position.

### `start_combat`

```json
{
  "type": "start_combat",
  "encounterId": "encounter_..."
}
```

Execution requirements:

```text
Runtime Encounter = active
at least one Character participant
all Character / Monster / Boss Runtime participants positioned on the same Runtime Map
all hostile Runtime Instances active and combat-eligible
no unrelated global active Combat
```

On success Combat + Combatants + `runtime_encounter_combats` are created from the Runtime roster.

`start_combat` accepts these already-materialised Runtime participant types:

```text
character
monster_instance
boss_instance
```

Boss initiative uses the Boss Instance `final_dex` snapshot. This means the existing Story `start_combat` effect can start Combat when a GM has already materialised a Runtime Boss into that Encounter.

## Sequential execution

Effects execute in definition order.

Recommended Monster ambush event:

```json
[
  { "type": "activate_encounter", "encounterId": "encounter_..." },
  {
    "type": "spawn_monster",
    "encounterId": "encounter_...",
    "templateId": "monster_template_...",
    "level": 5,
    "sourceSpawnPointId": "spawn_..."
  },
  { "type": "start_combat", "encounterId": "encounter_..." }
]
```

This ordering is significant: a Monster cannot be freshly spawned into an inactive Runtime Encounter, and Combat cannot begin until its Runtime participants have positions.

## Player-triggered authority

Automatic `enter_zone` execution originates from the Player Move request. The Story resolver therefore **must not** call a privileged GM HTTP route.

Canonical server boundary:

```text
Player Move commits
→ server detects entered Runtime Zone
→ Story conditions are evaluated
→ Story resolver directly invokes runtime-encounter-service.js
```

The service accepts the already-authenticated actor user ID and validated Runtime context. It has no GM Cookie dependency and no `/api/gm/...` request dependency.

The existing GM Runtime Encounter routes call the same service after GM authorization, so manual GM controls and automatic Story effects cannot drift into separate gameplay implementations.

## Movement transaction boundary

Player movement remains authoritative even if Story processing later fails.

```text
Move success
→ Story execution starts
→ later Story effect fails
→ Move is NOT rolled back
→ failed Story execution is audited
```

This matches the existing automatic `enter_zone` contract.

## Once-per-Scene-Run spawn idempotency

A partial Event failure can happen after a Monster has already been created. Example:

```text
activate_encounter ✅
spawn_monster ✅
start_combat ❌ because another global Combat exists
```

Without a retry key, a later retry could create a second Monster.

For `oncePerSceneRun = true`, `spawn_monster` records provenance in:

```text
runtime_story_spawn_effects
```

Primary key:

```text
(scene_run_id, story_event_id, effect_index)
```

The effect index is its stable position inside the Event's ordered effect list.

On retry, the resolver returns the previously-created Monster and Runtime position with `unchanged = true` instead of spawning a duplicate. This lookup occurs before the normal "Encounter already has Combat" fresh-spawn guard so a previously successful effect remains replayable after later effects change state.

The provenance table intentionally does not foreign-key `story_event_id`; Runtime/Monster schema creation order must not prevent the general Runtime action service from initializing.

## Repeatable Event semantics

For `oncePerSceneRun = false`, Story spawn provenance is not used.

Each successful activation of `spawn_monster` represents a new requested spawn and therefore creates a fresh Monster, subject to the normal Spawn Point occupancy and Runtime Encounter constraints.

Authors should use distinct Spawn Points or other state-changing effects when a repeatable event is expected to spawn multiple Monsters.

## Combat idempotency

If `start_combat` is retried after the same Runtime Encounter already acquired a Combat link, it returns the linked Combat with `unchanged = true`.

It never creates a second Combat for the same Runtime Encounter.

An unrelated global active Combat still causes:

```text
ACTIVE_COMBAT_EXISTS
```

This Alpha keeps the existing single-global-active-Combat rule.

## Definition / Runtime isolation

Story execution must not perform any of these Definition writes:

```text
INSERT INTO encounter_participants
INSERT INTO encounter_combats
UPDATE encounters SET status = ...
```

Expected after an automatic Monster ambush:

```text
Encounter Definition status = planned        (unchanged)
Definition participant roster = Characters  (unchanged)
Definition combat link = null                (unchanged)

Runtime Encounter status = active
Runtime participant roster = Character + fresh Monster
Runtime Monster has Runtime Map position
Runtime Encounter has Runtime Combat link
```

The same isolation applies when a Runtime Boss is present: the Boss exists only as a fresh per-playthrough Instance in the Runtime roster and Map position, while the reusable Encounter Definition remains unchanged.

## Story execution audit

Applied effect records include enough Runtime identifiers to diagnose execution.

`spawn_monster` result:

```json
{
  "type": "spawn_monster",
  "encounterId": "encounter_...",
  "monsterId": "monster_...",
  "templateId": "monster_template_...",
  "displayName": "Hall Stalker",
  "sourceSpawnPointId": "spawn_...",
  "x": 2,
  "y": 0,
  "unchanged": false
}
```

`start_combat` result:

```json
{
  "type": "start_combat",
  "encounterId": "encounter_...",
  "combatId": "combat_...",
  "mapInstanceId": "runtime_map_...",
  "unchanged": false
}
```

If a later effect fails, the execution audit stores the successfully-applied prefix plus the error code/message.

## Current Boss boundary

Runtime-native Boss creation and same-Map Combat are implemented as a GM Runtime action:

```text
Boss Design Profile
→ fresh Boss Instance snapshot
→ Runtime Encounter participant
→ Runtime Boss/any Spawn Point
→ Runtime Map position
→ start_combat may include Boss
```

`spawn_boss` is **not yet** an approved Story effect. There is no legacy fallback. Adding Story-driven Boss spawn requires an explicit per-Run provenance/idempotency design equivalent in rigor to `spawn_monster`.

## Next slice

The next gameplay closure is:

```text
Runtime Combat ends
→ Runtime Encounter resolution
→ encounter_resolved trigger
→ post-Combat Scene continuation
```

Story `spawn_boss` can then be added with its own provenance contract without blocking Encounter resolution.
