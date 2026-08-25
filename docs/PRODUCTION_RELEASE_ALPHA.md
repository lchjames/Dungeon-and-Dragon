# Production Release — Alpha

> Status: Canonical Alpha Operations Checklist  
> Date: 2026-08-25  
> Purpose: Safely publish the current playable MVP source to the Cloudflare Worker / D1 production environment and verify the first live Alpha session without confusing GitHub merge state with deployment state.

---

# 1. Source Release Checkpoint

Automatic production deployment was first verified on:

```text
Repository: lchjames/Dungeon-and-Dragon
Branch: main
Commit: 9449d184b495d9d5867a426dbe5ab1a4980cef2e
Production Worker: dnd
Production URL: https://dungeon-and-dragon.lchjames.com
First verified Cloudflare Version ID: 59c03d9f-d104-4e17-be87-9dcafb6e25fa
```

The deploy target is always the exact `main` commit that has just passed the `MVP checks` workflow. The SHA and Version ID above are historical proof that the automatic path was successfully exercised; they are not permanent pointers to the latest release.

GitHub `main` alone is not deployment proof. A release is published only after the `Deploy Cloudflare production` job succeeds for that `main` commit.

---

# 2. Production Wrangler Contract

`wrangler.jsonc` must continue to identify:

```text
Worker name: dnd
Worker entry: ./src/boss-defeat.js
D1 binding: DB
D1 database: dnd-db
D1 database ID: 7a9abf7b-5f87-4295-89b1-8187e991b782
Custom domain: dungeon-and-dragon.lchjames.com
Static assets: ./public
```

Do not deploy from a branch whose Wrangler entry or D1 binding differs unintentionally from this contract.

---

# 3. Schema Safety Rule

Do **not** blindly execute every file under `schema/` against an existing production D1 database.

Some reference / migration SQL is intentionally non-idempotent. For example, additive migrations may contain direct:

```sql
ALTER TABLE ... ADD COLUMN ...;
```

and will fail if replayed after the column already exists.

The current runtime contains guarded additive schema initialization where later features need to extend an existing table. Example pattern:

```text
PRAGMA table_info(table)
→ if column missing
→ ALTER TABLE ADD COLUMN
```

Therefore the current established production update path is:

```text
verified current main
→ MVP checks pass
→ GitHub Actions deploys Worker + assets
→ automated unauthenticated production smoke validates public/auth boundaries
→ authenticated smoke requests exercise the guarded runtime paths
→ inspect any D1/runtime error before considering manual schema intervention
```

A future dedicated migration ledger may replace this approach. Until then, do not bulk-replay the schema directory on an existing D1 database.

For a completely new blank D1 database, use the repository schema files deliberately in dependency order or use the runtime initialization paths; do not treat a fresh-database bootstrap as the same operation as an existing-production upgrade.

---

# 4. GitHub Deployment Credentials

Automatic production deployment uses GitHub Actions repository secrets:

```text
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
```

The API token must have the minimum Cloudflare permissions required for this Worker deployment, including:

```text
Account → Workers Scripts → Edit
Zone → Workers Routes → Edit
```

The token is scoped to the intended Cloudflare account and `lchjames.com` zone.

Never commit either secret value into GitHub files, Markdown, Worker source or static assets. Workflow YAML may reference the secret names only.

Initial GM provisioning remains a separate Worker secret:

```text
INITIAL_GM_PROVISION_TOKEN
```

Only configure / use that secret when the production environment still has no `gm/admin` User. Normal deployments do not require re-running `/gm/setup/` after the first GM exists.

---

# 5. Automatic Deployment Gate

`.github/workflows/mvp-checks.yml` owns validation, production publish and the unauthenticated production smoke gate.

The required flow is:

```text
push / pull_request
→ node-checks

only when:
- event = push
- branch = main
- node-checks = success

→ Deploy Cloudflare production
→ Smoke test production routes
```

The production job:

```text
checks out the exact main commit
uses Node 22
validates that both Cloudflare secrets are present
runs npx --yes wrangler@4 deploy
runs the production route smoke against the custom domain
```

Pull requests and feature-branch pushes must never deploy production.

The production deployment uses a `cloudflare-production` concurrency group with `cancel-in-progress: false`, so a later push does not cancel an already-running publish halfway through.

---

# 6. Manual Deployment Fallback

Automatic GitHub deployment is the normal Alpha path. Manual deployment is fallback-only for CI/CD recovery or controlled rollback.

From a clean checkout of a verified commit:

```bash
npx --yes wrangler@4 deploy
```

with valid Cloudflare credentials in the execution environment.

The deployment output must identify the intended Worker / custom domain rather than a test Worker or unrelated Cloudflare account.

Do not treat local source tests as deployment success; use Wrangler / GitHub Actions deployment completion as the publish boundary.

---

# 7. Immediate Post-Deploy Smoke Test

