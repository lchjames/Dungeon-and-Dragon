# GM Monster Management — Alpha

> Status: Canonical Alpha Rule  
> Date: 2026-08-22  
> Scope: Defines the GM-facing Monster Management workspace for the Hybrid Monster/NPC system, including dedicated Monster Skills, fixed over-100 Accuracy storage, Attribute-linked damage, Level-generated signed Damage Spread Ranges, and GM correction / overrides.

---

# 1. Dedicated GM Workspace

The GM workspace must include a dedicated `Monster Management` page/tab for:

```text
Monster Templates
Monster Skill Profiles
spawned Monster Instances
instance-level GM adjustments
```

All persistent Monster data is D1-authoritative.

---

# 2. Monster Template Attributes

Required Simplified Monster Attribute configuration:

```text
STR min / max + STR Growth Weight
DEX min / max + DEX Growth Weight
CON min / max + CON Growth Weight
POW min / max + POW Growth Weight
INT min / max + INT Growth Weight
SIZ min / max + SIZ Growth Weight
```

Template editing must not silently erase spawned-instance history.

---

# 3. Spawn Workflow

For every spawned instance:

```text
1. Roll STR / DEX / CON / POW / INT / SIZ independently from Template ranges
2. Roll 10% Elite check
3. If Elite, roll one +1..+5 Elite Bonus and add it to all six Attributes
4. Save post-Elite values as Natural Attributes
5. Calculate GlobalGrowth(Level) = ((Level - 1) / 21.7)^2
6. Apply six Attribute Growth Weights
7. Calculate Effective Attributes
8. Calculate Max HP = ceil((Effective CON + Effective SIZ) / 2)
9. Calculate Max MP = Effective INT × 3
10. Attach approved Monster Skill Profiles
11. Preserve each Skill's Stored Accuracy exactly; Monster Level does not scale it
12. Resolve Damage Attribute Links against current Effective Attributes
13. Calculate Damage Attribute Basis
14. Calculate MonsterDamageGrowth(Level) = 7 × ((Level - 1) / 99)^1.5
15. Calculate Level-adjusted Base Damage
16. Calculate Damage Center = Calculated Base Damage + Damage Attribute Basis
17. Generate System Suggested Spread Min / Max from Monster Level
18. Apply GM Spread Min / Max correction or override
19. Save Final Spread Min / Max
20. On hit, roll one signed Spread Roll inside the Final range
21. Calculate Raw Damage
22. Save instance / combat state
```

Group spawn runs the complete generation pipeline independently for every Monster.

---

# 4. Resource Handling

```text
Calculated Max HP = ceil((Effective CON + Effective SIZ) / 2)
Calculated Max MP = Effective INT × 3
```

HP/MP do not receive the global Level curve a second time because Effective Attributes already include Level scaling.

GM may adjust final/current HP and MP at instance level while calculated and manual values remain separate.

---

# 5. Monster Skill Profile Fields

Each Monster Skill Profile may expose:

```text
Skill Name
Stored Accuracy
Damage Type
Template Base Damage
Damage Growth Weight
Damage Attribute Links
Range / Reach
Targeting
Status / special-effect links
MP cost
Cooldown
Usage restrictions
Other approved flags
```

The former standard fields are superseded and must not be required:

```text
Template Lower Spread
Template Upper Spread
Final Lower Spread
Final Upper Spread
Lower Attribute Ratio
Upper Attribute Ratio
Lower Variance Growth Weight
Upper Variance Growth Weight
```

Standard Spread is generated from Monster Level and then corrected by GM rather than being fully dictated by fixed Skill-side Min / Max inputs.

---

# 6. Accuracy Rules — No Automatic Level Scaling

Stored Skill Accuracy may exceed 100.

Canonical rule:

```text
Monster Level changes
→ Stored Accuracy remains unchanged
```

Example:

```text
Stored Accuracy = 80
Lv1   → 80
Lv50  → 80
Lv100 → 80
```

Accuracy may change only through explicit authorised sources such as Profile edits, GM override, Buff / Debuff, Status, Skill properties, or other explicit Accuracy modifiers.

Runtime:

```text
Modified Accuracy
= Stored Skill Accuracy + Total Hit Modifier

Effective Accuracy
= min(100, Modified Accuracy)
```

Monster Skill Accuracy is not subject to the Player natural Skill cap of 98.

Raw D100 extremes remain:

```text
1   → Great Failure
100 → Great Success
```

These extreme results take precedence over the ordinary threshold.

GM UI must not present a calculated `Accuracy after Level scaling` field because no such standard calculation exists.

---

# 7. Damage Attribute Links — GM Multi-Select

Each damaging Skill may provide:

```text
☐ STR
☐ DEX
☐ CON
☐ POW
☐ INT
☐ SIZ
```

Selecting no Attribute is valid for a purely Profile-defined damage Skill.

