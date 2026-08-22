# Monster / NPC System — Alpha

> Status: Canonical Alpha Rule  
> Date: 2026-08-23  
> Scope: Structural model for Simplified Monsters, Elites, Boss Design Profiles, Boss Instances and Full Character NPCs. Read with `MONSTER_LEVEL_SCALING_ALPHA.md`, `MONSTER_ATTACK_PROFILE_ALPHA.md`, `GM_MONSTER_MANAGEMENT_ALPHA.md`, and `BOSS_DESIGN_PROFILE_ALPHA.md`.

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

Bosses use a dedicated Boss Design Profile / GM interface, while ordinary Monster rules provide their baseline calculations unless a later explicit subsystem overrides one part.

Each runtime Boss appearance is a separate Boss Instance spawned from a Boss Design Profile.

Important / persistent NPCs may use the Full Character Model.

---

# 2. Natural / Effective Attribute Layers

Ordinary Monster generation:

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

Boss baseline Attributes may use this same pipeline, followed by explicit Boss GM correction / override while preserving the baseline.

---

# 3. Elite Generation

Each ordinary Monster independently rolls:

```text
Elite Chance = 10%
```

If Elite:

```text
Elite Attribute Bonus = one random integer +1..+5
```

The same bonus applies to all six base Attributes before Natural values are finalized.

Bosses are not defined by this random Elite rule; Boss design is deliberate and GM-authored.

---

# 4. Monster Resources

```text
Calculated Max HP
= ceil((Effective CON + Effective SIZ) / 2)

Calculated Max MP
= Effective INT × 3
```

No second Level multiplier applies.

For Bosses these formulas provide baseline values where applicable, after which the Boss Design Profile may set different Final Max HP / MP.

Runtime Current HP / MP belong to the Boss Instance.

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

Standard signed Damage Spread is generated from Monster Level and then corrected by GM.

---

# 6. Common Monster Skill Library

The Monster system may maintain a reusable Common Monster Skill Library.

Each Common Monster Skill is a normal Monster Skill Profile reusable across ordinary Monsters, Elites and Bosses.

This library reduces repetitive authoring and is not a separate combat engine.

---

# 7. Boss Skill Architecture

Bosses do not use a separate Boss-only Skill engine.

```text
Boss Skill Loadout
= Common Monster Skills
+ GM-authored unique Boss Skills
```

A unique Boss Skill remains a Monster Skill Profile unless a later explicit subsystem introduces an exception.

Boss status does not automatically switch the entity to Player Skill progression.

---

# 8. Dedicated Boss Design Profile

Every Boss is designed through a dedicated Boss Design Profile / GM interface.

```text
Boss identity / Level
→ ordinary Monster canonical baseline
→ calculated / suggested values
→ GM Boss-specific correction / override
→ Final Boss Profile
```

No universal Boss multiplier is locked for HP, MP, Attributes, Damage or Accuracy.

---

# 9. Baseline vs Final Boss Values

The system preserves:

```text
Calculated / Suggested Baseline
GM Boss Adjustment / Override
Final Boss Value
```

Possible baseline values include Attributes, HP/MP, Skill values, Damage Attribute Basis, Base Damage, Damage Center and Suggested Spread.

Exact Boss numbers are GM content-design decisions.

---

# 10. Boss GM Adjustment Scope

Where supported by the underlying subsystem, the Boss interface may allow explicit adjustment of:

```text
final Attributes
Max HP / MP
Skill loadout
Skill Accuracy
Skill damage tuning
Final Spread Min / Max
Damage Type
Range / targeting
Status / special effects
Phase definitions / triggers
Resistance / Immunity once locked
special Boss mechanics
```

Boss adjustment does not mutate global Monster rules or Common Skill Library entries unless those sources are explicitly edited.

---

# 11. Locked Boss Design Profile + Boss Instance Model

Boss persistence uses two layers:

```text
Boss Design Profile
→ persistent design-time Boss definition
→ stores baseline, GM overrides and Final Boss Values

Boss Instance
→ one spawned runtime copy
→ stores encounter/runtime state
```

