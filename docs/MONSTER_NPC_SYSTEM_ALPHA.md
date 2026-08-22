# Monster / NPC System — Alpha

> Status: Canonical Alpha Rule  
> Date: 2026-08-22  
> Scope: Structural model for Simplified Monsters, Elite/Boss profiles and Full Character NPCs. Read with `MONSTER_LEVEL_SCALING_ALPHA.md`, `MONSTER_ATTACK_PROFILE_ALPHA.md`, `GM_MONSTER_MANAGEMENT_ALPHA.md`, and `BOSS_DESIGN_PROFILE_ALPHA.md`.

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

Elite enemies remain extensions of the ordinary Monster model.

Bosses use a dedicated **Boss Design Profile / GM interface**, while still using ordinary Monster rules as their baseline calculation framework unless a later explicit subsystem overrides one part.

Important / persistent NPCs may use the Full Character Model.

---

# 2. Natural / Effective Attribute Layers

Each ordinary Monster spawn rolls the six Template ranges independently.

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

Boss baseline Attributes may use this same pipeline, after which the Boss Design Profile permits bespoke GM correction / override while preserving the calculated baseline.

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

Bosses are not defined by this random Elite rule. Boss design is deliberate and GM-authored through the Boss Design Profile.

---

# 4. Locked Monster Resources

Ordinary calculated Monster resources:

```text
Calculated Max HP
= ceil((Effective CON + Effective SIZ) / 2)

Calculated Max MP
= Effective INT × 3
```

Neither receives a second application of the global Attribute Level curve.

For ordinary Monsters, GM may perform final instance-level Max / Current HP and MP adjustments while calculated values remain preserved.

For Bosses, these formulas provide the default baseline where applicable, then the dedicated Boss Final Adjustment Layer may set different Final HP / MP values. Baseline and Final values must remain separate and auditable.

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

# 6. Common Monster Skill Library

The Monster system may maintain a reusable Common Monster Skill Library.

Each Common Monster Skill is a normal Monster Skill Profile and may be attached to multiple Monster / Elite / Boss Templates or Profiles.

This library is intended for repeatable ordinary actions and basic attacks so the GM does not need to recreate the same Skill every time.

Example content may include:

```text
Bite
Claw
Charge
Tail Swipe
Basic weapon strike
Simple projectile
Basic elemental attack
```

---

# 7. Boss Skill Architecture — Common + GM-Authored Unique Skills

Bosses do **not** use a separate Boss-only Skill engine.

A Boss may combine:

```text
Common Monster Skills
+ GM-authored unique Boss Skills
```

Typical loadout:

```text
Boss
├─ Common / basic Monster Skills
│  ├─ normal attack
│  ├─ common movement / attack pattern
│  └─ reusable utility action
│
└─ Unique Boss Skills
   ├─ signature attack
   ├─ unique control / area effect
   ├─ phase-specific action
   └─ other GM-designed mechanic
```

A GM-authored unique Boss Skill is still a Monster Skill Profile and uses the same Monster Skill resolver unless an explicit later subsystem introduces a specific exception.

The GM may use a Common Monster Skill directly as a Boss basic action or use it as an authoring reference / starting point for a distinct unique Skill.

Boss uniqueness therefore comes from the selected Skill loadout and GM-authored Skill content, not from duplicating the entire Skill engine.

---

# 8. Dedicated Boss Design Profile

Every Boss is designed through a dedicated Boss Design Profile and dedicated GM-facing design interface.

Canonical Boss architecture:

```text
Boss identity / Level
→ apply ordinary Monster canonical rules as baseline
→ calculate / suggest baseline values
→ GM performs bespoke Boss-specific correction / override
→ Final Boss Profile
```

The Boss Design Profile exists because Bosses are expected to receive individual GM tuning.

It must not be interpreted as a second mathematical Monster engine.

---

# 9. Boss Baseline First, GM Final Authority Second

Before bespoke tuning, the system should calculate a coherent baseline using existing Monster rules where applicable.

Possible baseline values include:

```text
Natural / Effective STR / DEX / CON / POW / INT / SIZ
Calculated Max HP
Calculated Max MP
Skill loadout references
Stored Accuracy
Damage Attribute Basis
Calculated Base Damage
Calculated Damage Center
System Suggested Spread Min / Max
other already-Canonical Monster calculations
```

