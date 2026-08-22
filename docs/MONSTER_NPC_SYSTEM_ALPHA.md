# Monster / NPC System — Alpha

> Status: Canonical Alpha Rule  
> Date: 2026-08-22  
> Scope: Structural model for Simplified Monsters, Elite/Boss profiles and Full Character NPCs. Read with `MONSTER_LEVEL_SCALING_ALPHA.md`, `MONSTER_ATTACK_PROFILE_ALPHA.md`, and `GM_MONSTER_MANAGEMENT_ALPHA.md`.

---

# 1. Hybrid Model

Alpha uses a **Hybrid Monster / NPC Model**.

Ordinary / disposable Monsters use the Simplified Monster Profile with exactly six mandatory core Attributes:

```text
STR
DEX
CON
POW
INT
SIZ
```

`APP / EDU / LUCK` are not mandatory.

Elite and Boss enemies may use richer Monster Profiles where mechanics require them. Important / persistent NPCs may use the Full Character Model.

---

# 2. Natural / Effective Attribute Layers

Each spawn rolls the six Template ranges independently.

```text
Template Roll
→ Elite Bonus, if any
→ Natural Attribute
→ Monster Level Scaling
→ Effective Attribute
```

Canonical Level scaling:

```text
GlobalGrowth(Level)
= ((Level - 1) / 21.7)^2

Effective Attribute
= round(
    Natural Attribute
    × [1 + GlobalGrowth(Level) × Attribute Growth Weight]
  )
```

Each Template has independent Growth Weights for STR / DEX / CON / POW / INT / SIZ.

---

# 3. Elite Generation

Each Ordinary Monster independently rolls:

```text
Elite Chance = 10%
```

If Elite:

```text
Elite Attribute Bonus = one random integer +1..+5
```

The same rolled bonus is added to all six base Attributes before Natural Attributes are finalized, then Level-scaled normally.

---

# 4. Locked Monster Resources

```text
Calculated Max HP
= ceil((Effective CON + Effective SIZ) / 2)

Calculated Max MP
= Effective INT × 3
```

Neither receives a second application of the global Attribute Level curve.

GM may perform final instance-level Max / Current HP and MP adjustments while calculated values remain preserved.

---

# 5. Dedicated Monster Skills

Simplified Monster offensive actions use dedicated **Monster Skill Profiles** rather than the Player weapon-proficiency progression model.

A Skill may define:

```text
Name
Stored Accuracy
Damage Type
Template Base Damage
Damage Growth Weight
Template Lower Spread
Template Upper Spread
Damage Attribute Links
Lower Attribute Ratio
Upper Attribute Ratio
Range / targeting
Status / special effects
MP cost
Cooldown
Usage restrictions
```

For standard damaging Skills, the default ratios are:

```text
Lower Attribute Ratio = 0.10
Upper Attribute Ratio = 0.50
```

GM may override either value per Skill.

---

# 6. Independent Accuracy with Over-100 Storage

Monster Skill Accuracy is independent and is not derived from Monster Attributes.

Stored Accuracy may exceed `100`.

```text
Modified Accuracy
= Stored Accuracy + Total Hit Modifier

Effective Accuracy
= min(100, Modified Accuracy)
```

Only Effective Accuracy enters the ordinary D100 threshold.

Accuracy above 100 acts as reserve against future negative modifiers.

Monster Skill Accuracy is not subject to the Player natural Skill cap of 98.

Raw D100 extremes remain:

```text
1   → Great Failure
100 → Great Success
```

These extreme results take precedence over the ordinary threshold.

---

# 7. Damage Attribute Links

Monster Skill Accuracy is independent, but Skill damage may explicitly link to Monster Attributes.

Each damaging Skill may select zero, one or multiple:

```text
STR
DEX
CON
POW
INT
SIZ
```

Use current **Effective Attributes**.

For one selection:

```text
Damage Attribute Basis
= selected Effective Attribute
```

For multiple selections:

```text
Damage Attribute Basis
= sum(selected Effective Attributes)
  / number of selected Attributes
```

This basis contributes to Skill damage, not Skill Accuracy.

---

# 8. Locked Skill Base-Damage Level Scaling

The Monster Skill Base Damage retains one dedicated Level-growth term:

```text
MonsterDamageGrowth(Level)
= 7 × ((Level - 1) / 99)^1.5
```

Per damaging Skill:

```text
Calculated Base Damage
= round(
    Template Base Damage
    × [1 + MonsterDamageGrowth(Level) × Damage Growth Weight]
  )
```

Standard `Damage Growth Weight = 1.0` gives 1× at Lv1 and 8× at Lv100.

