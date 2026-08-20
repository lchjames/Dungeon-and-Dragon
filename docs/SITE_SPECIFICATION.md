# D&D Campaign Hub — Site & Character System Specification

> Status: **Canonical design document**  
> Purpose: Source of truth for website, database, Player, GM, character creation, character sheet, progression and approval workflow development.  
> Production site: `https://dungeon-and-dragon.lchjames.com/`

---

# 1. Product Direction

D&D Campaign Hub is a web-based TRPG character and campaign management system intended to support mixed settings such as fantasy, science fiction, modern, horror and custom worlds.

The old offline spreadsheet is a structural reference only. The web system is not a direct CoC conversion.

The platform has two separated workspaces:

- **Player** — create a User, unlock it with a 4-digit Key, create owned Characters, view Character data and submit proposed changes.
- **GM** — administer campaigns, Characters, Classes/Occupations, progression, Skills, approval requests and rules.

---

# 2. Non-Negotiable Storage Rule

## 2.1 Cloudflare D1 is the only persistent source of truth

All persistent application and game data must live in Cloudflare D1.

This includes:

- Users
- Key verification data
- Session metadata
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
- Character change requests
- approval/audit history
- Campaign settings
- GM settings
- Character-generation results
- progression history

## 2.2 Do not use localStorage as application persistence

The application must not use browser localStorage for Character, User, Skill, Inventory, Resource, progression, approval or Campaign data.

Do not build:

- local-first game data
- browser/database two-way synchronization as the normal model
- authoritative Character snapshots in localStorage
- pending Character changes that exist only in the browser

Temporary UI state may exist in page memory while the page is open. Persistent UI preferences should only be added later if intentionally stored server-side.

Authentication state uses a Secure + HttpOnly server-issued cookie.

```text
Browser UI
    ↓ HTTPS API
Cloudflare Worker
    ↓
Cloudflare D1
```

D1 is authoritative.

---

# 3. Player Identity

Normal Player access uses only:

- **User** — player-facing name, e.g. `swolf`
- **Key** — exactly four numeric digits, e.g. `4821`

No email address or traditional long password is required for normal Player access.

The Key must never be stored in plaintext.

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

1. Worker resolves the authenticated Session.
2. Worker gets `user.id`.
3. Worker creates the Character with that `owner_user_id`.
4. Client input cannot choose another owner.

All Player Character queries and proposed changes are scoped server-side to the authenticated `user.id`.

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

A new Character begins simple and relatively undefined.

Confirmed starting principles:

- Player creates their own Character.
- Character always starts at **Level 1**.
- Player cannot choose starting Level.
- Player does not choose Class / Occupation during creation.
- Class / Occupation begins **Unassigned**.
- GM assigns/develops Class / Occupation later.
- Eight core Attributes are generated randomly by the server.
- Rolls are assigned directly and cannot be redistributed.
- Server applies a total-stat balance gate.
- Player cannot farm valid rerolls.
- LUCK is retained and is independently randomized.
- HP and MP are core starting Resources.
- A broader but still genre-neutral Base Skill set exists at Level 1.
- Specialist Skills are mainly learned later and grow the Character-specific Skill Tree.

---

# 7. Character Identity and Creation Inputs

## 7.1 Player-provided creation fields

The Character creation form may contain:

| Field | Required | Notes |
|---|---:|---|
| Character Name | Yes | Main display name |
| Age | No | Background |
| Gender | No | Background |
| Portrait | No | Character image |
| Background / Summary | No | Free-form background |

Additional non-mechanical background fields may be added later, but Character creation should remain short.

The old spreadsheet's Player Name field is removed because ownership is already known from the authenticated User.

## 7.2 Fields the Player does not enter

| Field | Starting value | Controlled by |
|---|---|---|
| Owner | authenticated User | Server |
| Level | `1` | Server |
| Class / Occupation | `NULL` / Unassigned | GM later |
| Status | `active` | Server |
| STR/DEX/CON/APP/POW/INT/SIZ/EDU | generated | Server |
| LUCK | generated | Server |
| Max HP | calculated | Server |
| Max MP | calculated | Server |
| Damage Bonus | calculated | Server |
| Base Skill values | calculated | Server |

The create API ignores or rejects client attempts to override protected values.

---

# 8. Level and Class Rules

## 8.1 Starting Level

Every new Character starts at:

```text
Level = 1
```

