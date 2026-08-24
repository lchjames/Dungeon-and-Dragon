# MVP Implementation Scope — Alpha

> Status: Canonical Alpha Implementation Scope  
> Date: 2026-08-24  
> Purpose: Define the minimum playable vertical slice and stop over-designing non-blocking details before implementation and play-testing.

---

# 1. Active Development Mode

The project is in **MVP Implementation Mode**.

The immediate objective is not to finish every TRPG subsystem or lock every tuning coefficient. The objective is to produce a playable build in which GM and Players can complete an actual Scenario / Encounter using D1-authoritative data and confirmed Canonical rules.

```text
If a decision is required to implement the playable vertical slice
→ resolve it now

If a detail is not required to make the playable vertical slice work
→ defer it to Alpha Tuning / Future Update
```

Do not continue decomposing systems into increasingly fine design questions merely because more detail could theoretically be specified.

---

# 2. Architecture That Must Remain Stable

```text
Authoritative data ownership
Core entity relationships
Profile vs Instance boundaries
EXP / Level authority
core Attribute storage
HP / MP authority
Player vs GM write permissions
shared D100 resolution
shared damage pipeline boundaries
Monster / Boss persistence boundaries
round / turn ownership
Scenario / Scene / Encounter relationships
```

---

# 3. Details That May Remain Incomplete

```text
exact Monster Spread numeric curve
exact Boss balance numbers
advanced Boss Phase trigger catalogue
Monster / Boss AI
Monster-specific critical follow-up
full Resistance / Immunity rules
advanced Status stacking
Encounter Difficulty rating
Loot tables
Economy
Quest engine
full tactical Map / movement system
advanced UI polish
special-case Boss mechanics
late-game progression tuning
```

A missing advanced feature must not force duplication of the core engine.

---

# 4. First Playable Vertical Slice

```text
User authentication
→ Player Character exists in D1
→ Canonical Attributes / EXP / Level / HP / MP / Skills
→ GM Character controls
→ Scenario
→ Scene
→ Encounter
→ Monster Template / Skill content
→ spawned Monster Instance
→ Character + Monster Encounter participants
→ shared DEX Initiative / Combat
→ Player / GM D100 actions
→ damage / HP updates
→ defeat handling
→ Combat completion
→ Encounter resolution
→ Scene continuation
```

A simple Boss Instance is the next validation layer after the ordinary Monster loop works.

---

# 5. MVP Implementation Order

```text
1. Shared server-side Rules module                         IMPLEMENTED
2. D1 Character progression / Attribute / resource model  IMPLEMENTED
3. Character Creation initialization / migration          IMPLEMENTED
4. GM D1 Character controls                               IMPLEMENTED
5. Round / Combat State Engine                            IMPLEMENTED
6. Player Combat Control                                  IMPLEMENTED
7. D100 Combat Resolver + Damage + HP 0                   IMPLEMENTED MVP CHARACTER PATH
8. Scenario / Scene / Encounter Foundation                IMPLEMENTED MVP FOUNDATION
9. Monster Template / Skill / Instance runtime            IMPLEMENTED NON-BLOCKED PATH
10. Simplified Monster defence + Player → Monster path     CURRENT BLOCKER
11. Boss Design Profile / Boss Instance minimum runtime
12. First End-to-End Scenario Test
```

The Character-only attack test path continues to use the temporary GM-authored bridge in `PLAYER_ATTACK_PROFILE_MVP.md` until Weapon / Equipment / Specialisation source profiles exist.

The Monster runtime uses `MONSTER_RUNTIME_MVP.md` together with the existing Monster Canonical documents. Full Tactical Map simulation remains Deferred.

---

# 6. Implemented Foundation

Implemented outcomes now include:

