# Monster HP0 / Defeat — MVP

> Status: Canonical MVP Rule  
> Date: 2026-08-25  
> Scope: Defines the ordinary Simplified Monster HP0 lifecycle required to complete the Player → Monster combat loop.

---

# 1. Locked Rule

Ordinary Simplified Monsters do **not** use the Player DYING countdown.

```text
Monster Current HP > 0
→ status = active

Monster Current HP <= 0
→ clamp Current HP = 0
→ status = defeated
```

`defeated` is immediate once authoritative HP reaches 0.

---

# 2. No Player DYING Inheritance

Do not apply:

```text
ceil(CON / 5) dying rounds
Down / Dying state
further-damage instant death
Player character death lock
```

to ordinary Simplified Monsters unless a future rule explicitly introduces a Monster-specific lifecycle.

This rule intentionally keeps ordinary Monster combat fast and uses the existing Monster Instance status model:

```text
active
defeated
removed
```

---

# 3. Player → Monster Attack Pipeline

The complete ordinary Monster defence / damage flow is now:

```text
Player Attack Profile
→ server reads Player Stored Accuracy
→ server reads Monster Stored Defence + Defence Modifier
→ Effective D100 Defence
→ opposed D100

Attack Result <= Monster Defence Result
→ defended / miss
→ no damage roll

Attack Result > Monster Defence Result
→ hit
→ roll Player Attack Profile damage
→ applicable Character Damage Bonus
→ Raw Damage
→ server reads Monster Final Armor Defence
→ Damage Result = Raw Damage - Final Armor Defence

Damage Result <= 0
→ Monster HP unchanged

Damage Result > 0
→ subtract HP Damage
→ clamp at 0
→ if HP reaches 0, status = defeated
```

Armor remains a post-hit fixed defence source and is never added to the D100 defence check.

---

# 4. Defeated Monster Runtime Behaviour

Once `status = defeated`:

```text
cannot use ordinary Action
cannot use ordinary Move
cannot perform Monster Skill attacks
cannot be selected as a normal living hostile target
must not be treated as an active Monster participant for a new Combat
```

If a Monster becomes defeated during an existing Combat, its Combatant row may remain for initiative / audit history, but runtime controls must treat it as non-actionable.

When the initiative pointer reaches a defeated Monster Combatant, the GM must not be able to execute ordinary Monster actions. Existing Combat turn controls may advance past it without resurrecting or reactivating the Monster.

---

# 5. Targeting

Player ordinary attack targeting:

```text
active Monster Instance in the same Combat
→ valid target

defeated / removed Monster Instance
→ invalid normal attack target
```

Monster ordinary attacks continue to target living Characters according to the existing Character life-state rules.

---

# 6. GM Correction Boundary

`defeated` is the normal HP0 outcome, but GM correction remains authoritative.

For MVP:

```text
GM sets Current HP > 0 on a defeated Monster Instance
→ status returns to active

GM sets Current HP = 0 on an active Monster Instance
→ status becomes defeated
```

This is a corrective GM operation, not an ordinary Player action.

`removed` remains a separate GM / encounter-management state and is not automatically produced by damage.

---

# 7. D1 / Server Authority

Player requests may submit only:

```text
Player Attack Profile ID
Target Combatant ID
```

The Player must not submit authoritative values for:

```text
Monster Stored Defence
Monster Defence Modifier
Effective D100 Defence
Monster Armor
Damage Result
HP Damage
Monster status
```

The server reloads all values from D1, reserves the authoritative Action before rolling, resolves the attack, updates Monster HP/status, and writes the combat action audit.

---

# 8. Audit Requirement

The Player → Monster attack log should preserve enough information to explain the result:

```text
combat / round / turn
actor Combatant
Monster target Combatant / Instance
Attack Profile
Attack D100 / Result
Monster Stored Defence
Monster Defence Modifier
Monster Effective D100 Defence
Monster defence D100 / Result
Raw Damage
Monster Final Armor Defence
Damage Result
HP Damage
Monster HP before / after
Monster status after
outcome
```

---

# 9. Explicit Non-Rules

Do not silently introduce:

```text
ordinary Monster DYING rounds
negative Monster HP
Player-style death lock
automatic corpse / loot state
automatic Encounter resolution solely because one Monster is defeated
automatic Combat end solely because one Monster is defeated
```

Encounter / Combat completion remains GM-controlled unless a separate confirmed automation rule is added.

---

# 10. Definition of Implemented

This rule is considered implemented when the production-style path exists:

```text
Canonical docs
D1-authoritative Monster HP/status
Player → Monster D100 resolver
Monster Stored Defence
Monster Armor reduction
Action reservation
HP clamp
status active → defeated at HP0
GM correction status reconciliation
Player UI target / result support
GM / Player Combat payload support
combat audit
regression contracts
```

With this rule locked, there is no remaining ordinary Simplified Monster combat blocker before Boss runtime work.
