# D&D Campaign Hub

Production repository for `https://dungeon-and-dragon.lchjames.com`.

This is the rebuilt v5 application. The previous mixed Vault/PHP/Python UI has been removed from the working tree. Git history is retained for rollback and reference.

## v5 architecture

The website now has three explicit entry points:

- `/` — workspace selector
- `/player/` — Player-only workspace
- `/gm/` — GM management workspace

Player and GM are no longer different tabs inside one application screen.

### Core entities

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

This keeps the character model system-agnostic. STR/DEX/etc. are no longer hard-coded database columns; they can be represented as flexible attributes.

## Current capabilities

### Player workspace
- Select player identity (temporary until authentication is added)
- See only characters assigned to that player
- Character overview
- Read attributes
- Update current resource values
- View and update inventory quantity
- View abilities
- Update character notes
- Export an individual character

### GM workspace
- Dashboard
- Player CRUD
- Character CRUD and assignment
- Flexible character attributes
- Flexible resources (current/max)
- Inventory
- Abilities
- Character status and portrait
- Lightweight media asset library
- Element classifier migrated from the legacy NLP experiment
- Maze generator migrated from the legacy Python experiments
- Campaign settings
- Full JSON backup / restore
- Local data reset

## Data migration

v5 stores browser data under:

`dnd-platform-v5`

On first load, if no v5 data exists, it attempts to migrate from:

1. `dnd-vault-v4`
2. `vault-v3.2.7a`

The old browser keys are not deleted.

## Storage limitation

The current rebuild intentionally keeps persistence client-side while the information architecture is stabilised. Player selection is therefore not authentication, and data does not sync between browsers/devices.

The new Player → Character model is designed so Cloudflare D1 and real authentication can be introduced later without merging the Player and GM interfaces again.

## Cloudflare deployment

The repository uses Cloudflare Workers Static Assets.

`wrangler.jsonc`:
- Worker: `dungeon-and-dragon`
- Assets: `./public`
- Production custom domain: `dungeon-and-dragon.lchjames.com`
- HTML handling: automatic trailing slash
- 404 handling: nearest `404.html`

Deploy command:

```bash
npx wrangler deploy
```

No Worker JavaScript entry point is required for this static build.

## Repository policy

All future production development is done in this repository. `lchjames/Dungeon-and-Dragon-PHP` remains historical reference only.
