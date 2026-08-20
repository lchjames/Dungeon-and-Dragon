# Custom Ability Scaling & Composite Effect Rules — Alpha

> Status: Alpha structural specification.
> Purpose: define how AI-created abilities scale when they contain multiple projectiles, repeated effects, area effects, healing, control or other composite mechanics.
> Exact numeric Rank budgets, Skill thresholds and effect weights may be tuned during Alpha without changing this structure.

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

Use three different sources of authority:

```text
Relevant Skill Value
→ reliability / check value / control complexity

Spell or Ability Rank + Reference Table
→ total power budget

Ability Definition
→ how that budget is distributed
```

Therefore a high Fire Magic value does not simply multiply every Fire Spell's damage by a percentage.

The same Character can become better at controlling difficult Fire spells without every low-rank spell automatically becoming an unlimited damage multiplier.

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

---

# 5. Total Power Budget Rule

Every Ability Rank has a broad total Power Budget.

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

Exact numerical weights are Alpha tuning data.

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

Even if the Character can mentally control many projectiles, the Ability's Rank may not have enough total budget to make every projectile powerful.

The AI therefore checks how many projectiles can fit while keeping the whole Ability inside its Rank budget.

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
Suggested Rank
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

Conceptually:

```text
Reference Output
      ↓
Ability Rank Budget
      ↓
Mastery / Character Scaling
      ↓
Composite Allocation
      ↓
Final Per-Projectile / Per-Target Output
```

Do not use:

```text
Final Damage = Fire Magic Skill Value × Fireball Damage
```

and do not use:

```text
Final Damage = Full Fireball Damage × Projectile Count
```

without budget validation.

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

Example concept:

```text
Fire Magic increases
→ Control Tier increases
→ more complex Fire abilities become practical
→ modest Mastery improvement may apply
```

Exact thresholds and output bonuses remain Alpha tuning values.

---

# 11. One Cast = One Ability Resolution by Default

For simplicity, one custom spell cast normally uses one Ability check.

```text
Final Check = relevant Skill + Source Bonus + Buff/Debuff
```

The Ability profile then determines how its approved projectiles/targets/effects resolve.

Do not require a completely separate Skill formula for every projectile by default.

An Ability may explicitly define independent projectile rolls later if a particular design needs that behaviour, but that is an exception rather than the default.

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

If focusing multiple projectiles on one target would make the Ability exceed its Rank budget, the AI must compensate through reduced per-projectile output, increased cost or another restriction.

Therefore same-target focus is never allowed to bypass the total Power Budget merely because the Ability visually contains multiple projectiles.

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

A three-round effect is not three rounds of full reference output for free.

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

Example:

```text
Lightning spell A
High damage, no control

Lightning spell B
Lower damage + stun chance

Lightning spell C
Very low damage + reliable displacement
```

All three may belong to the same Rank if their total packages are comparable.

---

# 15. Player Creation Input Remains Minimal

Player custom creation still asks only for the agreed creative inputs:

```text
1. Ability Name
2. Effect Range / Target Pattern
```

The current Skill Tree / magic-family context supplies the relevant Element/Skill.

The Player does not manually enter authoritative:

```text
Rank
MP Cost
Damage
Healing
Projectile Count
Stun chance
Blind chance
Push distance
Area size
Distance
Duration
Source Bonus
```

AI proposes these values.

The Player then sees the complete interpretation before anything is sent to GM.

---

# 16. AI Proposal Must Be Structured

For a multi-effect Ability the AI proposal should include at least:

```text
Name
Element / Family
Relevant Skill
Suggested Rank
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

Player options:

```text
Confirm & Send to GM
Reject
Regenerate
Rename and Regenerate
```

Only a Player-confirmed proposal is sent to GM.

---

# 17. Deterministic Validation After AI

AI is responsible for interpreting and proposing, but a deterministic rules layer should validate the structured result before Player confirmation.

At minimum validate:

```text
Rank is allowed
MP/resource values are non-negative
projectile/instance count does not exceed configured caps
effect types are recognised
no fractional indivisible outputs where prohibited
total composite output is within configured Rank tolerance
no repeated full-reference multiplication without sufficient budget
Character meets required Skill/Rank prerequisites
```

If validation fails, the proposal is regenerated or flagged rather than silently accepted.

---

# 18. Alpha Locked Direction

1. Relevant Skill controls reliability and complexity; it is not a raw linear damage multiplier.
2. Spell/Ability Rank and canonical references determine the main total Power Budget.
3. Custom composite abilities divide one total budget among damage/healing, multiplicity, targets, area, duration, control and other effects.
4. Multiple projectiles, targets or ticks are not free copies of the base reference effect.
5. A derivative spell uses the closest canonical reference as its starting output scale.
6. Final repeated-instance count is limited by concept, Character Control Capacity and Ability Power-Budget Capacity.
7. Higher relevant Skill may permit greater Control Capacity and bounded Mastery benefits.
8. Exact Skill bands, Rank budgets and effect weights are Alpha tuning values.
9. One cast uses one Ability check by default.
10. Same-target focus and multi-target splitting are explicit Ability-profile rules.
11. Control effects consume the same total Power Budget as damage/healing/area/duration.
12. Player still supplies only Ability Name and Effect Range/Target Pattern.
13. AI generates the complete mechanical proposal.
14. A deterministic validator checks AI output before Player confirmation.
15. Player confirms the proposal before it is submitted to GM.
16. GM remains the final approval authority during Alpha.