No Level field is shown during Player creation.

Future Level changes come from progression rules and/or GM actions.

## 8.2 Starting Class / Occupation

Every new Character starts with:

```text
Class / Occupation = Unassigned
```

Database equivalent may be:

```text
class_id = NULL
occupation = NULL
```

Player creation does not show a Class/Role/Occupation input.

GM may later assign or change Class/Occupation based on:

- story development
- training
- behavior
- faction membership
- achievement
- transformation
- Campaign rules
- special events

Class is therefore a progression result, not a starting build selection.

---

# 9. Core Character Attributes

Eight primary Attributes are retained:

| Code | Name | Meaning | Starting roll |
|---|---|---|---|
| STR | Strength / 力量 | physical strength | 3D6 |
| DEX | Dexterity / 敏捷 | speed, coordination, reaction | 3D6 |
| CON | Constitution / 體質 | health, stamina, endurance | 3D6 |
| APP | Appearance / 外貌 | presence and impression | 3D6 |
| POW | Power / 意志 | resolve, mental force, supernatural potential | 3D6 |
| INT | Intelligence / 智力 | reasoning and problem solving | 2D6 + 6 |
| SIZ | Size / 體型 | physical size/build | 2D6 + 6 |
| EDU | Education / 教育 | general learned knowledge | 3D6 + 3 |

These are prominent first-class Character values in the UI.

D1 should still use an extensible Attribute structure so Campaign-specific Attributes can be added later without a database redesign.

---

# 10. Random Attribute Generation and Balance

## 10.1 Direct assignment

Each Attribute receives its own roll and keeps that result.

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

The Player cannot redistribute results.

## 10.2 Server-only generation

Final starting Attribute numbers are generated and validated by the Worker, not trusted from client input.

Accepted results are persisted in D1.

## 10.3 Confirmed total-stat balance gate

```text
Primary Total = STR + DEX + CON + APP + POW + INT + SIZ + EDU
```

The initial accepted range is:

```text
84 <= Primary Total <= 100
```

If a complete set is outside the range, the server rerolls the entire set internally until one accepted set is produced.

The `84` and `100` thresholds should later become GM/Campaign settings stored in D1.

## 10.4 Individual extremes are allowed

Only total starting power is bounded.

A Character may have an unusually low or high individual Attribute when the total remains valid.

## 10.5 No reroll farming

Once a valid generation result is produced for a Character creation, it is locked and persisted.

Normal Player UI does not expose unlimited rerolls.

GM may later receive an administrative reroll/reset action with an audit record.

---

# 11. LUCK

LUCK is a permanent cross-genre Character value and is **independent of POW**.

Confirmed initial rule:

```text
LUCK = 3D6 × 5
```

Range:

```text
15–90
```

LUCK is rolled by the server during Character generation and stored in D1.

LUCK is not included in the eight-Attribute `84–100` Primary Total gate.

Possible uses include:

- chance events
- fortunate coincidences
- loot/event checks
- emergency fortune checks
- narrative luck
- GM-defined Luck checks

---

# 12. HP, MP and Damage Bonus

## 12.1 HP

Confirmed starting formula:

```text
Max HP = ceil((CON + SIZ) / 2)
```

At creation:

```text
Current HP = Max HP
```

## 12.2 MP

MP is a core starting Resource for every Character in the first ruleset.

Confirmed starting formula:

```text
Max MP = POW
Current MP = Max MP
```

A future Campaign ruleset may rename/reinterpret MP, but the initial web implementation includes it for all Characters.

## 12.3 Damage Bonus

Damage Bonus is automatically calculated from STR + SIZ using the legacy/custom configurable table.

The Player does not manually enter Damage Bonus.

## 12.4 Removed mandatory CoC values

The following are not mandatory core Character fields:

- IDEA
- KNOW
- SAN
- Cthulhu Mythos

A Campaign may introduce SAN or another Resource separately.

---

# 13. Base Skill System

## 13.1 Design rule

Level-1 Characters receive a set of universal Root Skills useful across fantasy, science-fiction, modern and mixed settings.

The list is deliberately broader than the first draft, but it avoids specialist setting-specific Skills.

Specialist branches such as firearms, sword schools, magic, hacking, engineering disciplines and alchemy are learned later.

## 13.2 Confirmed direction for initial Skill values

Starting Skill values are derived from Character Attributes rather than being identical fixed numbers for everyone.