This applies even to a narratively unique Boss.

Canonical spawn flow:

```text
Final Boss Profile
→ Spawn Boss Instance
→ snapshot current Final Boss Values
→ initialize runtime state
```

---

# 12. Boss Instance Snapshot and Runtime Ownership

Typical snapshotted values include:

```text
source Boss Profile ID / revision metadata where practical
Boss identity
Level
Final Attributes
Final Max HP / MP
Skill loadout and resolved Skill values
Final Spread values
Accuracy / damage overrides
Phase definitions / trigger definitions
other final design-time combat values
```

Runtime state belongs to the Boss Instance:

```text
Current HP / MP
current Phase / Phase progress
Status effects
Buffs / Debuffs
Cooldowns
usage counters
ongoing effects
temporary combat modifiers
initiative / turn state
runtime Skill state
```

Runtime changes do not write back to the Boss Design Profile.

---

# 13. Profile Edits Do Not Mutate Existing Boss Instances

```text
Edit Boss Design Profile
→ affects future design / future Boss spawns
→ does NOT silently rewrite existing Boss Instances
```

An intentional change to an existing Boss Instance is a separate explicit GM Instance override and remains auditable.

---

# 14. Boss Phase Architecture — Conditions + GM Override

Boss Phase handling uses:

```text
Phase Definition
→ trigger condition(s)
→ system evaluates / detects trigger state
→ transition becomes applicable
→ GM retains manual override authority
```

Trigger types are extensible. Future / initial implementations may support examples such as:

```text
HP threshold / percentage
round / turn condition
specific encounter event / flag
Skill / mechanic state
other approved condition
```

The concrete condition catalogue is intentionally not required to be complete before the first playable version.

GM must be able to explicitly control Phase progression through actions conceptually equivalent to:

```text
Force Enter Phase
Delay / hold Phase
Skip Phase
Move to another allowed Phase
```

The architecture is therefore neither HP-only nor manual-only.

Whether a satisfied condition immediately transitions, requests GM confirmation, or uses another UI behaviour remains implementation / Alpha tuning until explicitly locked.

---

# 15. Phase Data Ownership

```text
Boss Design Profile
→ Phase definitions / trigger definitions

Boss Instance
→ current Phase
→ trigger progress / runtime flags
→ GM Phase override state
```

Phase definitions are snapshotted at spawn and later Profile edits do not silently rewrite an existing Instance.

---

# 16. Separation from Player Skill System

Player Characters retain their own Skill / Ability / progression systems.

A standard Simplified Monster or Boss does not automatically use Player Creation Skill Points, Player basic-skill progression, Player weapon-specialisation progression or Player Ability learning.

An important / persistent NPC may instead use the Full Character Model.

---

# 17. Independent Accuracy — Fixed Across Level

Monster Skill Accuracy is independent and not Attribute-derived.

Stored Accuracy may exceed `100`.

```text
Monster Level changes
→ Stored Accuracy remains unchanged

Modified Accuracy
= Stored Accuracy + Total Hit Modifier

Effective Accuracy
= min(100, Modified Accuracy)
```

Accuracy above 100 is reserve against negative modifiers.

Raw D100 extremes:

```text
1   → Great Failure
100 → Great Success
```

Monster Level is not a standard Accuracy-growth source.

---

# 18. Monster Critical Follow-Up — Deferred

Monster Great Success / Great Failure stays aligned with shared D100 rules where generic rules already apply.

No universal Monster-only rule such as max Spread, fixed multiplier, defence bypass, automatic Status or self-damage is locked.

Monster-specific follow-up is deferred to future Monster Combat AI / behavioural AI design.

---

# 19. Damage Attribute Links

A damaging Skill may select zero, one or multiple:

```text
STR DEX CON POW INT SIZ
```

One selection uses that current Effective Attribute. Multiple selections use arithmetic mean.

This basis contributes to damage only.

---

# 20. Locked Skill Base-Damage Level Scaling

