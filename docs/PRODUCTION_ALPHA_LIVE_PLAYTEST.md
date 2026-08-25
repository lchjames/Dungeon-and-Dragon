# Production Alpha Live Playtest

> Status: **Alpha Integration Gate — executable runner added; live write run still requires an authorised operator session**  
> Date: 2026-08-25  
> Scope: validate the deployed Worker + production D1 with separate GM/Admin and Player sessions.

## Purpose

Source-level E2E tests already protect the Scenario → Encounter → Combat contracts. This live gate exists to catch problems that CI cannot prove: deployed route behaviour, cookies, production D1 schema/data compatibility, real session separation and runtime persistence.

The executable runner is:

```text
scripts/production-alpha-e2e.mjs
```

It is **plan-only by default**. It will not contact production or write data unless `DND_ALPHA_EXECUTE=1` is explicitly supplied.

## Live flow

The runner performs one isolated Alpha session using two independent cookie jars:

```text
GM/Admin login
→ confirm role = admin
→ refuse to continue if an active Combat already exists
→ preflight Story / Monster / Boss GM APIs

separate Player registration
→ Character Attribute roll
→ Draft Character
→ allocate all 200 Creation Skill Points
→ Finalize Character

GM creates active Player Attack Profile
→ Scenario
→ Scene
→ Encounter
→ assign Character participant
→ create zero-damage Monster Skill
→ create/spawn disposable Monster
→ create disposable Boss Profile
→ create zero-damage Boss Skill
→ define two Boss Phases
→ spawn Boss
→ Start Encounter Combat

shared Initiative must contain
Character + Monster Instance + Boss Instance

GM forces Monster Turn
→ Monster → Character attack resolver

GM forces Boss Turn
→ manual Boss Phase 2
→ Boss → Character attack resolver

Player Turn
→ Player → Monster until defeated
→ later Player Turn
→ Player → Boss until defeated

GM End Combat
→ Resolve Encounter
→ Archive Scenario
```

The hostile test Skills intentionally deal zero damage so the live validation cannot accidentally kill the disposable Player Character. The Player Attack Profile is intentionally strong and the disposable hostile HP/Armor values are kept low so defeat lifecycle checks complete quickly.

## Safety gates

The live runner has the following safeguards:

- requires `DND_ALPHA_EXECUTE=1` before any network request;
- requires `DND_ALPHA_GM_PASSWORD` at execution time;
- never commits or prints the GM password;
- creates a fresh timestamped `alpha-e2e-*` Player/content set;
- uses separate GM and Player session cookie jars;
- aborts before creating test data when an active Combat already exists;
- caps repeated Player attack attempts;
- does not issue broad D1 deletes or hard-delete unrelated campaign data;
- archives the test Scenario after success.

Because the current Canonical application does not expose broad destructive cleanup APIs, successful or failed live runs may leave clearly named `alpha-e2e-*` audit/test entities in D1. They are deliberately identifiable and must not be cleaned up with unscoped SQL.

## Run commands

Plan-only / CI-safe check:

```bash
node scripts/production-alpha-e2e.mjs
```

Authorised production write run:

```bash
DND_ALPHA_EXECUTE=1 \
DND_ALPHA_GM_USERNAME=gm \
DND_ALPHA_GM_PASSWORD='<operator-supplied password>' \
node scripts/production-alpha-e2e.mjs
```

Optional variables:

```text
DND_ALPHA_BASE_URL
DND_ALPHA_RUN_ID
DND_ALPHA_PLAYER_NAME
DND_ALPHA_PLAYER_KEY
DND_ALPHA_MAX_ATTACK_ATTEMPTS
```

The default base URL is the direct production Worker URL rather than the custom domain so a Cloudflare managed browser challenge cannot invalidate a server-side Alpha test.

## Completion rule

Do not mark the live Alpha integration milestone complete merely because this script exists or passes syntax checks.

It becomes complete only after an authorised execution returns:

```json
{
  "ok": true,
  "exercised": {
    "monsterToCharacter": true,
    "bossToCharacter": true,
    "bossManualPhase2": true,
    "playerToMonsterDefeat": true,
    "playerToBossDefeat": true,
    "combatEnded": true,
    "encounterResolved": true,
    "scenarioArchived": true
  }
}
```

Any production failure becomes an Alpha blocker to diagnose before adding another major gameplay subsystem.
