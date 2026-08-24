# Monster Runtime — MVP

> Status: Canonical MVP Implementation Contract  
> Date: 2026-08-24  
> Scope: Minimum ordinary Simplified Monster runtime required to connect Monster Templates / Skills / Instances into Scenario, Encounter and Combat without inventing unresolved Monster defence rules.

---

# 1. Existing Canonical Rules Reused

This MVP implements the already-confirmed ordinary Monster pipeline from:

- `MONSTER_NPC_SYSTEM_ALPHA.md`
- `MONSTER_LEVEL_SCALING_ALPHA.md`
- `MONSTER_ATTACK_PROFILE_ALPHA.md`
- `GM_MONSTER_MANAGEMENT_ALPHA.md`
- `D100判定核心_ALPHA.md`
- `COMBAT_DAMAGE_MODEL_ALPHA.md`

No second Monster combat engine is introduced.

---

# 2. Runtime Ownership

Persistent authority remains Cloudflare D1.

```text
Monster Template
→ reusable design-time Attribute ranges / Growth Weights

Monster Skill Profile
→ reusable Common Monster Skill source

Monster Template Skill Link
→ approved Skill loadout for one Template

Spawn Monster Instance
→ independent Attribute rolls
→ optional Elite generation
→ Natural Attributes
→ Effective Attributes
→ resource calculation
→ snapshotted Skill runtime values

Monster Instance
→ Encounter participant
→ Combat participant
→ Current HP / MP and runtime state
```

Editing a Template or Common Skill later must not silently mutate an existing spawned Monster Instance.

---

# 3. Template MVP Fields

Every ordinary Monster Template stores:

```text
Name
Summary
Active / Inactive

STR min / max / Growth Weight
DEX min / max / Growth Weight
CON min / max / Growth Weight
POW min / max / Growth Weight
INT min / max / Growth Weight
SIZ min / max / Growth Weight

approved Common Monster Skill links
```

All six Attribute ranges are mandatory and each `min <= max`.

---

# 4. Common Monster Skill MVP Fields

The first executable Common Monster Skill implementation stores:

```text
Name
Stored Accuracy
Damage Type
Template Base Damage
Damage Growth Weight
Damage Attribute Links
Range / Reach text
Targeting text
MP Cost
Cooldown
GM Notes
Active / Inactive
```

Stored Accuracy:

```text
may exceed 100
does not scale with Monster Level
Modified Accuracy = Stored Accuracy + explicit modifiers
Effective Accuracy = min(100, Modified Accuracy)
```

Monster-specific Great Success / Great Failure follow-up remains Deferred.

---

# 5. Spawn Pipeline

For ordinary Monster Instance spawn:

```text
1. read active Template
2. choose Monster Level 1–100
3. independently roll STR / DEX / CON / POW / INT / SIZ from Template ranges
4. roll 10% Elite check
5. if Elite, roll one +1..+5 Elite Bonus and add it to all six base rolls
6. save post-Elite values as Natural Attributes
7. calculate Effective Attributes using the locked Level curve
8. calculate Max HP / MP
9. snapshot approved Template Skill loadout
10. calculate per-Instance Skill damage values
11. generate Suggested Spread
12. initialize Final Spread from the suggestion
13. allow explicit GM Instance-Skill Spread override
14. initialize Current HP / MP at Final Max values
```

Canonical Attribute formula:

```text
GlobalGrowth(Level)
= ((Level - 1) / 21.7)^2

Effective Attribute
= round(
    Natural Attribute
    × [1 + GlobalGrowth(Level) × Attribute Growth Weight]
  )
```

Resources:

```text
Calculated Max HP = ceil((Effective CON + Effective SIZ) / 2)
Calculated Max MP = Effective INT × 3
```

For this MVP, Final Max HP / MP initially equal Calculated Max HP / MP. Instance-level resource override UI may be extended later without changing the calculation layers.

---

# 6. Monster Skill Damage Snapshot

```text
MonsterDamageGrowth(Level)
= 7 × ((Level - 1) / 99)^1.5

Calculated Base Damage
= round(
    Template Base Damage
    × [1 + MonsterDamageGrowth(Level) × Damage Growth Weight]
  )
```

Damage Attribute Basis:

```text
0 selected Attributes → 0
1 selected Attribute  → that Effective Attribute
multiple Attributes   → arithmetic mean of selected Effective Attributes
```

