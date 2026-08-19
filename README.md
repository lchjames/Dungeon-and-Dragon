# D&D Character Vault

Production repository for the D&D project.

**Production URL:** `https://dungeon-and-dragon.lchjames.com`

This repository is the single main codebase for future development and commits. The older `Dungeon-and-Dragon-PHP` repository is retained only as a historical reference for legacy PHP/MySQL/Python logic.

## Current application

The current site is a client-side static web application:

- Character management and detail view
- Excel character import
- Items and skills import/display
- JSON backup and restore
- AES-GCM encrypted character share packages
- Mobile-friendly layout and theme toggle
- Browser `localStorage` persistence

No application server is required for the current version.

## Cloudflare Pages deployment

The repository is designed to deploy directly from the repository root.

Recommended Cloudflare Pages settings:

- Git repository: `lchjames/Dungeon-and-Dragon`
- Production branch: `main`
- Framework preset: `None`
- Build command: leave empty
- Build output directory: `.`
- Root directory: repository root

After the first deployment, add the custom domain:

`dungeon-and-dragon.lchjames.com`

The site uses root-relative hosting (`<base href="/">`) so production assets and `/p/` share packages resolve from the custom-domain root.

## Share package links

Encrypted share packages intended for URL sharing should be committed under:

`/p/<filename>.json`

The public link format is:

`https://dungeon-and-dragon.lchjames.com/#p=<filename>.json`

## Cloudflare configuration

`wrangler.toml` documents the Cloudflare Pages project and static output directory. `_headers` adds baseline security headers without blocking the SheetJS CDN currently used for Excel imports.

## Data model note

Character data currently lives in the user's browser via `localStorage` (`vault-v3.2.7a`). Deploying a new site version does not itself create a server-side database or synchronize data across devices.
