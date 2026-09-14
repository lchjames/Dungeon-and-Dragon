# Ability MP Cost Authority — Alpha

## Status

Canonical Alpha Runtime / authoring authority for approved Ability MP cost.

This slice implements the fixed resource-cost part of `基礎動作與MP資源消耗_ALPHA.md` without pretending that general Ability combat execution is already specified.

## Canonical boundary

Every newly classified named active Ability has one GM-approved positive integer `mpCost`.

The approved cost is stored separately from the descriptive/mechanical JSON in `ability_resource_profiles`, one row per Ability Definition. It is Definition-adjacent authority and is included in Definition revision snapshots.

This slice does **not**:

- spend MP;
- consume Combat Action;
- make a D100 check;
- select or validate targets;
- resolve range, damage, healing, control, movement, area, duration or other effects;
- implement refunds;
- implement per-cast AI;
- implement mastery damage multipliers;
- implement automatic element/mastery progression;
- treat SPECIAL as Rank 10.

A future execution slice must perform Action/resource reservation and effect resolution as one coherent authoritative operation. A half-cast route that spends MP but has no canonical effect resolution is intentionally not provided.

## Approved MP cost

`mpCost` MUST be a positive integer.

New classified Ability Definitions MUST provide an approved `mpCost` at create time.

When an existing classified Definition is edited, the resulting Definition MUST have an approved `mpCost`. This means older classified Definitions that pre-date this authority become visibly `PENDING` and the GM must approve a cost on the next edit.

Legacy `NEEDS_CLASSIFICATION` entries may remain without a resource profile until they are classified.

Existing Abilities are deliberately **not** auto-backfilled from the Rank reference table. The Rank table is authoring guidance, not a formula that silently decides actual approved cost.

## Rank 1–9 MP reference

Canonical reference values:

| Rank | Reference MP |
| --- | ---: |
| 1 | 1 |
| 2 | 5 |
| 3 | 10 |
| 4 | 20 |
| 5 | 40 |
| 6 | 80 |
| 7 | 160 |
| 8 | 320 |
| 9 | 640 |

The reference value is exposed as `referenceMpCost`.

`referenceMpCost` MUST NOT overwrite or recalculate `mpCost` after approval. GM may approve a different positive integer cost when the complete Power Package warrants it.

Character Level MUST NOT scale an approved Ability MP cost automatically.

## SPECIAL

SPECIAL is not Rank 10 and has no default Rank MP reference.

A SPECIAL Ability still requires an explicit approved positive integer `mpCost`. Its eventual effect/qualification policy remains separately authored and is not inferred from a Rank-10 table.

## Persistence

Canonical table:

`ability_resource_profiles`

Fields:

- `ability_definition_id` — stable Ability Definition ID and primary key;
- `mp_cost` — approved fixed positive integer cost;
- `approved_by_user_id` / `approved_at` — first approval provenance;
- `updated_by_user_id` / `updated_at` — latest update provenance;
- `metadata_json` — reserved extension metadata.

Ability create/edit continues to write `ability_definition_revision_history`. Revision snapshots now include approved `mpCost` and derived `referenceMpCost`, so cost changes are reviewable with the rest of the Definition profile.

No destructive migration or automatic legacy cost backfill is performed.

## Read model

Ability Definition payloads expose:

- `mpCost` — approved actual cost or `null`;
- `referenceMpCost` — Rank 1–9 reference or `null` for SPECIAL/unclassified;
- `resourceProfileStatus` — `APPROVED` or `PENDING`;
- approval/update provenance.

Character Ability payloads additionally expose top-level current MP:

```json
{
  "abilityResource": {
    "currentMp": 18,
    "maxMp": 30
  }
}
```

Each acquired Ability exposes deterministic, read-only `activationResource`:

- `PENDING_PROFILE` — no approved MP cost;
- `MP_RESOURCE_MISSING` — Character has no MP resource;
- `MP_RESOURCE_INVALID` — current/max MP state is invalid;
- `INSUFFICIENT_MP` — approved cost exceeds current MP;
- `AFFORDABLE` — current MP is at least approved cost.

Affordability is separate from `usability` qualification. A Character can satisfy Rank/Mastery/Level qualification but temporarily lack enough MP to activate the Ability.

`activationResource` is advisory/read-only in this slice. It does not reserve or spend resources.

## UI

GM Ability authoring shows:

- approved MP cost input;
- Rank reference hint;
- SPECIAL explicit-cost warning;
- pending status for older Definitions without approved cost;
- actual approved cost distinct from Rank reference.

Player Ability view shows:

- current/max MP;
- actual approved MP cost per Ability;
- affordability state;
- Rank reference only when useful to explain a non-reference approved cost.

Neither UI presents an Ability cast button in this slice.

## Future execution boundary

When general Ability execution becomes canonical, the existing Combat Action/MP transaction pattern should be reused:

1. validate active Combat / current controlled turn / actionable life state;
2. validate Action available;
3. load the approved Ability Definition and resource profile;
4. validate qualification, target/range/effect prerequisites and current MP;
5. atomically reserve/consume Action and approved MP together with the authoritative Ability resolution/audit;
6. never allow MP below zero;
7. apply the canonical no-refund policy after a formally activated roll/effect unless the saved Ability profile explicitly says otherwise.

The existing Focus authority demonstrates the required optimistic Combat-state + Action + MP snapshot discipline, but Focus itself is not reused as Ability execution.

## Production verification

Normal CI runs only the plan-only Ability MP Cost descriptor plus static/unit contracts. It does not mutate production D1.

A future credentialed production-writing runner may verify Definition create/edit/grant and current-MP affordability, but it MUST NOT claim that Ability combat execution has been tested until a canonical execution endpoint exists.
