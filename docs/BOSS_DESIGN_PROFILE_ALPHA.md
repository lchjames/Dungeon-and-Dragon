# Boss Design Profile — Alpha

> Status: Canonical Alpha Rule  
> Date: 2026-08-23  
> Scope: Defines the dedicated GM-facing Boss design table/interface, shared-Monster baseline calculation flow, Boss-specific GM final-adjustment authority, Boss Design Profile → Boss Instance persistence, and the Boss Phase trigger architecture. Read with `MONSTER_NPC_SYSTEM_ALPHA.md`, `GM_MONSTER_MANAGEMENT_ALPHA.md`, `MONSTER_LEVEL_SCALING_ALPHA.md`, and `MONSTER_ATTACK_PROFILE_ALPHA.md`.

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

The dedicated Boss interface exists because every Boss is expected to receive bespoke GM design work. It does **not** imply a universal Boss multiplier or a second duplicate ruleset.

---

# 2. No Universal Boss Multiplier

Do not lock a global rule such as:

```text
Boss HP = Normal HP × 3
Boss Attributes = Normal Attributes × 1.5
Boss Damage = Normal Damage × 2
Boss Accuracy = Normal Accuracy + 20
```

No single automatic Boss coefficient is Canonical at this stage. Boss difficulty, durability, output, mechanics and encounter role are content-design decisions owned by the GM.

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
Phase definitions / triggers
special Boss-only mechanics
other explicitly authorised Boss fields
```

Design-time defaults for Current HP / MP may be previewed, but runtime Current HP / MP belong to the spawned Boss Instance.

---

# 5. Baseline and Final Values Must Stay Separate

The system must not overwrite calculated baseline values when the GM tunes the Boss.

Preserve separate layers:

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
- Phase definitions / triggers
- Resistance / Immunity placeholders
- special-mechanic placeholders
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

The Boss Design Profile stores the GM-approved final design. A Boss Instance stores the actual state of one spawned appearance of that Boss.

This split is Canonical even for a narratively unique Boss that may only be fought once.

---

# 10. Spawn Snapshot Rule

When the GM spawns a Boss:

```text
Final Boss Profile
→ create Boss Instance
→ snapshot the Profile's current Final Boss Values
```

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
Phase definitions / triggers
Resistance / Immunity definitions once locked
special Boss mechanics once locked
other final design-time combat values
```

Runtime correctness must not depend on silently changing design data.

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

---

# 12. Profile Edits Must Not Mutate Existing Instances

After a Boss Instance has been spawned:

```text
Edit Boss Design Profile
→ affects future Boss spawns / future design use
→ does NOT silently rewrite existing Boss Instances
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

Such an override must not silently mutate the Boss Design Profile.

---

# 14. Boss Phase Architecture — Conditions + GM Override

Boss Phase handling uses a hybrid model:

```text
Phase Definition
→ one or more trigger conditions
→ system evaluates / detects the trigger state
→ Phase transition becomes applicable
→ GM retains explicit manual override authority
```

A Boss Phase may therefore be driven by conditions such as, once the corresponding condition type is implemented:

```text
HP threshold / percentage
round / turn condition
specific event / flag
Skill or mechanic state
other approved encounter condition
```

The exact condition catalogue is intentionally not locked here.

GM must be able to intervene explicitly, including actions conceptually equivalent to:

```text
Force Enter Phase
Delay / hold Phase transition
Skip Phase
Move to another allowed Phase
```

The system must not assume that every Boss transition is only an HP-percentage check.

Likewise, the GM must not be forced to rely only on manual switching when a reusable trigger condition can be represented by the system.

The exact question of whether a satisfied condition auto-transitions immediately, asks for GM confirmation, or uses another presentation pattern remains implementation / Alpha-tuning detail unless later locked explicitly.

---

# 15. Phase Data Ownership

Phase definitions belong to the Boss Design Profile and are snapshotted into the Boss Instance at spawn.

Runtime Phase state belongs to the Boss Instance.

```text
Boss Design Profile
→ Phase definitions / trigger definitions

