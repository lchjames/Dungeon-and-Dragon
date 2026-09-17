# Status Effect Runtime Foundation — Alpha

> Status: **Canonical Alpha Runtime Foundation**  
> Scope: approved Status Definitions, Runtime Status Instances, stacking policy, finite-round counters, permanent status, manual removal, immutable audit.  
> Canonical sources: `狀態效果標準結構_ALPHA.md`, `非傷害效果結算_ALPHA.md`, `ALPHA_CORE_INTEGRATION_RULES.md`.

---

## 1. Purpose

This slice creates the authoritative D1 lifecycle for persistent Status Effects without inventing the still-unlocked balance rules around resistance, control strength or automatic effect execution.

It separates two authorities:

```text
Status Definition
→ approved mechanical/status structure

Runtime Status Instance
→ one applied snapshot on a runtime target
```

The first exposed Runtime target is `CHARACTER`. The schema reserves target-type vocabulary for future Monster, Boss, Object and Environment adapters, but this slice does **not** claim those adapters exist.

---

## 2. Status Definition authority

A GM/Admin creates a Status Definition through the GM-only API/UI. A GM-created `ACTIVE` Definition is an approved Definition for this Alpha foundation.

Each Definition stores:

```text
canonical Traditional-Chinese name
category
作用層面[]
source attribute (optional)
duration type
round duration (when finite)
effect profile JSON
trigger timing metadata[]
stacking rule
stack key
maximum stacks where applicable
strength value where applicable
dispel tags[]
immunity rules[]
ACTIVE / INACTIVE
version
description / metadata
```

Definition changes require `expectedVersion` optimistic concurrency and a meaningful change reason. Definitions are never hard-deleted through the runtime authority; they may be made `INACTIVE`.

Every Definition create/update is recorded in immutable `status_effect_definition_revision_log` by D1 trigger.

Existing Runtime Status Instances do not silently inherit later Definition edits. Every application stores `definition_version` plus an immutable `effect_snapshot_json` representing the approved Definition version used by that Runtime Instance.

---

## 3. Duration

Two duration types are supported:

```text
ROUNDS
PERMANENT
```

`ROUNDS` requires a positive approved `default_duration_rounds`.

`PERMANENT` has no round counter and is never decremented by Status Round processing.

The GM operation **Advance Status Round** decrements every active finite-round Status on the selected Character by exactly one. A Status reaching zero becomes `EXPIRED`.

This operation is intentionally an explicit lifecycle foundation. It is **not yet automatically wired into Combat round advancement or normal/exploration round advancement**. That adapter must be added only when exact trigger/tick ordering is locked and tested against the shared round authorities.

Advance Status Round changes counters only. It does not execute the Status Effect Profile.

---

## 4. Stacking authority

Each Runtime target may have at most one `ACTIVE` Runtime Status Instance for a given `stack_key`.

The incoming Definition selects one canonical stacking policy:

### `NO_STACK`

An existing active instance blocks the new application. No second instance is created. The blocked attempt is still audited as `APPLY_BLOCKED`.

### `REFRESH_DURATION`

For the same round-based Definition, reapplication resets `remaining_rounds` to the Definition's approved default duration.

It does not execute the Effect Profile and does not silently replace the stored mechanical snapshot.

### `EXTEND_DURATION`

For the same round-based Definition:

```text
remaining_rounds
= existing remaining_rounds + approved incoming default_duration_rounds
```

No implicit duration cap is invented in this foundation.

### `ADD_STACKS`

For the same Definition, reapplication increases `stack_count` by one up to that Definition's explicitly approved `max_stacks`.

Reaching the approved maximum blocks additional layers and records an `APPLY_BLOCKED` audit event.

Adding a layer does **not** also refresh duration. Such a compound rule would need to be explicitly designed later rather than inferred here.

### `KEEP_STRONGER`

Definitions using this policy require a numeric approved `strength_value`.

A new instance replaces the active stack-group instance only when:

```text
incoming strength > existing strength
```

Equal or lower strength keeps the existing instance and records a blocked application.

### `TAKE_LATEST`

The active stack-group instance becomes `REPLACED`, and the incoming application becomes the new active instance.

