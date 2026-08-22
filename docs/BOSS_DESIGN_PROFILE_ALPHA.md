# Boss Design Profile — Alpha

> Status: Canonical Alpha Rule  
> Date: 2026-08-23  
> Scope: Defines the dedicated GM-facing Boss design table/interface, shared-Monster baseline calculation flow, Boss-specific GM final-adjustment authority, and the locked Boss Design Profile → Boss Instance persistence model. Read with `MONSTER_NPC_SYSTEM_ALPHA.md`, `GM_MONSTER_MANAGEMENT_ALPHA.md`, `MONSTER_LEVEL_SCALING_ALPHA.md`, and `MONSTER_ATTACK_PROFILE_ALPHA.md`.

---

# 1. Core Principle

Bosses use a **dedicated Boss Design Profile and dedicated GM interface**, but they do not use a separate mathematical combat engine by default.

Canonical design-time architecture:

```text
Boss Design Profile / Boss Design UI
→ apply ordinary Monster canonical baseline rules
→ produce calculated / suggested baseline values
→ GM performs Boss-specific manual adjustment
→ Final Boss Profile
```

Canonical runtime architecture:

```text
Final Boss Profile
→ Spawn Boss Instance
→ snapshot Final Boss design values
→ track runtime combat state on the Instance
```

The dedicated Boss interface exists because every Boss is expected to receive bespoke GM design work.

It does **not** imply a universal Boss multiplier or a second duplicate ruleset.

---

# 2. No Universal Boss Multiplier

Do not lock a global rule such as:

```text
Boss HP = Normal HP × 3
Boss Attributes = Normal Attributes × 1.5
Boss Damage = Normal Damage × 2
Boss Accuracy = Normal Accuracy + 20
```

No single automatic Boss coefficient is Canonical at this stage.

Boss difficulty, durability, output, mechanics and encounter role are content-design decisions owned by the GM.

---

# 3. Baseline Calculation First

When creating a Boss, the system should first calculate a normal Monster-style baseline using the already locked Monster rules where applicable.

Baseline may include:

```text
Monster Level
Natural STR / DEX / CON / POW / INT / SIZ
Effective STR / DEX / CON / POW / INT / SIZ
Calculated Max HP
Calculated Max MP
Common / unique Monster Skill Profiles
Stored Skill Accuracy
Damage Attribute Basis
Calculated Base Damage
Calculated Damage Center
System Suggested Spread Range
other already-Canonical Monster calculations
```

The purpose of this baseline is to give the GM a coherent starting point and make later Boss adjustments auditable.

---

# 4. Boss Final Adjustment Layer

After baseline calculation, the Boss Design Profile provides a dedicated GM adjustment layer.

The GM may manually adjust or override Boss-facing values including, where supported by the underlying subsystem:

```text
Natural / Effective Attribute outcome or final Attribute values
Max HP
Max MP
Skill loadout
Skill Accuracy / explicit Accuracy override
Skill damage inputs / final damage tuning
Final Spread Min / Max
Damage Type
Range / targeting
Status / special effects
Resistance / Immunity once those systems are locked
Phase definitions / triggers once those systems are locked
special Boss-only mechanics
other explicitly authorised Boss fields
```

Design-time defaults for Current HP / MP may be previewed, but runtime Current HP / MP belong to the spawned Boss Instance.

The exact set of editable fields may expand as other Canonical systems are completed.

---

# 5. Baseline and Final Values Must Stay Separate

The system must not overwrite calculated baseline values when the GM tunes the Boss.

Preserve separate layers such as:

```text
Calculated / Suggested Baseline
GM Adjustment / Override
Final Boss Value
```

Example:

```text
Calculated Max HP = 180
GM Boss Override = 420
Final Max HP = 420
```

or:

```text
Suggested Spread = [-4,+12]
GM Override = [-3,+20]
Final Spread = [-3,+20]
```

This separation is required for audit, rebalance and later content iteration.

---

# 6. Dedicated Boss Design Table / Interface

GM tooling should expose a dedicated Boss workspace rather than forcing Boss authoring through the ordinary disposable-Monster form.

Recommended sections:

