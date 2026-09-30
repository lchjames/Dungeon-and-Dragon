# Non-damage Status Application Adapter — Alpha

> Status: Canonical Alpha Runtime integration rule  
> Scope: consumes one immutable Non-damage Effect Settlement plus one READY, version-pinned Non-damage Status Application Profile and, only when the original target is eligible to receive the effect, delegates one Runtime Status application to the existing Status Effect authority.

## 1. Canonical flow

```text
Basic Skill D100
→ Shared Opposed D100
→ Non-damage Effect Settlement
→ READY Status Application Profile
→ Non-damage Status Application Adapter
→ Status Effect Runtime Authority
```

This adapter is not a second Status engine.

It MUST use the committed Settlement and approved Profile. It MUST NOT recompute Opposed D100, Great Success, Great Failure, target selection, or stacking policy.

## 2. Accepted Settlement state

Only:

```text
original_target_resolution = APPLIES
gm_resolution_required = false
```

may continue to Runtime Status application.

The adapter MUST reject:

```text
BLOCKED
GM_DECISION_REQUIRED
```

with no application ledger row and no Runtime Status write.

A Runtime Status stacking policy may independently return `BLOCK` after a valid Settlement reaches the Status authority. That case is recorded as an application with:

```text
application_status = BLOCKED
runtime_operation = BLOCK
```

This is distinct from a Settlement whose original target was already blocked.

## 3. READY Profile and Definition pinning

The Profile must be ACTIVE and its stored:

```text
status_definition_id
status_definition_version
primary_effect_field
primary_effect_key
primary_effect_value
```

must still match the current approved Status Definition.

If the Definition version changed, the adapter fails closed with:

```text
STATUS_DEFINITION_VERSION_STALE
```

The GM must re-approve the Profile first.

## 4. Primary effect multiplier

The Settlement stores:

```text
primary_effect_multiplier = 1 | 2
```

The Profile stores exactly one approved primary field.

The adapter computes:

```text
primary_effect_applied_value
= primary_effect_base_value × primary_effect_multiplier
```

Only the selected primary field may be overridden:

- `DURATION_ROUNDS`
- `STRENGTH_VALUE`
- `EFFECT_PROFILE_NUMERIC`

All other Status Definition fields remain unchanged.

The actual override is delegated through:

```text
applyPinnedStatusEffectToCharacter(...)
```

which re-checks Definition version and the approved base value before writing Runtime Status state.

## 5. Stacking authority remains canonical Status Runtime

The adapter MUST NOT implement its own stacking rules.

The existing Status Runtime authority remains responsible for:

- `NO_STACK`
- `REFRESH_DURATION`
- `EXTEND_DURATION`
- `ADD_STACKS`
- `KEEP_STRONGER`
- `TAKE_LATEST`

If an approved ×2 primary override cannot be represented by the current stacking operation, the Status authority fails closed rather than silently changing semantics.

## 6. D1 application identity

Authoritative tables:

```text
non_damage_status_application_log
non_damage_status_application_audit
```

One Settlement + Profile pair may create at most one application identity:

```text
UNIQUE (settlement_id, profile_id)
```

Identity fields are immutable.

Final application rows are immutable.

Delete is forbidden.

## 7. Retry, lease and crash reconciliation

A valid APPLIES request first owns one `PENDING` application row.

The application processor uses a short lease so concurrent retries cannot both execute the Runtime write.

Before applying, the adapter appends a stable audit marker:

```text
[ND_STATUS_APP:<application_id>]
```

to the Status Runtime meaningful reason.

If Runtime Status application commits but application-ledger finalisation is interrupted, a retry searches immutable `runtime_status_effect_audit` for that marker and reconciles the application row instead of applying the Status twice.

For replacement operations, both the replaced instance and the new instance can carry the same marker. Reconciliation therefore prefers an `APPLY_BLOCKED` audit when the Status authority blocked the application, otherwise it prefers an audit whose `after_snapshot_json.status` is `ACTIVE`. It never chooses the replacement instance by random audit-ID ordering.

GM meaningful reason input is capped below the Status Runtime reason limit so the audit marker always fits.

## 8. Runtime application result

A successful Status authority operation records:

```text
application_status = APPLIED
runtime_status_effect_id = <instance>
runtime_operation = CREATE | REFRESH | EXTEND | STACK | REPLACE_STRONGER | REPLACE_LATEST
```

A canonical Status stacking rejection records:

```text
application_status = BLOCKED
runtime_operation = BLOCK
```

Retrying an already-final application returns it idempotently.

## 9. GM HTTP surface

GM/Admin only:

```text
GET  /api/gm/non-damage-status-applications
POST /api/gm/non-damage-status-applications
```

POST accepts:

```json
{
  "settlementId": "...",
  "profileId": "...",
  "meaningfulReason": "..."
}
```

Writes require same-origin validation.

No Player write route is introduced.

## 10. Explicit non-goals

This adapter MUST NOT:

- recompute D100 or Settlement outcome;
- invent a Great Failure deviation target;
- apply a blocked or unresolved Settlement;
- directly insert/update `runtime_status_effects`;
- implement a second stacking engine;
- apply damage or healing;
- mutate HP/MP;
- consume Action or Move;
- move a token;
- mutate Basic Skill values or growth;
- execute an Ability;
- execute arbitrary JavaScript, SQL, or JSON expressions.

## 11. GM surface

The GM panel lists only Settlements whose original target resolution is `APPLIES` and does not require GM deviation adjudication.

The server remains authoritative even if a client submits another Settlement ID manually.

## 12. Production verification

Automated CI verification is plan-only.

It validates source contracts and normal production deployment/smoke behavior, but does not claim credentialed live D1-writing coverage for Settlement → Runtime Status application.
