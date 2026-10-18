# Monsoon Merchant

A strategic trading game set on the monsoon seas between Malaysia, Singapore, Vietnam and southern China. It is built as an installable web app (PWA): open it once, add it to your home screen, and it plays fully offline.

## Install on your phone

- **iPhone:** open the game link in Safari, tap **Share**, then **Add to Home Screen**.
- **Android:** open the link in Chrome, then tap **Install app** (or menu ⋮ → **Add to Home screen**).

After the first visit, everything is cached on the phone. Progress is saved on the device; use Settings → Backup to copy it to another phone.

## How it plays

- 60-day seasons. Turn RM 50,000 and an old coaster into as much as you can.
- Prices differ by port and move when you trade. You only see live prices where you are.
- The monsoon turns mid-season, which changes how long each route takes. Storms, pirates, customs and lucky finds happen at sea.
- Contracts, bank loans, the Ah Long, insurance, shipyards and upgrades.
- Legacy points carry over between seasons. Spend them to unlock captains, ports, cargo, ships and perks, and climb ten Monsoon difficulty levels.
- A Daily Voyage with the same seas for everyone each day, plus a streak counter.

## Files

Plain HTML, CSS and JavaScript with no build step and no external requests:

- index.html: app shell
- engine.js: game rules and economy (also runs in Node)
- map.js: sea chart
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
Tests cover progression rewards, save compatibility and validation, backup restoration, seeded seasons, offline caching, and structured data. Browser journeys and remaining recommendations are recorded in `docs/review.md`.

The page describes the game with Schema.org `VideoGame` and `WebApplication` JSON-LD. It includes factual free-play metadata and does not fabricate reviews or ratings. Structured data does not guarantee enhanced search results.

Work on a review branch and merge its pull request only when ready to publish: this repository's `main` branch supplies the live GitHub Pages game.