```text
MonsterDamageGrowth(Level)
= 7 × ((Level - 1) / 99)^1.5

Calculated Base Damage
= round(
    Template Base Damage
    × [1 + MonsterDamageGrowth(Level) × Damage Growth Weight]
  )
```

Standard Weight `1.0` gives 1× at Lv1 and 8× at Lv100.

Bosses use this as the normal Skill baseline before explicit GM tuning.

---

# 21. Locked Damage Center

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

# 22. Level-Linked Signed Spread Range

```text
Monster Level
→ System Suggested Spread Min / Max
→ GM boundary adjustments / overrides
→ Final Spread Min / Max
```

Runtime:

```text
Spread Roll
= random integer from Final Spread Min to Final Spread Max, inclusive

Raw Monster Damage
= max(0, Calculated Damage Center + Spread Roll)
```

The exact Level-to-Spread numeric formula remains Alpha Tuning and should be data-driven / easy to rebalance.

---

# 23. Ordinary Monster Spawn Pipeline

```text
1. Read Template
2. Roll six Attributes independently
3. Roll Elite check / bonus
4. Save Natural Attributes
5. Apply Level curve + Attribute Growth Weights
6. Save Effective Attributes
7. Calculate HP / MP
8. Attach Monster Skills
9. Preserve Stored Accuracy; do not Level-scale it
10. Resolve Damage Attribute Links / Basis
11. Calculate Level-adjusted Base Damage
12. Calculate Damage Center
13. Generate Suggested Spread
14. Apply GM Spread correction / override
15. Save Final Spread
16. Resolve D100 hit / extreme state
17. Roll signed Spread on hit
18. Calculate Raw Damage
19. Apply defence / resistance
20. Save instance state
```

Boss creation reuses relevant steps as a baseline-generation pass, then applies the Boss GM Final Adjustment Layer before spawning a Boss Instance.

---

# 24. GM / D1 Requirements

D1 must distinguish:

```text
Monster Template
Ordinary Monster Instance
Boss Design Profile
Boss Instance
```

Boss Design Profile preserves baseline values, GM overrides, Skill loadout, Phase definitions / triggers and Final Boss Values.

Boss Instance preserves the source Profile reference/revision where practical, spawn snapshot, Instance overrides, Current HP / MP, current Phase / trigger progress, Status, cooldowns, temporary modifiers and encounter state.

Editing a Boss Design Profile must not silently rewrite existing Boss Instances.

---

# 25. GM Final Adjustment

GM may adjust ordinary Monster Instances after generation.

For Bosses, bespoke GM adjustment is an expected authoring step, and spawned Boss Instances may additionally receive encounter-specific explicit overrides.

System-suggested values, GM corrections, spawn snapshots and runtime values remain auditable.

---

# 26. Resolved / Deferred Items

Resolved:

```text
Monster Skill Accuracy Level scaling
→ no automatic Level scaling

Boss Skills
→ same Monster Skill Profile system
→ Common Monster Skills + GM-authored unique Skills

Boss design
→ dedicated Boss Design Profile / interface
→ shared Monster rules calculate baseline first
→ GM sets Final Boss values
→ no universal Boss multiplier

Boss persistence
→ Boss Design Profile + Boss Instance
→ spawn snapshots Final Boss Values
→ runtime state belongs to Instance
→ Profile edits do not silently mutate existing Instances

Boss Phase
→ condition-triggered architecture
→ GM manual override retained
→ trigger catalogue extensible
```

Deferred / tuning:

1. Monster Great Success / Great Failure post-resolution behaviour;
2. Monster AI Skill selection / behavioural logic;
3. numeric Spread-generation tuning;
4. full Phase-trigger catalogue / exact transition UI behaviour;
5. Skill Status / Resistance / Immunity details;
6. advanced Boss special mechanics;
7. Monster EXP rewards;
8. NPC progression behaviour;
9. encounter difficulty contribution.

The current Monster/Boss structural rules are sufficient to begin an initial playable implementation. Deferred items should be added incrementally unless they block the playable core.
