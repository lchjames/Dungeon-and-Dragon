# World / Map / Story Runtime — Alpha

> Status: **Canonical Alpha Runtime Contract**  
> Date: 2026-08-26  
> Scope: world/location definitions, reusable map templates, per-play runtime map state, entity position, 9-grid movement, visibility, Scene binding, Story Event execution boundary, and the path from authored Story structure into playable runtime.  
> Supersedes older statements that a tactical Map / movement layer is wholly Deferred where those statements conflict with this document.

---

# 1. Why this layer is now Alpha Core

The current Alpha already has persistent Character, Scenario / Scene / Encounter, Monster / Boss, Combat, Round / Turn, Action and Move systems. However those systems do not yet answer three basic runtime questions:

```text
Where is the Character?
What does Move actually move?
How does Story structure change the playable world?
```

A playable D&D runtime cannot leave those questions as metadata-only concerns.

The Alpha therefore treats the following as a required integration layer rather than optional VTT polish:

```text
World Location
Reusable Map Template
Scene ↔ Map binding
Runtime Map Instance
Entity Position
9-grid movement
Player/GM visibility
Map zones / doors / objects / spawn points
Story Event trigger / condition / approved effect boundary
Encounter / Combat ↔ Map binding
```

Advanced VTT features remain Deferred unless separately promoted.

---

# 2. Core Separation: Definition vs Scene Configuration vs Runtime

The Map must not be copied into every Scene and mutable play state must not be written back into a reusable Map definition.

Canonical separation:

```text
World Location / Map Template
        ↓ referenced by
Scene Map Configuration
        ↓ instantiated as
Runtime Map Instance
```

## 2.1 World Location

A World Location represents a reusable place identity inside the current campaign/world.

Examples:

```text
Abandoned Hospital — Floor 1
Old Castle — Great Hall
Night Zoo — Primate House
```

A Location may be referenced by multiple Scenes.

Location definition data is descriptive/stable world data. Mutable play state does not live directly on the Location.

## 2.2 Map Template

A Map Template is the reusable spatial definition for a Location or reusable tactical area.

It may contain:

```text
Map name
Grid width / height
optional background asset reference
walkable / blocked cells
walls
fixed door positions
zones
fixed objects / markers
named spawn points
GM design notes
version
```

The Template is a design asset, not a live game state container.

## 2.3 Scene Map Configuration

A Scene references a Location / Map Template and may add Scene-specific configuration without mutating the shared Template.

Examples:

```text
Scene A:
  Hospital Floor 1
  Power starts ON
  Door A starts OPEN
  Zombie spawn disabled

Scene B:
  same Hospital Floor 1 Template
  Power starts OFF
  Door A starts BROKEN
  Blood trail zone revealed
  Boss spawn enabled
```

Scene-specific configuration may define:

```text
initial door/object states
initial reveal/visibility state
Scene-specific zones
Scene-specific spawn activation
Scene Story Event bindings
Scene Encounter bindings
Scene-specific environmental notes
```

## 2.4 Runtime Map Instance

Actual play never writes mutable state back into the Template.

Each play runtime receives a Map Instance derived from:

```text
Map Template
+ Scene Map Configuration
→ Runtime Map Instance
```

Mutable runtime state belongs to the Map Instance, for example:

```text
Door currently open/closed/broken
Object already used
Item already collected
Zone revealed
Monster spawned / defeated
Character positions
runtime visibility overrides
Story trigger already fired
```

This permits different groups, repeated runs, or separate Scene runs to use the same Map Template without affecting each other.

Example:

```text
Map Template: Hospital_F1

Runtime Instance A:
  Team A
  Door A = broken
  Zombie = defeated
  Key = collected

Runtime Instance B:
  Team B
  Door A = closed
  Zombie = active
  Key = present
```

---

# 3. Runtime Story / Scene Instances

A Story definition and an active playthrough are not the same entity.

Long-term-safe relationship:

```text
Scenario Definition
→ Scenario Run
→ Scene Definition
→ Scene Run
→ Runtime Map Instance
```

This prevents one group or replay from overwriting another group's:

```text
Story flags
Scene progress
Map state
opened doors
defeated enemies
collected items
Character positions
visibility state
```

The first Alpha implementation may expose only one active Scenario Run in the primary GM workspace at a time, but the storage boundary must not assume that a Scenario Definition itself is the only possible runtime instance.

---

# 4. Structured Grid

The Alpha Map is:

```text
Structured square grid
+ optional background image
```

The background image is presentation only.

Gameplay authority comes from structured Map data.

A plain uploaded image is not sufficient to answer movement, adjacency, collision, trigger-zone or range rules.

## 4.1 Coordinates

Canonical coordinates use integer cells:

```text
x = 0 .. width-1
y = 0 .. height-1
```

Each runtime-positioned entity has:

```text
map_instance_id
x
y
```

The server is authoritative for legal movement and stored position.

---

# 5. 9-Grid / Eight-Direction Movement

The Character's current cell plus its eight surrounding cells form the local 9-grid.

