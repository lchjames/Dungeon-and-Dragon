# GM Monster Management — Alpha

> Status: Canonical Alpha Rule  
> Date: 2026-08-23  
> Scope: Defines GM-facing Monster/Boss management for the Hybrid Monster/NPC system, including Common Monster Skills, dedicated Boss Design Profiles, Boss Instances, Boss Phase condition triggers with GM override, fixed over-100 Accuracy, Attribute-linked damage, Level-generated signed Spread Ranges, and deferred Monster-specific critical follow-up. Read with `BOSS_DESIGN_PROFILE_ALPHA.md`.

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

Boss authoring must not be forced into the ordinary disposable-Monster form. All persistent Monster / Boss data is D1-authoritative.

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

GM tooling supports a reusable Common Monster Skill Library. Each entry is a normal Monster Skill Profile reusable by ordinary Monsters, Elites and Bosses.

Typical entries may include Bite, Claw, Charge, Tail Swipe, basic weapon strikes, simple projectiles and basic elemental attacks.

The library reduces repetitive authoring; it is not a separate combat system.

---

# 4. Boss Skill Authoring — Common + Unique

Bosses use the same Monster Skill Profile architecture as ordinary Monsters.

```text
Boss Skill Loadout
= Common Monster Skills
+ GM-authored unique Boss Skills
```

GM may add a Common Skill directly, use one as an authoring reference, or create a new unique Skill for the Boss.

A unique Boss Skill uses the same Accuracy, damage, Spread, MP/cooldown and audit model unless a later explicit exception is approved.

Player Character Skill / Ability progression remains separate. Only an NPC intentionally using the Full Character Model uses Player-like progression because of that model.

---

# 5. Dedicated Boss Design Profile / Interface

Every Boss is authored through a dedicated Boss Design Profile and GM-facing interface.

```text
Boss identity / Level
→ ordinary Monster canonical baseline calculations
→ calculated / suggested baseline values
→ GM Boss-specific adjustment / override
→ Final Boss Profile
```

The Boss UI should expose conceptually:

```text
Boss Identity
Baseline Calculation
Boss Final Values
Skill Loadout
Special Boss Design / Phase
Audit
Runtime / Spawn Boss Instance
```

No universal Boss multiplier for HP, MP, Attributes, Damage or Accuracy is Canonical.

---

# 6. Boss Baseline and GM Final Authority

Baseline may include:

```text
Monster Level
Natural / Effective STR DEX CON POW INT SIZ
Calculated Max HP / MP
Stored Skill Accuracy
Damage Attribute Basis
Calculated Base Damage
Calculated Damage Center
System Suggested Spread Min / Max
```

The system must preserve:

```text
Calculated / Suggested Baseline
GM Adjustment / Override
Final Boss Value
```

Runtime Current HP / MP are Boss Instance values, not Boss Design Profile values.

---

# 7. Locked Boss Profile → Instance Workflow

Boss persistence uses two layers:

```text
Boss Design Profile
→ GM-approved design-time Final Boss Values

Boss Instance
→ one spawned encounter/runtime copy
```

GM UI must provide an explicit Spawn Boss Instance action.

```text
Final Boss Profile
→ snapshot current Final Boss Values
→ create Boss Instance
→ initialize runtime state
```

---

# 8. Boss Instance Runtime State

Boss Instance owns runtime values such as:

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

Runtime changes never silently write back to the Boss Design Profile.

---

# 9. Profile Editing vs Existing Instances

```text
Edit Boss Design Profile
→ affects future design / future spawns
→ does NOT silently mutate existing Boss Instances
```

Intentional edits to an existing Instance are separate explicit Instance-level overrides and remain auditable.

---

# 10. Boss Phase — Conditions + GM Override

Boss Phase architecture is locked as:

```text
Phase Definition
→ one or more trigger conditions
→ system evaluates / detects trigger state
→ Phase transition becomes applicable
→ GM retains manual override authority
```

Supported condition types are extensible. Examples may later include:

```text
HP threshold / percentage
round / turn condition
specific event / flag
Skill / mechanic state
other encounter conditions
```

The exact trigger catalogue is not required for the first implementation.

GM runtime controls must be able to represent actions equivalent to:

```text
Force Enter Phase
Delay / hold Phase
Skip Phase
Move to another allowed Phase
```

The system must not restrict every Phase to HP-only triggers, and the GM must not be restricted to manual-only switching.

Whether a satisfied condition immediately transitions, asks for GM confirmation, or uses another UI presentation remains implementation / Alpha tuning unless explicitly locked later.

---

# 11. Phase Profile vs Runtime Ownership

```text
Boss Design Profile
→ Phase definitions / trigger definitions

Boss Instance
→ current Phase
→ trigger progress / runtime flags
→ GM Phase override state
```

Phase definitions are snapshotted into the Boss Instance at spawn. Later Profile edits do not silently change an existing Instance.

---

# 12. Ordinary Monster Spawn Workflow

For an ordinary spawned instance:

