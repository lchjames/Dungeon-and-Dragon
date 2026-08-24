# MVP Implementation Scope — Alpha

> Status: Canonical Alpha Implementation Scope  
> Date: 2026-08-24  
> Purpose: Define the minimum playable vertical slice and stop over-designing non-blocking details before implementation and play-testing.

---

# 1. Active Development Mode

The project is now in **MVP Implementation Mode**.

The immediate objective is not to finish every TRPG subsystem or lock every tuning coefficient. The objective is to produce a playable build in which GM and Players can complete an actual combat encounter using D1-authoritative data and the already-confirmed Canonical rules.

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
full map / movement system
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
→ GM can create/select Monster content
→ Monster Instance can participate in combat
→ optional Boss Design Profile can spawn a Boss Instance
→ GM starts Combat
→ DEX initiative order is created
→ combatants receive Action + Move turns
→ Player / GM resolves D100 actions
→ successful attack resolves damage
→ HP / MP update through server authority
→ HP 0 / Down-Dying baseline works
→ End Turn / Round advances correctly
→ GM can end Combat
```

The first playable target is therefore an **end-to-end encounter**, not feature completeness.

---

# 5. MVP Implementation Order

Current implementation priority:

```text
1. Shared server-side Rules module
2. D1 migration to Canonical Character progression / Attributes / resources / Skills
3. Character Creation initialization and migration
4. GM D1 Character controls
5. Round / Combat state engine
6. Player server-authoritative Action / Move / resource actions
7. basic damage / HP 0 integration
8. Monster Template / Skill / Instance persistence and GM controls
9. Boss Design Profile / Boss Instance minimum runtime support
10. first real play-test encounter
```

Do not begin with advanced Boss AI, full Phase mechanics, Loot, Economy or Quest systems before the end-to-end encounter path works.

---

# 6. Immediate Foundation Slice

The initial Character foundation has now moved onto the Canonical model:

```text
Shared Rules
→ D1 Migration
→ Character Creation Initialization
→ Creation Skill Allocation
→ Character Finalization
```

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
```

Avoid:

```text
copying the same formula into Player, Monster and Boss UI separately
hard-coding tuning coefficients into multiple files
using browser localStorage as authoritative campaign data
mixing design-time Profile data with runtime Instance state
allowing direct Player edits to authoritative resources
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

---

# 9. First Play-Test Milestone

The MVP milestone is reached when the project can perform at least one complete representative encounter using the production-style architecture:

```text
at least one Player Character
at least one ordinary Monster
optionally one simple Boss Instance
initiative
turn progression
D100 hit resolution
damage
HP / MP updates
basic defeat / HP 0 handling
combat completion
```

After this milestone, numeric curves and advanced mechanics should be adjusted using actual observed play rather than paper-only speculation wherever practical.

---

# 10. Current Immediate Blocker

The Character-creation foundation is no longer the immediate blocker.

Current work is **GM D1 Character controls**:

```text
shared User/session authentication
→ gm/admin role gate
→ D1 User / Character roster
→ D1 Character detail
→ GM EXP authority
→ derived Level
→ formula HP / MP Max recalculation
→ GM Current HP / MP correction
```

The legacy browser-local GM Character editor is not authoritative for the MVP.

A secure initial GM/admin provisioning path remains a deployment/administration blocker. The project must not solve this by allowing arbitrary Player self-promotion.

After the GM D1 Character control path is usable, the next major implementation stage is the Round / Combat state engine.
