# Monster Attack / Skill Profile — Alpha

> Status: Canonical Alpha Override  
> Date: 2026-08-22  
> Scope: Defines how Simplified Monsters resolve offensive Attacks / Skills after the fixed-damage redesign. This file supersedes older Monster-specific wording that used damage dice, Character Damage Bonus, or Player-style damage scaling for ordinary Simplified Monster attacks.
> Use together with `D100判定核心_ALPHA.md`, `對抗判定與極端結果_ALPHA.md`, `COMBAT_DAMAGE_MODEL_ALPHA.md`, `MONSTER_NPC_SYSTEM_ALPHA.md`, and `GM_MONSTER_MANAGEMENT_ALPHA.md`.

---

# 1. Core Decision — Hit Check + Fixed-Band Damage

Simplified Monster offensive actions use a deliberately lightweight model:

```text
Declare Monster Attack / Skill
→ resolve D100 hit / opposed check
→ if miss: no damage
→ if hit: resolve fixed damage ± configured variance
→ apply defence / resistance
→ calculate Damage Result
→ apply HP loss only when Damage Result > 0
```

The Monster system therefore keeps the meaningful uncertainty on **whether the attack hits**, instead of rolling a second damage-dice package after a successful hit.

This is a Monster-specific simplification. Player Character damage rules are not changed by this override.

---

# 2. No Damage Dice for Simplified Monster Offensive Profiles

A Simplified Monster Attack / Skill Profile does not use ordinary damage dice such as:

```text
1D4
1D6
1D8
2D6
```

for its standard damage output.

Instead it stores:

```text
Base Damage
Damage Variance
```

Example:

```text
Goblin Short Sword
Base Damage = 8
Damage Variance = 2
```

means a successful hit produces a pre-defence raw damage value from:

```text
8 - 2
through
8 + 2
```

therefore:

```text
6–10 raw damage
```

---

# 3. Damage Variance Resolution

Canonical formula after a successful D100 hit:

```text
Variance Roll
= random integer from -Damage Variance to +Damage Variance

Raw Monster Damage
= Base Damage + Variance Roll
```

Example:

```text
Base Damage = 12
Damage Variance = 3
```

possible raw damage values are:

```text
9, 10, 11, 12, 13, 14, 15
```

`Damage Variance = 0` is valid and means completely fixed damage:

```text
Base Damage 12 ± 0
→ always 12 raw damage on a successful hit
```

The variance randomisation is not a D100 action check and has no Great Success / Great Failure meaning.

---

# 4. Hit Check Remains the Main Random Combat Check

Monster offensive actions still require the normal D100 hit / opposed resolution unless the specific Profile explicitly defines an unavoidable or non-attack effect.

For an ordinary attack:

```text
D100 attack succeeds
→ resolve fixed-band damage

D100 attack fails
→ no damage resolution
```

No second D100 roll is made for damage.

---

# 5. Existing Hit Architecture Remains Locked

The previously selected Monster hit architecture remains:

```text
D100 Attack Base
= Attribute-Derived Hit Value
+ Attack Proficiency
+ Additional Hit Modifier
```

Each Attack / Skill Profile explicitly stores:

```text
Primary Effective Attribute
Attack Proficiency
Additional Hit Modifier
```

Examples:

```text
Goblin Short Sword
Primary Effective Attribute = DEX
Attack Proficiency = 20
Additional Hit Modifier = +5

Ogre Heavy Club
Primary Effective Attribute = STR
Attack Proficiency = 15
Additional Hit Modifier = 0
```

Monster Level and Elite status can therefore improve accuracy through the Effective Attribute layer.

The exact shared Effective Attribute → D100 `Attribute-Derived Hit Value` conversion is still unresolved and must be decided separately.

---

# 6. Fixed Damage Is Separate From Hit Chance

The following fields have separate jobs:

```text
Primary Effective Attribute
Attack Proficiency
Additional Hit Modifier
→ hit resolution only

Base Damage
Damage Variance
→ damage output only after a hit
```

A single vague `Attack Bonus` must not be reused for both accuracy and damage.

Example:

```text
Goblin Short Sword
Primary Effective Attribute = DEX
Attack Proficiency = 20
Additional Hit Modifier = +5
Base Damage = 8
Damage Variance = 2
```

The `+5` changes only the D100 hit calculation.

The damage remains:

```text
8 ± 2
```

unless an explicit GM/Profile adjustment changes it.

---

# 7. No Default STR + SIZ Character Damage Bonus

The earlier Monster-specific proposal to reuse the Player Character physical Damage Bonus table is removed for Simplified Monster ordinary Attack / Skill Profiles.

Canonical:

```text
Simplified Monster damage
≠ Player STR + SIZ Damage Bonus table
```

