# D&D Campaign Hub — Site & Character System Specification

> Status: **Canonical design document**  
> Purpose: Source of truth for future website, database, Player, GM, character-creation and character-sheet development.  
> Production site: `https://dungeon-and-dragon.lchjames.com/`

---

# 1. Product Direction

D&D Campaign Hub is a lightweight web-based TRPG character and campaign management system intended to support multiple genres, including fantasy, science fiction, modern, horror and custom settings.

The web version is **not** a direct digital copy of the old offline CoC-style spreadsheet. The spreadsheet is the design reference, but setting-specific systems should be removed or generalized.

The platform has two separated experiences:

- **Player side** — create a User, unlock it with a 4-digit Key, create and manage owned characters, and use character sheets during play.
- **GM side** — view/manage campaign data, Users, Characters, game content, balance rules and administrative settings.

Cloudflare D1 is the authoritative database. Browser localStorage must not contain authoritative User, Character, Skill, Inventory, Resource or campaign data.

---

# 2. Identity and Ownership

## 2.1 Player Identity

A Player uses:

- **User** — player-facing name, e.g. `swolf`
- **Key** — exactly four numeric digits, e.g. `4821`

No email or traditional password is required.

One User may own multiple Characters:

```text
User: swolf
├── Character A
├── Character B
└── Character C
```

## 2.2 Character Ownership

Every Character has:

```text
characters.owner_user_id -> users.id
```

When a Player creates a Character, the Worker reads the authenticated User ID from the server-side Session and writes it into `owner_user_id`.

The browser must never be able to choose another User ID as the owner.

---

# 3. Site Structure

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

The Player and GM interfaces should remain functionally and visually separate.

---

# 4. Character System Philosophy

The old spreadsheet is used as the structural base, but the web system should be genre-neutral.

## Keep

- Character identity/background
- Core physical/mental attributes
- Randomized character generation
- Balanced character generation
- HP / MP-style resources
- Generic skills
- Combat/attacks
- Inventory
- Notes
- Character growth through learned skills

## Remove from the core system

- Cthulhu Mythos / 克蘇魯神話
- All fixed language families and language tables
- CoC-specific empty skill slots
- Occupation-skill point budget system
- Interest-skill point budget system
- Spreadsheet-only helper/modifier fields
- Duplicate manually stored derived values when they can be calculated

## Optional / campaign-defined rather than core

- SAN / Sanity
- Stress
- Mana / MP
- Energy
- Corruption
- Reputation
- any setting-specific resource

This allows a fantasy campaign, science-fiction campaign or horror campaign to use the same Character model without changing the database schema.

---

# 5. Character Identity

Character creation begins with identity information.

| Field | Required | Notes |
|---|---:|---|
| Character Name | Yes | Main display name |
| Owner User | Automatic | Taken from authenticated Session |
| Occupation / Role | No | Free text; represents current profession/archetype |
| Age | No | Character background |
| Gender | No | Free/selectable value |
| Education / School | No | Background, separate from EDU stat |
| Birthplace | No | Background |
| Residence | No | Background |
| Era / Setting | No | May later become Campaign-controlled |
| Portrait | No | Character image |
| Summary / Background | No | Short character description |

`Player Name / PL` from the spreadsheet is removed because the authenticated User already identifies the owner.

---

# 6. Core Character Attributes

The following eight attributes are retained from the old character table because they form a useful genre-neutral base.

| Code | Name | Meaning | Initial Roll |
|---|---|---|---|
| STR | Strength / 力量 | Raw physical strength | 3D6 |
| DEX | Dexterity / 敏捷 | Coordination, speed, reaction | 3D6 |
| CON | Constitution / 體質 | Health, stamina, endurance | 3D6 |
| APP | Appearance / 外貌 | Presence and physical impression | 3D6 |
| POW | Power / 意志 | Mental force, resolve, supernatural potential | 3D6 |
| INT | Intelligence / 智力 | Reasoning and problem solving | 2D6 + 6 |
| SIZ | Size / 體型 | Physical size/build | 2D6 + 6 |
| EDU | Education / 教育 | General learned knowledge and education | 3D6 + 3 |

These values are first-class Character attributes in the UI.

The D1 design may still store them in an extensible attribute table so new attributes can be added later without schema changes.

---

# 7. Random Character Generation

## 7.1 Core Rule

Character attributes are **fully randomized**.

The Player does not roll a pool and manually assign the best values to preferred attributes.

Example:

```text
STR -> roll 3D6 -> 11
DEX -> roll 3D6 -> 15
CON -> roll 3D6 -> 9
APP -> roll 3D6 -> 12
POW -> roll 3D6 -> 10
INT -> roll 2D6+6 -> 14
SIZ -> roll 2D6+6 -> 13
EDU -> roll 3D6+3 -> 16
```

Each result belongs directly to the attribute that generated it.

## 7.2 Balance Protection

Pure random rolls can produce characters that are far stronger or weaker than the intended starting range. The server therefore applies a total-stat acceptance band.

Initial proposed rule:

```text
Primary Total = STR + DEX + CON + APP + POW + INT + SIZ + EDU
```

Expected average using the above dice is approximately:

```text
92 total points
```

Initial recommended accepted range:

```text
84 <= Primary Total <= 100
```

If the generated total is outside this range, the **entire attribute set is automatically rerolled by the server** until a valid set is generated.

This preserves meaningful strengths and weaknesses while preventing extreme starting characters.

The accepted range must later be stored as a GM/Campaign setting so it can be adjusted without changing code.

## 7.3 No Reroll Farming

The Player must not be able to repeatedly reroll a valid result until a near-maximum set appears.

Recommended flow:

```text
Create Character
      ↓
Roll Attributes
      ↓
Server generates one balanced valid set
      ↓
Result becomes locked for this creation
```

A GM may have an administrative reset/re-roll function if required.

## 7.4 Extreme Individual Stats

A balanced total does not mean every stat should be average.

Example:

```text
STR 6
DEX 17
CON 10
...
```

is valid if the overall total is within the accepted range.

Characters should be allowed to have genuine strengths and weaknesses.

---

# 8. Derived Values

The old spreadsheet contained several CoC-derived values. They should not all remain mandatory.

## 8.1 Core Derived Values

### Maximum HP

Initial formula:

```text
Max HP = ceil((CON + SIZ) / 2)
```

### Maximum MP / Energy

Initial default formula:

```text
Max MP = POW
```

MP is a generic default resource and may be renamed/disabled by a Campaign.

### Damage Bonus

Damage Bonus should be automatically derived from STR + SIZ using the legacy table or a future configurable ruleset.

It should not require manual entry.

## 8.2 Removed as Mandatory Core Stats

The following old CoC-style fields are **not mandatory Character Status fields**:

- IDEA
- KNOW
- SAN
- Cthulhu Mythos

Reasons:

- IDEA duplicates concepts already represented by INT.
- KNOW strongly overlaps EDU.
- SAN is useful only for some campaign types and should instead be an optional Resource.
- Cthulhu Mythos is setting-specific and is completely removed from the core system.

## 8.3 Luck

`LUCK` is genre-neutral enough to remain a candidate global derived stat, but its final formula/status is still open for confirmation.

Possible initial rule:

```text
LUCK = POW × 5
```

Do not hard-code LUCK into irreversible database design until finalized.

---

# 9. Resources / Character Status

Resources represent values that change during play.

Core recommended resources:

```text
HP
Current / Max

MP (optional/default)
Current / Max
```

Campaigns may add additional resources:

```text
SAN
Stress
Energy
Shield
Corruption
Stamina
Rage
Faith
etc.
```

Generic resource model:

```text
Resource
├── id
├── character_id
├── key
├── label
├── current_value
├── max_value
├── description
└── sort_order
```

The spreadsheet field `SAN Increase/Decrease` is removed. Web applications should update the current Resource value directly.

---

# 10. Skill System

The old spreadsheet skill list is intentionally **not** copied in full.

The new model contains:

1. a small set of universal starting skills;
2. unique skills acquired later through study, training, experience, events, items or campaign systems.

## 10.1 Initial Universal Skills

Recommended first-pass base list:

### Awareness

- Perception / 觀察
- Investigation / 調查
- Insight / 洞察

### Physical

- Athletics / 運動
- Acrobatics / 靈巧
- Stealth / 潛行
- Survival / 生存

### Social

- Persuasion / 說服
- Deception / 欺瞞
- Intimidation / 威嚇

### Practical

- First Aid / 急救
- Craft & Repair / 製作與修理

### Combat

- Melee / 近戰
- Ranged / 遠程
- Dodge / 閃避

This list should stay deliberately small.

## 10.2 Skills Removed from Default Creation

Do not include fixed specialist lists such as:

- individual sciences
- archaeology
- accounting
- law
- photography
- specific vehicle skills
- specific weapon families
- Cthulhu Mythos
- language families
- ancient languages
- region-specific languages

These can become learned/custom skills if a campaign requires them.

## 10.3 Learned / Unique Skills

Characters can gain new skills after creation.

Examples:

```text
Plasma Rifle Handling
Starship Navigation
Alchemy
Rune Engraving
Necromancy
Cybernetic Repair
Dragon Riding
Quantum Physics
Sword Saint Technique
Ancient Imperial History
```

Generic learned skill model:

```text
Skill
├── id
├── character_id
├── name
├── category
├── value / level
├── description
├── source
├── learned_at
└── sort_order
```

`source` may describe why the Character has the skill:

```text
Training
Teacher
Book
Quest
Background
Item
Ability
Campaign Event
```

## 10.4 Skill Growth Model

The old spreadsheet split:

```text
Initial + Occupation + Interest + Growth = Total
```

This structure is removed from the default web system.

Recommended simpler model:

```text
Base Value + Training/Growth = Current Value
```

or, if a future ruleset uses ranks:

```text
Skill Rank / Level
```

The exact numerical progression system should be finalized separately before implementing long-term skill advancement.

