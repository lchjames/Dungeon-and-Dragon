# Production Alpha Live Playtest

> Status: **VERIFIED — authorised production E2E completed successfully**  
> Verified: 2026-08-26  
> Scope: deployed Worker + production D1 with separate GM/Admin and Player sessions.

## Verified production execution

The Alpha Integration Gate completed successfully against the direct production Worker on 2026-08-26.

Verified workflow run:

```text
Production Alpha Live Playtest
run: 32920792372
job: 98036693943
revision: 2582627cb9f3cd66448dcf4350dc6837d830b5a8
runId: alpha-e2e-260826-021158
```

The runner returned `ok: true` and confirmed every required exercised flag:

```json
{
  "monsterToCharacter": true,
  "bossToCharacter": true,
  "bossManualPhase2": true,
  "playerToMonsterDefeat": true,
  "playerToBossDefeat": true,
  "combatEnded": true,
  "encounterResolved": true,
  "scenarioArchived": true
}
```

The final production blocker was a shared Request-body routing defect: the outer Boss attack router consumed the Player attack POST body before delegating non-Boss targets to the downstream Monster resolver. The fix changed the Boss router to inspect `request.clone()`, preserving the original body for downstream delegation. A regression contract now protects that boundary.

## Purpose

Source-level E2E tests already protect the Scenario → Encounter → Combat contracts. This live gate exists to catch problems that CI cannot prove: deployed route behaviour, cookies, production D1 schema/data compatibility, real session separation and runtime persistence.

The executable runner is:

```text
scripts/production-alpha-e2e.mjs
```

It is **plan-only by default**. It will not contact production or write data unless `DND_ALPHA_EXECUTE=1` is explicitly supplied.

A manual GitHub Actions entrypoint is also provided:

```text
.github/workflows/production-alpha-live.yml
```

That workflow never accepts the GM password as a workflow input. It reads only the repository secret `DND_ALPHA_GM_PASSWORD` and fails before the live runner starts when the secret is missing.

Normal `main` deployment does not execute this production-writing playtest. Live execution remains an explicit operator action.

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

The live runner and workflow have the following safeguards:

- require explicit manual execution before production-writing mode is entered;
- require `DND_ALPHA_EXECUTE=1` before the runner makes any network request;
- require `DND_ALPHA_GM_PASSWORD` at execution time;
- do not accept the GM password as a normal workflow-dispatch input;
- never commit or print the GM password;
- create a fresh timestamped `alpha-e2e-*` Player/content set;
- use separate GM and Player session cookie jars;
- abort before creating test data when an active Combat already exists;
- cap repeated Player attack attempts;
- do not issue broad D1 deletes or hard-delete unrelated campaign data;
- archive the test Scenario after success;
- serialize manual live runs through a dedicated GitHub Actions concurrency group.

Because the current Canonical application does not expose broad destructive cleanup APIs, successful or failed live runs may leave clearly named `alpha-e2e-*` audit/test entities in D1. They are deliberately identifiable and must not be cleaned up with unscoped SQL.

## Run commands

Plan-only / CI-safe check:

```bash
node scripts/production-alpha-e2e.mjs
```

Authorised production write run from a trusted shell:

```bash
DND_ALPHA_EXECUTE=1 \
DND_ALPHA_GM_USERNAME=gm \
DND_ALPHA_GM_PASSWORD='<operator-supplied password>' \
node scripts/production-alpha-e2e.mjs
```

### GitHub Actions live run

Configure this repository secret before using the manual workflow:

```text
DND_ALPHA_GM_PASSWORD
```

Then run **Production Alpha Live Playtest** from GitHub Actions. The workflow has optional non-secret inputs for a custom `run_id` and maximum attack attempts. The Admin password itself must remain in the repository secret and must not be copied into the workflow YAML or dispatch inputs.

Optional runner variables:

```text
DND_ALPHA_BASE_URL
DND_ALPHA_RUN_ID
DND_ALPHA_PLAYER_NAME
DND_ALPHA_PLAYER_KEY
DND_ALPHA_MAX_ATTACK_ATTEMPTS
```

The default base URL is the direct production Worker URL rather than the custom domain so a Cloudflare managed browser challenge cannot invalidate a server-side Alpha test.

## Completion rule

Do not mark the live Alpha integration milestone complete merely because the script/workflow exists or passes syntax checks.

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

The 2026-08-26 verified run above satisfies this completion rule. Future production failures remain Alpha blockers and must be diagnosed before the affected gameplay subsystem is treated as production-valid.

## Separate Status application live verification

The previous recorded live runs do not establish Status application or authenticated Player Status projection coverage. `scripts/production-alpha-status-application-live.mjs` now provides an executable, independent gate for that slice. No authorised production execution of this gate is recorded here yet.

Normal CI runs it in plan-only mode with no network requests and separately exercises the actual Worker API chain through local HTTP and in-memory SQLite. Local coverage checks normal/doubled application, exact idempotent retry, NO_STACK blocking, blocked/unresolved rejection, stale Definition/Profile rejection, Player ownership/GET-only projection, unchanged resources/Skills, session logout and refusal during active Combat. It is not Cloudflare D1 production evidence.

To run against production, an authorised operator selects `main` in the **Production Alpha Status Application Verification** workflow and sets `confirm_production_writes` to true. The workflow uses the existing `DND_ALPHA_GM_PASSWORD` repository secret, the direct production Worker origin and `DND_ALPHA_STATUS_EXECUTE=1`. Optional `run_label` accepts 1–10 letters, digits, underscores or hyphens. The generic `DND_ALPHA_EXECUTE` switch does not activate this runner or change the existing plan-only Status descriptors.

Each run adds an unpredictable namespace, creates two separate test Players and active Characters through normal APIs, and creates its own Status Definitions, Profiles, opposed checks, Settlements and application ledger entries. It refuses fixture creation when Combat is already active. The manual workflow shares the broader Alpha live workflow's concurrency group; this does not lock out interactive GM activity, so run it during a quiet maintenance window.

On success or an ordinary failure, scoped best-effort cleanup removes only the run's active Status instances, marks only its own Definitions/Profiles INACTIVE and logs out only its own sessions. Test accounts, Characters and immutable audit/ledger records are deliberately retained. This is retirement, not a database rollback. An abrupt process/job termination or lost write response may leave fixtures behind; record the reported run namespace and inspect it rather than deleting unrelated data. Cleanup errors fail the gate. API POST requests are never automatically retried.

Treat the slice as live-verified only after the authorised production workflow returns `ok: true`, `mode: "production-live"`, `productionWrites: true`, all eight checks and no cleanup errors. Preserve its tested revision and workflow/run ID as evidence; deployment/smoke success alone does not meet this rule.
