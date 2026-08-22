# Monster Skill Profile — Alpha

> Status: Canonical Alpha Override  
> Date: 2026-08-22  
> Scope: Defines Simplified Monster dedicated Skills, including reusable Common Monster Skills, Boss-specific GM-authored Skills using the same Monster Skill Profile schema, independent per-Skill Accuracy, fixed Accuracy across Monster Levels, D100 extreme-result handling, Attribute-linked damage, Level-generated signed Spread Ranges, and deferred Monster-specific critical follow-up pending AI design.

---

# 1. Core Monster Skill Profile

A Simplified Monster Skill may define:

```text
Skill Name
Stored Accuracy
Damage Type
Template Base Damage
Damage Growth Weight
Damage Attribute Links
Range / Reach
Targeting
Status / special effects
MP cost
Cooldown
Usage restrictions
Other approved Skill flags
```

Accuracy and damage remain separate properties.

The same Monster Skill Profile schema is used for:

```text
ordinary Monster Skills
reusable Common Monster Skills
Elite Skills
Boss basic / common Skills
GM-authored Boss unique Skills
```

Boss Skills do **not** require a separate Boss-only Skill engine or incompatible data model.

---

# 2. Common Monster Skill Library

The project may maintain a reusable **Common Monster Skill Library** containing Monster Skill Profiles suitable for repeated use across multiple Monster Templates.

Examples may include ordinary attacks or broadly reusable actions such as:

```text
Bite
Claw
Charge
Tail Swipe
Simple Projectile
Basic Elemental Bolt
```

A Monster or Boss may reference one or more approved Common Monster Skills as part of its loadout.

The Common Monster Skill Library is a reusable authoring / content source. It does not replace the Monster Skill Profile schema; each library entry is itself a Monster Skill Profile.

---

# 3. Boss Skill Loadout — Common + Unique

Boss skill authoring uses the same Monster Skill Profile architecture as the rest of the Monster system.

A Boss may combine:

```text
Common Monster Skills
+ GM-authored Boss unique Skills
```

Typical structure:

```text
Boss
├─ Common / basic Skills
│  ├─ reusable claw / bite / weapon strike
│  └─ other Common Monster Skill Library entries
│
└─ Unique Boss Skills
   ├─ signature attack
   ├─ special control / phase action
   ├─ unusual area attack
   └─ other GM-designed mechanics
```

The GM may use a Common Monster Skill directly as a Boss basic attack, or use an existing Common Skill as an authoring reference / starting point for a distinct Boss-specific Skill.

A Boss-specific Skill is still resolved by the Monster Skill resolver unless a later explicitly approved subsystem says otherwise.

Do **not** create a second Boss-only Skill calculation framework merely because the Skill is unique.

---

# 4. Separation from Player Skill System

Player Characters retain their own Skill / Ability / progression systems.

A standard Monster or Boss using the Simplified / Monster Profile model does **not** automatically inherit:

```text
Player Creation Skill Points
Player basic-skill progression
Player weapon-specialisation progression
Player Ability learning progression
Player Skill natural cap rules
```

Boss uniqueness comes from GM-authored Monster Skill Profiles and Boss content design, not from silently converting the Boss into a Player Character ruleset.

Exception:

```text
important / persistent NPC intentionally uses Full Character Model
```

Such an NPC may use Player-like systems because of its chosen NPC model, not because all Bosses do so.

---

# 5. Independent Skill Accuracy — Fixed Across Level

```text
Monster Skill Accuracy
= independent value stored on that Skill Profile
```

Stored Accuracy may exceed `100` and is not subject to the Player natural Skill-value cap of `98`.

Canonical Level rule:

```text
Monster Level changes
→ do not automatically change Stored Accuracy
→ do not recalculate Stored Accuracy
```

Example:

```text
Skill Stored Accuracy = 80
Lv1   → 80
Lv50  → 80
Lv100 → 80
```

Stored Accuracy changes only through an explicit authorised source such as Profile edit, GM override, Buff / Debuff, Status, Skill property / special effect, or another explicit Accuracy modifier.

Runtime:

```text
Modified Accuracy
= Stored Skill Accuracy + Total Hit Modifier

Effective Accuracy
= min(100, Modified Accuracy)
```

Accuracy above 100 acts as reserve against later negative Accuracy modifiers.

Accuracy is not automatically calculated from STR / DEX / CON / POW / INT / SIZ, Natural Attributes, Effective Attributes, Attack Proficiency, Player weapon specialization, Player Skill Point progression, or Monster Level.

---

# 6. Locked D100 Extreme Results

Monster Skills preserve the shared D100 extreme faces:

```text
raw D100 = 1   → Great Failure
raw D100 = 100 → Great Success
```

These raw extremes take precedence over the ordinary threshold.

Even when:

```text
Effective Accuracy = 100
```

resolution remains:

```text
raw 1     → Great Failure
raw 2–99  → ordinary success
raw 100   → Great Success
```

---

# 7. Monster Critical Follow-Up — Deferred to AI Design

