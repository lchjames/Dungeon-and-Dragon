# D&D Campaign Hub — Site & Character System Specification

> Status: **Canonical design document**  
> Purpose: This document is the source of truth for future website, database, Player, GM, character-creation, and character-sheet development.  
> Production site: `https://dungeon-and-dragon.lchjames.com/`

---

# 1. Product Goal

D&D Campaign Hub is a lightweight web-based TRPG character and campaign management system.

The platform is divided into two clearly separated experiences:

- **Player side** — players create a User, unlock it with a 4-digit Key, create and manage their own characters, and use their character sheets during play.
- **GM side** — the GM views and manages all campaign data, characters, users, game content and campaign-level settings.

Cloudflare D1 is the authoritative database. Browser localStorage must **not** be used for authoritative User, Character, Inventory, Ability, Resource, Notes, or campaign data.

---

# 2. Core Architecture Rules

## 2.1 Source of Truth

Authoritative data lives in Cloudflare D1.

Browser storage may only be used for non-authoritative UI preferences such as:

- theme
- last-opened tab
- temporary unsaved form state
- display preferences

Browser storage must not be used as the canonical copy of:

- Users
- Keys
- Sessions
- Characters
- Attributes
- Resources
- Inventory
- Abilities
- Character Notes
- Campaign settings

## 2.2 Identity Model

A Player identity is intentionally simple:

- **User** — a player-facing name, e.g. `swolf`
- **Key** — exactly four numeric digits, e.g. `4821`

The player does not need an email address, traditional username, or long password.

The User is linked to one or more Characters.

```text
User: swolf
├── Character A
├── Character B
└── Character C
```

## 2.3 Character Ownership

Every Character has an owner:

```text
characters.owner_user_id -> users.id
```

When a Player creates a Character, the Worker obtains the authenticated User ID from the current Session and writes that ID into `owner_user_id`.

The client must never be allowed to choose or submit another User's `owner_user_id`.

---

# 3. Public Site Structure

Recommended permanent routing structure:

```text
/
├── /player/
│   ├── /login/
│   ├── /register/
│   └── Player Workspace
│
└── /gm/
    └── GM Workspace
```

## 3.1 Landing Page `/`

Purpose:

- explain the two available workspaces
- provide Player and GM entry points

Primary actions:

- **Player** → `/player/`
- **Game Master** → `/gm/`

The landing page should remain simple. It should not contain character-management controls.

---

# 4. Player Authentication / Access

## 4.1 New User

A new Player creates:

| Field | Required | Validation |
|---|---:|---|
| User | Yes | 1–32 visible characters |
| 4-digit Key | Yes | exactly `0000–9999` |
| Confirm Key | Yes | must match Key |

Example:

```text
User: swolf
Key: 4821
```

## 4.2 Login

Player enters only:

```text
User
4-digit Key
```

After successful verification, the server creates an authenticated Session.

## 4.3 Key Protection

The 4-digit Key is a PIN-style access code, not a traditional password.

Security requirements:

- never store the Key in plaintext
- store only a salted server-side hash
- Session token stored as a secure HttpOnly cookie
- repeated failed Key attempts must trigger temporary lockout
- current policy: 5 failed attempts → 15-minute lock
- authentication errors should not unnecessarily expose internal account details

## 4.4 Player Session

Recommended current policy:

- Session lifetime: 7 days
- cookie: `Secure`
- cookie: `HttpOnly`
- cookie: `SameSite=Lax`

A Player can manually use **Lock** to end the current Session.

---

# 5. Player Workspace

The Player Workspace is character-focused, not database-focused.

Main layout:

```text
Player Workspace
│
├── My Characters
│   ├── + New Character
│   └── Character Cards
│
└── Character Sheet
    ├── Overview
    ├── Attributes
    ├── Resources
    ├── Inventory
    ├── Abilities
    └── Notes
```

The Player should never need to see:

- internal database IDs
- `owner_user_id`
- raw JSON database structures
- SQL/database controls
- GM-only system settings

---

# 6. Character Creation

Character creation is performed by the Player.

