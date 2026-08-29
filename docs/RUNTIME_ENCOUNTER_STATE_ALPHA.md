# Runtime Encounter State — Alpha

> Status: **Implemented Alpha Runtime Contract**  
> Date: 2026-08-29  
> Parent Canonical: `docs/WORLD_MAP_STORY_RUNTIME_ALPHA.md` and `docs/SCENARIO_SCENE_ENCOUNTER_MVP.md`

---

## 1. Purpose

`encounters` remains authored Scenario / Scene definition data. A playthrough must not change the reusable Encounter Definition merely because one Scene Run activates, populates, fights, or resolves that Encounter.

Canonical separation:

```text
Encounter Definition
        ↓ one-time snapshot
Scene Run
        ↓
Runtime Encounter State
        ├─ Runtime Participants
        └─ Runtime Combat Link
```

Two Scene Runs using the same Encounter Definition must be able to diverge without sharing runtime progress, Monster HP, Boss state, participants added during play, or Combat links.

---

## 2. Runtime storage

Durable schemas:

```text
schema/0017_runtime_encounter_state.sql
schema/0018_runtime_encounter_participants_combat.sql
```

Runtime tables:

```text
runtime_encounter_states
runtime_encounter_snapshot_meta
runtime_encounter_participants
runtime_encounter_combats
```

Core identity rules:

```text
runtime_encounter_states:
  UNIQUE (scene_run_id, encounter_id)

runtime_encounter_participants:
  UNIQUE (scene_run_id, encounter_id, entity_type, entity_id)

runtime_encounter_combats:
  PRIMARY KEY (scene_run_id, encounter_id)
  combat_id UNIQUE
```

Participant and Combat rows also carry a composite FK back to the exact Runtime Encounter:

```text
(scene_run_id, encounter_id)
→ runtime_encounter_states(scene_run_id, encounter_id)
```

This prevents cross-Run or wrong-Encounter links even if a future caller contains an application-layer bug.

---

## 3. Snapshot boundary

For a newly created Scene Runtime, Encounter state and definition Character participants are materialised immediately after the authoritative Scene Run / Runtime Map creation succeeds.

The first successful materialisation writes:

```text
runtime_encounter_snapshot_meta(scene_run_id, scene_id, materialized_at)
```

After that marker exists, Definition changes are **not** imported into that Scene Run again.

Therefore:

```text
GM starts Scene Run A
→ Encounter + Character roster snapshot freezes

GM later edits Encounter Definition
→ Run A is unchanged
→ future Run B receives the new definition snapshot
```

Existing long-lived Runtime Maps created before the marker existed are supported through a one-time lazy compatibility materialisation. The first compatible read freezes whatever definition state is available at that moment, writes the marker, and future reads stop importing Definition changes.

A failure in the secondary snapshot step must not make an already-committed Scene Runtime appear uncreated to the GM. The response may carry a runtime Encounter warning and a later Runtime read can safely perform the one-time recovery.

---

## 4. Participant authority

Definition-level `encounter_participants` remains authoring / compatibility data.

For a new Scene Run, only **Character** definition participants are copied into `runtime_encounter_participants`:

```text
Definition Character participant
→ source_kind = definition_character
→ Runtime Character participant
```

Definition-level `monster_instance` and `boss_instance` participants are deliberately **not copied across Runs**.

Reason:

```text
Monster/Boss instance = mutable runtime entity
HP / MP / defeated state / temporary effects can change
```

Copying the same instance ID into another playthrough would reintroduce the exact replay contamination that Runtime Encounter state is intended to remove.

Future Runtime Monster/Boss creation therefore follows:

```text
Story / GM Runtime spawn
→ create a fresh Monster/Boss instance for this Run
→ addRuntimeEncounterParticipant(... source_kind = runtime_spawn)
→ place the entity on this Runtime Map
```

Supported Runtime participant source kinds:

```text
definition_character
runtime_spawn
runtime_manual
```

The helper rejects a Monster/Boss pretending to be `definition_character`, and rejects a Character pretending to be `runtime_spawn`.

---

## 5. Combat-link authority

Definition-level `encounter_combats` remains legacy compatibility infrastructure and is not the runtime authority for Scene Runs.

Runtime Combat links belong to:

```text
runtime_encounter_combats
```

A Runtime Encounter Combat link records:

```text
Scene Run ID
Encounter Definition ID
Runtime Map Instance ID
Combat ID
linking User ID
linked timestamp
```

Server helper `linkRuntimeEncounterCombat(...)` enforces:

```text
Runtime Encounter exists in this Scene Run
Runtime Encounter status = active
Runtime Map belongs to the same Scene Run + Scene
Runtime Map status = active
Combat exists
Runtime Encounter has no different Combat already linked
```

Linking the same Combat again is idempotent. Linking a second different Combat is rejected.

Most importantly:

```text
Runtime Combat linking MUST NOT INSERT into encounter_combats
Runtime Combat linking MUST NOT UPDATE encounters.status
```

The actual Runtime-native Combat-start resolver is the next integration slice; this foundation establishes the storage and authority it must use.

---

## 6. Status authority

Current Runtime Encounter vocabulary:

```text
planned
active
resolved
skipped
```

Story-driven activation currently implements:

```text
planned → active
```

An already-active Runtime Encounter is idempotent for `activate_encounter`.

`resolved` and `skipped` are terminal for activation and are rejected rather than silently reopened.

`encounters.status` remains definition-level compatibility/authoring data. Runtime progress belongs to `runtime_encounter_states.status`.

---

## 7. Story Event integration

Approved condition:

```json
{
  "type": "encounter_status",
  "encounterId": "encounter_...",
  "status": "planned"
}
```

Approved effect:

```json
{
  "type": "activate_encounter",
  "encounterId": "encounter_..."
}
```

Both manual GM Story Events and automatic `enter_zone` Story Events use the same Runtime Encounter helper and condition state.

A successful activation records the activating Story Event/User provenance on the Runtime Encounter row and the normal Story Event execution audit records the applied effect.

---

## 8. GM Runtime payload

GM Runtime Map detail exposes:

```text
runtimeEncounters[]
```

Each Runtime Encounter now includes:

```text
encounterId
name
status
definitionStatusSnapshot
snapshotMaterializedAt
participants[]
combat
activation provenance / timestamps
```

`participants[]` is the authoritative per-Run roster. `combat` is the authoritative per-Run Combat link when one exists.

Players do not automatically receive GM Encounter runtime metadata merely because it exists. Player-facing narrative remains controlled through approved Story effects such as `show_narrative`.

---

## 9. Definition/runtime invariants

Two Scene Runs can safely diverge:

```text
Encounter Definition: ER Ambush
Definition Characters: Alice, Bob

Scene Run A:
  Runtime Encounter = active
  Runtime participants = Alice, Bob, Monster A1
  Runtime Combat = combat_A

Scene Run B:
  Runtime Encounter = planned
  Runtime participants = Alice, Bob
  Runtime Combat = null
```

Changing Run A must not activate Run B, add Monster A1 to Run B, link `combat_A` to Run B, or rewrite the reusable Encounter Definition.

A later Definition edit also does not mutate an already-materialised Run A or Run B snapshot.

---

## 10. Explicitly not completed by this slice

This slice provides Runtime participant and Combat-link authorities, but does not yet switch the legacy start/spawn routes over to them.

Still next:

```text
Runtime-native Monster spawn resolver
Runtime-native Boss spawn resolver
spawn at Runtime Map Spawn Point
add spawned entity to runtime_encounter_participants
place spawned entity in runtime_entity_positions
Runtime-native Encounter → Combat start resolver
Combat start using Runtime Encounter participants
write runtime_encounter_combats
Combat on the same Runtime Map / existing positions
Runtime Encounter resolution
encounter_activated / encounter_resolved trigger propagation
```

Legacy `encounter_participants` / `encounter_combats` and `/api/gm/encounters/:id/start-combat` remain compatibility paths until the Runtime-native resolver replaces their playthrough authority.

---

## 11. Next playable target

```text
Player enters hidden trigger Zone
→ Story Event fires
→ Runtime Encounter activates
→ fresh Monster/Boss instance spawns at Runtime Spawn Point
→ fresh instance joins Runtime Encounter participants
→ entity receives Runtime Map position
→ Runtime Encounter starts Combat
→ runtime_encounter_combats links that Combat to this Run + Map
→ Combat preserves same Map positions
→ Encounter resolves in this Scene Run only
→ Scene continues
```

That is the next Canonical integration slice after this participant / Combat-link foundation.