The initial rules use Attribute-driven formulas. Formulas must live in the server-side rules/configuration layer rather than being hard-coded into the visual Skill Tree component.

Recommended initial Root Skills and formulas:

### Awareness / Mental

| Skill | Initial formula | Purpose |
|---|---|---|
| Perception / 觀察 | `INT × 2` | notice details and threats |
| Investigation / 調查 | `INT × 2` | deliberate searching and deduction |
| Insight / 洞察 | `POW × 2` | read intent/emotional state |
| Tracking / 追蹤 | `INT × 2` | follow physical/environmental traces |
| General Knowledge / 常識 | `EDU × 2` | broad learned information |
| Concentration / 專注 | `POW × 2` | maintain focus under pressure |

### Physical

| Skill | Initial formula | Purpose |
|---|---|---|
| Athletics / 運動 | `STR × 2` | running, climbing and exertion |
| Acrobatics / 靈巧 | `DEX × 2` | balance, tumbling and precise movement |
| Stealth / 潛行 | `DEX × 2` | move or act without detection |
| Survival / 生存 | `CON + INT` | endure and function in hostile environments |
| Endurance / 耐力 | `CON × 2` | sustained physical effort |

### Social

| Skill | Initial formula | Purpose |
|---|---|---|
| Persuasion / 說服 | `APP × 2` | convince through communication |
| Deception / 欺瞞 | `APP × 2` | lie, misdirect and disguise intent |
| Intimidation / 威嚇 | `max(STR, APP) × 2` | compel through physical/social pressure |
| Negotiation / 談判 | `APP + INT` | bargain and reach agreements |
| Leadership / 領導 | `APP + POW` | organize, command and inspire |

### Practical

| Skill | Initial formula | Purpose |
|---|---|---|
| First Aid / 急救 | `EDU × 2` | immediate basic treatment |
| Craft & Repair / 製作與修理 | `INT + EDU` | generic fabrication and repair root |
| Operation / 操控 | `DEX + INT` | generic control of vehicles/devices/mounts |
| Navigation / 導航 | `INT + EDU` | route finding and orientation |
| Research / 資料研究 | `INT + EDU` | find, verify and combine information |

### Combat

| Skill | Initial formula | Purpose |
|---|---|---|
| Melee / 近戰 | `STR + DEX` | generic close combat root |
| Ranged / 遠程 | `DEX × 2` | generic ranged attack root |
| Dodge / 閃避 | `DEX × 2` | evade attacks/hazards |
| Guard / 防禦 | `CON + DEX` | block, brace and defend |
| Grapple / 擒抱 | `STR + DEX` | holds, wrestling and restraint |
| Throw / 投擲 | `STR + DEX` | throwing objects/weapons accurately |

This produces **27 universal Root Skills**.

## 13.3 Skills intentionally not present at Level 1

Do not add fixed default Skills for:

- individual languages
- specific weapon families
- firearms as a specialist family
- swords/spears/bows as separate roots
- individual sciences
- magic schools
- hacking
- archaeology
- accounting
- law
- photography
- specific vehicles
- starship systems
- alchemy
- Cthulhu Mythos
- other setting-specific catalogues

These become Learned/Specialization nodes when relevant.

## 13.4 Root-to-specialist examples

```text
Melee
└── Swordsmanship
    └── Iaido

Ranged
└── Firearms
    └── Plasma Rifle Handling

Craft & Repair
└── Engineering
    └── Cybernetics

Operation
├── Driving
├── Piloting
└── Riding

Research
└── Physics
    └── Quantum Physics
```

---

# 14. Learned / Unique Skills

Character individuality develops primarily after creation.

