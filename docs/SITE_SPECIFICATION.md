# D&D Campaign Hub — Site & Character System Specification

> Status: **Canonical design document**  
> Purpose: Source of truth for website, database, Player, GM, character-creation, character-sheet and progression development.  
> Production site: `https://dungeon-and-dragon.lchjames.com/`

---

# 1. Product Direction

D&D Campaign Hub is a web-based TRPG character and campaign management system designed to support mixed settings such as fantasy, science fiction, modern, horror and custom worlds.

The old offline spreadsheet is a structural reference only. The web system is not a direct CoC conversion.

The platform has two clearly separated workspaces:

- **Player** — create a User, unlock it with a 4-digit Key, create and play owned Characters.
- **GM** — administer campaigns, Characters, Classes/Occupations, game content, progression, special Skills and rules.

---

# 2. Non-Negotiable Storage Rule

## 2.1 Cloudflare D1 is the only authoritative data store

All persistent application/game data must live in Cloudflare D1.

This includes:

- Users
- Key verification data
- Sessions metadata
- Characters
- Character ownership
- Character Level
- Class / Occupation
- Attributes
- LUCK
- Resources
- Skills
- Skill-tree nodes and edges
- Inventory
- Attacks
- Notes
- Campaign settings
- GM settings
- Character-generation results
- progression/history data

## 2.2 Do not design around localStorage

The application must **not** use browser localStorage as a persistence layer.

Do not keep parallel local copies of Character, Skill, Inventory, Resource or User data.

Do not implement "local first then sync later" as the normal architecture.

Temporary interface state should remain in memory for the current page/session only unless a server-side setting is intentionally added later.

Authentication session state is represented by the server-issued Secure + HttpOnly cookie, not localStorage.

```text
Browser UI
    ↓ HTTPS API
Cloudflare Worker
    ↓
Cloudflare D1
```

D1 is the source of truth.

---

# 3. Player Identity

A Player uses only:

- **User** — player-facing name, e.g. `swolf`
- **Key** — exactly four numeric digits, e.g. `4821`

No email address or traditional long password is required for normal Player access.

The Key must not be stored as plaintext.

One User may own multiple Characters:

```text
User: swolf
├── Character A
├── Character B
└── Character C
```

---

# 4. Character Ownership

Every Character belongs to a User through D1:

```text
characters.owner_user_id -> users.id
```

When a Player creates a Character:

1. Worker resolves the current authenticated Session.
2. Worker gets `user.id`.
3. Worker inserts the new Character with that `owner_user_id`.
4. Browser never chooses another User ID.

The API must reject attempts to read or modify another User's Character.

---

# 5. Site Structure

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

Player and GM interfaces remain visually and functionally separated.

---

# 6. Character-Creation Philosophy

A new Character should begin simple and relatively undefined.

The Character's identity, Class/Occupation and specialist abilities should emerge through play and GM involvement rather than being fully selected during creation.

Confirmed starting principles:

- Player creates their own Character.
- Character always starts at **Level 1**.
- Player cannot choose starting Level.
- Player does **not** choose Class / Occupation during creation.
- Class / Occupation begins **Unassigned**.
- GM assigns or develops the Character's Class / Occupation later.
- Eight core Attributes are rolled randomly by the server.
- Player cannot redistribute rolls.
- Server protects against extremely weak or strong total rolls.
- LUCK is retained as a core Character value.
- Only a small genre-neutral set of Base Skills exists at creation.
- Specialist Skills are mainly learned later.

---

# 7. Character Identity

## 7.1 Player-editable creation fields

Initial Character creation may contain:

| Field | Required | Owner |
|---|---:|---|
| Character Name | Yes | Player |
| Age | No | Player |
| Gender | No | Player |
| Education / School | No | Player |
| Birthplace | No | Player |
| Residence | No | Player |
| Portrait | No | Player |
| Background / Summary | No | Player |

The exact number of optional background fields may later be simplified in the UI.

## 7.2 Server-controlled creation fields

The following values are **not entered by the Player**:

| Field | Initial value | Controlled by |
|---|---|---|
| Owner User | authenticated User | Server |
| Level | `1` | Server |
| Class / Occupation | `Unassigned` / `NULL` | GM later |
| Status | `active` | Server |
| Core Attributes | server dice result | Server |
| LUCK | rules calculation | Server |
| HP Max | rules calculation | Server |
| other derived values | rules calculation | Server |