GM approval is **not required** to create a basic Character.

## 6.1 Character Creation Flow

```text
Player logged in
      ↓
+ New Character
      ↓
Character Creation Form
      ↓
POST /api/player/characters
      ↓
Server reads Session User ID
      ↓
Character saved to D1
      ↓
owner_user_id = current User ID
      ↓
Open newly created Character
```

## 6.2 Character Creation — Stage 1: Identity

Initial form should contain:

| Field | Type | Required | Default | Player Editable |
|---|---|---:|---|---:|
| Character Name | text | Yes | — | Yes |
| Role / Class | text | No | blank | Yes |
| Level | integer | No | 1 | Yes |
| Age | number/text | No | blank | Yes |
| Gender | text/select | No | blank | Yes |
| Alignment | text/select | No | blank | Yes |
| Occupation / Background | text | No | blank | Yes |
| Summary | textarea | No | blank | Yes |
| Portrait | image/reference | No | blank | Yes |

`Role / Class` should remain flexible rather than tied permanently to one RPG system.

Examples:

- Fighter
- Investigator
- Mage
- Intelligence Broker
- Tank
- Support
- Custom role

## 6.3 Character Creation — Stage 2: Core Attributes

The website should support the following classic attribute set.

### Primary Attributes

| Code | Name | Chinese | Purpose | Type | Default Editable |
|---|---|---|---|---|---:|
| **STR** | Strength | 力量 | Physical power, lifting, melee force | number | Yes |
| **DEX** | Dexterity | 敏捷 | Agility, reactions, coordination, speed | number | Yes |
| **CON** | Constitution | 體質 | Toughness, stamina, physical endurance | number | Yes |
| **APP** | Appearance | 外貌 | Appearance, charisma-like physical/social impression | number | Yes |
| **POW** | Power | 意志 / 精神力 | Willpower, mental strength, supernatural resistance | number | Yes |
| **INT** | Intelligence | 智力 | Reasoning, learning, problem solving | number | Yes |
| **SIZ** | Size | 體型 | Physical size and mass | number | Yes |
| **EDU** | Education | 教育 | Formal knowledge, education and learned knowledge | number | Yes |

> Note: the standard field is **DEX**, not `DEV`.

### Derived / Secondary Attributes

| Code | Name | Chinese | Suggested Rule | Type | Editable |
|---|---|---|---|---|---:|
| **SAN** | Sanity | 理智 | default `POW × 5` | number | Current value may change |
| **IDEA** | Idea | 靈感 | default `INT × 5` | number | Usually derived |
| **LUCK** | Luck | 幸運 | default `POW × 5` | number | Usually derived / may vary by ruleset |
| **KNOW** | Knowledge | 知識 | default `EDU × 5` | number | Usually derived |

These formulas are defaults based on the legacy system and must be configurable later if the campaign uses another ruleset.

## 6.4 Flexible Attribute System

Although the standard Character Builder shows the fields above, the database architecture must remain flexible.

Attributes should be stored as records rather than permanent hard-coded columns.

Example:

```json
{
  "key": "STR",
  "label": "Strength",
  "value": 12,
  "description": "Physical power"
}
```

Custom campaign attributes must also be possible:

```text
靈力       25
污染值      4
精神抗性   B+
信仰       12
機械同步率 87%
```

This allows the platform to support D&D, CoC-style games, custom systems, sci-fi, wuxia, cultivation or other TRPG systems without redesigning the database.

---

# 7. Character Status / Character Sheet Data

The term **Character Status** refers to the complete current state displayed on the Character Sheet.

It should be divided into clear groups.

## 7.1 Identity Status

```text
Character Name
Owner User
Role / Class
Level
Age
Gender
Alignment
Occupation / Background
Status
Portrait
Summary
```

### Character lifecycle `status`

Recommended values:

| Status | Meaning |
|---|---|
| `active` | currently playable |
| `inactive` | temporarily not in active play |
| `retired` | retired / archived character |
| `dead` | character is dead |
| `npc` | optional NPC classification |

Player-created Characters should default to:

```text
active
```

## 7.2 Primary Attribute Status

```text
STR — Strength
DEX — Dexterity
CON — Constitution
APP — Appearance
POW — Power
INT — Intelligence
SIZ — Size
EDU — Education
```

## 7.3 Secondary / Derived Status

```text
SAN  — Sanity
IDEA — Idea
LUCK — Luck
KNOW — Knowledge
```

## 7.4 Resources

Resources are values with a current and optional maximum value.

Recommended standard resources:

| Resource | Current | Max | Description |
|---|---:|---:|---|
| HP | editable | configured | Hit Points / Health |
| MP | editable | configured | Mana / Magic / Energy |
| SP | editable | configured | Stamina / Special resource |
| SAN | editable | configured | Current Sanity if campaign uses it |

Resource system must allow custom entries.

Example:

```text
HP       18 / 24
MP       32 / 40
Stamina   7 / 10
Rage       2 / 5
Ammo      17 / 30
```

## 7.5 Inventory

Each Inventory entry should support:

| Field | Type |
|---|---|
| Item Name | text |
| Quantity | number |
| Category | text/select |
| Description / Notes | text |
| Weight | optional number |
| Equipped | boolean |
| Consumable | boolean |

Suggested categories:

```text
Weapon
Armor
Consumable
Tool
Quest Item
Material
Currency
Miscellaneous
```

## 7.6 Abilities / Skills

Each Ability should support:

| Field | Type |
|---|---|
| Name | text |
| Type | text/select |
| Rank / Level | optional text/number |
| Value / Modifier | optional text/number |
| Proficient | boolean |
| Description | textarea |
| Cooldown | optional text |
| Cost | optional text |
| Tags | optional list |

Suggested ability types:

```text
Skill
Spell
Feat
Trait
Passive
Active
Reaction
Technique
Knowledge
Custom
```

## 7.7 Notes

Character Notes should support Player-written session information such as:

- current objectives
- clues
- NPC relationships
- plans
- reminders
- session notes

Notes are stored in D1.

---

# 8. Character Sheet Editing Permissions

Initial permission model:

| Character Data | Player | GM |
|---|---:|---:|
| Create Character | Yes | Yes |
| Character Name | Yes | Yes |
| Role / Class | Yes | Yes |
| Level | Yes | Yes |
| Age / Gender / Alignment / Background | Yes | Yes |
| Summary | Yes | Yes |
| Portrait | Yes | Yes |
| STR / DEX / CON / APP / POW / INT / SIZ / EDU | Yes | Yes |
| SAN / IDEA / LUCK / KNOW | Yes / derived | Yes |
| Resource Current Value | Yes | Yes |
| Resource Maximum | Yes during creation/edit | Yes |
| Inventory | Yes | Yes |
| Abilities | Yes | Yes |
| Notes | Yes | Yes |
| Character Owner | No | Yes |
| Delete / Archive Character | Yes for own character | Yes |
| Campaign-wide settings | No | Yes |

This permission model may later be tightened by a campaign setting, but the default design is **Player owns and builds their own Character**.

---

# 9. Recommended Character Builder UX

The creation process should not present one giant form.

Recommended wizard:

```text
Step 1 — Identity
   Name / Role / Level / Background / Portrait

Step 2 — Attributes
   STR DEX CON APP POW INT SIZ EDU

Step 3 — Derived Values
   SAN IDEA LUCK KNOW
   [Auto Calculate]

Step 4 — Resources
   HP / MP / SP / custom resources

Step 5 — Abilities
   skills / spells / traits

Step 6 — Inventory
   starting equipment

Step 7 — Review
   confirm character

Create Character
```

The Player should be able to skip optional steps and return later.

A Character may therefore exist in a partially completed state.

Recommended future field:

```text
profile_completion
```

or calculate completion dynamically rather than storing it.

---

# 10. Character Detail Page

Recommended tabs:

```text
Overview
Attributes
Resources
Inventory
Abilities
Notes
```

## Overview

Show at a glance:

- Portrait
- Name
- Role / Class
- Level
- Status
- HP / important resources
- Summary
- major attributes

## Attributes

Show:

```text
STR DEX CON APP
POW INT SIZ EDU
SAN IDEA LUCK KNOW
+ custom attributes
```

## Resources

Interactive current-value controls.

Example:

```text
HP
[-] 18 / 24 [+]
```

## Inventory

List or card view with quantity and equipped state.

## Abilities

Grouped by ability type.

## Notes

Large editable notes area with database-backed save.

---

# 11. GM Workspace

GM is an administrator of the campaign, not the mandatory creator of Player Characters.

Recommended GM sections:

```text
Dashboard
Users
Characters
Campaign
Game Data
Assets
Tools
Settings
```

## 11.1 Dashboard

Show summary:

```text
Users
Characters
Active Characters
Campaign Name
Recent Changes
```

## 11.2 Users

GM should be able to:

- view User list
- view characters owned by each User
- disable/reactivate User
- reset/change a User Key if necessary
- transfer Character ownership

GM should never see the original plaintext Key.

## 11.3 Characters

GM should be able to:

- view all characters
- search by Character / User / Role / Status
- open full Character Sheet
- edit character data
- archive/delete Character
- change owner

## 11.4 Campaign

Future campaign settings may include:

- Campaign name
- ruleset/template
- default attributes
- derived-value formulas
- default resources
- default starting abilities
- default starting inventory

---

# 12. D1 Data Model

Current / target conceptual structure:

```text
users
  └── sessions

users
  └── characters
        ├── character_attributes
        ├── character_resources
        ├── character_inventory
        └── character_abilities

settings
```

## 12.1 `users`

Purpose: Player identity and Key verification.

Core logical fields:

```text
id
user_name / internal lookup value
display_name
key_hash
key_salt
role
status
failed_attempts
locked_until
created_at
updated_at
```

Some existing physical column names may retain legacy naming for compatibility. Future migrations may rename them when appropriate.

## 12.2 `characters`

Target logical fields:

```text
id
owner_user_id
name
role
level
age
gender
alignment
background
status
template
portrait_url
summary
notes
created_at
updated_at
```

## 12.3 `character_attributes`

```text
id
character_id
sort_order
key
label
value
description
```

Examples:

```text
STR / Strength / 12
DEX / Dexterity / 15
POW / Power / 14
SAN / Sanity / 70
```

## 12.4 `character_resources`

```text
id
character_id
sort_order
key
label
current_value
max_value
description
```

## 12.5 `character_inventory`

Current core fields:

```text
id
character_id
sort_order
name
qty
notes
```

Future extension:

```text
category
weight
equipped
consumable
```

## 12.6 `character_abilities`

Current core fields:

```text
id
character_id
sort_order
name
type
description
proficient
```

Future extension:

```text
rank
value
cost
cooldown
tags
```

---

# 13. API Design

## Authentication

```text
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me
```

Preferred public payload design:

### Register

```json
{
  "user": "swolf",
  "key": "4821"
}
```

### Login

```json
{
  "user": "swolf",
  "key": "4821"
}
```

Internal lookup representation must be generated by the Worker, not by client-side JavaScript.

## Player Character APIs

```text
GET    /api/player/bootstrap
POST   /api/player/characters
GET    /api/player/characters/:characterId
PATCH  /api/player/characters/:characterId
DELETE /api/player/characters/:characterId   (future / archive preferred)
```

Nested data:

```text
POST/PATCH/DELETE attributes
POST/PATCH/DELETE resources
POST/PATCH/DELETE inventory
POST/PATCH/DELETE abilities
PATCH notes
```

Every Player endpoint must verify:

```text
character.owner_user_id == authenticated User ID
```

before returning or mutating character data.

---

# 14. Character Templates / Rulesets

The database should remain generic, but the UI may provide templates.

Recommended template concept:

```text
Generic
Classic / Legacy
D&D-style
Custom Campaign
```

For the current legacy-derived default, the Character Builder should automatically offer:

```text
STR
DEX
CON
APP
POW
INT
SIZ
EDU
SAN
IDEA
LUCK
KNOW
```

