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
src/combat-state.js
```

The Worker is intentionally layered:

```text
combat-state.js
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
- Combat identity, combatants, Initiative, Round / Turn state

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
```

The implemented Character-only flow is:

```text
GM selects active Characters with valid DEX
→ Start Combat
→ snapshot DEX
→ higher DEX first
→ equal DEX randomly ordered once
→ stored stable Initiative
→ Round 1
→ each Combatant has 1 Action + 1 Move
→ End / Force Turn
→ Round advances after final Turn
→ GM End Combat
```

The Combatant schema already reserves entity types for later:

```text
character
monster_instance
boss_instance
```

Only `character` is active in the current slice.

## Automated checks

GitHub Actions runs `.github/workflows/mvp-checks.yml` on pushes to `main` and pull requests.

Current checks include:

```bash
node --check src/*.js / public asset modules via shell loop
node tests/rules.test.mjs
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

The project is in MVP Implementation Mode. The next implementation stages are intentionally focused on reaching one complete playable encounter rather than finishing every TRPG subsystem first.

Current high-level remaining path after the Combat state foundation:

```text
Player server-authoritative Action / Move / End Own Turn
→ D100 attack / damage / HP 0 integration
→ Monster Template / Skill / Instance runtime
→ Boss Profile / Boss Instance minimum runtime
→ first end-to-end play-test encounter
```

Advanced AI, exact balancing curves, full map rules, economy, loot and quest systems remain later work unless they become a real blocker for the playable vertical slice.
