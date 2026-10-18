# Monsoon Merchant — Network Company expansion

Prepared 18 October 2026 for review before publishing. Version 1.1.0 adds a separate Network Company mode while preserving Captain seasons, Daily Voyage and their existing progress.

## What changed

- Fourteen hubs span Southeast Asia, East Asia, the Indian Ocean, the Middle East and Australia.
- Three concurrent charter shipments can be expanded to six. Sea freight moves bulk cargo cheaply, air freight moves smaller loads quickly, and rail uses five explicit land corridors.
- Twelve products support trading and four manufacturing chains: food, textiles, electronics and machinery.
- Warehouses can be built and upgraded. Incoming cargo and factory output reserve capacity immediately, preventing overbooking.
- One shared clock advances every shipment and factory, charges facility upkeep and settles the business on day 60. Cash, debt, freight, processing fees, capacity and resale values are visible.
- Company progress has its own save and validated backup controls. Classic progress remains separate.
- The interface adapts to phone, tablet and desktop layouts, with grouped regions and hubs, operation arrival dates, labeled controls and keyboard focus.
- The application and offline cache versions are 1.1.0. Both new modules are precached, and the factual JSON-LD description includes the expanded game.

## Bugs fixed

The main popup alignment defect came from a product-card grid style also matching positive event dialogs, icons and messages. Product styling is now scoped to the market. Dialogs also fit short and narrow viewports, wrap content and scroll vertically when needed.

Additional fixes reject malformed classic trading/loan amounts, prevent company accounting overflow, normalize destinations after starting or restoring a company, stop delayed clipboard callbacks from reopening a closed screen, and move keyboard focus to the day-60 result. Direct icon navigation now returns the image instead of the cached game shell.

## Specialist reviews

Creative game design, UX/accessibility, frontend/backend engineering, consumer behavior and independent QA reviews were rerun. Their findings and implemented changes are recorded in the five accompanying expansion review documents. The consumer review is an expert assessment, not empirical player research.

## Automated verification

All 50 tests passed on the final implementation. Coverage includes:

- 200 independent seeded company campaigns, 38,527 checked states, 3,967 deliveries and 22,500 tonnes manufactured.
- Thirty additional full company campaigns covering all transport modes and factory recipes.
- One hundred classic seeded seasons, progression, save compatibility, invalid imports and numeric failure paths.
- Concurrent capacity reservations, production, debt, terminal settlement, offline caching and structured data.

Syntax and whitespace checks also passed.

## Browser verification

The expanded game was exercised in a local browser preview:

- Started a company, built destination warehouses and dispatched sea, air and rail cargo concurrently while producing food. All jobs arrived or completed on their expected days; cargo could then be sold.
- Invalid backup imports preserved the current company. Reload, continue and valid backup restoration worked.
- Clicked through a complete campaign to day 60 and separately confirmed terminal heading focus, the final-value announcement and removal of the Advance day control.
- Checked all five regions and layouts at 375×812, 768×1024 and 1440×900, with no horizontal overflow or offscreen controls.
- Exercised all nine classic event types and their results, plus trading, port, departure, menu and confirmation dialogs. Positive result alignment was checked at phone, tablet, desktop and 812×375 landscape sizes.
- Confirmed keyboard focus containment/restoration and inert backgrounds for the tested classic dialogs.
- Stopped the preview server, reloaded the game offline, resumed a company and advanced a delivery. Direct offline icon navigation returned the actual image.
- No browser console warnings or errors appeared during the final checks.

## Scope and remaining validation

Transport is chartered and routes are abstracted; this release does not introduce owned train/plane fleets, track construction or a multiplayer backend. The economy has deterministic price windows, limited market stock and explicit costs.

A novice playtest would help tune pacing and strategy. Physical Safari/iOS/Android devices, screen readers and formal performance benchmarks were not covered. Clipboard export text and restoration were verified; actual clipboard transfer was not. Structured data checks do not guarantee search indexing or rich results.

## Release status

This expansion is prepared for a review pull request. The current live game remains version 1.0.1 from PR #1. Publishing this expansion requires merging its pull request into main; GitHub Pages settings are unchanged.
