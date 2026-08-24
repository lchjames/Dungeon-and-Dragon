# D&D Campaign Hub

Production source repository for `https://dungeon-and-dragon.lchjames.com`.

## Current MVP architecture

The application is a Cloudflare Worker + Static Assets + D1 Campaign Hub.

Primary routes:

- `/player/login/` — shared User login with visible User name + 4-digit Key
- `/player/register/` — create a normal `player` User
- `/player/` — protected Player workspace backed by D1
- `/gm/setup/` — one-time initial GM bootstrap flow
- `/gm/` — protected D1-authoritative GM workspace for `gm` / `admin`

Current Worker entry from `wrangler.jsonc`:

```text
src/monster.js
```

The Worker is intentionally layered:

```text
monster.js
→ scenario.js
→ life-correction.js
→ player-attack.js
→ player-combat.js
→ combat-state.js
→ gm-provision.js
→ gm-d1.js
→ player-skill-allocation.js
→ player-create.js
→ worker.js
```

Each layer handles scoped routes and delegates all other requests down the chain.

## D1 authority

Cloudflare D1 is the authoritative source for implemented gameplay state.

Production binding:

- binding: `DB`
- database: `dnd-db`
- database ID: `7a9abf7b-5f87-4295-89b1-8187e991b782`

Current authoritative areas include:

- users and sessions
- Character ownership, EXP, derived Level, Attributes, HP / MP
- 23 basic Skills and Creation Skill progression
- inventory and notes
- Player Attack Profiles approved by GM
- Character life state: alive / dying / dead
- Combat identity, combatants, Initiative, Round / Turn state
- Player Action / Move allowance and End Own Turn
- Character-vs-Character D100 attack / Dodge resolution
- Damage and Character HP0 / Dying baseline
- Scenario / Scene / Encounter narrative structure
- Encounter participant storage and Encounter → optional Combat link
- simple Scene Map metadata
- Monster Templates
- Common Monster Skill Profiles
- Template Skill loadouts
- spawned Monster Instances and snapshotted Instance Skills
- Monster Instance HP / MP and Spread overrides
- Monster → Character D100 attacks and action audit

Reference / migration SQL lives under `schema/`.

Browser storage is not authoritative campaign storage. It may only be used for UI preferences such as theme.

## Character creation MVP

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

Player cannot choose arbitrary starting Level or directly edit canonical HP / MP numeric values.

## GM MVP

GM access uses the same User/session system as Player access.

Allowed roles:

```text
gm
admin
```

Current GM workspace supports:

- D1 User / Character roster and Character detail
- EXP correction and derived Level recalculation
- Current HP / MP correction
- Character Attack Profile authoring
- Scenario / Scene / Encounter authoring
- simple Scene Map reference metadata
- Character Encounter participant assignment
- Common Monster Skill authoring
- Monster Template authoring
- Common Skill loadout assignment to Templates
- spawning Monster Instances into open Encounters
- inspecting base / Natural / Effective Monster Attributes
- inspecting Elite generation and calculated HP / MP
- Monster Instance resource correction
- per-Instance Skill Spread override
- Encounter → Combat start
- Combat creation / control
- GM-controlled Monster Turn attack resolution

The old localStorage GM Character editor is not an authoritative MVP path.

## Initial GM provisioning

Normal registration always creates `role = player`.

Before the first production GM is provisioned, configure:

```bash
npx wrangler secret put INITIAL_GM_PROVISION_TOKEN
```

Then log in as the intended first GM, open `/gm/setup/`, and submit the Secret once. The current User becomes `gm`; once any `gm/admin` exists, bootstrap closes. The route cannot target another User or create an `admin` role.

## Authentication note

The visible access UX intentionally uses a short 4-digit Key. The server stores a salted hash rather than the plain Key and sessions use Secure + HttpOnly cookies. Further credential-hardening remains a separate security backlog item.

## Combat state MVP

Core runtime:

```text
combats
combatants
combat_action_log
monster_action_log
```

Character flow:

```text
active living Characters
→ Start Combat
→ snapshot DEX
→ high DEX first
→ equal DEX randomly ordered once
→ fixed Initiative
→ 1 Action + 1 Move
→ Player own-turn controls
→ GM-approved Player Attack Profile
→ Attack D100 vs Character Dodge D100
→ shared Result comparison
→ Damage
→ Character HP0 / DYING / DEAD
```

Monster-enabled Encounter flow:

