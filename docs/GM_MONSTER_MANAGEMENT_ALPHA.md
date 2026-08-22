# GM Monster Management — Alpha

> Status: Canonical Alpha Rule  
> Date: 2026-08-23  
> Scope: Defines GM-facing Monster Management for the Hybrid Monster/NPC system, including reusable Common Monster Skills, dedicated Boss Design Profiles, spawned Boss Instances, Boss common-plus-unique Skill loadouts, fixed over-100 Accuracy, Attribute-linked damage, Level-generated signed Spread Ranges, GM correction / overrides, and deferred Monster-specific critical follow-up pending AI design. Read with `BOSS_DESIGN_PROFILE_ALPHA.md` for Boss-specific authoring.

---

# 1. Dedicated GM Workspace

The GM workspace must include:

```text
Monster Templates
Common Monster Skill Library
Monster Skill Profiles
spawned Monster Instances
instance-level GM adjustments
Boss Design Profiles
Boss Design / Editing workspace
spawned Boss Instances
Boss Instance inspection / runtime controls
```

Boss authoring must not be forced into the ordinary disposable-Monster form. Bosses receive a dedicated design table/interface because bespoke GM adjustment is expected for every Boss.

All persistent Monster / Boss data is D1-authoritative.

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

# 3. Common Monster Skill Library

GM tooling should support a reusable Common Monster Skill Library.

Each library entry is a normal Monster Skill Profile and may be reused by multiple Monster Templates and Bosses.

Typical common entries may include:

```text
Bite
Claw
Charge
Tail Swipe
Basic weapon strike
Simple projectile
Basic elemental attack
```

The library is intended to reduce repetitive authoring. It is not a separate combat system.

---

# 4. Boss Skill Authoring — Common + Unique

Bosses use the same Monster Skill Profile architecture as ordinary Monsters.

A Boss loadout may combine:

```text
Common Monster Skills
+ GM-authored unique Boss Skills
```

The GM may:

```text
1. Add an existing Common Monster Skill directly as a basic / ordinary Boss action
2. Use a Common Monster Skill as an authoring reference / starting point
3. Create a new unique Monster Skill specifically for that Boss
```

A unique Boss Skill uses the same Monster Skill Profile fields, Accuracy rules, damage resolver, Spread system, MP / cooldown handling, and audit model as other Monster Skills unless a later explicit exception is approved.

Do not create a parallel Boss-only Skill engine merely because a Skill is unique.

Player Character Skill / Ability progression remains separate. A standard Boss does not automatically use Player Skill Points, Player natural-skill progression, or Player Ability-learning rules.

Only an important / persistent NPC intentionally built with the Full Character Model may use Player-like progression because of that NPC model.

---

# 5. Dedicated Boss Design Profile / Interface

Every Boss should be authored through a dedicated Boss Design Profile and dedicated GM-facing interface.

Canonical design-time flow:

```text
Boss identity / Level
→ apply ordinary Monster canonical baseline rules
→ calculate / suggest baseline values
→ GM performs Boss-specific manual adjustment / override
→ Final Boss Profile
```

The Boss interface should expose at least these conceptual sections:

```text
Boss Identity
Baseline Calculation
Boss Final Values
Skill Loadout
Special Boss Design
Audit / baseline-vs-final comparison
Runtime / Spawn Boss Instance
```

The baseline and GM-adjusted final values must remain distinguishable.

Do not hard-code a universal Boss multiplier for HP, MP, Attributes, Damage or Accuracy.

---

# 6. Boss Baseline Calculation

Before GM tuning, the system should calculate Boss baseline values using the same already-Canonical Monster rules where applicable.

Baseline may include:

```text
Monster Level
Natural STR / DEX / CON / POW / INT / SIZ
Effective STR / DEX / CON / POW / INT / SIZ
Calculated Max HP
Calculated Max MP
Stored Skill Accuracy
Damage Attribute Basis
Calculated Base Damage
Calculated Damage Center
System Suggested Spread Min / Max
other already-Canonical Monster values
```

This baseline is a coherent starting point, not the final Boss balance authority.

---

# 7. Boss Final Adjustment Authority

After baseline generation, the GM may manually adjust / override Boss-facing values.

Where the related subsystem exists, this may include:

```text
final Attributes / authorised Attribute overrides
Max HP
Max MP
Skill loadout
Skill Accuracy / explicit Accuracy override
Skill damage tuning
Final Spread Min / Max
Damage Type
Range / targeting
Status / special effects
Resistance / Immunity once locked
Phase definitions / triggers once locked
special Boss mechanics
other explicitly authorised Boss fields
```

The system must preserve:

```text
Calculated / Suggested Baseline
GM Adjustment / Override
Final Boss Value
```

Example:

```text
Calculated Max HP = 180
GM Override = 420
Final Max HP = 420
```

or:

```text
Suggested Spread = [-4,+12]
GM Override = [-3,+20]
Final Spread = [-3,+20]
```

Runtime Current HP / MP are not design-time Boss Profile values; they belong to spawned Boss Instances.

---

# 8. Locked Boss Profile → Instance Workflow

Boss persistence uses two layers:

```text
Boss Design Profile
→ stores GM-approved design-time Final Boss Values

Boss Instance
→ stores one spawned encounter/runtime copy
```

GM UI must provide an explicit action such as:

```text
Spawn Boss Instance
```

Spawn flow:

```text
Final Boss Profile
→ snapshot current Final Boss Values
→ create Boss Instance
→ initialize runtime state
```

Initial runtime resources normally begin from the snapshotted Final Boss maximum values unless an explicit encounter-specific override is applied.

---

# 9. Boss Instance Runtime State

Boss Instance is responsible for runtime / encounter-local values including:

```text
Current HP
Current MP
current Phase / Phase progress
Status effects
Buffs / Debuffs
Cooldowns
usage counters
ongoing effects
temporary combat modifiers
initiative / turn state where applicable
runtime Skill state
other encounter-local state
```

Runtime changes must never silently write back to the Boss Design Profile.

The GM should be able to inspect the Instance's source Boss Profile and the snapshotted values used at spawn time.

---

# 10. Profile Editing vs Existing Boss Instances

Canonical rule:

```text
Edit Boss Design Profile
→ affects future design / future spawns
→ does NOT silently mutate existing Boss Instances
```

Example:

```text
Instance #1 spawned when Profile Final Max HP = 420

GM later edits Profile Final Max HP = 500

Instance #1 remains based on 420
Future Instance #2 may spawn from 500
```

If the GM intentionally wants to update an existing Boss Instance, the UI must treat that as a separate explicit Instance-level action / override.

---

# 11. Boss Instance Overrides

GM may apply encounter-specific corrections to a Boss Instance without modifying its Boss Design Profile.

Preserve the distinction:

```text
Profile Final Value
→ Instance Snapshot Value
→ Instance-specific GM Override
→ runtime current state
```

Instance-level overrides must remain auditable.

---

# 12. Ordinary Monster Spawn Workflow

For every ordinary spawned instance:

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
10. Attach approved Monster Skill Profiles from Common Library and/or Template-specific authoring
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
22. Preserve D100 Great Success / Great Failure state without inventing Monster-specific critical follow-up
23. Save instance / combat state
```

Boss creation uses the same relevant baseline calculations, then passes through the dedicated Boss Final Adjustment Layer. Runtime combat begins only after a Boss Instance is spawned from the Final Boss Profile.

---

# 13. Resource Handling

```text
Calculated Max HP = ceil((Effective CON + Effective SIZ) / 2)
Calculated Max MP = Effective INT × 3
```

HP/MP do not receive the global Level curve a second time because Effective Attributes already include Level scaling.

For ordinary Monsters, GM may adjust final/current HP and MP at instance level while calculated and manual values remain separate.

For Bosses, baseline calculated Max HP/MP is expected to be reviewable and manually corrected through the Boss Design Profile. Runtime Current HP/MP are owned by Boss Instances.

---

# 14. Monster Skill Profile Fields

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

The following former standard fields are superseded and must not be required:

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

Standard Spread is generated from Monster Level and then corrected by GM.

---

# 15. Accuracy Rules — No Automatic Level Scaling

Stored Skill Accuracy may exceed 100.

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

Accuracy may change only through explicit authorised sources such as Profile edits, GM override, Buff / Debuff, Status, Skill properties, or another explicit Accuracy modifier.

Runtime:

```text
Modified Accuracy
= Stored Skill Accuracy + Total Hit Modifier

Effective Accuracy
= min(100, Modified Accuracy)
```

Raw D100 extremes remain:

```text
1   → Great Failure
100 → Great Success
```

These extreme faces take precedence over the ordinary threshold.

GM UI must not present a calculated `Accuracy after Level scaling` field because no such standard calculation exists.

---

# 16. Critical Follow-Up — Deferred to Monster AI Design

The GM system must preserve the raw D100 extreme state, but must not assume a new Monster-only universal critical effect.

Do not hard-code any of the following as Canonical defaults:

```text
Great Success = maximum Spread
Great Success = fixed damage multiplier
Great Success = automatic defence bypass
Great Success = automatic Status
Great Failure = automatic self-damage
```

Monster Great Success / Great Failure should remain broadly aligned with the shared Player-side D100 critical framework where an already-Canonical common rule applies.

The exact Monster-specific follow-up is deferred until the future Monster Combat AI / behavioural AI design pass, when the project will also decide AI Skill selection and any Profile-specific critical behaviour.

---

# 17. Damage Attribute Links — GM Multi-Select

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

# 18. Locked Skill Base-Damage Level Curve

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

# 19. Locked Damage Center Formula

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

# 20. Level-Generated Signed Damage Spread Range

Spread is one signed interval:

```text
[Final Spread Min, Final Spread Max]
```

The system first generates an approximate range from Monster Level:

```text
Monster Level
→ Spread Generation Rule / Tuning Table
→ System Suggested Spread Min / Max
```

The GM then corrects the generated range:

```text
System Suggested Spread Range
→ GM Min / Max adjustment or override
→ Final Spread Range
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

