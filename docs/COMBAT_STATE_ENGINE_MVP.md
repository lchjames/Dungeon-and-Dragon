# Combat State Engine — MVP

> Status: Canonical MVP Implementation Contract  
> Date: 2026-08-24  
> Scope: D1-authoritative Combat / Round / Turn state before attack and damage resolution.

---

# 1. Purpose

The Combat runtime establishes authoritative battle state without prematurely implementing attack, damage, Monster AI, Status resolution, or full Map movement.

Canonical MVP lifecycle:

```text
GM selects eligible combatants
→ Start Combat
→ snapshot DEX
→ build stable Initiative order
→ Round 1
→ Current Turn
→ 1 Action + 1 Move allowance
→ Player / GM operates the shared Turn state
→ Round advances
→ GM End Combat
```

---

# 2. Authority

Combat runtime state is stored in Cloudflare D1.

Browser state is display/input state only.

The MVP uses:

```text
combats
combatants
```

A Combat stores:

```text
Combat identity
status
Round number
current Turn index
creating GM User
start / end timestamps
```

A Combatant stores:

```text
Combat identity
entity type
entity identity
controller User where applicable
display-name snapshot
DEX snapshot
Initiative order
Action availability
Move availability
Turn-completed state
```

---

# 3. Entity-Type Boundary

The Combatant schema is intentionally compatible with future runtime entities:

```text
character
monster_instance
boss_instance
```

The current Character-only Combat path permits:

```text
entity_type = character
```

Monster and Boss entity support must be added when their D1 Instance systems exist; no fake Monster runtime is created before then.

---

# 4. Starting Combat

Only `gm` / `admin` may start or globally control Combat.

For the current Character-only slice, selected participants must:

```text
exist in D1
have Character status = active
have a valid numeric DEX
```

At Combat Start, the server snapshots Character DEX.

Later Character Attribute edits do not silently reorder an already-started Combat.

The MVP permits only one active Combat for the current campaign workspace at a time.

---

# 5. Initiative

Canonical ordering:

```text
higher DEX first
lower DEX later
```

No separate Initiative roll is used.

Equal DEX follows `INITIATIVE_TIE_RULE_ALPHA.md`:

```text
equal-DEX group
→ system randomly shuffles relative order once at Combat Start
→ resulting Initiative order is stored
→ order remains stable for the entire Combat
```

The older text in `戰鬥回合與行動經濟_ALPHA.md` saying equal-DEX order was unresolved is superseded by `INITIATIVE_TIE_RULE_ALPHA.md`.

---

# 6. Round / Turn State

Combat starts as:

```text
Round = 1
Current Turn Index = 0
```

Every Combatant starts a Round with:

```text
Action Available = 1
Move Available = 1
Turn Completed = false
```

Normal End Current Turn:

```text
current Combatant
→ Action Available = 0
→ Move Available = 0
→ Turn Completed = true
→ Current Turn Index advances
```

When the last Combatant ends their Turn:

```text
Round += 1
Current Turn Index = 0
all Combatants:
  Action Available = 1
  Move Available = 1
  Turn Completed = false
```

Attack and Ability execution will later consume these allowances automatically through server-authoritative resolver endpoints.

## 6.1 Stale-State / Double-Advance Protection

Turn advancement is a server-authoritative state transition and must not trust that a browser still holds the latest Round / Turn pointer.

All normal End Turn transitions compare:

```text
Expected Round
+ Expected Current Turn Index
+ Combat status = active
```

The corrected mutation order is:

```text
old Round / Turn still matches
→ update Combatant completion / allowance state
→ advance Combat pointer
```

For the final Turn of a Round:

```text
old final Turn still matches
→ reset Combatant allowances for the next Round
→ increment Round and set Current Turn Index = 0
```

This ordering is important. Advancing the Combat pointer first can allow a delayed stale request to observe the new pointer and incorrectly reapply dependent Combatant mutations.

If another request has already changed the expected state:

```text
conditional update changes 0 rows
→ reject with COMBAT_STATE_CHANGED
→ caller reloads current Combat state
```

This rule applies to both Player and GM normal End Turn operations.

---

# 7. Player Control

Player Combat Control is implemented by `PLAYER_COMBAT_CONTROL_MVP.md`.

An authenticated Player can see an active Combat only when they control at least one participating Combatant.

Player mutation authority is:

```text
authenticated User
→ combatant.controller_user_id
→ Current Combatant
```

Only when the Current Combatant is a Character controlled by that User may the Player:

```text
consume own Action
consume own Move
End Own Turn
```

The Player cannot switch global Combat state, Force Turn, mutate another Combatant, or claim control by submitting a Character ID.

---

# 8. GM Override

GM retains:

```text
Start Combat
Force Turn
End Current Turn
End Combat
```

`Force Turn` is an explicit correction/control operation:

```text
GM chooses a Combatant
→ Current Turn pointer changes to that Combatant
```

Force Turn does **not** automatically restore or reset:

```text
Action Available
Move Available
Turn Completed
Round number
```

This avoids silently granting duplicate actions.

A future explicit allowance-reset correction may be added separately if required.

---

# 9. Ending Combat

Only GM / admin may end global Combat state.

End Combat:

```text
status = ended
ended_at recorded
```

The ended Combat remains historical D1 data and is not reused as the next active Combat.

A new Combat receives a new Combat identity and new DEX / Initiative snapshots.

---

# 10. Current Endpoints

GM:

```text
GET  /api/gm/combat
POST /api/gm/combat/start
POST /api/gm/combat/:combatId/end-turn
POST /api/gm/combat/:combatId/force-turn
POST /api/gm/combat/:combatId/end
```

Player:

```text
GET  /api/player/combat
POST /api/player/combat/:combatId/consume-action
POST /api/player/combat/:combatId/consume-move
POST /api/player/combat/:combatId/end-turn
```

The manual consume endpoints are MVP Turn-state test controls. Future actual actions such as attack, ability, item use or movement must consume the corresponding allowance through their own resolver rather than requiring the Player to press a separate manual button first.

---

# 11. Explicitly Deferred

The following are not yet part of the Combat-state / Player-control layers:

```text
attack / defence D100 resolution
damage resolution
HP 0 / Dying integration
MP costs
prepared actions
start-of-turn Status processing
Burning / Poison ticks
Buff / Debuff countdown
Regeneration
Monster / Boss combatants
Monster AI
Boss AI
Map movement distance
terrain / line of sight
```

The tables and Turn ownership are the runtime foundation those systems will use.

---

# 12. Next Blocker

The next MVP blocker is:

```text
D100 Combat Resolver
+ Damage
+ HP 0 / Down-Dying baseline
```

After that core resolver exists, implement the Scenario / Scene / Encounter Foundation before Monster Runtime is connected into the first complete Scenario flow.