A campaign template can later change which fields appear without changing the database schema.

---

# 15. Data Validation Guidelines

Recommended initial validation:

| Field | Rule |
|---|---|
| User | 1–32 chars |
| Key | exactly 4 numeric digits |
| Character Name | 1–80 chars |
| Role | 0–80 chars |
| Level | integer, 0–999 |
| Summary | max 2,000 chars |
| Notes | max 20,000 chars |
| Attribute label | max 80 chars |
| Attribute key | max 32 chars |
| Attribute value | flexible string/number representation |
| Resource values | finite numeric values |
| Item quantity | number >= 0 |

Exact limits may be adjusted later, but validation must exist on the Worker/server side rather than only in browser JavaScript.

---

# 16. Error Handling

User-facing errors should be specific enough to be useful but should not expose database internals.

Examples:

```text
User already exists.
User or Key is incorrect.
Character not found.
You do not have permission to access this Character.
Character name is required.
Unable to save changes. Please retry.
```

Server logs should retain technical error details.

A health endpoint may be retained:

```text
GET /api/health
```

for verifying Worker ↔ D1 connectivity.

---

# 17. Development Principles

Future implementation should follow these rules:

1. **Update this specification before or together with major behavioural changes.**
2. D1 is the authoritative source of truth.
3. Player and GM interfaces remain separate.
4. Player owns and creates their own Characters by default.
5. GM has global administrative visibility but is not required for normal Player Character creation.
6. Ownership and permissions are enforced server-side.
7. Character attributes remain flexible; do not hard-code the database to one RPG system.
8. Standard Character UI should still provide STR, DEX, CON, APP, POW, INT, SIZ, EDU, SAN, IDEA, LUCK and KNOW by default.
9. Never expose plaintext Keys.
10. Never rely on client-side checks for authorization.
11. Avoid storing authoritative campaign data in localStorage.
12. Prefer archive/retire workflows over destructive deletion where history matters.

---

# 18. Recommended Next Development Order

## Phase A — Complete Player Character Builder

1. Expand `characters` metadata fields.
2. Build multi-step Character Creation wizard.
3. Add default STR / DEX / CON / APP / POW / INT / SIZ / EDU fields.
4. Add derived SAN / IDEA / LUCK / KNOW calculation.
5. Add Resource creation/editing.
6. Add Inventory CRUD.
7. Add Ability CRUD.
8. Add Character edit / archive controls.
9. Add portrait support.

## Phase B — GM D1 Migration

1. GM authentication.
2. GM Dashboard from D1.
3. User management.
4. All-Character management.
5. Character ownership transfer.
6. Campaign configuration.

## Phase C — Ruleset / Template System

1. Character templates.
2. configurable default attributes.
3. configurable derived formulas.
4. configurable default resources.
5. custom campaign game data.

## Phase D — Advanced Features

Possible future additions:

- dice roller
- character history / audit log
- session history
- conditions / buffs / debuffs
- combat tracker
- shared party inventory
- campaign handouts
- media/R2 storage
- GM-created item/ability library
- character import/export
- mobile-focused character sheet

---

# 19. Current Canonical Character Status Summary

For quick reference, a normal Character should eventually be able to contain:

```text
IDENTITY
Name
User / Owner
Role / Class
Level
Age
Gender
Alignment
Occupation / Background
Status
Portrait
Summary

PRIMARY ATTRIBUTES
STR — Strength
DEX — Dexterity
CON — Constitution
APP — Appearance
POW — Power
INT — Intelligence
SIZ — Size
EDU — Education

SECONDARY / DERIVED
SAN  — Sanity
IDEA — Idea
LUCK — Luck
KNOW — Knowledge

RESOURCES
HP
MP
SP
SAN (current/max when applicable)
Custom Resources

CHARACTER CONTENT
Inventory
Abilities / Skills / Spells / Traits
Notes
Custom Attributes
```

This list is the default product specification, not a limitation. Custom campaigns may add or remove attributes while retaining the same underlying Character architecture.