# 21. Spread Generation Is a Starting Point

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
low Level  → about [-2,+2]
high Level → about [-5,+15]
```

represent intended qualitative direction only, not a locked table.

The exact Level-to-Spread formula remains **Alpha Tuning** until real content creation / play balance.

Implementation should keep Spread tuning data-driven and easy to rebalance.

---

# 22. Spawned Skill / Boss Audit

For every spawned Monster Skill, GM should be able to inspect:

```text
Skill Name
Skill source / origin where available
Stored Accuracy
Current Stored Accuracy / authorised override
active Hit Modifiers
Modified Accuracy
Effective Accuracy capped at 100
raw D100
Great Success / Great Failure state

Damage Attribute Links
current linked Effective Attribute values
Damage Attribute Basis

Template Base Damage
MonsterDamageGrowth(Level)
Damage Growth Weight
Calculated Base Damage
Calculated Damage Center

Monster Level used for Spread generation
System Suggested Spread Min / Max
GM Spread Min / Max adjustment / override
Final Spread Min / Max
Calculated Minimum / Maximum Raw Damage
Spread Roll when resolved
Final Raw Damage
```

Boss Design audit additionally preserves baseline Boss values, Boss-specific GM overrides and Final Boss Profile values.

Boss Instance audit additionally preserves:

```text
source Boss Profile ID / revision metadata where practical
snapshotted Final Boss values
instance-specific overrides
runtime Current HP / MP
Status / Phase / cooldown / temporary state
```

Where practical, Skill source/origin should distinguish a Common Library Skill from a Template-specific or Boss-specific unique Skill.

Changing Level must never silently mutate Stored Accuracy.

---

# 23. GM UI Requirements

Accuracy should appear as a Profile / override value rather than a Level-derived value:

```text
Stored Accuracy: 80
Automatic Level Accuracy Growth: OFF / N/A
```

Spread controls should display:

```text
Level
Suggested Spread
GM Min / Max adjustment or override
Final Spread
```

Boss Skill loadout authoring should provide both routes in the same workflow:

```text
Add from Common Monster Skill Library
Create New Unique Monster Skill
```

Bosses must also have a dedicated Boss Design UI exposing baseline values beside GM-adjusted Final values, plus explicit runtime actions:

```text
Spawn Boss Instance
View Boss Instances
Edit Instance Override
```

Critical state may be displayed for audit, but Monster-specific critical-result controls should wait for the future AI / critical design pass.

---

# 24. Template / Profile vs Instance Editing

```text
Edit reusable Common / Template Skill
→ changes reusable Skill definition / future use according to normal Template rules

Edit ordinary Spawned Skill Override
→ changes only that Monster instance

Edit Boss Design Profile
→ changes the reusable Boss design / future Boss spawns
→ does not silently change existing Boss Instances

Edit Boss Instance Override
→ changes only that spawned Boss Instance
→ does not mutate the Boss Design Profile
```

Design-time baseline, GM Final values, spawn snapshot, Instance override and runtime state must not be conflated.

---

# 25. Resolved / Deferred Items

Resolved:

```text
Monster Skill Accuracy Level scaling
→ no automatic Level scaling

Boss Skill authoring architecture
→ Common Monster Skills + GM-authored unique Monster Skills
→ same Monster Skill Profile system

Boss numeric design architecture
→ dedicated Boss Design Profile / interface
→ ordinary Monster rules provide baseline calculations
→ GM manually tunes Final Boss values
→ no universal Boss multiplier

Boss persistence architecture
→ Boss Design Profile + Boss Instance
→ spawning snapshots Final Boss design values
→ runtime state belongs to the Instance
→ later Profile edits do not silently mutate existing Instances
```

Deferred / tuning:

1. Monster Great Success / Great Failure post-resolution behaviour — **DEFERRED to Monster AI design**;
2. Monster AI Skill selection / behavioural logic — future AI design pass;
3. numeric Spread-generation tuning — actual content creation / play balance;
4. later Phase / Resistance / Immunity / special-mechanic details as their systems are locked.
