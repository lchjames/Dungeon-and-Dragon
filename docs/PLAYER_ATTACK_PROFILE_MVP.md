# Player Attack Profile — MVP

> Status: Canonical MVP Bridge Contract  
> Date: 2026-08-24  
> Scope: Temporary GM-authored Player attack source used until full Weapon / Equipment / Specialisation source profiles are implemented.

---

# 1. Confirmed Architecture

The MVP uses option A:

```text
GM-authored Player Attack Profile
→ assigned directly to one Character
→ Player may choose only approved active Profiles
→ server resolves D100 + Damage
```

This Profile is a bridge, not the final Weapon / Equipment / Specialisation system.

It exists because the current 23 Basic Skills intentionally do not contain `Melee`, `Ranged`, `Guard` or `Grapple`, while ordinary physical attacks remain valid Character actions.

The server therefore requires an authoritative approved source for attack Accuracy and Damage rather than inventing values from `Athletics`, `Dodge`, arbitrary Player input, or hard-coded generic weapon numbers.

---

# 2. MVP Profile Fields

Each Player Attack Profile belongs to exactly one Character and contains:

```text
Name
Stored Accuracy
Damage Dice Count
Damage Dice Sides
Fixed Damage Modifier
Applies Character Damage Bonus
Defence Skill Key
Active / inactive state
```

MVP defaults:

```text
Defence Skill Key = dodge
Effective Defence = 0
```

`Effective Defence = 0` is only the current post-hit fixed-defence baseline. Armour, resistance, shields and other fixed Defence sources remain future integrations.

The MVP bridge keeps `Stored Accuracy` within the current Player natural D100 cap:

```text
0 <= Stored Accuracy <= 98
```

Future equipment / Buff / Ability / situational modifiers remain separate from the stored base value and may alter the effective D100 value according to the shared D100 rules.

---

# 3. GM Authority

Only `gm` / `admin` may create, edit, activate or deactivate Player Attack Profiles.

Player cannot submit:

```text
Accuracy
Damage Dice
Fixed Damage Modifier
Damage Bonus flag
Defence Skill
```

A Player attack request may only submit:

```text
approved Profile id
Target Combatant id
```

The server reloads the Profile from D1 before resolving the attack.

---

# 4. Player Attack Resolver

MVP Character-vs-Character test path:

```text
Current Combat
→ Current Combatant belongs to authenticated Player
→ Action Available = 1
→ Character Life State = ALIVE
→ approved active Attack Profile exists for that Character
→ target is another Character Combatant in the same Combat
→ target is not DEAD
→ target has Dodge
→ server reserves / consumes the Action
→ server rolls both D100 values
→ compare Result
```

Canonical opposed rule:

```text
Attack Result > Defence Result
→ Hit

Attack Result <= Defence Result
→ Miss / defended
```

Raw `100` and `1` retain Great Success / Great Failure markers, but do not bypass the opposed Result comparison.

---

# 5. Damage

On Hit:

```text
Raw Damage
= Damage Dice
+ Fixed Damage Modifier
+ applicable Character Damage Bonus
```

MVP:

```text
Effective Defence = 0
Damage Result = Raw Damage - Effective Defence
```

HP damage:

```text
Damage Result > 0
→ HP Damage = Damage Result

Damage Result <= 0
→ HP unchanged
```

No global rule is added for:

```text
Great Success = double damage
Great Failure = automatic self-hit
```

Great outcomes remain metadata for later GM / AI contextual handling.

---

# 6. Character Damage Bonus

If the Profile has:

```text
Applies Character Damage Bonus = true
```

use the current Canonical `STR + SIZ` Damage Bonus table.

The Damage Bonus roll contributes only to Raw Damage and has no D100 Great meaning.

---

# 7. HP 0 / Dying / Death Integration

When effective damage reduces Current HP to zero:

```text
HP = 0
→ Life State = DYING
→ Dying Rounds Remaining = ceil(CON / 5)
```

While DYING:

```text
normal Action / Move resolvers are blocked
own Turn may still be ended
own Turn end decrements Dying Rounds Remaining once per normal Round
```

If the countdown reaches zero while HP remains zero:

```text
Life State = DEAD
Character Locked = true
```

If a DYING Character receives any further effective damage:

```text
→ immediate DEAD
→ Character Locked = true
```

No negative HP, death-save dice or Massive Damage rule is added.

---

# 8. Concurrency Boundary

The attack resolver consumes the attacker's authoritative Action before the D100 roll is resolved.

The Action reservation uses:

```text
Combat id
Round number
Current Turn index
Current Combatant id
controller_user_id
Action Available = 1
```

A stale / duplicate attack request must fail rather than resolve a second attack.

Turn-end Dying countdown uses the same authoritative Round / Turn state and an idempotent per-Combat/per-Round marker so duplicate End Turn requests cannot decrement the Dying countdown twice.

---

# 9. Explicitly Deferred

This bridge does not implement:

```text
full Weapon inventory profiles
Weapon Specialisation progression
Equipment-derived hit modifiers
Armour / resistance / shield Defence aggregation
range / line of sight
ammo
multi-attack
named Ability execution
MP attack abilities
Monster / Boss attack Profiles
AI Great-result consequences
```

Those systems must reuse the shared D100 and Damage resolver boundaries rather than replacing them.

---

# 10. Replacement Path

Future architecture:

```text
Weapon / Equipment / Specialisation / Ability Source Profile
→ approved Accuracy / Damage / flags
→ same shared D100 + Damage resolver
```

Therefore the MVP bridge may later be migrated or generated from formal source data without changing Combat's core resolution rules.
