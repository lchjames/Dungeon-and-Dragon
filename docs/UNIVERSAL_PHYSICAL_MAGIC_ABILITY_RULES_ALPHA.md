# Universal Physical & Magic Ability Rules — Alpha

> Status: Canonical Alpha override for custom Ability scaling across physical and magical combat.
> Purpose: unify physical Techniques and elemental Magic under one AI-assisted balancing model while preserving different sources/references.
> This document supersedes any conflicting custom-ability wording in earlier Alpha combat/magic documents until they are consolidated.

---

# 1. One Universal Ability Model

Physical Techniques and Magic Spells use the same structural balancing workflow.

```text
Ability Concept
      ↓
Relevant Skill + Source/Family Context
      ↓
Rank / Reference Budget
      ↓
AI allocates total budget
      ↓
Deterministic validation
      ↓
Player confirmation
      ↓
GM approval
```

The difference is primarily the reference context:

```text
Physical Ability
Element = NONE
Reference = Relevant Skill + Weapon/Item/Unarmed Damage Profile

Magic Ability
Element = LIGHT | DARK | FIRE | WATER | WIND | EARTH | LIGHTNING | WOOD
Reference = Element + Magic Rank + Reference Spell/Ability
```

Do not create a separate balancing engine for physical combat.

---

# 2. Universal Check Equation

All Skill-based checks continue to use one equation:

```text
Final Check = Skill Value + Source Bonus + Buff/Debuff Modifier
```

Examples:

```text
Swordsmanship 48
Steel Sword Source Bonus +2
Battle Focus Buff +5
Final Check = 55
```

```text
Fire Magic 52
Firestorm Source Bonus -3
Focus Buff +4
Final Check = 53
```

The same equation applies to swords, knives, staffs, improvised Items, unarmed Techniques and elemental Magic.

---

# 3. Physical Ability Element

Normal physical Techniques use:

```text
Element = NONE
```

`NONE` means the Ability has no inherent elemental affinity.

The attack may still carry a physical Damage Type from its source, for example:

```text
SLASH
PIERCE
BLUNT
IMPACT
```

Element and Damage Type are separate concepts.

Example:

```text
Crescent Sword Slash
Element: NONE
Damage Type: SLASH
Relevant Skill: Swordsmanship
Source: Equipped Sword
```

---

# 4. Physical Reference Source

A physical Technique does not invent its damage from the Ability name alone.

The main reference is:

```text
Relevant Physical Skill
+
Current Attack Source / Damage Profile
+
Comparable approved physical Techniques
```

Examples:

```text
Sword Technique
→ Swordsmanship + equipped Sword Damage Profile

Staff Technique
→ Staff/Club Skill + Staff Damage Profile

Knife Technique
→ Knife/Sword Skill + Knife Damage Profile

Improvised Technique
→ relevant Skill + improvised Item Damage Profile

Unarmed Technique
→ Unarmed/Grapple/etc. + body/unarmed Damage Profile
```

The physical source provides the baseline output scale in the same way that Fireball or another Reference Spell provides a baseline for a magical derivative.

---

# 5. Physical Ability Power Budget

Physical Techniques use the same total Power Budget concept as Magic.

AI may distribute the budget across:

```text
Damage
Strike Count
Target Count
Area / Arc / Line
Range / Reach
Stun
Knockback
Push / Pull
Forced Position
Disarm
Guard Break
Bleed
Defence / Counter
Mobility
Source Bonus / reliability
Duration
Restrictions
Cooldown / usage limits
Resource cost if the Campaign later defines one
```

Multiple strikes are not free copies of full weapon damage.

Example:

```text
Triple Slash
```

must NOT automatically mean:

```text
3 × full normal Sword attack
```

The AI must fit total output inside the Technique's allowed budget by adjusting per-strike output, Source Bonus, target rules, restrictions, Rank or other costs.

---

# 6. Character Skill Does Not Linearly Multiply Damage

Relevant Skill Value controls primarily:

```text
Check reliability
Control complexity
Number of independently controlled strikes/projectiles where relevant
Bounded Mastery improvements
Access to more difficult Techniques
Efficiency where defined
```

Do not use:

```text
Final Damage = Swordsmanship × Sword Damage
```

