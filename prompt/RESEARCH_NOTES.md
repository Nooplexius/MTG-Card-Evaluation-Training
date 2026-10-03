# Research notes for `PROMPT.md`

Checked against the live sources on 2026-10-03. Each fact below is something the prompt relies on, followed by how it was verified.

## Where the prompt departs from the original spec, and why

| Original spec | Prompt | Reason |
| --- | --- | --- |
| "Live data from 17Lands" | Daily pipeline over 17Lands **public datasets**. An optional live-API adapter stays off unless 17Lands grants permission. | 17Lands' card-data API is for on-site use only (see below). As a result, the newest set appears about 5–7 weeks after release. |
| "Not live for a week → excluded" | Kept. In live-API mode the 17Lands embargo applies instead: day 12 after Arena release. | 17Lands usage guidelines. |
| "Actual grade (GIH WR)" | 17Lands' own Grades formula, reproduced exactly. | 17Lands now publishes letter grades, so the app's grade *is* the 17Lands grade. |
| "Shows a random card" | Pure-random mode kept. The default is an adaptive mode that is still randomized. | Serves the metagoal (see Learning science). |
| Accuracy | ±1 step counts as correct for streaks and scheduling. Exact-match rate is reported separately. Analytics are weighted by sample reliability. | A card's grade has sampling noise of about ±1 step for low-sample cards. |

## 17Lands

- **API is off-limits.** `GET https://www.17lands.com/api/card_data?expansion=TLA&event_type=PremierDraft&time_period=ALL_TIME` returns `{copyright, notes, data}`. The `notes` field says: "This data is only for use on 17Lands.com. The only data permitted for outside use (public or private) is available at 17lands.com/public_datasets." The legacy `/card_ratings/data` endpoint now returns empty or near-empty stats for past sets.
- **Usage guidelines.** The page is client-rendered, so the text was extracted from the site bundle `/static/Routes.*.bundle.js`. Its points:
  - Public datasets (typically CC BY 4.0) are out of the guidelines' scope.
  - Tools must credit 17Lands visibly at the top level with links to the source pages, without implying endorsement.
  - There is an embargo for third-party tools: no data for a new expansion until "the 12th day it has been released on MTG Arena (typically the second Monday after the set release)", or 7 days for short specialty sets.
  - Automated scraping is discouraged unless 17Lands gives explicit permission.
  - The stated intent is to publish draft data at 2 weeks, game data at 3 weeks, and replay data at 6 weeks.
- **Grade formula**, from the same bundle:
  - `ID=["F","D-","D","D+","C-","C","C+","B-","B","B+","A-","A","A+"]`, `HD=2-1/6`, and `t=Math.floor(3*(z+HD))`; `t<0` gives F and `t>=13` gives A+.
  - The stats use the unweighted mean and population SD across cards with a non-null metric, and require n ≥ 15.
  - The site's own note: "assumes a normal distribution centered at C … Each letter gradation … represents a band of 0.33 standard deviations … this most closely matches common usage in the Limited community."
- **Metric definitions** come from the site's definitions page text. Counts are per copy, and tutored copies are excluded from games drawn and games in hand (since 2022-10-16). On live TLA data, IIH = GIH WR − GNS WR held exactly: 0.55519895 − 0.53112787 = 0.02407108.
- **The 500-game cutoff.** In live TLA data, the smallest #GIH with a shown win rate was 557 and the largest hidden one was 498.
- **Public files.** The bucket listing returns 403, but HEAD requests on the URL pattern work. Premier Draft game files, with Arena release and file date:

  | Set | Arena release | File posted | Size (MB) |
  | --- | --- | --- | --- |
  | HOB | 2026-08-11 | 2026-10-01 | 22 |
  | MSH | 2026-06-23 | 2026-07-27 | 31 |
  | SOS | 2026-04-21 | 2026-06-05 | 49 |
  | TMT | 2026-03-03 | 2026-04-08 | 13 |
  | ECL | 2026-01-20 | 2026-05-18 | 42 |
  | TLA | 2025-11-18 | 2026-01-10 | 47 |
  | EOE | 2025-07-29 | 2025-09-03 | 45 |
  | FIN | 2025-06-10 | 2025-07-19 | 65 |
  | TDM | 2025-04-08 | 2025-05-20 | 45 |
  | DFT | 2025-02-11 | 2025-03-23 | 67 |
  | FDN | 2024-11-12 | 2024-12-19 | 59 |
  | DSK | 2024-09-24 | 2024-10-30 | 77 |
  | BLB | 2024-07-30 | 2024-09-07 | 69 |
  | OTJ | 2024-04-16 | 2024-05-30 | 98 |
  | MKM | 2024-02-06 | 2024-03-20 | 76 |
  | LCI | 2023-11-14 | 2023-12-27 | 64 |
  | WOE | 2023-09-05 | 2023-10-18 | 82 |

  OM1 has no Premier Draft data; its public game files are PickTwoDraft (16 MB), PickTwoTradDraft, Sealed and TradSealed. FRA (Arena release 2026-09-29) has no files yet. `cards.csv` was updated 2026-10-01. A file that doesn't exist returns **403**, not 404, on HEAD (for example OM1 QuickDraft, OM1 TradDraft, FRA PremierDraft).