Then GM may manually tune the Boss.

The system must preserve separate layers:

```text
Calculated / Suggested Baseline
GM Boss Adjustment / Override
Final Boss Value
```

No universal Boss multiplier is locked for:

```text
HP
MP
Attributes
Damage
Accuracy
```

Exact Boss numbers are encounter/content design decisions.

---

# 10. Boss GM Adjustment Scope

Where the underlying subsystem exists, the dedicated Boss interface may allow authorised adjustment of:

```text
final Attributes / Attribute overrides
Max / Current HP
Max / Current MP
Skill loadout
Skill Accuracy / explicit Accuracy override
Skill damage tuning
Final Spread Min / Max
Damage Type
Range / targeting
Status / special effects
Resistance / Immunity once locked
Phase behaviour / triggers once locked
special Boss mechanics
other approved Boss-facing fields
```

GM Boss adjustment does not mutate the global Monster rules, Common Skill Library, or global tuning data unless the GM explicitly edits those sources.

---

# 11. Separation from Player Skill System

Player Characters retain their own Skill / Ability / progression systems.

A standard Simplified Monster or Boss does not automatically use:

```text
Player Creation Skill Points
Player basic-skill progression
Player natural Skill cap progression
Player weapon-specialisation progression
Player Ability learning progression
```

A Boss-specific Skill remains a Monster Skill Profile even when it is narratively complex or unique.

An important / persistent NPC may instead use the Full Character Model. In that case Player-like rules may apply because of the selected NPC model, not because every Boss inherits the Player ruleset.

---

# 12. Independent Accuracy with Over-100 Storage — Fixed Across Level

Monster Skill Accuracy is independent and is not derived from Monster Attributes.

Stored Accuracy may exceed `100`.

Canonical Level invariant:

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

Stored Accuracy changes only through explicit authorised Profile edits, GM overrides, Buff / Debuff, Status, Skill effects, or other explicit Accuracy modifiers.

Runtime:

```text
Modified Accuracy
= Stored Accuracy + Total Hit Modifier

Effective Accuracy
= min(100, Modified Accuracy)
```

Accuracy above 100 acts as reserve against future negative modifiers.

Raw D100 extremes remain:

```text
1   → Great Failure
100 → Great Success
```

These extreme faces take precedence over the ordinary threshold.

Monster Level is not an Accuracy-growth source in the standard Simplified Monster model.

Boss-specific GM Accuracy override is permitted only as an explicit override; it is not automatic Boss Level scaling.

---

# 13. Monster Critical Follow-Up — Deferred

Monster Great Success / Great Failure remains conceptually aligned with the shared Player-side D100 critical framework where a generic Canonical rule already applies.

No new universal Monster-only follow-up is locked at this stage.

In particular, do not assume:

```text
Great Success = maximum Spread
Great Success = fixed extra damage
Great Success = automatic defence bypass
Great Success = automatic Status
Great Failure = automatic self-damage
```

The system must preserve the raw extreme state for later resolution / audit.

The exact Monster-specific post-extreme behaviour is **DEFERRED until Monster Combat AI / behavioural AI design**, together with AI Skill selection and any Profile-specific critical behaviour.

---

# 14. Damage Attribute Links

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

# 15. Locked Skill Base-Damage Level Scaling

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

Bosses use this as the normal Skill baseline before any explicit GM Boss tuning.

---

# 16. Locked Damage Center Model

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

Boss-specific Skill tuning may explicitly override final Boss Skill values while preserving this calculated baseline for audit.

---

# 17. Level-Linked Signed Spread Range

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

Bosses specifically expose the Suggested and Final Spread values in the Boss Design Profile so the GM can tune them deliberately.

---

