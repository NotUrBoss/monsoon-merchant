# 2.3.0: Endless, more layers, more achievements

Five reviewers (game design, UX/UI, engineering, player behaviour, QA/security) read 2.2.0 before this release. This note records what they found, what 2.3.0 changed, and what is still open.

## What the reviews found

- **Security and save safety (QA, engineering).**
  - A crafted backup code could inject markup through an alert choice id.
  - Inherited names such as `toString` or `__proto__` passed save and API checks and could break a run.
  - Huge numbers (cash 1e306) were accepted, and `maxDays` was not validated.
  - An unreadable Legacy or run save was silently replaced.
- **Exploits (QA).**
  - Big orders and contracts could be filled from the destination's own market, worth about RM 5M per season.
  - Retiring after two days farmed bounty Legacy.
- **Endless risks (engineering, QA).** History grew without limit, overdraft interest compounded towards Infinity, and the monsoon, rival and bounties all assumed a last day.
- **Design (creative, player behaviour).**
  - The company lost money inside a season but dominated long runs, which makes Endless where the supply chain belongs.
  - No achievement covered the company.
  - Ranks stopped at RM 25M.
  - The Daily streak bonus was the strongest compulsion lever in the game.
- **UX.**
  - The Company tab was one long scroll.
  - Locked achievements failed contrast.
  - Several achievement toasts could cover a decision.
  - The sparkline had no CSS, so it drew black.
  - Some touch targets were small, and the rival's figure was cut off on 320 px screens.

## What 2.3.0 does

**Endless mode** (third card on the setup screen, its own save slot):

- **Chapters.** It runs in 60-day chapters, one monsoon each. A chapter close autosaves and shows a report, three new bounties, a weather twist and Lim's new target.
- **Difficulty.** The Monsoon level rises every two chapters. Lim's target compounds by chapter.
- **Chapter Legacy.** Needs two voyages, is capped at 30 and halves from chapter 7.
- **Ending.** Retire whenever you like for a capped payout, and the run goes into the Hall of Houses. Ten days of negative net worth closes the house. With a company, a shipwreck sends you home in a coaster.
- **Long-run limits.** History is thinned, so very long runs stay small and finite.

**New layers** (unlock by peak net worth; see the README table):

| Layer | Unlocks at |
|---|---|
| Estates | RM 2M |
| Shops (cash or credit customers) | RM 3M |
| Branch managers | RM 8M |
| Ocean lanes to Colombo, Mumbai, Dubai and Tokyo | RM 10M |

The Company tab is split into Overview, Sites and Freight.

**Provenance.** Only your own tonnes (made, grown, shipped in, or carried in your hold) count for big orders, company contracts and shops. Big orders take a 5% deposit.

**Achievements and ranks:**

- **Achievements.** 55 in 7 categories, with progress bars in the Ledger. Season-only Mastery achievements cannot be earned in Endless.
- **Ranks.** Two new ranks: Taipan (RM 100M) and Merchant Prince (RM 250M).
- **Daily streak.** The streak keeps its flame but no longer pays a growing bonus. Streak achievements count total Daily plays.

**Hardening:**

- **Saves.**
  - Choice ids are checked against an allowlist and attributes are escaped.
  - Own-property checks are used everywhere.
  - Numeric ceilings are enforced.
  - `maxDays` must be a valid length.
  - Writes refuse non-finite numbers.
  - An unreadable save is quarantined instead of overwritten.
- **Rules.** Bounty Legacy scales with the days played. Voyages end with the season.

**UI fixes:**

- Several achievements share one toast.
- The sparkline is styled.
- Muted text is brighter.
- Small buttons are at least 40 px.
- The rival's name shortens on narrow phones.

## Still open

These are good ideas from the reviews that were left for later:

- A layer registry and splitting the company into its own file.
- Schema version numbers.
- Multi-tab locking.
- Player-chosen yearly charters.
- Quality surveys and an overland China–Vietnam corridor.
- Cosmetic Legacy sinks.
- A per-port "pays back in N days" estimate when building.
