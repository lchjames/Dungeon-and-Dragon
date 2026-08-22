# Monster / NPC System — Alpha

> Status: Canonical Alpha Rule  
> Date: 2026-08-22  
> Scope: Structural model for Simplified Monsters, Elite/Boss profiles and Full Character NPCs. Read with `MONSTER_LEVEL_SCALING_ALPHA.md`, `MONSTER_ATTACK_PROFILE_ALPHA.md`, and `GM_MONSTER_MANAGEMENT_ALPHA.md`.

---

# 1. Hybrid Model

Alpha uses a Hybrid Monster / NPC Model.

Ordinary / disposable Monsters use the Simplified Monster Profile with six mandatory core Attributes:

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

Simplified Monster offensive actions use dedicated Monster Skill Profiles.

A Skill may define:

```text
Name
Stored Accuracy
Damage Type
Template Base Damage
Damage Growth Weight
Damage Attribute Links
Range / targeting
Status / special effects
MP cost
Cooldown
Usage restrictions
```

Standard damage Spread is generated from Monster Level and then corrected by GM. Older Lower / Upper Spread, Attribute Ratio, and fixed Template Spread-bound architectures are superseded for the standard Simplified Monster flow.

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

Raw D100 extremes remain:

```text
1   → Great Failure
100 → Great Success
```

These extreme results take precedence over the ordinary threshold.

---

# 7. Damage Attribute Links

Skill damage may explicitly link to Monster Attributes.

Each damaging Skill may select zero, one or multiple:

```text
STR
DEX
CON
POW
INT
SIZ
```

Use current Effective Attributes.

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

This basis contributes to damage, not Skill Accuracy.

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

---

# 9. Locked Damage Center Model

For an Attribute-linked Skill:

```text
Calculated Damage Center
= Calculated Base Damage + Damage Attribute Basis
```

For an unlinked Skill:

```text
Damage Attribute Basis = 0
Calculated Damage Center = Calculated Base Damage
```

---

# 10. Level-Linked Signed Spread Range

Spread is one signed interval:

```text
[Final Spread Min, Final Spread Max]
```

The system generates an approximate range from Monster Level:

```text
Monster Level
→ Spread Generation Rule / Tuning Table
→ System Suggested Spread Min / Max
```

The GM then corrects the suggestion:

```text
System Suggested Spread Range
→ GM boundary adjustments / overrides
→ Final Spread Range
```

Runtime:

```text
Spread Roll
= random integer from Final Spread Min to Final Spread Max, inclusive

Raw Monster Damage
= max(0, Calculated Damage Center + Spread Roll)
```

Equivalent displayed limits:

```text
Calculated Minimum Raw Damage
= max(0, Calculated Damage Center + Final Spread Min)

Calculated Maximum Raw Damage
= max(0, Calculated Damage Center + Final Spread Max)
```

---

# 11. Spread Design Intent and Balance Authority

The generated Spread Range is deliberately approximate.

Canonical responsibility split:

```text
System
→ produces a fast Level-appropriate starting range

GM
→ makes the final content-design correction
```

Conceptually, standard progression may look like:

```text
low Level  → roughly symmetric, e.g. about [-2, +2]
high Level → more positive-skewed, e.g. about [-5, +15]
```

These are examples of shape only, not locked values.

The intended direction is:

```text
negative edge
→ expands relatively slowly

positive edge
→ may expand much more strongly
```

Actual values are expected to be tuned when real Monster, encounter, and campaign content is created and play-tested.

---

# 12. Spread Numeric Formula Is Alpha Tuning

The exact Level-to-Spread formula / table is not part of the locked core combat law yet.

It may later use:

```text
Level bands
reference-point interpolation
curve-based generation
other approved data-driven tuning
```

The implementation should keep this tuning easy to edit without rewriting the core resolver.

The invariant is:

```text
Monster Level
→ System Suggested Spread
→ GM correction
→ Final Spread
```

---

# 13. User-Confirmed Damage Shape

Conceptual low-roll examples:

```text
Lv1: 64 + 15 - 2 = 77
Lv2: 64 + 18 - 3 = 79
```

Read as:

```text
Calculated Base Damage
+ Damage Attribute Basis
+ signed Spread Roll
```

The Spread value is an offset inside one signed Level-generated range, not a separate Lower / Upper mechanic.

---

# 14. Full Spawn Pipeline

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
11. Resolve selected Damage Attribute Links
12. Calculate Damage Attribute Basis
13. Calculate Level-adjusted Skill Base Damage
14. Calculate Damage Center = Base Damage + Attribute Basis
15. Generate Suggested Spread Min / Max from Monster Level
16. Apply GM Spread correction / override
17. Save Final Spread Min / Max
18. On hit, roll one signed Spread Roll inside the Final range
19. Calculate Raw Monster Damage
20. Apply defence / resistance / other combat resolution
21. Save/use instance state
```

Group spawn runs the generation pipeline independently for every Monster.

---

# 15. GM / D1 Requirements

D1 must preserve enough data to distinguish:

```text
Monster Template
→ Attribute ranges / Growth Weights
→ Skill definitions
→ Stored Accuracy
→ Template Base Damage / Damage Growth Weight
→ Damage Attribute Links

Monster Instance / generated Skill state
→ Level
→ base rolls
→ Elite result / bonus
→ Natural Attributes
→ Effective Attributes
→ calculated HP / MP
→ per-Skill Accuracy calculations
→ per-Skill linked Attribute values / Basis
→ calculated Base Damage
→ calculated Damage Center
→ System Suggested Spread Min / Max
→ GM Spread adjustments / overrides
→ Final Spread Min / Max
→ Spread Roll when resolved
→ calculated / final Raw Damage
→ final state
```

Changing Level recalculates Effective Attributes from preserved Natural values and regenerates the suggested Spread range from the current Level; GM overrides must remain auditable rather than being silently lost.

---

# 16. GM Final Adjustment

GM may adjust a generated Monster Instance after automatic generation and calculation.

Instance adjustment does not mutate the reusable Template or global Spread tuning rule unless GM explicitly edits those sources.

System suggested values, GM corrections and final runtime values should remain auditable.

---

# 17. Current Unresolved Items

Resolve separately:

1. whether Monster Skill Accuracy itself automatically scales with Level;
2. numeric Spread-generation tuning during actual game-content creation / play balance;
3. Boss-specific generation / modifiers beyond the ordinary Elite rule;
4. Skill status / Resistance / Immunity details;
5. Monster EXP rewards;
6. NPC progression behaviour;
7. encounter difficulty contribution.
