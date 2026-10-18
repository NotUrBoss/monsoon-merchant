# Network Company independent QA review

Reviewed 18 October 2026 against the local expanded game. This review covers source inspection and automated engine tests; browser layouts, focus, live deployment and device behavior are verified separately by the parent review.

## Result

The complete current automated suite passes **50 tests**. The independent audit adds seven tests in `tests/logistics-audit.test.cjs`, alongside the implementation agent's 15 logistics tests and the existing Captain, metadata, storage and offline checks. Run with:

```text
node --test --test-isolation=none tests/*.test.cjs
```

The independent long-running test completes **200 seeded 60-day company campaigns**, checks **38,527 state transitions**, completes **3,967 shipments**, and manufactures **22,500 tonnes**. Every checked state validates and round-trips through serialization. These simulated strategies exercise all four factory specializations and all three transport modes. They establish correctness for the tested actions, not player enjoyment, optimal balance or exhaustive strategic coverage.

## Verified behavior

- Three simultaneous sea, rail and air shipments progress alongside a manufacturing job. Inputs leave stock immediately; incoming cargo and production output reserve destination space. Each completion adds the expected stock once and releases its reservation.
- Lane limits, transport capacity, explicit rail corridors, destination capacity and one-job-per-factory restrictions are enforced before mutation. Zero, negative, fractional, string, non-finite and unsupported quantities fail without modifying the company.
- Splitting a load incurs extra fixed freight cost rather than reducing the fee. Immediate local buy/sell round trips lose the spread. No free quantity or time exploit was found in the tested paths.
- Facility purchases reduce net worth by their disclosed resale discount. Unfinished production retains consumed-input sale value, excluding unearned output. Upkeep shortfalls become debt and later sales repay that debt before increasing available cash.
- Day-60 arrivals and production finish before valuation. Result value matches assets less liabilities. Repeated advancing, trading, building, production and dispatch after completion all reject without changes. No unresolved job is stranded beyond day 60.
- Invalid imported inventory, capacity, market, calendar and production values are rejected. A changed final profit is rejected. Active reservations and job clocks survive save/restore.

## Findings resolved during review

1. The original accepted numeric limits allowed a successful action to exceed the save validator's cash, counter, debt, market or job-ID ceiling. Engineering added preflight guards. Independent regression cases confirm rejection occurs before partial mutation.
2. The classic positive-status class `.good` previously shared goods-card layout styling. The card grid now uses `.goods .good`; positive text and event-art elements no longer match that selector. Visual popup verification remains the parent browser task.
3. Source review identified product buttons with an overriding `listitem` role and reset language that implied deleting company progress. The UI agent removed the button-role override and explicitly scoped Captain reset/backup language. Network Company retains its separate `mm.network.v1` save.

## Storage and integration review

Network imports validate the whole company and write the new value before replacing the in-memory state. A failed write preserves the previous company. Autosave failure keeps current play in memory, shows a warning and exposes a backup. Leaving the company attempts to save first. Classic modes use separate save slots, and the company adds no classic Legacy rewards. These boundary conclusions are source-reviewed; storage quota denial, actual clipboard transfer and mode switching require the parent browser checks.

The service-worker test confirms both new modules are included in the offline asset list, the old cache is removed, cached navigation works and direct image requests retain their image content. Metadata and application/cache version checks pass.

## Limits and follow-up

No normal-play engine blocker remains from this audit. Manual responsiveness and popup alignment, keyboard/screen-reader behavior, real offline browser installation, cross-browser support and live publishing are outside this agent's automated evidence. A novice playtest and comparative economic strategy study would still help tune difficulty and onboarding; these checks cannot establish that one transport or recipe is strategically balanced in every situation.
