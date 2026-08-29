# Runtime Encounter State — Alpha

> Status: **Implemented Alpha Runtime Contract**  
> Date: 2026-08-29  
> Parent Canonical: `docs/WORLD_MAP_STORY_RUNTIME_ALPHA.md` and `docs/SCENARIO_SCENE_ENCOUNTER_MVP.md`

---

## 1. Purpose

`encounters` remains authored Scenario / Scene definition data. A playthrough must not change the reusable Encounter Definition merely because one Scene Run activates or resolves that Encounter.

Canonical separation:

```text
Encounter Definition
        ↓ snapshotted into
Scene Run
        ↓
Runtime Encounter State
```

This gives separate Scenario / Scene Runs independent Encounter progress.

---

## 2. Runtime storage

Durable schema:

```text
schema/0017_runtime_encounter_state.sql
```

Runtime table:

```text
runtime_encounter_states
```

Identity rule:

```text
UNIQUE (scene_run_id, encounter_id)
```

The row records:

```text
Runtime Encounter ID
Scene Run ID
Encounter Definition ID
Definition status snapshot
Runtime status
optional activating Story Event ID
optional activating User ID
activation timestamp
resolution timestamp
created / updated timestamps
```

The activating Story Event ID is provenance rather than a hard FK. This keeps Scene Runtime creation independent of Story Event schema creation order on a fresh or legacy D1.

---

## 3. Snapshot boundary

For a newly created Scene Runtime, Encounter rows are materialised immediately after the authoritative Scene Run / Runtime Map creation succeeds.

Existing long-lived Runtime Maps are supported through idempotent lazy backfill:

```text
INSERT OR IGNORE
```

The lazy path is compatibility recovery, not the preferred new-Run lifecycle.

A failure in the secondary Encounter snapshot step must not make an already-committed Scene Runtime appear uncreated to the GM. The response may carry a runtime Encounter warning and a later Runtime read can safely backfill the missing rows.

---

## 4. Status authority

Current Runtime Encounter vocabulary:

```text
planned
active
resolved
skipped
```

This slice implements Story-driven activation:

```text
planned → active
```

An already-active Runtime Encounter is idempotent for `activate_encounter`.

`resolved` and `skipped` are terminal for activation and are rejected rather than silently reopened.

Most importantly:

```text
Story Event activation MUST NOT mutate encounters.status
```

`encounters.status` is definition-level compatibility/authoring data. Runtime progress belongs to `runtime_encounter_states.status`.

---

## 5. Story Event integration

Approved condition added:

```json
{
  "type": "encounter_status",
  "encounterId": "encounter_...",
  "status": "planned"
}
```

Approved effect added:

```json
{
  "type": "activate_encounter",
  "encounterId": "encounter_..."
}
```

Both manual GM Story Events and automatic `enter_zone` Story Events use the same Runtime Encounter helper and condition state.

A successful activation records the activating Story Event/User provenance on the Runtime Encounter row and the normal Story Event execution audit records the applied effect.

---

## 6. GM Runtime payload

GM Runtime Map detail now exposes:

```text
runtimeEncounters[]
```

This payload is the authoritative per-run Encounter state for the selected Scene Run.

Players do not automatically receive GM Encounter runtime metadata merely because it exists. Player-facing narrative remains controlled through approved Story effects such as `show_narrative`.

---

## 7. Definition/runtime invariant

Two Scene Runs using the same Scene and Encounter Definition can diverge safely:

```text
Encounter Definition: ER Ambush

Scene Run A:
  Runtime Encounter = active

Scene Run B:
  Runtime Encounter = planned
```

Changing Run A must not activate Run B and must not rewrite the reusable Encounter Definition.

---

## 8. Explicitly not completed by this slice

This slice does not yet make legacy Monster / Boss / Combat relationships fully Runtime-Encounter-native.

Still next:

```text
Runtime Encounter participants
Story Event spawn_monster / spawn_boss
spawn at Runtime Map Spawn Point
Runtime Encounter → Combat binding
Combat start using Runtime Encounter participants
Combat on the same Runtime Map / existing positions
Runtime Encounter resolution
encounter_activated / encounter_resolved trigger propagation
```

Existing definition-level Encounter participant / Combat code remains compatibility infrastructure until those boundaries are migrated.

---

## 9. Next playable target

```text
Player enters hidden trigger Zone
→ Story Event fires
→ Runtime Encounter activates
→ Monster/Boss spawns at Runtime Spawn Point
→ entity receives Runtime Map position
→ Encounter Combat starts
→ Combat preserves same Map positions
→ Encounter resolves in this Scene Run only
→ Scene continues
```

That is the next Canonical integration slice after this Runtime Encounter state foundation.
