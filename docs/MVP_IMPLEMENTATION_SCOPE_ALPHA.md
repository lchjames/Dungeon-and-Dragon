# MVP Implementation Scope — Alpha

> Status: Canonical Alpha Implementation Scope  
> Date: 2026-08-25  
> Purpose: Define the minimum playable vertical slice and prevent non-blocking design details from delaying implementation and play-testing.

---

# 1. Active Development Mode

The project is in **MVP Implementation Mode**.

```text
If a decision is required to implement the playable vertical slice
→ resolve it now

If a detail is not required to make the playable vertical slice work
→ defer it to Alpha Tuning / Future Update
```

Do not decompose already-implementable systems into extra design questions merely because more detail could theoretically be specified.

---

# 2. Architecture That Must Remain Stable

```text
D1 authoritative data ownership
Core entity relationships
Profile vs Instance boundaries
EXP / Level authority
Attribute storage
HP / MP authority
Player vs GM write permissions
shared D100 resolution
shared damage pipeline boundaries
Monster / Boss persistence boundaries
Round / Turn ownership
Scenario / Scene / Encounter relationships
```

---

# 3. Details That May Remain Incomplete

The following do not block the first playable Alpha unless they become concrete integration blockers:

```text
exact Monster Spread tuning
exact Boss balance numbers
advanced Boss Phase trigger catalogue
Monster / Boss AI
Monster-specific critical follow-up
full Resistance / Immunity rules
advanced Status stacking
Encounter Difficulty rating
Loot tables
Economy
Quest automation
full tactical Map / movement engine
advanced UI polish
special-case Boss mechanics
late-game progression tuning
```

---

# 4. Playable Vertical Slice

The MVP path is now:

```text
User authentication
→ Player Character exists in D1
→ Canonical Attributes / EXP / Level / HP / MP / Skills
→ GM Character controls
→ Scenario
→ Scene
→ Encounter
→ Character / Monster / Boss participants
→ shared DEX Initiative / Combat
→ Player / GM D100 actions
→ Armor-aware damage where implemented
→ HP / life-state updates
→ Monster / Boss defeat
→ GM ends Combat
→ Encounter resolution
→ Scene continuation
```

The remaining milestone is no longer another combat-rule design pass. It is the first real end-to-end Scenario play-test and integration correction cycle.

---

# 5. MVP Implementation Order

```text
1. Shared server-side Rules module                         IMPLEMENTED
2. D1 Character progression / Attribute / resource model  IMPLEMENTED
3. Character Creation initialization / migration          IMPLEMENTED
4. GM D1 Character controls                               IMPLEMENTED
5. Round / Combat State Engine                            IMPLEMENTED
6. Player Combat Control                                  IMPLEMENTED
7. D100 Combat Resolver + Damage + Character HP0          IMPLEMENTED MVP PATH
8. Scenario / Scene / Encounter Foundation                IMPLEMENTED MVP FOUNDATION
9. Monster Template / Skill / Instance runtime            IMPLEMENTED
10. Monster Dedicated Defence + Armor                     IMPLEMENTED
11. Monster HP0 + Player ↔ Monster loop                   IMPLEMENTED
12. Boss Design Profile / Boss Instance runtime           IMPLEMENTED MVP PATH
13. Boss HP0 + Player ↔ Boss loop                         IMPLEMENTED MVP PATH
14. First End-to-End Scenario Test                        NEXT
```

Character physical attacks continue to use the temporary GM-authored bridge in `PLAYER_ATTACK_PROFILE_MVP.md` until Weapon / Equipment / Specialisation source profiles exist.

Relevant Monster/Boss Canonical documents include:

```text
MONSTER_RUNTIME_MVP.md
MONSTER_DEFENCE_ARMOR_MVP.md
MONSTER_DEFEAT_MVP.md
BOSS_DESIGN_PROFILE_ALPHA.md
BOSS_RUNTIME_MVP.md
BOSS_DEFEAT_MVP.md
```

---

# 6. Implemented Character / Combat Foundation

Implemented outcomes include:

```text
EXP authoritative
Level server-derived, cap 100
Player creation EXP 1 / Level 1
server-rolled Character Attributes
Canonical HP / MP initialization
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
server D100 attacks
shared opposed Result comparison
shared Damage Result pipeline
Character HP0 → DYING
Dying countdown / further-damage death
DEAD Character lock
```

Character post-hit armour / resistance sources remain a later extension. Existing Monster/Boss-origin attacks therefore keep Character `Effective Defence = 0` until those sources are implemented.

---

# 7. Implemented Scenario Foundation

```text
single-campaign persistence
Scenario → Scene → Encounter
Story status controls
simple Scene Map metadata
Encounter participant assignment
Encounter → optional Combat link
```

Encounter participant entity types:

```text
character
monster_instance
boss_instance
```

A full tactical Map engine remains Deferred.

---

# 8. Implemented Ordinary Monster Runtime

```text
Monster Template persistence
six mandatory Attribute ranges
six independent Attribute Growth Weights
Common Monster Skill Library
Template → Common Skill loadout
ordinary Monster spawn into Encounter
10% Elite generation
one +1..+5 Elite bonus applied to all six Natural Attributes
Natural / Effective Attribute layers
calculated HP / MP
snapshotted Instance Skills
Monster damage Level curve
Damage Attribute Links / arithmetic-mean basis
Calculated Damage Center
replaceable Suggested Spread tuning
GM per-Instance Skill Final Spread override
Monster Instance resource correction
Character + Monster shared Initiative
GM-controlled Monster Turn
Monster Action reservation
Monster Stored / Modified / Effective Accuracy audit
Monster Skill vs Character Dodge
Monster signed Spread damage
Character HP / DYING / DEAD integration
Monster action audit
```