## 7.3 Level rule

Every newly created Character starts at:

```text
Level = 1
```

The Player creation API must ignore any client-submitted Level value.

The creation page must not display a Level input.

Future Level progression is controlled through the progression/game system and/or GM rules.

## 7.4 Class / Occupation rule

A new Character starts without a finalized profession/class:

```text
Class / Occupation = Unassigned
```

or database equivalent:

```text
class_id = NULL
occupation = NULL
```

The Player creation page must not display a Class, Role or Occupation input.

The GM later determines or assigns it based on:

- story development
- training
- Character behavior
- world/campaign rules
- faction membership
- achievements
- transformations
- special events

This prevents the creation process from locking the Character into a build before play begins.

---

# 8. Core Character Attributes

Eight primary Attributes are retained from the old spreadsheet because they work across many genres.

| Code | Name | Meaning | Initial Roll |
|---|---|---|---|
| STR | Strength / 力量 | physical strength | 3D6 |
| DEX | Dexterity / 敏捷 | speed, coordination, reaction | 3D6 |
| CON | Constitution / 體質 | health and endurance | 3D6 |
| APP | Appearance / 外貌 | presence and impression | 3D6 |
| POW | Power / 意志 | resolve, will and supernatural potential | 3D6 |
| INT | Intelligence / 智力 | reasoning and problem solving | 2D6 + 6 |
| SIZ | Size / 體型 | physical size/build | 2D6 + 6 |
| EDU | Education / 教育 | general learned knowledge | 3D6 + 3 |

These are first-class Character values in the UI.

They should be stored in D1 using an extensible structure so new campaign Attributes can be introduced later without redesigning the entire database.

---

# 9. Random Attribute Generation

## 9.1 Fully random direct assignment

Each Attribute receives its own roll.

```text
STR -> 3D6
DEX -> 3D6
CON -> 3D6
APP -> 3D6
POW -> 3D6
INT -> 2D6 + 6
SIZ -> 2D6 + 6
EDU -> 3D6 + 3
```

Example:

```text
STR  8
DEX  16
CON  10
APP  9
POW  13
INT  15
SIZ  12
EDU  14
```

The Player cannot move `DEX 16` into STR or otherwise redistribute results.

## 9.2 Server-side generation only

The browser must not submit final Attribute numbers as trusted input.

The Worker generates and validates the roll.

The accepted generation result is stored directly in D1.

## 9.3 Total-stat balance gate

Starting Characters should not be extremely strong or weak.

```text
Primary Total = STR + DEX + CON + APP + POW + INT + SIZ + EDU
```

The expected average of the current dice set is approximately:

```text
92
```

Initial proposed acceptance range:

```text
84 <= Primary Total <= 100
```

If a complete roll is outside the accepted band, the server rerolls the entire set internally until it produces one valid result.

The accepted minimum/maximum should eventually be GM/Campaign-configurable values stored in D1.

## 9.4 Preserve individual weaknesses and strengths

Only the total is balanced.

Individual Attributes are allowed to be unusually low or high.

This is valid:

```text
STR  6
DEX  17
CON 10
...
```

provided the complete total passes the balance gate.

## 9.5 No reroll farming

Once the server produces a valid starting set, that result is stored and treated as the Character's creation result.

Normal Players do not receive unlimited reroll controls.

GM may later receive an administrative reroll/reset function.

---

# 10. LUCK and Derived Status

## 10.1 LUCK

LUCK is a permanent cross-genre Character value.

Initial rule:

```text
LUCK = POW × 5
```

Possible uses:

- chance events
- fortunate coincidences
- loot/event checks
- emergency fortune rolls
- narrative luck
- GM-defined Luck checks

The formula should live in the server-side rules/configuration layer so it can be changed later without changing database structure.

## 10.2 HP

Initial maximum HP formula:

```text
Max HP = ceil((CON + SIZ) / 2)
```

Current HP changes during play and is stored in D1.

## 10.3 MP / Energy

Initial optional formula:

```text
Max MP = POW
```

MP is not required in every campaign and may later be renamed, disabled or replaced.

## 10.4 Damage Bonus

Damage Bonus is automatically derived from STR + SIZ using a configurable rule/table.

Player does not manually enter Damage Bonus.

## 10.5 Removed CoC-specific mandatory values

The following are not mandatory core Character values:

- IDEA
- KNOW
- SAN
- Cthulhu Mythos

