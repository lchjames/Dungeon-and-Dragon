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
src/boss-defeat.js
```

The Worker is intentionally layered:

```text
boss-defeat.js
→ boss-runtime.js
→ boss.js
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

`boss-runtime.js` is the hardened Boss authoring / spawn boundary. It owns validated D1 bind contracts for Boss Profile create/update and Boss Instance snapshot spawn. It also preflights Boss participants before a Boss-enabled Encounter delegates to the lower Character/Monster Combat-start layers, and performs best-effort cleanup if a later Boss augmentation failure leaves a newly-created Encounter Combat link.

`boss-defeat.js` is the outer Boss combat/life-state boundary. It owns Player → Boss attack resolution, Boss Armor-aware damage, Boss HP0 → immediate `defeated`, GM Current HP status reconciliation and the Player → Boss audit path.

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
- Monster Template Dedicated Stored Defence
- Monster Template Armor source data
- spawned Monster Defence / Armor snapshots
- Instance Defence Modifier and Armor Defence Adjustment
- Player → Monster D100 attacks
- Monster Armor-aware damage reduction
- ordinary Monster active / defeated / removed lifecycle
- Player → Monster action audit
- Boss Design Profiles
- Boss calculated baseline / GM override / Final values
- Common + Unique Boss Skill loadouts
- Boss Phase definitions and manual runtime Phase state
- Boss Instances and Profile → Instance snapshots
- Boss → Character D100 attacks and action audit
- Player → Boss D100 attacks and action audit
- Boss Armor-aware damage reduction
- Boss active / defeated / removed lifecycle

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
- Template Dedicated Stored Defence authoring
- Template Armor Name / Defence / Notes authoring
- spawned Instance Defence / Armor snapshot inspection
- Instance Defence Modifier correction
- Instance Armor Defence Adjustment correction
- Monster defeated ↔ active status reconciliation through GM HP correction
- dedicated Boss Design Profile authoring
- calculated Boss baseline vs GM Final override audit
- Common + Unique Boss Skill loadouts
- Boss Phase definitions
- Boss Instance spawn / runtime corrections
- Boss defeated ↔ active status reconciliation through GM HP correction
- manual Boss Phase control
- Encounter → Combat start
- Combat creation / control
- GM-controlled Monster Turn attack resolution
- GM-controlled Boss Turn attack resolution

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

Core runtime includes:

```text
combats
combatants
combat_action_log
monster_action_log
player_monster_action_log
boss_action_log
player_boss_action_log
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

Player → Monster flow:

```text
Player selects approved Attack Profile + active Monster target
→ server reserves Player Action
→ Player Stored Accuracy vs Monster Effective D100 Defence
→ successful hit
→ Player Raw Damage
→ Monster Final Armor Defence
→ Damage Result
→ HP Damage if positive
→ Monster HP clamp at 0
→ HP 0 = immediate defeated
```

Boss-enabled Encounter flow:

```text
Character
+ Monster Instance
+ Boss Instance
→ Boss participant preflight
→ one shared DEX Initiative
→ same Round / Turn state
```

Boss participants must all still be `active` with `Current HP > 0` before the lower-layer Encounter Combat start is allowed. If a later Boss augmentation fails after a new lower-layer Combat link was created, the hardened gateway attempts to end that partial Combat and unlink it so the Encounter can be corrected and retried.

On a Boss Turn:

```text
GM selects snapshotted Boss Skill + living Character target
→ server reserves Boss Action
→ Boss Effective Accuracy vs Character Dodge
→ shared opposed D100
→ Damage Center + signed Spread
→ shared Damage pipeline
→ Character HP / DYING / DEAD integration
```

Player → Boss flow:

```text
Player selects approved Attack Profile + active Boss target
→ server reserves Player Action
→ Player Stored Accuracy vs Boss Effective D100 Defence
→ successful hit
→ Player Raw Damage
→ Boss Final Armor Defence
→ Damage Result
→ HP Damage if positive
→ Boss HP clamp at 0
→ HP 0 = immediate defeated
```

Monster / Boss AI is not implemented. The GM explicitly selects Skills and targets.

## Monster Defence / Armor MVP

Simplified Monster defence is explicitly split into two layers:

```text
D100 Defence
= Dedicated Stored Defence

Post-hit Effective Defence
= Armor / other fixed defence sources
```

Template data:

```text
Stored Defence
Armor Name
Armor Defence
Armor Notes
```

Spawned Instance data:

```text
Stored Defence snapshot
Defence Modifier
Effective D100 Defence
Armor Name snapshot
Armor Base Defence snapshot
Armor Defence Adjustment
Final Armor Defence
```

Runtime D100 calculation:

```text
Modified Defence
= Stored Defence + Defence Modifier

Effective D100 Defence
= min(100, Modified Defence)
```

Stored Defence may exceed 100 and does not automatically scale with Monster Level.

Armor is intentionally separate from the D100 opposed check. After a successful hit, the shared Damage Result model uses the Monster's Final Armor Defence as the current MVP fixed defence contribution.

See `docs/MONSTER_DEFENCE_ARMOR_MVP.md`.

## Ordinary Monster HP0 / Defeat MVP

Ordinary Simplified Monsters do not inherit Player DYING rounds.

```text
Current HP > 0
→ status = active

