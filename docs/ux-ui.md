# Monsoon Merchant — UX/UI and accessibility review

Reviewed the checked-out `ui.js`, `style.css`, `index.html`, and `map.js` on 18 October 2026. Findings below are grounded in source; browser end-to-end verification is handled by the parent agent. The accessibility skill supplied the semantic-controls, focus-management, contrast, and reduced-motion review framework. This is not a claim of complete WCAG conformance.

## Findings and implemented improvements

| Priority | Finding and evidence in original source | Improvement prepared |
|---|---|---|
| P1 | Sailing required pointer coordinates. `mapSVG()` exposed one image; `A.map()` selected the nearest port from a click. `tabMap()` had no keyboard-operable destination alternative. A keyboard-only player could trade but could not complete the core buy–sail–sell loop. | Added a visible native-button destination list with each port's name, travel days, arrival day, running cost, and locked/current-port state. It opens the existing port planning sheet and preserves the sea chart. |
| P1 | `sheetWrap()` and `modalWrap()` supplied `role="dialog"` but no accessible name or modal state. `renderOverlay()` and `render()` replaced HTML without preserving focus. Background controls remained keyboard-operable under overlays, and no Escape or Tab handling existed. | Centralized accessible dialog names, `aria-modal`, background `inert`, focus entry, Tab/Shift+Tab containment, and trigger restoration. Focus also survives control rerenders. Escape dismisses optional sheets; required voyage-event decisions remain mandatory. |
| P2 | Quantity increment/decrement buttons contained only aria-hidden SVGs. Locked level buttons also contained only a lock icon. Settings and insurance switches exposed no on/off value; captain and trade-mode selections were visual only. | Added meaningful quantity/level names, `role="switch"` + `aria-checked`, selection `aria-pressed`, and selected navigation state. Added an explicit backup-code label. |
| P2 | The muted `--dim` text color (#6C86A0) had calculated solid-background contrast of 3.81:1 on #132B44 and 3.28:1 on #18355A, despite being used for small labels. | Raised it to #91A7BE: calculated contrast is 5.82:1 and 5.00:1 on those backgrounds. Added a visible gold keyboard-focus outline. Rendered transparency/gradient combinations still require visual inspection. |
| P2 | The title screen and app container hid overflow, while the title artwork, saved-season control, daily card, and installation/update controls could collectively exceed short screen heights. | The title screen can scroll; its artwork and controls keep their minimum space. Main scrolling regions explicitly allow flex shrinkage. Validate short landscape and large-text layouts in E2E. |
| P2 | The in-game Animations setting was checked by selected JavaScript animations but did not suppress the title ship, waves, route, toast, and transition CSS. | Applied a root reduced-motion class to all CSS animations/transitions, in addition to the existing system-preference media query. |
| P2 | The departure sheet warned about spoilage, hull condition, and cash but omitted contract cargo shortages and deadlines exceeded by the proposed voyage. | Added clear, nonblocking warnings for missing destination-contract cargo and voyages arriving after an active contract deadline. Players retain the choice to take the risk. |

The parent is adding the toast live region and document landmarks in `index.html`. `ui.js` now displays the engine's escaped `rewardNote`, explains the revised season Legacy eligibility in Help and the early-end confirmation, and reports version 1.0.1.

## Strengths worth preserving

- Distinct nautical colors, a recognizable silhouette, and geographically grounded ports provide a coherent identity without external media requests.
- Most actions already use native buttons with generous touch targets. Prices use positive/negative symbols as well as colors, and voyage hazards include text labels.
- Trade sheets expose average execution price, market impact, cash after purchase, and remaining hold capacity. These support informed decisions.
- The departure confirmation already highlights empty holds, spoilage, dangerous hull condition, and overdraft risk. The added contract warnings extend that useful pattern.
- Local saving, explicit progress-erasure confirmation, and offline installation support short mobile sessions.

## Recommended next iteration

1. **A first-voyage checklist:** Show three optional steps—buy cargo, compare two ports, complete a sale—using actual state. Let players skip it and retain contextual tips. The current new-season path drops the player directly into a dense market after captain selection.
2. **Budget-aware trade defaults:** Opening a purchase currently preselects the maximum affordable quantity (`A.trade`). Consider a 25%/50% default or an explicit reserve-for-voyage option so a first tap does not encourage spending all operating cash. Keep Max available for intentional high-risk play.
3. **Decision summaries:** In the route sheet, distinguish cargo revenue, voyage expenses, and uncertain price age in one concise estimate. Preserve uncertainty and market impact rather than implying guaranteed profit.
4. **Session recap:** End with one concrete observation about the player's decisions (most profitable cargo, avoidable expired contract, weather cost) and one attainable next target. This encourages mastery and replay without pressuring the player to maintain a streak.
5. **Responsive desktop layout:** The fixed 520px application width is workable for the mobile-first release. A future wider layout could place chart and price comparison beside each other, reducing repeated tab switching.

## Validation

- `node --check ui.js`: passed after edits.
- `git diff --check`: passed; only normal Windows line-ending notices.
- Contrast ratios above were calculated from the actual CSS hex colors.
- Browser checks still required: full keyboard buy–sail–sell; modal focus containment/restoration; Escape on optional sheets and compulsory events; switch rerender focus; 320px width and short-height title scrolling; reduced-motion setting; warnings for late/missing-cargo contracts.
