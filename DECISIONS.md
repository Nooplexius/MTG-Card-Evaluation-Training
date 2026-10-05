# DECISIONS

Judgment calls where the brief left room, or where live sources differed from it. Newest last.

## Data

1. **Grade band edges.** 17Lands' literal expression `floor(3 * (z + 2 - 1/6))` puts exact edges one band low in floating point (z = −1.5 gives F, z = 0.5 gives C+). A 1e-9 tolerance makes edges follow the documented half-open bands. It can only differ from the site when z is within ~3e-10 of an edge.
2. **Ungraded cards are not in the pool.** Cards with no GIH WR (fewer than 500 games in hand) can't be graded, so they are left out of per-set files. They still count for validation (row counts).
3. **Synthetic samples.** With no 17Lands data at all, the build uses `data/synthetic/*.csv`: card lists from 17Lands' public `cards.csv` (what 17Lands drafts include), invented numbers, exact site CSV format. They pass through the same importer and join. The manifest is flagged `synthetic`, the app shows a banner, the status command still reports each set as `missing`, and the deploy is skipped.
4. **OM1 join.** `cards.csv` has no `OM1` rows: the Spider-Man cards are under `SPM` (Marvel names) and their MTGA ids resolve to tabletop `spm` printings. The config points OM1 at `cardsCsv: [SPM, OMB]`, and display-printing selection prefers the limited set's own codes by oracle id, so OM1 shows `om1` printings (Arena name and art).
5. **Bonus sheets.** A limited set's bonus codes are its Scryfall children of type masterpiece, expansion or eternal (TLE, BIG, OTP, PZA, WOT, FCA, EOS, SOA…) plus configured extras (OMB for OM1). Tokens, promos, Alchemy, Commander and art cards are excluded. Special Guests belong to a set when the `spg` printing was released the same day as the main set; only waves that were on Arena appear in 17Lands data.
6. **Filtered-export detection.** "Every color" means at least one mono-colored card of each of W, U, B, R, G, plus one multicolor and one colorless card, and all of C, U, R, M. The 52–61% mean check is skipped below 15 graded cards (such sets are held back anyway).
7. **Format override in file names.** An exact 17Lands event name bounded by non-alphanumeric characters (so `_PickTwoDraft` works); the longest match wins (`ArenaDirect_Sealed` over `Sealed`). An override that differs from the configured pool format is flagged and not used by the pool.
8. **Who fetches.** Only the scheduled workflow passes `--fetch`. A set is requested when 17Lands lists its configured format as live and the set passes the live-time rules (with the embargo on, that is "embargo passed"). `fetch-state.json` on the data branch records one request per endpoint per set per UTC day and halts all requests for the rest of the day after any failure.
9. **Staleness when the fetch is off.** "Active" comes from the newest saved `/data/filters` response on the data branch, so an active set still goes stale when the fetch is switched off.
10. **Prices are not shipped.** `usd`/`eur`/`tix` change daily and would invalidate every cached set file every day; those terms resolve through the Scryfall API like any other non-local term.
11. **Standard cross-check.** A Standard set agrees with Scryfall when at least half of its own booster printings (all printings if none are flagged booster) are `legal:standard`. The reverse check flags expansion or core sets with at least 50 printings that Scryfall marks mostly legal but whatsinstandard omits. On disagreement the set keeps its last deployed file (read back from the deployed site), else it is held back.
12. **Unknown Standard sets.** A Standard code with no config entry becomes its own limited set with the default format, so new sets appear in the status output as soon as whatsinstandard lists them.

13. **CI never contacts 17Lands.** `build --no-17lands` reads `cards.csv` from the input cache, or the committed 2,964-row test subset. The subset gives the same build as the full file (same data hash), both for the synthetic samples and for the real exports.
14. **Data branch size.** Each build with `--fetch` keeps the newest 14 snapshots per set and format, plus whichever one is in use; git history keeps the rest.
15. **When to deploy.** Only real data (never synthetic), only with the embargo setting on (the workflow refuses otherwise), and on scheduled runs only when the data hash changed. Pushes and manual runs always deploy. GitHub Pages must be enabled once; nothing else needs credentials.

## Product

