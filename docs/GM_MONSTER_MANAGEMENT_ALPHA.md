# GM Monster Management — Alpha

> Status: Canonical Alpha Rule  
> Date: 2026-08-22  
> Scope: Defines the GM-facing Monster Management workspace for the Hybrid Monster/NPC system, including dedicated Monster Skills, over-100 Accuracy storage, Attribute-linked damage, the `Base Damage + Attribute Basis ± Spread` model, and instance overrides.

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
11. Preserve each Skill's Stored Accuracy, including values above 100
12. Resolve Damage Attribute Links against current Effective Attributes
13. Calculate Damage Attribute Basis
14. Calculate MonsterDamageGrowth(Level) = 7 × ((Level - 1) / 99)^1.5
15. Calculate Level-adjusted Base Damage
16. Calculate Damage Center = Calculated Base Damage + Damage Attribute Basis
17. Resolve Final Lower Spread / Final Upper Spread once their scaling rule is locked
18. Calculate Minimum / Maximum Raw Damage
19. Save instance
20. Permit GM final adjustments
```

Group spawn runs the complete pipeline independently for every Monster.

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
Template Lower Spread
Template Upper Spread
Damage Attribute Links
Range / Reach
Targeting
Status / special-effect links
MP cost
Cooldown
Usage restrictions
Other approved flags
```

The former fields are superseded and must not be required:

```text
Lower Attribute Ratio
Upper Attribute Ratio
Lower Variance Growth Weight
Upper Variance Growth Weight
```

---

# 6. Accuracy Rules

Stored Skill Accuracy may exceed 100.

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

The Attribute Ratio damage-band model is superseded.

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

The linked Attribute value therefore raises the central damage directly rather than widening the band indirectly.

---

# 10. Spread Applied Around the Damage Center

Canonical damage limits:

```text
Calculated Minimum Raw Damage
= max(0, Calculated Damage Center - Final Lower Spread)

Calculated Maximum Raw Damage
= Calculated Damage Center + Final Upper Spread
```

The damage roll after a successful hit is a random integer inside that range.

Spread randomisation is not a second D100 check.

---

# 11. Locked Spread Design Intent

The spread subsystem must preserve:

```text
low roll
→ can deal less than Damage Center

high roll
→ can deal more than Damage Center

higher Monster progression
→ Lower Spread may increase modestly
→ Upper Spread may increase more strongly
```

Late-game downside must remain substantially smaller than the available upside.

Conceptual design example:

```text
Lv1 low roll: 64 + 15 - 2 = 77
Lv2 low roll: 64 + 18 - 3 = 79
```

The exact formula that turns Template Lower / Upper Spread into Final Lower / Upper Spread remains unresolved.

Implementation must not reintroduce the removed Attribute Ratios or invent another hidden Level curve.

---

# 12. Spawned Skill Inspection

For every spawned Monster Skill, GM should be able to inspect:

```text
Skill Name
Stored Accuracy
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
GM Base Damage / center adjustments where authorised

Template Lower Spread
Template Upper Spread
Final Lower Spread
Final Upper Spread
Calculated Minimum Raw Damage
Calculated Maximum Raw Damage
GM lower / upper damage adjustments
Final Minimum Raw Damage
Final Maximum Raw Damage

Damage Type
Status / special-effect references
MP / cooldown / usage state
```

Automatic, Template and GM-adjusted values must remain visually distinguishable.

---

# 13. Template vs Instance Editing

```text
Edit Template Skill
→ changes reusable Skill definition / future use

Edit Spawned Skill Override
→ changes only that Monster instance
```

Persistent instances must not silently lose historical calculated values or overrides after Template edits.

---

# 14. Current Unresolved Items

Resolve separately:

1. exact scaling rule for `Final Lower Spread` and `Final Upper Spread`, preserving much smaller late-game downside than upside;
2. whether Monster Skill Accuracy itself automatically scales with Level;
3. later Elite / Boss / richer-profile exceptions where needed.