Current HP <= 0
→ HP = 0
→ status = defeated immediately
```

A defeated Monster:

```text
cannot use ordinary Action / Move
cannot use ordinary Monster Skill attacks
cannot be selected as a normal living hostile target
cannot join a new Combat as an active Monster
```

Its Combatant row may remain in an existing Combat for initiative / audit history. Combat and Encounter completion remain GM-controlled.

GM corrective HP changes reconcile `active` / `defeated`; `removed` remains a separate state and is never auto-revived by ordinary HP correction.

See `docs/MONSTER_DEFEAT_MVP.md`.

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
→ Defence / Armor snapshot
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

## Boss Design Profile / Instance MVP

Bosses have a dedicated GM authoring workspace but reuse ordinary Monster mathematics rather than a second combat engine.

```text
Boss Design Profile
→ Monster-style Calculated Baseline
→ GM Override
→ Final Boss Values
→ Spawn Boss Instance
→ snapshot current Final Boss Values
```

No universal Boss multiplier is defined.

Boss Profile data includes:

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

Unique Boss Skills are still Monster Skill Profiles (`source_scope = boss`) and use the same Accuracy / Damage / Attribute-link / Spread mathematics.

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

Phase MVP supports optional HP-percentage thresholds as an applicability signal plus explicit GM manual Phase control. It does not automatically force irreversible transitions.

### Boss HP0 / Defeat

Boss HP0 uses the confirmed default lifecycle:

```text
Current HP > 0
→ status = active

Current HP <= 0
→ HP = 0
→ status = defeated immediately
```

Bosses do not inherit Player DYING. Lethal damage does not automatically enter a final Phase unless a future explicit Boss mechanic defines such an exception.

A defeated Boss loses ordinary Action / Move, cannot use normal Boss Skill attacks, and cannot be selected as a normal active hostile target. Its Combatant record may remain for initiative / audit history. Combat and Encounter completion remain GM-controlled.

GM corrective HP changes reconcile `active` / `defeated`; `removed` remains separate and is not auto-revived by ordinary HP correction.

See `docs/BOSS_DESIGN_PROFILE_ALPHA.md`, `docs/BOSS_RUNTIME_MVP.md`, and `docs/BOSS_DEFEAT_MVP.md`.

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

All three participant types have runtime persistence and executable combat participation for the minimum MVP path.

For MVP, one Encounter may link to zero or one Combat. Combat ending and Encounter resolution remain separate GM-controlled actions. A full tactical Map engine remains Deferred; current Map support is metadata only.

See `docs/FIRST_END_TO_END_SCENARIO_PLAYTEST.md` for the first combined integration milestone and its invariants.

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
node tests/boss-life.test.mjs
node tests/static-ui-contract.test.mjs
node tests/boss-defeat-contract.test.mjs
node tests/deployment-contract.test.mjs
node tests/mvp-scenario-e2e.test.mjs
```

`tests/mvp-scenario-e2e.test.mjs` is the permanent combined source-level regression gate for the Scenario → Encounter → Character/Monster/Boss → Combat → defeat lifecycle path. It also protects the Boss Encounter-start preflight / partial-start cleanup invariant.

`tests/deployment-contract.test.mjs` protects the main-only Cloudflare deployment gate, secret-name references and production Wrangler contract.

Pull requests and feature-branch pushes run the validation suite but do not deploy production.

## Deployment

Cloudflare production deployment is automated by `.github/workflows/mvp-checks.yml`.

```text
push to main
→ node-checks SUCCESS
→ Deploy Cloudflare production
→ npx --yes wrangler@4 deploy
```

The deployment job reads these GitHub Actions repository secrets:

```text
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
```

It deploys Worker `dnd`, the `./public` static assets, D1 binding `DB → dnd-db`, and the custom domain `dungeon-and-dragon.lchjames.com` according to `wrangler.jsonc`.

The automatic path was verified successfully on 2026-08-25. Manual Wrangler deployment is now fallback-only for CI/CD recovery or controlled rollback.

Do **not** blindly replay every file in `schema/` against an existing production D1 database; later additive schema paths include guarded runtime initialization and some reference SQL is non-idempotent. See `docs/PRODUCTION_RELEASE_ALPHA.md` for the Canonical release and rollback procedure.

## Current direction

The minimum source-level MVP vertical slice is implemented and protected by CI:

```text
Character D100 / Damage / HP0 resolver              implemented MVP path
Scenario / Scene / Encounter Foundation             implemented MVP foundation
Monster Template / Skill / Instance runtime         implemented
Monster Dedicated Defence + Armor                   implemented
Monster HP0 + Player ↔ Monster combat loop          implemented
Boss Profile / Boss Instance runtime                 implemented MVP path
Boss HP0 + Player ↔ Boss combat loop                 implemented MVP path
First Scenario end-to-end integration gate          implemented
Automatic Cloudflare production deployment          verified
```

The project is now in **Alpha Integration / Usability Tuning**. The next validation is a live browser + production D1 Scenario session that exercises the complete flow with real Character, Monster and Boss data.

Advanced Monster/Boss AI, exact balance curves, full tactical Map rules, economy, loot and Quest automation remain later work unless they become a concrete Alpha blocker.
