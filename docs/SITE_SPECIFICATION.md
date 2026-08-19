# D&D Campaign Hub — Site & Character System Specification

> Status: **Canonical design document**  
> Purpose: Source of truth for future website, database, Player, GM, character-creation and character-sheet development.  
> Production site: `https://dungeon-and-dragon.lchjames.com/`

---

# 1. Product Direction

D&D Campaign Hub is a lightweight web-based TRPG character and campaign management system intended to support multiple genres, including fantasy, science fiction, modern, horror and custom settings.

The web version is **not** a direct digital copy of the old offline CoC-style spreadsheet. The spreadsheet is the structural reference, while setting-specific systems are removed or generalized.

The platform has two separated experiences:

- **Player side** — create a User, unlock it with a 4-digit Key, create and manage owned Characters, and use Character Sheets during play.
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

The Player and GM interfaces must remain functionally and visually separate.

---

# 4. Character System Philosophy

The old spreadsheet provides the base concepts, but the web Character system is genre-neutral.

## Keep

- Character identity/background
- Eight core attributes
- LUCK
- Randomized Character generation
- Server-side balance protection
- HP and optional campaign Resources
- Small universal Base Skill set
- Character growth through learned/unique Skills
- Combat/Attacks
- Inventory
- Notes
- Long-term progression

## Remove from the core system

- Cthulhu Mythos / 克蘇魯神話
- Fixed language families and language tables
- CoC-specific specialist-skill catalogue
- CoC empty skill slots
- Occupation Skill Point budget
- Interest Skill Point budget
- Spreadsheet-only helper/modifier fields
- Duplicate manually stored derived values

## Optional / Campaign-defined rather than core

- SAN / Sanity
- Stress
- Mana / MP
- Energy
- Corruption
- Shield
- Reputation
- Faith
- Rage
- any setting-specific Resource

This allows fantasy, science-fiction, modern and horror campaigns to share the same underlying Character model.

---

# 5. Character Identity

Character creation begins with identity information.

| Field | Required | Notes |
|---|---:|---|
| Character Name | Yes | Main display name |
| Owner User | Automatic | Taken from authenticated Session |
| Occupation / Role | No | Current profession/archetype; does not lock a class |
| Age | No | Character background |
| Gender | No | Free/selectable value |
| Education / School | No | Background, separate from EDU stat |
| Birthplace | No | Background |
| Residence | No | Background |
| Era / Setting | No | May later become Campaign-controlled |
| Portrait | No | Character image |
| Summary / Background | No | Character description |

`Player Name / PL` from the spreadsheet is removed because the authenticated User already identifies the owner.

---

# 6. Core Character Attributes

The following eight attributes are retained as first-class Character values.

| Code | Name | Meaning | Initial Roll |
|---|---|---|---|
| STR | Strength / 力量 | Raw physical strength | 3D6 |
| DEX | Dexterity / 敏捷 | Coordination, speed and reaction | 3D6 |
| CON | Constitution / 體質 | Health, stamina and endurance | 3D6 |
| APP | Appearance / 外貌 | Presence and physical/social impression | 3D6 |
| POW | Power / 意志 | Resolve, mental force and supernatural potential | 3D6 |
| INT | Intelligence / 智力 | Reasoning and problem solving | 2D6 + 6 |
| SIZ | Size / 體型 | Physical size/build | 2D6 + 6 |
| EDU | Education / 教育 | General learned knowledge and education | 3D6 + 3 |

These are prominent in the Character Sheet UI.

D1 may store them in an extensible attribute table so future custom attributes can be added without schema changes.

---

# 7. Random Character Generation

## 7.1 Fully Random Assignment

Attribute rolls are assigned directly to the attribute that generated them.

The Player does **not** receive a pool and redistribute the best rolls.

Example:

```text
STR -> 3D6    -> 11
DEX -> 3D6    -> 15
CON -> 3D6    -> 9
APP -> 3D6    -> 12
POW -> 3D6    -> 10
INT -> 2D6+6  -> 14
SIZ -> 2D6+6  -> 13
EDU -> 3D6+3  -> 16
```

