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

## Product

13. **Name.** The app is called Loupe (a jeweler's magnifier, for close appraisal).
