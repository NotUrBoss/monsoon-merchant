# Monsoon Merchant

A strategic trading game with two ways to play: captain a ship on the monsoon seas, or manage a regional supply chain with concurrent sea, air and rail shipments. It is built as an installable web app (PWA): open it once, add it to your home screen, and it plays fully offline after its assets have been cached.

## Install on your phone

- **iPhone:** open the game link in Safari, tap **Share**, then **Add to Home Screen**.
- **Android:** open the link in Chrome, then tap **Install app** (or menu ⋮ → **Add to Home screen**).

Progress is saved on the device. Classic captain seasons and Daily Voyage use Settings → Backup; Network Company has its own backup controls and save slot.

## How it plays

### Captain seasons

- 60-day seasons. Turn RM 50,000 and an old coaster into as much as you can.
- Prices differ by port and move when you trade. You only see live prices where you are.
- The monsoon turns mid-season, which changes how long each route takes. Storms, pirates, customs and lucky finds happen at sea.
- Contracts, bank loans, the Ah Long, insurance, shipyards and upgrades.
- Legacy points carry over between seasons. Spend them to unlock captains, ports, cargo, ships and perks, and climb ten Monsoon difficulty levels.
- A Daily Voyage with the same seas for everyone each day, plus a streak counter.

### Network Company

Choose Network Company on the title screen to start a separate 60-day business campaign. Your captain-season progress stays separate.

- Manage 14 hubs across Southeast Asia, East Asia, the Indian Ocean, the Middle East and Australia.
- Charter sea freight for bulk cargo, air freight for speed, or trains on the listed land corridors. Transport capacity, cost and arrival time differ; rail cannot cross the sea.
- Run three shipments concurrently and expand to six dispatch slots. One shared day advances every shipment and factory job.
- Buy and sell twelve products at local hub markets. Build warehouses at additional hubs and upgrade their capacity; inbound cargo and production outputs reserve space.
- Build specialized factories and turn raw materials into food, textiles, electronics and machinery. Batch capacity, input stocks, production time and overheads constrain output.
- Keep a cash reserve for daily warehouse/factory upkeep. Check arrival and completion dates before committing capital; the campaign settles on day 60.

Network Company uses transparent, simplified logistics rules designed for a game, including abstracted freight routes. It does not simulate real carrier schedules or tariffs.

## Files

Plain HTML, CSS and JavaScript with no build step and no external requests:

- index.html: app shell
- engine.js: game rules and economy (also runs in Node)
- map.js: sea chart
- logistics.js: independent Network Company rules, accounting and validated saves (also runs in Node)
- network-ui.js: Network Company interface and separate save/backup controls
- ui.js: interface, sound and saving
- style.css: styles
- sw.js: service worker for offline play
- manifest.webmanifest and icons: installable app metadata

To publish an update, change the files, bump CACHE in sw.js, APP_VERSION in ui.js and VERSION in engine.js, then push. Installed copies show an "update ready" banner on the title screen.

## Review and checks

Run the dependency-free regression suite with a current Node.js release:

```sh
node --test tests/*.test.cjs
```

In environments that block child processes, use `node --test --test-isolation=none tests/*.test.cjs`.
Tests cover progression rewards, save compatibility and validation, backup restoration, seeded seasons, network shipments and production, offline caching, and structured data. Browser journeys and remaining recommendations are recorded in `docs/review.md` and the expansion review documents.

The page describes the game with Schema.org `VideoGame` and `WebApplication` JSON-LD. It includes factual free-play metadata and does not fabricate reviews or ratings. Structured data does not guarantee enhanced search results.

Work on a review branch and merge its pull request only when ready to publish: this repository's `main` branch supplies the live GitHub Pages game.