All eight surrounding cells are adjacent, including diagonals.

```text
NW  N  NE
 W [C] E
SW  S  SE
```

Canonical adjacent distance:

```text
max(abs(targetX - currentX), abs(targetY - currentY)) = 1
```

## 5.1 Alpha Move allowance

One ordinary Move allows one legal transition from the current cell to one adjacent cell.

```text
1 Move
→ at most 1 adjacent-cell movement
```

Diagonal movement costs the same single Move as orthogonal movement.

This applies to the first Alpha Map implementation. Future speed/multi-cell movement rules may extend the resolver without changing the position model.

## 5.2 Collision / blocked cells

A Move is rejected when the destination is:

```text
outside the Map
non-walkable
blocked by a wall / closed blocking door
occupied by an entity under a collision rule that forbids entry
otherwise prohibited by an active runtime effect
```

The server, not the browser, validates legality.

## 5.3 No diagonal corner cutting

A diagonal move cannot pass through a fully blocked corner.

If the orthogonal edges required to pass the corner are blocked by walls / closed blocking doors, the diagonal destination is not legal merely because that destination cell itself is walkable.

The exact edge representation is implementation detail; the gameplay invariant is no wall-corner phasing.

---

# 6. Entity Position

The spatial runtime is generic across:

```text
character
monster_instance
boss_instance
```

Alpha footprint:

```text
all positioned Characters / Monsters / Bosses occupy 1 cell
```

Large 2×2 / 3×3 footprints are Deferred until the one-cell runtime is stable.

Combat must reuse existing exploration positions rather than teleporting or re-laying out combatants automatically.

```text
Exploration position
→ Start Combat
→ same Map Instance
→ same x/y
```

Ending Combat also preserves positions for continued exploration unless an explicit approved effect moves an entity.

---

# 7. Player Visibility

Player tokens are visible to other Players by default.

Canonical default:

```text
Player A can see Player B / C / D positions
```

GM always sees all runtime Player positions.

GM may override Player-token visibility.

The model must support at least:

```text
global visibility override for a Player token
per-viewer Player visibility override
```

Example:

```text
Character Lily
Visible to:
  Ethan  yes
  Sophia yes
  Kevin  no
  Jake   yes
```

The owner can always see their own Character token.

The same visibility infrastructure may later be reused for:

```text
hidden Monsters
stealth
invisibility
secret NPCs
perception-dependent reveals
```

Those advanced detection rules are not automatically implemented merely by defining the visibility storage boundary.

---

# 8. Player Location Display

The Player workspace must be able to display authoritative world context rather than only Character / Combat data.

Minimum world-context presentation:

```text
Current Scenario / Run
Current Scene
Current Location
Current Map
Character position
current exploration/combat round context where applicable
```

When a Map is active, the Player should see:

```text
own token
other visible Player tokens
GM-approved visible entities / objects / zones
legal movement destinations when Move is available
```

GM-only data is never included in normal Player payloads merely to hide it with CSS.

---

# 9. GM Map Authoring Boundary

The Alpha GM Map editor does not need to be a full Roll20-equivalent VTT.

It does need to make structured maps usable without database editing.

Minimum authoring concepts:

```text
create / edit Map Template
set width / height
optional background reference
mark cells walkable / blocked
place/remove walls
place doors
name zones
place spawn points
bind Location
bind Scene
configure Scene-specific state
```

Later additions may include drag tools, multi-select paint, resize migration helpers and richer art assets.

---

# 10. Story Runtime: Definition vs Execution

Scenario / Scene / Encounter records are Story definitions/context. They are not sufficient by themselves to execute a story.

The required bridge is a Story Event model.

Canonical Story Event structure:

```text
Trigger
+ Conditions
+ Approved Effects
```

Example:

```text
Event: Emergency Room Ambush

Trigger:
  entity enters Zone ER

Conditions:
  flag.er_ambush_started != true

Effects:
  reveal narrative
  close Door ER-01
  spawn Monster ×2
  activate Encounter ER Ambush
  set flag.er_ambush_started = true
```

---

# 11. Story Event Triggers

The Alpha event boundary should support a small approved trigger vocabulary first, such as:

```text
manual GM activation
Scene Run start
entity enters Zone
entity interacts with Object
Encounter activated
Encounter resolved
Combat started
Combat ended
Story flag changed
```

Not every trigger must be implemented in the first slice. The storage and resolver model should be extensible without arbitrary script execution.

---

# 12. Story Event Conditions

Conditions are structured data, not arbitrary JavaScript or SQL.

Initial condition examples:

```text
flag equals / not equals
Event has not fired
Encounter status
Scene Run status
Object state
Door state
entity present in Zone
```

Conditions are evaluated server-side before Effects execute.

---

# 13. Approved Story Effects

Story Events may only invoke approved server-side effects/resolvers.

Planned effect vocabulary includes:

```text
show_narrative
set_flag
reveal_zone
open_door
close_door
set_object_state
spawn_monster
spawn_boss
activate_encounter
start_combat
grant_item
apply_status
move_entity
activate_scene_run
complete_scene_run
```

