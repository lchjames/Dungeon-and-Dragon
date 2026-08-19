# D&D Campaign Hub

Production repository for `https://dungeon-and-dragon.lchjames.com`.

## Current architecture

- `/player/login/` and `/player/register/` — D1-backed Player authentication
- `/player/` — protected Player workspace
- `/gm/` — GM workspace; backend/auth migration is the next phase
- Cloudflare Worker API + Static Assets
- Cloudflare D1 is the source of truth for Player accounts and Player character data

## No local campaign persistence on Player side

The Player workspace no longer reads or writes `dnd-platform-v5`, `dnd-vault-v4`, or `vault-v3.2.7a`.

D1 now stores:

- users
- sessions
- settings
- characters and ownership
- character attributes
- character resources
- inventory
- abilities
- character notes

Browser storage may still be used for non-authoritative UI preferences such as theme, but not for Player account or campaign data.

## Authorization model

Every Player data API resolves the authenticated user from the HttpOnly session cookie. Character access is checked server-side with `owner_user_id = authenticated_user.id` before data is returned or modified.

Player-write APIs currently permit only:

- resource current values
- inventory quantities
- character notes

Attributes, abilities, character ownership and structural character fields remain read-only from the Player API.

## D1 schema

Reference schema: `schema/0001_platform.sql`.

The Worker also uses idempotent `CREATE TABLE IF NOT EXISTS` statements at runtime so the required schema exists once the configured `DB` binding is available.

The Wrangler binding is named `DB`. Production should bind this to the project's D1 database. Cloudflare's documented explicit binding format includes `database_name` and `database_id`; keep those Cloudflare-generated values once the database is created/bound.

## Deployment

```bash
npx wrangler deploy
```

Static assets live in `./public`; the Worker entry is `./src/worker.js`.
