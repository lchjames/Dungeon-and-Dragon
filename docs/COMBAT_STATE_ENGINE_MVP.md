# Combat State Engine — MVP

> Status: Canonical MVP Implementation Contract  
> Date: 2026-08-24  
> Scope: D1-authoritative Combat / Round / Turn state before attack and damage resolution.

---

# 1. Purpose

The first Combat runtime slice establishes authoritative battle state without prematurely implementing attack, damage, Monster AI, Status resolution, or Map movement distance.

Canonical MVP lifecycle:

```text
GM selects eligible combatants
→ Start Combat
→ snapshot DEX
→ build stable Initiative order
→ Round 1
→ Current Turn
→ 1 Action + 1 Move allowance
→ End / Force Turn
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

The current MVP slice permits only:

```text
entity_type = character
```

Monster and Boss entity support must be added when their D1 Instance systems exist; no fake Monster runtime is created in this slice.

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

Attack and Ability execution will later consume these allowances through server-authoritative Action endpoints.

## 6.1 Stale-State / Double-Advance Protection

Turn advancement is a server-authoritative state transition and must not trust that a browser still holds the latest Round / Turn pointer.

The End Turn update therefore compares the previously-read authoritative state before advancing:

```text
Expected Round
+ Expected Current Turn Index
+ Combat status = active
→ conditional D1 update
```

If another request has already changed that state:

```text
conditional update changes 0 rows
→ reject with COMBAT_STATE_CHANGED
→ caller must reload current Combat state
```

This prevents two near-simultaneous End Turn requests from silently skipping a Combatant or advancing the Round twice.

The same principle must be reused by future Player-owned turn/action mutation endpoints where stale concurrent writes could consume or advance authoritative Combat state incorrectly.

---

# 7. GM Override

The MVP supports GM `Force Turn` as an explicit correction/control operation.

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

Force Turn must still fail rather than report success if the Combat ceased to be active before the authoritative write completed.

---

# 8. Ending Combat

Only GM / admin may end global Combat state in this slice.

End Combat:

```text
status = ended
ended_at recorded
```

The ended Combat remains historical D1 data and is not reused as the next active Combat.

A new Combat receives a new Combat identity and new DEX / Initiative snapshots.

---

# 9. Player Boundary

This slice does not yet expose Player turn actions.

Player authority remains deferred to the next implementation slice:

```text
Player can inspect current Combat / own Turn
Player can consume own Action / Move through server APIs
Player can End Own Turn only when they control Current Combatant
```

GM global control remains separate.

---

# 10. Explicitly Deferred

The following are not part of this Combat-state slice:

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

# 11. Current Implementation Endpoints

GM MVP:

```text
GET  /api/gm/combat
POST /api/gm/combat/start
POST /api/gm/combat/:combatId/end-turn
POST /api/gm/combat/:combatId/force-turn
POST /api/gm/combat/:combatId/end
```

The GM UI exposes the same narrow capabilities.

---

# 12. Next Blocker

Once this state engine is implemented and the recheck hotfixes are applied, the next MVP blocker is:

```text
Player server-authoritative Action / Move / End Own Turn
```

That layer must consume this Combat state rather than introducing a separate browser-only Turn model, and must use the same stale-state protection for authoritative mutation endpoints.