Existing Character / Monster / Boss / Combat / Inventory / Status authority must not be bypassed. A Story effect delegates to the appropriate authoritative resolver or service boundary.

Arbitrary JavaScript, SQL or browser-executed scripts are not a supported Story Event mechanism.

---

# 14. Encounter / Combat Integration

Encounter is the narrative/runtime bridge, while Map Instance provides spatial state and Combat provides authoritative initiative/turn state.

Canonical relationship:

```text
Scene Run
→ Runtime Map Instance
→ Encounter
→ optional Combat
```

An Encounter may bind:

```text
trigger Zone
participant definitions
spawn points
runtime entities
objective / resolution notes
```

Starting Combat does not create a second Map or reset positions.

Combat movement consumes the same Combatant `Move Available` allowance through the Map movement resolver.

Outside Combat, movement participates in the existing normal-round `1 Action + 1 Move` lifecycle whenever sequencing matters.

---

# 15. Template Updates vs Active Runtime

Editing a reusable Map Template must not silently rewrite an already-active Runtime Map Instance.

Reason:

```text
Player may currently stand on a cell
Door/object state may have changed
Story triggers may already have fired
```

Canonical Alpha rule:

```text
new runtime instances use the latest approved Template version
existing active runtime instances remain stable
```

A future GM-controlled migration/sync tool may explicitly apply compatible template changes to a runtime instance.

---

# 16. Story Authoring / Import — Future Boundary

Word/story import and AI story generation are **Future**, not part of the current Map/Story Runtime implementation slice.

Before import/generation is built, the project should define an Adventure Script Template so authored stories are easier to structure and later compile.

Future example template sections may include:

```text
Scenario
Scene
Location / Map
Opening Narrative
NPCs
Events
Trigger
Condition
Effect / Result
Encounter
Spawn
Victory / Failure
Scene Exit / Next Scene
```

Future pipeline:

```text
Adventure Script Template (.docx / text)
→ Importer / AI-assisted compiler
→ Draft structured Story
→ GM review
→ Publish
→ Runtime
```

The current Alpha must not depend on a Word importer, AI generator or free-form story compiler in order to be playable.

---

# 17. Explicitly Deferred

The following remain Deferred unless separately promoted:

```text
AI Story Generator
Word / Google Docs story importer
Adventure Script Template implementation
free-form narrative compiler
fog-of-war light simulation
vision cones
advanced line-of-sight
cover percentages
terrain movement multipliers
AoE templates
large-creature footprints
pathfinding AI
automatic Monster navigation
animated tokens
full asset library
multi-floor 3D geometry
```

---

# 18. Alpha Implementation Order

The next implementation sequence is:

```text
1. Definition foundation
   World Location
   Map Template
   Grid / Cell / Edge data
   Scene ↔ Location / Map binding

2. Runtime foundation
   Scenario Run / Scene Run boundary
   Runtime Map Instance
   runtime object/door state

3. Position + visibility
   Character / Monster / Boss position
   Player default mutual visibility
   GM global/per-viewer overrides
   Player Location display

4. Movement resolver
   9-grid adjacency
   one-cell Move
   blocked cells / walls / doors
   no diagonal corner cutting
   Action/Move lifecycle integration

5. Story Event foundation
   manual + zone trigger
   structured conditions
   approved effects
   Story flags

6. Encounter / Combat spatial binding
   spawn points
   preserve exploration position
   movement in Combat
   return to exploration after Combat

7. GM / Player Map UI
   structured Map editor
   live GM Map
   Player Map / legal move cells

8. True playable E2E
   Scenario Run
   Scene Run
   enter Map
   move
   trigger Story Event
   activate Encounter
   Combat on same Map
   resolve
   continue Scene
```

---

# 19. Locked Alpha Decisions

1. Map gameplay uses a structured square grid with an optional background image.
2. Eight surrounding cells are adjacent; diagonals are distance 1.
3. One ordinary Alpha Move moves at most one legal adjacent cell.
4. Diagonal corner-cutting through blocked walls/doors is not allowed.
5. Characters, ordinary Monsters and Bosses initially occupy one cell each.
6. Every runtime entity has authoritative Map Instance position where positioned.
7. Players see other Player tokens by default.
8. GM can hide a Player token globally or for specific Player viewers; the owner still sees their own token and GM sees all.
9. Reusable Location / Map definitions are separated from mutable Scene/play state.
10. Scenes reference reusable Location / Map definitions and may provide Scene-specific configuration.
11. Mutable gameplay state exists only in Runtime Map / Scene instances, so separate groups/runs can use the same Map safely.
12. Combat reuses existing Map positions and does not automatically teleport/re-layout combatants.
13. Story execution uses structured Trigger + Conditions + Approved Effects; arbitrary JS/SQL is prohibited.
14. Word/story import, AI Story Generator and the Adventure Script Template are Future work, not current Alpha requirements.
15. The current Alpha priority is to make manually-authored Story + Map + movement + Event + Encounter + Combat form one coherent playable loop.