```text
Boss Identity
- Name
- Level
- Role / encounter notes
- Description / portrait references

Baseline Calculation
- Natural Attributes
- Effective Attributes
- calculated HP / MP
- calculated Skill outputs
- suggested Spread values

Boss Final Values
- final Attributes / authorised overrides
- final Max HP / MP
- final Skill values
- final Spread values
- other final combat values

Skill Loadout
- Add from Common Monster Skill Library
- Create / attach GM-authored unique Boss Skill
- reorder / enable / disable Boss Skills

Special Boss Design
- Phase definitions / placeholders
- Resistance / Immunity placeholders
- Trigger / special-mechanic placeholders
- GM notes

Audit
- baseline vs override vs final values

Runtime
- Spawn Boss Instance
- inspect existing Boss Instances
```

The UI may evolve, but the separation between baseline calculation, GM final adjustment, and runtime Instance state is Canonical.

---

# 7. Boss Skill Loadout

Boss Skill architecture remains the already locked Monster Skill architecture.

A Boss may combine:

```text
Common Monster Skills
+ GM-authored unique Boss Skills
```

A unique Boss Skill is still a Monster Skill Profile unless a future explicit subsystem introduces a specific exception.

The dedicated Boss interface should make this composition easy without creating a parallel Boss-only Skill engine.

---

# 8. Player Skill System Remains Separate

A Boss does not automatically use the Player Skill / Ability progression system merely because it is important or powerful.

Standard Boss flow:

```text
Boss
→ Boss Design Profile
→ Monster Skill Profile system
```

An important NPC may instead intentionally use the Full Character Model. In that case Player-like progression applies because of the chosen NPC model, not because of Boss status.

---

# 9. Locked Profile → Instance Model

Boss persistence uses two explicit layers:

```text
Boss Design Profile
→ reusable / persistent design-time definition

Boss Instance
→ one spawned runtime copy used in an encounter
```

The Boss Design Profile stores the GM-approved final design.

A Boss Instance stores the actual state of one spawned appearance of that Boss.

This split is Canonical even for a narratively unique Boss that may only be fought once.

---

# 10. Spawn Snapshot Rule

When the GM spawns a Boss:

```text
Final Boss Profile
→ create Boss Instance
→ snapshot the Profile's current Final Boss Values
```

The Instance must receive enough resolved design data to run independently during the encounter.

Typical copied / snapshotted data includes:

```text
Boss Profile ID / source revision where available
Boss identity
Level
Final Attributes
Final Max HP / MP
Skill loadout and resolved Skill references / values
Final Spread values
Damage / Accuracy overrides
Phase definitions once locked
Resistance / Immunity definitions once locked
special Boss mechanics once locked
other final design-time combat values
```

The exact storage may use references plus snapshots where safe, but runtime correctness must not depend on silently changing design data.

---

# 11. Boss Instance Runtime State

Boss Instance owns encounter/runtime state such as:

```text
Current HP
Current MP
current Phase / Phase progress
Status effects
Buffs / Debuffs
Cooldowns
usage counters
ongoing effects
turn / initiative state where applicable
temporary combat modifiers
runtime Skill state
other encounter-local state
```

Runtime changes must not write back into the Boss Design Profile.

Example:

```text
Boss Design Profile
Final Max HP = 420

Spawn Boss Instance #1
Current HP = 420

During battle
Current HP = 267
Phase = 2
Burning = active

Boss Design Profile remains:
Final Max HP = 420
```

---

# 12. Profile Edits Must Not Mutate Existing Instances

After a Boss Instance has been spawned:

```text
Edit Boss Design Profile
→ affects future Boss spawns / future design use
→ does NOT silently rewrite existing Boss Instances
```

Example:

```text
Profile originally spawned with Final Max HP = 420
Instance #1 snapshot Max HP = 420

GM later edits Profile Final Max HP = 500

Instance #1 remains based on 420
Future Instance #2 may spawn from 500
```

If the GM intentionally wants to update an existing Instance, that must be a separate explicit GM action and remain auditable.

---

# 13. Instance Overrides

