# Runtime Scene Completion / Transition Policy — Alpha Canonical

Status: Canonical Alpha runtime policy.

This document defines how an active `Scene Run` ends, how the next Scene is selected, which Runtime resources close, and which state is allowed to cross the Scene boundary.

The authority boundary is Runtime-only. Completing a Scene Run does **not** edit Scenario / Scene Definitions.

---

## 1. Why this authority exists

Before this slice, the low-level Runtime Map `close` endpoint could close a map and complete its Scene Run while leaving the parent Scenario Run active with no active Scene Run. That endpoint remains useful for operator cleanup and production test teardown, but it is not the canonical gameplay progression path.

Canonical gameplay progression now uses an explicit Scene transition operation.

A transition is one of:

- `next_scene`
- `complete_scenario`

There is no automatic guess based on Encounter completion in Alpha.

---

## 2. Endpoint

GM/Admin only:

```http
POST /api/gm/world/runtime/maps/:mapInstanceId/transition
```

### Next Scene

```json
{
  "mode": "next_scene",
  "nextSceneId": "scene_...",
  "carryFlagKeys": ["quest.key_found"],
  "carryCharacters": true,
  "targetSourceSpawnPointId": "spawn_..."
}
```

### Complete Scenario Run

```json
{
  "mode": "complete_scenario",
  "carryFlagKeys": []
}
```

`nextSceneId` is always explicit. Runtime authority never silently chooses the next Definition Scene.

---

## 3. Definition / Runtime isolation

A transition mutates:

- the current `runtime_map_instances` row;
- the current `scene_runs` row;
- the current `scenario_runs` row when terminal;
- Runtime Encounter rows for the outgoing Scene Run;
- active Rest state tied to the outgoing Runtime Map;
- a new Runtime Scene / Map snapshot when moving to a next Scene;
- explicit carried Story flags and Character positions;
- `runtime_scene_transition_log`.

A transition does **not** mutate:

- `scenarios.status`;
- `scenes.status`;
- Map Template Definitions;
- Object Definitions;
- Encounter Definitions.

Definition status remains authoring state, not playthrough state.

---

## 4. Source authority and preconditions

The source Runtime Map must be:

- present;
- `active`;
- attached to an `active` Scene Run;
- attached to an `active` Scenario Run.

The Scenario Run must have exactly one active Scene Run at transition time.

This protects the Player invariant that one Character should not accidentally acquire multiple simultaneous active Scene locations during ordinary play.

---

## 5. Combat and Encounter blockers

A Scene cannot transition while its Runtime state still contains an active conflict.

The transition is rejected when:

- a Runtime Encounter-linked Combat on the outgoing map is `active`; or
- any Runtime Encounter in the outgoing Scene Run is `active`.

The GM must first end Combat and resolve / skip the active Runtime Encounter.

`planned` Runtime Encounters are different. They represent content that never became active. When the Scene completes, any remaining `planned` Runtime Encounters are atomically changed to `skipped`.

This does not mutate Encounter Definitions.

---

## 6. Rest at the Scene boundary

An active Rest belongs to a Runtime Map.

When that Runtime Map leaves active play through a canonical Scene transition:

- active Rest rows on that map become `cancelled`;
- `interrupted_reason = 'scene_transition'`;
- if the Rest audit table exists, a `cancelled` audit entry is written with detail `scene_transition`;
- no recovery is granted by the transition itself.

A Character therefore cannot carry an unfinished Short / Long Rest into a different Runtime Map.

---

## 7. Selecting the next Scene

For `next_scene`, the target must:

1. belong to the same Scenario Definition as the current Scenario Run;
2. be different from the outgoing Scene;
3. have Definition status `active`;
4. have a Structured Map binding;
5. point to an active World Location and active Map Template.

A `locked` or `completed` Scene Definition is not transitionable.

Alpha does not auto-unlock Definitions. A GM who intends to enter a locked Scene must explicitly change its authoring status first.

---

## 8. New Runtime snapshot

`next_scene` creates a fresh Runtime snapshot in the **same Scenario Run**:

```text
Scenario Run A
  Scene Run 1 (completed)
    Runtime Map 1 (closed)
  Scene Run 2 (active)
    Runtime Map 2 (active)
```

The new Runtime Map is freshly snapshotted from the target Scene's current Map binding:

- cells;
- edges / door defaults;
- zones;
- spawn points;
- Map Objects through the existing Runtime Object clone trigger;
- Scene config overrides.

Runtime state from the old map is not copied by default.

---

## 9. Character carry policy

For `next_scene`, `carryCharacters` defaults to `true`.

Only active Characters currently positioned on the outgoing Runtime Map are carried.

When one or more Characters are carried:

- `targetSourceSpawnPointId` is required;
- it refers to the stable **Map Template Spawn Point ID**, not a Runtime Spawn Point ID;
- the target Spawn Point must accept `character` or `any`;
- the target Scene config must not disable it;
- all carried Characters are placed on that entry cell;
- overlap is intentional for party entry;
- each Character retains its global token visibility mode;
- per-viewer visibility overrides do not carry because they belong to the old Runtime position identity.

