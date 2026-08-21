# Monster Attack Profile — Alpha

> Status: Canonical Alpha Working Rule  
> Date: 2026-08-21  
> Scope: Defines how Simplified Monsters represent and resolve ordinary attacks without duplicating the full Player progression/skill-management model.
> Use together with `COMBAT_DAMAGE_MODEL_ALPHA.md`, `D100判定核心_ALPHA.md`, `對抗判定與極端結果_ALPHA.md`, `基礎動作與MP資源消耗_ALPHA.md`, `MONSTER_NPC_SYSTEM_ALPHA.md`, and `GM_MONSTER_MANAGEMENT_ALPHA.md`.

---

# 1. Core Decision — Simplified Player Attack Model

Simplified Monsters use a **simplified version of the Player ordinary-attack model**.

This means Monster attacks do not use a completely separate combat engine.

They reuse the same core combat resolution structure as Players:

```text
Ordinary attack declaration
→ D100 attack / opposed resolution
→ if the attack succeeds, resolve Damage Profile
→ apply fixed defence / resistance
→ calculate Damage Result
→ apply HP damage only when Damage Result > 0
```

The Monster model is simplified at the **data/progression layer**, not at the core combat-resolution layer.

---

# 2. Ordinary Monster Attacks Are Not Named Abilities by Default

As with Player ordinary physical actions, a Monster's ordinary bite, claw, sword swing, spear thrust, bow shot, body slam, and similar basic attacks do not need to be created as named Abilities merely to exist.

Examples:

```text
Goblin Short Sword
Goblin Short Bow
Wolf Bite
Ogre Club Swing
Dragon Claw
```

These are ordinary Monster Attack Profiles unless the action contains additional Ability-level mechanics that justify a separate named Ability/Profile.

A special fire breath, curse, spell, multi-target technique, scripted boss mechanic, or other exceptional action may still use the Ability system separately.

---

# 3. Simplification Compared With Player Characters

An Ordinary/Simplified Monster does not need the full Player-facing progression stack merely to perform an ordinary attack.

The Monster attack layer does **not** require, by default:

```text
Player Skill Tree management
Player creation Skill Point allocation
Weapon-practice EXP tracking
Weapon Specialization growth history
Ability learning workflow
Player unlock/request workflow
Player-facing progression UI
```

Instead, the reusable Monster Template stores a compact set of approved Attack Profiles that contain the mechanical values/source references needed to execute the attack.

This avoids creating a fake full Player character sheet for every ordinary enemy while preserving compatibility with the same combat resolver.

---

# 4. Monster Attack Profile Structure

A Monster Template may contain multiple Attack Profiles.

Example:

```text
Goblin Template

Attack 1: Short Sword
Attack 2: Short Bow
```

Each Attack Profile should be able to store or reference at least the following categories:

```text
Attack name
Attack / damage type
D100 hit source / basis
Hit modifier
Damage Profile / damage dice
Fixed damage modifier
Whether the Monster physical Damage Bonus applies
Range / reach where relevant
Targeting information where relevant
Other approved Profile flags
```

The exact formula for the ordinary physical **D100 hit source / basis** is not locked in this document because the corresponding Player ordinary physical Attack Mapping is still an unresolved Alpha item.

When that Player mapping is finalized, the Monster simplified profile should mirror the same principles with the minimum fields required for reliable execution.

---

# 5. Hit and Damage Must Remain Separate

Monster attacks follow the existing Combat Damage Model rule that hit modifiers and damage values are separate concepts.

Example:

```text
Goblin Short Sword

D100 Hit Modifier: +5
Damage Profile: 1D6
Fixed Damage Modifier: +1
```

The `+5` must only affect the D100 attack resolution.

The `1D6 + 1` must only enter damage calculation after a successful attack.

A single vague Monster `Attack Bonus` field must not be silently applied to both hit chance and damage unless an explicit Profile defines two separate effects.

---

# 6. Monster Physical Damage Bonus

Where an Attack Profile permits it, a Simplified Monster may use the same Character-style physical Damage Bonus table, but calculated from **Effective STR + Effective SIZ** rather than Natural Attributes.

Therefore the attack profile may contain:

```text
applies_monster_damage_bonus = true / false
```

When true:

```text
Effective STR + Effective SIZ
→ resolve the existing Character Damage Bonus table
→ roll/apply that Damage Bonus after the D100 attack succeeds
```

This keeps Monster physical output compatible with the Player damage model without requiring a separate Monster-only damage-bonus table.

If a particular natural weapon or attack should not use STR/SIZ Damage Bonus, the Profile sets the flag to false.

---

# 7. Level Interaction

Monster Level does not directly multiply an Attack Profile's damage dice or D100 value unless a later explicit rule says so.

Level already affects:

```text
Natural Attributes
→ Global Level Curve + Template Growth Weights
→ Effective Attributes
```

Any attack component that reads Effective Attributes therefore receives Level influence through that route.

The system must avoid silently applying the same Level-growth curve again to an attack output and causing double scaling.

Attack-specific Level scaling, if ever added, must be explicit and auditable.

---

# 8. Elite Interaction

The normal Elite bonus is applied before Natural Attributes are finalized.

Therefore, where Monster attacks depend on Effective STR, Effective DEX, Effective SIZ, or another Effective Attribute, the Elite upgrade already influences the attack indirectly through the normal Attribute pipeline.

The Elite check does not automatically create a second generic attack multiplier unless a later Elite rule explicitly defines one.

---

# 9. GM Final Adjustment

GM may edit a Monster Template's Attack Profiles and may also perform authorised instance-level attack adjustments for a particular spawned Monster when needed.

Template edit:

```text
changes the reusable Monster definition / future spawns
```

Instance adjustment:

```text
changes only that spawned Monster
```

The system should preserve the distinction between Template Profile values and later instance overrides.

---

# 10. GM Monster Management Requirement

The GM Monster Management tab must provide an Attack Profiles section for each Monster Template.

GM must be able to:

```text
add an Attack Profile
edit an Attack Profile
remove / retire an Attack Profile
reorder attacks for convenience
inspect hit and damage fields separately
mark whether physical Damage Bonus applies
configure range / reach where relevant
link a special action to the Ability system where the attack is not merely ordinary
```

Spawned-instance inspection should show any instance-level attack override separately from the Template source value.

---

# 11. Locked Conclusions

1. Simplified Monsters use a simplified **Player ordinary-attack model**, not a separate generic Monster combat engine.
2. Ordinary Monster attacks normally remain Basic Attacks rather than named Abilities.
3. Monster simplification removes Player progression/learning/Skill-tree administration, not the core D100 + Damage Profile combat resolver.
4. A Monster Template can contain multiple compact Attack Profiles.
5. Hit modifiers and damage values remain separate.
6. Where enabled, physical Damage Bonus uses the existing Character table with `Effective STR + Effective SIZ`.
7. Level/Elite influence attacks through Effective Attributes where applicable; the global Level curve is not automatically applied a second time to attack output.
8. GM can maintain Template attacks and perform authorised instance-level overrides.
9. Exact ordinary physical D100 Attack Mapping remains pending and should align with the Player solution when that system is finalized.

---

# 12. Next Decision

The next Monster attack decision is how the simplified Monster Attack Profile should obtain its ordinary **D100 hit basis** while remaining compatible with the future Player ordinary physical Attack Mapping.