---

## 5. Stack-key boundary

`stack_key` is the stable grouping key that decides which effects compete for the one active slot.

If a GM does not provide a custom key, a new Definition defaults to its own stable Definition ID. That makes repeated applications of the same Definition interact while avoiding accidental cross-Definition collision.

`REFRESH_DURATION`, `EXTEND_DURATION` and `ADD_STACKS` may merge only the **same Definition ID**. This prevents a shared stack key from silently combining different approved mechanical snapshots.

`NO_STACK`, `KEEP_STRONGER` and `TAKE_LATEST` can intentionally arbitrate between different Definitions that share a stack key.

---

## 6. Runtime Instance lifecycle

Runtime status values are:

```text
ACTIVE
REMOVED
EXPIRED
REPLACED
```

Hard delete is forbidden.

Application snapshots:

```text
Definition ID + Definition version
Target type + target ID
Stack key
Duration type + remaining rounds
Stack count
Strength
Source provenance
Source Ability Definition (optional)
Approved Effect Profile snapshot
Source context
Actor + timestamps
```

Manual removal changes `ACTIVE → REMOVED` and requires a meaningful reason.

Replacement changes the old active instance to `REPLACED` and inserts the incoming active instance in the same D1 batch.

---

## 7. Audit authority

Runtime writes set an explicit lifecycle action such as:

```text
APPLY_CREATE
REFRESH
EXTEND
STACK
REPLACE_STRONGER
REPLACE_LATEST
TICK
EXPIRE
REMOVE
```

D1 `AFTER INSERT` / `AFTER UPDATE` triggers write the immutable `runtime_status_effect_audit` record from the row that actually changed.

This means a failed optimistic write cannot create a false successful lifecycle audit.

Blocked stacking attempts do not change the Runtime row but still append `APPLY_BLOCKED` with the attempted reason.

Both Definition audit and Runtime audit reject UPDATE and DELETE.

---

## 8. GM HTTP surface

GM/Admin only:

```text
GET  /api/gm/status-effects/definitions
POST /api/gm/status-effects/definitions
PATCH /api/gm/status-effects/definitions/:definitionId

GET  /api/gm/characters/:characterId/status-effects
POST /api/gm/characters/:characterId/status-effects
POST /api/gm/characters/:characterId/status-effects/tick-round
POST /api/gm/status-effects/instances/:instanceId/remove
```

All writes require same-origin validation.

There is no Player Status write route in this slice.

---

## 9. Explicit non-goals

This foundation deliberately does **not** decide or execute any of the following:

```text
status hit chance
which Attribute / Skill resists which Status
source-vs-resistance D100 selection
Boss / special-unit control resistance
control-strength balance
maximum strong-control duration
universal stack caps
cleanse / dispel resource cost
automatic Great Success primary-field doubling
Great Failure deviation outcome
DoT damage
HoT / regeneration healing
shield absorption
numeric Buff / Debuff application
Action / Move lock from control states
MP mutation
automatic movement / displacement
Ability cast / activation
Combat turn trigger execution
normal/exploration round trigger execution
runtime AI adjudication
```

The shared Opposed D100 authority already provides the generic strict comparison primitive for a future negative-effect adapter, but this Status foundation does not choose when or how that primitive is invoked.

Likewise, `effect_profile_json` and trigger timing metadata are stored now so future approved execution adapters can consume the same Definition without another schema redesign. They are data in this slice, not executable instructions.

---

## 10. Safety / authority boundary

Status Runtime authority may mutate only its own Definition / Runtime / audit tables.

It must not directly mutate:

```text
Character HP / MP
Combat damage
Action / Move usage
Map position
Basic Skill values or growth
Encounter state
Story flags
```

Future Ability, Combat, Story or exploration adapters must call approved shared authorities rather than expanding this lifecycle foundation into a second gameplay engine.

---

## 11. Production verification

`production-alpha-status-effect-runtime-e2e.mjs` is intentionally **plan-only** in this slice.

CI verifies syntax, rules/contracts and the production safety gate, but does not perform credentialed live Production D1-writing Status tests unless a later dedicated execution-safe runner is explicitly introduced.