A Character that is no longer `active` blocks automatic carry rather than being silently dropped.

GM may set `carryCharacters: false` and position Characters manually after the transition.

---

## 10. Story state carry policy

Story flags are Scene-Run-scoped by default.

A flag crosses the Scene boundary **only** when its key is explicitly listed in `carryFlagKeys`.

Rules:

- maximum 50 keys per transition;
- keys use the canonical Story flag format;
- every requested key must exist in the outgoing Scene Run;
- carried values are copied unchanged into the destination Scene Run;
- `updated_by_user_id` becomes the GM/Admin who performed the transition;
- carried flags are committed **before** destination `scene_run_start` Story evaluation.

This means a destination Scene may intentionally branch on a carried flag during its opening Story events.

The following do **not** carry:

- Runtime Narratives;
- Story Event execution history;
- lifecycle occurrence / dispatch identity;
- Object state;
- Door state;
- Zone visibility;
- Encounter state;
- exploration Action / Move state;
- Runtime token viewer overrides.

Those remain historical state of the completed Scene Run.

---

## 11. Terminal Scenario completion

`complete_scenario`:

1. skips remaining planned Runtime Encounters;
2. cancels active Rest on the outgoing map;
3. closes the outgoing Runtime Map;
4. completes the outgoing Scene Run;
5. completes the parent Scenario Run;
6. creates no destination Scene Run / Runtime Map.

Because there is no destination Scene Run, Scene-scoped Story flags cannot be carried in terminal mode.

Scenario Definition status is unchanged.

---

## 12. Atomic transition boundary

The authoritative transition data mutation is one D1 batch.

The batch contains the relevant:

- outgoing Scene completion;
- Runtime Map closure;
- planned Encounter skipping;
- Rest cancellation;
- destination Scene Run / Runtime Map creation;
- target Map snapshot;
- Character carry;
- Story flag carry;
- Scenario Run update/completion;
- transition audit row.

This avoids a canonical gameplay state where the destination is active but the source remains active because one half of the transition failed.

---

## 13. Transition audit and idempotency

Canonical audit table:

```text
runtime_scene_transition_log
```

Each outgoing Scene Run can have exactly one canonical transition:

```text
UNIQUE(from_scene_run_id)
```

The audit stores:

- Scenario Run identity;
- source Scene Run / Runtime Map / Scene;
- mode;
- destination identities when applicable;
- carried Story flag keys;
- carried Character IDs;
- target source Spawn Point ID;
- number of planned Encounters skipped;
- number of active Rests cancelled;
- actor User ID;
- timestamp.

A retry after the transition committed returns the existing audit/destination rather than creating another Scene Run.

---

## 14. Destination Story startup

After a successful `next_scene` D1 commit:

1. destination carried flags already exist;
2. `scene_run_start` Story Events are processed for the new Scene Run;
3. the generic durable Story lifecycle queue is drained for downstream cascades.

As elsewhere in Alpha, Story processing happens after the authoritative Runtime transition. A Story-processing failure is returned as a warning and does not roll back the committed transition.

---

## 15. Low-level `/close` compatibility

The older endpoint remains available:

```http
POST /api/gm/world/runtime/maps/:mapInstanceId/close
```

It is retained for:

- operator cleanup;
- production E2E teardown;
- historical compatibility.

It is **not** the canonical gameplay Scene progression API.

GM UI should use `/transition` for ordinary Scene completion.

---

## 16. Player-facing consequence

Before transition, carried Characters are positioned only on the outgoing active Runtime Map.

After an atomic `next_scene` transition:

- the old map is closed, so it no longer contributes to Player current-map lookup;
- the new map is active;
- carried Characters have one active position on the new map.

This preserves the existing `hasCurrentMap` / `locationConflict` semantics.

---

## 17. Alpha boundary

This slice deliberately does **not** add:

- automatic next-Scene selection;
- automatic transition based solely on Encounter completion;
- branching transition graphs in Definition schema;
- a new `scene_completed` / `scene_transitioned` Story trigger;
- arbitrary Runtime-state carry;
- automatic Definition Scene status changes.

Those can be layered later without weakening this authority boundary.

---

## 18. Checkpoint

With this policy, Alpha now has an explicit playthrough lifecycle:

```text
Scenario Definition
  → Scenario Run
    → Scene Run + fresh Runtime Map
      → Story / Encounter / Combat / Object play
      → explicit Scene completion
        → next Scene Run in same Scenario Run
        OR
        → terminal Scenario Run completion
```

Definition-level branching / transition authoring is now canonical in `SCENE_TRANSITION_AUTHORING_ALPHA.md`. The next major architecture slice is **Story processor consolidation / shared execution authority**, but only where consolidation preserves existing trigger ordering, Runtime audit identity and Definition/Runtime isolation.
