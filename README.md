# Monsoon Merchant

An installable, offline-capable trading game for phones, drawn in 16-bit pixel art. One game: you start as a captain with an old coaster, and your trading company grows around you into a full supply chain.

## Three ways to play

- **Season**: 90 or 120 days, scored at the end.
- **Endless**: no last day. The game runs in 60-day chapters, one monsoon each. Every chapter close autosaves and brings a report, new bounties, a weather twist, a tougher Towkay Lim and banked Legacy (needs two voyages, capped at 30, halved from chapter 7). The Monsoon level rises every two chapters. Retire whenever you like ("hand over the house") for a capped retirement payout; ten days of negative net worth closes the house. A shipwreck with a company is not the end: you restart in a coaster. Best houses go in the Hall of Houses.
- **Daily Voyage**: the same 60-day seed for everyone each day. The flame counts your streak; streak achievements count total Daily plays, and there is no growing streak bonus.

## Captain first

Sail across 9 South-East Asian ports. Buy cargo, read the monsoon, sail, sell, take contracts and beat **Towkay Lim**, the rival trader. As your peak net worth grows, the season unlocks the supply chain one layer at a time, in a fifth **Company** tab:

| Unlocks at | Layer | What you can do |
| --- | --- | --- |
| Start | Trader | Buy, sail, sell, contracts and banks. |
| RM 150k | Warehouses | Rent a warehouse in a port. Store and load cargo from the Market tab. Set standing buy and sell orders. |
| RM 500k | Factories | Build a factory beside a warehouse. It turns stored inputs into products every day. |
| RM 1M | Freight | Run up to 3 standing freight routes between your warehouses, or to another port's market (one more every two Endless chapters, up to 6). |
| RM 2M | Estates | Buy a plantation or mine (palm, rubber, rice, coffee, coal) beside a warehouse where it grows. It fills the warehouse every day, best in its monsoon. Blight alerts. |
| RM 3M | Shops | Open a shop beside a warehouse. It sells only goods you made, grew or shipped in, to its own customers. Choose value, standard or premium prices, and cash or 30-day credit (more buyers, some bad debts). Price-war alerts from Lim. |
| RM 8M | Managers | Hire a cautious, balanced or aggressive branch manager. They keep a port's factory fed, sell surplus and answer its alerts while you sail. |
| RM 10M | Ocean lanes | Colombo, Mumbai, Dubai and Tokyo join the chart: long, rich legs for the captain and for freight. Not in the Daily Voyage. |

**Source → store → manufacture → ship → sell or fulfil a contract**, all while you keep sailing. Every automatic action is one you approved, with a limit:

- **Buy orders** buy up to N t a day, only when cheap (10% below the regional average) or at any price.
- **Sell orders** sell up to N t a day, only when dear (10% above average) or at any price.
- **Factories** run whenever their warehouse holds the inputs and has room: Packaged Food (2 rice + 1 palm oil), Tyres (1 rubber + 1 steel), Coffee Mix (2 coffee + 1 rice) and Machinery (3 steel + 1 electronics).
- **Freight routes** repeat every trip until paused, delivering to your warehouse or selling on arrival.
- A **cash reserve** (default RM 20k) protects the captain: orders, factories and freight never spend below it. Contracts whose destination has your warehouse are delivered from it automatically.

The map shows your warehouses, factory smoke and freight at sea. Each warehouse, factory and route shows its own profit, and docking brings a short report of what the company did while you sailed.

Only **your own tonnes** (made, grown, shipped in, or stored from your hold after buying elsewhere) count for big orders, contracts filled by the company, and shops. Stock bought at a port's own market cannot be passed straight back to that port.

Once you own a factory, **big orders** arrive: hundreds of tonnes of a product for one port, paid per tonne on delivery plus a bonus when complete (by ship, freight route or from your warehouse there). Accepting takes a 5% deposit, lost if less than half is delivered. **Company alerts** ask for a decision now and then: pay off a dockers' strike or wait, repair a broken factory or wait for parts, run overtime during a product boom.

Longer seasons scale their goals: the rival, bounties and the net worth needed to unlock the next Monsoon level (RM 3M in 90 days, RM 4M in 120). At the end of the season, the company counts in your net worth: stock at local prices, buildings at 70% of what you invested. Products stay hidden until factories unlock, so the early game is as simple as before.

Also in every season: monsoon winds, storms and pirates, three Legacy bounties, Daily Voyage, Monsoon levels, and Legacy unlocks between seasons. See `docs/merged-design.md` for the design.

**Achievements**: 55, grouped in the Ledger by Trade, Voyages, Wealth, Company, Mastery, Endless and Daily, with progress bars for the counted ones. Ranks now go past Legend to Taipan (RM 100M) and Merchant Prince (RM 250M).

## Saves and the Archive

Seasons save in this browser (`mm.run.normal.v1`, `mm.run.daily.v1`, `mm.run.endless.v1`, Legacy in `mm.meta.v1`). An unreadable save is kept aside rather than overwritten, and the app warns you. Older captain seasons continue in the new game and gain an empty company.

The separate **Monsoon Company** campaign is retired. If this device has a campaign in progress (`mm.company.v3`, or older `mm.company.v2` / `mm.network.v1` saves, which still migrate untouched), **Archive** on the title screen lets you finish it or restore a company backup. New company campaigns cannot be started.

This is a local single-player game, not a cloud-synced or multiplayer economy; use one game tab at a time.

## Install and development

Open the published game once online. On iPhone, use Safari's Share → Add to Home Screen. On Android, use the browser's Install app / Add to Home screen. After the service worker caches the assets, the game can reload offline.

The runtime is plain HTML, CSS and JavaScript, with no build step or external runtime requests. For local development, run `python -m http.server 8000` from the repository and open its localhost address.

- `engine.js`: the game engine: markets, voyages, rival, bounties, Endless chapters, the in-season company (warehouses, orders, factories, freight, estates, shops, managers, ocean lanes) and save validation.
- `ui.js`, `map.js`: the game screens, including the Company tab.
- `logistics.js`, `network-ui.js`: the archived company campaign engine and screens (finish-only).
- `company-actions.js` (archive): atomic multi-step delivery/production previews and next-event advancement.
- `company-play.js` (archive): operations desk, route comparison, customer decisions and compact reports.
- `company-world.js` / `company.css` (archive): state-driven schematic map, port environment and responsive presentation.
- `art.js`, `pixel.js`: pixel sprites, sailing scenes, port skylines and the classic sea chart, all drawn in code (no image assets).
- `sfx.js`: chiptune sound effects and the optional sea-shanty music loop.
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

The browser suite uses actual UI controls against a Pages-style subpath, including building a warehouse, standing orders, a factory and a freight route inside a season, the archived 60-day campaign, concurrent production and deliveries, backup/restore, service-worker offline reload, form validation, responsive layouts, legacy-save migration, and simulated storage failure. It records screenshots and failure traces. It does not access production saves.

See `docs/interaction-review.md` and `docs/unified-review.md` for the architecture, level/environment design, workflow contracts and remaining release checks. Automated checks reduce risk; they do not prove that every possible action sequence or physical device is bug-free.

Work on a review branch and merge its PR only when ready to publish: `main` supplies the live GitHub Pages game. Keep `APP_VERSION`, the classic engine version and service-worker cache version aligned when releasing changed assets. Runtime version is 2.3.1; archived company save schema is v3.