## 7.2 Total-stat Balance Gate

Pure randomness can create excessively weak or strong starting Characters. The server therefore enforces a total-stat acceptance range.

```text
Primary Total = STR + DEX + CON + APP + POW + INT + SIZ + EDU
```

Expected average is approximately:

```text
92
```

Initial recommended accepted range:

```text
84 <= Primary Total <= 100
```

If the generated set is outside the accepted range, the **entire set is rerolled automatically by the server** until one valid set is produced.

The balance band should later become a GM/Campaign setting.

## 7.3 Preserve Individual Extremes

The balance gate controls only total starting power. Individual strengths and weaknesses are intentionally preserved.

Example:

```text
STR 6
DEX 17
CON 10
...
```

is valid if the total is acceptable.

## 7.4 No Reroll Farming

A valid generated set becomes locked for that Character creation.

```text
Create Character
      ↓
Server rolls attributes
      ↓
Server rejects out-of-band totals internally
      ↓
One valid randomized set is returned
      ↓
Set is locked
```

The ordinary Player UI must not provide unlimited reroll buttons.

GM may later have an administrative reroll/reset action.

---

# 8. LUCK and Derived Status

## 8.1 LUCK — Core Value

`LUCK` is retained as a permanent cross-genre Character value.

It can be used for:

- chance events
- fortunate coincidences
- escape checks
- loot/event rolls
- narrative fortune
- generic GM Luck checks

Initial legacy-compatible formula:

```text
LUCK = POW × 5
```

The formula should be implemented through the rules/configuration layer so it may be changed later without redesigning the Character database.

LUCK is displayed prominently in Character Status.

## 8.2 HP

Initial formula:

```text
Max HP = ceil((CON + SIZ) / 2)
```

Character Sheet stores/uses Current HP and derives or records Max HP according to the active ruleset.

## 8.3 MP / Energy

Initial default formula:

```text
Max MP = POW
```

MP is optional at Campaign level and may be renamed or disabled.

## 8.4 Damage Bonus

Damage Bonus is automatically derived from STR + SIZ using the legacy table or a future configurable rule.

It is not manually entered by the Player.

## 8.5 Removed Mandatory CoC Values

The following are not mandatory core Character values:

- IDEA
- KNOW
- SAN
- Cthulhu Mythos

SAN may exist as an optional Campaign Resource, but there is no mandatory global sanity system.

---

# 9. Resources / Character Status

Resources are mutable values used during play.

Core/default presentation:

```text
HP      Current / Max
LUCK    Derived/core value
MP      Current / Max     [only when Campaign enables it]
```

Campaigns may add:

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

Generic Resource model:

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

Spreadsheet-only modifier fields such as `SAN Increase/Decrease` are removed.

---

# 10. Base Skill System

The old spreadsheet skill catalogue is intentionally not copied in full.

New Characters begin with a small set of universal Skills that remain useful across fantasy, science-fiction, modern and mixed settings.

## 10.1 Initial Universal Base Skills

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

## 10.2 Removed Default Specialist Skills

The default Character creation process does not include fixed lists for:

- individual sciences
- archaeology
- accounting
- law
- photography
- specific vehicles
- individual weapon families
- Cthulhu Mythos
- language families
- ancient languages

Such capabilities can exist as learned Skills when relevant.

---

# 11. Learned / Unique Skills

Character individuality should develop primarily **after Character creation**.

Characters may gain Skills from:

- study
- repeated practice
- training
- teachers
- books/manuals
- quests
- encounters
- equipment
- factions
- supernatural events
- technological upgrades
- Campaign rewards

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
Ancient Imperial History
```

Generic learned Skill model:

```text
Skill
├── id
├── character_id
├── name
├── category
├── rank / value
├── description
├── source
├── learned_at
├── parent_skill_id (optional)
├── node_type
└── sort / graph metadata
```

The old spreadsheet model:

```text
Initial + Occupation + Interest + Growth = Total
```

is removed from the default rules.

Long-term Skill growth may use ranks, values, training progress or Campaign-specific progression, but this must be defined separately from the visual Skill Tree.

---

# 12. Dynamic Talent / Skill Tree Interface

## 12.1 Design Goal

The Character Skill interface should use a large, zoomable, node-and-connection layout **inspired by the interaction model of ARPG talent trees such as Path of Exile**, without copying proprietary artwork, exact layouts, names or visual assets.

The purpose is to make a Character's development visually readable.

The tree is **dynamic per Character**, not one enormous identical global tree shared by everyone.

A new Character begins with only Base Skills and a small central structure. As the Character learns new abilities, new branches/nodes appear.

Example:

```text
                         Sword Mastery
                              │
Melee ───── Swordsmanship ─── Iaido ─── Void Draw
  │
  └──── Unarmed ─── Grappling

Craft & Repair ─── Engineering ─── Cybernetics
                         │
                         └── Mech Maintenance

Ranged ─── Firearms ─── Plasma Rifle Handling
```

Two Characters should naturally develop different trees after enough play.

## 12.2 Tree Starting Structure

Recommended central layout:

```text
                      Awareness
                          │
             Physical ─ Character ─ Social
                          │
                 Practical / Combat
```

The exact visual geometry is presentation-only. Database relationships must not depend on X/Y coordinates.

Base Skills act as stable roots from which learned Skills may branch.

## 12.3 Node Types

Initial node types:

### Base Node

Universal starting Skill.

Examples:

- Melee
- Perception
- Survival
- Craft & Repair

### Learned Node

A Skill acquired during play.

Examples:

- Swordsmanship
- Engineering
- Alchemy

### Specialization Node

A narrower branch of another Skill.

Examples:

```text
Melee -> Swordsmanship -> Iaido
Ranged -> Firearms -> Sniping
Engineering -> Cybernetics
```

### Mastery / Major Node

Important advanced capability representing substantial training or Character identity.

Examples:

- Sword Mastery
- Master Hacker
- Archmage Theory
- Starship Commander

### Unique / Event Node

Rare capability obtained from story events, artifacts, transformations or Campaign rewards.

These nodes may not follow normal training rules.

## 12.4 Node States

Visual states should include:

```text
LOCKED
AVAILABLE
LEARNED
MASTERED
SPECIAL / GM-GRANTED
```

Suggested visual behavior:

- Locked — dim
- Available — highlighted edge/node
- Learned — fully illuminated
- Mastered — stronger ring/border
- Special — distinctive icon/frame

Exact colours remain a UI/theme decision.

## 12.5 Connections / Edges

Connections represent relationships, not merely decoration.

Initial edge types:

```text
PREREQUISITE
SPECIALIZATION
UPGRADE
RELATED
SPECIAL / STORY LINK
```

For example:

```text
Melee
  └─ Swordsmanship        prerequisite
       └─ Iaido            specialization
            └─ Void Draw   story/unique advancement
```

## 12.6 Unlocking Is Not Automatically a Point-buy System

The visual tree must not force the Campaign to use PoE-style passive points.

A node can become learned because the Character:

- completed training
- studied a book
- met a teacher
- used a Skill successfully enough times
- completed a quest
- obtained a relevant item
- met stat prerequisites
- received GM approval/event reward

A future Campaign may optionally introduce `Learning Points`, but the graph UI and database model must work without them.

## 12.7 Node Requirements

A Skill node may optionally require:

```text
Minimum STR / DEX / INT / etc.
Minimum LUCK
Parent Skill learned
Parent Skill rank
Character Level
Training progress
Required Item
Required Teacher
Required Campaign flag/event
GM approval
```

Requirements must be data-driven rather than hard-coded into the visual component.

## 12.8 Tree Interaction

Player Skill Tree should support:

- pan / drag
- zoom in/out
- reset/centre view
- search Skills by name
- filter by category
- click/tap a node for details
- highlight prerequisite path
- highlight unlocked path
- show locked requirements
- mobile pinch zoom where practical
- desktop mouse wheel zoom

Recommended node detail panel:

```text
Swordsmanship
─────────────
Type: Learned Skill
Rank: 2
Source: Training — Master Ren
Parent: Melee

