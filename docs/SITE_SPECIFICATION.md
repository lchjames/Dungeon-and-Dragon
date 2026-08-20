# D&D Campaign Hub — Site & Character System Specification

> Status: **Canonical design document**  
> Purpose: Source of truth for website, database, Player, GM, character creation, character sheet, progression, Skill Tree and approval workflow development.  
> Production site: `https://dungeon-and-dragon.lchjames.com/`

---

# 1. Product Direction

D&D Campaign Hub is a web-based TRPG character and campaign management system intended to support mixed settings such as fantasy, science fiction, modern, horror and custom worlds.

The old offline spreadsheet is a structural reference, not something to copy literally. The web system keeps the useful Character-sheet structure while removing CoC-specific mechanics that are not genre-neutral.

The platform has two separated workspaces:

- **Player** — create a User, unlock it with a 4-digit Key, create owned Characters, allocate starting Skills, view Character data and submit proposed changes.
- **GM** — administer campaigns, Characters, Classes/Occupations, progression, Skill definitions, Skill Trees, change requests and rules.

---

# 2. Non-Negotiable Storage Rule

## 2.1 Cloudflare D1 is the only persistent source of truth

All persistent application/game data must live in Cloudflare D1, including:

- Users and Key verification data
- Session metadata
- Characters and ownership
- Character Level
- Class / Occupation
- Attributes
- LUCK
- HP / MP / Resources
- Skill definitions
- Character Skill values
- Skill Tree nodes and edges
- starting Skill-point allocations
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

The application must not use browser localStorage for persistent User, Character, Skill, Inventory, Resource, progression, approval or Campaign data.

Do not build:

- local-first Character data
- browser/database synchronization as the normal model
- authoritative Character snapshots in localStorage
- pending change requests that exist only in the browser

Temporary form/UI state may exist in page memory while the page is open. If resumable Character creation is later required, the draft should be saved to D1 rather than localStorage.

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

One User may own multiple Characters.

---

# 4. Character Ownership

Every Character belongs to a User through D1:

```text
characters.owner_user_id -> users.id
```

When a Player creates a Character:

1. Worker resolves the authenticated Session.
2. Worker obtains `user.id`.
3. Worker creates the Character with that `owner_user_id`.
4. The client cannot choose another owner.

All Player Character APIs are scoped server-side to the authenticated User.

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
- Attribute rolls are directly assigned and cannot be redistributed.
- Server applies a total-stat balance gate.
- Player cannot farm valid rerolls.
- LUCK is independently randomized.
- HP and MP are core starting Resources.
- Level-1 Characters receive a genre-neutral Root Skill set.
- **Starting Skill points are freely allocated by the Player.**
- Specialist Skills are mainly learned later and grow the Character-specific Skill Tree.

---

# 7. Character Identity and Creation Inputs

## 7.1 Player-provided creation fields

The Character creation form should initially contain only:

| Field | Required | Notes |
|---|---:|---|
| Character Name | Yes | Main display name |
| Age | No | Background |
| Gender | No | Background |
| Portrait | No | Character image |
| Background / Summary | No | Free-form background |

The old spreadsheet Player Name field is removed because ownership already comes from the authenticated User.

## 7.2 Server-controlled values

The following are not entered by the Player:

| Field | Starting value | Controlled by |
|---|---|---|
| Owner | authenticated User | Server |
| Level | `1` | Server |
| Class / Occupation | `NULL` / Unassigned | GM later |
| Status | `active` | Server |
| STR/DEX/CON/APP/POW/INT/SIZ/EDU | random generation | Server |
| LUCK | random generation | Server |
| Max HP | calculated | Server |
| Max MP | calculated | Server |
| Damage Bonus | calculated | Server |
| Creation Skill Point Pool | calculated | Server |

Player **does** choose how the valid Creation Skill Point Pool is allocated among the available Level-1 Root Skills.

---

# 8. Level and Class Rules

## 8.1 Starting Level

Every new Character starts at:

```text
Level = 1
```

No Level input is shown during Player creation.

## 8.2 Starting Class / Occupation

Every new Character starts with:

```text
Class / Occupation = Unassigned
```

Database equivalent:

```text
class_id = NULL
occupation = NULL
```

Player creation does not show a Class / Role / Occupation input.

GM may later assign/change Class based on story development, training, behavior, factions, achievements, transformations, Campaign rules or special events.

Class is a progression result, not a starting build choice.

---

# 9. Core Character Attributes

Eight primary Attributes are retained:

| Code | Name | Meaning | Starting roll |
|---|---|---|---|
| STR | Strength / 力量 | physical strength | 3D6 |
| DEX | Dexterity / 敏捷 | speed, coordination, reaction | 3D6 |
| CON | Constitution / 體質 | health, stamina, endurance | 3D6 |
| APP | Appearance / 外貌 | presence and impression | 3D6 |
| POW | Power / 意志 | resolve, will, supernatural potential | 3D6 |
| INT | Intelligence / 智力 | reasoning and problem solving | 2D6 + 6 |
| SIZ | Size / 體型 | physical size/build | 2D6 + 6 |
| EDU | Education / 教育 | general learned knowledge | 3D6 + 3 |

D1 should use an extensible Attribute structure so Campaign-specific Attributes can be added later.

---

# 10. Random Attribute Generation and Balance

## 10.1 Direct assignment

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

## 10.2 Server-side generation only

The Worker generates and validates final starting Attribute numbers. The browser never supplies trusted starting Attribute values.

## 10.3 Confirmed total-stat balance gate

```text
Primary Total = STR + DEX + CON + APP + POW + INT + SIZ + EDU
```

Accepted range:

```text
84 <= Primary Total <= 100
```

If a complete set is outside the range, the Worker rerolls the entire set internally until one accepted set is produced.

## 10.4 Individual extremes remain valid

Only total starting power is bounded. A Character may still have one unusually weak or strong Attribute.

## 10.5 No reroll farming

Once the server produces a valid starting set for a Character creation, that accepted result is locked for the creation process.

GM may later perform an administrative reroll/reset with audit history.

---

# 11. LUCK

LUCK is a permanent cross-genre Character value and is independent of POW.

Confirmed initial rule:

```text
LUCK = 3D6 × 5
```

Range:

```text
15–90
```

LUCK is rolled server-side and stored in D1. It is not included in the eight-Attribute `84–100` balance gate.

---

# 12. HP, MP and Damage Bonus

## 12.1 HP

```text
Max HP = ceil((CON + SIZ) / 2)
Current HP = Max HP at creation
```

## 12.2 MP

MP is a core starting Resource in the initial ruleset.

```text
Max MP = POW
Current MP = Max MP at creation
```

## 12.3 Damage Bonus

Damage Bonus is automatically calculated from STR + SIZ using the configurable legacy/custom table.

## 12.4 Removed mandatory CoC fields

The following are not mandatory core Character fields:

- IDEA
- KNOW
- SAN
- Cthulhu Mythos

A Campaign may add SAN or other Resources separately.

---

# 13. Base Skill and Starting Skill-Point System

## 13.1 Core principle

The web version retains the important part of the old spreadsheet Skill system:

```text
Skill Current Value
= Initial Base Value
+ Creation Allocation
+ Later Growth
```

The Player chooses where to spend starting Skill points.

Starting Skill values are **not automatically fixed by STR/DEX/INT formulas**.

Some individual Skills may still have a rules-defined base value, but the Player's build is created by allocating a shared starting pool.

## 13.2 One combined Creation Skill Point Pool

There is no separate Occupation Point pool because Level-1 Characters do not have a Class/Occupation yet.

There is no separate Interest Point pool either.

Instead, both concepts are replaced by one pool:

```text
Creation Skill Points (CSP)
```

The Player may freely distribute CSP among the Level-1 Root Skills, subject to server-side limits.

## 13.3 Composite Skill Point source

The starting pool should come from multiple Character qualities rather than only EDU or INT.

Initial rules formula:

```text
Raw CSP
= 60
+ INT
+ EDU
+ floor(POW / 2)
+ floor(DEX / 2)
+ floor(APP / 2)
+ floor(LUCK / 10)
```

Then apply a hard balance clamp:

```text
Creation Skill Points = clamp(Raw CSP, 90, 120)
```

Therefore a Level-1 Character begins with **90–120 distributable Skill points**, not several hundred points.

Design intent of the contributing values:

- `INT` — learning/problem-solving capacity
- `EDU` — previous general learning
- `POW` — discipline/will
- `DEX` — practical adaptability
- `APP` — social adaptability
- `LUCK` — small unpredictable bonus only

STR, CON and SIZ primarily influence raw physical capability and Resources rather than heavily increasing starting Skill training.

The exact coefficients live in the server-side rules/configuration layer so the formula can later be tuned without changing the database model.

## 13.4 Level-1 Skill cap

A newly created Character may **not** begin with a 100% Skill.

Hard creation rule:

```text
Final Skill Value <= 70
```

For every Root Skill:

```text
Initial Base Value + Creation Allocation <= 70
```

The UI must stop additional allocation once a Skill reaches 70.

The Worker must independently validate the same limit.

Values above 70 are reserved for later Character growth, training, mastery, special progression or GM-approved changes.

This limit applies to Character creation only; future progression caps will be defined separately.

## 13.5 Allocation validation

Before Character creation can be finalized:

- every allocation must be a non-negative integer;
- total allocated points must not exceed the Character's CSP;
- the initial implementation should require all CSP to be spent before final confirmation;
- no Skill may exceed the Level-1 cap of 70;
- client-calculated totals are not trusted;
- Worker recalculates CSP from authoritative Attributes/LUCK and validates the allocation;
- accepted allocation is persisted in D1 together with the Character.

## 13.6 Skill data model

Each Character Skill should preserve the separate components rather than storing only one unexplained total:

```text
Character Skill
├── skill_definition_id
├── base_value
├── creation_allocation
├── growth_value
├── current_value
├── rank / mastery metadata
└── source metadata
```

Initial calculation:

```text
current_value = base_value + creation_allocation + growth_value
```

At Level 1:

```text
growth_value = 0
```

## 13.7 Root Skill set — current working list

The Root Skill list remains genre-neutral and deliberately avoids world-specific specializations.

### Awareness / Mental

- Perception / 觀察
- Investigation / 調查
- Insight / 洞察
- Tracking / 追蹤
- General Knowledge / 常識
- Concentration / 專注

### Physical

- Athletics / 運動
- Acrobatics / 靈巧
- Stealth / 潛行
- Survival / 生存
- Endurance / 耐力

### Social

- Persuasion / 說服
- Deception / 欺瞞
- Intimidation / 威嚇
- Negotiation / 談判
- Leadership / 領導

### Practical

- First Aid / 急救
- Craft & Repair / 製作與修理
- Operation / 操控
- Navigation / 導航
- Research / 資料研究

### Combat

- Melee / 近戰
- Ranged / 遠程
- Dodge / 閃避
- Guard / 防禦
- Grapple / 擒抱
- Throw / 投擲

This is currently **27 Root Skills**.

The exact Initial Base Value of each Root Skill still needs to be confirmed from the old-table philosophy before implementation.

## 13.8 Skills intentionally not present as Level-1 specialist roots

Do not add fixed starting specialist Skills for:

- languages
- individual weapon families
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

These become learned/specialization nodes later.

## 13.9 Root-to-specialist examples

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

Examples include Swordsmanship, Iaido, Plasma Rifle Handling, Starship Navigation, Alchemy, Rune Engraving, Necromancy, Cybernetic Repair, Dragon Riding and Quantum Physics.

A learned Skill may branch from a Root Skill or another learned Skill.

---

# 15. Dynamic Skill / Talent Tree

## 15.1 Core concept

The Skill interface uses a large zoomable node graph inspired by ARPG talent-tree interaction patterns such as Path of Exile, without copying proprietary art, exact layouts or assets.

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

## 15.5 Unlocking does not require passive points

Tree nodes may unlock through training, study, Character Level, Attribute requirements, parent Skill requirements, teachers, quests, items, Class/Occupation, GM approval or story events.

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

After Character creation, a Player does not directly overwrite persistent Character data.

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

## 16.2 Data covered by approval

Player-initiated persistent changes use this workflow, including:

- Character Name
- Age / Gender / background
- Portrait reference
- HP / MP current values
- Campaign Resource values
- Inventory changes
- Character notes when treated as Character data
- proposed learned/custom Skills
- other Player-exposed persistent fields

Protected fields such as Level, Class, rolled Attributes and LUCK are not ordinary Player-editable requests unless a future workflow explicitly allows them.

## 16.3 Request states

```text
PENDING
APPROVED
REJECTED
CANCELLED
```

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

## 16.5 Approval integrity

On approval, the Worker must verify the request is still pending, detect conflicts with newer Character revisions, apply the approved D1 mutation, mark the request approved, record reviewer/time and write audit/progression history.

---

# 17. Language System

There is no dedicated global language subsystem.

A language that matters mechanically may appear as an ordinary learned Skill.

---

# 18. Combat / Attacks

Attacks remain separate from Inventory.

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
  Calculate Creation Skill Point Pool

Step 3 — Skill Allocation
  Load 27 Root Skills with their Initial Base Values
  Show CSP remaining
  Player freely allocates CSP
  Enforce Final Skill <= 70
  Require all CSP to be allocated
  Worker validates allocation

Step 4 — Review
  Show complete Level-1 Character
  Show Attribute rolls
  Show LUCK / HP / MP / Damage Bonus
  Show every Root Skill: Base + Allocation = Starting Value
  Player confirms creation

Step 5 — Persist
  Save Character, Attributes, Resources, Root Skills and starting allocation directly to D1