Monster Great Success / Great Failure should remain broadly aligned with the Player-side D100 critical framework rather than receiving a separate hard-coded Monster-only damage law now.

The following are **not** currently Canonical automatic Monster rules:

```text
Great Success → force Spread Roll to maximum
Great Success → fixed damage multiplier
Great Success → automatic defence bypass
Great Success → automatic extra Status
Great Failure → automatic self-damage
Great Failure → forced reroll / fixed penalty
```

If an already-Canonical shared Player/D100 rule applies generically, the Monster resolver may use that shared rule. However, no additional Monster-specific post-extreme behaviour is locked at this stage.

This item is intentionally deferred until Monster Combat AI / behavioural AI is designed, so the project can decide together:

```text
AI Skill selection
AI reaction to Great Success / Great Failure
Monster-specific critical effects
Profile-specific critical behaviour
whether any Skill may override the generic Player-like handling
```

Until that future decision, implementation must preserve the Great Success / Great Failure state without inventing a universal Monster critical-damage rule.

---

# 8. Damage Attribute Links

Each damaging Monster Skill may select zero, one or multiple Attribute links from:

```text
STR
DEX
CON
POW
INT
SIZ
```

Use current **Effective Attributes**.

For one selected Attribute:

```text
Damage Attribute Basis
= selected Effective Attribute
```

For multiple selected Attributes:

```text
Damage Attribute Basis
= sum(selected Effective Attributes)
  / number of selected Attributes
```

The selected Attribute identifiers and current Effective values must be preserved for audit/debugging.

Damage Attribute Basis affects damage only and does not alter Skill Accuracy by default.

---

# 9. Locked Base-Damage Level Curve

```text
MonsterDamageGrowth(Level)
= 7 × ((Level - 1) / 99)^1.5
```

Per damaging Skill:

```text
Calculated Base Damage
= round(
    Template Base Damage
    × [1 + MonsterDamageGrowth(Level) × Damage Growth Weight]
  )
```

With `Damage Growth Weight = 1.0`, Lv1 is 1× and Lv100 is 8× Template Base Damage.

---

# 10. Locked Damage Center — Base Damage + Attribute Basis

For an Attribute-linked damaging Skill:

```text
Calculated Damage Center
= Calculated Base Damage + Damage Attribute Basis
```

If no Damage Attribute Links are selected:

```text
Damage Attribute Basis = 0
Calculated Damage Center = Calculated Base Damage
```

---

# 11. Signed Damage Spread Range

Spread is one signed inclusive interval:

```text
[Final Spread Min, Final Spread Max]
```

Examples of possible output shapes:

```text
[-2, +2]
[-5, +15]
[0, +8]
[-6, -1]
```

Canonical validation:

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

Equivalent display:

```text
Calculated Minimum Raw Damage
= max(0, Calculated Damage Center + Final Spread Min)

Calculated Maximum Raw Damage
= max(0, Calculated Damage Center + Final Spread Max)
```

Spread randomisation is not a second D100 action check.

---

# 12. Level-Linked Spread Generation — Canonical Architecture

The system first generates an approximate/suggested signed range from Monster Level:

```text
Monster Level
→ Spread Generation Rule / Tuning Table
→ System Suggested Spread Min / Max
```

Then GM may correct the generated result:

```text
System Suggested Spread Range
→ GM boundary adjustment / override
→ Final Spread Range
```

The generated range is a starting point, not final balance authority.

The exact Level-to-Spread numbers / curve remain **Alpha Tuning** and are intentionally deferred until real Monster, encounter and campaign content is being created and play-tested.

Implementation should keep Spread generation data-driven and easy to rebalance.

Conceptual direction only:

```text
low Level  → roughly symmetric, e.g. about [-2,+2]
high Level → more positive-skewed, e.g. about [-5,+15]
```

These are not locked values.

---

# 13. User-Confirmed Damage Shape

Conceptual low-roll examples:

```text
Lv1: 64 + 15 - 2 = 77
Lv2: 64 + 18 - 3 = 79
```

Read as:

```text
Calculated Base Damage
+ Damage Attribute Basis
+ signed Spread Roll
```

---

# 14. Superseded Damage-Band Terms

The following standard Simplified Monster fields / concepts are superseded:

```text
Template Lower Spread
Template Upper Spread
Final Lower Spread
Final Upper Spread
Lower Attribute Ratio
Upper Attribute Ratio
Lower Variance Growth Weight
Upper Variance Growth Weight
Attribute-derived Lower Contribution
Attribute-derived Upper Contribution
```

Use instead:

```text
System Suggested Spread Min / Max
GM Spread boundary adjustment / override
Final Spread Min / Max
Spread Roll
```

---

# 15. Runtime Skill Resolution

