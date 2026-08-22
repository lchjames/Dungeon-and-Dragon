# Boss Design Profile — Alpha

> Status: Canonical Alpha Rule  
> Date: 2026-08-23  
> Scope: Defines the dedicated GM-facing Boss design table/interface, baseline calculation flow, and Boss-specific GM final-adjustment authority. Read with `MONSTER_NPC_SYSTEM_ALPHA.md`, `GM_MONSTER_MANAGEMENT_ALPHA.md`, `MONSTER_LEVEL_SCALING_ALPHA.md`, and `MONSTER_ATTACK_PROFILE_ALPHA.md`.

---

# 1. Core Principle

Bosses use a **dedicated Boss Design Profile and dedicated GM interface**, but they do not use a separate mathematical combat engine by default.

Canonical architecture:

```text
Boss Design Profile / Boss Design UI
→ apply ordinary Monster canonical baseline rules
→ produce calculated / suggested baseline values
→ GM performs Boss-specific manual adjustment
→ Final Boss Profile
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
Max / Current HP
Max / Current MP
Skill loadout
Skill Accuracy / explicit Accuracy override
Skill damage inputs / final damage tuning
Final Spread Min / Max
Damage Type
Range / targeting
Status / special effects
Resistance / Immunity once those systems are locked
Phase behaviour / triggers once those systems are locked
special Boss-only mechanics
other explicitly authorised Boss fields
```

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
- final HP / MP
- final Skill values
- final Spread values
- other final combat values

Skill Loadout
- Add from Common Monster Skill Library
- Create / attach GM-authored unique Boss Skill
- reorder / enable / disable Boss Skills

Special Boss Design
- Phase placeholders
- Resistance / Immunity placeholders
- Trigger / special-mechanic placeholders
- GM notes

Audit
- baseline vs override vs final values
```

The UI may evolve, but the separation between baseline calculation and GM final adjustment is Canonical.

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

# 9. GM Authority and Content-Tuning Philosophy

Boss design is deliberately GM-authoritative.

Canonical responsibility split:

```text
System
→ calculate a reasonable baseline using shared Monster rules
→ expose useful suggested values
→ preserve audit data

GM
→ decide the actual Boss encounter numbers
→ design unique Skills and mechanics
→ correct any baseline value that does not fit the encounter
```

This is intentional because exact Boss balance cannot be reliably locked before actual campaign / encounter content is authored and play-tested.

---

# 10. D1 / Persistence Requirements

Boss persistence should distinguish at least:

```text
Boss Profile identity
Monster Level
baseline Natural / Effective Attributes
baseline calculated HP / MP
baseline / referenced Skill data
System Suggested Spread values

GM Attribute overrides
GM HP / MP overrides
GM Skill loadout / unique Skill references
GM Skill-value overrides
GM Spread overrides
GM special-mechanic data

Final Boss values
created / updated timestamps
```

Where practical, reusable Boss Profiles and spawned Boss Instances should remain distinguishable so runtime state does not silently rewrite design-time data.

---

# 11. Locked Conclusions

1. Every Boss is designed through a dedicated Boss Design Profile / GM interface.
2. Bosses initially apply the ordinary Monster canonical rules to generate a coherent baseline.
3. The baseline is not the final Boss balance authority.
4. GM then performs bespoke Boss-specific manual adjustment / override.
5. No universal Boss HP / Attribute / Damage / Accuracy multiplier is locked.
6. Calculated baseline, GM override and Final Boss values must remain separate and auditable.
7. Boss Skills use the same Monster Skill Profile system.
8. Boss loadouts may combine Common Monster Skills and GM-authored unique Boss Skills.
9. Boss status does not automatically switch the entity to the Player Skill progression system.
10. Exact Boss numbers and special mechanics are content-design / play-balance work and are intentionally GM-controlled.

---

# 12. Locked Boss Phase Architecture — Condition Triggers + GM Override

Boss Phase progression uses a hybrid architecture:

```text
Phase Definition
→ one or more trigger conditions
→ system evaluates / detects trigger state
→ Phase transition becomes applicable
→ GM retains explicit manual override authority
```

A Phase condition may later use implemented trigger types such as:

```text
HP threshold / percentage
round / turn condition
specific encounter event / flag
Skill / mechanic state
other approved condition
```

The complete trigger catalogue is intentionally **not** locked yet.

GM must be able to perform explicit Phase control conceptually equivalent to:

```text
Force Enter Phase
Delay / hold Phase transition
Skip Phase
Move to another allowed Phase
```

Therefore Boss Phase is neither restricted to HP-only automation nor restricted to manual-only switching.

The exact UI/runtime behaviour when a condition becomes true — for example immediate automatic transition versus GM confirmation — remains an implementation / Alpha-tuning detail unless explicitly locked later.

Phase definitions belong to the Boss Design Profile and are snapshotted into the Boss Instance. Runtime current Phase, trigger progress and manual override state belong to the Boss Instance.

---

# 13. Scope Boundary for Initial Playable Implementation

The Boss architecture is now structurally sufficient for an initial playable implementation without resolving every advanced Boss detail first.

The following may remain incremental / later tuning unless they block the playable core:

```text
complete Phase-trigger catalogue
exact Phase transition UI behaviour
advanced Resistance / Immunity interactions
Monster/Boss AI Skill selection
Monster-specific critical follow-up
exact Spread tuning coefficients
advanced Boss-only special mechanics
```

Future additions must preserve the locked shared Monster baseline, GM-authoritative Boss adjustment, Profile/Instance separation, auditability, and Phase condition + GM override architecture.
