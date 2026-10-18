# Frontend/backend, security and PWA reliability review

Reviewed the local Monsoon Merchant repository and exercised the actual game engine with Node. The game is a self-contained static HTML/CSS/JavaScript PWA; no server is required for its current single-player feature set.

## Findings and improvements implemented

1. **High priority: invalid backup could overwrite working progress.** Original `ui.js` restored metadata and replaced/deleted normal and daily saves before checking their contents. Original `engine.js` accepted any JSON object with `v: 1`, including `{"v":1}`. The audit reproduced all three storage mutations followed by a render exception and both success and error messages. Implemented `deserialize` and `deserializeMeta` structural validation, including run phases, references, numeric state, market/cargo data, event identifiers and summaries. Missing optional metadata fields receive existing v1 defaults. The restore action now validates every slot and slot mode before the first write.

2. **High priority: storage failures were silently reported as success.** Original save wrappers caught errors and callers ignored their results. The new restore transaction keeps previous storage values and rolls back changes if a later operation fails. Failed rollback is reported accurately. Ordinary saving failures produce a visible notice, the title retains a warning, and the in-game menu now offers backup export of the current in-memory run. Save-and-title keeps the run open if its write fails; ending a season only removes its prior saved run after metadata saves successfully.

3. **Medium priority: copied save content needs structural boundaries.** Escaping is already used for most displayed prose, but several imported event/class identifiers previously reached HTML attributes directly. Imported IDs are now constrained, critical numbers must be finite, prototype-related object keys are rejected, and pending events and final/sunk states are checked. This is local data resilience, not an anti-cheat system; users still own their offline save data.

Consumer review copy was also integrated while editing `ui.js`: the setup button says **Start season**, the first market tip explains buy → map → sail → sell, and **Trading profit** explains that voyage costs, fees, interest and insurance are separate.

## Tests completed

Command: `node --test --test-isolation=none tests/save-validation.test.cjs tests/storage.test.cjs tests/simulation.test.cjs`

**16 tests passed.** The regular Node test command could not create child processes in this sandbox, so the same tests were run with Node's supported in-process isolation option.

- 600 same-port buy/sell round trips: no profitable immediate round-trip loophole; cash and cargo remain valid.
- 100 seeded seasons: 1,147 departures and 672 events across all 6 captains and 11 difficulty levels. Every action/event state is serialized, validated and compared with its JSON representation. Tests also check finite cash/debt, cargo capacity, hull condition, terminating seasons and idempotent final rewards.
- Authentic port, sea, pending-event and completed states, plus a resolved sinking state, round-trip successfully.
- Saving and restoring preserves the subsequent deterministic market and random sequence.
- Malformed or incomplete runs, wrong slot modes, malformed metadata, invalid market references, invalid final/sunk states, unsafe attribute identifiers and nonfinite values are rejected.
- Valid restores save all slots; invalid restores perform no writes; failures after either partial-write position restore old values; rollback and storage-read failures produce accurate errors.
- Repeated ordinary storage failures show one notice rather than flooding notifications.

Browser E2E, JSON-LD and the final 27-test suite results are recorded in review.md.

## Remaining priorities

1. **Add finite-input guards at public engine mutation boundaries.** Direct Node calls to `buy`, `sell`, `bankBorrow`, `bankRepay`, `alongBorrow` and `alongRepay` with `NaN` currently return success and poison cash/state. Current quantity controls are bounded sliders and loan actions use internally calculated amounts, so normal UI reachability was not established. This is a small follow-up hardening fix, not a demonstrated public exploit. Reproducible baseline probes remain in `work/reviews/engineering-audit.cjs` outside the repository.

2. **Exercise actual update and offline flows on a persistent browser profile.** The existing service worker caches all application assets, offers an explicit update action, and refreshes on controller changes. Ensure every release increments cache and UI versions together; this PR includes a version/cache bump for this change. A future build/test check can enforce this pairing. Simulate an old installed version upgrading, offline reload and a failed first cache install. Source review alone does not establish that those browser lifecycle cases passed.

3. **Keep a backend optional.** Cloud save or a public leaderboard would justify a backend only after their account, privacy, recovery and scoring requirements are defined. Current client-side seeds and scores are editable, so a competitive leaderboard would need server verification or an explicitly unverified category. Avoid adding authentication, telemetry or network dependencies merely to restructure this working offline game.

## Architecture assessment

The engine/UI split is useful: deterministic rules can already be tested independently, and the absence of a build tool or third-party network dependencies keeps hosting straightforward. Splitting the large UI into rendering, persistence and flow modules would make future changes easier, but is less urgent than preserving player progress and testing the core journeys. Maintain the current static deployment while those journeys stabilize.