This is the only dedicated Monster Level curve in the Skill damage-range subsystem.

---

# 9. Locked Attribute-Ratio Damage Range

The older Lower / Upper variance Level-growth architecture is superseded.

Each damaging Skill may instead store:

```text
Template Lower Spread
Template Upper Spread
Lower Attribute Ratio
Upper Attribute Ratio
```

Canonical Attribute contributions:

```text
Attribute-derived Lower Contribution
= round(Damage Attribute Basis × Lower Attribute Ratio)

Attribute-derived Upper Contribution
= round(Damage Attribute Basis × Upper Attribute Ratio)
```

Canonical range formulas:

```text
Calculated Minimum Raw Damage
= max(
    0,
    Calculated Base Damage
    - Template Lower Spread
    - Attribute-derived Lower Contribution
  )

Calculated Maximum Raw Damage
= Calculated Base Damage
  + Template Upper Spread
  + Attribute-derived Upper Contribution
```

If no Damage Attribute Links are selected, both Attribute-derived contributions are `0`.

---

# 10. Locked Damage-Band Asymmetry and Defaults

The fixed/base damage is intended to have both downward and upward fluctuation, but the two directions do not scale equally.

Canonical standard defaults:

```text
Lower Attribute Ratio = 0.10
Upper Attribute Ratio = 0.50
```

Canonical intent:

```text
low roll
→ may still produce damage below Calculated Base Damage

high roll
→ may produce damage above Calculated Base Damage

as Monster power rises
→ low-roll penalty grows only modestly
→ high-roll bonus grows much more strongly
```

Example with `Damage Attribute Basis = 65`:

```text
Lower Contribution = 7
Upper Contribution = 33
```

This means late-game damage can still roll low, but the reduction below Base Damage remains far smaller than the possible increase above Base Damage.

GM may override the default ratios for intentionally unusual Skills.

---

# 11. Why the Range Uses Attributes Instead of Another Level Curve

Monster Level already affects damage through:

```text
Level
→ MonsterDamageGrowth(Level)
→ Calculated Base Damage
```

and:

```text
Level
→ Effective Attributes
→ Damage Attribute Basis
→ Attribute-derived Lower / Upper Contribution
```

Therefore the standard Simplified Monster Skill does not add another Lower / Upper Level-growth curve.

This avoids triple Level scaling while allowing the high-end upside to grow substantially faster than the low-end downside.

---

# 12. Full Spawn Pipeline

```text
1. Read Template
2. Roll six Attributes independently
3. Roll Elite check
4. Apply Elite Bonus if any
5. Save Natural Attributes
6. Apply Level curve + six Attribute Growth Weights
7. Save Effective Attributes
8. Calculate HP / MP
9. Attach Monster Skills
10. Preserve Stored Accuracy values, including >100
11. Resolve each Skill's selected Damage Attribute Links
12. Calculate Damage Attribute Basis values
13. Calculate Level-adjusted Skill Base Damage
14. Calculate Attribute-derived Lower / Upper Contributions
15. Calculate Minimum / Maximum Raw Damage
16. Allow GM final adjustments
17. Save/use instance
```

Group spawn runs the full pipeline independently for every Monster.

---

# 13. GM / D1 Requirements

D1 must preserve enough data to distinguish:

```text
Monster Template
→ Attribute ranges / Growth Weights
→ Skill definitions
→ Stored Accuracy
→ Template Base Damage / Damage Growth Weight
→ Template Lower / Upper Spread
→ Damage Attribute Links
→ Lower / Upper Attribute Ratio

Monster Instance
→ Level
→ base rolls
→ Elite result / bonus
→ Natural Attributes
→ Effective Attributes
→ calculated HP / MP
→ per-Skill Accuracy calculations
→ per-Skill raw D100 / extreme-result state when resolved
→ per-Skill linked Attribute values / Basis
→ calculated Base Damage
→ Attribute-derived Lower / Upper Contribution
→ calculated / final damage range
→ GM overrides
→ final state
```

Changing Level recalculates Effective Attributes from preserved Natural values and never rerolls Natural Attributes.

---

# 14. GM Final Adjustment

GM may adjust a generated Monster Instance after automatic generation and calculation.

Instance adjustment does not mutate the reusable Template unless GM explicitly edits it.

Template, calculated and GM-adjusted layers should remain auditable.

---

# 15. Current Unresolved Items

Resolve separately:

1. whether Monster Skill Accuracy itself automatically scales with Level;
2. Boss-specific generation / modifiers beyond the ordinary Elite rule;
3. Skill status / Resistance / Immunity details;
4. Monster EXP rewards;
5. NPC progression behaviour;
6. encounter difficulty contribution.
