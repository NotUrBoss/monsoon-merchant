# One game: captain first, company second

Monsoon Merchant now has a single season mode, 90 or 120 days long. You start as a captain with one old coaster and RM 50,000 and trade by hand. As your net worth grows, the season unlocks the supply chain one layer at a time. You stay the captain throughout: the company runs in the background every day, including while you are at sea.

## Stages within a season

| Unlocks at (peak net worth) | Layer | What you can do |
| --- | --- | --- |
| Start | Trader | Buy, sail, sell, contracts, banks (unchanged). |
| RM 150k | Warehouses | Rent a warehouse in any port. Load and unload your ship there. Set standing **buy** and **sell** orders. |
| RM 500k | Factories | Build a factory next to one of your warehouses. It turns inputs from that warehouse into products, every day, by itself. |
| RM 1M | Freight | Hire freight to run standing **routes** between your warehouses, or to sell in another port's market. |

The thresholds are shown as goals, so the next step is always visible. Each layer is optional: a pure trader can still win.

## Standing orders (the automation)

Every automatic action is something the player approved, with a limit:

- **Buy**: at a warehouse port, buy up to N t of a good per day, either only when it is cheap (10% or more below the regional average) or at any price.
- **Sell**: at a warehouse port, sell up to N t per day, either only when it is dear (10% or more above average) or at any price.
- **Route**: every trip, ship up to N t of a good from one of your warehouses to another of your warehouses or to a port's market, where it is sold on arrival.
- **Factories** run whenever their warehouse holds the inputs and has room for the output.

A **cash reserve** (default RM 20k) protects the captain: buy orders, freight and factory batches never spend below it. Upkeep is always paid. Contracts whose destination has a warehouse are delivered from that warehouse automatically when it holds enough stock.

## Products

Four products extend the eight raw goods. They trade in every market like other cargo:

- Packaged Food: 2 rice + 1 palm oil = 2 t
- Tyres: 1 rubber + 1 steel = 1 t
- Coffee Mix: 2 coffee + 1 rice = 2 t
- Machinery: 3 steel + 1 electronics = 1 t

Each recipe adds about 35% to 45% to the input value, before running costs.

## Kept from the captain game

Pixel sea chart and sailing scenes, monsoon winds, storms and pirates, Towkay Lim, bounties, Legacy and unlocks, Daily Voyage and Monsoon levels.

## Retired modes

The Monsoon Company campaign and the old Classic menu entry are retired. A company campaign that is already in progress can be finished from **Archive** on the title screen; new company campaigns cannot be started. Old captain seasons simply continue in the new game. Legacy, unlocks and achievements carry over.

## Future hubs

The port catalog is data-driven. Tokyo, Mumbai, Kolkata, Colombo, Dubai and Sydney are planned as later Legacy unlocks under **Ports**. Each needs map geography, sea lanes and price factors before it can be enabled.

## Season length (v2.2)

Players choose 90 or 120 days on the New season screen. Daily Voyage stays at 60 days. Monsoon level 5 and above shortens the season by 13% (78 or 104 days). Goals scale with length: the rival target (×2.25 at 90 days, ×3.5 at 120), the bounty thresholds, and the net worth that unlocks the next level (RM 3M / RM 4M instead of Merchant at RM 1.5M). Bot simulations keep the rival beaten about 60–80% of the time by a greedy trader.

## Reports, profit, big orders and alerts (v2.2)

- **Profit per business**: warehouses track sales, profit and rent; factories track the value they add over input cost; routes track profit after freight.
- **Arrival report**: everything the company bought, made, shipped and sold since you last docked, with notable events, shown on the arrival card.
- **Big orders**: after you own a factory, an offer arrives every 8 to 12 days for 10 to 450 t of a product at a port. Paid per tonne on delivery (6 to 16% over that port's normal price) plus a bonus of about 15% when complete. At most two at once. No penalty for falling short.
- **Company alerts** (about one every two to three weeks): a dockers' strike stops a warehouse for 3 to 5 days (pay to end it, or wait); a factory breakdown stops it for 5 days (repair now, or wait); a product boom raises one port's price by 30 to 45% (run overtime for double output at 1.5× fees, or carry on).
