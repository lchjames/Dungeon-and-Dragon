# D&D Campaign Hub

Production source repository for `https://dungeon-and-dragon.lchjames.com`.

The project is currently in **Alpha Integration / Usability Tuning**. The minimum Character → Scenario → Encounter → Monster/Boss → Combat vertical slice has been exercised successfully against the deployed Cloudflare Worker and production D1 with separate Admin and Player sessions. The production Alpha live gate is therefore **verified**, not pending.

## Current architecture

The application is a Cloudflare Worker + Static Assets + D1 Campaign Hub.

Primary routes:

- `/player/login/` — Player-only login with visible User name + 4-digit Key
- `/player/register/` — create a normal `player` User
- `/player/` — protected Player workspace backed by D1
- `/gm/login/` — dedicated Admin login
- `/gm/setup/` — **retired** public provisioning route; redirects to `/gm/login/`
- `/gm/` — protected D1-authoritative GM workspace; GM = Admin

Current Worker entry from `wrangler.jsonc`:

```text
src/hostile-combat-movement-gateway.js
```

The Worker is intentionally layered. The current outer-to-inner chain includes:

```text
hostile-combat-movement-gateway.js
→ runtime-door-gateway.js
→ player-map-gateway.js
→ player-map.js
→ runtime-map.js
→ world-map-editor.js
→ world-map.js
→ player-monster-audit-compat.js
→ admin-gateway.js
→ admin-auth.js
→ boss-defeat.js
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

Each layer handles scoped routes and delegates unrelated requests down the chain.

`admin-gateway.js` owns the dedicated Admin password login runtime. `admin-auth.js` is the outer identity/authorization boundary below it: Player and Admin authentication remain separate, `/gm/*` and `/api/gm/*` are Admin-only, Player routes are Player-only, and public Admin provisioning is disabled.

`player-monster-audit-compat.js` is a permanent additive compatibility boundary for the long-lived production `player_monster_action_log` table. It may add missing audit columns/indexes required by the current Player → Monster resolver; it does not perform the temporary production failure diagnostics that were used while bringing the first live Alpha E2E online.

`gm-provision.js` remains in the historical gateway chain only as a compatibility tombstone. The authoritative security boundary rejects public Admin setup and Player → Admin promotion.

## D1 authority

Cloudflare D1 is the authoritative source for implemented campaign and gameplay state.

Production binding:

- binding: `DB`
- database: `dnd-db`
- database ID: `7a9abf7b-5f87-4295-89b1-8187e991b782`

Authoritative areas currently include:

- users and server-side sessions
- Character ownership, EXP, derived Level, Attributes, HP / MP
- 23 basic Skills and Creation Skill progression
- inventory and notes
- GM-approved Player Attack Profiles
- Character life state: alive / dying / dead
- Combat identity, combatants, Initiative, Round / Turn state
- one Action + one Move allowance per Combatant
- Character-vs-Character D100 attack / Dodge resolution
- shared damage resolution and Character HP0 / DYING baseline
- Scenario / Scene / Encounter structure and participants
- Encounter → optional Combat link
- Monster Templates, Skills, loadouts and spawned Instances
- Monster resource, Spread, Defence and Armor snapshots / overrides
- Monster → Character and Player → Monster attack audit
- ordinary Monster active / defeated / removed lifecycle
- Boss Design Profiles, Final overrides, Skills and Phases
- spawned Boss Instances and runtime Phase state
- Boss → Character and Player → Boss attack audit
- Boss active / defeated / removed lifecycle
- World Locations and reusable Map Templates
- Map Cell walkability, Edges, Doors, Zones and Spawn Points
- Scene → Map bindings
- runtime Map snapshots / Instances and entity positions
- Player tactical movement
- GM-controlled Monster/Boss tactical movement and runtime door state

Reference / migration SQL lives under `schema/`. Runtime compatibility code is additive where an existing production table must be upgraded safely.

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

## GM / Admin security model

GM = Admin. Admin identity is not a Player subtype and does not use the Player 4-digit Key credential.

Canonical persistent roles:

```text
player
admin
```

Legacy `role = gm` rows are migration input only and may be normalized to `admin`; new writes must not create `gm`.

Authentication boundaries:

```text
/player/login/
→ Player User + 4-digit Key
→ role = player only

/gm/login/
→ preconfigured Admin Username + dedicated password credential
→ role = admin only
```

Normal Player registration always creates `role = player` and can never promote itself to Admin.

### Admin assignment is operator-only

GM/Admin accounts are **not publicly creatable**. If an Admin identity must be created or replaced, an authorised operator must do it through a trusted deployment/database administration boundary.

The public application may authenticate an already configured Admin, but it may not:

```text
create Admin
promote Player to Admin
reset a legacy GM into a valid Admin credential
expose a provisioning token form
```

Retired public provisioning behaviour:

```text
/gm/setup/
→ redirect to /gm/login/

POST /api/admin/setup
→ 410 ADMIN_PROVISIONING_DISABLED

POST /api/admin/provision-initial-gm
→ 410 ADMIN_PROVISIONING_DISABLED
```

The operator-assigned Alpha `gm` account remains an explicit compatibility exception for its two-character username and eight-character Alpha password. Its credential is now persisted only in production D1; the temporary deterministic runtime seed and embedded hash/salt were removed after the live gate succeeded.

The Canonical permanent Admin contract remains stronger than the Alpha compatibility account. The current Workers/workerd PBKDF2 ceiling means the production Admin KDF still requires a Workers-compatible stronger long-term design before Alpha exit; the temporary 100,000-iteration Alpha credential must not become the permanent security standard.

Admin and Player sessions are server-side D1 sessions exposed through Secure + HttpOnly + SameSite=Lax cookies, while route authorization remains role-specific.

See `docs/GM_INITIAL_PROVISIONING_MVP.md` for the authoritative security contract.

## Current GM workspace

The GM workspace currently supports:

- D1 User / Character roster and Character detail
- EXP correction and derived Level recalculation
- Current HP / MP correction
- Character Attack Profile authoring
- Scenario / Scene / Encounter authoring
- Character Encounter participant assignment
- Common Monster Skill authoring
- Monster Template authoring
- Common Skill loadout assignment to Templates
- spawning Monster Instances into open Encounters
- Monster resource / Spread / Defence / Armor corrections
- dedicated Boss Design Profile authoring
- calculated Boss baseline vs GM Final override audit
- Common + Unique Boss Skill loadouts
- Boss Phase definitions
- Boss Instance spawn / runtime corrections
- manual Boss Phase control
- Encounter → Combat start
- Combat creation / control
- GM-controlled Monster Turn attack resolution
- GM-controlled Boss Turn attack resolution
- World Location / Map Template authoring
- Map Cell / Edge / Door / Zone / Spawn Point editing
- Scene → Map binding
- runtime Map creation and entity placement
- runtime Door control
- GM-controlled Monster/Boss movement

The old localStorage GM Character editor is not an authoritative MVP path.

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
→ Damage Center + signed Spread
→ shared Damage pipeline
→ Character HP / DYING / DEAD integration
```

Player → Monster flow:

```text
Player selects approved Attack Profile + active Monster target
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

Boss participants must still be `active` with `Current HP > 0` before Encounter Combat start. If later Boss augmentation fails after a lower-layer Combat link was created, the hardened gateway attempts to end that partial Combat and unlink it so the Encounter can be corrected and retried.

On a Boss Turn:

```text
GM selects snapshotted Boss Skill + living Character target
→ Boss Effective Accuracy vs Character Dodge
→ shared opposed D100
→ Damage Center + signed Spread
→ shared Damage pipeline
→ Character HP / DYING / DEAD integration
```

Player → Boss uses the same opposed D100 + separate Armor reduction model as Player → Monster.

Monster / Boss AI is not implemented. The GM explicitly selects Skills, targets and hostile movement.

## Tactical Map Alpha

Map support is no longer metadata-only. The current Alpha includes a grid-based World/Runtime Map path:

```text
World Location
→ Map Template
→ Cells / Edges / Doors / Zones / Spawn Points
→ Scene Map Binding
→ Runtime Map Instance
→ Entity positions
→ Player / hostile movement
→ runtime Door state
```

Current movement is discrete adjacent-cell movement with walkability, occupied-cell, wall/door and diagonal-corner checks. Advanced line-of-sight, fog-of-war, pathfinding/AI navigation, ranged distance rules and a final encounter-scale tactical UX remain later Alpha work unless they become blockers.

## Monster Defence / Armor MVP

Simplified Monster defence is split into two layers:

```text
D100 Defence
= Dedicated Stored Defence

Post-hit Effective Defence
= Armor / other fixed defence sources
```

Runtime D100 calculation:

```text
Modified Defence
= Stored Defence + Defence Modifier

Effective D100 Defence
= min(100, Modified Defence)
```

Stored Defence may exceed 100 and does not automatically scale with Monster Level. Armor is separate from the D100 opposed check and contributes to the post-hit Damage Result.

See `docs/MONSTER_DEFENCE_ARMOR_MVP.md`.

## Monster lifecycle and runtime

Ordinary Simplified Monsters do not inherit Player DYING rounds.

```text
Current HP > 0
→ status = active

Current HP <= 0
→ HP = 0
→ status = defeated immediately
```

A defeated Monster loses ordinary Action / Move, cannot attack, cannot be selected as a normal living hostile target and cannot join a new Combat as an active Monster. Combat and Encounter completion remain GM-controlled.

Ordinary Monster spawn follows:

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
→ damage / Spread snapshot
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

Exact Level → Spread tuning remains Alpha Tuning and GM Instance-Skill Final Spread overrides remain authoritative for content tuning.

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

Boss Profile data includes Natural Attributes + Growth Weights, calculated Effective Attributes, optional Final Attribute overrides, calculated / Final HP and MP, Final Stored Defence, Final Armor, Common + Unique Skills and ordered Phase definitions.

Spawned Boss Instances own runtime Current HP / MP, Defence / Armor adjustments, Current Phase, Phase hold state, snapshotted Skills and snapshotted Phase definitions. Profile edits do not silently mutate existing Instances.

Phase MVP supports optional HP-percentage thresholds as an applicability signal plus explicit GM manual Phase control; it does not automatically force irreversible transitions.

Boss HP0 follows the ordinary hostile lifecycle:

```text
Current HP > 0
→ active

Current HP <= 0
→ HP 0
→ defeated immediately
```

Bosses do not inherit Player DYING unless a future explicit Boss mechanic defines an exception.

See `docs/BOSS_DESIGN_PROFILE_ALPHA.md`, `docs/BOSS_RUNTIME_MVP.md` and `docs/BOSS_DEFEAT_MVP.md`.

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

All three participant types have runtime persistence and executable combat participation for the minimum MVP path. One Encounter may link to zero or one Combat. Combat ending and Encounter resolution remain separate GM-controlled actions.

## Production Alpha live gate

The production-writing runner is `scripts/production-alpha-e2e.mjs`, with manual GitHub Actions entrypoint `.github/workflows/production-alpha-live.yml`.

It is plan-only by default and writes to production only when explicitly operator-triggered with the Admin credential supplied through the repository secret.

The live gate was verified on 2026-08-26 against the direct production Worker + production D1. The verified flow exercised:

```text
Admin login / admin role
separate Player registration/session
Character creation + 200-point finalization
GM Attack Profile authoring
Scenario / Scene / Encounter setup
Monster create/spawn
Boss create/phases/spawn
shared Character + Monster + Boss Initiative
Monster → Character attack
Boss → Character attack
manual Boss Phase 2
Player → Monster defeat
Player → Boss defeat
Combat end
Encounter resolve
Scenario archive
```

All required runner assertions returned `true`.

After that success, the temporary deterministic Alpha GM runtime seed and embedded credential material were removed. A second full live E2E on revision `a10b5074fcd9e3be67239a691cf247d8ec641235` again returned `ok: true`, proving the persisted production D1 Admin credential and normal runtime path work without automatic reseeding.

See `docs/PRODUCTION_ALPHA_LIVE_PLAYTEST.md` for the detailed gate and recorded run evidence.

## Automated checks

GitHub Actions runs `.github/workflows/mvp-checks.yml` on branch pushes and pull requests. The suite includes JavaScript syntax checks, the plan-only production runner safety gate, rules/combat/Monster/Boss regressions, static/deployment contracts and source-level Scenario E2E coverage.

Key permanent gates include:

- `tests/admin-auth-contract.test.mjs` — Player/Admin identity split and public provisioning lockdown
- `tests/deployment-contract.test.mjs` — production deployment boundaries, Admin seed removal and additive D1 compatibility
- `tests/mvp-scenario-e2e.test.mjs` — Scenario → Encounter → Character/Monster/Boss → Combat lifecycle
- `scripts/production-alpha-e2e.mjs` — plan-only in normal CI; production writes only through explicit operator execution

## Deployment

Cloudflare production deployment is automated by `.github/workflows/mvp-checks.yml`.

```text
push to main
→ node-checks SUCCESS
→ Deploy Cloudflare production
→ npx --yes wrangler@4 deploy
→ challenge-aware production route smoke
```

The deployment job reads GitHub Actions repository secrets:

```text
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
```

It deploys Worker `dnd`, `./public` static assets, D1 binding `DB → dnd-db`, and the custom domain according to `wrangler.jsonc`.

The custom domain may return a Cloudflare managed challenge to headless CI. Deployment smoke therefore verifies custom-domain edge reachability separately and runs precise application/auth assertions against the direct `dnd.apswsttss.workers.dev` Worker URL.

Do **not** blindly replay every file in `schema/` against an existing production D1 database. Later additive schema paths include guarded runtime initialization/compatibility and some reference SQL is non-idempotent. See `docs/PRODUCTION_RELEASE_ALPHA.md`.

## Current direction

Verified / implemented Alpha baseline:

```text
Character D100 / Damage / HP0 resolver              implemented MVP path
Scenario / Scene / Encounter foundation             implemented
Monster Template / Skill / Instance runtime         implemented
Monster Dedicated Defence + Armor                   implemented
Monster HP0 + Player ↔ Monster combat loop          implemented
Boss Profile / Boss Instance runtime                implemented MVP path
Boss HP0 + Player ↔ Boss combat loop                implemented MVP path
World / Runtime Map grid foundation                 implemented Alpha path
Player + GM hostile movement                        implemented Alpha path
First Scenario source-level E2E gate                implemented
Automatic Cloudflare production deployment          verified
Player / Admin authentication separation            implemented Alpha correction
Production Alpha live E2E                            VERIFIED
Temporary Alpha GM deterministic runtime seed        removed
```

The next work should therefore be chosen from actual Alpha gameplay/usability gaps rather than continuing to treat the core production vertical slice as unverified. Advanced Monster/Boss AI, final balance curves, richer tactical Map UX/rules, economy, loot and Quest automation remain later work unless promoted into the next concrete Alpha slice.