Skills may be gained through:

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
- Class/Occupation
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
├── skill_definition_id
├── custom_name
├── category
├── base_value
├── growth / rank
├── current_value
├── description
├── source
├── learned_at
├── parent_skill_id
├── node_type
└── metadata
```

The old spreadsheet's:

```text
Initial + Occupation + Interest + Growth = Total
```

system is removed.

Base Skill formulas and future training/rank progression are separate concepts.

---

# 15. Dynamic Skill / Talent Tree

## 15.1 Core concept

The Skill interface is a large zoomable node graph inspired by ARPG talent-tree interaction patterns such as Path of Exile, without copying proprietary art, exact layouts or assets.

The graph is Character-specific and dynamic.

A new Level-1 Character starts with the universal Root Skills. New branches appear as Skills are learned.

## 15.2 Node types

```text
BASE
LEARNED
SPECIALIZATION
MASTERY
UNIQUE / EVENT
CLASS / GM-GRANTED
```

## 15.3 Node states

```text
LOCKED
AVAILABLE
LEARNED
MASTERED
SPECIAL / GM-GRANTED
```

## 15.4 Edge types

```text
PREREQUISITE
SPECIALIZATION
UPGRADE
RELATED
CLASS LINK
STORY LINK
```

## 15.5 Unlocking does not require a passive-point economy

Nodes may unlock through:

- training
- study
- Character Level
- Attribute requirements
- parent Skill requirements
- teacher
- quest
- item
- Class/Occupation
- GM approval
- story event

Requirements are data-driven and validated server-side.

## 15.6 UI behavior

The Skill Tree should support:

- pan / drag
- zoom
- reset / centre
- search
- category filter
- click/tap detail panel
- prerequisite path highlighting
- learned path highlighting
- locked requirement display
- mobile interaction

Initial renderer: **SVG**.

Logical nodes/edges live in D1. Screen coordinates are presentation metadata only.

---

# 16. Post-Creation Change Request and GM Approval System

## 16.1 Core rule

After Character creation, a Player does **not directly overwrite persistent Character data**.

Instead:

```text
Player proposes change
        ↓
Change Request stored in D1
        ↓
GM reviews
   ┌────┴────┐
Approve     Reject
   ↓           ↓
Apply to      Character remains
Character     unchanged
   ↓
Audit history
```

The proposed value and the currently approved value are separate until GM approval.

## 16.2 Data covered by approval

Player-initiated persistent changes use the approval workflow, including:

- Character Name
- Age / Gender / background
- Portrait reference
- HP / MP current values
- Campaign Resource values
- Inventory additions/removals/quantity changes
- Character notes when treated as Character data
- proposed learned/custom Skills
- any other Character field exposed for Player modification

Protected fields such as Level, Class and rolled Attributes are not ordinary Player-editable requests unless a specific future workflow explicitly allows them.

## 16.3 Request states

```text
PENDING
APPROVED
REJECTED
CANCELLED
```

A Player may cancel their own still-pending request.

## 16.4 Conceptual D1 model

```text
character_change_requests
├── id
├── character_id
├── requested_by_user_id
├── request_type
├── target_entity_type
├── target_entity_id
├── before_data
├── proposed_data
├── reason / note
├── status
├── created_at
├── reviewed_at
├── reviewed_by_gm_id
└── gm_comment
```

`before_data` and `proposed_data` may be structured JSON when appropriate.

## 16.5 Approval integrity

On approval, the Worker must:

1. verify request is still `PENDING`;
2. verify the Character/current record still matches the expected revision or accepted `before_data`;
3. apply the approved change in D1;
4. mark the request `APPROVED`;
5. record reviewer/time;
6. write an audit/progression history entry.

If the underlying data changed after the request was submitted, the GM should be warned about a conflict instead of silently overwriting newer data.

## 16.6 GM workflow

GM Workspace needs:

```text
Pending Requests
├── Character
├── Player
├── Change Type
├── Current Value
├── Proposed Value
├── Player Note
├── Approve
└── Reject + Comment
```

A later convenience feature may allow batch review during a session, but the D1 approval/audit model remains the same.

---

# 17. Language System

There is no dedicated global language subsystem.

A language that matters mechanically may appear as an ordinary Learned Skill.

There are no fixed Asian/European/African/Ancient language tables.

---

# 18. Combat / Attacks

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

Examples:

```text
Unarmed Strike
Skill: Melee
Damage: 1D3 + DB

Plasma Rifle
Skill: Plasma Rifle Handling
Damage: Campaign-defined
```

Items may link to Attack definitions without becoming the same database entity.

---

# 19. Inventory

Inventory is structured D1 data.

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

Player-proposed persistent Inventory changes use the GM Change Request workflow.

Items may later grant:

- Attacks
- Resources
- Skill nodes
- temporary effects
- permanent progression

---

# 20. Character Creation Flow

```text
Step 1 — Identity
  Character Name
  optional Age / Gender / Portrait / Background

  NOT SHOWN:
  Owner ID
  Level
  Class / Occupation