Then:

```text
Calculated Damage Center
= Calculated Base Damage + Damage Attribute Basis
```

Runtime hit damage:

```text
Spread Roll
= random integer in [Final Spread Min, Final Spread Max]

Raw Monster Damage
= max(0, Calculated Damage Center + Spread Roll)
```

Character post-hit Effective Defence remains the currently implemented MVP value `0` until armour / resistance sources are integrated into the shared damage pipeline.

---

# 7. Spread — MVP Tuning, Not Permanent Canonical Balance

The exact Level → Spread curve remains Alpha Tuning.

To make the runtime executable without pretending the tuning question is permanently solved, the MVP keeps one replaceable suggestion function with two conceptual anchors matching the already-documented direction:

```text
Level 1   → approximately [-2,+2]
Level 100 → approximately [-5,+15]
```

The implementation may interpolate between these anchors for the initial play-test build.

Important:

```text
Suggested Spread
≠ permanent Canonical balance law

GM may explicitly override Final Spread Min / Max per spawned Monster Skill
```

The tuning function must remain centralized and replaceable.

---

# 8. Encounter / Combat Integration

`encounter_participants` already reserves:

```text
character
monster_instance
boss_instance
```

This MVP activates `monster_instance`.

Encounter Start Combat may include:

```text
Character participants
+ active Monster Instance participants
```

Initiative uses the existing shared Combat rule:

```text
Effective DEX snapshot
→ high to low
→ equal DEX randomized once
→ stable for the Combat
```

Monster Combatants are GM-controlled (`controller_user_id = NULL`).

---

# 9. Monster Turn / Attack MVP

When Current Combatant is a Monster Instance, GM may select:

```text
one active snapshotted Monster Skill
one living Character target in the same Combat
```

Server authority performs:

```text
reserve / consume Monster Action
→ read snapshotted Stored Accuracy
→ cap Effective Accuracy at 100 after modifiers
→ roll Monster D100
→ read Character Canonical Dodge
→ roll Defence D100
→ shared opposed Result comparison
→ miss / defended OR hit
→ on hit: Damage Center + signed Spread Roll
→ shared Damage Result pipeline
→ Character HP update
→ existing Character HP0 / DYING / DEAD handling
→ action log
```

No Monster AI Skill selection is implemented. GM chooses the Skill.

---

# 10. Player → Monster Defence Blocker

There is currently **no confirmed Canonical source value for a Simplified Monster defending against a Player attack**.

The project has confirmed Monster offensive `Stored Accuracy`, but has not confirmed whether Monster defence should use:

```text
a dedicated Monster Defence / Dodge profile
another Monster Skill Profile
Effective DEX
another fixed or derived source
```

Therefore this MVP must **not** silently invent one.

Until the separate Defence Source decision is confirmed:

```text
Monster → Character attack = executable
Player → Monster attack = not enabled by the shared Player attack resolver
```

All other Monster Runtime work proceeds normally.

---

# 11. Monster HP 0 Boundary

The ordinary Simplified Monster HP0 life-cycle has not been separately confirmed as a Player-style DYING system.

Until that rule is intentionally locked, the first Monster Runtime does not invent a Player Dying countdown for ordinary Monsters.

Monster Current HP remains D1-authoritative and instance-level. Player-origin damage into Monster HP is not yet enabled because the preceding Monster Defence Source is unresolved.

---

# 12. Deferred

Still Deferred unless they become genuine blockers:

```text
Monster AI
automatic Skill selection
Monster-specific critical follow-up
full cooldown engine
advanced MP / resource-cost enforcement
Status stacking
Resistance / Immunity
exact Spread tuning
Encounter Difficulty
Loot
full Tactical Map interaction
```

---

# 13. Definition of Implemented for This Slice

This Monster Runtime slice is considered implemented when all non-blocked paths exist in production-style architecture:

```text
D1 schema
Monster rules module
GM Common Skill authoring
GM Template authoring
Template Skill assignment
spawn Monster Instance
Encounter participant assignment
Encounter + Character + Monster Combat start
Monster Initiative
GM Monster Turn inspection
GM Monster → Character D100 attack
Monster damage snapshot / Spread audit
Character HP / Dying integration
static / rules regression tests
```

The unresolved Player → Monster defence rule remains one explicit blocker rather than being hidden inside an invented implementation default.