16. **Name.** The app is called Loupe (a jeweler's magnifier, for close appraisal).
17. **Storage split.** IndexedDB (Dexie) lives only in the worker, so the UI thread never blocks on it. Settings are in localStorage because the first render needs them synchronously. Routing uses the URL hash, so static hosting needs no rewrite rules.
18. **Query semantics.** These were checked against live Scryfall:
    - Unquoted name words match diacritic-folded, punctuation-free substrings of the name or flavor name.
    - `o:` ignores reminder text, also for regexes.
    - Colors use card-level colors, else any face.
    - Power, toughness and loyalty match any face; `*` counts as 0.
    - Unknown keywords are sent to the API, where Scryfall ignores them with a warning, and Loupe shows that warning.
    - Display keywords (`order:`, `unique:` and similar) do nothing locally.
    - Each maximal API-only subtree is one search, restricted to the pool's set codes with `unique:prints`. A subtree whose terms Scryfall ignores entirely is dropped, as Scryfall would drop it.
19. **Smart feedback model.** A joint ridge fit attenuated effects and left the intercept unidentified, so the engine does forward stepwise weighted least squares instead:
    - Weights are 1/(τ² + SE²); effects are conditional, by residualizing on the selected facets; facet columns are ridge-shrunk.
    - Thresholds: |effect| ≥ 0.5 steps, z ≥ 2.58 for main effects and 3.29 for interactions, effective n ≥ 8 for main effects.
    - The simulation's second scenario plants removal −1.5 steps with a +0.8 offset rather than "big bodies": big bodies were about 5% of cards, too rare to reach 90% power in 400 evaluations.
    - Result: planted effects found in 50/50 runs, unplanted ones in at most 2/50.
20. **Drill mastery** means at least 7 of the last 8 drill cards within one step and |bias| ≤ 0.5 steps. A drill also ends after 20 cards.
21. **Personal best** is a session's share of first looks within one step, counted when the session has at least 8 first looks.
22. **Offline cache.**
    - The worker stores each data file it downloads in the service worker's runtime caches and drops cached files the manifest no longer lists. Offline use therefore needs no second download; re-fetching the 9.5 MB of set files after install also caused jank during the first reps on slow CPUs.
    - Upcoming cards' images are prefetched up to 240 a day.
    - Offline, practice only draws cards whose image is cached, and skips one that still fails to load.
23. **Rate limits.** Scryfall API calls are at least 600 ms apart in the app and 750 ms apart in scripts. A 429 pauses for 30 s (35 s in scripts) and is never retried in a loop. Responses are cached for 7 days.
24. **Cold first visit.**
    - A first-time visitor on the practice route gets a static copy of the practice screen with an inlined random starter card, painted before any JavaScript.
    - The app script starts once that card's largest-contentful-paint entry arrives, or on the first tap, or after 3 s.
    - The static screen uses local serif and sans fonts, so no font download competes with the card image. React swaps in Alegreya on mount.
    - A grade tapped on the static screen is queued and committed with its original timestamp.
    - Other screens are code-split. Their code is prefetched once the user first leaves practice, never during it. A route change keeps the current screen up until the next one's code is ready, so there's no blank frame.
    - Set-loading progress has its own store, so the 18 progress events re-render only the percentage, not the practice screen.
25. **Compare mode.**
    - Both cards come from the same set and format, because GIH WR is relative to a format.
    - A pair is used only when its order is clear: at least 1 point and 2 standard errors apart.
    - Difficulty is the grade gap between the cards, adjusted by a 2-down-1-up staircase (converges near 71% right).
    - 70% of picks favor cards the user has already seen graded, because a compare reveal exposes both cards and would otherwise use up first looks.
    - Compare picks are stored separately and do not enter evaluation stats.

## Data, from the first real exports

26. **First exports.** On 2026-10-05, at the owner's request, the agent downloaded the 18 finished sets' Card Data exports, the same way the owner would:
    - It opened each set's Card Data page in a browser and used **Export data → Download as CSV**.
    - It checked first that the page showed All users, All Time, and no color or rarity filter.
    - It went one set at a time, 15 s apart, with a User-Agent naming Loupe.
    - It didn't call the API, whose responses say the data is for use on 17Lands.com only.
    - Each file's rows match the table shown on its page. Files are named `card-ratings-DATE SET.csv`.
    - FRA waits for its embargo (2026-10-12), after which the daily fetch takes over.
27. **Set detection with reprint slots.** On Arena, MKM's boosters have a List slot: 40 of its 321 export rows are older cards in their original printings. An export is assigned to a set when:
    - the whole join chain matches at least 90% of its rows;
    - the set's own printings match at least 50%;
    - no other set's own printings are within 30 points.

    Before, only the set's own printings counted toward the 90%, which left MKM unassigned at 87.5%. A card found only through Arena printings elsewhere shows the newest printing released by the set's release date, as it was drafted.
28. **MSH's bonus sheet** is Marvel Universe (MAR, 100 cards). It has no parent set on Scryfall, so it's configured as an extra bonus sheet, like OM1's OMB.
