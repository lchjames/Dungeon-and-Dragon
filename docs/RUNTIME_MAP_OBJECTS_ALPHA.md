# Runtime Map Objects — Alpha Canonical

## Purpose

Runtime Map Objects are the first foundation of the Player Interaction / Free Action phase.

A Map Object is a fixed or scene-bound feature that a Character may eventually inspect, use, manipulate or otherwise interact with. Examples include a lever, chest, altar, terminal, statue, switch, corpse, trap mechanism or custom scenery feature.

This slice intentionally establishes Object identity and Runtime state **before** Player `interact_object` is implemented.

## Authority model

```text
Map Object Definition
        ↓ snapshot when Runtime Map is created
Runtime Map Object
```

`map_objects` belongs to reusable Map Template authoring.

`runtime_map_objects` belongs to one exact Runtime Map / Scene Run.

Definition edits after a Scene Run starts must never mutate the Runtime Object snapshot already in play.

There is deliberately no foreign key from `runtime_map_objects.source_object_id` back to `map_objects.id`. `source_object_id` is provenance and stable authoring identity, not a live dependency. Runtime history must survive later Definition edits or deletion.

## Definition fields

Each Map Object contains:

- stable `object_...` ID
- Map Template ID
- unique name within that Map Template
- free structured `object_type` key
- integer `x` / `y` coordinate
- `interaction_range` from 1–20
- default Player visibility
- default enabled state
- initial structured JSON object state
- GM notes

`object_type` is intentionally not a hard-coded SQL enum. Examples may include `lever`, `chest`, `terminal`, `statue`, `altar`, `corpse`, `trap`, `prop`, or future custom keys.

`initial_state_json` is data only. It is never evaluated as JavaScript or SQL.

Objects may exist on blocked Cells. This supports wall-mounted switches, scenery, statues and mechanisms that occupy or belong to a non-walkable Cell.

## Runtime fields

Each Runtime Object freezes:

- exact Runtime Object ID
- stable `source_object_id`
- name snapshot
- type key
- x / y
- interaction range
- Player visibility
- enabled state
- independent Runtime `state_json`
- GM notes snapshot

The Runtime state is intentionally mutable in the model, but **this foundation slice exposes it read-only**. The next Player Interaction slice will add the authoritative mutation / interaction path.

## Atomic snapshot boundary

Runtime Map creation already inserts `runtime_map_instances` inside the authoritative Scene Runtime D1 batch.

`trg_runtime_map_object_snapshot` is an SQLite `AFTER INSERT ON runtime_map_instances` trigger. Therefore Map Object snapshot rows are materialised inside the **same database transaction** as the Runtime Map Instance.

```text
Scene Run + Runtime Map INSERT transaction
        ↓
AFTER INSERT runtime_map_instances
        ↓
Runtime Object snapshots
        ↓
transaction commits
        ↓
post-commit Story lifecycle work
```

A successfully committed Runtime Map cannot exist in a half-snapshotted Object state because of a separate post-commit Object copy request.

## Definition editing

GM Object authoring lives in the existing World Map workspace through the Object Layer editor.

Saving the Object Layer:

- replaces the complete Object Definition set for that Map Template
- uses the Map Template `version` as the optimistic concurrency token
- increments the Map Template version
- rejects a stale editor save with `MAP_TEMPLATE_CHANGED`

The Object editor is intentionally separate from the Cell/Edge/Zone/Spawn form state while sharing the same Map Template and version authority. Opening one editor closes the other so an Object save cannot silently leave a stale Grid editor open.

## Runtime read model

GM Runtime Map detail responses are augmented with:

```json
{
  "objects": [
    {
      "id": "runtime_object_...",
      "sourceObjectId": "object_...",
      "name": "Ancient Lever",
      "objectType": "lever",
      "x": 1,
      "y": 0,
      "interactionRange": 1,
      "playerVisible": true,
      "enabled": true,
      "state": { "position": "up" }
    }
  ]
}
```

A dedicated GM read route is also available:

```text
GET /api/gm/world/runtime/maps/:mapInstanceId/objects
```

No Player Object list is exposed by this slice. Player-safe visibility and interaction eligibility are part of `interact_object`.

## Interaction distance contract for the next slice

The Map already uses a square grid with 8-way movement. Object interaction range therefore uses Chebyshev grid distance:

```text
max(abs(character.x - object.x), abs(character.y - object.y)) <= interaction_range
```

With the default range `1`, a Character can interact with an Object on any of the eight adjacent cells, including an Object whose own Cell is blocked.

This distance contract does not itself grant an Action. The next slice must additionally enforce Exploration / Combat Action economy, Character eligibility, Runtime Map identity, Object enabled state and Player visibility rules.

## Explicitly not implemented in this slice

The following remain deferred to the next interaction slices:

- Player `interact_object`
- Player-safe Object discovery payload
- consuming an Action for interaction
- `interact_object` Story dispatch
- Object state conditions
- `set_object_state`, enable / disable effects
- Player Door interaction
- free-form / AI interpretation of natural-language actions

The point of this slice is to create the authoritative thing that those systems will interact with, without guessing at Player action semantics prematurely.