Boss Instance
→ current Phase
→ trigger progress / runtime flags
→ GM runtime override state
```

Editing Phase definitions on the Boss Design Profile must not silently rewrite an already spawned Boss Instance.

---

# 16. GM Authority and Content-Tuning Philosophy

Boss design is deliberately GM-authoritative.

Canonical responsibility split:

```text
System
→ calculate a reasonable baseline using shared Monster rules
→ expose useful suggested values
→ evaluate representable Phase conditions
→ preserve audit data
→ spawn runtime Instances from Final Boss Profiles

GM
→ decide the actual Boss encounter numbers
→ design unique Skills and mechanics
→ correct any baseline value that does not fit the encounter
→ override / delay / force Phase behaviour when needed
→ optionally perform explicit Instance-specific corrections
```

Exact Boss balance cannot be reliably locked before actual campaign / encounter content is authored and play-tested.

---

# 17. D1 / Persistence Requirements

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
→ Phase definitions / trigger definitions
→ GM special-mechanic data
→ Final Boss values
→ created / updated timestamps

Boss Instance
→ instance identity
→ source Boss Profile ID
→ source Profile revision / updated timestamp where practical
→ snapshotted Final Boss values needed for runtime
→ snapshotted Phase definitions / triggers
→ instance-specific GM overrides
→ Current HP / MP
→ Status / Buff / Debuff state
→ current Phase / Phase trigger progress
→ cooldown / usage state
→ temporary modifiers
→ encounter / combat state
→ created / spawned / updated timestamps
```

Profile and Instance records must remain distinguishable in D1 and in the GM interface.

---

# 18. Delete / Edit Safety

Deleting or editing a Boss Design Profile must not silently corrupt historical or active Boss Instances.

Implementation should preserve instance runtime integrity through immutable snapshots, retained source revisions, or equivalent auditable data.

Destructive cascade semantics must not be assumed without an explicit later decision.

---

# 19. Locked Conclusions

1. Every Boss is designed through a dedicated Boss Design Profile / GM interface.
2. Bosses initially apply the ordinary Monster canonical rules to generate a coherent baseline.
3. The baseline is not the final Boss balance authority.
4. GM performs bespoke Boss-specific manual adjustment / override.
5. No universal Boss HP / Attribute / Damage / Accuracy multiplier is locked.
6. Calculated baseline, GM override and Final Boss values remain separate and auditable.
7. Boss Skills use the same Monster Skill Profile system and may combine Common Monster Skills with GM-authored unique Skills.
8. Boss status does not automatically switch the entity to the Player Skill progression system.
9. Boss persistence uses a locked **Boss Design Profile + Boss Instance** two-layer model.
10. Spawning snapshots the current Final Boss design into the Instance.
11. Editing the Boss Design Profile does not silently mutate existing Boss Instances.
12. Runtime Current HP / MP, Status, Phase, cooldown and other combat state belong to the Boss Instance.
13. Instance-specific GM overrides are explicit, auditable and do not mutate the Boss Design Profile.
14. Boss Phase architecture is **condition-triggered with GM manual override authority**.
15. Phase triggers are not restricted to HP percentage; the concrete trigger catalogue remains extensible.
16. The exact auto-transition / GM-confirmation presentation remains implementation / Alpha tuning unless later locked.
17. Exact Boss numbers and special mechanics remain content-design / play-balance work and are intentionally GM-controlled.

---

# 20. Scope Note

The Boss architecture now contains enough structural rules to support an initial implementation without fully specifying every later Boss mechanic.

Further details such as the complete Phase-trigger catalogue, advanced Resistance / Immunity interactions, AI-controlled Boss behaviour, special critical behaviour, and exact balance coefficients may be added incrementally after a playable version exists, provided the locked Profile / Instance, audit, GM-authority and shared-resolver boundaries above are preserved.