```

No authoritative Character-creation data is persisted in localStorage.

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
Root Skills + learned branches

COMBAT
────────────────────────
Attacks / Weapons

INVENTORY
────────────────────────
Approved Items
Pending-change indicator

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

---

# 22. Player Permissions

During initial creation, Player may:

- provide allowed identity/background fields
- receive server-generated Attributes/LUCK
- freely allocate the valid Creation Skill Point Pool
- review the generated Character
- confirm creation

After creation, Player may:

- view owned Characters
- use the Skill Tree
- submit Character change requests
- view request status/history
- cancel their own pending requests

Player may not directly:

- change owner
- change Level
- assign Class / Occupation
- alter rolled Attributes
- alter LUCK
- exceed Skill-allocation limits
- overwrite persistent Character fields after creation
- bypass GM approval
- grant protected Skills
- view another User's Character
- alter Campaign rules

---

# 23. GM Responsibilities

GM responsibilities include:

- view Users and Characters
- review/approve/reject Character change requests
- directly correct Character data when administratively required
- assign/change Class / Occupation
- manage Level/progression
- administratively reroll/reset with audit history
- configure Attribute total range
- configure Skill Point formula and min/max clamp
- configure Level-1 Skill cap
- configure formulas/rules
- create/manage Skill definitions and Initial Base Values
- manage Skill relationships/prerequisites
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

## 24.2 Skill definitions

```text
skill_definitions
├── id
├── name
├── category
├── node_type
├── initial_base_value
├── description
├── active
└── metadata
```

## 24.3 Character Skills

```text
character_skills
├── id
├── character_id
├── skill_definition_id
├── base_value
├── creation_allocation
├── growth_value
├── current_value
├── state
├── source
├── learned_at
└── metadata
```

## 24.4 Skill graph

```text
skill_edges / prerequisites
```

Graph relationships are authoritative. Visual positions are presentation metadata.

---

# 25. API Direction

Recommended logical endpoints include:

```text
POST /api/player/character-drafts
GET  /api/player/character-drafts/:id
POST /api/player/character-drafts/:id/allocate-skills
POST /api/player/character-drafts/:id/finalize

GET  /api/player/characters/:id
POST /api/player/characters/:id/change-requests
GET  /api/player/characters/:id/change-requests
POST /api/player/change-requests/:id/cancel

GET  /api/gm/change-requests?status=pending
POST /api/gm/change-requests/:id/approve
POST /api/gm/change-requests/:id/reject
```

If resumable drafts are not required initially, the Character creation endpoints may be consolidated, but the same server-side validation rules apply.

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
- Creation Skill Point Pool is recalculated server-side.
- Skill allocation totals and Level-1 Skill cap are validated server-side.
- Player cannot create a starting Skill above 70.
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
9. Calculate CSP using the composite formula and `90–120` clamp.
10. Persist creation state in D1 when resumable drafts are implemented.

## Phase B — Starting Skill Allocation

1. Finalize the 27 Root Skill list.
2. Finalize Initial Base Value for every Root Skill.
3. Seed Root Skill definitions in D1.
4. Build point-allocation UI.
5. Show `CSP Remaining` live.
6. Enforce Level-1 final Skill cap of 70 in UI.
7. Revalidate pool/cap server-side.
8. Save `base_value`, `creation_allocation` and `current_value` separately.

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
3. Display Skill Base / Growth / Current values where relevant.
4. Display approved Inventory/Combat data.
5. Display pending-change indicators.
6. Add Requests tab.

## Phase E — Skill Tree UI

1. Build SVG graph renderer.
2. Read graph from D1.
3. Add pan/zoom.
4. Add node states/details.
5. Add search/filter.
6. Add path highlighting.
7. Add mobile interaction.

## Phase F — Learning / Growth

1. Define Growth rules.
2. Define progression above the Level-1 Skill cap.
3. Add training history.
4. Add custom learned Skills.
5. Validate prerequisites.
6. Add GM/story/Class nodes.
7. Grow Character graph dynamically.

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
17. MP is core in the initial ruleset and uses POW as Max MP.
18. Damage Bonus is derived from STR + SIZ.
19. Cthulhu Mythos is removed.
20. Fixed language systems are removed.
21. Level-1 Characters currently use 27 genre-neutral Root Skills.
22. Starting Skills use **Initial Base Value + Player Creation Allocation**.
23. Player receives one combined Creation Skill Point Pool rather than Occupation/Interest pools.
24. Initial CSP formula combines INT, EDU, POW, DEX, APP and LUCK and is clamped to 90–120.
25. Level-1 final Skill value cannot exceed 70.
26. Creation Skill allocation is freely chosen by the Player within the pool/cap rules.
27. Specialist Skills are mainly learned during play.
28. Later Skill value follows `Base + Creation Allocation + Growth`.
29. Skill progression is visualized as a Character-specific dynamic zoomable node graph.
30. The Skill Tree does not require a passive-point economy.
31. Skill relationships/unlocks are data-driven and server-validated.
32. After creation, Player persistent Character changes are submitted as D1 Change Requests.
33. Player requests do not modify authoritative Character data until GM approval.
34. GM approval/rejection and resulting changes are audited in D1.
35. Character page uses Overview / Skill Tree / Combat / Inventory / Notes / Requests as the primary interaction model.