The GM may make encounter-specific corrections to a spawned Boss Instance without altering the reusable Boss Design Profile.

Canonical separation:

```text
Boss Design Profile Final Value
→ Boss Instance Snapshot Value
→ optional Instance-specific GM Override
→ current runtime value / state
```

Example:

```text
Profile Final Max HP = 420
Instance Snapshot Max HP = 420
Encounter-specific GM Override = 460
Instance Max HP = 460
```

Such an override must not silently mutate the Boss Design Profile.

---

# 14. GM Authority and Content-Tuning Philosophy

Boss design is deliberately GM-authoritative.

Canonical responsibility split:

```text
System
→ calculate a reasonable baseline using shared Monster rules
→ expose useful suggested values
→ preserve audit data
→ spawn runtime Instances from Final Boss Profiles

GM
→ decide the actual Boss encounter numbers
→ design unique Skills and mechanics
→ correct any baseline value that does not fit the encounter
→ optionally perform explicit Instance-specific corrections
```

This is intentional because exact Boss balance cannot be reliably locked before actual campaign / encounter content is authored and play-tested.

---

# 15. D1 / Persistence Requirements

Boss persistence must distinguish at least:

```text
Boss Design Profile
→ profile identity
→ Boss Level
→ baseline Natural / Effective Attributes
→ baseline calculated HP / MP
→ baseline / referenced Skill data
→ System Suggested Spread values
→ GM Attribute overrides
→ GM HP / MP overrides
→ GM Skill loadout / unique Skill references
→ GM Skill-value overrides
→ GM Spread overrides
→ GM special-mechanic data
→ Final Boss values
→ created / updated timestamps

Boss Instance
→ instance identity
→ source Boss Profile ID
→ source Profile revision / updated timestamp where practical
→ snapshotted Final Boss values needed for runtime
→ instance-specific GM overrides
→ Current HP / MP
→ Status / Buff / Debuff state
→ Phase state
→ cooldown / usage state
→ temporary modifiers
→ encounter / combat state
→ created / spawned / updated timestamps
```

Profile and Instance records must remain distinguishable in D1 and in the GM interface.

---

# 16. Delete / Edit Safety

Deleting or editing a Boss Design Profile must not silently corrupt historical or active Boss Instances.

Implementation should preserve instance runtime integrity through one of the approved persistence techniques, such as immutable snapshots, retained source revisions, or equivalent auditable data.

A future implementation may define archival / soft-delete behaviour, but destructive cascade semantics must not be assumed without an explicit later decision.

---

# 17. Locked Conclusions

1. Every Boss is designed through a dedicated Boss Design Profile / GM interface.
2. Bosses initially apply the ordinary Monster canonical rules to generate a coherent baseline.
3. The baseline is not the final Boss balance authority.
4. GM then performs bespoke Boss-specific manual adjustment / override.
5. No universal Boss HP / Attribute / Damage / Accuracy multiplier is locked.
6. Calculated baseline, GM override and Final Boss values must remain separate and auditable.
7. Boss Skills use the same Monster Skill Profile system.
8. Boss loadouts may combine Common Monster Skills and GM-authored unique Boss Skills.
9. Boss status does not automatically switch the entity to the Player Skill progression system.
10. Boss persistence uses a locked **Boss Design Profile + Boss Instance** two-layer model.
11. Boss Design Profile stores the reusable GM-approved design; Boss Instance stores one spawned encounter/runtime copy.
12. Spawning snapshots the current Final Boss design into the Instance.
13. Editing the Boss Design Profile does not silently mutate existing Boss Instances.
14. Runtime Current HP / MP, Status, Phase, cooldown and other combat state belong to the Boss Instance.
15. Instance-specific GM overrides are allowed as explicit audited corrections and do not mutate the Boss Design Profile.
16. Exact Boss numbers and special mechanics remain content-design / play-balance work and are intentionally GM-controlled.

---

# 18. Next Unresolved Boss Decision

Boss Profile vs Instance persistence semantics are resolved.

The next Boss-specific design item should move to another independent subsystem, such as Phase / trigger behaviour, while Monster AI critical handling and numeric Spread tuning remain deferred to their already designated future passes.
