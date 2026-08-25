# Production Release — Alpha

> Status: Canonical Alpha Operations Checklist  
> Date: 2026-08-25  
> Purpose: Safely publish the current playable MVP source to the Cloudflare Worker / D1 production environment and verify live Alpha without confusing GitHub merge state with deployment state.

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
Worker entry: ./src/admin-auth.js
D1 binding: DB
D1 database: dnd-db
D1 database ID: 7a9abf7b-5f87-4295-89b1-8187e991b782
Custom domain: dungeon-and-dragon.lchjames.com
Workers.dev route: https://dnd.apswsttss.workers.dev
Static assets: ./public
```

The outer `admin-auth.js` gateway is part of the production security boundary. It delegates gameplay runtime to `boss-defeat.js` only after applying Player/Admin route separation.

Do not deploy from a branch whose Wrangler entry or D1 binding differs unintentionally from this contract.

---

# 3. Schema Safety Rule

Do **not** blindly execute every file under `schema/` against an existing production D1 database.

Some reference / migration SQL is intentionally non-idempotent. For example, additive migrations may contain direct:

```sql
ALTER TABLE ... ADD COLUMN ...;
```

and will fail if replayed after the column already exists.

The current runtime contains guarded additive / compatibility initialization where later features need to extend or normalize existing state. Example patterns:

```text
PRAGMA table_info(table)
→ if column missing
→ ALTER TABLE ADD COLUMN
```

and the Admin-auth correction performs a guarded legacy role normalization:

```text
legacy role = gm
→ role = admin
```

Therefore the established production update path is:

```text
verified current main
→ MVP checks pass
→ GitHub Actions deploys Worker + assets
→ custom-domain edge check
→ direct workers.dev runtime/auth smoke
→ authenticated browser smoke exercises separate Player/Admin paths
→ inspect any D1/runtime error before considering manual schema intervention
```

A future dedicated migration ledger may replace this approach. Until then, do not bulk-replay the schema directory on an existing D1 database.

For a completely new blank D1 database, use repository schema files deliberately in dependency order or use runtime initialization paths; do not treat a fresh bootstrap as the same operation as an existing-production upgrade.

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

Initial Admin provisioning is a separate Worker-secret boundary. Preferred secret name:

```text
INITIAL_ADMIN_PROVISION_TOKEN
```

During Alpha migration the existing name remains accepted as a legacy fallback:

```text
INITIAL_GM_PROVISION_TOKEN
```

The bootstrap secret is not the permanent Admin password. It is used only by `/gm/setup/` to create the first Admin or replace exactly one legacy Player-Key-backed GM credential.

Normal deployments do not require re-running setup after a fully provisioned Admin exists.

---

# 5. Player / Admin Production Identity Boundary

GM = Admin.

Production must preserve two separate authentication paths:

```text
/player/login/
→ Player User + 4-digit Key
→ role = player only

