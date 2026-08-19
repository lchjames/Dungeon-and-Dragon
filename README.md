# D&D Campaign Hub

Production repository for `https://dungeon-and-dragon.lchjames.com`.

## Current architecture

- `/` — workspace selector
- `/player/` — password-protected Player workspace
- `/player/login/` — Player login
- `/player/register/` — new Player account creation
- `/gm/` — GM workspace (GM authentication is a later phase)

## Player authentication

Player accounts are stored server-side in Cloudflare D1.

Current auth flow:

1. Register with display name, username and password.
2. Password is salted and hashed in the Worker with PBKDF2-HMAC-SHA-256.
3. A random session token is issued as a `Secure`, `HttpOnly`, `SameSite=Lax` cookie.
4. Only the SHA-256 hash of the session token is stored in D1.
5. `/player/` is protected by Worker middleware and redirects unauthenticated requests to `/player/login/`.
6. Five consecutive failed password attempts temporarily lock the account for 15 minutes.
7. Sessions expire after seven days.

The password policy is 12–128 characters. Passwords are never stored in localStorage or returned to the browser after submission.

## D1

`wrangler.jsonc` declares a draft D1 binding named `DB`. Modern Wrangler versions can automatically provision the D1 database during `wrangler deploy` when the binding has no resource ID.

The Worker lazily creates the `users` and `sessions` tables on the first authentication request. A reference copy of the schema is stored in `schema/0001_auth.sql`.

## Player / Character bridge

Authentication is now server-side, but the v5 campaign/character model is still browser-local (`dnd-platform-v5`). On login, the Player workspace creates or updates a local Player record whose ID equals the authenticated D1 user ID. This keeps the current character UI working while preparing the model for the next phase, where characters and assignments will move to D1.

Therefore, password protection currently protects access to the Player workspace and establishes a real user identity; campaign data is not yet synchronized between browsers/devices.

## Cloudflare deployment

The app uses Cloudflare Workers + Static Assets:

- Worker entry: `src/worker.js`
- Static assets: `./public`
- D1 binding: `DB`
- Custom domain: `dungeon-and-dragon.lchjames.com`
- Deploy command: `npx wrangler deploy`

`assets.run_worker_first` is enabled for `/api/*` and `/player*` so authentication can run before protected Player assets are served.

## Data model

`Player`
- id
- displayName
- status
- notes

`Character`
- id
- ownerPlayerId
- name
- role
- level
- status
- template
- portraitAssetId
- summary
- attributes[]
- resources[]
- inventory[]
- abilities[]
- notes

All future production development is done in this repository. `lchjames/Dungeon-and-Dragon-PHP` remains historical reference only.
