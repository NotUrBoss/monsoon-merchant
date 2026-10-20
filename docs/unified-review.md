# Unified company: architecture, level and environment review

## Architecture decision

The old captain and Network Company modes had independent money, stock, time and saves. Joining their menus alone would not join their gameplay. The company engine now owns one authoritative state. Its command layer handles trade, manufacturing, charter dispatch, captain loading/sailing, orders, shipyard and finance; the interface and art are projections of that state.

The original ship catalog is reused rather than maintaining conflicting copies. Classic challenge economies and Legacy remain archived, save-compatible experiences. The new campaign brings the captain loop into the manufacturing/logistics economy; it does not pretend that all old balances and unlocks can be merged losslessly.

## Workflow contracts

| Operation | Resource transition | Time / accounting rule |
|---|---|---|
| Buy | Market stock → local warehouse | Charge shared cash immediately; respect unreserved capacity. |
| Manufacture | Warehouse inputs → work in progress → finished local goods | Consume inputs once, pay processing fee, reserve output, finish on the shared day. |
| Charter | Source warehouse → sea/air/rail job → destination warehouse | Charge freight and reserve arrival capacity at dispatch. Rail requires a listed corridor. |
| Captain load / sail | Local warehouse → ship hold → voyage → destination warehouse | No remote loading or teleportation. Reserve the whole delivery; automatically unload once. |
| Sell / order | Warehouse goods → consumed sale quantity | One payout only. Debt repayment precedes spendable cash. |
| Advance day | Captain, chartered freight and factory jobs advance together | Resolve due work, charge upkeep/interest once, update markets and settle on day 60. |
| Save / restore | Complete company state ↔ validated schema | Validate before mutation. Preserve the old save during migration. Reject invalid job clocks, costs, cargo and capacities. |

Rejected commands must leave serialized state unchanged. Cargo is counted in exactly one physical state. Work in progress is not booked as already-finished output. Borrowing increases cash and debt equally; it does not create net worth. Arrival on an order deadline is usable before the next day advances. Work finishing after the final day is blocked at quotation.

## Level design

The five milestones teach sourcing, regional delivery, manufacture, captain operations and order fulfilment. The Klang–Singapore opening keeps the first chain local; optional Colombo and Sydney orders encourage wider routes and further manufacturing. Objectives are derived from real transactions, not separate progress counters that can disagree with the economy.

Factories and freight operate concurrently so sailing no longer pauses the company. The shared Advance day button makes the time cost visible. Quotes display deadlines, costs, stock and reservations before committing. Upkeep shortfalls accrue visible debt rather than making the UI unusable; orders expire without an extra hidden penalty.

An integration review found that the original 400 t warehouse ceiling could not receive the largest 1,200 t ship. Unified warehouses now support 1,240 t through paid level upgrades. Legacy companies retain their original limit until the captain is enabled. A dedicated test covers a fully loaded largest-ship voyage, capacity reservation, arrival and persistence.

## Environment and interaction design

The map is a deliberately schematic trade map, not a navigation chart. Hub names, owned facilities, rail corridors and moving jobs come from the engine catalog/state. A gold ring identifies the docked captain; transit markers advance from departure to arrival on the same company calendar.

Port scenery responds to the selected hub: warehouses, stock containers, factory activity and a docked ship appear only when their corresponding state exists. There are no decorative factories falsely claiming production. Text labels duplicate essential visual meaning, routes are keyboard accessible, all hubs remain available through the labelled selector, and motion respects reduced-motion preferences.

Navigation is above scenery. Mobile screens show the next useful objective instead of a tall five-step wall; secondary regional buttons are replaced by the grouped hub selector. Decorative scenery is kept off transaction workspaces so it does not obstruct the controls.

## QA findings and scope

The initial browser pass completed the gameplay journeys but detected re-entrant form redraw errors in Chromium. Replacing a focused input dispatched a change event during DOM replacement. Rendering is now guarded and unchanged field events are ignored. Browser acceptance must rerun with uncaught page errors treated as failures; completing a transaction alone is not sufficient.

The regression suite retains the original 50 tests and adds 23 integration/capacity tests. The browser matrix defines five journeys per engine across Chromium, Firefox and WebKit, including all workspaces at 320, 375, 768 and 1,440 pixel widths. Current passing/failing results are the CI run and its `results.json`, not a claim inferred from this test plan.

Before publishing, inspect the screenshot artifacts, confirm the final source commit passes the PR checks, and keep the current Pages release unchanged until approved. Physical iOS/Android installation, assistive-technology auditing, long-term player balance studies, and simultaneous multi-tab conflict handling are not established by these automated journeys. The game remains local single-player; one active game tab per company is recommended.