/gm/login/
→ Admin Username + strong password
→ role = admin only
```

Required server boundaries:

```text
/player/* + /api/player/*
→ Player only

/gm/* + /api/gm/*
→ Admin only
```

Unauthenticated `/gm/` must redirect to `/gm/login/`, never to Player Access.

The retired endpoint:

```text
POST /api/admin/provision-initial-gm
```

must not promote a Player and is expected to return `410 GM_PROVISIONING_SUPERSEDED`.

See `docs/GM_INITIAL_PROVISIONING_MVP.md` for the Canonical Admin credential and legacy migration contract.

---

# 6. Automatic Deployment Gate

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
→ Verify custom-domain edge
→ Smoke test direct Worker runtime
```

The production job:

```text
checks out the exact main commit
uses Node 22
validates that both Cloudflare deployment secrets are present
runs npx --yes wrangler@4 deploy
checks custom-domain edge reachability
runs route/auth smoke against workers.dev
```

Pull requests and feature-branch pushes must never deploy production.

The production deployment uses a `cloudflare-production` concurrency group with `cancel-in-progress: false`, so a later push does not cancel an already-running publish halfway through.

---

# 7. Manual Deployment Fallback

Automatic GitHub deployment is the normal Alpha path. Manual deployment is fallback-only for CI/CD recovery or controlled rollback.

From a clean checkout of a verified commit:

```bash
npx --yes wrangler@4 deploy
```

with valid Cloudflare credentials in the execution environment.

The deployment output must identify the intended Worker / custom domain rather than a test Worker or unrelated Cloudflare account.

Do not treat local source tests as deployment success; use Wrangler / GitHub Actions deployment completion as the publish boundary.

---

# 8. Immediate Post-Deploy Smoke Test

Cloudflare may challenge headless CI traffic on the custom domain. A GitHub runner can receive:

```text
HTTP 403
cf-mitigated: challenge
```

for `https://dungeon-and-dragon.lchjames.com/` even when Worker and custom-domain routing are healthy. This is a Cloudflare challenge response, not proof of an application failure.

The automated smoke is therefore split into two layers.

## 8.1 Custom-domain edge check

The workflow requests:

```text
https://dungeon-and-dragon.lchjames.com/
```

Accepted evidence that the domain resolves through the intended Cloudflare edge:

```text
2xx / 3xx response
OR
403 with cf-mitigated: challenge
```

Other errors, DNS/connectivity failure or an unexplained 4xx/5xx fail the edge check.

## 8.2 Direct Worker runtime/auth check

Precise unauthenticated application behavior is tested against:

```text
https://dnd.apswsttss.workers.dev/
https://dnd.apswsttss.workers.dev/player/login/
https://dnd.apswsttss.workers.dev/gm/login/
https://dnd.apswsttss.workers.dev/player/
https://dnd.apswsttss.workers.dev/gm/
https://dnd.apswsttss.workers.dev/api/auth/me
https://dnd.apswsttss.workers.dev/api/admin/auth/me
```

Expected contract:

```text
GET /
→ 2xx

GET /player/login/
→ 2xx

GET /gm/login/
→ 2xx

GET /player/
→ 302 to /player/login/

GET /gm/
→ 302 to /gm/login/

GET /api/auth/me
→ 401 without a session

GET /api/admin/auth/me
→ 401 without an Admin session
```

The smoke uses bounded retries so short Cloudflare propagation delay does not create a false deployment failure.

This automated smoke does **not** replace authenticated browser testing on the custom domain.

---

# 9. Admin Bootstrap / Migration Smoke

Before authenticated GM testing, establish a dedicated Admin credential.

### Fresh environment

```text
/gm/setup/
→ Provisioning Token
→ Admin Username
→ strong Admin Password
→ role = admin
→ /gm/
```

### Existing legacy GM environment

If the old implementation previously promoted one Player-key User to `gm`:

```text
runtime normalizes role gm → admin
→ /gm/setup/
→ same provisioning secret
→ choose new Admin Username + strong Admin Password
→ existing Admin User ID retained
→ old Player-Key credential is no longer an Admin credential
```

If `/gm/setup/` reports `PROVISION_SECRET_NOT_CONFIGURED`, configure the one-time Worker provisioning secret before continuing. Do not put the value in source or chat logs.

After a fully provisioned Admin exists, setup closes and normal access is through `/gm/login/` only.

---

# 10. Authenticated Browser Smoke

Use real browser sessions on the custom domain.

Player session:

```text
/player/login/
→ Player workspace
→ cannot satisfy /gm/ or /api/gm/*
```

Admin session:

```text
/gm/login/
→ GM workspace
→ Story / Monsters / Bosses / Combat views load
→ cannot be treated as Player access merely because the same browser cookie mechanism is used
```

A 500 / 503 on an authenticated feature route remains a release blocker until its D1/runtime cause is understood.

---

# 11. Live Alpha Vertical Slice

Run one intentionally small live Scenario using disposable / Alpha data where possible:

```text
1. Confirm dedicated Admin login works
2. Confirm one active Player Character
3. Create Scenario
4. Create Scene
5. Create Encounter
6. Assign Character participant
7. Create / select Monster Template + Skill
8. Spawn one Monster Instance
9. Create / select simple Boss Profile
10. Spawn one Boss Instance
11. Start Encounter Combat
12. Confirm Character + Monster + Boss shared Initiative
13. Exercise Player own-turn controls
14. Exercise Monster → Character attack
15. Exercise Player → Monster attack
16. Exercise Boss → Character attack
17. Exercise Player → Boss attack
18. Confirm Armor is post-hit Damage reduction, not D100 Defence
19. Confirm Character HP0 uses DYING
20. Confirm Monster HP0 immediately becomes defeated
21. Confirm Boss HP0 immediately becomes defeated
22. Exercise one Boss Phase applicability / manual Phase control path before defeat where practical
23. Admin/GM End Combat
24. Mark Encounter resolved and enter Resolution Notes
25. Continue / complete Scene as appropriate
```

Do not use the live Alpha session to invent new rules. Record failures as integration, data, UX or tuning defects unless a genuinely missing Canonical rule is discovered.

---

# 12. Pass Criteria

The release is suitable for continued Alpha use when:

```text
MVP checks succeed on the deployed main commit
Deploy Cloudflare production succeeds
custom-domain edge check succeeds
direct workers.dev runtime/auth smoke succeeds
/player/login/ and /gm/login/ remain separate
unauthenticated /gm/ redirects to /gm/login/
Player session cannot gain Admin access
Admin session can use GM workspace
D1-backed reads/writes succeed
Scenario / Scene / Encounter data persists after refresh
Monster / Boss Instance data persists after refresh
one shared Combat starts with all expected combatants
Player / Monster / Boss turns resolve without stale-state corruption
HP / Armor / defeat states persist correctly
Combat can be ended by Admin/GM
Encounter can subsequently be resolved
no unexpected 500 / 503 remains unexplained
```

UI friction that does not corrupt authoritative data may be recorded for Alpha usability tuning rather than blocking the release.

---

# 13. Failure / Rollback Boundary

If automatic deployment fails:

```text
MVP checks failure
→ do not deploy

credential / Wrangler deployment failure
→ main remains source-of-truth, but production stays on the previous successful Worker version
→ inspect GitHub Actions deploy log

custom-domain challenge response
→ accepted only when status=403 and cf-mitigated=challenge
→ does not replace direct Worker runtime smoke

post-deploy runtime smoke failure
→ Worker publish may already have completed
→ treat production parity as unverified
→ inspect route/status/auth failure immediately
→ rollback or hotfix if production-blocking
```

If deployment succeeds but introduces a production-blocking runtime error:

```text
stop live data mutation
capture failing route + error code/message
identify whether failure is Worker source, static asset, auth or D1 schema/data
```

Do not attempt random SQL changes against production as a first response.

If the defect is source-only and the previous Worker version was healthy, use Cloudflare deployment/version rollback or redeploy the last known-good source commit according to available Cloudflare operational tooling.

D1 data changes are a separate boundary from Worker rollback. Rolling back Worker source does not automatically roll back D1 writes.

---

# 14. Current Operational Status

Automatic deployment and challenge-aware route smoke are verified operational. The Admin-auth separation is the Alpha correction required before the authenticated live Scenario session is valid:

```text
GitHub MVP feature construction: complete for first vertical slice
Scenario E2E source regression: passing
GitHub Actions Cloudflare credentials: configured and validated
Automatic production deployment: verified working
Worker: dnd
D1 binding: env.DB → dnd-db
Custom domain deployment: verified by Wrangler
Custom-domain CI response: Cloudflare challenge-aware edge check
Direct runtime/auth smoke: workers.dev
Feature / PR pushes: deployment correctly skipped
main push after successful MVP checks: production deployment enabled
Player authentication: User + 4-digit Key
Admin authentication: dedicated Username + strong password
GM = Admin
Authenticated live browser + production D1 Alpha session: next validation stage after Admin-auth deployment/setup
```