Requirements for next node:
DEX 12+
Swordsmanship Rank 2

Description...
```

## 12.9 Technical Rendering Direction

Initial web implementation should prefer **SVG** because the expected Character trees are tens to hundreds of nodes rather than tens of thousands.

SVG provides:

- crisp scalable lines/nodes
- straightforward click/tap targets
- CSS styling
- DOM accessibility
- easy tooltips/detail interactions
- transform-based pan/zoom

If future Characters can contain thousands of nodes, rendering may later move to Canvas/WebGL without changing the underlying graph data model.

The database stores logical nodes and edges. Screen coordinates may be cached for layout but are never authoritative game data.

---

# 13. Language System

The old spreadsheet language subsystem is completely removed from the default Character Sheet.

There are no fixed global language categories.

If language becomes mechanically relevant, it is represented as an ordinary learned Skill.

Examples:

```text
Elvish
Martian Trade Cant
Ancient Imperial Script
```

---

# 14. Combat / Attacks

Attacks remain separate from Inventory.

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

Plasma Rifle
Skill: Plasma Rifle Handling
Damage: Campaign-defined
```

A weapon Item may link to an Attack without being the same database entity.

---

# 15. Inventory

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

Players may gain and lose Items during play.

Items may later grant Resources, Attacks, Skill Tree nodes or temporary modifiers.

---

# 16. Character Creation Flow

Recommended Character Builder:

```text
Step 1 — Identity
  Name
  Occupation / Role
  Age / Gender
  Background

Step 2 — Random Attributes
  Server rolls STR / DEX / CON / APP / POW / INT / SIZ / EDU
  Server applies total-stat balance gate
  Player receives one accepted randomized set

Step 3 — Derived Status
  HP
  LUCK
  optional MP
  Damage Bonus
  Campaign-defined Resources

Step 4 — Base Skills
  Display the universal starting nodes
  No giant specialist catalogue
  No occupation/interest point spending

Step 5 — Review
  Confirm Character
  Save to D1
```

Character creation should be fast. Deep specialization happens during play.

The first time the completed Character is opened, the Skill Tree shows only the Base Skill structure. Future learning grows the graph.

---

# 17. Character Sheet Layout

Recommended Player Character page:

```text
OVERVIEW
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
LUCK
MP        Current / Max      [if enabled]
Damage Bonus
Custom Campaign Resources

SKILL TREE
────────────────────────
Interactive zoomable dynamic graph
Base Skills + Learned Skills + Masteries + Unique nodes

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

Recommended Character navigation tabs:

```text
Overview
Skill Tree
Combat
Inventory
Notes
```

---

# 18. Player Permissions

Player can:

- create their own Character
- view owned Characters
- update permitted Character background fields
- update mutable Resource values
- manage permitted Inventory data
- view Base Skills
- acquire Learned Skills through the future learning system
- navigate their Skill Tree
- update notes

Player cannot:

- create a Character for another User
- change `owner_user_id`
- view another User's Character through API manipulation
- bypass server-side random-generation/balance rules
- manually unlock protected Skills without satisfying game rules
- directly modify GM/Campaign administrative data

---

# 19. GM Responsibilities

GM is not required to create or assign ordinary Player Characters.

GM functions focus on:

- view all Users
- view all Characters
- edit/fix Characters when necessary
- administrative reroll/reset
- configure Character-generation balance band
- configure Campaign Resources
- configure LUCK/rules formulas
- create Skill definitions/content
- create Skill prerequisites/relationships
- grant/remove special Skills when appropriate
- manage Campaign/global settings
- archive/delete Characters

---

# 20. Database Principles

Cloudflare D1 is the source of truth.

Core logical entities:

```text
users
sessions
characters
character_attributes
character_resources
skills / skill_definitions
character_skills
skill_edges / prerequisites
character_inventory
character_attacks
settings
```

## 20.1 Skill Graph Data

The Skill Tree must be represented as graph data rather than an image.

Conceptual structure:

```text
skill_definitions
├── id
├── name
├── category
├── node_type
├── description
├── default_base_skill
└── metadata

