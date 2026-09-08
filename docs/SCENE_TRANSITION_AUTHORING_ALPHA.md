# Scene Transition Definition Authoring — Alpha Canonical

Status: Canonical Alpha authoring policy.

This document layers Definition-level branching on top of `RUNTIME_SCENE_TRANSITION_POLICY_ALPHA.md` without weakening Runtime authority.

---

## 1. Authority split

The Definition layer answers:

- which routes a Scene is designed to offer;
- which Runtime conditions make a route eligible;
- which next Scene or terminal completion the route represents;
- which Scene-scoped Story flags are intentionally carried;
- whether currently positioned Characters are carried;
- which stable target Spawn Point is used for Character entry.

The Runtime layer remains authoritative for actually completing the Scene.

A Definition never auto-transitions the game. GM/Admin must explicitly choose a route at Runtime.

---

## 2. Stable Definition identity

Canonical table:

```text
scene_transition_definitions
```

A route has a stable ID:

```text
scene_transition_def_...
```

It belongs to exactly one source Scene and therefore one Scenario Definition.

A route stores:

- `scenario_id`;
- `from_scene_id`;
- name;
- status (`draft`, `active`, `archived`);
- mode (`next_scene`, `complete_scenario`);
- optional destination Scene;
- conditions;
- explicit carry flag keys;
- Character carry policy;
- stable target Map Template Spawn Point ID;
- sort order;
- GM notes;
- optimistic authoring version;
- creator/updater/timestamps.

Route names are unique within one source Scene.

---

## 3. Route status

### `draft`

Authoring work in progress. It is never offered by Runtime transition options.

Draft definitions may be deleted.

### `active`

Runtime-eligible authoring state. Activation validates the destination policy strongly enough for current Runtime use.

### `archived`

Historical Definition identity. It is retained but is never offered by Runtime.

Active and archived Definitions are not hard-deleted in Alpha. To remove an active route from play, archive it.

---

## 4. Modes

### `next_scene`

Requires:

- `toSceneId` in the same Scenario;
- source and target are different Scenes;
- if active, target Scene is currently `active` and has an active Structured Map binding;
- if `carryCharacters=true`, a stable target Spawn Point ID is required and must accept `character` or `any`.

### `complete_scenario`

Represents a terminal authored branch.

It has:

- no destination Scene;
- no target Spawn Point;
- no Character carry;
- no Scene-scoped flag carry.

---

## 5. Conditions

Conditions are an AND-list and reuse canonical Story condition normalization/evaluation for the approved transition subset:

```text
flag_equals
flag_not_equals
door_state
object_state
encounter_status
```

Not approved for Transition Definitions:

```text
event_not_fired
scene_run_status
```

Reason:

- route identity is not a Story Event, so `event_not_fired` has no meaningful event identity;
- canonical Scene transition can only execute from an active Scene Run, so authoring `scene_run_status` adds no useful branch information.

Stable authoring references are mandatory:

- Door condition → Map Template `sourceEdgeId`;
- Object condition → Map Object Definition `sourceObjectId`;
- Encounter condition → Encounter Definition ID.

Those targets must belong to the source Scene Definition.

Maximum conditions per route: 20.

---

## 6. Carry policy

Story flags remain Scene-Run-scoped by default.

A route may author up to 50 canonical Story flag keys to carry into its destination Scene Run.

The keys are policy, not guaranteed values. At Runtime, every requested carry key must exist in the outgoing Scene Run or the canonical transition is rejected by existing Runtime authority.

Character carry is explicit:

```text
carryCharacters = true | false
```

When true, the route authors one stable target `sourceSpawnPointId`. All currently positioned active Characters use that entry point, matching Runtime transition policy.

The Definition does not carry Object, Door, Zone, Encounter, Narrative, execution, lifecycle, Action, Move, Rest, or viewer-override state.

---

## 7. Optimistic authoring concurrency

Each Definition has:

```text
version >= 1
```

PATCH and draft DELETE require `expectedVersion`.

