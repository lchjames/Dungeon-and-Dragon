# D&D Campaign Hub

Production source repository for `https://dungeon-and-dragon.lchjames.com`.

## Current MVP architecture

The current application is a Cloudflare Worker + Static Assets + D1 application.

Primary routes:

- `/player/login/` — shared User login with visible User name + 4-digit Key
- `/player/register/` — create a normal `player` User
- `/player/` — protected Player workspace backed by D1
- `/gm/setup/` — one-time initial GM bootstrap flow
- `/gm/` — protected D1-authoritative GM workspace for `gm` / `admin`

Current Worker entry from `wrangler.jsonc`:

```text
src/player-attack.js
```

The Worker is intentionally layered:

```text
player-attack.js
→ player-combat.js
→ combat-state.js
→ gm-provision.js
→ gm-d1.js
→ player-skill-allocation.js
→ player-create.js
→ worker.js
```

Each layer handles its scoped routes and delegates all other requests down the chain.

## D1 authority

Cloudflare D1 is the source of truth for gameplay data implemented in the MVP.

Production binding:

- binding: `DB`
- database: `dnd-db`
- database ID: `7a9abf7b-5f87-4295-89b1-8187e991b782`

Current authoritative areas include:

- users and sessions
- character ownership
- EXP and derived Level
- Character Attributes
- HP / MP
- 23 basic Skills and Creation Skill progression
- inventory and notes
- GM Character controls
- Player Attack Profiles approved by GM
- Character life state: alive / dying / dead
- Combat identity, combatants, Initiative, Round / Turn state
- Player own Action / Move allowance state and End Own Turn
- Character-vs-Character D100 attack / Dodge resolution
- Damage and HP0 / Dying baseline

Reference / migration SQL lives under `schema/`.

Browser storage is not authoritative campaign storage. It may only be used for UI preferences such as theme.

## Character creation MVP

Normal Player creation currently follows:

```text
server rolls Attributes
→ Player may Reroll before confirmation
→ EXP 1 / Level 1
→ formula-derived HP / MP
→ 23 basic Skills initialized at 0
→ Draft Character
→ allocate fixed 200 Creation Skill Points
→ each Skill 0–30 at creation
→ all 200 points required to Finalize
→ Character becomes active
```

Player cannot directly choose arbitrary starting Level or directly edit canonical HP / MP numeric values.

## GM MVP

GM access uses the same User/session system as Player access.

Allowed GM workspace roles:

```text
gm
admin
```

The current GM workspace reads D1 directly and supports:

- User / Character roster
- Character detail
- EXP add/subtract or set-total correction
- server-derived Level recalculation
- formula HP / MP Max recalculation when required Attributes exist
- Current HP / MP correction within `0..Max`
- temporary Player Attack Profile authoring
- Combat creation and control
- fixed DEX Initiative
- stable one-time random ordering for equal DEX
- Round / current Turn state
- GM End Turn / Force Turn / End Combat

The old localStorage GM Character editor is not an authoritative MVP path.

## Initial GM provisioning

Normal registration always creates `role = player`.

Before the first production GM is provisioned, configure a Cloudflare Worker Secret:

```bash
npx wrangler secret put INITIAL_GM_PROVISION_TOKEN
```

Use a strong random value. The real token must never be committed to this repository.

Then:

```text
1. log in as the intended first GM User
2. open /gm/setup/
3. submit the Secret once
4. the current User becomes gm
5. once any gm/admin exists, the bootstrap endpoint closes
```

The bootstrap route cannot target another User and cannot create an `admin` role.

## Authentication note

The visible access UX intentionally uses a short 4-digit Key. The server stores a salted hash rather than the plain Key and sessions use Secure + HttpOnly cookies.

Further credential-hardening remains a separate security backlog item; do not describe the current implementation as a stronger password scheme than the source actually provides.

## Combat state MVP

The current Combat runtime stores:

```text
combats
combatants
combat_action_log
```

The implemented Character-only flow is:

```text
GM selects active living Characters with valid DEX
→ Start Combat
→ snapshot DEX
→ higher DEX first
→ equal DEX randomly ordered once
→ stored stable Initiative
→ Round 1
→ each Combatant has 1 Action + 1 Move
→ Player can inspect active Combat when participating
→ Player can consume own Action / Move on own Current Turn
→ Player can choose a GM-approved Attack Profile and Character Target
→ server consumes Action
→ server rolls Attack D100 vs target Dodge D100
→ Attack Result must strictly exceed Defence Result
→ on Hit, server rolls Damage + applicable Character Damage Bonus
→ current MVP Effective Defence = 0
→ HP damage applies only when Damage Result > 0
→ HP 0 enters DYING with ceil(CON / 5) rounds
→ DYING Turn-end decrements once per normal Round
→ further effective damage while DYING causes DEAD + Character lock
→ Player can End Own Turn
→ GM can End / Force Turn
→ Round advances after final Turn
→ GM End Combat
```

Normal End Turn transitions use conditional D1 stale-state protection. Dying countdown additionally stores a per-Combat/per-Round idempotency marker so duplicate Turn-end requests cannot double-decrement the countdown.

The current `PLAYER_ATTACK_PROFILE_MVP.md` bridge is intentionally temporary. Player cannot submit Accuracy or Damage values; GM-approved Profiles supply the current base attack data until Weapon / Equipment / Specialisation source profiles are implemented.

The Combatant schema already reserves entity types for later:

```text
character
monster_instance
boss_instance
```

Only `character` is active in the current resolver path.

## Scenario / Scene / Encounter direction

The MVP is not intended to stop at a standalone Combat simulator.

Before Monster Runtime is connected into the first complete story flow, the project will add the minimum relationship:

```text
Campaign
→ Scenario
→ Scene
→ Encounter
→ Combat
```

See `docs/SCENARIO_SCENE_ENCOUNTER_MVP.md`.

A full tactical Map engine remains Deferred. The first narrative/context slice may reference a simple Map asset without implementing token dragging, LOS, terrain, fog of war, or permanent movement-per-turn grid counts.

## Automated checks

GitHub Actions runs `.github/workflows/mvp-checks.yml` on branch pushes and pull requests.

Current checks include:

```bash
node --check for src/*.js and public/assets/*.js
node tests/rules.test.mjs
node tests/combat-rules.test.mjs
node tests/static-ui-contract.test.mjs
```

These checks validate source syntax and selected regression contracts. They do **not** deploy production.

## Deployment

Production deployment remains a separate Cloudflare deployment action unless the Cloudflare project is independently configured with external Git deployment automation.

Repository commits or GitHub Actions checks alone must not be treated as proof that production has been deployed.

Manual deployment command:

```bash
npx wrangler deploy
```

Static assets live in `./public` and the active Worker entry is defined by `wrangler.jsonc`.

## MVP direction

The project is in MVP Implementation Mode. The remaining path is focused on reaching one complete playable Scenario / Encounter rather than finishing every TRPG subsystem first.

Current high-level path:

```text
Character D100 / Damage / HP0 resolver               implemented MVP path
→ Scenario / Scene / Encounter Foundation             next
→ Monster Template / Skill / Instance runtime
→ Boss Profile / Boss Instance minimum runtime
→ first end-to-end Scenario test
```

Advanced AI, exact balancing curves, full tactical Map rules, economy, loot and Quest automation remain later work unless they become a real blocker for the playable vertical slice.