```text
Character Encounter participants
+ active spawned Monster Instances
→ Start Encounter Combat
→ one shared Character + Monster DEX Initiative
→ Monster combatants are GM-controlled
→ GM selects snapshotted Monster Skill + living Character target
→ server reserves Monster Action
→ Monster Effective Accuracy vs Character Dodge
→ Damage Center + signed Spread Roll
→ shared Damage pipeline
→ Character HP / DYING / DEAD integration
```

Monster AI is not implemented. The GM explicitly selects Monster Skills and targets.

### Current Monster defence blocker

The project has **not yet confirmed the source value used when a Simplified Monster defends against a Player attack**.

Therefore the current MVP deliberately keeps:

```text
Monster → Character attack = implemented
Player → Monster attack = not yet enabled
```

Do not infer Effective DEX, a hidden Dodge score, or another defence source until that rule is explicitly confirmed. See `docs/MONSTER_RUNTIME_MVP.md`.

## Monster runtime MVP

Ordinary Monster spawn follows the confirmed Canonical pipeline:

```text
Template Attribute ranges
→ independent six-Attribute rolls
→ 10% Elite check
→ one +1..+5 Elite bonus to all six if Elite
→ Natural Attributes
→ Level curve + per-Attribute Growth Weights
→ Effective Attributes
→ HP / MP
→ snapshotted Template Skill loadout
→ damage calculation / Spread snapshot
→ Encounter participant
→ Combat participant
```

Locked formulas remain centralized in `src/monster-rules.js`:

```text
GlobalGrowth(Level) = ((Level - 1) / 21.7)^2
Effective Attribute = round(Natural × [1 + GlobalGrowth × Weight])
Max HP = ceil((Effective CON + Effective SIZ) / 2)
Max MP = Effective INT × 3

MonsterDamageGrowth(Level) = 7 × ((Level - 1) / 99)^1.5
Calculated Base Damage = round(Template Base Damage × [1 + MonsterDamageGrowth × Weight])
Damage Center = Calculated Base Damage + Damage Attribute Basis
```

Stored Monster Skill Accuracy does not automatically scale with Level and may exceed 100; runtime Effective Accuracy is capped at 100 after modifiers.

Exact Level → Spread tuning is still Alpha Tuning. The MVP keeps a replaceable centralized suggestion between the existing conceptual anchors around `[-2,+2]` at low Level and `[-5,+15]` at high Level. GM Instance-Skill Final Spread overrides remain authoritative for content tuning.

## Scenario / Scene / Encounter MVP

The product remains a single-campaign MVP:

```text
settings.campaign_name
→ Scenario
→ Scene
→ Encounter
→ optional Combat
```

D1 tables:

```text
scenarios
scenes
encounters
encounter_participants
encounter_combats
```

Encounter participant types:

```text
character
monster_instance
boss_instance
```

`character` and `monster_instance` are now active in the ordinary Monster MVP path. `boss_instance` remains reserved for the next Boss slice.

For MVP, one Encounter may link to zero or one Combat. A full tactical Map engine remains Deferred; current Map support is metadata only.

## Automated checks

GitHub Actions runs `.github/workflows/mvp-checks.yml` on branch pushes and pull requests.

Current checks include:

```bash
node --check for src/*.js and public/assets/*.js
node tests/rules.test.mjs
node tests/combat-rules.test.mjs
node tests/monster-rules.test.mjs
node tests/static-ui-contract.test.mjs
```

These checks validate source syntax and selected regression contracts. They do **not** deploy production.

## Deployment

Production deployment remains a separate Cloudflare deployment action unless external Git deployment automation is independently configured.

Repository commits or GitHub Actions checks alone are not proof that production has been deployed.

Manual deployment command:

```bash
npx wrangler deploy
```

Static assets live in `./public` and the active Worker entry is defined by `wrangler.jsonc`.

## MVP direction

The project is in MVP Implementation Mode. Current path:

```text
Character D100 / Damage / HP0 resolver              implemented MVP path
Scenario / Scene / Encounter Foundation             implemented MVP foundation
Monster Template / Skill / Instance runtime         implemented except Player → Monster defence path
→ confirm Simplified Monster defence source
→ complete Player → Monster damage / defeat integration
→ Boss Profile / Boss Instance minimum runtime
→ first end-to-end Scenario test
```

Advanced Monster/Boss AI, exact balance curves, full tactical Map rules, economy, loot and Quest automation remain later work unless they become a real blocker.
