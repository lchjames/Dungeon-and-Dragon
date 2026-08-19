# D&D Campaign Hub

Production repository for `https://dungeon-and-dragon.lchjames.com`.

## Current architecture

- `/player/login/` — Player access with User + 4-digit Key
- `/player/register/` — create a new User + 4-digit Key
- `/player/` — protected Player workspace
- `/gm/` — GM workspace; backend/auth migration is the next phase
- Cloudflare Worker API + Static Assets
- Cloudflare D1 is the source of truth for Player identity and Player character data

## Player access model

Players do not manage a conventional username/password account. The visible access model is intentionally simple:

1. Enter a User name.
2. Enter a four-digit numeric Key.
3. The User resolves to a stable internal identifier.
4. The Key is verified through the existing server-side salted PBKDF2 hash flow.
5. A Secure + HttpOnly session cookie opens the Player workspace.
6. Characters are linked to the D1 User through `characters.owner_user_id`.

One User may own one or more characters. Five consecutive invalid Key attempts temporarily lock access for 15 minutes.

The internal D1 `users` table retains the existing `username` / `password_*` column names for compatibility, but those fields are implementation details and are not exposed as the Player UX.

## No local campaign persistence on Player side

The Player workspace does not read or write `dnd-platform-v5`, `dnd-vault-v4`, or `vault-v3.2.7a`.

D1 stores:

- users
- sessions
- settings
- characters and ownership
- character attributes
- character resources
- inventory
- abilities
- character notes

Browser storage may still be used for non-authoritative UI preferences such as theme, but not for Player identity or campaign data.

## Authorization model

Every Player data API resolves the active User from the HttpOnly session cookie. Character access is checked server-side with `owner_user_id = authenticated_user.id` before data is returned or modified.

Player-write APIs currently permit only:

- resource current values
- inventory quantities
- character notes

Attributes, abilities, character ownership and structural character fields remain read-only from the Player API.

## D1

Production binding:

- binding: `DB`
- database: `dnd-db`
- database ID: `7a9abf7b-5f87-4295-89b1-8187e991b782`

Reference schema: `schema/0001_platform.sql`.

## Deployment

```bash
npx wrangler deploy
```

Static assets live in `./public`; the Worker entry is `./src/worker.js`.