A stale edit fails instead of silently overwriting newer authoring work.

---

## 8. GM authoring APIs

List all:

```http
GET /api/gm/scene-transitions
```

List / create for one source Scene:

```http
GET  /api/gm/scenes/:sceneId/transitions
POST /api/gm/scenes/:sceneId/transitions
```

Update:

```http
PATCH /api/gm/scene-transitions/:definitionId
```

Delete draft only:

```http
DELETE /api/gm/scene-transitions/:definitionId
```

DELETE body:

```json
{ "expectedVersion": 1 }
```

---

## 9. Runtime options

GM/Admin can inspect authored routes for an active Runtime Map:

```http
GET /api/gm/world/runtime/maps/:mapInstanceId/transition-options
```

Only `active` Definitions are returned.

Each option includes:

- the Definition snapshot;
- `eligible`;
- condition failures;
- destination/readiness failures.

The response also returns global transition blockers such as active Combat or active Runtime Encounter.

Eligibility is advisory UI information. The selected route is re-evaluated again during execution.

---

## 10. Explicit authored-route execution

Canonical authored-route request:

```http
POST /api/gm/world/runtime/maps/:mapInstanceId/transition
```

```json
{
  "transitionDefinitionId": "scene_transition_def_..."
}
```

When a Definition ID is supplied:

1. it must be `active`;
2. it must belong to the current Runtime source Scene;
3. current Runtime conditions are re-evaluated;
4. current destination readiness is revalidated;
5. direct Runtime override fields are forbidden;
6. Definition policy is converted into the existing canonical Runtime transition request;
7. existing Runtime Scene transition authority performs the mutation.

The Definition layer does not duplicate or bypass Runtime transition invariants.

The existing direct request shape (`mode`, `nextSceneId`, etc.) remains available as an explicit GM manual override / compatibility path.

---

## 11. Definition provenance audit

Supplemental audit table:

```text
runtime_scene_transition_definition_links
```

After an authored transition commits, its canonical Runtime transition ID is linked to:

- Definition ID when still present;
- Definition version;
- immutable Definition snapshot JSON;
- linking GM/Admin;
- timestamp.

The Definition snapshot preserves the route policy that was selected even if the Definition is edited or later archived.

The Runtime transition itself remains authoritative even if supplemental provenance linking reports a warning after commit. Retrying the same authored route remains idempotent because the core Runtime transition audit is authoritative. If the supplemental Definition link is missing, the retry reports that missing provenance rather than manufacturing a historical Definition snapshot that can no longer be proven exact.

---

## 12. GM UI

Story authoring shows Transition Definitions inside each Scene:

- route name;
- status;
- mode;
- target Scene;
- conditions JSON;
- carry flag list;
- Character carry;
- target stable Spawn Point ID;
- sort order;
- GM notes;
- version.

Runtime Scene controls show active authored routes and their eligibility before execution.

Manual next-Scene controls remain visibly separated as **Manual Override** rather than pretending to be authored branching.

---

## 13. No automatic branching

Alpha deliberately does not:

- automatically select the first eligible route;
- automatically select by sort order;
- automatically transition when a condition becomes true;
- mutate Scene Definition status from Runtime;
- auto-unlock destination Scenes;
- infer a target Spawn Point;
- infer Story flag carry.

Sort order controls authoring/display order only.

---

## 14. Checkpoint

The playthrough stack is now:

```text
Scenario / Scene Definitions
  → authored Transition Definitions / branch conditions
    → Scenario Run
      → Scene Run + fresh Runtime Map
        → Story / Encounter / Combat / Object play
        → GM selects one eligible authored route
          → existing atomic Runtime Scene transition authority
            → next Scene Run
            OR terminal Scenario completion
```

The next major Alpha architecture slice is **Story processor consolidation / shared execution authority**, provided consolidation preserves all current Canonical ordering and audit semantics. After that, the roadmap moves to broader Scenario completion polish and player-facing progression presentation rather than adding more trigger names by default.
