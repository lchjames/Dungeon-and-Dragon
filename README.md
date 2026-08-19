# D&D Character Vault

Production repository for the D&D project.

**Production URL:** `https://dungeon-and-dragon.lchjames.com`

This repository is the single main codebase for future development and commits. `lchjames/Dungeon-and-Dragon-PHP` is retained only as a historical reference; its useful features have been migrated into this web application.

## Current application

The current release combines the modern Vault with the legacy PHP/Python project:

- Character creation, editing, deletion and detail view
- Player name (PL) + character name (PC) lookup
- GM management table for all characters
- Legacy character statistics: STR, DEX, CON, APP, POW, INT, SIZ, EDU
- Derived statistics: SAN = POW×5, IDEA = INT×5, LUCK = POW×5, KNOW = EDU×5
- Legacy random-stat generator (3–15)
- Excel character / item / skill import
- Item and skill display
- Browser media library with image upload, search, download and delete
- Element classifier migrated from the old NLTK notebook
- Random maze generator migrated from the old Python maze notebooks
- AES-GCM encrypted character share packages
- Full JSON backup and restore
- Automatic migration from the old `vault-v3.2.7a` browser data key
- Responsive dark/light UI

## Data model

The current application is client-side. Data is stored in browser `localStorage` under:

`dnd-vault-v4`

On first run, if `dnd-vault-v4` does not exist but `vault-v3.2.7a` does, the application imports and normalises the old data automatically. The old key is not deleted.

The legacy MySQL database is **not** required by the current release. The old PHP CRUD behaviour is represented by the Character, Player Lookup and GM screens.

## Cloudflare deployment

This repository is configured for **Cloudflare Workers Static Assets**. It is intentionally compatible with Cloudflare Builds that run:

```bash
npx wrangler deploy
```

`wrangler.toml` points Workers Static Assets at the repository root. There is no JavaScript Worker entry point because this release is a static client-side application.

Cloudflare configuration:

- Worker name: `dungeon-and-dragon`
- Production Git branch: `main`
- Static assets directory: repository root (`.`)
- Deploy command: `npx wrangler deploy`
- Custom Domain: `dungeon-and-dragon.lchjames.com`

The `.assetsignore` file prevents repository/configuration files from being uploaded as public web assets.

## Share packages

Encrypted share packages intended for URL sharing can be committed under:

`/p/<filename>.json`

Public link format:

`https://dungeon-and-dragon.lchjames.com/#p=<filename>.json`

## Legacy migration map

| Legacy function | Current function |
|---|---|
| `newplayer.php` / `character_table.php` | Character editor + legacy stat generator |
| `player.php` / `search.php` / `getdata_player.php` | Player Lookup |
| `gamemaster.php` / `getdata_GM.php` | GM management table |
| `updateplayer.php` / `deleteplayer.php` | Edit / delete actions |
| `store_image.php` / `search_image.php` / `get_image.php` | Browser media library |
| `D&D_nlp.ipynb` + `keywords.txt` | Element classifier |
| `map_generator.ipynb` + `Untitled0.ipynb` | Browser maze generator |

The old PHP/MySQL code should no longer receive new production changes.
