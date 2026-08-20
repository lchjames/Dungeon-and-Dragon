# Custom Ability Scaling & Composite Effect Rules — Alpha

> Status: Alpha structural specification.
> Purpose: define how AI-created abilities scale when they contain multiple projectiles, repeated effects, area effects, healing, control or other composite mechanics.
> Rank 1–9 now uses a canonical ×3 relative Power Index. Exact conversion from Power Index into damage, healing, control, range, area, duration and other effect weights remains Alpha tuning data.

---

# 1. Three Separate Questions

Every custom ability is resolved by separating three different questions:

```text
1. Can the Character use/control this ability reliably?
2. How much total mechanical power may this ability contain?
3. How is that total power divided between damage, healing, targets, projectiles, area, duration and control effects?
```

These questions must not be collapsed into one raw damage formula.

---

# 2. Core Scaling Responsibilities

Use different sources of authority:

```text
Relevant Skill Value
→ reliability / check value / control complexity

Rank 1–9 + ×3 Power Index + Reference Table
→ normal total power budget

SPECIAL + approved MP amount
→ special total power budget

Ability Definition
→ how that budget is distributed
```

Therefore a high Fire Magic value does not simply multiply every Fire Spell's damage by a percentage.

`SPECIAL` is not Rank 10. It is a separate non-numeric level whose overall power is justified primarily by the approved MP amount rather than by a normal Rank 1–9 budget.

---

# 3. Universal Check Equation Remains Unchanged

All Skill-based checks continue to use:

```text
Final Check = Skill Value + Source Bonus + Buff/Debuff Modifier
```

Example:

```text
Fire Magic 55
Chain Fireball Source Bonus -5
Temporary Buff +3
Final Check = 53
```

Custom Ability creation must not introduce a second unrelated hit equation.

---

# 4. Reference Output vs Character Scaling

The canonical Reference Ability provides the starting mechanical scale.

Example:

```text
Fireball Reference
→ baseline damage
→ baseline MP
→ baseline target pattern
→ baseline range
→ baseline Rank
```

A derivative ability such as `Chain Fireball` should begin from Fireball as its closest reference rather than inventing damage from nothing.

However, the derivative ability does NOT automatically receive:

```text
N projectiles × full Fireball damage
```

unless its Rank, MP cost and total power budget are high enough to support that total output.

For `SPECIAL`, the approved MP amount becomes the primary budget reference, while comparable approved abilities remain useful secondary references.

---

# 5. Total Power Budget Rule

Every normal Ability Rank has one total Power Budget.

The AI spends that budget across mechanical dimensions such as:

```text
Damage
Healing
Projectile Count
Target Count
Area
Range
Duration
Stun
Blind
Slow
Push / Pull / Forced Position
Defence
Buff / Debuff
Summon
Terrain / environmental effect
Reliability / Source Bonus
Special rule exceptions
```

Increasing one dimension consumes budget that cannot simultaneously be spent elsewhere without:

- increasing Rank;
- increasing MP/resource cost;
- adding a restriction/cooldown/risk;
- reducing another output dimension.

Exact conversion weights between the abstract Power Index and individual effect dimensions remain Alpha tuning data.

For `SPECIAL`, the same one-budget principle applies, but the approved MP amount is used as the primary scale instead of a fixed Rank budget.

A high-MP control ability can therefore justify strong control even if it deals little or no damage. Likewise, a high-MP damage ability cannot also receive equally extreme area, duration and control for free.

## 5.1 Rank 1–9 Canonical Power Index

Rank 1 is the reference unit:

```text
Rank 1 Power Index = 1
```

Each additional Rank multiplies the total Power Index by 3:

```text
Power Index(Rank) = 3^(Rank - 1)
```

| Rank | Power Index | Relative to previous Rank |
|---:|---:|---:|
| 1 | 1 | — |
| 2 | 3 | ×3 |
| 3 | 9 | ×3 |
| 4 | 27 | ×3 |
| 5 | 81 | ×3 |
| 6 | 243 | ×3 |
| 7 | 729 | ×3 |
| 8 | 2,187 | ×3 |
| 9 | 6,561 | ×3 |

This is an abstract **total ability Power Budget index**, not a direct damage multiplier.

Therefore:

```text
Rank 5 Power Index = 81
```

may be spent mainly on high single-target damage, or divided among lower damage + area + control + duration + multiple targets.

Likewise:

```text
Rank 9 Power Index = 6561
```

does **not** automatically mean `Rank 1 damage × 6561`.

The ×3 rule means the complete mechanical package of the next Rank has approximately three times the available abstract budget before the budget is distributed among its effects.

## 5.2 Relationship to MP Reference

The normal Rank MP Reference remains separate from the Power Index:

| Rank | Default MP | Power Index |
|---:|---:|---:|
| 1 | 1 | 1 |
| 2 | 5 | 3 |
| 3 | 10 | 9 |
| 4 | 20 | 27 |
| 5 | 40 | 81 |
| 6 | 80 | 243 |
| 7 | 160 | 729 |
| 8 | 320 | 2,187 |
| 9 | 640 | 6,561 |

