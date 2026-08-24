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
src/boss.js
```

The Worker is intentionally layered:

```text
boss.js
→ monster-defeat.js
→ monster-defence.js
→ monster.js
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
- Monster Templates, Common Monster Skills and Monster Instances
- Monster Defence / Armor and ordinary Monster defeat lifecycle
- Player → Monster and Monster → Character action audit
- Boss Design Profiles
- Boss baseline / override / Final values
- Common + Unique Boss Skill loadouts
- Boss Phase definitions and manual runtime Phase state
- Boss Instances and Profile → Instance snapshots
- Boss → Character D100 attacks and action audit

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
- Monster Template authoring and Instance spawning
- Monster Defence / Armor / resource correction
- Monster and Player combat controls
- dedicated Boss Design Profile authoring
- calculated Boss baseline vs GM Final override audit
- Common + Unique Boss Skill loadouts
- Boss Phase definitions
- Boss Instance spawn / runtime corrections
- manual Boss Phase control
- GM-controlled Boss Turn attack resolution

The old localStorage GM Character editor is not an authoritative MVP path.

## Initial GM provisioning

Normal registration always creates `role = player`.

Before the first production GM is provisioned, configure:

```bash
npx wrangler secret put INITIAL_GM_PROVISION_TOKEN
```

Then log in as the intended first GM, open `/gm/setup/`, and submit the Secret once. The current User becomes `gm`; once any `gm/admin` exists, bootstrap closes.

## Combat state MVP

Core runtime includes shared `combats` / `combatants` plus entity-specific audit tables.

Character + ordinary Monster flow is executable in both directions. Ordinary Monster HP0 is immediate `defeated` and does not use Player DYING.

Boss-enabled Encounter flow:

```text
Character
+ Monster Instance
+ Boss Instance
→ one shared DEX Initiative
→ same Round / Turn state
```

Boss combatants are GM-controlled. On a Boss Turn:

```text
GM selects snapshotted Boss Skill + living Character target
→ server reserves Boss Action
→ Boss Effective Accuracy vs Character Dodge
→ shared opposed D100
→ Damage Center + signed Spread
→ shared Damage pipeline
→ Character HP / DYING / DEAD integration
```

Boss AI is not implemented.

## Boss Design Profile / Instance MVP

Bosses use a dedicated authoring interface but reuse the ordinary Monster mathematics.

```text
Boss Design Profile
→ Monster-style Calculated Baseline
→ GM Override
→ Final Boss Values
→ Spawn Boss Instance
→ snapshot current Final Boss Values
```

There is no universal Boss multiplier.

Boss profile values include:

```text
Natural Attributes + Growth Weights
Calculated Effective Attributes
optional Final Attribute overrides
Calculated / Final Max HP and MP
Final Stored Defence
Final Armor data
Common + Unique Boss Skills
ordered Phase definitions
```

Unique Boss Skills are still Monster Skill Profiles (`source_scope = boss`) and use the same Accuracy / damage / Attribute-link / Spread mathematics.

Spawned Boss Instances own runtime state:

```text
Current HP / MP
runtime Defence / Armor adjustments
Current Phase
Phase hold state
snapshotted Skills
snapshotted Phase definitions
```

Profile edits do not silently mutate existing Instances.

Phase MVP supports optional HP-percentage thresholds as an **applicability signal** plus explicit GM manual Phase control. It does not automatically force irreversible transitions.

### Remaining Boss HP0 blocker

The exact Boss HP0 lifecycle is not yet Canonical. Therefore the non-HP0 Boss runtime deliberately enforces:

```text
Boss Instance Current HP >= 1
```

until the project confirms whether Boss HP0 means ordinary `defeated`, a special final Phase / scripted state, Player-like DYING, or another Boss-specific lifecycle.

Player → Boss final damage is therefore not enabled yet. This is the only intentional gap in the minimum Boss combat loop.

See `docs/BOSS_DESIGN_PROFILE_ALPHA.md` and `docs/BOSS_RUNTIME_MVP.md`.

## Scenario / Scene / Encounter MVP

The product remains a single-campaign MVP:

```text
settings.campaign_name
→ Scenario
→ Scene
→ Encounter
→ optional Combat
```

Encounter participant types:

```text
character
monster_instance
boss_instance
```

All three types now have runtime persistence. Player-origin attacks against Boss remain gated only by the Boss HP0 rule.

For MVP, one Encounter may link to zero or one Combat. A full tactical Map engine remains Deferred; current Map support is metadata only.

## Automated checks

GitHub Actions runs `.github/workflows/mvp-checks.yml` on branch pushes and pull requests.

Current checks include:

```bash
node --check for src/*.js and public/assets/*.js
node tests/rules.test.mjs
node tests/combat-rules.test.mjs
node tests/monster-rules.test.mjs
node tests/monster-life.test.mjs
node tests/boss-rules.test.mjs
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

## MVP direction

```text
Character / Combat core                              implemented
Scenario / Scene / Encounter                         implemented MVP foundation
ordinary Monster full combat loop                    implemented
Boss Profile / Boss Instance non-HP0 runtime         implemented in current slice
→ confirm Boss HP0 lifecycle
→ complete Player → Boss final damage path
→ first end-to-end Scenario / Boss-capable play-test
```

Advanced Monster/Boss AI, exact balance curves, full tactical Map rules, economy, loot and Quest automation remain later work unless they become a real blocker.
