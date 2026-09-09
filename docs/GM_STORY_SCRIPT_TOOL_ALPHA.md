# GM Story Script Tool · Alpha

## Purpose

The GM Script Tool is a safer, more readable authoring surface for Story Events. It does **not** introduce a second Story runtime, arbitrary scripting engine, JavaScript execution environment, SQL console, or direct D1 mutation path.

The authority chain is:

`GM Script source → Story Script compiler → normalizeStoryEventStructure() → canonical Story Event Definition → existing Story trigger adapters → shared Story execution authority → subsystem Runtime authorities`

The canonical Runtime rules remain those defined by `docs/STORY_SHARED_EXECUTION_AUTHORITY_ALPHA.md` and the existing Story Event rules.

## Security boundary

The Script Tool must never execute source text as code.

Forbidden implementation techniques include:

- `eval()`
- `new Function()`
- dynamic JavaScript module generation from GM source
- arbitrary SQL supplied by the GM script
- direct Runtime/D1 effects that bypass `story-event-rules.js` and `story-execution-authority.js`

Every compiled trigger, condition, and effect is revalidated by `normalizeStoryEventStructure()` before publication. The `CONDITION {...}` and `EFFECT {...}` escape hatches are therefore only shorthand for canonical approved JSON objects; unsupported types remain rejected.

## Authoring metadata

One directive per line.

```text
NAME Vault alarm
STATUS active
ONCE yes
```

- `NAME <text>`: required; maximum 120 characters.
- `STATUS active|archived`: optional; defaults to `active`.
- `ONCE yes|no|true|false`: optional; defaults to `yes`.
- Empty lines and lines beginning with `#` are ignored.

## Trigger commands

Exactly one `TRIGGER` line is required.

```text
TRIGGER MANUAL
TRIGGER SCENE_START
TRIGGER ENTER_ZONE <sourceZoneId>
TRIGGER INTERACT_OBJECT <sourceObjectId>
TRIGGER FLAG_CHANGED <flagKey>
TRIGGER ENCOUNTER_ACTIVATED <encounterId>
TRIGGER ENCOUNTER_RESOLVED <encounterId>
TRIGGER COMBAT_STARTED <encounterId>
TRIGGER COMBAT_ENDED <encounterId>
```

Stable Definition identities are used where applicable. A Runtime Object ID, Runtime Zone ID, or Runtime Door edge ID must not be authored into the script when the canonical Story Event expects a stable source ID.

## Condition commands

Conditions are added in source order.

```text
WHEN NOT_FIRED
WHEN FLAG_EQ <key> <json-scalar>
WHEN FLAG_NE <key> <json-scalar>
WHEN SCENE_STATUS active|completed|aborted
WHEN DOOR <sourceEdgeId> open|closed|locked|broken
WHEN OBJECT <sourceObjectId> <stateKey>
WHEN ENCOUNTER <encounterId> planned|active|resolved|skipped
```

For flag values, the value is a JSON scalar such as:

```text
true
false
null
3
"opened"
```

A canonical condition object may also be written on one line:

```text
CONDITION {"type":"object_state","sourceObjectId":"vault-door","stateKey":"locked"}
```

The object is still validated against the approved condition vocabulary.

## Effect commands

Effects are executed in source order using the shared Story execution authority.

```text
DO SAY <text>
DO SET_FLAG <key> <json-scalar>
DO SET_OBJECT <sourceObjectId> <stateKey>
DO REVEAL_ZONE <sourceZoneId>
DO OPEN_DOOR <sourceEdgeId>
DO CLOSE_DOOR <sourceEdgeId>
DO ACTIVATE_ENCOUNTER <encounterId>
DO START_COMBAT <encounterId>
```

Complex approved effects such as Runtime Monster/Boss spawning may be authored with one canonical JSON object per line:

```text
EFFECT {"type":"spawn_monster","encounterId":"enc-a","templateId":"monster-guard","level":4,"sourceSpawnPointId":"spawn-a"}
```

Unsupported effect types are rejected by canonical Story Event normalization.

## Compile

`POST /api/gm/story-scripts/compile`

Body:

```json
{"script":"..."}
```

The endpoint requires GM/Admin authentication and same-origin writes. It performs no Story Definition or Runtime mutation and returns the canonical compiled Event payload.

## Publish

`POST /api/gm/scenes/:sceneId/story-scripts`

Body:

```json
{
  "script":"...",
  "eventId":"optional-existing-story-event-id"
}
```

Publish compiles and normalizes the script, then delegates creation/update to the existing canonical Story Event API. If `eventId` is supplied, the Event must already belong to the supplied Scene.

The source text is stored in `story_script_sources` for future authoring/editing. This table is authoring metadata only and is never consulted by Runtime Story execution.

`GET /api/gm/scenes/:sceneId/story-scripts` returns Script sources previously published through this tool together with their canonical Event metadata.

## Apply Now

`POST /api/gm/world/runtime/maps/:mapInstanceId/story-scripts/apply`

Apply Now is intentionally limited to scripts compiled as `TRIGGER MANUAL`.

The sequence is:

1. compile + normalize;
2. resolve the selected Runtime Map's Scene;
3. create/update the canonical Story Event Definition;
4. persist Script source metadata;
5. invoke the existing manual Story Event activation endpoint;
6. execute effects through the shared Story execution authority.

Automatic triggers cannot be manually forced through this endpoint. They must be Published, then fired by their actual Runtime trigger source.

## Source persistence

Migration `schema/0029_story_script_sources.sql` defines:

- `story_event_id` primary key and FK to `story_events`;
- `source_text`;
- `updated_by_user_id`;
- `updated_at`.

Deleting a Story Event cascades its Script source. No Runtime state, execution result, lifecycle occurrence, or effect audit is duplicated into this table.

## GM UI

`public/assets/gm-story-script-tool.js` adds the Script Tool beside the existing Story Event editor. The existing Active Runtime selector remains the context selector.

The UI supports:

- New Script;
- Compile preview;
- Publish;
- Publish + Apply Now for `manual` scripts;
- reloading Script sources previously published for the selected Scene.

The raw structured Story Event editor remains available as the canonical low-level authoring surface.

## Alpha limits

- maximum source length: 24,000 characters;
- maximum source lines: 120;
- one Event per Script source;
- one `TRIGGER` directive;
- no variables, loops, branches, functions, expressions, macros, includes, imports, timers, network calls, JavaScript, or SQL;
- conditional behaviour remains the existing ordered Story Event condition list;
- complex approved effects may use `EFFECT {...}` rather than expanding the DSL in this slice.

These constraints are deliberate. Future syntax should expand only when there is a clear canonical Runtime authority to receive the compiled structure.