```text
EXP authoritative
Level server-derived and capped at 100
Player creation EXP 1 / Level 1
server-rolled Character Attributes
Canonical Player HP / MP initialization
23 Canonical basic Skills
fixed 200 Creation Skill Points
all 200 Creation points required before Finalize
legacy migration handling
GM D1 Character controls
secure initial GM provisioning

D1 Combat / Combatant persistence
DEX Initiative snapshot
stable random equal-DEX ordering
Round / Current Turn ownership
1 Action + 1 Move allowance
GM Start / Force / End Turn / End Combat
Player own Turn controls
stale-state protection

GM-authored Character Attack Profiles
server D100 Attack vs Character Dodge
shared opposed Result comparison
shared Damage Result pipeline
Character HP 0 → DYING
Dying countdown / further-damage death
DEAD Character lock

single-campaign Scenario persistence
Scenario → Scene → Encounter D1 relationships
Story status controls
simple Scene Map metadata
Encounter Character participant assignment
Encounter → optional Combat link

Monster Template persistence
six mandatory Monster Attribute ranges
six independent Monster Attribute Growth Weights
Common Monster Skill Library
Template → Common Skill loadout
ordinary Monster spawn into an Encounter
10% Elite generation + one +1..+5 all-Attribute bonus
Natural / Effective Monster Attribute layers
locked Monster Level growth formula
calculated Monster HP / MP
snapshotted Monster Instance Skill values
locked Monster Skill damage Level curve
Damage Attribute Links / arithmetic-mean basis
Calculated Damage Center
central replaceable Suggested Spread tuning
GM per-Instance Skill Final Spread override
Monster Instance resource correction
monster_instance Encounter participation
Character + Monster shared Initiative
GM-controlled Monster Turn
Monster Action reservation
Monster Stored / Modified / Effective Accuracy audit
Monster D100 attack vs Character Dodge
Monster signed Spread damage
Character HP / DYING / DEAD integration from Monster damage
Monster action audit log
```

Monster source edits do not silently rewrite already spawned Instance snapshots.

Current Character post-hit `Effective Defence` and Monster → Character post-hit `Effective Defence` are `0` in the MVP until armour / resistance / shield sources are integrated into the shared Damage pipeline.

---

# 7. Monster Runtime Boundary

Confirmed Monster rules are centralized rather than copied into UI code.

```text
GlobalGrowth(Level)
= ((Level - 1) / 21.7)^2

Effective Attribute
= round(Natural × [1 + GlobalGrowth × Attribute Growth Weight])

Calculated Max HP
= ceil((Effective CON + Effective SIZ) / 2)

Calculated Max MP
= Effective INT × 3

MonsterDamageGrowth(Level)
= 7 × ((Level - 1) / 99)^1.5

Calculated Base Damage
= round(Template Base Damage × [1 + MonsterDamageGrowth × Damage Growth Weight])

Calculated Damage Center
= Calculated Base Damage + Damage Attribute Basis
```

Stored Monster Skill Accuracy does not Level-scale and may exceed 100. Runtime Effective Accuracy is capped at 100 after modifiers.

Exact Spread balance remains Alpha Tuning. The executable MVP keeps one centralized replaceable suggestion function; GM Final Spread overrides remain available per spawned Instance Skill.

---

# 8. Implementation Design Rule

Prefer:

```text
shared resolver functions
data-driven tuning
calculated / override / final layers
Profile → Instance snapshot boundaries
migration scripts
server-side validation
conditional D1 state transitions
```

Avoid:

```text
copying formulas into Player / Monster / Boss UI separately
using browser localStorage as authoritative campaign data
mixing design-time Profile data with runtime Instance state
allowing Player requests to submit authoritative combat numbers
duplicating Combat state inside Encounter records
inventing unresolved Monster defence values
inventing Player-style ordinary Monster Dying rules without confirmation
```

---

# 9. Definition of Implemented

A rule is not implemented merely because it appears in Markdown.

For MVP purposes, implementation requires the relevant production-style path where needed:

```text
D1 schema / migration
server-side resolver
API validation
Player / GM control path
runtime state
regression contracts
```

GitHub `main` is the source tree, but a commit on `main` does not prove Cloudflare production deployment.

---

# 10. First Play-Test Milestone

The MVP milestone requires at least:

```text
one Player Character
one Scenario
one Scene
one Encounter
one ordinary Monster Template
one ordinary Monster Instance
Character + Monster Initiative
Player and GM turns
D100 hit resolution in both required directions
Damage
HP updates
Monster defeat
Character HP0 handling
Combat completion
Encounter resolution
Scene continuation
```

A simple Boss may then be added as the next validation layer.

---

# 11. Current Immediate Blocker

The non-blocked ordinary Monster runtime is implemented around:

```text
Template
→ Common Skill loadout
→ Spawn Instance
→ Encounter
→ Character + Monster Combat
→ GM Monster Turn
→ Monster Skill vs Character Dodge
→ Damage
```

The next genuine rule blocker is narrower:

```text
What authoritative value does a Simplified Monster use to defend against a Player attack?
```

Confirmed Monster offensive `Stored Accuracy` does not answer this question. No current Canonical rule says whether defence comes from Effective DEX, a dedicated Stored Defence value, or a defensive Monster Skill/Profile.

Until that one decision is confirmed:

```text
Monster → Character = executable
Player → Monster = deliberately not enabled
```

Do not silently invent the defence source merely to close the loop.