```text
1. Roll STR / DEX / CON / POW / INT / SIZ independently
2. Roll 10% Elite check
3. If Elite, one +1..+5 bonus applies to all six
4. Save Natural Attributes
5. Apply GlobalGrowth(Level) + Attribute Growth Weights
6. Save Effective Attributes
7. Calculate HP / MP
8. Attach Monster Skills
9. Preserve Stored Accuracy; Level does not scale it
10. Resolve Damage Attribute Links / Basis
11. Calculate Level-adjusted Base Damage
12. Calculate Damage Center
13. Generate Suggested Spread from Level
14. Apply GM Spread correction / override
15. Save Final Spread
16. Resolve D100 hit / extreme state
17. Resolve signed Spread Roll and Raw Damage on hit
18. Apply defence / resistance
19. Save instance state
```

Boss creation reuses relevant calculations as baseline, then applies the Boss GM Final Adjustment Layer before a Boss Instance is spawned.

---

# 13. Monster Resources

```text
Calculated Max HP = ceil((Effective CON + Effective SIZ) / 2)
Calculated Max MP = Effective INT × 3
```

No second Level multiplier applies because Effective Attributes already contain Level scaling.

Boss baseline resources use the same formulas where applicable, then GM may set Boss Final Max HP / MP.

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

Old Lower/Upper Spread and Attribute-Ratio fields are superseded. Standard Spread is Level-generated and GM-corrected.

---

# 15. Accuracy Rules — No Automatic Level Scaling

Stored Skill Accuracy may exceed 100.

```text
Monster Level changes
→ Stored Accuracy remains unchanged

Modified Accuracy
= Stored Skill Accuracy + Total Hit Modifier

Effective Accuracy
= min(100, Modified Accuracy)
```

Raw D100 extremes:

```text
1   → Great Failure
100 → Great Success
```

GM UI must not present an `Accuracy after Level scaling` field because no such standard calculation exists.

---

# 16. Critical Follow-Up — Deferred to Monster AI Design

The system preserves Great Success / Great Failure state but does not hard-code Monster-only critical effects such as maximum Spread, fixed multipliers, defence bypass, automatic Status or self-damage.

Monster-specific follow-up remains deferred to future Monster Combat AI / behavioural AI design.

---

# 17. Damage Attribute Links

A damaging Skill may select zero, one or multiple:

```text
STR DEX CON POW INT SIZ
```

One selection uses that Effective Attribute. Multiple selections use their arithmetic mean.

This basis modifies damage only, not Accuracy.

---

# 18. Locked Skill Base-Damage Level Curve

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

---

# 19. Locked Damage Center

```text
Calculated Damage Center
= Calculated Base Damage + Damage Attribute Basis
```

If no Attribute is linked, `Damage Attribute Basis = 0`.

---

# 20. Level-Generated Signed Damage Spread Range

```text
Monster Level
→ System Suggested Spread Min / Max
→ GM Min / Max adjustment or override
→ Final Spread Min / Max
```

Validation:

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

The exact Level-to-Spread numeric generator remains Alpha Tuning and should stay data-driven.

---

# 21. Audit Requirements

GM must be able to distinguish calculated, suggested, GM-adjusted, snapshotted and runtime values.

For Monster Skills preserve Accuracy calculations, raw D100/extreme state, Damage Attribute links/Basis, Base Damage, Damage Center, Suggested/Final Spread, Spread Roll and Raw Damage.

Boss audit additionally preserves:

```text
Boss baseline values
Boss GM overrides
Final Boss Profile values
source Boss Profile / revision metadata where practical
Boss Instance snapshot values
Instance-specific overrides
Current HP / MP
current Phase / trigger progress / override state
Status / cooldown / temporary state
```

---

# 22. GM UI Requirements

Boss UI must support:

```text
Add from Common Monster Skill Library
Create New Unique Monster Skill
Spawn Boss Instance
View Boss Instances
Edit Instance Override
inspect / control Phase runtime state
```

Boss Design UI exposes baseline beside Final values.

Critical-result controls wait for the future AI / critical design pass.

---

# 23. Template / Profile vs Instance Editing

```text
Edit reusable Common / Template Skill
→ affects reusable definition / future use

Edit ordinary Spawned Skill Override
→ affects only that Monster Instance

Edit Boss Design Profile
→ affects future Boss spawns
→ does not silently change existing Boss Instances

Edit Boss Instance Override
→ affects only that Boss Instance
```

Design baseline, GM Final values, spawn snapshots, Instance overrides and runtime state must not be conflated.

---

# 24. Resolved / Deferred Items

Resolved:

```text
Monster Skill Accuracy Level scaling
→ no automatic Level scaling

Boss Skills
→ Common Monster Skills + GM-authored unique Monster Skills
→ same Monster Skill Profile system

Boss numeric design
→ dedicated Boss Design Profile / interface
→ ordinary Monster rules provide baseline
→ GM tunes Final Boss values
→ no universal Boss multiplier

Boss persistence
→ Boss Design Profile + Boss Instance
→ spawn snapshots Final Boss design
→ runtime state belongs to Instance
→ Profile edits do not silently mutate existing Instances

Boss Phase architecture
→ condition-triggered
→ GM manual override retained
→ trigger catalogue remains extensible
```

Deferred / tuning:

1. Monster Great Success / Great Failure post-resolution behaviour — future Monster AI design;
2. Monster AI Skill selection / behavioural logic;
3. numeric Spread-generation tuning;
4. complete Phase-trigger catalogue and exact transition UI behaviour;
5. Resistance / Immunity details;
6. advanced Boss special mechanics.

The current architecture is sufficient to begin a playable implementation without resolving every deferred detail first.
