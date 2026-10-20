# Monsoon Merchant

An installable, offline-capable trading game. **Play Monsoon Company** combines captaining, manufacturing, warehouses, sea/air/rail freight, delivery orders and finance in one 60-day campaign.

## The unified campaign

Begin with RM 500,000, a Port Klang warehouse and a starter coaster. Every workspace uses the same money, inventory network, liabilities, calendar and company backup. Changing the selected regional hub manages remote facilities; it does not teleport your captain.

**Source → manufacture → store → load or charter → travel → unload → sell or fulfil an order.**

Manage 14 hubs and 12 products. Run your own captain alongside up to three chartered shipments, expandable to six. Factories transform local inputs into food, textiles, electronics or machinery. All work advances only when you press **Advance day**. Arrival and production space is reserved before departure or job start; stock cannot be sold twice.

The captain's voyage quote shows cost and arrival day. Monsoons change on day 31; ship condition affects passage time. Insurance includes repair of voyage storm damage at arrival. Repair and upgrade your ship through the Captain workspace. Unified warehouses can expand to level 10 / 1,240 t so the largest 1,200 t ship can actually be received.

Orders pay once and consume delivered warehouse stock instead of an ordinary market sale. Borrowing and repayment share the company ledger: daily interest is 0.5% of outstanding company debt, and sale/order proceeds repay debt before increasing spendable cash. Check upkeep and delivery dates before spending the reserve. The campaign settles on day 60, including remaining cargo and asset resale values, less liabilities.

## A first working supply chain

Open a Singapore warehouse. At Klang, buy palm oil, then either charter it to Singapore or load your captain's hold and sail. Advance to the quoted arrival day and fulfil the 20 t Straits starter order by day 15.

Build a food processor at Klang. Buy 20 t rice and 10 t palm oil, and run 10 batches to produce 30 t packaged food. When complete, deliver the food to Singapore and fulfil its pantry order by day 30. The captain, factory and chartered freight can be working concurrently. The objective tracker guides this progression without granting hidden money or cargo.

## Saves and existing games

Company progress uses `mm.company.v2` in this browser. Its Backup button exports all integrated modules together. Valid old Network Company v1 saves migrate; their original `mm.network.v1` copy remains untouched. Malformed backups are rejected before replacing the current game, and a storage failure exposes an in-memory backup instead of silently discarding play.

Classic captain seasons, Daily Voyage and Legacy remain available as archived challenges with their original saves. They are not numerically merged into the new company: the old economies, unlocks and scoring differ. Features unique to those challenges, such as Ah Long and the original captain/Legacy unlock tree, remain there. This is a local single-player game, not a cloud-synced or multiplayer economy; use one active game tab per company.

## Install and development

Open the published game once online. On iPhone, use Safari's Share → Add to Home Screen. On Android, use the browser's Install app / Add to Home screen. After the service worker caches the assets, the game can reload offline.

The runtime is plain HTML, CSS and JavaScript, with no build step or external runtime requests. For local development, run `python -m http.server 8000` from the repository and open its localhost address.

- `logistics.js`: authoritative unified company engine, validation and migration.
- `network-ui.js`: company workspaces, controls and persistence.
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

See `docs/unified-review.md` for the architecture, level/environment design, workflow contracts and remaining release checks. Automated checks reduce risk; they do not prove that every possible action sequence or physical device is bug-free.

Work on a review branch and merge its PR only when ready to publish: `main` supplies the live GitHub Pages game. Keep `APP_VERSION`, the classic engine version and service-worker cache version aligned when releasing changed assets. Runtime version for this integration is 1.2.0; company save schema is v2.