MP is resource cost; Power Index is total mechanical power budget. They are deliberately not the same curve.

For `SPECIAL`, AI + GM use the approved MP amount together with these normal Rank anchor points to justify an appropriate total Power Budget. `SPECIAL` may sit between normal Rank references or exceed Rank 9 without being renamed Rank 10.

---

# 6. Composite Ability Decomposition

AI should internally decompose a custom Ability into effect modules.

Example:

```text
Chain Fireball

Base Module:
FIRE direct damage

Composite Modules:
+ multiple projectiles
+ possible multiple targets
+ possible same-target focus
```

Another example:

```text
Thunder Prison

Base Module:
LIGHTNING damage

Composite Modules:
+ area
+ stun
+ movement restriction
+ duration
```

This decomposition is used for balancing. The Player does not need to configure these modules manually.

---

# 7. Projectile / Repetition Count Rule

For any Ability that creates multiple independent projectiles, strikes, pulses, summons or repeated instances, the final count is limited by three caps:

```text
Final Count = minimum of:

A. Concept Count
B. Control Capacity
C. Power-Budget Capacity
```

## 7.1 Concept Count

The AI interprets the Ability name and selected effect-range/target pattern.

Examples:

```text
Fireball
→ normally one projectile

Chain Fireball
→ multiple projectiles

Seven-Star Flame
→ name may imply a specific multi-instance concept
```

The AI proposes the interpreted count to the Player before submission to GM.

## 7.2 Control Capacity

Control Capacity is derived from the relevant Skill Value.

Higher Skill means the Character can reliably manage more independent projectiles/targets or more complex simultaneous control.

Conceptually:

```text
low Skill
→ few independent objects / simple trajectories

high Skill
→ more simultaneous objects / targets / trajectories
```

The exact Skill-value-to-Control-Capacity thresholds are Alpha tuning values.

Control Capacity is intentionally not a direct damage multiplier.

## 7.3 Power-Budget Capacity

Even if the Character can mentally control many projectiles, the Ability's total power budget may not have enough output to make every projectile powerful.

For Rank 1–9, the ×3 Rank Power Index is the main total-budget reference.

For `SPECIAL`, the approved MP amount is the main reference.

---

# 8. Chain Fireball Example

Suppose the system contains a balanced Fireball reference.

A Player creates:

```text
Name: Chain Fireball
Effect Range / Pattern: Multiple Targets
```

The AI resolves:

```text
Closest Reference:
Fireball

Relevant Skill:
Fire Magic

Requested Concept:
Multiple Fireball-like projectiles
```

The AI then determines:

```text
Projectile Count
Per-Projectile Damage
Total Potential Damage
MP Cost
Source Bonus
Target Rules
Same-Target Rules
Suggested Rank / SPECIAL where appropriate
```

The important invariant is:

```text
More projectiles are not free.
```

At the same Rank as the base Fireball, adding projectiles normally requires some combination of:

```text
lower damage per projectile;
higher MP cost;
lower Source Bonus / harder control;
restricted target rules;
reduced range;
other limitations.
```

At a higher Rank, the spell may preserve more of the original Fireball damage per projectile.

---

# 9. Damage Source Rule for Derivative Abilities

When a custom Ability is recognisably derived from an existing reference, use the reference as the starting output scale.

Example:

```text
Chain Fireball
→ Fireball reference damage is the starting unit
```

But the final damage is produced after applying the composite budget allocation.

Conceptually for Rank 1–9:

```text
Reference Output
      ↓
×3 Rank Power Index
      ↓
Mastery / Character Scaling
      ↓
Composite Allocation
      ↓
Final Per-Projectile / Per-Target Output
```

Conceptually for `SPECIAL`:

```text
Reference Output
      ↓
Approved MP Amount
      ↓
Special Power Budget
      ↓
Composite Allocation
      ↓
Final Effect Package
```

Do not use raw Skill value as an unlimited damage multiplier, and do not multiply full reference output by instance count without budget validation.

---

# 10. Character Skill Scaling

Relevant Skill Value should matter beyond hit chance, but only through a bounded Mastery layer.

The Skill may influence:

```text
Control Capacity
Source Bonus / reliability
ability to sustain complex effects
small bounded output improvement
MP efficiency where appropriate
access to more difficult custom designs
```

It should NOT create unlimited linear damage scaling.

For Alpha, use Skill bands / Mastery tiers rather than multiplying damage directly by the raw Skill percentage.

---

# 11. One Cast = One Ability Resolution by Default

For simplicity, one custom spell cast normally uses one Ability check.

```text
Final Check = relevant Skill + Source Bonus + Buff/Debuff
```

The Ability profile then determines how its approved projectiles/targets/effects resolve.