---

# 11. Language System

The old spreadsheet language system is completely removed from the default web Character Sheet.

Do not create default fields for:

- Asian languages
- European languages
- African languages
- ancient Asian languages
- ancient European languages
- ancient African languages

If language becomes mechanically relevant in a specific Campaign, it can be represented as a learned/custom Skill.

Example:

```text
Learned Skill: Elvish
Learned Skill: Martian Trade Cant
```

There is no dedicated global language subsystem in the initial web version.

---

# 12. Combat / Attacks

Attacks should remain separate from Inventory.

```text
Attack
├── id
├── character_id
├── name
├── linked_skill_id (optional)
├── hit_value / calculation
├── damage_formula
├── attacks_per_round
├── notes
└── source_item_id (optional)
```

Examples:

```text
Unarmed Strike
Skill: Melee
Damage: 1D3 + DB

Laser Rifle
Skill: Plasma Rifle Handling
Damage: campaign-defined
```

A weapon Item may link to an Attack without being the same database entity.

---

# 13. Inventory

Inventory replaces the spreadsheet's large free-text item area.

```text
Inventory Item
├── id
├── character_id
├── name
├── quantity
├── description / notes
├── category
└── optional metadata
```

Players may gain and lose items during play.

---

# 14. Character Creation Flow

Recommended Character Builder:

```text
Step 1 — Identity
  Name
  Occupation / Role
  Age / Gender
  Background information

Step 2 — Random Attributes
  Server rolls STR / DEX / CON / APP / POW / INT / SIZ / EDU
  Server applies total-stat balance gate
  Player receives one accepted randomized set

Step 3 — Derived Status
  HP
  optional MP
  Damage Bonus
  campaign-defined resources

Step 4 — Base Skills
  Show universal starting skills
  No large specialist skill catalogue

Step 5 — Review
  Confirm Character
  Save to D1
```

Creation should be fast. Deep specialization is expected to happen during play, not during initial character creation.

---

# 15. Character Sheet Layout

Recommended Player-facing layout:

```text
CHARACTER
────────────────────────
Name
Occupation / Role
Age / Gender
Background
Portrait

CORE ATTRIBUTES
────────────────────────
STR   DEX   CON   APP
POW   INT   SIZ   EDU

STATUS
────────────────────────
HP        Current / Max
MP        Current / Max      [if enabled]
Custom campaign resources
Damage Bonus
LUCK                         [if finalized]

BASE SKILLS
────────────────────────
Perception
Investigation
Insight
Athletics
Acrobatics
Stealth
Survival
Persuasion
Deception
Intimidation
First Aid
Craft & Repair
Melee
Ranged
Dodge

LEARNED SKILLS
────────────────────────
Skills gained during play
+ future learning system

COMBAT
────────────────────────
Attacks / Weapons

INVENTORY
────────────────────────
Items / Quantity / Notes

NOTES
────────────────────────
Player notes
```

---

# 16. Player Permissions

Player can:

- create their own Character
- view owned Characters
- update permitted character background fields
- update current Resource values
- manage permitted Inventory data
- view/use base Skills
- acquire/manage learned Skills through future learning rules
- update notes

Player cannot:

- create a Character for another User
- change `owner_user_id`
- view another User's Character through API manipulation
- bypass server-side creation/balance rules
- directly change protected GM/campaign data

---

# 17. GM Responsibilities

The GM is **not** required to create or assign ordinary Player Characters.

GM functions should instead focus on:

- view all Users
- view all Characters
- edit/fix Characters when necessary
- reset/re-roll attributes administratively
- configure character-generation balance band
- configure campaign Resources
- create game content
- manage learned-skill rules/content
- manage campaign/global settings
- archive/delete Characters where appropriate

---

# 18. Database Principles

Cloudflare D1 is the authoritative source of truth.

Core logical entities:

```text
users
sessions
characters
character_attributes
character_resources
character_skills
character_inventory
character_attacks
settings
```

The design should prefer extensible child tables rather than adding a new database column for every future genre-specific stat.

---

# 19. Immediate Development Priorities

1. Replace current simple Character dialog with Character Builder.
2. Implement server-side balanced random generation for the 8 core attributes.
3. Add HP / MP / Damage Bonus calculation.
4. Replace current generic abilities model with Base Skills + Learned Skills.
5. Remove all Cthulhu Mythos and language-specific assumptions.
6. Move GM workspace fully to the same D1 source of truth.
7. Build long-term learned-skill progression after the base Character system is stable.

---

# 20. Open Design Decisions

The following should be confirmed before the corresponding feature is hard-coded:

1. Whether `LUCK` remains a universal derived stat.
2. Exact initial formulas/base values for each universal Skill.
3. Whether MP is enabled by default or only by Campaign.
4. Exact Damage Bonus table/ruleset for the first production version.
5. Whether the initial balance band remains `84–100` or is adjusted after playtesting.
6. Whether Era/Setting belongs to individual Characters or is inherited from Campaign.

Until confirmed, these should remain configurable or non-destructive in the data model.