Monster D100 defence and Armor are separate:

```text
Modified Defence
= Stored Defence + Defence Modifier

Effective D100 Defence
= min(100, Modified Defence)

Final Armor Defence
= Armor Base Defence + Armor Defence Adjustment
```

Stored Defence may exceed 100 and does not automatically Level-scale. Armor participates after a successful hit, not in the opposed D100 check.

Player → Monster is implemented using:

```text
Player Attack Profile
vs Monster Effective D100 Defence
→ opposed D100
→ Player Raw Damage
→ Monster Final Armor Defence
→ Damage Result
→ Monster HP
```

Ordinary Monster HP0:

```text
Current HP <= 0
→ clamp 0
→ status = defeated immediately
```

Ordinary Monsters do not inherit Player DYING.

---

# 9. Implemented Boss Runtime

Bosses reuse Monster mathematics instead of introducing a second combat engine.

```text
Boss Design Profile
→ Monster-style Calculated Baseline
→ GM Override
→ Final Boss Values
→ Spawn Boss Instance
→ snapshot Final Profile values
→ Encounter / shared Combat runtime
```

Implemented Boss Profile / Instance boundaries include:

```text
Natural Attributes + Growth Weights
Calculated Effective Attributes
optional Final Attribute overrides
Calculated / Final Max HP and MP
Final Stored Defence
Final Armor data
Common + Unique Boss Skills
ordered Phase definitions
Profile → Instance snapshots
Instance Current HP / MP
Instance runtime Defence / Armor adjustments
Current Phase
Phase hold state
```

Profile edits do not silently mutate existing Boss Instances.

Boss Skills:

```text
Common Monster Skills
+ GM-authored Unique Boss Skills
→ same Monster Skill Profile fields
→ same Accuracy / damage / Attribute-link / Spread mathematics
```

Boss Phase MVP:

```text
ordered Phase definitions
optional HP % threshold applicability signal
GM Force / Hold / Move Phase control
```

Threshold applicability does not automatically force an irreversible transition.

Boss → Character is implemented through the shared opposed D100 and Character life-state pipeline.

Player → Boss is implemented through:

```text
Player Attack Profile Stored Accuracy
vs Boss Effective D100 Defence
→ opposed D100
→ Player Raw Damage
→ Boss Final Armor Defence
→ Damage Result
→ Boss HP
```

Boss HP0 is now Canonical:

```text
Current HP > 0
→ status = active

Current HP <= 0
→ clamp 0
→ status = defeated immediately
```

A defeated Boss:

```text
loses ordinary Action / Move
cannot use normal Boss Skill attacks
cannot be selected as a normal active hostile target
remains in Combat history / audit as needed
```

Bosses do not inherit Player DYING. Lethal damage does not automatically force a final Phase. A future explicit Boss mechanic may define an exception, but the default lifecycle remains immediate defeat.

GM Current HP correction reconciles Boss status:

```text
defeated + HP > 0
→ active

active + HP = 0
→ defeated

removed
→ remains removed
```

---

# 10. Shared Implementation Design Rules

Prefer:

```text
shared resolver functions
data-driven tuning
Calculated / Override / Final layers
Profile → Instance snapshot boundaries
migration scripts
server-side validation
conditional / stale-safe D1 state transitions
server-owned authoritative combat numbers
explicit audit trails
```

Avoid:

```text
copying formulas into Player / Monster / Boss UI separately
using browser localStorage as authoritative campaign data
mixing design-time Profile data with runtime Instance state
allowing Player requests to submit authoritative combat numbers
duplicating Combat state inside Encounter records
deriving Monster/Boss D100 Defence from Effective DEX
adding Armor Defence directly to the D100 opposed check
bypassing Armor after a successful Player hit
negative Monster / Boss HP
applying Player DYING to ordinary Monster / Boss by default
automatically ending Combat / Encounter when one hostile is defeated
automatically converting lethal Boss damage into a new Phase without an explicit mechanic
```

---

# 11. Definition of Implemented

A rule is not implemented merely because it appears in Markdown.

Implementation requires the relevant production-style path where applicable:

```text
D1 schema / migration
server-side resolver
API validation
Player / GM control path
runtime state
regression / static contracts
```

GitHub `main` is the source tree; a commit on `main` does not by itself prove Cloudflare production deployment.

---

# 12. First End-to-End Scenario Test — Current Immediate Direction

There is no remaining required Character / ordinary Monster / minimum Boss combat-rule blocker before the first integrated play-test.

The next milestone should exercise at minimum:

```text
one Player Character
one Scenario
one Scene
one Encounter
one ordinary Monster Template / Instance
one simple Boss Design Profile / Boss Instance
Character + Monster + Boss shared Initiative
Player Turn controls
GM Monster Turn
GM Boss Turn
Player → Monster
Monster → Character
Player → Boss
Boss → Character
Armor-aware hostile damage reduction
Character HP0 / DYING
Monster HP0 / defeated
Boss HP0 / defeated
Boss Phase applicability + GM manual Phase control
GM End Combat
Encounter resolution
Scene continuation
```

Failures found in this play-test should be treated as integration bugs or Alpha tuning items unless they reveal a genuine missing Canonical rule.
