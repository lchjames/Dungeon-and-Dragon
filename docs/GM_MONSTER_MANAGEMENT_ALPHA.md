# GM Monster Management — Alpha

> Status: Canonical Alpha Rule  
> Date: 2026-08-22  
> Scope: Defines the GM-facing Monster Management workspace for the Hybrid Monster/NPC system, including dedicated Monster Skills, Accuracy values above 100, D100 extreme-result handling, Attribute-linked damage, independent damage Level scaling, asymmetric damage variance, and instance overrides.

---

# 1. Dedicated GM Workspace

The GM workspace must include a dedicated `Monster Management` page/tab for Monster Templates, Monster Skill Profiles, spawned Monster Instances and authorised instance-level GM adjustments.

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
12. Resolve each Skill's Damage Attribute Links against current Effective Attributes
13. Calculate Damage Attribute Basis for linked Skills
14. Calculate MonsterDamageGrowth(Level) = 7 × ((Level - 1) / 99)^1.5
15. Calculate Template-side Base Damage / Lower Variance / Upper Variance components
16. Resolve final Skill damage range once the Attribute contribution formula is locked
17. Save instance
18. Permit GM final adjustments
```

Group spawn runs this complete pipeline independently for every Monster.

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
Template Lower Variance
Lower Variance Growth Weight
Template Upper Variance
Upper Variance Growth Weight
Damage Attribute Links
Range / Reach
Targeting
Status / special-effect links
MP cost
Cooldown
Usage restrictions
Other approved flags
```

Normal variance-growth defaults:

```text
Lower Variance Growth Weight = 1.50
Upper Variance Growth Weight = 2.00
```

---

# 6. Accuracy May Be Greater Than 100

Stored Skill Accuracy has no hard maximum of 100.

Examples such as `85`, `100`, `125`, `150` are valid Profile values.

Accuracy above 100 is an **Accuracy reserve** against future penalties.

```text
Stored Accuracy = 130
Debuff = -40
Modified Accuracy = 90
Effective Accuracy = 90
```

```text
Stored Accuracy = 130
Debuff = -20
Modified Accuracy = 110
Effective Accuracy = 100
```

The UI must never silently rewrite Stored Accuracy `130` into `100`.

Monster Skill Accuracy is separate from the Player natural Skill-value cap of 98.

---

# 7. Effective Accuracy Cap and D100 Extreme Results

Canonical:

```text
Modified Accuracy
= Stored Skill Accuracy + Total Hit Modifier

Effective Accuracy
= min(100, Modified Accuracy)
```

Only Effective Accuracy enters the ordinary threshold:

```text
D100 Result
= Roll - [100 - Effective Accuracy]
```

However the global raw D100 extremes take precedence:

```text
raw D100 = 1   → Great Failure
raw D100 = 100 → Great Success
```

Therefore with:

```text
Effective Accuracy = 100
```

resolution is:

```text
raw 1     → Great Failure
raw 2–99  → ordinary success
raw 100   → Great Success
```

Accuracy above 100 does not create absolute success by itself. Its normal purpose is to absorb negative Accuracy modifiers before the cap.

The GM UI / inspection view should show separately:

```text
Stored Accuracy
active positive / negative modifiers
Modified Accuracy
Effective Accuracy after 100 cap
raw D100
Great Failure / Great Success state where applicable
```

---

# 8. Accuracy Is Not Attribute-Derived

Standard Simplified Monster Skills do not calculate Accuracy from STR / DEX / CON / POW / INT / SIZ, Effective Attributes, Attack Proficiency or Player weapon specialization.

The older fields are superseded:

```text
Primary Effective Attribute for Accuracy
Attack Proficiency
Attribute-Derived Hit Value
```

Attributes may instead be explicitly linked to damage or other Skill effects.

---

# 9. Damage Attribute Links — GM Multi-Select

Each damaging Skill may provide:

```text
☐ STR
☐ DEX
☐ CON
☐ POW
☐ INT
☐ SIZ
```

The selected set is stored as `Damage Attribute Links`.

Selecting no Attribute is valid for a purely Profile-defined damage Skill.

---

# 10. Composite Damage Attribute Basis

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

Use **Effective Attributes**, so Elite / Monster Level effects flow naturally into linked Skill damage.

This basis does not modify Accuracy.

---

# 11. Template-Side Monster Damage Growth

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

This is a Template-side damage component, not the whole final range when Damage Attribute Links are configured.

---

# 12. Asymmetric Variance

```text
Calculated Lower Variance
= round(
    Template Lower Variance
    × [1 + MonsterDamageGrowth(Level) × Lower Variance Growth Weight]
  )

Calculated Upper Variance
= round(
    Template Upper Variance
    × [1 + MonsterDamageGrowth(Level) × Upper Variance Growth Weight]
  )
```

Defaults:

```text
Lower Variance Growth Weight = 1.50
Upper Variance Growth Weight = 2.00
```

The upper and lower sides remain independent.

---

# 13. Damage Range After Attribute-Link Redesign

Canonical architecture:

```text
Calculated Base Damage
Calculated Lower Variance
Calculated Upper Variance
Damage Attribute Links
selected Effective Attribute values
Damage Attribute Basis
→ Skill Damage Range Resolver
→ Calculated Minimum / Maximum Raw Damage
→ GM final damage adjustments
→ Final Minimum / Maximum Raw Damage
```

The exact numerical formula by which `Damage Attribute Basis` changes Minimum and Maximum damage remains unresolved.

Implementation must not invent the missing Attribute coefficient / multiplier.

Final Minimum Raw Damage must never be below `0`.

---

# 14. Spawned Skill Inspection

For every spawned Monster Skill, GM should be able to inspect:

```text
Skill Name
Stored Accuracy
active Hit Modifiers
Modified Accuracy
Effective Accuracy capped at 100
raw D100 / extreme result state

Damage Attribute Links
current linked Effective Attribute values
Damage Attribute Basis

Template Base Damage
MonsterDamageGrowth(Level)
Damage Growth Weight
Calculated Base Damage
GM Base Damage Adjustment

Template Lower Variance
Lower Variance Growth Weight
Calculated Lower Variance
GM Lower Adjustment

Template Upper Variance
Upper Variance Growth Weight
Calculated Upper Variance
GM Upper Adjustment

Calculated / Final Minimum Raw Damage
Calculated / Final Maximum Raw Damage
Damage Type
Status / special-effect references
MP / cooldown / usage state
```

Automatic, Template and GM-adjusted values must remain visually distinguishable.

---

# 15. Template vs Instance Editing

```text
Edit Template Skill
→ changes reusable Skill definition / future use

Edit Spawned Skill Override
→ changes only that Monster instance
```

Persistent instances must not silently lose historical calculated values or overrides after Template edits.

---

# 16. Superseded Simplified Monster Fields

Do not require the older standard fields:

```text
Primary Effective Attribute for Accuracy
Attack Proficiency
Attribute-Derived Hit Value
damage dice
Player STR + SIZ Damage Bonus
single symmetric Damage Variance
```

The current model instead uses independent Stored Accuracy, Effective Accuracy capped at 100 after modifiers, raw D100 extreme handling, Damage Attribute Links, Damage Attribute Basis, Template-side fixed damage/asymmetric variance components, GM adjustments and the final damage-range resolver.

---

# 17. Current Unresolved Items

Resolve separately:

1. exact formula converting Damage Attribute Basis into lower / upper damage limits;
2. whether Monster Skill Accuracy itself automatically scales with Level;
3. later Elite / Boss / richer-profile exceptions where needed.
