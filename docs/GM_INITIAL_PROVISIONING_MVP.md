# GM / Admin Provisioning — MVP

> Status: Canonical MVP Implementation Contract  
> Date: 2026-08-25  
> Scope: Keep GM administration completely separate from Player identity and Player authentication.

---

# 1. Canonical Identity Model

GM is the campaign administrator.

The canonical role model is:

```text
player
admin
```

`GM` is the product / workspace name for the administrator experience; it is not a Player subtype and does not require a separate persistent `gm` role for new data.

New code must not create or promote a Player into a GM/Admin identity.

Legacy rows with `role = gm` may be accepted only as a temporary migration compatibility case while the Admin-auth correction is rolled out. New writes must use:

```text
role = admin
```

---

# 2. Player / Admin Separation

Player access and GM/Admin access are independent authentication paths.

```text
/player/login/
→ Player authentication only
→ Player workspace only

/gm/login/
→ Admin authentication only
→ GM/Admin workspace only
```

An unauthenticated request to `/gm/` must never redirect to `/player/login/`.

It must redirect to:

```text
/gm/login/
```

A Player session must never satisfy the Admin authentication requirement merely because the Player account was later assigned another role.

The Player registration flow must never contain an Admin/GM creation or escalation path.

---

# 3. Initial Admin Provisioning

The first administrator is provisioned directly as an Admin identity.

The bootstrap flow must not require:

```text
register Player
→ login as Player
→ promote Player to GM/Admin
```

That model is explicitly superseded.

Instead:

```text
/gm/setup/
→ one-time provisioning secret
→ create initial Admin identity directly
→ Admin signs in through /gm/login/
```

Production provisioning continues to rely on a non-committed Worker secret such as:

```text
INITIAL_GM_PROVISION_TOKEN
```

The secret is bootstrap authorization only. It is not the permanent Admin login credential.

---

# 4. One-Time Closure

Initial Admin provisioning is allowed only while no active Admin identity exists.

Once an Admin exists:

```text
/gm/setup/
→ bootstrap creation disabled
```

The provisioning endpoint must not become a general Player role-management API.

There is no supported operation:

```text
Player → Admin promotion
```

through Player APIs or the bootstrap endpoint.

---

# 5. Admin Authentication Boundary

All `/gm/` pages and `/api/gm/*` APIs require an authenticated Admin session.

Canonical authorization:

```text
admin
→ allowed GM workspace

player
→ denied GM workspace

unauthenticated
→ /gm/login/
```

Client-side checks are never sufficient; the Worker must enforce the Admin boundary server-side.

---

# 6. Security Invariants

Forbidden:

```text
GM requiring Player Access
Admin using Player registration as bootstrap
Player choosing admin during registration
Player promoting self to admin
Player session being treated as an Admin session
4-digit Player Key implicitly becoming an Admin credential
storing the bootstrap token in D1 or source control
committing permanent Admin credentials to Git
```

---

# 7. Migration Requirement

The currently deployed implementation still contains the superseded Player-promotion model and must be corrected before authenticated Live Alpha GM testing is considered valid.

Required implementation work:

```text
add /gm/login/
separate Admin authentication from Player authentication
make /gm/ redirect unauthenticated users to /gm/login/
change /gm/setup/ to create Admin directly
remove Player → GM/Admin promotion logic
write new administrator identities as role = admin
restrict GM server guards to Admin identity
retain only minimal legacy role=gm migration compatibility if needed
```

---

# 8. Remaining Credential Decision

One implementation decision remains before the Admin-auth correction can be completed:

```text
permanent Admin login credential format
```

The Player `User + 4-digit Key` credential model must not be reused automatically for Admin access.

Until that credential decision is confirmed, this document governs the identity and authorization architecture, while the current production GM-login behavior is considered non-conformant and pending correction.
