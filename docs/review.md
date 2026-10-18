# Monsoon Merchant — review and improvements

Reviewed 18 October 2026. Proposed release: 1.0.1. Base: NotUrBoss/monsoon-merchant, main at e4ee9e3b3038c18b3aac04a1535a52cc94a6fb16.

## Delivered in this pull request

Five specialist reviews covered creative game design and balance, UX/UI and accessibility, frontend/backend and PWA reliability, consumer behaviour, and independent QA/security. The game remains a standalone offline web app. These are expert source reviews and automated checks, not measured consumer research or a human playtest.

- Added factual VideoGame/WebApplication JSON-LD and canonical URL. No previous JSON-LD, microdata or Schema.org markup was found in the original source. The entity describes a free single-player browser strategy game, with its real URL, icon, language, platform and installation requirements.
- Added keyboard-operable port buttons with voyage duration and cost; named dialogs, focus containment/restoration, Escape handling, selected-state labels, named quantity controls and a live region for notices.
- Improved small-text contrast, motion preference support and short-screen scrolling.
- Added missing contract cargo and late-arrival warnings before departure.
- Closed immediate-retirement Legacy farming. Season rewards require a completed voyage or genuine shipwreck; early retirement scales the reward to days played, with a minimum 1 LP for eligible losses. The UI explains this change. Existing earned progress is preserved.
- Validate metadata and both save slots before restoration. Roll back partial storage writes when possible and report failures honestly. Save failures show a notice; active-run backup uses in-memory state so an unsaved run can be recovered.
- Clarified Start season, the first buy–sail–sell sequence, and Trading profit versus voyage expenses.
- Updated application, engine and offline cache versions to 1.0.1.

## Validation

### Automated — 27 checks passed

Command: `node --test --test-isolation=none tests/*.test.cjs`. The no-isolation option was used because this environment blocks test child-process spawning. No package installation is required.

The committed suite covers metadata, version consistency, cached offline navigation, progression farming and legitimate losses, deterministic save/resume, authentic and malformed v1 states, metadata compatibility, restoration rollback, storage failure notices, 600 same-port trading round trips and 100 seeded seasons. The season simulation exercises 1,147 departures and 672 events across all six captains and eleven difficulty levels, validating state after every action/event.

Independent QA additionally round-tripped 27,910 authentic states across 350 seeds and all nine event types. It found two malformed-save crash paths (an active save with a final summary and a sunk save missing its voyage); both were fixed and regression-tested. JavaScript syntax and whitespace checks passed.

### Browser journeys — passed on the local preview

- Start a season, purchase seven tonnes of palm oil, select Ho Chi Minh City by keyboard, inspect voyage and insurance costs, sail, arrive, sell, and reload the saved game.
- Continue the saved day-4 season after reload; reject malformed backup input and confirm that cash, cargo, achievements and location remain available.
- Accept a delivery contract and verify the missing-cargo departure warning.
- Retire the played season, view the explained prorated reward and achievement, return to title, and start Daily Voyage in its separate slot.
- Verify modal Tab wrapping, Escape dismissal and restoration of focus to the triggering cargo button. Background controls disappear from the accessibility tree while a dialog is open.
- Verify the Animations setting updates its accessible switch state.
- Stop the preview HTTP server, reload successfully from the service worker, resume the saved Daily Voyage, and advance a day offline.
- Inspect layouts at 375×812, 768×1024 and 1440×900. The inspected results/map views had no document horizontal overflow. Map controls had no unnamed buttons.
- Confirm one parseable JSON-LD entity and matching canonical URL in the rendered page. No captured browser console warnings or errors occurred during the tested final journey.

The original live site and deployment settings were not changed. Tests used separate local origins so the user's live-game saves were not touched.

### Limits and remaining checks

A complete 60-day GUI playthrough was not performed; full-season paths were covered by deterministic engine simulations, while the browser journey ended through the supported early-retirement flow. Physical iPhone/Android installation, Safari, screen-reader speech, full WCAG auditing, real-device performance/Core Web Vitals and clipboard transfer between devices remain unverified. The browser displayed a successful backup-copy notice; valid restore and failure rollback are verified by automated tests. There is no committed screenshot baseline, so visual regression comparison is inconclusive even though the current layouts were inspected.

Schema fields were checked against [Schema.org VideoGame](https://schema.org/VideoGame) and [WebApplication](https://schema.org/WebApplication). No ratings or reviews were invented to satisfy [Google's software-app rich-result requirements](https://developers.google.com/search/docs/appearance/structured-data/software-app). This PR does not claim rich-result eligibility or guaranteed search display; the public rich-results validator has not been run against an unpublished branch.

## Prioritized next improvements

1. **Beginner contract affordability:** show the cargo acquisition estimate and funding gap before acceptance; then tune starter offers against reachable financing and route costs. Keep profitable play uncertain.
2. **Season debrief:** explain trading margin, voyage costs, fees, debt interest, insurance and losses, with one useful lesson for the next attempt.
3. **Optional mastery scenarios:** debt-free trading, diversified cargo, and visiting new ports. Add richer route choices and voluntary modifiers while retaining clear stopping points.
4. **Contract cancellation rule:** decide and disclose what happens to outstanding contracts on early retirement. The current game does not charge their future missed-delivery penalty when retiring early.
5. **Defensive engine API checks:** reject nonfinite quantities and loan amounts at entry points. Current ordinary UI reachability was not established; imported nonfinite state is now rejected.
6. **Device and novice playtests:** verify physical installation/updates and whether new players can complete and explain a profitable first voyage. Do not infer improved retention from expert review alone.

## Publishing

This is a review-branch change. Merging into main can trigger the existing GitHub Pages deployment. Review the reward rule change and remaining platform checks before merging. No publishing or deployment-setting changes were performed.

## Specialist detail

- [Creative game and balance](creative-game.md)
- [UX/UI and accessibility](ux-ui.md)
- [Engineering and reliability](engineering.md)
- [Consumer behaviour](consumer-behavior.md)
- [Independent QA](qa-review.md)

