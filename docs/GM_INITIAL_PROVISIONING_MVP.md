# GM / Admin Account Assignment — MVP

> Status: **Canonical MVP Security Contract**  
> Date: 2026-08-25  
> Scope: GM/Admin identity creation, assignment, authentication and privilege boundaries.  
> This document supersedes earlier Alpha text that allowed `/gm/setup/` or any browser-facing initial Admin provisioning flow.

---

# 1. Canonical Identity Model

GM = Admin.

The canonical persistent role model is:

```text
player
admin
```

`GM` is the product/workspace name for the administrator experience. It is not a Player subtype and new data must not create a separate persistent `gm` role.

Legacy rows with `role = gm` are migration-only input and may be normalized to:

```text
role = admin
```

New writes use `admin` only.

---

# 2. GM/Admin Accounts Are Not Publicly Creatable

A GM/Admin account **不可由網站建立**、不可由 Player 註冊流程建立，亦不可由任何已登入 Player 自行提升權限。

Canonical rule:

```text
Public website
→ may log in to an already configured Admin account
→ may NOT create Admin
→ may NOT promote Player to Admin
→ may NOT reset an unprovisioned legacy GM into Admin
```

GM/Admin identity is assigned directly by a trusted operator through the controlled **deployment / database** administration boundary.

This means that if no Admin account exists, the web application intentionally has no self-service bootstrap mechanism. An authorised operator must create or update the Admin credential out of band before GM access can be used.

---

# 3. Player / Admin Separation

Player access and GM/Admin access are independent authentication paths.

```text
/player/login/
→ Player User + 4-digit Key
→ role = player only
→ Player workspace only

/gm/login/
→ preconfigured Admin Username + strong password
→ role = admin only
→ GM/Admin workspace only
```

A Player session never satisfies Admin authentication. An Admin session never becomes Player access merely because both use the server-side session table.

Normal Player registration always creates:

```text
role = player
```

There is no role selector, promotion button, GM invitation code, provisioning token form or public Admin registration route.

---

# 4. Admin Credential Contract

Permanent Admin credential:

```text
Admin Username
+ strong password
```

Admin password requirements for MVP:

```text
minimum length: 12 characters
maximum length: 128 characters
recommended: 16+ characters
password must not contain the complete Admin Username
```

Server storage keeps the dedicated Admin credential format:

```text
PBKDF2-HMAC-SHA256
210,000 iterations
random 16-byte salt
256-bit derived hash
```

The stored internal Admin username remains namespaced separately from Player usernames. A valid Admin identity must satisfy the dedicated Admin credential contract and `role = admin`.

Failed Admin logins retain the temporary lockout principle:

```text
5 failed attempts
→ temporary 15-minute lock
```

Admin sessions remain server-side D1 sessions exposed through Secure / HttpOnly / SameSite=Lax cookies.

---

# 5. Direct Operator Assignment

Creating or replacing a GM/Admin account is a privileged infrastructure/data-management operation, not an application feature.

The trusted operator process must directly establish a record that satisfies all Admin invariants, including:

```text
role = admin
status = active
dedicated Admin username namespace
strong-password PBKDF2 credential
no Player 4-digit Key credential reuse
```

The operation may be performed through an approved Cloudflare/D1 deployment or database-management procedure. It must not be exposed through public routes or static UI.

A future dedicated operator CLI or protected infrastructure workflow may automate this process, but such tooling must execute outside the public application boundary.

Permanent Admin passwords, hashes, salts or bootstrap material must never be committed to Git.

---

# 6. Public Provisioning Routes Are Retired

The following historical paths are no longer valid creation mechanisms:

```text
/gm/setup/
POST /api/admin/setup
POST /api/admin/provision-initial-gm
```

Required production behaviour:

```text
/gm/setup/
→ redirect to /gm/login/

POST /api/admin/setup
→ 410 ADMIN_PROVISIONING_DISABLED

POST /api/admin/provision-initial-gm
→ 410 ADMIN_PROVISIONING_DISABLED
```

The setup page and its client JavaScript are not shipped as an active public UI.

Historical provisioning secrets such as:

```text
INITIAL_ADMIN_PROVISION_TOKEN
INITIAL_GM_PROVISION_TOKEN
```

are no longer an authorised browser bootstrap path. Existing secret configuration may be removed during operational cleanup after confirming it is not used elsewhere.

---

# 7. Legacy GM Handling

Legacy `role = gm` rows may still be normalized to `role = admin` for data compatibility, but role normalization alone does not grant valid Admin access.

A legacy Player-Key-backed GM credential is not a valid dedicated Admin credential.

```text
legacy GM row
→ normalize role for migration compatibility
→ remains blocked if Admin credential contract is not satisfied
→ trusted operator performs direct credential replacement if the account must be retained
```

The public application must never offer a migration/reset form for that legacy account.

---

# 8. Server Authorization Boundary

All `/gm/*` workspace access and `/api/gm/*` APIs require a server-validated Admin session.

```text
admin
→ allowed GM workspace

player
→ denied GM workspace

unauthenticated
→ /gm/login/
```

Player boundaries remain independently enforced:

```text
/player/*
/api/player/*
→ role = player only
```

Client-side UI hiding is never sufficient authorization.

---

# 9. Security Invariants

Forbidden:

```text
public Admin registration
/gm/setup/ creation form
Player choosing admin during registration
Player promoting self to Admin
Player → GM promotion endpoint
provisioning-token-based browser Admin creation
GM requiring a Player account first
4-digit Player Key becoming an Admin credential
new role = gm writes
Admin password or hash committed to Git
public endpoint that creates or upgrades an Admin identity
```

Required:

```text
Admin accounts are preconfigured by trusted operators
GM login authenticates only existing valid Admin identities
role authorization is enforced server-side
public application contains login only, not Admin creation
```

---

# 10. Implementation Status

The Alpha security correction establishes:

```text
src/admin-auth.js
→ outer lockdown gateway
→ blocks public Admin provisioning
→ delegates normal authentication to src/admin-auth-core.js

/gm/login/
→ login only

/gm/setup/
→ redirected away

/api/admin/setup
/api/admin/provision-initial-gm
→ ADMIN_PROVISIONING_DISABLED

Player registration
→ player only
```

This contract supersedes every earlier document or implementation statement that describes Admin/GM creation through a public setup page or a Player promotion flow.
