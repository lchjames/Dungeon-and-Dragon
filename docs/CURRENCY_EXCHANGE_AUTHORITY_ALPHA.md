# Currency Exchange Authority — Alpha

> Status: **Production authority contract** for the Alpha Currency Exchange slice.
> Structural economy rules remain defined by `INVENTORY_MONEY_DATA_MODEL_ALPHA.md`.

## 1. Authority boundary

Currency is not a separate wallet table. Bronze, Silver and Gold are canonical `ITEM / CURRENCY` definitions owned through the existing `character_inventory` authority:

- `coin_bronze`
- `coin_silver`
- `coin_gold`

Each Character has at most one stack for each denomination. The Worker lazily inserts missing zero-balance stacks.

`character_inventory.quantity` is authoritative. Legacy `qty` remains a compatibility mirror and is updated in the same authoritative writes.

## 2. Currency cannot use generic Inventory quantity editing

Player Currency quantity may change only through:

1. a committed Currency Exchange transaction; or
2. explicit GM Currency correction.

The stable top-level Inventory gateway rejects generic `/inventory/:inventoryId` quantity/qty PATCH operations when the target definition subtype is `CURRENCY`, before the normal Inventory mutation resolver can run.

The Player Inventory UI also removes Currency rows from the generic quantity editor. This UI rule is defence-in-depth; the server gate is authoritative.

## 3. Gateway chain

The Worker keeps the established Inventory entrypoint stable:

```text
inventory-weapon-gateway
→ currency-exchange-gateway
→ story-script-gateway
→ existing Runtime / Combat / World chain
```

Inventory-owned routes remain at the outer layer. Currency-specific routes delegate one layer inward. This prevents Currency from forcing unrelated Story/Runtime contracts to depend on a changing outer wrapper while still making Currency authority available through the production Worker.

## 4. Exchange Rate Sets

Rate configuration is Campaign-scoped under Alpha campaign identity `alpha`.

`currency_exchange_rate_sets.status` is one of:

- `DRAFT`
- `ACTIVE`
- `ARCHIVED`

Only one normal ACTIVE set may exist. A partial unique index enforces that invariant.

Activating a DRAFT archives the previous ACTIVE set and activates the selected DRAFT through one D1 batch. The action is written to `currency_exchange_admin_log`.

## 5. Directional rates

Alpha supports exactly four directions:

- Bronze → Silver
- Silver → Bronze
- Silver → Gold
- Gold → Silver

Each direction stores an exact bundle:

```text
from_quantity source coins -> to_quantity destination coins
```

The reverse rate is independent and is never inferred as a reciprocal.

Direct Bronze ↔ Gold is out of scope for this Alpha slice.

## 6. Random generation

Default references:

- 100 Bronze per Silver
- 100 Silver per Gold

Default random ranges:

- low → high premium: 2–10%
- high → low haircut: 0–3%

For a reference `R`:

```text
low_to_high_required = ceil(R × (1 + premium))
high_to_low_receive = floor(R × (1 - haircut))
```

The generator must enforce:

```text
high_to_low_receive < low_to_high_required
```

for each adjacent pair before exposing the DRAFT. Randomising never publishes immediately; the GM must explicitly activate the DRAFT.

## 7. Manual Drafts

GM may edit all four directional bundles and enable/disable each direction before saving a manual DRAFT.

All four direction records must remain present even if one is disabled. Quantities must be positive integers.

## 8. Whole-bundle Player exchange

Player submits:

- `rateId`
- `expectedRateSetId`
- quoted source/destination bundle values
- total source Currency quantity to convert

Source quantity must be a positive whole multiple of the current source bundle. The Worker never rounds and never creates fractional Coins.

The destination total is derived server-side:

```text
exchange_units = source_quantity / quoted_from_quantity
destination_total = exchange_units × quoted_to_quantity
```

## 9. Stale-rate protection

The HTTP authority first loads the requested quote, but that is not the final trust boundary.

`trg_currency_exchange_apply` re-validates inside the authoritative transaction statement that:

- the Rate exists;
- the Rate belongs to the expected Rate Set;
- the Set is currently ACTIVE;
- the direction is enabled;
- source/destination Item identities still match;
- quoted bundle quantities still match.

A changed or replaced quote aborts with `CURRENCY_RATE_STALE`. No balance mutation persists.

## 10. Atomic balance mutation

A successful insert into `currency_exchange_transactions` is the transaction boundary.

Before the immutable transaction row commits, the trigger:

1. re-validates the ACTIVE quote;
2. validates bundle totals;
3. subtracts source Currency only when sufficient balance exists;
4. requires exactly one source stack update;
5. adds destination Currency;
6. requires exactly one destination stack update;
7. writes `currency_exchange_out` Inventory audit;
8. writes `currency_exchange_in` Inventory audit.

If any step aborts, SQLite rolls back the statement including trigger side-effects. The system cannot persist only the debit or only the credit.

## 11. Audit

Three audit surfaces exist:

- `currency_exchange_transactions`: immutable completed Player exchanges and the exact quote used;
- `currency_exchange_admin_log`: GM generation/settings/activation actions;
- `character_inventory_log`: balance transitions for exchange-in/out and GM corrections.

Historical exchange transactions preserve the exact quoted bundle even after later Rate Sets are archived.

## 12. Character lock policy

Currency is Inventory authority. A Character marked locked/dead by `character_life_states.character_locked = 1` cannot:

- perform Player exchange;
- receive GM Currency correction through the normal Currency endpoint.

Read-only balances remain available.

## 13. UI contract and current wiring

The Currency slice includes a GM UI module implementing:

- current ACTIVE rates;
- DRAFT preview/editing;
- random generator settings;
- Randomise Today's Rates;
- manual Draft save;
- explicit activation;
- recent Rate Set history;
- Character Bronze/Silver/Gold correction.

The GM module is **not wired into the root GM HTML in this release**. The GM HTTP authority is live and test-covered; root-dashboard loading of `gm-currency-exchange.js` remains a separate UI integration task and must not be reported as completed.

The Player Inventory surface **is wired** to expose:

- separate Coin balances;
- current ACTIVE enabled rates;
- an Exchange dialog with exact bundle step;
- Pay / Receive / After preview;
- Max and bundle increment controls.

Browser UI is not an authority boundary. All writes remain revalidated by the Worker.

## 14. Explicitly out of scope

This slice does not add:

- Store purchase/sale authority;
- automatic Currency conversion during purchases;
- Bronze ↔ Gold direct market;
- floating/fractional Coins;
- hidden base-money normalization;
- Weapon-derived combat formula changes;
- Armour combat maths.

## 15. Verification policy

There is no dedicated automated production-credential Currency writer in this slice.

Normal CI verifies:

- JavaScript syntax;
- Currency generation/unit rules;
- routing and anti-generic-write contracts;
- migration/trigger atomicity contracts;
- Player surface contract;
- all existing Story/Runtime/Combat regressions;
- the normal Cloudflare deployment smoke after merge to `main`.

Any live D1-writing Currency verification must be an explicit operator-controlled authenticated API/browser flow. A green CI or deployment smoke must never be reported as proof that a live Currency balance exchange was executed against production D1.
