# Player Status Visibility — Alpha

> Status: Canonical Alpha Player projection rule  
> Scope: authenticated Player read-only visibility of their own Character's currently active Runtime Status conditions.

## 1. Purpose

The Player Pages Alpha specification requires the Combat summary to show relevant combat/status conditions.

The canonical Runtime Status authority already exists, but prior to this slice only GM surfaces could read it.

This slice adds a safe Player projection without creating any new Status mechanics.

## 2. Player authority boundary

Player route:

```text
GET /api/player/characters/:characterId/status-effects
```

The authenticated User must:

- be active;
- own the requested Character.

Another Player's Character is rejected.

The route is read-only. POST, PATCH, PUT and DELETE are not accepted.

## 3. Returned projection

Only currently ACTIVE Status instances are returned.

Each projected Status contains only:

```text
name
status
durationType
remainingRounds
stackCount
```

The Player projection MUST NOT return:

- GM meaningful reason;
- GM/User actor IDs;
- source IDs;
- source context;
- source Ability identity;
- full Definition/effect snapshot;
- strength/internal comparison data;
- immutable audit history;
- removal provenance;
- hidden metadata.

This is a presentation projection, not another Status authority.

## 4. Combat UI

The Player Combat page shows an `Active Status Conditions` panel.

For the current Combat it loads only Character combatants controlled by the authenticated Player, then requests the owner-checked Status projection for those Characters.

The UI displays:

- Status name;
- Character display name;
- Permanent or remaining-round duration;
- stack count when greater than 1.

The panel does not expose GM audit/provenance.

### Refresh consistency

Overlapping Combat reads use latest-request-wins ordering. A rendered mutation response invalidates older pending polling reads. Status reads likewise ignore superseded success/error responses, including after Combat ends or no owned Character remains. One Character's failed Status read does not hide other Characters' successfully loaded statuses; failures are shown separately in Traditional Chinese without exposing raw server diagnostics. Loading and failure are never presented as an authoritative empty Status list. This is UI consistency only and adds no Status mutation or countdown timing.

`tests/player-combat-refresh.test.mjs` executes the production page functions with a minimal DOM fixture and controlled asynchronous responses to verify ordering, partial failure, ownership filtering and HTML escaping. It makes no live network requests.

## 5. No lifecycle changes

This slice MUST NOT:

- decrement duration;
- expire a Status;
- alter stacking;
- apply/remove a Status;
- execute trigger timing;
- apply damage/healing;
- change HP/MP;
- consume Action/Move;
- move a token;
- execute an Ability.

Existing GM Status Runtime APIs remain the only current mutation surface.

## 6. Timing boundary

This slice deliberately does not connect Status duration to Combat turn hooks.

The current canonical backlog still leaves the exact owner turn/start/end countdown boundary open, so Player visibility must not imply or introduce a timing rule.

## 7. Production verification

Automated production verification remains plan-only for authenticated Player projection.

Normal production deployment and unauthenticated route smoke are still required before release is considered Production complete.

Authenticated projection can also be checked by the separate, explicitly authorised Status application live workflow documented in `PRODUCTION_ALPHA_LIVE_PLAYTEST.md`. Its assertions cover the owner's exact projection allowlist, rejection of another Player and anonymous requests, and rejection of write methods. The existing projection descriptor remains plan-only. The new runner has real Worker HTTP/SQLite coverage locally; an authorised production execution is still required before claiming authenticated live D1 coverage.
