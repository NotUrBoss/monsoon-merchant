# Monsoon Merchant — creative game and balance review

Reviewed `engine.js`, `ui.js`, and `README.md`, and ran deterministic engine scenarios. This is a source and simulation review, not a human playtest.

## What already works

- A clear 60-day objective combines route planning, changing prices, market impact, weather, debt, cargo insurance, and delivery deadlines. The free opening market report gives new captains actionable information.
- The monsoon is an unusually strong theme-mechanic connection: direction changes route duration and regional hazard probability.
- Captains support distinct approaches; the shared Daily Voyage deliberately removes unlock advantages. Deterministic world and luck streams support reproducible testing.
- The compact offline game and manual pause points suit thoughtful short sessions. Preserve the ability to stop and resume freely.

## Findings and changes suitable for this PR

### 1. Close instant-retirement Legacy farming — implemented

Before this review's fix, two new day-1 seasons immediately ended with zero trades and zero voyages awarded 21 Legacy: 8 + the 5-point Sea Legs achievement, then another 8. This already paid for the 15-point Family money perk. The loop made avoiding gameplay the most efficient early progression strategy.

`endSeason` now requires a completed voyage or a shipwreck after actual time at sea for completion rewards. It prorates season Legacy by elapsed season days, with a minimum 1 LP for eligible loss-making seasons. Staying at the opening port for the whole season does not earn completion rewards. Full-length eligible seasons retain the existing formula. The same eligibility governs finish-only achievements, daily participation, and difficulty unlocks. Existing scores, LP and saves are not retroactively changed.

The result includes `rewardEligible`, `rewardFraction`, and explanatory `rewardNote` for the UI. Show the note on the result and explain the rule in the retirement confirmation/help. Eight focused regression tests pass in `tests/progression.test.cjs`, including waiting-only retirement, legitimate early loss, shipwreck, normal season end, daily scoring, and double-finalization.

### 2. Surface contract risk before departure — recommended small UI change

`departSheet` already warns about spoilage, loan collectors, hull damage, an empty hold and operating cash. It does not warn when estimated arrival misses an active contract deadline, nor when a contract for the destination lacks sufficient cargo. Add these two warnings, including required quantity, aboard quantity, due day and estimated arrival. Keep the player's choice available: another route or a deliberate speculative trip can be valid.

This makes difficulty more legible without reducing storm risk, revealing future prices, or guaranteeing profitable routes.

### 3. Warn about unaffordable contracts — small disclosure now; generator tuning later

`genOffers` rounds quantities to multiples of five and clamps to at least five tons, including electronics. A deterministic sample of 200 opening seeds produced 188 offers, of which 28 were electronics. For seed `creative-0`, the opening electronics offer needs 5 t costing RM 495,510 at Port Klang. Starting cash is RM 50,000; available bank and Ah Long credit total RM 106,500. Its missed-contract penalty is RM 154,440. This is a financing challenge, but the opening offer currently gives no affordability cue.

Show estimated purchase cost and cash shortfall before accepting. Longer term, generate quantities in one-ton increments for expensive goods and test beginner offers against plausible financing and travel costs. Do not guarantee profit; avoid requiring new players to infer a fivefold funding gap from the per-ton quote.

## Further rule issues worth a separate pass

- Early retirement ignores outstanding contract penalties: `endSeason` settles cargo and financial debts but does not settle still-active contracts. Clarify cancellation rules and apply an explicit disclosed cancellation charge if intended. Otherwise retiring just before a missed deadline can evade the obligation. This review did not silently change that rule.
- Ship trade-in is independent of hull condition (`tradeIn`), while repairs cost cash. Damaged ships retain full resale value. Decide whether this is intentional convenience or whether condition-adjusted resale should make maintenance a meaningful economic decision.
- Daily replay grants a fresh season payout each run, while streak bonus is once per date. That is consistent with normal replay rewards; document it. Avoid adding daily penalty pressure or irreversible streak losses as the main retention mechanism.

## Longer-term engagement and challenge

1. **Selectable voyage goals:** choose a contract route, a debt-free run, a diversified-trader run, or a first-time port circuit. Reward demonstrated mastery and alternate strategies. Let players replay goals without calendar pressure.
2. **A useful end-of-season debrief:** attribute results to gross trading margin, operations, fees, interest, insurance, spoilage and penalties. Compare against the player's prior run on the same seed. Give one concrete learning prompt such as “operating costs consumed most of this route's margin.”
3. **Broader strategic difficulty:** add optional cargo embargoes, disclosed market liquidity limits, or alternative safe/fast sea lanes. Current Monsoon levels predominantly raise costs/hazard rates; decisions should become richer as well as more punishing.
4. **Scenario variety:** seeded seasonal objectives and voluntary modifiers give replayability without needing endless currency accumulation. Preserve a fixed common starting state for comparable Daily Voyage scores.
5. **Starter contracts and graduated onboarding:** first demonstrate one achievable buy–sail–sell loop, then introduce financing, stale market information, insurance and perishables when relevant. Keep full rules accessible to experienced players.

## Balance validation before larger changes

Use identical seed sets for before/after simulation; compare no-loan, conservative contract, and speculative strategies. Record first profitable arrival, losses by cause, contract completion, unlock time and rank distribution. Check whether one route/captain dominates. Follow with a small novice playtest to measure comprehension and whether players can explain why they lost. Automated simulations alone cannot measure enjoyment.

The goal is engaging, understandable replayability: attractive tradeoffs, room for mastery, clear stopping points, and recoverable setbacks.
