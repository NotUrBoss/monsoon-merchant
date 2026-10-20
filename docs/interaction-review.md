# Interaction release 1.3.0: fewer actions, meaningful decisions

## Delivery scope

This is the first interactive slice, not the entire long-term proposal. One prefilled delivery can include destination construction, missing-cargo purchase and transport in one reviewed confirmation. The original manual workspaces remain supported. World artwork is now actionable through keyboard-operable SVG hotspots and ordinary touch-sized buttons; this is not a full isometric art replacement.

From an already-started company, the default 20 t Straits own-ship order requires four primary activations: review plan, confirm own ship, next event, fulfil. No product entry is required for that prefilled order. This count is tested for that specific path; custom routes and other contracts need additional choices.

Factories have a buy-missing-inputs-and-start shortcut. The opening food-chain proposal separately previews the factory construction cost, missing inputs and processing fee. There are no silent loans or background purchase policies.

## Architecture review

- `logistics.js` remains the sole ledger and rule authority. Save schema v3 adds a validated customer agreement; its contract resolver is used by quoting, fulfilment, expiry and save validation.
- `company-actions.js` composes the existing commands on a validated copy. Previewing and cancelling have no economic effect. Confirmations re-quote and require the original complete-state snapshot. A failed intermediate operation, stale quote or repeated confirmation cannot partially commit.
- Existing cargo is used before purchasing a shortfall. Every cost is charged once; destination space is reserved by the original transport command. The captain must actually be docked at the origin and cannot accidentally carry an unrelated preloaded hold through the shortcut.
- Fixed-order plans must match the contracted product, quantity and hub. A late option is displayed but cannot be confirmed as an on-time order delivery. Market projections are explicitly estimates, based on current replacement input cost and destination price; they exclude facility costs and upkeep and are not historical profit.
- `company-play.js` renders task-oriented previews and reports. Animation is presentation only. Closing a report, disabling effects, switching workspaces or cancelling a plan does not advance time.

## Time advancement and stop policy

Next event is a bounded sequence of the existing daily command, not an approximate jump. The quote shows the target day and cumulative upkeep/interest. It stops for arrivals, production completions, a ready order, a customer decision, an open order's deadline, the day-31 monsoon change, season settlement, or before spending below three days of upkeep. No active jobs means no next-event action. An existing ready order or due-today contract must be reviewed before another next-event step.

The one-day button is retained as an explicit override. It can deliberately pass a deadline, ignore an optional offer, or incur upkeep debt under the existing rules. Next event does not auto-sell, auto-fulfil, buy stock, take loans or charge a second daily fee.

## Level / interaction review

The operations desk guides a first cargo delivery, closing that order, starting a food chain, and delivering manufactured output. The guide is expandable rather than a permanent five-button strip. Customer choices and operational reports are non-modal; the player does not have to acknowledge each animation.

A single recurring buyer proposes early pantry delivery from day 8. Priority terms are RM 130,000 by day 18; original terms remain RM 110,000 by day 30; an extension pays RM 95,000 by day 35. A reply cannot be repeated and does not immediately pay money. Only actual fulfilment consumes stock and pays the agreed amount. Ignoring the offer retains original terms. This release does not include a general-purpose negotiation engine or customer reputation system.

The scene includes warehouse, factory, freight and captain actions. Existing tabs remain accessible. Map destination selection supports keyboard as well as pointer input. Route and production previews reserve nothing until confirmation. Reduced-motion preferences and an effects switch suppress visual effects without changing the economic result.

## Save and offline policy

New saves use `mm.company.v3`. When absent, a valid `mm.company.v2` or `mm.network.v1` save is migrated into the new slot; the original slot is never overwritten by the new interface. Malformed v1/v2 saves are rejected before migration. Current v3 backups include the agreement, captain and all logistics state together. Existing classic/Daily saves are untouched. Reopening an older deployed version would read its older slot, not v3 progress; retain/export a v3 backup before rollback.

The two new interaction modules are precached with the other runtime files. Runtime, classic version marker and offline cache are 1.3.0. Migration tests retain historical fixture shapes rather than merely changing their version number.

## Acceptance coverage

103 Node engine/regression tests: all 73 prior test cases retained (historical fixtures and version/cache assertions updated), plus 30 new tests for composite transactions, stale and duplicate quotes, invalid inputs, immutable previews, capacities, deadline-aware advancement, customer terms, v1/v2 migration, three customer paths through settlement, and 100 seeded smart-operation campaigns.

Browser suite: the five original journeys plus four new journeys per engine, run against a real HTTP server at a Pages-style subpath. New coverage includes the four-action opening and full season, missing-input production, customer choices and payout, cancelled and invalid plans, SVG keyboard actions, responsive routes at 320/375/768/1440 px, v2 migration with a real offline reload, cache presence of new assets, malformed agreement restore, deadline stops and presentation/economy invariance. Every uncaught page error fails the journey. Tests use independent browser contexts and never production saves.

The local runtime blocks HTTP browser navigation. Local DOM smoke tests therefore use in-memory storage and inline assets, and are not counted as full offline E2E evidence. GitHub Actions supplies the real Chromium/Firefox/WebKit acceptance runs. Read their recorded result rather than assuming a passing status from this document.

## Boundaries / future increments

Physical iOS/Android installation behaviour, long-term balancing and every possible action sequence are not proven by these tests. Simultaneous editing in multiple tabs remains unsupported; use one active company tab. Larger art redesign, supplier personalities, general negotiations, rival companies, endless campaigns, manufacturing speed modes and autonomous replenishment policies remain future increments. No multiplayer, paid service or cloud AI dependency is introduced.
