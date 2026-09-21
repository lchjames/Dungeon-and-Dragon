# Non-damage Effect Settlement Decision Authority — Alpha

> Status: Canonical Alpha Runtime integration rule  
> Scope: converts one committed Shared Opposed D100 audit into one immutable non-damage effect settlement decision.  
> This slice records the mechanical decision only. It does **not** apply a Status, damage, healing, movement, Action / Move, MP, or Ability effect.

## 1. Authority boundary

The canonical flow in this slice is:

```text
Basic Skill D100
→ Shared Opposed D100
→ Non-damage Effect Settlement Decision
→ future approved effect application adapter
```

An Opposed D100 result is not itself an applied effect.

A Settlement Decision is also not itself an applied effect.

The settlement authority answers only:

- did the original target receive the effect, get protected, or require GM deviation adjudication?
- did Source Great Success double the one approved primary effect field?
- did either side produce a Great marker that matters to adjudication?
- did the special 1-vs-1 double-Great-Failure override occur?
- what is the full Result gap and the clamped narrative gap?

## 2. Input authority

A settlement MUST reference one existing row in:

```text
basic_skill_opposed_check_log
```

The server loads the linked source and resistance rows from:

```text
character_skill_check_log
```

The client does not submit:

- comparison
- breakthrough
- raw rolls
- Result values
- Great flags
- multiplier
- outcome

Those fields are recomputed from committed D1 audit.

If the old Opposed audit comparison or Great markers do not match canonical recomputation, settlement fails closed.

## 3. Ordinary Result comparison

For a forced / negative non-damage effect:

```text
Source Result > Resistance Result
→ strict breakthrough

Source Result < Resistance Result
→ resistance wins

Source Result = Resistance Result
→ resistance priority
→ original negative effect is blocked
```

Raw 100 does not bypass this comparison. In particular, **100 vs 100** still compares final Result normally; an exact Result tie is blocked by resistance priority.

## 4. Narrative Result gap

The full mechanical gap is preserved:

```text
result_gap
= source_result - resistance_result
```

Narrative strength uses:

```text
narrative_gap
= clamp(result_gap, -20, +20)
```

This clamp never changes winner, breakthrough, multiplier, or any effect value.

## 5. Source Great Success

If:

```text
source raw D100 = 100
AND original target actually receives the effect
```

then:

```text
primary_effect_multiplier = 2
```

Only the approved `primary_effect_field` may eventually use this multiplier.

This does not mean every Profile field doubles.

If Source raw 100 loses or is blocked by a tie:

```text
source_great_success = true
source_great_success_applied = false
primary_effect_multiplier = 1
```

## 6. Source Great Failure

If:

```text
source raw D100 = 1
```

and Resistance raw roll is not also 1:

```text
outcome = SOURCE_DEVIATION_REQUIRED
original_target_resolution = GM_DECISION_REQUIRED
primary_effect_multiplier = 1
gm_resolution_required = true
```

The runtime MUST NOT invent a global SELF_TARGET rule.

It also MUST NOT automatically choose:

- self
- ally
- another enemy
- object
- environment point
- wasted effect
- reversed direction

Those are contextual GM / AI adjudication candidates.

## 7. Resistance Great Success

If Resistance raw D100 = 100 and resistance actually wins, including tie priority:

```text
defense_great_success = true
```

This records perfect defense / resistance metadata only.

It does not automatically create:

- a free Buff
- a free counterattack
- free movement
- a fixed +X bonus

Any such mechanical benefit requires a later explicit rule and GM acceptance.

## 8. Resistance Great Failure

Resistance raw D100 = 1 records:

```text
defense_great_failure = true
```

It does not automatically double the Source effect.

In particular:

```text
Source raw 100 + Resistance raw 1
→ at most primary_effect_multiplier = 2
→ never ×4
```

## 9. Double Great Failure override

The canonical special override is:

```text
Source raw 1
Resistance raw 1
→ two errors cancel
→ original intended target receives the effect
→ normal strength
```

Therefore:

```text
outcome = DOUBLE_FAILURE_ACCIDENTAL_SUCCESS
original_target_resolution = APPLIES
primary_effect_multiplier = 1
double_failure_override = true
gm_resolution_required = false
```

This is the one current Great interaction that may override ordinary Result winner for the original effect.

## 10. Canonical outcomes

The Alpha settlement outcome vocabulary is:

```text
EFFECT_BLOCKED
EFFECT_APPLIES_NORMAL
EFFECT_APPLIES_DOUBLE_PRIMARY
SOURCE_DEVIATION_REQUIRED
DOUBLE_FAILURE_ACCIDENTAL_SUCCESS
```

Original-target resolution vocabulary:

```text
APPLIES
BLOCKED
GM_DECISION_REQUIRED
```

## 11. D1 authority and idempotency

The authoritative table is:

```text
non_damage_effect_settlement_log
```

One Opposed D100 audit may have at most one settlement:

```text
UNIQUE(opposed_check_id)
```

Settlement rows are immutable.

```text
UPDATE → NON_DAMAGE_EFFECT_SETTLEMENT_IMMUTABLE
DELETE → NON_DAMAGE_EFFECT_SETTLEMENT_IMMUTABLE
```

Retrying the same Opposed audit returns the existing settlement with:

```text
idempotent = true
```

It does not create a second decision.

## 12. GM HTTP surface

GM-only:

```text
GET  /api/gm/non-damage-effect-settlements
POST /api/gm/non-damage-effect-settlements
```

POST accepts only:

```json
{
  "opposedCheckId": "...",
  "meaningfulReason": "...",
  "context": {}
}
```

No Player write route exists in this slice.

## 13. Explicit non-goals

This authority MUST NOT:

- insert or update `runtime_status_effects`
- apply damage
- apply healing
- move a token
- consume Action or Move
- consume MP
- execute an Ability
- invent an Effect Profile
- choose a Great Failure deviation target
- grant an automatic defense Great benefit
- settle Basic Skill growth

## 14. Next authority boundary

The next safe layer is:

```text
Approved Settlement
+ approved Effect / Status Profile
→ Runtime Status application adapter
```

That adapter must consume this immutable settlement rather than recomputing Great interaction independently.

It must still respect the Status Runtime Foundation stacking/version/audit authority.

Until the approved Effect Profile boundary is fully wired, this settlement remains a decision record only.
