# Independent QA review

Reviewed the current changes to engine validation, Legacy rewards, dialog focus handling, backup restore, metadata, and the service-worker version.

## Findings resolved during review

- **P2 — Active run with a malformed `final` value could overwrite a valid save and fail at season completion.** `deserialize()` accepted an active run with `final: {}`. `endSeason()` returned that object without computing results; the UI then failed to render the result after removing the run slot. Engineering now rejects final results on unfinished runs and validates completed results. Regression coverage was added.
- **P2 — A restored shipwreck without its voyage could fail immediately on Continue.** `deserialize()` accepted `phase: 'sunk'` with `voyage: null`, while the sea screen requires voyage endpoints. Engineering now requires a voyage for both sea and sunk states. Regression coverage was added.
- The completed-save round-trip assertion initially compared serialized achievement entries with their original function-valued test members. Engineering corrected the test to compare persisted JSON data.

## Verification

- All 18 Node tests available at the independent review checkpoint passed with `node --test --test-isolation=none tests/*.test.cjs`.
- Independently exercised 350 deterministic seeds across all captains and Monsoon levels, with all unlocks, varied buying and selling, voyages, and event choices. All 27,910 sampled authentic states passed save validation, and every season's final state and metadata passed validation.
- That exercise encountered every event type: storm, pirates, engine, salvage, trader, crew, current, radio, and customs.
- Reviewed backup validation-before-write and rollback behavior, as well as focus restoration and dialog keyboard trapping. No additional actionable defect identified in the current changes. The final 27-test suite and browser end-to-end results are recorded in review.md.

No outstanding review finding remains from this review.