Monster offensive damage is defined directly by:

```text
Base Damage ± Damage Variance
```

This keeps the Monster runtime simple and prevents a second hidden damage-growth layer from being added on top of the configured Monster Profile.

A richer Boss / NPC profile may use different mechanics if explicitly configured, but that is not the default Simplified Monster rule.

---

# 8. Defence / Resistance Still Applies

After the Monster successfully hits and Raw Monster Damage is resolved:

```text
Damage Result
= Raw Monster Damage - Effective Defence / Resistance
```

Then:

```text
Damage Result > 0
→ target loses that much HP

Damage Result <= 0
→ target loses no HP
```

This keeps Simplified Monster attacks compatible with the existing defence and Damage Result framework.

---

# 9. Monster Skills Use the Same Offensive Damage Structure

For Simplified Monsters, ordinary offensive **Skills** may use the same fixed-band damage structure instead of being forced into Player-style damage dice.

Example:

```text
Poison Spit
Hit basis: Effective DEX + Proficiency
Base Damage: 10
Damage Variance: 2
Damage Type: Poison
Additional Effect: Profile-defined poison status, if approved
```

The damage portion is still:

```text
10 ± 2
```

while any control, status, elemental, area, cooldown, MP cost, or other special behaviour is stored explicitly as separate Profile data.

A special effect does not silently change the fixed damage unless the Profile says so.

---

# 10. Level / Elite Interaction

Level and Elite status already change the Monster through:

```text
Natural Attributes
→ Elite Bonus
→ Level Scaling
→ Effective Attributes
```

This affects any D100 hit calculation that reads the Effective Attribute.

The fixed damage value is **not automatically multiplied by the global Monster Level curve** under this rule.

Whether `Base Damage ± Variance` should receive its own explicit Level-scaling rule is a separate design decision and remains unresolved.

This prevents accidental double scaling until a deliberate damage progression rule is chosen.

---

# 11. GM Final Adjustment

GM can maintain fixed-damage values at both Template and authorised instance level.

Template fields include:

```text
Base Damage
Damage Variance
```

Instance override may change, for that Monster only:

```text
Base Damage
Damage Variance
Attack Proficiency
Additional Hit Modifier
other approved Profile values
```

The system should preserve Template values and instance overrides separately for audit/debugging.

---

# 12. Minimum Simplified Monster Offensive Profile

A normal offensive Attack / Skill Profile should be able to store at least:

```text
Name
Attack / damage type
Primary Effective Attribute
Attack Proficiency
Additional Hit Modifier
Base Damage
Damage Variance
Range / reach
Targeting information
Optional status / special-effect references
Optional MP / cooldown / usage restriction fields where applicable
```

There is no standard `damage_dice` field required for Simplified Monster offensive Profiles.

---

# 13. GM Monster Management Requirement

The GM Monster Management interface must let GM maintain for each Monster Attack / Skill Profile:

```text
Name
Primary Effective Attribute
Attack Proficiency
Additional Hit Modifier
Base Damage
Damage Variance
Damage Type
Range / Reach
Targeting
Special effect / status links where needed
```

The UI should display fixed damage in a human-readable form such as:

```text
Damage: 8 ± 2
```

and may also show the resulting range:

```text
6–10
```

For an exact fixed value:

```text
Damage: 12 ± 0
```

---

# 14. Superseded Monster-Specific Rules

For Simplified Monster ordinary offensive Profiles, this document supersedes earlier Monster wording that used:

```text
Damage Profile / damage dice
Character STR + SIZ Damage Bonus
random Player-style damage packages
```

The shared Player Character damage system remains unchanged.

---

# 15. Locked Conclusions

1. Simplified Monster Attacks / offensive Skills make a D100 hit / opposed check.
2. A miss causes no damage.
3. A hit resolves `Base Damage ± Damage Variance`.
4. Variance is a simple random integer in `[-Variance, +Variance]`, not a D100 check.
5. `Variance = 0` means completely fixed damage.
6. Simplified Monsters do not use ordinary damage dice by default.
7. Simplified Monsters do not use the Player STR + SIZ Damage Bonus table by default.
8. Defence / resistance and Damage Result still apply after raw fixed-band damage is generated.
9. The selected hit architecture remains Effective Attribute + Attack Proficiency + separate Hit Modifier.
10. The exact Effective Attribute → D100 conversion remains unresolved.
11. Fixed Monster damage does not automatically receive the global Level curve.
12. GM can maintain Template damage and authorised per-instance overrides.

---

# 16. Next Unresolved Decision

The next Monster attack decision is whether the fixed damage values:

```text
Base Damage ± Damage Variance
```

remain unchanged across Monster Levels, or receive a separate explicit Level-based damage scaling method.
