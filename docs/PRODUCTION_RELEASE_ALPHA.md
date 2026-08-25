# Production Release — Alpha

> Status: Canonical Alpha Operations Checklist  
> Date: 2026-08-25  
> Purpose: Safely publish the current playable MVP source to the Cloudflare Worker / D1 production environment and verify the first live Alpha session without confusing GitHub merge state with deployment state.

---

# 1. Source Release Checkpoint

Current release checkpoint when this document was created:

```text
Repository: lchjames/Dungeon-and-Dragon
Branch: main
Commit: acf4a4c2f248287fe0a3c39fb93e4597c744de5d
Production URL: https://dungeon-and-dragon.lchjames.com
```

Before deploying, re-read `main`. If `main` has advanced, the deploy target must be the new verified `main` head rather than this historical SHA.

GitHub `main` and successful GitHub Actions checks are source-release evidence only. They do not prove that Cloudflare production has been deployed.

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
→ deploy Worker + assets
→ authenticated smoke requests exercise the guarded runtime paths
→ inspect any D1/runtime error before considering manual schema intervention
```

A future dedicated migration ledger may replace this approach. Until then, do not bulk-replay the schema directory on an existing D1 database.

For a completely new blank D1 database, use the repository schema files deliberately in dependency order or use the runtime initialization paths; do not treat a fresh-database bootstrap as the same operation as an existing-production upgrade.

---

# 4. Required Secret Boundary

Initial GM provisioning uses:

```text
INITIAL_GM_PROVISION_TOKEN
```

Only configure / use this secret when the production environment still has no `gm/admin` User.

If the first GM has already been provisioned, normal deployment does not require re-running `/gm/setup/` and must not create another bootstrap path.

Never commit the secret value into GitHub, Markdown, Worker source or static assets.

---

# 5. Deployment Command

From a clean checkout of the verified `main`:

```bash
npx wrangler deploy
```

The deployment output must identify the intended Worker / custom domain rather than a test Worker or unrelated Cloudflare account.

Do not treat a successful local source test as deployment success; use Wrangler's deployment result as the publish boundary.

---

# 6. Immediate Post-Deploy Smoke Test

Use the real production browser session.

Minimum route smoke:

```text
/
/player/login/
/player/
/gm/
```

Expected behavior:

```text
unauthenticated protected route
→ redirects / requires login

Player User
→ Player workspace
→ cannot gain GM routes

GM User
→ GM workspace
→ Story / Monsters / Bosses / Combat views load
```

A 500 / 503 on a new feature route must be treated as a release blocker until its D1/runtime cause is understood.

---

# 7. Live Alpha Vertical Slice

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

# 8. Pass Criteria

The release is suitable for continued Alpha use when:

```text
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

# 9. Failure / Rollback Boundary

If deployment introduces a production-blocking runtime error:

```text
stop live data mutation
capture failing route + error code/message
identify whether failure is Worker source, static asset, auth or D1 schema/data
```

Do not attempt random SQL changes against production as a first response.

If the defect is source-only and the previous Worker version was healthy, use Cloudflare deployment/version rollback or redeploy the last known-good source commit according to the available Cloudflare operational tooling.

D1 data changes are a separate boundary from Worker rollback. Rolling back Worker source does not automatically roll back D1 writes.

---

# 10. Current Operational Status

At the time this document was created:

```text
GitHub MVP feature construction: complete for first vertical slice
Scenario E2E source regression: passing
GitHub main: ready as source release checkpoint
Cloudflare production deployment: must be verified separately
Live browser + production D1 Alpha session: pending until deployment is confirmed
```