SAN may exist as a campaign-defined Resource when needed.

---

# 11. Resources / Character Status

Resources are mutable values stored in D1.

Core/default presentation:

```text
Level        1+      [Level 1 at creation]
Class        Unassigned / GM-assigned
HP           Current / Max
LUCK         core value
MP           Current / Max      [only if campaign enables it]
Damage Bonus derived
```

Campaign-defined Resources can include:

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

Generic D1 Resource concept:

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

---

# 12. Base Skill System

New Characters receive only a deliberately small set of genre-neutral Base Skills.

Initial proposed set:

## Awareness

- Perception / 觀察
- Investigation / 調查
- Insight / 洞察

## Physical

- Athletics / 運動
- Acrobatics / 靈巧
- Stealth / 潛行
- Survival / 生存

## Social

- Persuasion / 說服
- Deception / 欺瞞
- Intimidation / 威嚇

## Practical

- First Aid / 急救
- Craft & Repair / 製作與修理

## Combat

- Melee / 近戰
- Ranged / 遠程
- Dodge / 閃避

This list is intentionally small and may be refined before implementation.

The following are not default creation Skills:

- fixed language families
- individual sciences
- archaeology
- accounting
- law
- photography
- specific vehicle skills
- specific weapon-family skills
- Cthulhu Mythos
- setting-specific specialist catalogues

---

# 13. Learned / Unique Skills

Character individuality is expected to emerge primarily after Character creation.

Characters may gain Skills through:

- study
- training
- repeated practice
- teachers
- books/manuals
- quests
- encounters
- factions
- items
- technology
- supernatural events
- GM/story rewards

Examples:

```text
Swordsmanship
Iaido
Plasma Rifle Handling
Starship Navigation
Alchemy
Rune Engraving
Necromancy
Cybernetic Repair
Dragon Riding
Quantum Physics
```

Conceptual D1 model:

```text
Skill
├── id
├── character_id
├── skill_definition_id (optional)
├── custom_name
├── category
├── rank / value
├── description
├── source
├── learned_at
├── parent_skill_id
├── node_type
└── metadata
```

The old spreadsheet formula:

```text
Initial + Occupation + Interest + Growth = Total
```

is removed from the default web rules.

---

# 14. Dynamic Skill / Talent Tree

## 14.1 Core concept

The Character Skill interface uses a large zoomable node graph inspired by the interaction pattern of ARPG talent trees such as Path of Exile, without copying proprietary art/layout/assets.

It is **Character-specific and dynamic**.

There is not one enormous fixed global tree that every Character must use.

A new Level-1 Character starts with only Base Skill roots. As the Character learns new Skills, the Character's own graph grows.

Example:

```text
Melee
 └── Swordsmanship
      ├── Sword Mastery
      └── Iaido
           └── Void Draw

Craft & Repair
 └── Engineering
      ├── Cybernetics
      └── Mech Maintenance

Ranged
 └── Firearms
      └── Plasma Rifle Handling
```

## 14.2 Starting tree

A Level-1 newly created Character starts with only generic Base Skill nodes.

Class/Occupation branches do not appear until the GM assigns/develops a Class or until gameplay creates relevant branches.

## 14.3 Node types

Initial node types:

```text
BASE
LEARNED
SPECIALIZATION
MASTERY
UNIQUE / EVENT
CLASS / GM-GRANTED
```

### Base Node

Universal starting capability.

### Learned Node

Skill gained through normal play/training.

### Specialization Node

A narrower branch from another Skill.

### Mastery Node

Major advanced capability.

### Unique / Event Node

Rare story/event transformation or reward.

### Class / GM-Granted Node

Node or branch introduced because the GM assigns a Class/Occupation or another campaign-level role.

## 14.4 Node states

```text
LOCKED
AVAILABLE
LEARNED
MASTERED
SPECIAL / GM-GRANTED
```

## 14.5 Edge types

```text
PREREQUISITE
SPECIALIZATION
UPGRADE
RELATED
CLASS LINK
STORY LINK
```

## 14.6 Unlocking is not automatically point-buy

The Skill Tree does not inherently use passive points.

A node can unlock because the Character:

- trains
- studies
- reaches a Level
- meets an Attribute requirement
- learns a parent Skill
- meets a teacher
- completes a quest
- obtains an item
- receives GM approval
- receives a Class/Occupation
- triggers a story event

## 14.7 Requirements are data-driven

Possible requirements:

```text
minimum STR / DEX / INT / etc.
minimum LUCK
minimum Character Level
Class / Occupation
parent Skill learned
parent Skill rank
training progress
required Item
required Teacher
required Event/Campaign flag
GM approval
```

Requirements must be validated server-side.

## 14.8 Interface behavior

Skill Tree UI should support:

- pan/drag
- zoom
- reset/centre
- search
- filter
- click/tap node details
- prerequisite path highlighting
- unlocked path highlighting
- locked requirement display
- mobile interaction

Initial rendering direction: SVG.

All graph data is stored in D1. Screen coordinates, if cached, are presentation metadata only.

---

# 15. Language System

There is no dedicated default language subsystem.

If a language matters mechanically, it may be represented as an ordinary learned Skill.

There is no fixed global Asian/European/African/Ancient language table.

---

# 16. Combat / Attacks

Attacks remain separate from Inventory.

Conceptual model:

```text
Attack
├── id
├── character_id
├── name
├── linked_skill_id
├── hit_value / calculation
├── damage_formula
├── attacks_per_round
├── notes
└── source_item_id
```

Example:

```text
Unarmed Strike
Skill: Melee
Damage: 1D3 + DB
```

Weapons may link Inventory Items to Attack definitions.

---

# 17. Inventory

Inventory is structured data stored in D1.

```text
Inventory Item
├── id
├── character_id
├── name
├── quantity
├── description / notes
├── category
└── metadata
```

Items may later grant:

- Attacks
- Resources
- Skill nodes
- temporary effects
- permanent progression

---

# 18. Character Creation Flow

The Character Builder should be short and should not ask the Player to define their final build.

Recommended flow:

```text
Step 1 — Identity
  Character Name
  optional personal/background fields

  NOT SHOWN:
  Level
  Class / Occupation
  Owner ID

Step 2 — Server Generation
  Level = 1
  Class / Occupation = Unassigned
  Roll STR / DEX / CON / APP / POW / INT / SIZ / EDU
  Apply server-side total-stat balance gate
  Calculate LUCK
  Calculate HP
  Calculate optional campaign Resources
  Calculate Damage Bonus

Step 3 — Starting Skills
  Attach Base Skill nodes
  No specialist catalogue
  No class selection
  No skill-point spending

Step 4 — Review
  Show generated Level-1 Character
  Player confirms creation

Step 5 — Persist
  Save the complete Character and related records directly to D1
```

No Character-creation data should rely on localStorage.

---

# 19. Character Sheet Layout

Recommended Player Character page:

```text
OVERVIEW
────────────────────────
Name
Level: 1+
Class / Occupation: Unassigned or GM-assigned
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
LUCK
MP        Current / Max      [if enabled]
Damage Bonus
Custom Campaign Resources

SKILL TREE
────────────────────────
Dynamic graph from D1

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

Primary tabs:

```text
Overview
Skill Tree
Combat
Inventory
Notes
```

---

# 20. Player Permissions

Player may:

- create a Character for themselves
- view owned Characters
- update permitted personal/background fields
- update mutable Resources
- manage permitted Inventory data
- view Base/Learned Skills
- interact with their Skill Tree
- update notes

Player may not:

- choose another Character owner
- set starting Level
- choose starting Class / Occupation
- bypass the Level-1 rule
- submit trusted Attribute values
- redistribute rolled Attributes
- farm unlimited starting rerolls
- view another User's Character
- directly grant protected Skills
- directly alter GM/campaign rules

---

# 21. GM Responsibilities

GM does **not** need to create ordinary Player Characters.

GM responsibilities include:

- view Users
- view Characters
- assign/change Class / Occupation
- manage future Level/progression rules
- administratively correct Character data
- administratively reroll/reset when justified
- configure Attribute total acceptance range
- configure Campaign Resources
- configure formulas such as LUCK/HP/MP/Damage Bonus
- create/manage Skill definitions
- create Skill prerequisites and relationships
- grant/remove special or Class Skills
- manage Campaign settings
- archive/delete Characters

Class/Occupation is therefore principally a **GM-managed progression field**, not a creation choice.

---

# 22. Database Principles

Cloudflare D1 is the only persistent source of truth.

Core logical entities:

```text
users
sessions
characters
character_attributes
character_resources
class_definitions / occupations
character_class_history
skill_definitions
character_skills
skill_edges / prerequisites
character_inventory
character_attacks
settings
progression_history
```

## 22.1 Characters

Conceptual Character record:

```text
Character
├── id
├── owner_user_id
├── name
├── level                  default 1
├── class_id               nullable / GM-controlled
├── status
├── portrait
├── background fields
├── created_at
└── updated_at
```

`level` and `class_id` must not be trusted from the Player's create request.

## 22.2 Skill graph

Skill Tree data is graph data in D1 rather than a static image.

```text
skill_definitions
character_skills
skill_edges
```

Logical graph relationships are authoritative. Visual positions are not game rules.

---

# 23. Security and Integrity Rules

- User + Key validation occurs server-side.
- 4-digit Key is not stored in plaintext.
- Session uses Secure + HttpOnly cookie.
- Character ownership is server-enforced.
- D1 is the only authoritative persistent store.
- Do not persist application/game data in localStorage.
- Character creation ignores client-supplied owner ID.
- Character creation ignores client-supplied Level.
- Character creation ignores client-supplied Class/Occupation.
- New Character Level is always `1`.
- New Character Class/Occupation is always Unassigned until GM action.
- Attribute generation is server-side.
- Attribute balance validation is server-side.
- Skill progression/unlock validation is server-side.

---

# 24. Recommended Development Order

## Phase A — Rebuild Character Creation

1. Remove Level input from Player creation UI.
2. Remove Role/Class/Occupation input from Player creation UI.
3. Make server always insert `level = 1`.
4. Make server always insert `class/occupation = NULL / Unassigned`.
5. Implement server-side eight-Attribute dice generation.
6. Implement total-stat balance gate.
7. Store accepted Attribute set in D1.
8. Calculate/store required Character Status values.
9. Add LUCK.
10. Seed Base Skills in D1.

## Phase B — Character Sheet

1. Display Level and GM-assigned Class/Occupation read-only to Player.
2. Display eight Attributes.
3. Display HP/LUCK/Resources.
4. Add structured Inventory.
5. Add Attacks.

## Phase C — Skill Tree UI

1. Build SVG graph renderer.
2. Read nodes/edges from D1 API.
3. Add pan/zoom.
4. Add node state styling.
5. Add node detail panel.
6. Add search/filter.
7. Add path highlighting.
8. Add mobile controls.

## Phase D — Learning and Growth

1. Define progression/rank rules.
2. Add learning/training history.
3. Add custom learned Skills.
4. Add prerequisite validation.
5. Add GM/story nodes.
6. Grow graph dynamically.

## Phase E — Class / Occupation System

1. Build GM Class/Occupation assignment UI.
2. Define optional Class definitions.
3. Link Class/Occupation to Skill branches/requirements.
4. Record assignment/change history.
5. Decide Level progression rules.

## Phase F — GM D1 Workspace

1. GM authentication/authorization.
2. User/Character browser.
3. Character administration.
4. progression management.
5. Skill graph/content administration.
6. Campaign rules/settings.

---

# 25. Canonical Decisions

The following decisions must not be silently reversed during implementation:

1. Player and GM are separate workspaces.
2. Player identity uses User + 4-digit Key.
3. Cloudflare D1 is the only authoritative persistent data store.
4. Do not build game persistence around localStorage.
5. Players create their own Characters.
6. Character owner comes from authenticated Session.
7. Every newly created Character is **Level 1**.
8. Player cannot choose or edit starting Level.
9. Class / Occupation is **not selected during Player Character creation**.
10. New Character Class / Occupation starts Unassigned / NULL.
11. GM manages Class / Occupation later.
12. Core Attributes are STR, DEX, CON, APP, POW, INT, SIZ and EDU.
13. Starting Attributes are fully randomized and directly assigned by the server.
14. Server applies a total-stat balance gate.
15. Players cannot redistribute or endlessly reroll valid starting Attributes.
16. LUCK is a core cross-genre value.
17. Cthulhu Mythos is removed.
18. Fixed language systems are removed.
19. Default Skills are deliberately small and genre-neutral.
20. Specialist/unique Skills are mainly learned during play.
21. The old Occupation + Interest + Growth Skill Point system is removed.
22. Character Skill progression is visualized as a dynamic zoomable node graph.
23. The Skill Tree is Character-specific and grows over time.
24. The tree does not require a passive-point economy.
25. Skill relationships and unlocks are data-driven and server-validated.
26. Character page uses Overview / Skill Tree / Combat / Inventory / Notes as the primary interaction model.
