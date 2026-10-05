# Loupe: a Limited card-evaluation trainer

Loupe is a mobile-first web app (installable, works offline) for practicing Magic: The Gathering Limited card evaluation. It shows a card from a current Standard-legal Limited format, you grade it on 17Lands' 13-step scale (F to A+), and it reveals the card's real grade, its GIH WR and a few comparison cards. It schedules cards adaptively, tracks how accurate your first look at an unseen card is, and points out patterns in your misses, such as underrating removal or a color. No account, ads or trackers; progress stays on the device and can be exported as a backup file.

Live site, once deployed: <https://nooplexius.github.io/MTG-Card-Evaluation-Training/>

## Run it

Needs Node 22.12 or newer.

```sh
npm ci
npm run data     # build the card data into public/data (see below)
npm run dev      # http://localhost:5173
```

`npm run data` downloads Scryfall's bulk card data and oracle tags, the whatsinstandard.com list and 17Lands' public `cards.csv`, and caches them in `.cache/` for a day (`npm run data:offline` reuses the cache). It then joins the 17Lands data in `data/17lands/` to Scryfall printings. With no usable 17Lands data, it builds on the synthetic samples in `data/synthetic/`. The app then says so on the practice screen ("Sample data: invented numbers, not 17Lands"), the menu and the Data screen.

`npm run status` prints each set's state, source, data date and card count, any unmatched cards, and export links for missing or stale sets. It never writes files.

## Add or refresh 17Lands exports

1. Run `npm run status` and open the export link for the set. It opens 17Lands' Card Data table with every column group on.
2. Keep All time and no filters, then choose **Export data → Download as CSV**.
3. Put the file in `data/17lands/` with its downloaded name (`card-ratings-YYYY-MM-DD.csv`), commit and push.

Details, including format overrides, are in [data/17lands/README.md](data/17lands/README.md). Keep old exports: each new file is validated against the previous one (coverage, row count, mean win rate, sample sizes), and a file that fails is refused in favor of the last good data.

For live sets the deployed pipeline also fetches 17Lands once a day by itself (see Deploy), so manual exports matter most for sets that are no longer live.

## Configuration

`data/config/pipeline.json`:

| Setting | Default | Meaning |
| --- | --- | --- |
| `autoFetch17Lands` | `true` | Daily fetch for live sets. Set to `false` and the app relies on manual exports only. |
| `minDaysLive` | `7` | A set must be on Arena this many days before it is used. |
| `respect17LandsEmbargo` | `true` | Hold sets back until 17Lands' 13-day embargo passes. Turn it off only for local or private builds; the deploy workflow refuses to publish with it off. |
| `keepSnapshots` | `14` | Daily snapshots kept per set on the `data` branch. |
| `staleAfterDays` | `2` | Data older than this is flagged as stale on the Data screen. |

`data/config/sets.json` lists the Limited sets: Arena release dates, the 17Lands format (Premier Draft by default; OM1 is Pick-Two Draft) and bonus-sheet mappings.

## Test

```sh
npm run typecheck
npm test               # unit tests: pipeline, grades, query engine vs. recorded Scryfall corpus, insights simulation
npm run test:e2e       # Playwright on phone viewports; builds and serves the app itself
npm run test:budgets   # core-loop timing under 4x CPU throttling
npm run lighthouse     # needs `npm run build && npm run preview` running; fails below Performance 90, Accessibility 95 or LCP 2.5 s
```

Tests use fixtures only and never contact 17Lands. `npm run corpus:drift` replays the recorded Scryfall query corpus against live Scryfall, and `npm run corpus:record` re-records it. Both send requests one at a time with pauses between them.

## Deploy

Three GitHub Actions workflows live in `.github/workflows/`:

- **CI** (every push and pull request): typecheck, unit tests, a data build with `--no-17lands`, Playwright, then the budgets and a Lighthouse audit.
- **Data and deploy** (daily at 10:23 UTC, on demand, and on pushes to `main` that touch data, config or the app):
  1. Fetches 17Lands for live, eligible sets: one request per endpoint and set per UTC day, one at a time, stopping for the day on any error.
  2. Stores the responses on the `data` branch and rebuilds the data.
  3. Deploys to GitHub Pages only when the data is real (not synthetic), the embargo setting is on, and on scheduled runs only when the data changed.
- **Scryfall drift check** (weekly): reports when Scryfall's search results drift from the recorded corpus. It never blocks a deploy.

One-time setup: in the repository's **Settings → Pages → Build and deployment**, set **Source** to **GitHub Actions**. Then run **Data and deploy** from the Actions tab to do the first fetch. No secrets are needed. If the site moves to another URL, update `appUrl` in `pipeline.json`; it appears in the pipeline's User-Agent.

To stop automated 17Lands access, set `autoFetch17Lands` to `false` and push. The last fetched snapshots stay on the `data` branch and in use until newer exports replace them.

## Project layout

- `src/app`: React UI.
- `src/engine`: Web Worker with the card pool, IndexedDB, scheduler, query engine and analytics.
- `src/lib`: shared logic, including grades, the Scryfall-syntax parser and evaluator, insights and statistics.
- `pipeline`: data importer, validator, Scryfall join and eligibility rules.
- `tests`: unit tests, end-to-end tests and fixtures.
- Notes: [DESIGN.md](DESIGN.md) covers the visual system and interaction, [DECISIONS.md](DECISIONS.md) the judgment calls, and [PLAN.md](PLAN.md) the build checklist.

## Credits

Win-rate data comes from [17Lands](https://www.17lands.com/card_data), and the card lists used for the join from 17Lands' [public datasets](https://www.17lands.com/public_datasets). Card data, images and mana symbols come from [Scryfall](https://scryfall.com). Neither 17Lands nor Scryfall endorses Loupe.

Loupe is unofficial Fan Content permitted under the Fan Content Policy. Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC.