or:

```text
Final Damage = Fire Magic × Fireball Damage
```

Raw Skill percentage is not an unlimited damage multiplier.

Physical and magical abilities therefore follow the same bounded Mastery principle.

---

# 7. Multi-Strike Physical Abilities

The same count rule used for multi-projectile Magic applies to physical multi-strike Techniques.

```text
Final Strike Count = minimum of:

A. Concept Count
B. Control Capacity
C. Power-Budget Capacity
```

Example:

```text
Name: Fivefold Blade
Pattern: SINGLE
```

AI may interpret the concept as five strikes, but if the Character/source/budget cannot support five meaningful strikes, the generated version may use fewer strikes or lower per-strike output.

The Player sees the interpreted result before submitting it to GM.

---

# 8. Minimal Player Custom-Ability Input

Physical and magical custom Ability creation should use the same minimal Player-facing input:

```text
1. Ability Name
2. Effect Range / Target Pattern
```

Examples:

```text
Name: Crescent Moon Sever
Pattern: SINGLE
```

```text
Name: Whirlwind Staff
Pattern: AREA
```

```text
Name: Firestorm
Pattern: AREA
```

The surrounding Skill Tree / Ability context supplies the relevant Skill, source/family, Element and accessible progression ceiling.

The Player does not manually enter authoritative damage, strike count, MP, status strength or other balance numbers.

---

# 9. AI Proposal for Physical Techniques

For a physical Technique, AI receives at least:

```text
Ability Name
Target Pattern
Relevant Skill
Skill Value / Mastery context
Equipped or selected attack source
Source Damage Profile
Character Damage Bonus where applicable
Comparable approved Techniques
Current physical Rank/reference budget
Campaign restrictions
```

AI returns structured mechanics such as:

```text
Suggested Rank / tier
Relevant Skill
Source Bonus
Source Damage relationship
Strike Count
Target Count
Area / Reach
Final Damage expression/profile
Physical Damage Type
Control effects
Movement effects
Restrictions
Closest References
Balance explanation
```

AI uses the actual weapon/item/unarmed Damage Profile as a reference rather than treating every physical Technique as having a universal base damage.

---

# 10. Enchantment Magic Is a Buff

Elemental enchantment Magic exists as a dedicated Magic role/type.

Example concepts:

```text
Flame Enchantment
Frost Edge
Lightning Weapon
Holy Blade
Shadow Coat
```

Canonical rule:

```text
ENCHANTMENT MAGIC = BUFF
```

It is **not** resolved as a separate independent Damage Ability when the enchanted weapon later hits.

The enchantment creates a Buff attached to a Character, weapon/attack source, or other approved target.

---

# 11. Enchantment Damage Contribution

The default enchantment behaviour is additive.

Example:

```text
Steel Sword
Base attack:
1D8 Slash

Active Buff:
Flame Enchantment
Adds approved FIRE contribution

Sword hits target
↓
One attack resolution
↓
Base physical damage + active Flame-Enchantment contribution
```

The enchantment does NOT create:

```text
Sword attack
+
second independent Fire attack roll
```

There is one underlying attack/check. The active Buff contributes to that attack's resulting Damage/Effect package.

The Buff may contribute structured effects such as:

```text
added elemental damage
Burn / Slow / Stun tendency
Element tag for resistance/weakness processing
Source Bonus modifier if explicitly approved
other bounded attack modifiers
```

The exact magnitude is determined by the enchantment's Rank/reference budget and AI/GM-approved definition.

---

# 12. Enchantment Does Not Replace Physical Damage by Default

Default Alpha behaviour:

```text
Physical Damage
+
Enchantment elemental contribution
```

not:

```text
Physical Damage converted entirely into Elemental Damage
```

A future/custom Ability may explicitly perform Damage conversion, but that is a special approved rule and not the default meaning of enchantment.

---

# 13. Enchantment Uses Magic Budget

Although the later attack deals additional elemental output, the enchantment Spell itself is balanced as a Buff.

AI budgets the enchantment across dimensions such as:

```text
Added elemental contribution
Duration
Number of attacks affected
Number of targets/weapons affected
Secondary elemental status
Source Bonus modifier
MP Cost
Cast/action cost
Restrictions
Concentration or upkeep if applicable
```

