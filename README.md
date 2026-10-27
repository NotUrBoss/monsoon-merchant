# Monsoon Merchant

A 16-bit trading game set on the monsoon seas between Malaysia, Singapore, Vietnam and southern China. Buy low, sail far, beat the wind, and race your rival Towkay Lim to the biggest fortune of the season.

It is an installable web app (PWA): open it once, add it to your home screen, and it plays offline.

## Install on your phone

- iPhone: open the link in Safari, tap Share, then Add to Home Screen.
- Android: open the link in Chrome, tap the menu, then Install app.

## What's in v2

- All-new 16-bit pixel art: animated sea chart, side-on sailing scenes with day and night, storms and pirates, port skylines and captain portraits. Every sprite is drawn in code.
- Chiptune sound effects and an original sea-shanty loop (toggle in Settings).
- A rival trader, Towkay Lim, who moves markets as he trades. Beat his net worth for bonus Legacy.
- Three bounties every season.
- Markets now remember big trades for about a week, pirates are bolder, and a battered hull can founder in a storm.
- Legacy, unlocks and achievements carry over from v1.

## Files

- index.html, style.css: page and pixel theme (fonts embedded)
- engine.js: game rules (no DOM, also runs in Node)
- map.js: sea chart geography
- art.js, pixel.js: sprites, scenes and the chart renderer
- sfx.js: chiptune audio
- ui.js: screens and interaction
- sw.js, manifest.webmanifest, icons: offline app shell

## Credits

Fonts: Pixelify Sans by The Pixelify Sans Project Authors, and Silkscreen by Jason Kottke (digits only). Both are under the SIL Open Font License 1.1.
