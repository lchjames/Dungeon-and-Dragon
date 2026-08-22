# Monster Attack Profile — Alpha

> Status: Canonical Alpha Rule  
> Date: 2026-08-22  
> Scope: Defines how Simplified Monsters represent and resolve ordinary attacks without duplicating the full Player progression/skill-management model.
> Use together with `COMBAT_DAMAGE_MODEL_ALPHA.md`, `D100判定核心_ALPHA.md`, `對抗判定與極端結果_ALPHA.md`, `基礎動作與MP資源消耗_ALPHA.md`, `MONSTER_NPC_SYSTEM_ALPHA.md`, and `GM_MONSTER_MANAGEMENT_ALPHA.md`.

---

# 1. Core Decision — Simplified Player Attack Model

Simplified Monsters use a **simplified version of the Player ordinary-attack model**.

They reuse the same core combat resolution structure as Players:

```text
Ordinary attack declaration
→ D100 attack / opposed resolution
→ if the attack succeeds, resolve Damage Profile
→ apply fixed defence / resistance
→ calculate Damage Result
→ apply HP damage only when Damage Result > 0
```

Monster simplification is at the data/progression layer, not the core combat-resolution layer.

---

# 2. Ordinary Monster Attacks Are Not Named Abilities by Default

A Monster's ordinary bite, claw, sword swing, spear thrust, bow shot, body slam, and similar basic attacks do not need to be created as named Abilities merely to exist.

Examples:

```text
Goblin Short Sword
Goblin Short Bow
Wolf Bite
Ogre Club Swing
Dragon Claw
```

Exceptional actions such as fire breath, curses, spells, scripted boss mechanics, unusual area attacks, and other Ability-level effects may use the Ability system separately.

---

# 3. Simplification Compared With Player Characters

An Ordinary/Simplified Monster does not need the full Player-facing progression stack merely to perform an ordinary attack.

The Monster attack layer does not require, by default:

```text
Player Skill Tree management
Player creation Skill Point allocation
Weapon-practice EXP tracking
Weapon Specialization growth history
Ability learning workflow
Player unlock/request workflow
Player-facing progression UI
```

Instead, the reusable Monster Template stores compact approved Attack Profiles.

---

# 4. Locked D100 Hit Architecture — Effective Attribute + Attack Proficiency

Each ordinary Monster Attack Profile uses two main components for its base D100 hit calculation:

```text
1. Primary Effective Attribute
2. Attack Proficiency
```

Canonical architecture:

```text
D100 Attack Base
= Attribute-Derived Hit Value
+ Attack Proficiency
```

where:

```text
Attribute-Derived Hit Value
→ is derived from the Attack Profile's selected Effective Attribute

Attack Proficiency
→ is a Template/Profile value representing how practiced that Monster type is with that attack
```

The exact numerical conversion from Effective Attribute to `Attribute-Derived Hit Value` remains intentionally unresolved until the Player ordinary physical Attack Mapping is locked. Monster attacks must then use the same underlying principle in simplified form rather than inventing a conflicting conversion.

## 4.1 Primary Effective Attribute

Each Attack Profile explicitly chooses the Effective Attribute that provides its physical/technical basis.

Examples:

```text
Short Sword → Effective DEX
Short Bow → Effective DEX
Heavy Club → Effective STR
Body Slam → Effective STR
```

Other Effective Attributes may be used when a specific approved attack concept requires them, but ordinary physical attacks should normally use the most mechanically relevant physical Attribute.

The selected source must be explicit in the Attack Profile; the resolver must not guess a different Attribute at runtime.

## 4.2 Attack Proficiency

Each Monster Attack Profile stores its own `Attack Proficiency` value.

Example:

```text
Goblin Short Sword
Primary Effective Attribute: DEX
Attack Proficiency: 20

Goblin Short Bow
Primary Effective Attribute: DEX
Attack Proficiency: 12
```

Attack Proficiency is deliberately simpler than Player weapon specialization:

- it is stored directly on the Monster Template/Profile;
- it does not require practice EXP;
- it does not require a specialization growth history;
- it does not independently level up when a spawned Monster acts;
- GM may edit the Template value or apply an authorised instance override.

This lets two attacks from the same Monster use the same Effective DEX while still having different levels of competence.

## 4.3 Level and Elite Interaction With Hit Chance

Because the Attribute component reads an Effective Attribute:

```text
Natural Attribute
→ Elite Bonus, if any
→ Level Scaling
→ Effective Attribute
→ Attribute-Derived Hit Value
→ + Attack Proficiency
```

Monster Level and Elite status can naturally improve attack accuracy without requiring a second generic Level multiplier on the D100 result.

The global Monster Level curve must not be applied again after the Effective Attribute has already incorporated it.

---

# 5. Monster Attack Profile Structure

A Monster Template may contain multiple Attack Profiles.

Each Attack Profile must be able to store or reference at least:

```text
Attack name
Attack / damage type
Primary Effective Attribute
Attack Proficiency
Additional Hit Modifier
Damage Profile / damage dice
Fixed Damage Modifier
Whether Monster physical Damage Bonus applies
Range / reach where relevant
Targeting information where relevant
Other approved Profile flags
```

The three hit-related concepts must remain distinct:

```text
Primary Effective Attribute
→ character/monster capability source

Attack Proficiency
→ reusable competence with that specific attack

Additional Hit Modifier
→ situational/equipment/Profile adjustment separate from base competence
```

---

# 6. Hit and Damage Must Remain Separate

Hit modifiers and damage values are separate concepts.

Example:

```text
Goblin Short Sword
Primary Effective Attribute: DEX
Attack Proficiency: 20
Additional Hit Modifier: +5
Damage Profile: 1D6
Fixed Damage Modifier: +1
```

The Attribute/Proficiency/Hit Modifier combination only affects D100 attack resolution.

The `1D6 + 1` only enters damage calculation after a successful attack.

A vague `Attack Bonus` field must not be silently applied to both hit chance and damage.

---

# 7. Monster Physical Damage Bonus

Where an Attack Profile permits it, a Simplified Monster uses the existing Character physical Damage Bonus table with:

```text
Effective STR + Effective SIZ
```

The Attack Profile stores:

```text
applies_monster_damage_bonus = true / false
```

When true, the existing Character Damage Bonus table is resolved after the D100 attack succeeds.

If a particular natural weapon or attack should not use STR/SIZ Damage Bonus, the Profile sets the flag to false.

---

# 8. GM Final Adjustment

GM may edit Monster Template Attack Profiles and may perform authorised instance-level attack adjustments.

Template edit:

```text
changes reusable definition / future spawns
```

Instance override:

```text
changes only that spawned Monster
```

The system preserves the distinction between Template values, calculated Attribute-derived values, and instance overrides.

---

# 9. GM Monster Management Requirement

The GM Monster Management tab must provide an Attack Profiles section for each Monster Template.

GM must be able to:

```text
add / edit / retire / reorder Attack Profiles
select Primary Effective Attribute
edit Attack Proficiency
edit Additional Hit Modifier separately
edit Damage Profile / damage dice
edit Fixed Damage Modifier
set whether Effective STR + Effective SIZ Damage Bonus applies
edit range / reach / targeting fields
link exceptional actions to the Ability system
```

Spawned-instance inspection should show:

```text
Primary Effective Attribute
current Effective Attribute value
Attribute-Derived Hit Value
Template Attack Proficiency
Additional Hit Modifier
instance override, if any
final D100 attack basis
```

Once the Player Attribute→D100 physical Attack Mapping is locked, the GM UI should display the resolved formula rather than hiding it.

---

# 10. Locked Conclusions

1. Simplified Monsters use a simplified Player ordinary-attack model.
2. Ordinary Monster attacks normally remain Basic Attacks rather than named Abilities.
3. Each Attack Profile selects a Primary Effective Attribute.
4. Each Attack Profile stores its own Attack Proficiency.
5. D100 architecture is `Attribute-Derived Hit Value + Attack Proficiency`, plus any separately stored Hit Modifier.
6. Monster Attack Proficiency does not use Player practice EXP or specialization-growth history.
7. Level/Elite improve accuracy through Effective Attributes; no second global Level multiplier is added.
8. Hit and damage remain separate.
9. Physical Damage Bonus, where enabled, uses `Effective STR + Effective SIZ` and the existing Character table.
10. GM can maintain Template values and authorised instance overrides.
11. The exact Effective Attribute → D100 hit-value conversion remains tied to the unresolved Player ordinary physical Attack Mapping and must not be independently invented here.

---

# 11. Next Decision

The next decision is the exact **Effective Attribute → D100 Attribute-Derived Hit Value** conversion used by the shared Player/Monster ordinary physical attack framework.
