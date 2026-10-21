# District Builder — desktop prototype 0.1.0

## Scope and entry point

Open `desktop/index.html` through a local HTTP server (for example `python -m http.server 8000` at the repository root, then `/desktop/`). This is a playable, desktop-first browser prototype, not a Windows/macOS installer and not the final game redesign. A merge makes the separate `/desktop/` route available; it does not replace the existing title screen.

It is intentionally a separate game mode. The original 1.3.0 runtime, cache, economies and save slots are unchanged. Old company saves are not converted into the new economy. District progress lives in `monsoon.district.v1`; valid district backups alone can be imported. No cloud account, backend, external asset requests or paid service is required.

## What to play

1. Review the food business, then approve the RM120,000 factory/depot investment. The starting warehouse and RM500,000 cash are supplied.
2. Press play. Automatic purchases, successive production batches and local sales repeat without routine commands. Speed changes affect pacing, not economic outcomes.
3. Inspect a building or use Build to place another facility. Upgrades increase both capacity and upkeep. A running batch must finish before its factory can be upgraded.
4. Review the Singapore expansion (RM85,000). It enables a recurring charter route and balanced selling: 1 t/day locally and surplus exported in loads of at least 6 t.
5. Use Policy to set a discretionary spending ceiling, cash reserve, input buffer and local/balanced/export strategy. Read Accounts to distinguish operating profit from cash flow.

The simulation always opens paused. Editing, backing up, switching inspection tools and backgrounding pause the UI clock. The original single-day button remains optional. No real-time catch-up or offline earnings occur when the page is closed. There is no 60-day settlement/reset; a technical safety ceiling exists at 1,000,000 simulation days.

## Architecture and accounting

`desktop/simulation.js` is the authoritative state machine for this mode. All district buildings, inputs, work in progress, local sales, export cargo and cash belong to a single state. Rendering, storage and timers are outside it. The first chain shares the original food recipe's material proportions but uses explicitly rebalanced prototype economics, not an adapter to the original 60-day company state.

Commands are validated-copy transactions with revision-checked confirmations. Preview/cancel never mutate the company. An individual simulation day is atomic; advancing many days commits complete days only. Existing paid-for jobs and export deliveries finish even after automatic operations are disabled.

One level of factory transforms 4 t rice and 2 t palm oil into 6 t food over two days. Rice costs RM800/t; palm costs RM1,200/t; processing costs RM1,300 per six tonnes. Finished-goods cost is therefore RM1,150/t. Local grocers pay RM2,400/t with a depot-limited daily capacity; the standing Singapore buyer pays RM3,100/t. These are game rules, not real prices.

Automatic spending is inputs + processing + freight under one daily cap. Missing inputs and each batch's processing fee are approved together. Optional buffer top-up is lower priority. The reserve blocks discretionary spending, not already-incurred fixed costs. No loans, construction or contracts are silently taken out. An unaffordable fixed-cost day rolls back and pauses; there is no negative cash or hidden debt. Falling below the reserve stops multi-day/autoplay advancement for review.

The single chartered vessel departs only when returned, sufficiently loaded and affordable. The outbound passage is three days in calm weather, four during the second half of each 60-day weather cycle; return time is the same. Freight is charged once at departure; payment and cost of goods sold are recorded once at delivery. Production space is reserved immediately. Local deliveries are abstracted as instant daily depot service; export cargo is genuinely in transit.

At every state boundary validation checks material conservation and ledger reconciliation:

- Rice bought = raw rice + rice in running batches + rice used in finished production.
- Palm bought follows the equivalent identity.
- Food produced = food in warehouse + export cargo + local sales + delivered exports.
- Cash = starting cash + sales receipts − purchases − processing − freight − upkeep − approved capital expenditure.
- Operating profit = revenue − sold-goods cost − freight − upkeep.
- Cash change + capital expenditure + stock/work/transit cost value = operating profit.

Taxes, depreciation, interest and credit are not simulated. A profitable business can have negative cumulative cash flow because investment and unsold stock tie up cash. The UI labels these separately.

## Level and environment design

Eight selectable serviced plots, one original SVG isometric district and a schematic two-hub regional view. Facilities visibly change by type and level; factory smoke reflects active production and can be disabled. A ship's position follows the actual route progress. Keyboard Enter/Space activates map plots; ordinary buttons expose construction, policies and accounts. Space controls time outside form fields; Escape cancels a proposal. Reduced-motion preferences are honored.

Placement is visual apart from waterfront terminal eligibility. Shared road/service capacity is abstracted; detailed adjacency, road construction, traffic and local vehicle pathfinding are not simulated. No demolition is available in this prototype. Alerts explain sales/transport capacity, missing facilities, idle production, storage and reserve pressure; these are operating diagnoses, not adversarial AI.

## Persistence and offline safety

Save after each committed command/day. A failed write pauses and preserves the newer in-memory state for JSON export. Invalid saved data is not automatically overwritten; it can be exported unchanged before an explicitly confirmed new district. Imports are validated and persisted before replacing in-memory state. Reopening is always paused. Storage-change detection stops another tab from knowingly overwriting a different save; this is not a multi-user transactional database, and one active district tab remains recommended.

The child service worker is scoped to `/desktop/`, with a `district-builder-` cache prefix. It never deletes `mm-` caches. Only its own HTML/CSS/JS are precached. No claims are made about a native desktop installation or physical mobile installed-app behavior.

## Verification

Local engine run: 125 passing cases (103 existing + 22 district cases). District cases cover command atomicity, duplicate/stale approvals, upgrades, reserve and daily-budget bounds, fixed-cost insolvency, capacity, exact daily/batched time equivalence, repeated export cycles, monsoon timing, future save equivalence, invalid inputs, 100 deterministic policy sequences over 180 days and financial/material conservation.

`tests/desktop_e2e.py` defines nine journeys per browser. They use visible controls at a Pages-style HTTP subpath: 120 days of autonomous local operation, repeat exports, pause and synthetic visibility-event behavior, budget controls, keyboard placement/cancellation/duplicate clicks, genuine service-worker offline reload with original-save/cache isolation, quota recovery/backup import, corrupt-save recovery, responsive views and effects invariance. The tests never use production saves. Fault injection is limited to explicitly named storage/corrupt-save/visibility fixtures; state reads are otherwise observational.

Run `node --test tests/*.test.cjs`, then install `tests/browser-requirements.txt` and the three Playwright browsers. Run `python tests/browser_e2e.py --browsers chromium firefox webkit --output /tmp/classic-evidence` for the existing modes, and `python tests/desktop_e2e.py --output /tmp/district-evidence` for the prototype. Read actual Actions results for browser pass/fail counts; test definitions alone are not evidence that a run passed.

## Deliberately not included yet

A full SimCity-equivalent game, native installer, real road/utility networks, spatial efficiency, multiple product chains, general supplier/customer reputation, dynamic market competition, rivals, demolishing/reselling facilities, cloud synchronization, and multiplayer. Balance is a first-pass playable model, not a completed economy study. Human playtesting must establish whether beginners understand the bottlenecks and find the business enjoyable.

Keep development on its review branch. Do not merge/deploy this prototype without approval.