```text
Declare Monster Skill
→ read fixed Stored Accuracy
→ apply active Hit Modifiers
→ calculate Modified Accuracy
→ cap Effective Accuracy at 100
→ roll D100
→ raw 1: Great Failure state
→ raw 100: Great Success state
→ otherwise resolve ordinary hit / opposed threshold
→ apply only already-Canonical shared critical handling, if any
→ do not invent Monster-specific critical damage behaviour
→ miss: no normal hit damage
→ hit: calculate / read Damage Center
→ read Final Spread Range
→ roll one signed integer Spread Roll
→ Raw Damage = max(0, Damage Center + Spread Roll)
→ Defence / Resistance
→ Damage Result
→ HP loss only when Damage Result > 0
→ resolve approved secondary effects
```

Monster Level is not an Accuracy step in this resolver.

The runtime resolver does not care whether the Skill came from:

```text
Common Monster Skill Library
ordinary Monster Template
Elite loadout
Boss basic loadout
Boss unique GM-authored Skill
```

All use the same approved Monster Skill Profile resolution path unless a later explicitly approved exception exists.

---

# 16. GM / Audit Requirements

For each spawned Skill, preserve at least:

```text
Skill source / origin reference where available
Template Stored Accuracy
Current Stored Accuracy / authorised override
Current Hit Modifiers
Modified Accuracy
Effective Accuracy after 100 cap
raw D100
Great Failure / Great Success state

Damage Attribute Links
selected Effective Attribute values
Damage Attribute Basis

Template Base Damage
MonsterDamageGrowth(Level)
Damage Growth Weight
Calculated Base Damage
Calculated Damage Center

Monster Level used for Spread generation
System Suggested Spread Min / Max
GM Spread boundary adjustment / override
Final Spread Min / Max
Spread Roll when resolved
Calculated Minimum / Maximum Raw Damage
Final Raw Damage
```

Changing Monster Level must not silently mutate Stored Accuracy.

Great Success / Great Failure state must remain auditable even while Monster-specific follow-up behaviour is deferred.

Where practical, the system should preserve whether a Skill originated from a reusable Common Monster Skill or was authored specifically for that Boss / Template.

---

# 17. GM UI Requirements

Accuracy is a Profile value, not a Level-derived field:

```text
Stored Accuracy: 80
Automatic Level Accuracy Growth: OFF / N/A
```

Spread controls should show:

```text
Monster Level
Suggested Spread
GM Min / Max adjustment or override
Final Spread
```

Boss authoring should support a single Skill loadout containing both:

```text
Add from Common Monster Skill Library
Create New Unique Monster Skill
```

Both routes must produce / reference the same Monster Skill Profile schema.

Do not expose a universal `Critical Damage Multiplier` or `Great Success = Max Spread` control as if it were Canonical before the future AI/critical design pass.

---

# 18. Locked Conclusions

1. Simplified Monster offensive actions use dedicated Monster Skill Profiles.
2. The project may maintain a reusable Common Monster Skill Library; every library entry is a normal Monster Skill Profile.
3. Bosses do not use a separate Boss-only Skill engine.
4. A Boss may mix Common Monster Skills for basic / ordinary actions with GM-authored unique Boss Skills.
5. GM-authored Boss unique Skills use the same Monster Skill Profile schema and resolver as other Monster Skills.
6. Player Skill / Ability progression remains separate from standard Monster/Boss Skill authoring.
7. A Full Character NPC may use Player-like systems because of its NPC model, not merely because it is a Boss.
8. Stored Accuracy is independent, may exceed 100, and does not automatically scale with Monster Level.
9. Only Effective Accuracy used for the ordinary threshold is capped at 100 after modifiers.
10. Raw D100 `1` is Great Failure and raw D100 `100` is Great Success.
11. Monster-specific Great Success / Great Failure follow-up is not locked yet; broadly Player-like shared handling applies where already Canonical.
12. No automatic `Great Success = maximum Spread` rule exists.
13. Monster-specific critical follow-up is deferred to future Monster Combat AI / behavioural AI design.
14. Skill damage may link to zero, one or multiple STR / DEX / CON / POW / INT / SIZ Effective Attributes; multiple links use arithmetic mean.
15. Skill Base Damage retains the locked Monster damage Level curve.
16. Attribute-linked Damage Center is `Calculated Base Damage + Damage Attribute Basis`.
17. Spread is one signed interval generated approximately from Monster Level, then corrected by GM.
18. Spread Roll is a signed random integer and Raw Damage is `max(0, Damage Center + Spread Roll)`.
19. Exact Level-to-Spread tuning remains deferred to content creation / play balance.
20. Implementation should preserve calculated, GM-adjusted, source/origin and runtime values for audit.

---

# 19. Deferred / Next Work

The following remain intentionally deferred:

```text
Monster Great Success / Great Failure post-resolution behaviour
Monster AI Skill selection / decision logic
AI interaction with Skill-specific critical effects
exact Level-to-Spread tuning
Boss stat / resource / phase / generation modifiers beyond Skill loadout composition
```

Boss Skill authoring architecture itself is resolved:

```text
Common Monster Skills + GM-authored unique Monster Skills
→ same Monster Skill Profile system
```
