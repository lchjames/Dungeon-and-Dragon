# Player Combat Control — MVP

> Status: Canonical MVP Implementation Contract  
> Date: 2026-08-24  
> Scope: Player-visible active Combat state plus server-authoritative use of own Action / Move and End Own Turn.

---

# 1. Purpose

This slice connects authenticated Players to the existing D1 Combat State Engine without introducing a second Player-only Turn model.

Canonical path:

```text
GM starts Combat
→ Combat / Combatants exist in D1
→ Player sees active Combat if they control at least one participant
→ when Current Combatant belongs to that Player:
   Action / Move may be consumed
   Player may End Own Turn
→ server advances the shared Combat state
```

---

# 2. Authority

Browser state is display/input only.

Authoritative state remains:

```text
combats
combatants
```

The Player cannot submit an arbitrary Character ID to claim control of a Turn.

Player authority is resolved from:

```text
authenticated User session
→ combatant.controller_user_id
→ Current Combatant
```

The Player operation is legal only when the Current Combatant is a Character controlled by the authenticated User.

---

# 3. Player Visibility

`GET /api/player/combat` returns the active Combat only when at least one Combatant is controlled by the current User.

A Player not participating in the current Combat receives no active Player Combat state.

The MVP Player view may display:

```text
Round
Current Turn
stable Initiative order
Combatant display names
DEX snapshots
Action / Move availability
which Combatants belong to the current User
```

This is encounter runtime information, not permission to mutate other Combatants.

---

# 4. Action / Move Allowance

During the Player's own Current Turn:

```text
Action Available = 1
Move Available = 1
```

MVP control endpoints can mark one allowance as spent:

```text
POST /api/player/combat/:combatId/consume-action
POST /api/player/combat/:combatId/consume-move
```

The server verifies:

```text
Combat is active
Current Turn still matches the server snapshot
Current Combatant controller = authenticated User
entity_type = character
requested allowance is still available
```

The same allowance cannot be consumed twice.

These manual controls exist to validate Turn-state flow before full Action resolvers are connected.

Future attack / ability / item / movement resolvers must consume the corresponding allowance automatically; they must not require a Player to manually mark it spent first.

---

# 5. End Own Turn

Player may call:

```text
POST /api/player/combat/:combatId/end-turn
```

only while they control the Current Combatant.

Ending the Turn forfeits any remaining Action / Move and advances the same shared Combat state used by GM controls.

Normal result:

```text
current Combatant allowances → spent
Turn Completed = true
→ next Initiative entry
```

At the final Initiative entry:

```text
Round += 1
Current Turn Index = 0
all Combatants receive fresh Action + Move
Turn Completed = false
```

---

# 6. Concurrency / Stale-State Protection

Player writes and normal GM End Current Turn must not double-advance Combat.

The corrected transition order is:

```text
verify expected Round / Current Turn
→ mutate Combatant allowance / completion state under that old-state condition
→ advance Combat pointer under the same old-state condition
```

For Round wrap:

```text
verify old final Turn
→ reset Combatant allowances only while old Round/Turn still matches
→ advance to next Round
```

A stale request must return a conflict rather than re-applying a transition to the new state.

This supersedes the earlier implementation ordering where the Combat pointer was advanced before the dependent Combatant update.

---

# 7. GM Boundary

GM retains:

```text
Start Combat
End Combat
Force Turn
End Current Turn
```

Player does not gain global Combat control.

The top-level Worker intercepts GM `End Current Turn` to use the corrected shared transition ordering while other GM Combat APIs remain delegated to the existing Combat State Engine.

---

# 8. Explicitly Deferred

This slice does not resolve an actual attack or ability.

Deferred to the next Combat resolver slice:

```text
D100 attack / defence
skill / ability execution
MP costs
damage
HP 0 / Down / Dying
prepared actions
status ticks
```

The temporary Player buttons `Mark Action Spent` / `Mark Move Spent` are state-engine test controls, not the final action UX.

---

# 9. Next MVP Blocker

Next implementation blocker:

```text
D100 Combat Resolver
+ Damage
+ HP 0 / Down-Dying baseline
```

After that, the roadmap inserts the Scenario / Scene / Encounter Foundation before Monster Runtime is connected into the first complete scenario flow.
