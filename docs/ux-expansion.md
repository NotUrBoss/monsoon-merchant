# UX and accessibility review — Network Company expansion

Implemented a separate Network Company entry from the title, retaining classic and Daily Voyage progress. The company introduction explains the shared clock before the player begins: only Advance day moves time; it advances every shipment and factory while charging every facility's upkeep.

## Expansion interface

- A wider desktop workspace becomes a single-column phone layout. The fixed day control keeps the shared clock and upkeep visible.
- Five visible region buttons expose the expanded geography. Hub and destination selects are grouped by region; owned hubs are identified.
- Market, Shipments and Industry workspaces reveal one decision area at a time. Cash, company valuation, upkeep and next completion remain visible.
- Warehouse cards distinguish on-hand stock, incoming/production reservations, free space and daily cost. Shipping quotes show cargo stock, destination free/reserved capacity, freight cost, arrival day and current destination sale price without implying guaranteed profit.
- Concurrent operations display transport type, route, quantity, arrival/finish day and remaining days. Transport options show ship/train/plane symbols, names and capacity.
- Manufacturing explains permanent specialization, one job at a time, required inputs, output, processing fee, time, daily upkeep and the 10-batch limit. The local-price margin explicitly excludes freight, construction and upkeep.
- The suggested first chain is 20 t of palm oil from Klang to Singapore, with a warehouse at the destination and a reminder to compare freight before dispatch.

## Popup defect corrected

The global `.good` class applied market-row grid geometry to successful event dialogs, their icon artwork, positive toasts and sea-log items. Product-row rules now use `.goods .good`. Dialogs retain their own layout.

Additional dialog changes constrain height to the safe viewport, keep content scrollable, wrap long headings and actions, prevent close buttons from shrinking, and fit quantity controls and voyage metrics on narrow screens. Existing named modal dialogs, inert backgrounds, focus containment/restoration and dismissal behavior are retained.

## Input and storage

- Native labeled inputs/selects and buttons, visible keyboard focus, live status text, explicit unavailable-action reasons and non-color selection cues.
- Quantity quote updates preserve focused input and caret, including edits within multi-digit values.
- Company saves use a separate key. The Backup panel always exposes selectable export text and a validated restore field; clipboard support is optional.
- Invalid imports and storage failures do not claim success. A failed save keeps the company in memory and opens the export panel. Leaving is blocked until saving succeeds, preserving an export opportunity.
- Classic backup and reset descriptions explicitly cover captain seasons, Daily and Legacy; Network Company uses its own controls.

## Verification and limits

`node --check ui.js` and `node --check network-ui.js` pass. Root browser verification passed at phone, tablet, desktop and short-landscape sizes, covering all nine classic event/result journeys, all three transport types alongside manufacturing, invalid and valid restore, and the full day-60 campaign. Final regressions confirmed destination normalization after restore and focus on the day-60 heading. Source guards prevent delayed clipboard callbacks from rendering after exit; actual clipboard transfer was not exercised. This review does not claim a formal WCAG audit or physical-device/screen-reader coverage.