Therefore a long-duration enchantment affecting many attacks must normally provide less added output per attack, cost more MP, have a higher Rank, or carry other restrictions than a short one-hit enchantment.

Added elemental damage is not free merely because it is represented through a Buff.

---

# 14. Enchantment and the Universal Check Equation

An enchantment does not normally require a second attack check when the weapon strikes.

Example:

```text
Swordsmanship 48
Sword Source Bonus +2
Flame Enchantment accuracy modifier +0
Battle Focus +5

Final Check = 55
```

If an enchantment explicitly grants an accuracy/Source modifier, that modifier belongs to the existing Buff/Debuff term.

Its elemental damage/effect contribution is resolved only after the underlying physical attack succeeds.

---

# 15. Enchantment Stacking — Alpha Default

To prevent uncontrolled stacking during Alpha, elemental weapon enchantments should use a stacking group.

Default group:

```text
WEAPON_ELEMENTAL_ENCHANT
```

Alpha default:

```text
one active elemental enchantment from this stacking group per attack source
```

Applying another enchantment in the same group replaces the previous one unless a GM-approved Ability explicitly permits coexistence or multi-enchantment.

This is an Alpha safety rule and can be relaxed later if testing supports it.

---

# 16. Physical + Enchantment Example

```text
Character
Swordsmanship: 55

Weapon
Steel Sword
Base Damage: 1D8 Slash
Source Bonus: +2
Character Damage Bonus: applies

Physical Technique
Triple Slash
Element: NONE
Strike Count: AI/GM-approved
Uses: Swordsmanship

Buff
Flame Enchantment
Element: FIRE
Type: BUFF
Adds: AI/GM-approved FIRE contribution to eligible sword hits
Duration/uses: AI/GM-approved
```

When Triple Slash is used:

```text
Check
= Swordsmanship
+ Technique/Source Bonus
+ active Buff/Debuff modifiers

Damage package for each approved strike
= physical Technique/source output
+ eligible Flame Enchantment Buff contribution
```

The enchantment remains a Buff record even though its contribution becomes part of the final attack damage package.

---

# 17. AI / Player / GM Workflow Remains the Same

For both physical and magical custom abilities:

```text
Player enters Name + Target Pattern
      ↓
AI interprets against the correct reference context
      ↓
Deterministic validator checks structured output
      ↓
Player reviews complete proposal
      ↓
Player confirms
      ↓
GM reviews
   ├── Approve
   ├── Edit + Approve
   └── Reject
      ↓
Approved structured definition stored in D1
```

The Player never receives authoritative values merely because an AI generated them; Player confirmation and GM approval remain required during Alpha.

---

# 18. Alpha Locked Direction

1. Physical Techniques and elemental Magic use one universal custom-Ability scaling framework.
2. Normal physical Abilities use `Element = NONE`.
3. Physical Damage Type such as Slash/Pierce/Blunt remains separate from Element.
4. Physical Ability references come from the relevant Skill plus the weapon/item/unarmed Damage Profile and comparable approved Techniques.
5. Physical multi-strike/area/control effects consume the same total Power Budget concept as magical projectile/area/control effects.
6. Relevant Skill affects reliability, control complexity and bounded Mastery; it is not a raw linear damage multiplier.
7. Physical and magical custom creation both use minimal Player input: Ability Name + Effect Range/Target Pattern.
8. AI generates authoritative-mechanics proposals; Player confirms before GM submission; GM remains final approval authority during Alpha.
9. Enchantment Magic is a Buff category, not an independent follow-up Damage attack.
10. Default enchantment behaviour adds an elemental contribution to a successful physical attack rather than replacing the physical damage.
11. Enchantment contribution may include added elemental damage and/or elemental status/effects within its Magic Rank budget.
12. Enchantment accuracy modifiers, if any, enter the existing Buff/Debuff term of the universal check equation.
13. Enchantment output is balanced against duration, affected attacks/targets, MP cost and restrictions; Buff representation does not make the extra output free.
14. Alpha defaults to one active elemental weapon enchantment stacking group per attack source unless an approved Ability explicitly permits stacking.
15. All authoritative Ability, Buff, Item, Skill and approval data remains D1-backed.
