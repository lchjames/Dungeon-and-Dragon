# MVP Implementation Scope — Alpha

> Status: Canonical Alpha Implementation Scope  
> Date: 2026-08-24  
> Purpose: Define the minimum playable vertical slice and stop over-designing non-blocking details before implementation and play-testing.

---

# 1. Active Development Mode

The project is now in **MVP Implementation Mode**.

The immediate objective is not to finish every TRPG subsystem or lock every tuning coefficient. The objective is to produce a playable build in which GM and Players can complete an actual scenario / encounter using D1-authoritative data and the already-confirmed Canonical rules.

Canonical working rule:

```text
If a decision is required to implement the playable vertical slice
→ resolve it now

If a detail is not required to make the playable vertical slice work
→ defer it to Alpha Tuning / Future Update
```

Do not continue decomposing systems into increasingly fine design questions merely because more detail could theoretically be specified.

---

# 2. What Must Be Stable Before Implementation

The following categories must be sufficiently stable because later reversal would cause expensive schema, resolver or migration changes:

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

These are architecture-level decisions.

---

# 3. What May Remain Incomplete

The following do not block the first playable build and should normally remain configurable, Deferred, or Alpha Tuning until real content / play-test data exists:

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

A missing advanced feature must not force premature duplication of the core engine.

---

# 4. First Playable Vertical Slice

The MVP should support the following complete path:

```text
User authentication
→ Player Character exists in D1
→ Character has Canonical Attributes / EXP / Level / HP / MP / Skills
→ GM can inspect/manage the Character
→ Scenario exists
→ Scene exists
→ Encounter exists
→ GM can create/select Monster content
→ Monster Instance participates in the Encounter / Combat
→ optional Boss Design Profile can spawn a Boss Instance
→ GM starts Combat
→ DEX Initiative order is created
→ combatants receive Action + Move turns
→ Player / GM resolves D100 actions
→ successful attack resolves damage
→ HP / MP update through server authority
→ HP 0 / Down-Dying baseline works
→ End Turn / Round advances correctly
→ GM can end Combat
→ Encounter can resolve and Scene can continue
```

The first playable target is therefore an **end-to-end scenario / encounter**, not feature completeness.

---

# 5. MVP Implementation Order

Current implementation priority:

```text
1. Shared server-side Rules module                         IMPLEMENTED
2. D1 Character progression / Attribute / resource model  IMPLEMENTED
3. Character Creation initialization / migration          IMPLEMENTED
4. GM D1 Character controls                               IMPLEMENTED
5. Round / Combat State Engine                            IMPLEMENTED
6. Player Combat Control                                  IMPLEMENTED / current slice
7. D100 Combat Resolver + Damage + HP 0                   NEXT
8. Scenario / Scene / Encounter Foundation                REQUIRED BEFORE MONSTER INTEGRATION
9. Monster Template / Skill / Instance runtime
10. Boss Design Profile / Boss Instance minimum runtime
11. First End-to-End Scenario Test
```

`SCENARIO_SCENE_ENCOUNTER_MVP.md` defines why the narrative/context layer is inserted before Monster Runtime is connected into the first complete scenario flow.

The full Tactical Map Engine remains Deferred; Scenario / Scene may later reference a simple Map asset without requiring token movement, LOS, terrain, or fog-of-war in the first MVP.

Do not begin with advanced Boss AI, full Phase mechanics, Loot, Economy, Quest automation or Tactical Map simulation before the end-to-end scenario path works.

---

# 6. Implemented Foundation

The Character and Combat foundations have moved onto the Canonical model.

Implemented outcomes include:

```text
EXP authoritative
Level server-derived and capped at 100
normal Player creation starts EXP 1 / Level 1
server-rolled Character Attributes
Canonical HP / MP initialization
23 Canonical basic Skills initialized
fixed 200 Creation Skill Points
Creation Skill save with per-Skill cap 30
all 200 points required before Finalize
legacy Level-only migration handling
legacy missing resource Attributes flagged rather than invented
GM D1 Character inspection / EXP / Current HP-MP correction
one-time secure initial GM provisioning
D1 Combat / Combatant persistence
DEX Initiative snapshot
stable random equal-DEX ordering
Round / Current Turn ownership
1 Action + 1 Move allowance state
GM Start / Force Turn / End Turn / End Combat
Player active Combat visibility
Player own Action / Move allowance mutation
Player End Own Turn
stale-state / double-advance protection
```

The exact Character creation Attribute reroll cap may remain unresolved while the MVP supports Roll → Reroll → Confirm without hard-coding a permanent limit.

---

# 7. Implementation Design Rule

Temporary Alpha tuning values must be kept easy to replace.

Prefer:

```text
shared resolver functions
data-driven tables
explicit calculated / override / final layers
nullable / backwards-compatible optional fields
migration scripts
server-side validation
conditional D1 state transitions
```

Avoid:

```text
copying the same formula into Player, Monster and Boss UI separately
hard-coding tuning coefficients into multiple files
using browser localStorage as authoritative campaign data
mixing design-time Profile data with runtime Instance state
allowing direct Player edits to authoritative resources
creating a second browser-only Turn model
```

---

# 8. Definition of "Implemented"

A rule is not implemented merely because it appears in Markdown.

For MVP purposes, implementation means the relevant rule exists in the actual production path where needed:

```text
D1 schema / migration
server-side resolver
API validation
Player / GM control path
runtime state
```

UI polish may lag behind functional support if the path is still usable for testing.

GitHub `main` is the source tree, but a commit on `main` does not by itself prove that the Cloudflare production Worker has been deployed. Deployment remains an explicit operational step unless CI/CD is later configured to deploy automatically.

---

# 9. First Play-Test Milestone

The MVP milestone is reached when the project can perform at least one complete representative Scenario / Encounter using the production-style architecture:

```text
at least one Player Character
one Scenario
one Scene
one Encounter
at least one ordinary Monster
optionally one simple Boss Instance
initiative
turn progression
D100 hit resolution
damage
HP / MP updates
basic defeat / HP 0 handling
combat completion
Encounter resolution
Scene continuation
```

After this milestone, numeric curves and advanced mechanics should be adjusted using actual observed play rather than paper-only speculation wherever practical.

---

# 10. Current Immediate Blocker

Player Combat Control now uses the shared D1 Combat state rather than a browser-local duplicate.

Player authority is resolved through:

```text
authenticated User
→ combatant.controller_user_id
→ Current Combatant
```

The Player may only mutate Action / Move or End Turn while controlling the Current Combatant. Stale concurrent requests are rejected instead of silently double-advancing the Turn state.

The next major implementation blocker is now:

```text
D100 Combat Resolver
+ Damage
+ HP 0 / Down-Dying baseline
```

Once that core resolver exists, implement the Scenario / Scene / Encounter Foundation before connecting Monster Runtime into the first full scenario flow.