Step 2 — Server Generation
  Level = 1
  Class / Occupation = Unassigned
  Roll STR / DEX / CON / APP / POW / INT / SIZ / EDU
  Apply 84–100 total-stat balance gate
  Roll LUCK = 3D6 × 5
  Calculate HP
  Calculate MP
  Calculate Damage Bonus

Step 3 — Starting Skills
  Generate the 27 universal Root Skill values from Attributes
  Persist Root Skill nodes
  No specialist catalogue
  No Class selection
  No point spending

Step 4 — Review
  Show generated Level-1 Character
  Player confirms creation

Step 5 — Persist
  Save complete Character and related records directly to D1
```

The accepted roll is not stored in localStorage at any point as authoritative data.

---

# 21. Character Sheet Layout

Recommended Player page:

```text
OVERVIEW
────────────────────────
Name
Level
Class / Occupation
Age / Gender
Background
Portrait
Pending Change indicator

CORE ATTRIBUTES
────────────────────────
STR   DEX   CON   APP
POW   INT   SIZ   EDU

STATUS
────────────────────────
HP        Current / Max
MP        Current / Max
LUCK
Damage Bonus
Campaign Resources

SKILL TREE
────────────────────────
Dynamic D1-backed graph
27 Base roots + learned branches

COMBAT
────────────────────────
Attacks / Weapons

INVENTORY
────────────────────────
Approved Items
Pending proposed changes indicator

NOTES
────────────────────────
Approved Character notes
```

Primary tabs:

```text
Overview
Skill Tree
Combat
Inventory
Notes
Requests
```

`Requests` shows pending/approved/rejected Player submissions for that Character.

---

# 22. Player Permissions

Player may:

- create a Character for themselves
- view owned Characters
- view Attributes, LUCK, Level and Class
- use the Skill Tree
- submit Character change requests
- view request status/history
- cancel their own pending request

Player may not directly:

- change owner
- change starting or current Level
- assign Class / Occupation
- alter rolled Attributes
- alter LUCK
- overwrite persistent Character fields after creation
- bypass GM approval for Player-proposed changes
- grant protected Skills
- view another User's Character
- alter Campaign rules

---

# 23. GM Responsibilities

GM does not need to create ordinary Player Characters.

GM responsibilities include:

- view Users
- view all Characters
- review Character change requests
- approve/reject proposed changes
- directly correct Character data when administratively required
- assign/change Class / Occupation
- manage Level/progression
- administratively reroll/reset with audit history
- configure Attribute total range
- configure formulas/rules
- create/manage Skill definitions
- manage Skill relationships and prerequisites
- grant/remove Class, special and story Skills
- manage Campaign settings
- archive/delete Characters

---

# 24. Database Principles

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
character_change_requests
progression_history / audit_history
settings
```

## 24.1 Character record

```text
Character
├── id
├── owner_user_id
├── name
├── level                 default 1
├── class_id              nullable / GM-controlled
├── status
├── portrait reference
├── approved background fields
├── revision
├── created_at
└── updated_at
```

A `revision` or equivalent optimistic-concurrency mechanism is recommended for safe Change Request approval.

## 24.2 Skill graph

```text
skill_definitions
character_skills
skill_edges
```

Graph relationships are authoritative game data. Visual positions are presentation metadata.

## 24.3 Change requests

Pending requests are database records, not temporary browser drafts.

Approved requests update the corresponding authoritative Character records through Worker-side validation.

---

# 25. API Direction

Recommended logical endpoints include:

```text
POST /api/player/characters
GET  /api/player/characters/:id

POST /api/player/characters/:id/change-requests
GET  /api/player/characters/:id/change-requests
POST /api/player/change-requests/:id/cancel

GET  /api/gm/change-requests?status=pending
POST /api/gm/change-requests/:id/approve
POST /api/gm/change-requests/:id/reject
```

Character create endpoint generates protected starting data server-side.

Change Request endpoints never directly accept another owner's Character.

GM approval endpoint applies the approved mutation and audit record server-side.

---

# 26. Security and Integrity Rules

- User + Key validation occurs server-side.
- Key is not stored in plaintext.
- Session uses Secure + HttpOnly cookie.
- D1 is the only authoritative persistent store.
- Do not persist game data in localStorage.
- Character ownership is server-enforced.
- Character creation ignores client-supplied owner, Level, Class and Attribute values.
- New Character Level is always `1`.
- New Character Class/Occupation is always Unassigned.
- Attribute and LUCK rolls happen server-side.
- Attribute balance validation happens server-side.
- Base Skill values are calculated server-side.
- Skill unlock/progression validation happens server-side.
- Player post-creation persistent edits are requests, not direct writes.
- GM approval/rejection is server-authorized.
- Approved changes produce audit history.

