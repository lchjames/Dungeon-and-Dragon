# GM / Admin Provisioning — MVP

> Status: Canonical MVP Implementation Contract  
> Date: 2026-08-25  
> Scope: Keep GM administration completely separate from Player identity and Player authentication.

---

# 1. Canonical Identity Model

GM = Admin.

The canonical persistent role model is:

```text
player
admin
```

`GM` is the product / workspace name for the administrator experience. It is not a Player subtype and new data must not create a separate persistent `gm` role.

New code must never create or promote a Player into a GM/Admin identity.

Legacy rows with `role = gm` are migration-only input and are normalized to:

```text
role = admin
```

New writes use `admin` only.

---

# 2. Player / Admin Separation

Player access and GM/Admin access are independent authentication paths.

```text
/player/login/
→ Player User + 4-digit Key
→ role = player only
→ Player workspace only

/gm/login/
→ Admin Username + 強密碼
→ role = admin only
→ GM/Admin workspace only
```

An unauthenticated request to `/gm/` must never redirect to `/player/login/`; it redirects to `/gm/login/`.

A Player session never satisfies the Admin authentication requirement. An Admin session never satisfies `/api/player/*` or protected `/player/*` access.

The Player registration flow contains no Admin/GM creation or escalation path.

---

# 3. Admin Credential Contract

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

Admin passwords are not stored with the Player 4-digit-Key hash format.

Server storage uses:

```text
PBKDF2-HMAC-SHA256
210,000 iterations
random 16-byte salt
256-bit derived hash
```

The stored internal Admin username is namespaced separately from Player usernames so Player and Admin credentials cannot collide accidentally.

Failed Admin logins use the existing temporary lockout principle:

```text
5 failed attempts
→ temporary 15-minute lock
```

Admin sessions use the server-side D1 session table and a Secure / HttpOnly / SameSite=Lax session cookie. Admin login replaces the active browser session credential; authorization still depends on server-side `role = admin`.

---

# 4. Initial Admin Provisioning

The first administrator is provisioned directly as an Admin identity.

The superseded flow is forbidden:

```text
register Player
→ login as Player
→ promote Player to GM/Admin
```

Canonical bootstrap:

```text
/gm/setup/
→ one-time provisioning secret
→ choose Admin Username
→ choose strong Admin Password
→ create role = admin directly
→ establish Admin session
→ /gm/
```

The preferred Worker secret name is:

```text
INITIAL_ADMIN_PROVISION_TOKEN
```

During Alpha migration the existing secret name remains accepted as a legacy fallback:

```text
INITIAL_GM_PROVISION_TOKEN
```

The provisioning secret is bootstrap authorization only. It is not the permanent Admin password and is never stored in D1 or browser storage.

---

# 5. One-Time Closure + Legacy Migration

Initial Admin provisioning is allowed only while there is no fully provisioned Admin credential.

If the old implementation previously created exactly one legacy `role = gm` / Player-Key-backed administrator, runtime migration first normalizes its role to `admin`, then `/gm/setup/` may replace that legacy credential with the new Admin Username + strong password while preserving the existing User ID.

After a fully provisioned Admin credential exists:

```text
/gm/setup/
→ bootstrap creation disabled
```

The old endpoint:

```text
POST /api/admin/provision-initial-gm
```

is retired and must return a superseded / gone response. It must never promote a Player.

---

# 6. Admin Authentication Boundary

Canonical routes:

```text
POST /api/admin/auth/login
POST /api/admin/auth/logout
GET  /api/admin/auth/me
POST /api/admin/setup
```

All `/gm/` pages and `/api/gm/*` APIs require a server-validated Admin session.

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

Client-side checks are never sufficient.

---

# 7. Security Invariants

Forbidden:

```text
GM requiring Player Access
Admin using Player registration as bootstrap
Player choosing admin during registration
Player promoting self to admin
Player session being treated as an Admin session
Admin session being treated as Player access
4-digit Player Key becoming an Admin credential
new role = gm writes
storing bootstrap token in D1 or source control
committing permanent Admin credentials to Git
```

---

# 8. Implementation Status

The Admin-auth correction implements:

```text
/gm/login/
Admin Username + strong password
Admin-only /gm/ and /api/gm/* boundary
Player-only /player/* and /api/player/* boundary
/gm/setup/ direct Admin creation
legacy role=gm → admin normalization
legacy Player-Key GM credential reset through one-time setup
retired Player → GM promotion endpoint
```

This identity model supersedes every earlier document or implementation statement that describes GM as a promoted Player role.