For one selected Attribute:

```text
Damage Attribute Basis
= selected Effective Attribute
```

For multiple selected Attributes:

```text
Damage Attribute Basis
= sum(selected Effective Attributes)
  / selected Attribute count
```

This basis modifies damage only, not Accuracy.

---

# 8. Locked Skill Base-Damage Level Curve

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

Standard Weight `1.0` reaches 8× Template Base Damage at Level 100.

---

# 9. Locked Damage Center Formula

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

# 10. Level-Generated Signed Damage Spread Range

Spread is one signed interval:

```text
[Final Spread Min, Final Spread Max]
```

The system first generates an approximate range from Monster Level:

```text
Monster Level
→ Spread Generation Rule / Tuning Table
→ System Suggested Spread Min
→ System Suggested Spread Max
```

The GM then corrects the generated range:

```text
System Suggested Spread Min
+ GM Min Adjustment / Override
→ Final Spread Min

System Suggested Spread Max
+ GM Max Adjustment / Override
→ Final Spread Max
```

Canonical validation:

```text
Final Spread Min <= Final Spread Max
```

Runtime:

```text
Spread Roll
= random integer from Final Spread Min to Final Spread Max, inclusive

Raw Monster Damage
= max(0, Calculated Damage Center + Spread Roll)
```

Displayed limits:

```text
Calculated Minimum Raw Damage
= max(0, Calculated Damage Center + Final Spread Min)

Calculated Maximum Raw Damage
= max(0, Calculated Damage Center + Final Spread Max)
```

---

# 11. Spread Generation Is a Starting Point, Not Final Authority

Canonical responsibility split:

```text
System
→ gives GM a quick Level-appropriate approximate Spread Range

GM
→ reviews the actual Monster / Skill context
→ manually corrects either boundary where needed
```

Examples such as:

```text
low Level  → about [-2, +2]
high Level → about [-5, +15]
```

represent intended qualitative direction only, not a locked Level table.

---

# 12. Alpha Tuning / Future Balance

The exact Level-to-Spread formula is intentionally deferred until actual Monster and encounter content is being created and play-tested.

The implementation should therefore keep Spread generation **data-driven and easy to rebalance**.

Acceptable future tuning implementations may include Level-band tables, interpolation, curves, or another explicitly approved tuning model, provided the Canonical architecture remains:

```text
Level
→ Suggested Spread
→ GM correction
→ Final Spread
```

---

# 13. Spread Design Intent

Standard progression may shift from roughly symmetric low-Level ranges toward increasingly positive-skewed high-Level ranges.

```text
negative edge
→ may expand modestly

positive edge
→ may expand more strongly
```

This preserves low-roll outcomes while allowing substantially larger high-end variation later.

---

# 14. Spawned Skill Inspection

For every spawned Monster Skill, GM should be able to inspect:

```text
Skill Name
Stored Accuracy
Current Stored Accuracy / authorised override if any
active Hit Modifiers
Modified Accuracy
Effective Accuracy capped at 100
raw D100 / extreme-result state

Damage Attribute Links
current linked Effective Attribute values
Damage Attribute Basis

Template Base Damage
MonsterDamageGrowth(Level)
Damage Growth Weight
Calculated Base Damage
Calculated Damage Center

Monster Level used for Spread generation
System Suggested Spread Min
System Suggested Spread Max
GM Spread Min Adjustment / Override
GM Spread Max Adjustment / Override
Final Spread Min
Final Spread Max
Calculated Minimum Raw Damage
Calculated Maximum Raw Damage
Spread Roll when resolved
Final Raw Damage

Damage Type
Status / special-effect references
MP / cooldown / usage state
```

Changing Level must never silently mutate Stored Accuracy.

Automatic, suggested, GM-corrected and runtime values must remain visually distinguishable.

---

# 15. GM UI Requirements

Accuracy should appear as a Profile / override value rather than a Level-derived value:

```text
Stored Accuracy: 80
Level: 1 / 50 / 100
Automatic Level Accuracy Growth: OFF / N/A
```

Spread controls should display something like:

```text
Level: 1
Suggested Spread: -2 to +2
GM Min Adjustment / Override: ...
GM Max Adjustment / Override: ...
Final Spread: -2 to +2
```

GM must be able to edit the final Spread boundaries without changing the global Spread-generation tuning data.

---

# 16. Template vs Instance Editing

```text
Edit Template Skill
→ changes reusable Skill definition / future use

Edit Spawned Skill Override
→ changes only that Monster instance
```

Persistent instances must not silently lose historical calculated values or overrides after Template edits.

---

# 17. Current Unresolved Items

Monster Skill Accuracy Level scaling is resolved: **Stored Accuracy does not automatically scale with Monster Level**.

Resolve separately:

1. later Spread-generation numeric tuning during actual content creation / play balance;
2. later Elite / Boss / richer-profile exceptions where needed.
