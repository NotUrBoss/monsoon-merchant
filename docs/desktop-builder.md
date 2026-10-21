# Desktop business-builder prototype

## Approved direction and scope

The approved “Link Monsoon Merchant” conversation asks for strategic business building with little repetitive effort. This milestone proves one self-running district rather than implementing every proposed future region and industry.

The player begins with a reviewed food-business proposal or places facilities manually. A warehouse, food mill, distribution depot and waterfront dock connect one rice-to-food chain to local demand and a repeating Singapore sea route. Facilities occupy serviced plots; warehouse proximity affects handling. The player approves purchasing, production, customer agreements and shipping explicitly. Automation executes those policies within budgets and a cash floor, without borrowing or building.

Local and regional screens are views of the same state. Export stock leaves the local warehouse at dispatch and remains in a shipment until paid for at arrival. Weather can lengthen departures during the monsoon. The ongoing company has no day-60 ending.

## Interface

- Top bar: cash, operating profit, service and the common simulation clock.
- Main area: selectable isometric district or the regional trade connection.
- Single inspector: the selected facility, plot or toolbar workspace.
- Bottom toolbar: Build, Routes, Markets, Upgrades and Company.
- Problems explain their cause, consequence and available remedies.
- Starter approval gives a viable initial configuration; advanced controls expose strategy without requiring them for the first sale.

The existing Monsoon Company and Captain challenges retain their own screens, rules and save slots. The builder uses `mm.builder.v1`, because the continuous, ongoing economy is deliberately different from the older challenge campaigns.

## Time and accounting

Only deterministic in-game days change economic state. Playback speed changes how many identical day steps are scheduled, never prices, yields or weather. Reloading and leaving the game pause it; there is no offline catch-up. Critical cash conditions pause automatically. Optional event stepping remains available for inspection.

Money uses integer minor units. Inventory and shipments share conservation totals. Operating profit recognizes the cost of sold goods and delivered freight. Unsold inventory and prepaid freight remain assets. Operating cash flow includes purchasing and freight when paid; capital investment is shown separately from both. Save validation checks structure, finite bounded values, identifiers and economic invariants before replacing the current state.

If a cash pause occurs with cargo already at sea, the player can explicitly wait for the paid shipment. That action advances committed deliveries while suspending all new procurement, production and dispatch spending, then pauses again. Even a company with no cash can receive the payment it has already earned without taking a loan.

## Acceptance and verification

The central acceptance criterion is repeated automatic procurement, production and paid deliveries after a single starter approval. Verification covers:

- Multiple completed supply cycles without routine commands.
- Material conservation, bounded storage, no negative cash and one payment per arrival.
- Spending budgets, reserve limits and explicit authorization for construction and buyers.
- Equivalent economic outcomes at different playback speeds.
- Pause, visibility changes, exit, save/reload and corrupt-save rejection.
- Placement constraints, capacity improvements and visible bottlenecks.
- Shared local/regional state and monsoon delays.
- Existing campaigns, migration, responsive layouts and offline cache behavior.

Run both browser harnesses in Chromium, Firefox and WebKit, plus all Node regression tests. The GitHub Actions workflow performs these checks for review PRs. These checks do not establish long-term economic balance or usability with first-time players; those require playtesting.

## Deferred

Additional production chains, multiple buildable districts, dynamic competitors, detailed employees and utilities, loans, multiplayer, cloud synchronization and a native desktop installer are outside this milestone. The browser runtime has no external assets or new runtime dependencies.
