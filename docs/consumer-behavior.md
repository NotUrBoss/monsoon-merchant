# Monsoon Merchant — consumer behaviour and player motivation review

Reviewed `ui.js`, `engine.js`, `README.md`, and `creative-game.md`. This is an expert source review, not a novice user study or an engagement experiment. Proposed behavioural effects are hypotheses to validate with players.

## Overall assessment

The strongest reason to return is learning to make better trade and route decisions under changing monsoons. The game already supports that through visible price ages, rumours, route costs, captains, a common Daily Voyage, a personal best, and seasonal ranks. Its clear season endpoint and save/resume controls support voluntary play. Build on understandable decisions, varied strategies, and satisfying recovery after setbacks.

The first session currently asks the player to understand multiple systems before completing the rewarding buy–sail–sell loop. The opening market tip explains price labels, but not the next sequence of actions. Setup presents all locked captains and eleven difficulty levels before the player has experienced that loop. Later, sale “Profit” can be positive while the route loses money to operations and fees. That mismatch can make a fair economic challenge feel arbitrary.

## Three small changes for the current PR

1. **Match the setup action to its actual result.** In `screenSetup`, change the primary label from **Cast off** to **Start season**. `startNormal` opens the starting port; it does not begin a voyage. Keep **Cast off** in `departSheet`, where it actually starts travel. This helps players distinguish setup from commitment.

2. **Explain the first useful action sequence.** Replace the first Market tip with: **“Buy cargo here, open Map to choose a destination, then sail and sell. Keep cash for voyage costs. Price tags compare with the regional average; prices elsewhere may be old.”** The current tip explains green/gold labels and tapping cargo, but provides no short route to the first completed trade. Keep the detailed price explanation in How to play and the existing screen labels.

3. **Name trading margin accurately.** In the sell-sheet facts, change **Profit** to **Trading profit** and add: **“Sale proceeds minus cargo purchase cost. Voyage costs, fees, interest and insurance are separate.”** The code computes sale proceeds minus average cargo cost only. This disclosure prevents the player from mistaking a positive sale margin for a profitable overall route. Avoid claiming a complete route profit until the cost allocation exists.

## Prioritized findings

### P1 — Make the contract choice understandable before accepting

Offers show payment, deadline, penalty and Accept, while the player must calculate purchase cost and check finance independently. The creative review found opening offers far beyond available funds. Surface estimated cost to acquire the missing cargo, current shortfall, and arrival/deadline context. Quotes should disclose price movement and remain estimates. Preserve player choice for advanced speculative strategies; do not label an offer “safe” or promise a profit.

The in-progress departure deadline/cargo warnings are useful because they appear at the point of commitment. An acceptance disclosure is complementary: it prevents the player from discovering an obligation only after accepting it.

### P1 — Explain why a season succeeded or failed

`screenEnd` has an attractive net-worth chart, final balance components and counts of voyages, trades and hazards. It does not explain costs over the season, although the engine tracks fields including `spent`, `revenue`, `costs`, `fees`, `premiums`, `claims`, `failed`, `spoiled` and `lostValue`. A future debrief should show correctly reconciled trading margin and separate economic costs, then a factual learning prompt. Do not double-count cargo sold during settlement or present overlapping loss counters as additive totals.

Examples: **“Running costs were RM X this season.”** **“You completed X of Y accepted contracts.”** Let a player choose a new objective from the debrief rather than only chase a much larger wealth threshold.

### P2 — Give beginners an attainable first goal

The standard setup currently foregrounds reaching Merchant at RM 1.5M to unlock level 1. The engine already has **Open for Business** for a first profitable sale, worth 5 LP. Surface that nearer-term mastery target after starting a first season: **“First goal: complete one profitable sale.”** Explain that trading profit excludes voyage costs. Prefer an optional contextual goal to a long mandatory tutorial or a guaranteed profitable opening route.

### P2 — Reduce initial choice overload without hiding depth

Keep unlocked captain choices prominent and collapse locked captains behind a **More captains** disclosure for brand-new players. Show the selected difficulty and a compact explanation; expand the full progression when requested. This is a hypothesis for a later UX test, not a reason to redesign the current interface untested. Returning players should retain fast access to their selections.

### P2 — Make return motivation about the scenario and mastery

The Daily Voyage already offers a common seed and a twist, but the title card prominently shows a flame count. Help and the introduction explicitly ask players to build a daily streak. The engine awards streak LP and achievements for 3/7 consecutive days. Future changes should prioritize today's twist, the player's same-seed best, and optional cumulative challenges. Do not add missed-day penalties, escalating streak pressure, or prompts that imply obligation.

Useful introductory copy for a later revision: **“Try today's shared voyage and improve your personal best. Your best completed score counts.”** Preserve transparent information about any existing streak bonus if it remains; avoid silently changing the reward rules while changing copy.

### P2 — Make stopping and returning easier to understand

The menu already offers **Save and go to title** and saves on page visibility changes; the title exposes Continue season. Explicitly distinguish in-game days from real time in help: time advances through travel and waiting. Do not claim that an old Daily Voyage can always be resumed: `startDaily` only continues the save whose date matches today's key. Document that boundary or introduce an archived practice replay before promising unrestricted daily continuation.

## Longer-term engagement and fair challenge

- Offer voluntary goals such as a debt-free season, first visit to each available port, a contract circuit, or a limited-cargo strategy. Goals should reward distinct decisions rather than repetitive trivial actions.
- Add replayable seeded scenarios and clear modifiers so players can compare strategies under the same conditions. Let players choose whether to seek a personal best or explore.
- Introduce alternative routes with disclosed time/risk tradeoffs; make higher difficulty add decisions, not merely larger hazard percentages and operating costs.
- Allow a recent-season debrief to reconnect the player with their own plan: what they tried, what worked, and what they want to try next.
- Preserve finite seasons, freely accessible saves, and optional hints. Avoid infinite timers, artificial scarcity messages, notifications built around guilt, or spending loops.

## Validation before claiming improvement

Run 5–8 brief novice playtests with consent, then assess whether players can start a season, explain the cash/net-worth difference, complete a buy–sail–sell loop, distinguish trading margin from route profit, and identify the cause of one setback. Record time to first voluntary departure, first completed sale, recoverable errors, and participants' own explanations. Do not equate a longer session with more enjoyment.

If later instrumenting the game, agree the data collection scope first. Suggested measures are first-loop completion, contract acceptance-to-completion, return-to-own-saved-season, and voluntary replay after reading a debrief. Pair those with short reports of clarity, fairness and enjoyment; this review adds no telemetry.