- **Card pages.** The per-card route `/card_data/details?card_id=…` sits behind a login (`requiredStatus: LoggedIn` in the bundle). The set-level `/card_data?expansion=…&format=…` page is public.
- **Validation.** GIH WR was computed from `game_data_public.TMT.PremierDraft` (180,204 games, 2026-03-03 → 2026-04-04) and compared with the live grades:
  - 186 cards had #GIH ≥ 500, with mean 0.5731 and population SD 0.0413.
  - Grades matched 17Lands' live grades exactly for 78.0% of cards and within one step for 100%, with Spearman ρ 0.993.
  - Per-copy weighting matched slightly better than per-game (mean absolute WR difference 0.54 vs. 0.59 percentage points).
- **Data quirks.**
  - Game-file columns are keyed by front-face name, and basic lands appear as columns.
  - `cards.csv` has repeated names within a set (alternate-art printings with separate MTGA ids).
  - 17Lands' TLA data includes 61 TLE cards and TMT includes 20 PZA cards (mapped via mtga_id ↔ `cards.csv`).
  - Low-sample example: TMT's Umezawa's Jitte has a GIH WR of 71.7% on 513 games in hand, which grades A+ with ±1.5 steps of noise.

## Scryfall

- [Rate limits](https://scryfall.com/docs/api/rate-limits): `/cards/search|named|random|collection` allow 2/s and other endpoints 10/s. A 429 means a 30 s lockout. Cache for at least 24 h, and use bulk data for large lookups. The `*.scryfall.io` hosts are unlimited.
- [API terms](https://scryfall.com/docs/api):
  - Requests need an accurate `User-Agent` and an `Accept` header.
  - No paywall, no implied endorsement, and you must add value.
  - Card images must not be cropped or covered at the artist/copyright line, distorted, blurred, color-shifted, or watermarked.
- **Bulk data.** The `/bulk-data` entries now expose `jsonl_download_uri` (gzipped JSON Lines) and `compressed_size`. Sizes on 2026-10-03: default_cards 78.7 MB, oracle_tags 6.0 MB, art_tags 13.0 MB, oracle_cards 24.6 MB.
- **Join.** 17Lands MTGA id equals Scryfall `arena_id`: 97274 is Aang's Journey (tla) and 98622 is Teferi's Protection (tle, `standard: not_legal`). CORS is `*`.
- **Images.** `image_uris` now includes WebP variants (`thumb`, `grid`, `display`, `art`, `crop`) alongside `small`, `normal`, `large`, `png`, `art_crop` and `border_crop`. For Aang's Journey, `display` is a 672×936 WebP at 48.6 KB, `large` is a JPEG at 105.6 KB, and `png` is 595 KB.
- **Search behavior.** An unknown keyword is ignored with a warning: `set:tla foo:bar t:creature` returns 200 with `warnings: ["Invalid expression “foo:bar” was ignored. Unknown keyword “foo”."]`. A syntax error returns 400 with `details` ("Your search contains unclosed parentheses.").
- **Oracle tags** form a hierarchy (`parent_ids`/`child_ids`). `otag:` includes descendant tags. A local descendant-closure evaluation matched the API exactly on `set:tla` for removal (52), card-advantage (77), combat-trick (11), ramp (46) and lifegain (27).
- **OM1.** `set:om1` returns 188 printings by default, none with `arena_id`. `name` holds the Marvel name and `printed_name` the Arena name ("Agent Venom" / "Rhilex the Accursed"). The OM1 17Lands file has 227 non-basic cards: 188 match om1 through `printed_name`, and the remaining 39 are in `omb` (parent_set_code `mar`), whose printings do have `arena_id`.
- **Bonus-sheet parents** (`parent_set_code`): tle→tla, pza→tmt, big→otj, otp→otj, fca→fin, soa→sos. The exceptions are omb→mar and spg (no parent).
- **Dates.** FRA's Scryfall `released_at` is 2026-10-02 (tabletop), while its 17Lands Arena start is 2026-09-29.

## Standard (via https://whatsinstandard.com/api/v6/standard.json)

On 2026-10-03, Standard was WOE, LCI, MKM, OTJ, BIG, BLB, DSK, FDN, DFT, TDM, FIN, EOE, SPM, OM1, TLA, ECL, TMT, SOS, MSH, HOB, FRA. WOE through DSK rotate out in Q1 2027.

The list also contains past sets and future ones with null codes, so filter by date. `enterDate` is the tabletop/prerelease date: FRA's is 2026-09-25, four days before its Arena release, so it can't stand in for the Arena date.

The expected limited pool is 18 sets: all of the above except BIG (folded into OTJ), SPM (covered by OM1) and FRA (too new, no public data).

## Prompt-engineering guidance applied

Sources: Anthropic, [Prompting Claude Opus 5.5](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5-5), [Prompting Claude Opus 5](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5), and [Prompting best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices).

- **Complete spec up front, then let it run.** Opus 5 "performs best when given the complete task specification up front and left to run."
- **No generic "verify / double-check" instructions.** These cause over-verification on Opus 5, so the prompt states checkable outcomes (definition of done, required tests) instead.
- **Explicit scope and priorities.** Opus 5 can expand scope, so the prompt orders milestones, makes stretch goals conditional, and gives a trade-off order.
- **Unattended runs.** Opus 5.5 can end a turn with a progress report. The prompt keeps a checklist (PLAN.md), names the early-stop patterns to avoid, and names the one legitimate stop (blocked on the user).
- **Subagent cap.** At most two, only for independent tracks, and never for re-checking.
- **Frontend defaults.** Opus 5.5 "falls back on a few default styles" and responds to named patterns to avoid. The avoid-list combines Anthropic's examples (cream backgrounds, italic accent words, numbered section labels, monospace labels, pill buttons, generic fonts, purple gradients) with a concrete design direction and a DESIGN.md commitment step.
- **Structure and tone.** XML-tagged sections, the reasons behind non-obvious rules (so the model generalizes), calm wording instead of all-caps emphasis, and no request to write out reasoning.

## Colleague test

A fresh agent read the draft cold as the implementing engineer and listed ambiguities, contradictions and gaps. The revisions that came out of it:

- **First-look exposure.** First-look is defined through exposure tracking; contrasting cases and lists count as exposure.
- **Probe cards.** Headline first-look metrics use uniform probe cards, so the adaptive picker doesn't bias them.
- **Weighting.** Insights weight evaluations by 1/(τ̂² + SE²); headline stats stay unweighted; calibration and facets are fit on first looks only.
- **Query evaluation.**
  - The query is evaluated as a syntax tree mixing local, API-resolved and app-only (`lset:`) terms.
  - A card matches through its display printing.
  - The prompt mirrors Scryfall's warnings and errors and covers offline and history behavior.
- **Pipeline.** A 403 means "not published"; pipeline state lives on a data branch.
- **Eligibility.** Concrete eligibility and Standard rules with no date fallbacks, a 13-day embargo, and a dormant live adapter tested only with fixtures.
- **Simulation test.** Explicit thresholds: 50 users × 400 evaluations, each planted effect found in ≥ 90% of runs, any unplanted effect in ≤ 5%.
- **Drills.** Drill progress is measured against shrunken pre-drill estimates to avoid regression-to-the-mean illusions, and only card-facet insights get drills.
- **Layout and performance.**
  - A viewport-fit rule (card plus grade input at 360×640) and commit-on-pointer-up.
  - The display/grid/thumb/png image choices.
  - Budgets defined as measurable Playwright and Lighthouse checks.
- **Scope.**
  - The stop condition is the definition of done, then two ordered stretch goals.
  - Cloud sync is skipped unless a backend is provided.
  - Pick-order stats are moved to the stretch goals.

## Learning science behind the adaptive design

- Mettler & Kellman (2014), *Adaptive response-time-based category sequencing in perceptual learning*, Vision Research 99:111–123. Mettler, Massey & Kellman (2016), *A comparison of adaptive and fixed schedules of practice*, JEP: General 145(7):897–917.
  - Misses get a large priority boost but return only after a short delay, not immediately.
  - Correct answers are spaced as a function of response time.
  - Mastered categories are retired.
  - Adaptive spacing beat random schedules, including when items drop out once mastered.
- Interleaving and contrasting cases support category discrimination (e.g. Kornell & Bjork, 2008). This is why the prompt interleaves sets and shows contrasting cards on reveal.
- Calibration feedback conditions on the actual grade while separating global compression from facet effects. Without that separation, regression to the mean makes high-quality facets look "underrated."

## Existing tools (differentiation)

- [17Lands Draft Card Evaluation Quiz](https://toskicologist.github.io/MTG-draft-sets-infographics/17lands-quiz/): pairwise comparison and grading modes, color/rarity/type filters, and per-set data snapshots.
- [IIHGuessr](https://www.iihguessr.com/): pairwise higher/lower on IIH, GIH WR or ALSA, with streaks.
- This prompt adds:
  - all Standard sets in one pool;
  - full Scryfall syntax shared across practice and stats;
  - statistically honest weakness diagnosis that leads into drills;
  - adaptive scheduling;
  - first-look vs. review measurement;
  - a mobile-first build with sound, haptics, and motion.