Every successful production deploy now performs an automated unauthenticated production smoke against:

```text
https://dungeon-and-dragon.lchjames.com/
https://dungeon-and-dragon.lchjames.com/player/login/
https://dungeon-and-dragon.lchjames.com/player/
https://dungeon-and-dragon.lchjames.com/gm/
https://dungeon-and-dragon.lchjames.com/api/auth/me
```

Expected automated contract:

```text
GET /
→ 2xx

GET /player/login/
→ 2xx

GET /player/
→ 302 to /player/login/

GET /gm/
→ 302 to /player/login/ with GM next-path context

GET /api/auth/me
→ 401 when no session cookie is supplied
```

The smoke uses bounded retries so short Cloudflare propagation delay does not create a false deployment failure. A route returning an unexpected status, a broken auth redirect, unresolved production domain or 5xx response fails the production job.

This automated smoke does **not** replace the authenticated browser test. After deployment, a real Player and GM session must still verify:

```text
Player User
→ Player workspace
→ cannot gain GM routes

GM User
→ GM workspace
→ Story / Monsters / Bosses / Combat views load
```

A 500 / 503 on an authenticated feature route remains a release blocker until its D1/runtime cause is understood.

---

# 8. Live Alpha Vertical Slice

Run one intentionally small live Scenario using disposable / Alpha data where possible:

```text
1. Confirm one active Character
2. Create Scenario
3. Create Scene
4. Create Encounter
5. Assign Character participant
6. Create / select Monster Template + Skill
7. Spawn one Monster Instance
8. Create / select simple Boss Profile
9. Spawn one Boss Instance
10. Start Encounter Combat
11. Confirm Character + Monster + Boss shared Initiative
12. Exercise Player own-turn controls
13. Exercise Monster → Character attack
14. Exercise Player → Monster attack
15. Exercise Boss → Character attack
16. Exercise Player → Boss attack
17. Confirm Armor is post-hit Damage reduction, not D100 Defence
18. Confirm Character HP0 uses DYING
19. Confirm Monster HP0 immediately becomes defeated
20. Confirm Boss HP0 immediately becomes defeated
21. Exercise one Boss Phase applicability / manual Phase control path before defeat where practical
22. GM End Combat
23. Mark Encounter resolved and enter Resolution Notes
24. Continue / complete Scene as appropriate
```

Do not use the live Alpha session to invent new rules. Record failures as integration, data, UX or tuning defects unless a genuinely missing Canonical rule is discovered.

---

# 9. Pass Criteria

The release is suitable for continued Alpha use when:

```text
MVP checks succeed on the deployed main commit
Deploy Cloudflare production succeeds
automated unauthenticated production smoke succeeds
production routes load
D1-backed reads/writes succeed
GM and Player authorization boundaries hold
Scenario / Scene / Encounter data persists after refresh
Monster / Boss Instance data persists after refresh
one shared Combat starts with all expected combatants
Player / Monster / Boss turns resolve without stale-state corruption
HP / Armor / defeat states persist correctly
Combat can be ended by GM
Encounter can subsequently be resolved
no unexpected 500 / 503 remains unexplained
```

UI friction that does not corrupt authoritative data may be recorded for Alpha usability tuning rather than blocking the release.

---

# 10. Failure / Rollback Boundary

If automatic deployment fails:

```text
MVP checks failure
→ do not deploy

credential / Wrangler deployment failure
→ main remains source-of-truth, but production stays on the previous successful Worker version
→ inspect GitHub Actions deploy log

post-deploy production smoke failure
→ Worker publish may already have completed
→ treat production parity as unverified
→ inspect route/status/auth failure immediately
→ rollback or hotfix if the failure is production-blocking
```

If deployment succeeds but introduces a production-blocking runtime error:

```text
stop live data mutation
capture failing route + error code/message
identify whether failure is Worker source, static asset, auth or D1 schema/data
```

Do not attempt random SQL changes against production as a first response.

If the defect is source-only and the previous Worker version was healthy, use Cloudflare deployment/version rollback or redeploy the last known-good source commit according to the available Cloudflare operational tooling.

D1 data changes are a separate boundary from Worker rollback. Rolling back Worker source does not automatically roll back D1 writes.

---

# 11. Current Operational Status

Automatic deployment is verified operational; the automated route smoke is the next production gate being added:

```text
GitHub MVP feature construction: complete for first vertical slice
Scenario E2E source regression: passing
GitHub Actions Cloudflare credentials: configured and validated
Automatic production deployment: verified working
Worker: dnd
D1 binding: env.DB → dnd-db
Custom domain deployment: verified by Wrangler
Feature / PR pushes: deployment correctly skipped
main push after successful MVP checks: production deployment enabled
automated unauthenticated production smoke: required after each deploy
Authenticated live browser + production D1 Alpha session: next validation stage
```