# 18. Spread Design Intent and Balance Authority

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
low Level  → roughly symmetric, e.g. about [-2,+2]
high Level → more positive-skewed, e.g. about [-5,+15]
```

These are examples of shape only, not locked values.

Actual values are expected to be tuned when real Monster, encounter, Boss and campaign content is created and play-tested.

The exact Level-to-Spread formula remains **Alpha Tuning** and should be data-driven / easy to rebalance.

---

# 19. Full Ordinary Monster Spawn Pipeline

```text
1. Read Template
2. Roll six Attributes independently
3. Roll Elite check
4. Apply Elite Bonus if any
5. Save Natural Attributes
6. Apply Level curve + six Attribute Growth Weights
7. Save Effective Attributes
8. Calculate HP / MP
9. Attach Monster Skills from Common Library and/or Template-specific Skill authoring
10. Preserve Stored Accuracy exactly; do not Level-scale it
11. Resolve selected Damage Attribute Links
12. Calculate Damage Attribute Basis
13. Calculate Level-adjusted Skill Base Damage
14. Calculate Damage Center = Base Damage + Attribute Basis
15. Generate Suggested Spread Min / Max from Monster Level
16. Apply GM Spread correction / override
17. Save Final Spread Min / Max
18. Resolve D100 hit and preserve Great Success / Great Failure state
19. Apply only already-Canonical shared critical handling; do not invent Monster-specific follow-up
20. On ordinary damaging hit, roll one signed Spread Roll inside the Final range
21. Calculate Raw Monster Damage
22. Apply defence / resistance / other combat resolution
23. Save/use instance state
```

Boss creation reuses relevant calculation steps as a **baseline-generation pass**, then moves through the dedicated Boss GM Final Adjustment Layer before Final Boss values are locked for the encounter.

---

# 20. GM / D1 Requirements

D1 must preserve enough data to distinguish:

```text
Monster Template
→ Attribute ranges / Growth Weights
→ Skill definitions / references
→ Skill source where available: Common Library / Template-specific / Boss-specific
→ Stored Accuracy
→ Template Base Damage / Damage Growth Weight
→ Damage Attribute Links

Ordinary Monster Instance
→ Level
→ base rolls
→ Elite result / bonus
→ Natural Attributes
→ Effective Attributes
→ calculated HP / MP
→ fixed per-Skill Stored Accuracy / authorised override
→ per-Skill Accuracy modifiers and Effective Accuracy
→ raw D100 / Great Success / Great Failure state
→ per-Skill linked Attribute values / Basis
→ calculated Base Damage
→ calculated Damage Center
→ System Suggested Spread Min / Max
→ GM Spread adjustments / overrides
→ Final Spread Min / Max
→ Spread Roll when resolved
→ calculated / final Raw Damage
→ final state

Boss Design Profile
→ Boss identity / Level
→ baseline calculated Attribute / resource / Skill values
→ System Suggested Spread values
→ GM Boss adjustments / overrides
→ Common and unique Boss Skill loadout
→ special Boss-design data
→ Final Boss values
```

Changing Level recalculates Effective Attributes and regenerates the suggested Spread range, but **must not recalculate Stored Accuracy**.

Boss baseline values must remain auditable after GM tuning.

---

# 21. GM Final Adjustment

GM may adjust a generated Monster Instance after automatic generation and calculation.

Bosses go further: bespoke GM adjustment is an expected part of the Boss authoring workflow, not merely an emergency correction.

Boss adjustment does not mutate the reusable Common Skill Library or global tuning rules unless GM explicitly edits those sources.

System suggested values, Skill source, GM corrections and final runtime values should remain auditable.

---

# 22. Resolved / Deferred Items

Resolved:

```text
Monster Skill Accuracy Level scaling
→ no automatic Level scaling

Boss Skill authoring architecture
→ use same Monster Skill Profile system
→ may mix Common Monster Skills and GM-authored unique Boss Skills
→ does not automatically use Player Skill progression

Boss design architecture
→ dedicated Boss Design Profile and GM interface
→ ordinary Monster rules calculate baseline values first
→ GM manually tunes / overrides Boss-specific final values
→ no universal Boss multiplier
```

Deferred / tuning:

1. Monster Great Success / Great Failure post-resolution behaviour — **DEFERRED to future Monster AI design**;
2. Monster AI Skill selection / behavioural logic — future AI design pass;
3. numeric Spread-generation tuning — actual game-content creation / play balance;
4. exact Boss Profile vs spawned Boss Instance persistence semantics;
5. Skill status / Resistance / Immunity details;
6. Boss Phase / trigger / special-mechanic details;
7. Monster EXP rewards;
8. NPC progression behaviour;
9. encounter difficulty contribution.