character_skills
├── id
├── character_id
├── skill_definition_id (nullable for fully custom skills)
├── custom_name
├── rank / value
├── state
├── source
├── learned_at
└── metadata

skill_edges
├── id
├── character_id / template scope
├── from_skill_id
├── to_skill_id
├── edge_type
└── requirement_data
```

Graph layout coordinates are presentation metadata only.

---

# 21. Security Rules

- User/Key authentication is server-side.
- Character ownership is enforced server-side.
- 4-digit Key is never stored as plaintext.
- Player APIs scope Character queries to authenticated `user.id`.
- Character creation ignores any client-supplied owner ID.
- Attribute generation and balance validation are server-side.
- Skill unlock validation is server-side once progression is implemented.
- D1 is authoritative.
- localStorage is limited to non-authoritative UI preferences.

---

# 22. Development Order

Recommended implementation sequence:

## Phase A — Character Builder

1. Complete Identity form.
2. Implement server-side randomized eight-stat generator.
3. Implement total-stat balance gate.
4. Lock the accepted roll.
5. Add LUCK calculation.
6. Add HP / optional MP / Damage Bonus calculation.
7. Save complete Character to D1.

## Phase B — Base Skills

1. Finalize universal Base Skill list.
2. Seed Base Skill definitions.
3. Create starting Character Skill nodes.
4. Define initial attribute-to-skill relationships if required.

## Phase C — Skill Tree UI

1. Build SVG graph renderer.
2. Add pan and zoom.
3. Add node state styling.
4. Add node detail panel.
5. Add search/filter.
6. Add prerequisite-path highlighting.
7. Implement responsive/mobile interaction.

## Phase D — Learning / Growth

1. Define how training progress works.
2. Define rank/value progression.
3. Implement learned/custom Skill creation.
4. Implement prerequisite validation.
5. Implement GM-granted/story nodes.
6. Allow the graph to grow dynamically.

## Phase E — Combat and Inventory Integration

1. Attack entities.
2. Link Attacks to Skills.
3. Link Items to Attacks.
4. Allow Items/events to grant temporary or permanent Skill nodes.

## Phase F — GM D1 Workspace

1. GM authentication/authorization.
2. User/Character browser.
3. Character administration.
4. Skill graph/content administration.
5. Campaign Resource/rules settings.

---

# 23. Current Canonical Decisions

Confirmed decisions that should not be silently reversed during implementation:

1. Player and GM are separate workspaces.
2. Player identity is User + 4-digit Key.
3. D1 is the authoritative data store.
4. Players create their own Characters.
5. Character ownership comes from authenticated Session, never client input.
6. Core attributes are STR, DEX, CON, APP, POW, INT, SIZ and EDU.
7. Initial attributes are fully randomized and directly assigned.
8. Server applies a total-stat balance gate to avoid extreme starting power.
9. Ordinary Players cannot farm rerolls after receiving a valid set.
10. `LUCK` is retained as a core cross-genre value.
11. Cthulhu Mythos is removed.
12. Fixed language systems are removed.
13. The default Skill catalogue is deliberately small and genre-neutral.
14. Specialist/unique Skills are primarily learned during play.
15. The old Occupation + Interest + Growth Skill Point model is removed.
16. Character Skill progression is presented as a dynamic zoomable node graph/talent tree.
17. The Skill Tree is Character-specific and grows over time rather than being one fixed global tree.
18. The talent-tree visual model does not require a passive-point economy.
19. Skill relationships, requirements and unlocks are data-driven and server-validated.
20. The Character Sheet should ultimately use Overview / Skill Tree / Combat / Inventory / Notes as the primary interaction model.
