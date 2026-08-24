# Monster Defence + Armor — MVP

> Status: Canonical MVP Rule  
> Date: 2026-08-25  
> Scope: Defines the authoritative Simplified Monster defence source for opposed D100 checks and the Armor data used by the post-hit Damage Result pipeline.

---

# 1. Locked Separation

Monster defence has two separate layers and they must not be conflated:

```text
Layer 1 — D100 Defence
→ decides whether the Player attack breaks through
→ uses Dedicated Stored Defence

Layer 2 — Post-hit Effective Defence
→ reduces Raw Damage after a successful hit
→ uses Monster Armor / fixed defence data
```

Armor does not replace the D100 defence source.

---

# 2. Dedicated Stored Defence

Every Simplified Monster Template stores:

```text
Stored Defence
```

Canonical behavior:

```text
Stored Defence
→ design-time Template value
→ may exceed 100
→ does not automatically scale with Monster Level
→ snapshots into a spawned Monster Instance
```

Runtime:

```text
Modified Defence
= Stored Defence + explicit Defence Modifier

Effective D100 Defence
= min(100, Modified Defence)
```

Values above 100 remain meaningful because penalties are applied before the effective cap.

Example:

```text
Stored Defence = 125
Penalty = -20
Modified Defence = 105
Effective D100 Defence = 100

Stored Defence = 125
Penalty = -40
Modified Defence = 85
Effective D100 Defence = 85
```

Do not derive ordinary Monster D100 Defence from Effective DEX.

---

# 3. Player Attack vs Monster Defence

The existing shared high-roll D100 resolver remains authoritative.

```text
Player Attack Result
vs
Monster Defence Result
```

Player side:

```text
GM-approved Player Attack Profile Stored Accuracy
+ explicit attack modifiers
```

Monster side:

```text
Effective D100 Defence
```

Resolution:

```text
Attack Result > Monster Defence Result
→ hit

Attack Result <= Monster Defence Result
→ defended / miss
```

Tie remains defender-favoured.

Raw 1 / 100 continue to carry the global Great Failure / Great Success metadata rules; this document does not create a second critical system.

---

# 4. Monster Armor Data

Every Simplified Monster Template also stores the minimum Armor source required by the shared Damage pipeline:

```text
Armor Name
Armor Defence
Armor Notes
```

`Armor Defence` is a fixed post-hit defence contribution.

Spawned Monster Instance snapshots the Template Armor data so later Template edits do not silently mutate an existing combatant.

The Instance keeps an explicit audit chain:

```text
Template Armor Defence snapshot
→ Instance Armor Defence Adjustment
→ Final Armor Defence
```

Canonical MVP:

```text
Final Armor Defence
= Template Armor Defence snapshot
+ Instance Armor Defence Adjustment
```

The GM may make an authorised Instance-level correction / adjustment.

---

# 5. Post-hit Damage Pipeline

After the Player attack wins the opposed D100 check, do not roll another defence D100.

Use the existing shared Damage Result model:

```text
Raw Damage
= damage dice
+ fixed damage modifier
+ applicable Character Damage Bonus
+ other explicit damage sources

Effective Defence
= fixed base defence
+ armour defence
+ defence Buff
+ resistance
+ other fixed defence modifiers

Damage Result
= Raw Damage - Effective Defence
```

For the first executable Simplified Monster MVP:

```text
Fixed Base Defence = 0
Armour Defence = Final Armor Defence
Buff / Resistance / other sources = 0 unless separately implemented

Therefore:
Effective Defence = Final Armor Defence
```

This is an MVP source boundary, not a permanent claim that Armor is the only possible defence source.

---

# 6. Damage Result / HP

The existing global rule remains unchanged:

```text
Damage Result > 0
→ HP Damage = Damage Result

Damage Result <= 0
→ HP Damage = 0
```

Armor can therefore fully absorb a hit even when the Player wins the D100 attack check.

Example:

```text
Attack Result beats Monster Defence Result
→ Hit

Raw Damage = 9
Monster Final Armor Defence = 12
Damage Result = -3
→ Monster HP unchanged
```

When HP Damage is positive, ordinary Monster HP follows `MONSTER_DEFEAT_MVP.md`:

```text
Current HP = max(0, Current HP - HP Damage)

Current HP > 0
→ status = active

Current HP = 0
→ status = defeated immediately
```

Ordinary Simplified Monsters do not enter the Player DYING countdown.

---

# 7. Profile vs Instance Ownership

Design-time:

```text
Monster Template
- Stored Defence
- Armor Name
- Armor Defence
- Armor Notes
```

Runtime snapshot:

```text
Monster Instance
- Stored Defence snapshot
- Defence Modifier
- Armor Name snapshot
- Armor Base Defence snapshot
- Armor Defence Adjustment
- Final Armor Defence
```

Template edits after spawn do not rewrite existing Monster Instances.

---

# 8. D1 / Server Authority

Player requests may submit only the selected Player Attack Profile and target Combatant.

The Player must not submit:

```text
Monster Stored Defence
Monster Defence Modifier
Monster Armor Defence
Monster HP damage
Damage Result
Monster status
```

The server reloads all authoritative Monster defence / Armor / HP values from D1 and resolves the action.

---

# 9. GM Authoring Requirement

GM Monster authoring must expose at minimum:

```text
Template Stored Defence
Template Armor Name
Template Armor Defence
Template Armor Notes
```

Spawned Instance inspection must expose:

```text
Stored Defence snapshot
Defence Modifier
Effective D100 Defence
Armor Name snapshot
Armor Base Defence
Armor Defence Adjustment
Final Armor Defence
```

This preserves explainability between Template values, Instance adjustments and the final runtime numbers.

---

# 10. Explicit Non-Rules

Do not silently introduce:

```text
Effective DEX = Monster Defence
Armor Defence added to the D100 check
Monster Level auto-scaling Stored Defence
Monster Level auto-scaling Armor Defence
random Armor values during spawn
ordinary Monster Player-style DYING rounds
negative Monster HP
```

Any of those would require a separate confirmed rule.

---

# 11. Locked HP0 Integration

The former HP0 blocker is resolved by `MONSTER_DEFEAT_MVP.md`.

The complete executable Player → ordinary Monster path is therefore:

```text
Player Attack Profile
→ Monster Dedicated Stored Defence opposed D100
→ successful hit
→ Player Raw Damage
→ Monster Final Armor Defence
→ Damage Result
→ HP Damage if Damage Result > 0
→ HP clamp at 0
→ HP 0 = immediate defeated
```

`defeated` removes the ordinary Monster from normal hostile targeting and ordinary actions, while Combat / Encounter completion remains GM-controlled.