Do not require a completely separate Skill formula for every projectile by default.

---

# 12. Same-Target vs Multi-Target Allocation

A multi-projectile Ability may support:

```text
SPLIT
→ distribute projectiles across different valid targets

FOCUS
→ multiple projectiles may strike one target

FLEXIBLE
→ Player chooses how to distribute them
```

The AI must include this targeting rule in the proposal.

Same-target focus is never allowed to bypass the total Power Budget merely because the Ability visually contains multiple projectiles.

---

# 13. Repeated Damage / Healing Uses the Same Rule

The same structure applies to effects over time.

Example:

```text
Burning Field
Damage per tick × number of ticks × expected targets
```

or:

```text
Regeneration
Healing per tick × duration × expected targets
```

Repeated ticks consume Power Budget in the same way that repeated projectiles do.

---

# 14. Control Effects Also Consume Budget

Effects such as:

```text
Stun
Blind
Silence
Root
Slow
Push
Pull
Knockback
Forced movement
Position swap
Disarm
```

are part of the same Ability budget.

Control power is a first-class use of Power Budget. It does not need to be translated into fake damage to be valued.

For `SPECIAL`, a large approved MP amount can justify a powerful control package even where direct damage is low or zero.

---

# 15. Player Creation Input Remains Minimal

Player custom creation still asks only for the agreed creative inputs:

```text
1. Ability Name
2. Effect Range / Target Pattern
```

The Player does not manually enter authoritative Rank, MP Cost, Damage, Healing, control strength or other balance values.

AI proposes these values. For concepts that do not fit Rank 1–9 well, AI may propose `SPECIAL` together with an MP amount and complete effect package.

---

# 16. AI Proposal Must Be Structured

For a multi-effect Ability the AI proposal should include at least:

```text
Name
Element / Family
Relevant Skill
Suggested Rank or SPECIAL
Power Index / Special Power Budget Reference
Source Bonus
MP Cost
Target Pattern
Target Count
Projectile / Instance Count
Range
Area
Duration
Damage / Healing
Damage Type
Status / Control Effects
Same-Target Rule
Restrictions
Closest References
Balance Explanation
```

Only a Player-confirmed proposal is sent to GM.

---

# 17. Deterministic Validation After AI

AI is responsible for interpreting and proposing, but a deterministic rules layer should validate the structured result before Player confirmation.

At minimum validate:

```text
Rank is 1–9 or SPECIAL
Rank 1–9 uses the configured ×3 Power Index
MP/resource values are non-negative
SPECIAL has an approved/proposed MP amount
projectile/instance count does not exceed configured caps
effect types are recognised
no fractional indivisible outputs where prohibited
total composite output is within configured Rank or SPECIAL-MP tolerance
no repeated full-reference multiplication without sufficient budget
Character meets required Skill/Rank prerequisites
```

If validation fails, the proposal is regenerated or flagged rather than silently accepted.

---

# 18. SPECIAL Runtime Rule

`SPECIAL` does not require AI on every cast.

During creation/modification:

```text
MP amount
→ compare against normal Rank MP + Power anchor points
→ AI/GM derives and approves one complete Power Package
→ save mp_cost + Effect Profile in D1
```

During play:

```text
read stored mp_cost
→ pay MP
→ resolve stored Effect Profile
```

Alpha therefore treats SPECIAL as MP-driven at design time, not as an open-ended runtime calculation.

Variable-MP SPECIAL abilities can be designed later if needed; they are not the Alpha default.

---

# 19. Alpha Locked Direction

1. Relevant Skill controls reliability and complexity; it is not a raw linear damage multiplier.
2. Rank 1–9 uses `Power Index = 3^(Rank - 1)` as the canonical relative total Power Budget curve.
3. Rank 1–9 Power Index is `1 / 3 / 9 / 27 / 81 / 243 / 729 / 2187 / 6561`.
4. Power Index is an abstract total mechanical budget, not a direct damage multiplier.
5. `SPECIAL` is a separate non-numeric level, not Rank 10.
6. For `SPECIAL`, approved MP amount is the primary reference used to justify total Power Budget against the normal Rank anchor points.
7. Total Power includes Damage, Healing, Control, Area, Target Count, Duration, Movement, Buff/Debuff and other mechanical effects.
8. Control-heavy SPECIAL abilities can consume large Power Budget without needing high direct damage.
9. Custom composite abilities divide one total budget among all effects; multiple outputs are never free copies.
10. Multiple projectiles, targets or ticks are not free copies of the base reference effect.
11. A derivative spell uses the closest canonical reference as a starting output scale.
12. One cast uses one Ability check by default.
13. Player still supplies only Ability Name and Effect Range/Target Pattern.
14. AI generates the complete mechanical proposal; Player confirms; GM is final authority.
15. SPECIAL is resolved from stored `mp_cost + Effect Profile` during play; no per-cast AI calculation is required.
16. Variable-MP SPECIAL abilities are not the Alpha default.
