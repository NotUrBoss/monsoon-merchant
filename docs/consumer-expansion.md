# Network Company: player motivation and decision clarity

Review date: 18 October 2026. This is an expert review of `work/reviews/network-api.md`, the existing game documentation, and the prior source-grounded consumer, creative and UX reviews. The new `logistics.js` and `network-ui.js` implementations were still being written when this review was completed; the statements below describe the agreed design and recommendations, not verified final UI behavior. This is not a user study, retention experiment, or claim that play time will increase. Recommendations concern understandable choices, strategic challenge, and voluntary replay.

## The intended appeal

The new mode shifts the player's attention from commanding one vessel to coordinating a company. A shared 60-day clock, simultaneous shipments, transport alternatives, inventory at multiple hubs, and production chains can create meaningful competing priorities: fast delivery versus freight cost, inventory versus cash, immediate trade versus manufacturing, and expansion versus upkeep. The existing single-vessel mode remains valuable as the simpler entry point.

The player should be able to answer three questions at any time: **What is my current plan? What will happen when I advance a day? What limits my next action?** Additional goods and locations only create useful depth if the answers remain visible.

## Current-release review priorities

1. **Explain the shared clock before the first action.** Use plain copy: “Time moves only when you advance a day. All shipments and factories progress together.” Buying, dispatching and building should not appear to consume a day if they do not. Display current day and the 60-day endpoint beside the advancing action.

2. **Offer one attainable first shipping goal.** A short optional sequence is enough: buy cargo at the home warehouse, build a destination warehouse, compare transport choices, dispatch, advance to arrival, then sell. Make the second warehouse requirement explicit before the player buys a large cargo. Do not promise that this example earns a profit, because freight, upkeep and moving market prices matter.

3. **Put consequences beside commitments.** A shipment quote needs the total freight fee, cargo quantity, arrival day, destination and available destination capacity. A production quote needs consumed inputs, output quantity, cash cost and completion day. Construction must expose both upfront cost and daily upkeep. Disabled actions should give the specific missing requirement rather than a generic failure.

4. **Make inventory reservations legible.** Warehouse stock, incoming cargo and reserved production output all occupy capacity under the agreed API. A “used / capacity” figure alone can look wrong when stored goods are low. Name incoming and production reservations in the capacity summary. The dispatch limit concerns simultaneously active shipments, so label it accordingly rather than implying a lifetime quota.

5. **Distinguish money measures.** Cash pays immediate bills; net worth includes assets and subtracts debt. Sale proceeds are not net profit. Describe valuation estimates honestly and keep transport, manufacturing and upkeep costs visible. If upkeep creates debt, surface it immediately and explain why subsequent sale proceeds may not all become spendable cash.

6. **Make the season boundary predictable.** The final advancing action should clearly finish the season. A shipment or batch must either finish by day 60 or show an explicit settlement rule before commitment. Do not let the player discover at the results screen that their apparently valid shipment has become inaccessible. Results should show the basis of asset valuation and outstanding debt.

7. **Use event feedback to preserve the player's plan.** Arrival and production messages should name the hub, goods and quantity. Keep a readable recent activity log so multiple same-day completions do not depend on a transient toast. An empty shipment queue should offer the next useful action; a full queue should tell the player when capacity will next free up.

## Challenge and replay recommendations

- Keep transport choice situational. Air should exchange higher cost and smaller loads for speed; rail should depend on explicit connected corridors; sea should offer its own capacity/time tradeoff. A universally superior mode makes the apparent choice hollow.
- Test manufacturing against direct resale over identical seeds. Factory payback should depend on useful planning within the finite season, not an undisclosed assumption that the company runs forever. Display production requirements before a factory is purchased.
- Prefer optional self-selected goals: a manufacturing chain, a rail-led company, a debt-free season, or several regions served profitably. A goal is meaningful only when the game can measure it accurately; do not add unsupported badges solely to make the screen feel rewarding.
- Retain save/resume, fixed endpoints and unpressured replay. The shared clock already creates a reason to return to a plan without real-world countdowns, missed-day penalties or guilt messages.
- Avoid onboarding all 12 goods and 14 hubs simultaneously. Show the selected hub and an immediate action first, with the wider network available on demand. Preserve quick access for experienced players.

## Validation before claiming a better experience

Automated checks should establish that simultaneous shipments progress together, reserved capacity remains consistent, late commitments are handled predictably, and finishing the season explains the actual balance. Browser checks should cover a first shipment, two overlapping shipments, a warehouse upgrade, a local production batch, and resuming the saved company. Popup layout, focus behavior and mobile scrolling need visual verification in the parent review.

A small consent-based novice playtest can then ask players to explain the clock, choose between two transport quotes, identify why a warehouse is full, complete a production chain, and explain a loss. Treat improved clarity, perceived fairness and voluntary replay as separate outcomes; session length alone is not evidence of enjoyment. This review adds no telemetry or external tracking.
