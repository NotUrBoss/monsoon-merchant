# Network Company — creative game design review

This review combines the existing Captain game source with the proposed Network Company expansion. Recommendations are design hypotheses, not evidence from human playtests. Implementation and verification status should be read alongside the release test report.

## Intended experience

Keep Captain as the focused voyage adventure. Offer Network Company as a separate 60-day business challenge: buy locally, send simultaneous shipments, receive goods at warehouses, transform inputs into higher-value products, and sell into regional demand. The interesting decision is where to commit limited cash, time and space. A larger map and more products should create competing plans, not merely more clicks.

The layers are dispatching, operating regional warehouses, and integrating production. Make every layer available, but introduce them in that order through short contextual instructions. A player who prefers trading should be able to succeed without manufacturing; production should reward a different plan rather than be a mandatory income multiplier.

## Release priorities

1. **Make the shared clock explicit.** Show all shipment arrival days and production completion days together. “Advance one day” advances every active job, changes markets and pays all facility upkeep. A small summary after each day should identify arrivals, finished goods and expenses. Avoid burying these events in separate regional pages.
2. **Reserve capacity before accepting commitments.** Destination stock plus incoming cargo plus reserved production output must fit warehouse capacity. Show these quantities before dispatch or production. If a commitment cannot fit, explain which warehouse needs expansion. Silently losing arrivals would make a logistics game feel arbitrary.
3. **Give each transport a purpose.** Ships should reward larger loads and patient planning, planes should reward urgent or high-value loads, and trains should provide a useful land-corridor alternative. Quotes must include duration, cargo limit and the total charge. Fixed handling costs make small repeated shipments inefficient and prevent a capacity limit from being bypassed by splitting orders. Rail links must follow declared corridors; they should not be offered as generic straight-line links across oceans.
4. **Disclose manufacturing economics.** Before starting a batch, show exact inputs, cash processing cost, output, completion day and any required output space. Display quoted output sale value separately from expected profit: inputs, freight and facility upkeep all matter. Prevent starting production from creating immediately sellable output or reusing committed inputs.
5. **Explain season settlement before the deadline.** Tell players what happens to stock, cargo in transit, unfinished batches and facilities when day 60 closes. Arrival after season end should either be prevented or priced under a clearly disclosed settlement rule. Cash, asset values and profit should not be presented as interchangeable measures.
6. **Provide an achievable opening plan.** The first screen should identify the owned hub, starting cash and one affordable buy–dispatch–sell example. Avoid a forced tutorial and avoid guaranteeing market profit. An optional hint can propose buying a small batch and checking two destinations after freight. Building every facility immediately should visibly consume the operating reserve.

## Challenge and replay improvements

- **Use visible bottlenecks.** Limited dispatch slots, destination space, production queues and operating cash create challenge that a player can reason about. Increasing costs alone makes difficulty harsher without creating many new decisions.
- **Give choices a horizon.** A nearby low-margin delivery funds a distant high-margin route; a warehouse investment reduces current liquidity but supports future throughput; a factory locks cash and inputs until completion. These competing timelines are the strongest reason to play parallel logistics.
- **Keep production chains readable.** Start with a few short chains and clearly differentiated regional inputs. A two-input recipe already connects procurement, storage, freight and timing. Deep chains can follow after the first set is balanced and players understand them.
- **Preserve the monsoon identity.** In a later release, add forecast regional disruption to some sea lanes and transparent air or rail alternatives. Show the affected region and duration before decisions. Global expansion should retain the game's distinctive weather-and-trade identity rather than become an interchangeable transport spreadsheet.
- **Add voluntary scenarios after the economy is stable.** Examples include deliver three different products, complete a locally sourced production chain, operate two transport modes profitably, or finish without running short of operating cash. Players can choose a goal and replay a seed at their own pace; no calendar pressure is needed.
- **Debrief the business.** At season end, show trading proceeds, purchases, freight, processing, facility spending, upkeep and remaining assets. Highlight one concrete bottleneck or avoidable expense. This gives players a reason to replay with a better plan.

## Provisional recipe check

The initial implementation proposal supplies enough detail for a simple base-price check. These are gross production margins before trading spreads, freight, facility investment and upkeep, not simulated player returns:

| Recipe | Input base value plus processing | Output base value | Gross margin | Duration |
| --- | ---: | ---: | ---: | ---: |
| 2 cotton → 2 textiles | RM 6,900 | RM 10,400 | RM 3,500 | 3 days |
| 2 rice + 1 palm oil → 3 food | RM 5,450 | RM 6,900 | RM 1,450 | 2 days |
| 1 steel + 1 rubber → 1 electronics | RM 9,300 | RM 18,000 | RM 8,700 | 4 days |
| 3 steel + 1 electronics → 1 machinery | RM 30,300 | RM 26,000 | −RM 4,300 | 5 days |

Raise machinery's output value or reduce its inputs/fee so it has a plausible use case after overhead. Cap batches per factory job independently of warehouse capacity: otherwise an arbitrarily large batch receives the same completion time and effectively unlimited production throughput. These two findings were sent directly to the engine implementer; final values may differ from this proposal.

## Balance checks before wider tuning

Compare the same seeds for trading-only, mixed transport and manufacturing strategies. Record cash remaining, worst cash reserve, net worth at day 60, completed shipments, factory utilization and the share of profit from each product and route. Test both small repeated shipments and large batches to detect a dominant fee or capacity exploit. Check idle play, investing everything immediately, full warehouses, arrivals on the last day and production finishing after the last day.

A transport does not need to be optimal on every route, but each should have a reachable use case. A recipe that is profitable at every hub with every input price becomes a repetitive money machine; one that never covers processing and upkeep is decorative. Regional specialization, time and capital commitments should determine which plans work.

Follow automated checks with novice playtests. Ask players to explain the next action, the cost of advancing a day, why a shipment is blocked and how they made or lost money. Those answers measure comprehension; simulations alone cannot establish that the expanded game is enjoyable.
