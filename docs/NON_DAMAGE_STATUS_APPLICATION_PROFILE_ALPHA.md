# Non-damage Status Application Profile Authority — Alpha

> Status: Canonical Alpha integration foundation  
> Scope: GM-approved, versioned mapping between one Status Definition and the immutable Non-damage Effect Settlement authority.  
> This slice creates the approved Profile boundary only. It does **not** apply a Runtime Status.

## 1. Why this authority exists

The committed settlement flow now has:

```text
Basic Skill D100
→ Shared Opposed D100
→ Non-damage Effect Settlement Decision
```

The next Runtime layer must not guess how arbitrary `mechanical_profile_json` or `effect_profile_json` should be interpreted.

This authority therefore creates an explicit approved Profile:

```text
Non-damage Status Application Profile
→ one Status Definition
→ one approved Definition version
→ ORIGINAL_TARGET
→ OPPOSED_D100
→ one explicit primary effect field
→ DOUBLE_PRIMARY_EFFECT
→ TARGET_DEVIATION
```

## 2. Supported primary fields

Alpha supports only machine-verifiable primary fields:

```text
DURATION_ROUNDS
STRENGTH_VALUE
EFFECT_PROFILE_NUMERIC
```

`EFFECT_PROFILE_NUMERIC` requires one simple top-level key in the Status Definition's `effect_profile_json`. Nested JSON paths, expressions and code are forbidden.

The selected field must contain a finite numeric value when the Profile is approved.

No other Status fields are doubled by Source Great Success.

## 3. Definition-version pinning

A Profile stores:

```text
status_definition_id
status_definition_version
primary_effect_value
```

The value is inspected from the exact Status Definition version being approved.

If the Status Definition is later edited:

```text
Profile approved version != current Definition version
→ readiness = false
→ reason = STATUS_DEFINITION_VERSION_STALE
```

The Profile never silently follows a changed Definition.

GM must PATCH / re-approve the Profile. Re-approval reads the current Definition and writes a new Profile revision.

## 4. Fixed Alpha semantics

The following fields are deliberately fixed rather than freely authored:

```text
target_mode = ORIGINAL_TARGET
resistance_type = OPPOSED_D100
great_success_rule = DOUBLE_PRIMARY_EFFECT
great_failure_rule = TARGET_DEVIATION
```

These match the canonical Non-damage Effect Settlement rules.

Source Great Failure still requires GM deviation adjudication. This Profile does not choose another target.

## 5. D1 authority

Authoritative tables:

```text
non_damage_status_application_profiles
non_damage_status_application_profile_revision_log
```

Profile updates require `expectedVersion`.

Revision rows are immutable.

Profiles are never hard-deleted. GM may set a Profile to `INACTIVE`.

An ACTIVE Profile requires an ACTIVE Status Definition at approval time.

## 6. GM HTTP surface

GM/Admin only:

```text
GET   /api/gm/non-damage-status-profiles
POST  /api/gm/non-damage-status-profiles
PATCH /api/gm/non-damage-status-profiles/:profileId
```

No Player route is added.

All writes require same-origin validation.

## 7. Explicit non-goals

This authority MUST NOT:

- insert or update `runtime_status_effects`
- consume a Settlement Decision
- apply a Status
- alter duration, strength or Effect Profile values at Runtime
- consume MP
- consume Action / Move
- apply damage or healing
- move a token
- execute an Ability
- choose a Great Failure deviation target
- settle Basic Skill growth
- execute arbitrary JSON paths, JavaScript or SQL

## 8. Next authority boundary

The next safe adapter is:

```text
immutable Non-damage Settlement
+ READY Non-damage Status Application Profile
→ Runtime Status application
```

That adapter must:

1. consume the stored Settlement rather than recompute Great interactions;
2. refuse `BLOCKED` and unresolved `GM_DECISION_REQUIRED` outcomes;
3. use the Profile's pinned Definition version;
4. apply `primary_effect_multiplier` to only the approved primary field;
5. call the existing Status Runtime stacking/version/audit authority rather than writing a second Status engine;
6. remain idempotent by Settlement + Profile application identity.

Until that adapter exists, Profiles are approval records only.
