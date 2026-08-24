# Initial GM Provisioning — MVP

> Status: Canonical MVP Implementation Contract  
> Date: 2026-08-24  
> Scope: Securely create the first GM role without exposing general self-promotion.

---

# 1. Purpose

Normal User registration creates:

```text
role = player
```

The project therefore requires a safe bootstrap path for the very first GM.

The bootstrap path must not become a reusable role-escalation API.

---

# 2. Required Secret

Production provisioning requires the Cloudflare Worker Secret:

```text
INITIAL_GM_PROVISION_TOKEN
```

The real token must never be committed to Git, Markdown, JavaScript source, or D1.

Recommended deployment value:

```text
cryptographically random
>= 32 characters recommended
>= 24 characters enforced by Worker
```

The Secret is read only from the Worker environment.

---

# 3. Bootstrap Preconditions

Initial GM provisioning succeeds only when all of the following are true:

```text
request has same-origin protection
current User has a valid authenticated session
current User is active
current User role = player
submitted token matches INITIAL_GM_PROVISION_TOKEN
D1 contains no User with role gm or admin
```

The endpoint does not accept a target User ID.

Therefore:

```text
caller can promote only the currently authenticated User
```

The endpoint does not accept an arbitrary target role.

Successful bootstrap always produces:

```text
role = gm
```

It does not create an `admin` role.

---

# 4. One-Time Closure

Provisioning uses an atomic conditional update:

```text
UPDATE current authenticated player
→ role = gm
ONLY IF no gm/admin exists
```

Once any D1 User has:

```text
role = gm
OR
role = admin
```

the initial bootstrap path must refuse further promotion attempts.

This remains true even if the Worker Secret has not yet been removed.

After successful production provisioning, the deployment operator should remove or rotate `INITIAL_GM_PROVISION_TOKEN` because it is no longer needed.

---

# 5. UI Flow

Provisioning page:

```text
/gm/setup/
```

Flow:

```text
not logged in
→ shared User login
→ return to /gm/setup/

logged-in gm/admin
→ redirect /gm/

logged-in player
→ enter provisioning token
→ POST /api/admin/provision-initial-gm
→ successful role update
→ redirect /gm/
```

The browser does not persist the provisioning token.

---

# 6. API

```text
POST /api/admin/provision-initial-gm
```

Body:

```json
{
  "token": "deployment-secret-value"
}
```

This is a bootstrap endpoint only.

It must not evolve into a general User role-management API.

Future role administration requires a separately authorized admin-only workflow.

---

# 7. Security Invariants

The following are forbidden:

```text
player choosing gm during registration
player setting their own role through profile API
client-side-only GM checks
provisioning arbitrary target User IDs
provisioning arbitrary roles
storing the provisioning token in D1
committing the provisioning token to source control
allowing second-GM creation through the bootstrap endpoint
```

The GM workspace remains protected independently by server-side `gm/admin` role checks.

---

# 8. Deployment Requirement

Code support alone does not provision a production GM.

Before first use, configure the production Worker Secret from the project directory:

```bash
npx wrangler secret put INITIAL_GM_PROVISION_TOKEN
```

Enter a strong random token when Wrangler prompts for the value. Do not place the token in `wrangler.jsonc`.

Then:

```text
1. deploy the Worker with the provisioning gateway
2. register / log in the intended GM User
3. open /gm/setup/
4. submit the same configured Secret once
5. verify /gm/ access
6. remove or rotate INITIAL_GM_PROVISION_TOKEN
```

No permanent bootstrap credential should be placed in the repository.

---

# 9. MVP Progression

With this bootstrap path implemented, the GM D1 Character Management foundation is no longer blocked by first-GM creation.

The next implementation blocker is:

```text
Round / Combat State Engine
```