---

# 27. Development Order

## Phase A — Character Builder Core

1. Remove Level input.
2. Remove Class/Occupation input.
3. Server always creates Level 1.
4. Server always creates Unassigned Class.
5. Implement eight-Attribute dice generation.
6. Implement confirmed `84–100` balance gate.
7. Roll independent `LUCK = 3D6 × 5`.
8. Calculate HP / MP / Damage Bonus.
9. Persist complete Character in D1.

## Phase B — Root Skills

1. Seed the 27 Root Skill definitions in D1.
2. Implement Attribute-based starting formulas.
3. Create Character Root Skill records during creation.
4. Display Root Skills read-only on the initial Character Sheet.

## Phase C — Change Request System

1. Add `character_change_requests` schema.
2. Add Player request submission/history UI.
3. Add GM Pending Requests inbox.
4. Add Approve / Reject actions.
5. Apply approved changes server-side.
6. Add revision/conflict detection.
7. Add audit/progression history.

## Phase D — Character Sheet

1. Display Level and GM-managed Class.
2. Display Attributes / LUCK / HP / MP / DB.
3. Display approved Inventory/Combat data.
4. Display pending-change indicators.
5. Add Requests tab.

## Phase E — Skill Tree UI

1. Build SVG graph renderer.
2. Read graph from D1.
3. Add pan/zoom.
4. Add node states/details.
5. Add search/filter.
6. Add path highlighting.
7. Add mobile interaction.

## Phase F — Learning / Growth

1. Define rank/growth rules.
2. Add training history.
3. Add custom learned Skills.
4. Validate prerequisites.
5. Add GM/story/Class nodes.
6. Grow Character graph dynamically.

## Phase G — Class / Occupation and Level Progression

1. Build GM assignment UI.
2. Define optional Classes/Occupations.
3. Link Class to Skill branches/requirements.
4. Record Class history.
5. Finalize Level progression rules.

## Phase H — Full GM D1 Workspace

1. GM authentication/authorization.
2. User/Character browser.
3. Character administration.
4. Change Request review centre.
5. progression management.
6. Skill graph/content management.
7. Campaign settings.

---

# 28. Canonical Decisions

The following decisions must not be silently reversed during implementation:

1. Player and GM are separate workspaces.
2. Player identity uses User + 4-digit Key.
3. Cloudflare D1 is the only authoritative persistent data store.
4. Do not use localStorage for persistent game/application data.
5. Players create their own Characters.
6. Character owner comes from authenticated Session.
7. Every new Character starts at Level 1.
8. Player cannot choose starting Level.
9. Player does not choose Class / Occupation at creation.
10. Class / Occupation starts Unassigned and is GM-managed later.
11. Core Attributes are STR, DEX, CON, APP, POW, INT, SIZ and EDU.
12. Starting Attributes are randomized and directly assigned server-side.
13. Confirmed starting Primary Total range is 84–100.
14. Valid starting rolls cannot be redistributed or farmed by rerolling.
15. LUCK is core, independent of POW, and initially uses `3D6 × 5`.
16. HP uses `ceil((CON + SIZ) / 2)`.
17. MP is core in the initial ruleset and uses `POW` as Max MP.
18. Damage Bonus is derived from STR + SIZ.
19. Cthulhu Mythos is removed.
20. Fixed language systems are removed.
21. Level-1 Characters receive 27 genre-neutral Root Skills.
22. Root Skill starting values are derived from Attributes.
23. Specialist Skills are mainly learned during play.
24. The old Occupation + Interest + Growth Skill Point system is removed.
25. Skill progression is visualized as a Character-specific dynamic zoomable node graph.
26. The Skill Tree does not require a passive-point economy.
27. Skill relationships/unlocks are data-driven and server-validated.
28. After creation, Player persistent Character changes are submitted as D1 Change Requests.
29. Player requests do not modify authoritative Character data until GM approval.
30. GM approval/rejection and resulting changes are audited in D1.
31. Character page uses Overview / Skill Tree / Combat / Inventory / Notes / Requests as the primary interaction model.
