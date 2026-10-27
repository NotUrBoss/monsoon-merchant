# Monsoon Merchant

An installable, offline-capable trading game. **Play Monsoon Company** combines captaining, manufacturing, warehouses, sea/air/rail freight, delivery orders and finance in one 60-day campaign.

## The unified campaign

Begin with RM 500,000, a Port Klang warehouse and a starter coaster. Every workspace uses the same money, inventory network, liabilities, calendar and company backup. Changing the selected regional hub manages remote facilities; it does not teleport your captain.

**Source → manufacture → store → load or charter → travel → unload → sell or fulfil an order.**

Manage 14 hubs and 12 products. Run your own captain alongside up to three chartered shipments, expandable to six. Factories transform local inputs into food, textiles, electronics or machinery. All work advances only when you press **Next event** or the one-day advance button. Arrival and production space is reserved before departure or job start; stock cannot be sold twice.

The captain's voyage quote shows cost and arrival day. Monsoons change on day 31; ship condition affects passage time. Insurance includes repair of voyage storm damage at arrival. Repair and upgrade your ship through the Captain workspace. Unified warehouses can expand to level 10 / 1,240 t so the largest 1,200 t ship can actually be received.

Orders pay once and consume delivered warehouse stock instead of an ordinary market sale. Borrowing and repayment share the company ledger: daily interest is 0.5% of outstanding company debt, and sale/order proceeds repay debt before increasing spendable cash. Check upkeep and delivery dates before spending the reserve. The campaign settles on day 60, including remaining cargo and asset resale values, less liabilities.

## Fewer-click operations

The Map workspace is an operations desk. Click the warehouse, factory, captain or freight terminal, or use the matching accessible action buttons. Original workspaces remain available.

**First delivery in four primary actions after starting:** Plan the Straits delivery → Confirm your own ship → Next event → Fulfil the delivered order. The prefilled plan can include the destination warehouse, missing cargo and voyage in one reviewed transaction. Every charge is shown; nothing moves until confirmation. Custom routes compare own-ship, sea, air and available rail options.

After the first order, review the opening food chain to build a processor, buy missing inputs and start 10 batches together. Existing factories also have a buy-inputs-and-start shortcut. No automatic borrowing or ongoing spending policy is enabled.

Next event previews the elapsed days and upkeep, then stops at the next completion or important decision. It also protects a three-day upkeep reserve and open contract deadlines. One-day advance remains available for deliberate overrides. Short operational summaries can be dismissed or effects disabled without changing the ledger.

From day 8, an optional pantry customer decision trades a higher payment for earlier delivery, or a lower payment for more time. The agreed deadline/payment is saved and enforced by actual fulfilment. Keeping or ignoring the offer retains the original contract. No money is awarded merely for replying.

## A first working supply chain

Open a Singapore warehouse. At Klang, buy palm oil, then either charter it to Singapore or load your captain's hold and sail. Advance to the quoted arrival day and fulfil the 20 t Straits starter order by day 15.

Build a food processor at Klang. Buy 20 t rice and 10 t palm oil, and run 10 batches to produce 30 t packaged food. When complete, deliver the food to Singapore and fulfil its pantry order by day 30. The captain, factory and chartered freight can be working concurrently. The objective tracker guides this progression without granting hidden money or cargo.

## Saves and existing games

Company progress uses `mm.company.v3` in this browser. Its Backup button exports all integrated modules together. Valid v2 company saves and Network Company v1 saves migrate into the new slot; their original `mm.company.v2` and `mm.network.v1` copies remain untouched. Malformed backups are rejected before replacing the current game, and a storage failure exposes an in-memory backup instead of silently discarding play.

Classic captain seasons, Daily Voyage and Legacy remain available as archived challenges with their original saves. They are not numerically merged into the new company: the old economies, unlocks and scoring differ. Features unique to those challenges, such as Ah Long and the original captain/Legacy unlock tree, remain there. This is a local single-player game, not a cloud-synced or multiplayer economy; use one active game tab per company.

## Install and development

Open the published game once online. On iPhone, use Safari's Share → Add to Home Screen. On Android, use the browser's Install app / Add to Home screen. After the service worker caches the assets, the game can reload offline.

The runtime is plain HTML, CSS and JavaScript, with no build step or external runtime requests. For local development, run `python -m http.server 8000` from the repository and open its localhost address.

- `logistics.js`: authoritative unified company engine, validation and migration.
- `network-ui.js`: company workspaces, controls and persistence.
- `company-actions.js`: atomic multi-step delivery/production previews and next-event advancement.
- `company-play.js`: operations desk, route comparison, customer decisions and compact reports.
- `company-world.js` / `company.css`: state-driven schematic map, port environment and responsive presentation.
- `engine.js`, `ui.js`, `map.js`: preserved classic game; the company reuses its ship catalog.
- `index.html`, `sw.js`, manifest and icons: app shell and offline assets.

## Tests and release gate

Run the dependency-free engine/regression suite with Node.js 22:

```sh
node --test tests/*.test.cjs
```

Run browser acceptance tests with Python 3.12:

```sh
python -m pip install -r tests/browser-requirements.txt
python -m playwright install --with-deps chromium firefox webkit
python tests/browser_e2e.py --browsers chromium firefox webkit --output /tmp/mm-evidence
```

The browser suite uses actual UI controls against a Pages-style subpath, including a complete 60-day campaign, concurrent production and deliveries, backup/restore, service-worker offline reload, form validation, responsive layouts, legacy-save migration, and simulated storage failure. It records screenshots and failure traces. It does not access production saves.

See `docs/interaction-review.md` and `docs/unified-review.md` for the architecture, level/environment design, workflow contracts and remaining release checks. Automated checks reduce risk; they do not prove that every possible action sequence or physical device is bug-free.

Work on a review branch and merge its PR only when ready to publish: `main` supplies the live GitHub Pages game. Keep `APP_VERSION`, the classic engine version and service-worker cache version aligned when releasing changed assets. Runtime version is 1.3.0; company save schema is v3.
