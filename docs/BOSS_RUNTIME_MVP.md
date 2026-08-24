# Boss Runtime — MVP

> Status: Canonical MVP Implementation Contract  
> Date: 2026-08-25  
> Scope: Minimum Boss Design Profile → Boss Instance runtime required before the first end-to-end Scenario test. Use with `BOSS_DESIGN_PROFILE_ALPHA.md`, the ordinary Monster Canonical documents, and the shared Combat / Damage rules.

---

# 1. Locked Architecture Reused

Bosses use a dedicated GM authoring workflow but do **not** receive a second combat engine.

```text
Boss Design Profile
→ ordinary Monster-style baseline calculation
→ GM Boss-specific final overrides
→ Final Boss Profile
→ Spawn Boss Instance
→ snapshot Final Boss Values
→ Encounter / Combat runtime
```

Profile edits after spawn do not mutate existing Boss Instances.

---

# 2. Minimum Boss Profile Data

The MVP Boss Design Profile stores at minimum:

```text
Identity
- Name
- Summary / GM Notes
- Level
- Active / Archived state

Baseline source
- six Natural Attributes
- six Attribute Growth Weights
- six calculated Effective Attributes
- calculated Max HP / MP
- baseline Stored Defence
- baseline Armor data

GM Final layer
- optional Final Attribute overrides
- Final Max HP / MP overrides
- Final Stored Defence
- Final Armor data

Skill loadout
- Common Monster Skills
- GM-authored Unique Boss Skills

Phase definitions
- ordered Phase number / name
- optional HP-threshold trigger data
- GM notes
```

No universal Boss multiplier is introduced.

---

# 3. Boss Skills

Boss Skill runtime reuses the Monster Skill Profile model.

```text
Boss Skill Loadout
= Common Monster Skills
+ Unique Boss Skills
```

Unique Boss Skills use the same executable fields as Common Monster Skills:

```text
Stored Accuracy
Damage Type
Template Base Damage
Damage Growth Weight
Damage Attribute Links
Range / Targeting
MP Cost
Cooldown metadata
GM Notes
```

They remain Boss-profile-owned content but resolve through the shared Monster Skill mathematics.

---

# 4. Baseline / Override / Final Separation

For Boss-authoritative values the system preserves:

```text
Calculated Baseline
→ GM Override
→ Final Boss Value
```

Example:

```text
Calculated Max HP = 180
GM Override = 420
Final Max HP = 420
```

A missing override means the baseline value becomes the Final value.

Runtime Current HP / MP never write back into the Design Profile.

---

# 5. Defence / Armor

Boss defence uses the already-confirmed Simplified Monster separation unless the GM explicitly overrides the Profile values:

```text
D100 Defence
= Final Stored Defence + runtime Defence Modifier
→ cap Effective D100 Defence at 100 after modifiers

Post-hit Effective Defence
= Final Armor Defence
```

Armor is not added to the D100 opposed check.

---

# 6. Spawn Snapshot

Spawning a Boss Instance copies the current Final Profile values:

```text
Profile identity / revision timestamp
Boss identity
Level
Final Attributes
Final Max HP / MP
Final Stored Defence
Final Armor data
resolved Skill snapshots
Phase definitions
```

The Instance initializes:

```text
Current HP = Final Max HP
Current MP = Final Max MP
Current Phase = first Phase, if one exists
runtime Defence Modifier = 0
runtime Armor adjustment = 0
status = active
```

Existing Instances are immutable with respect to later Profile edits unless the GM performs an explicit Instance correction.

---

# 7. Encounter / Combat Integration

`boss_instance` is the already-reserved Encounter / Combat entity type.

Boss Instance may be assigned to an open Encounter and participates in the same shared Combat state:

```text
Character
+ Monster Instance
+ Boss Instance
→ shared DEX Initiative
→ stable equal-DEX ordering
→ same Round / Turn state
```

Boss combatants are GM-controlled.

---

# 8. Boss Turn / Attack

When the current combatant is a Boss Instance, GM may select:

```text
one active snapshotted Boss Skill
one living Character target
```

The server performs the same Monster-origin attack pipeline:

```text
reserve Boss Action
→ Stored / Modified / Effective Accuracy
→ attack D100
→ Character Dodge D100
→ shared opposed Result comparison
→ Damage Center + Spread
→ shared Damage Result pipeline
→ Character HP / DYING / DEAD integration
→ action audit
```

No Boss AI is implemented.

---

# 9. Phase MVP

The full trigger catalogue remains Deferred, but the MVP stores ordered Phase definitions and runtime current Phase.

Minimum Phase support:

```text
Phase 1
Phase 2
...
```

Optional executable trigger supported in the first build:

```text
HP percentage <= threshold
```

The system may report that a later Phase condition is applicable, but GM retains explicit control:

```text
Force Enter Phase
Hold current Phase
Move to another configured Phase
```

The MVP does not require automatic irreversible Phase transition.

---

# 10. Instance Corrections

GM may explicitly correct Boss Instance runtime values without mutating the Profile:

```text
Current HP / MP
Max HP / MP adjustment
Defence Modifier
Armor adjustment
Current Phase
```

Such corrections remain Instance-local.

---

# 11. Boss HP0 — Remaining Narrow Blocker

`BOSS_DESIGN_PROFILE_ALPHA.md` does not currently define the exact Boss HP0 lifecycle.

Therefore this MVP must not silently assume that Bosses:

```text
use ordinary Monster immediate Defeated
use Player DYING
remain active for a scripted Phase
or use another special final-state rule
```

All non-HP0 Boss runtime work may be implemented now. The Player → Boss final damage / defeat path remains gated by this one explicit decision.

---

# 12. Deferred

```text
advanced Phase trigger catalogue
fully automatic Phase transition
Boss AI
Resistance / Immunity engine
special Boss-only mechanics
advanced cooldown engine
Encounter Difficulty
Loot / reward automation
full tactical Map integration
```

---

# 13. Definition of Implemented for This Slice

The non-blocked Boss Runtime MVP is implemented when the following production-style paths exist:

```text
D1 Boss Profile schema
Boss Profile GM authoring
baseline / final value calculation
Common + Unique Boss Skill loadout
Phase definition storage
Spawn Boss Instance
Profile → Instance snapshot
Encounter boss_instance assignment
Character + Monster + Boss shared Initiative
GM Boss Turn inspection
GM Boss → Character attack
Boss runtime HP / MP inspection
manual Phase control
regression / static contracts
```

The only deliberate gap is the exact Boss HP0 lifecycle required before Player-origin damage can finish a Boss fight.
