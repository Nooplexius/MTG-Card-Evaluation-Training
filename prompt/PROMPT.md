# Build prompt: MTG Limited card-evaluation trainer

Written for Claude Opus 5.5 at Max effort, running as a coding agent in this repository (Cursor agent or Cloud Agent, or Claude Code). Paste everything inside the fenced block below as one message. The data-source facts in it were checked against the live sources on 2026-10-03; the evidence is in [`RESEARCH_NOTES.md`](./RESEARCH_NOTES.md).

## Before you run it: export the 17Lands data

The app gets its 17Lands numbers from the Card Data page's CSV export, which you download by hand. The prompt tells the agent never to call 17Lands' site or API; the only 17Lands file it downloads is their public `cards.csv`, which it uses to match card names. For each set below:

1. Open the link. It opens the Table view with every column group turned on.
2. Leave the filters at their defaults: time period All time, all users, no color, rarity, or deck filters.
3. Choose **Export data → Download as CSV**.

Put the downloaded files in `data/17lands/` and commit them.
- Keep the downloaded file names, because the date in them is the export date.
- Keep old exports rather than overwriting them; the importer compares each new export with the previous one.
- Re-export sets released in the last 8 weeks about weekly. Older sets' data stops changing, and the status command tells you which sets need a refresh.
- This repository is public. Commit a new set's export only on or after its embargo date (Arena release + 13 days), so its data isn't published early.

| Set | Export link |
| --- | --- |
| WOE | [Premier Draft](https://www.17lands.com/card_data?expansion=WOE&format=PremierDraft&view=table&columns=seen,picked,played,opening,drawn,everInHand,notSeen,improvement) |
| LCI | [Premier Draft](https://www.17lands.com/card_data?expansion=LCI&format=PremierDraft&view=table&columns=seen,picked,played,opening,drawn,everInHand,notSeen,improvement) |
| MKM | [Premier Draft](https://www.17lands.com/card_data?expansion=MKM&format=PremierDraft&view=table&columns=seen,picked,played,opening,drawn,everInHand,notSeen,improvement) |
| OTJ | [Premier Draft](https://www.17lands.com/card_data?expansion=OTJ&format=PremierDraft&view=table&columns=seen,picked,played,opening,drawn,everInHand,notSeen,improvement) |
| BLB | [Premier Draft](https://www.17lands.com/card_data?expansion=BLB&format=PremierDraft&view=table&columns=seen,picked,played,opening,drawn,everInHand,notSeen,improvement) |
| DSK | [Premier Draft](https://www.17lands.com/card_data?expansion=DSK&format=PremierDraft&view=table&columns=seen,picked,played,opening,drawn,everInHand,notSeen,improvement) |
| FDN | [Premier Draft](https://www.17lands.com/card_data?expansion=FDN&format=PremierDraft&view=table&columns=seen,picked,played,opening,drawn,everInHand,notSeen,improvement) |
| DFT | [Premier Draft](https://www.17lands.com/card_data?expansion=DFT&format=PremierDraft&view=table&columns=seen,picked,played,opening,drawn,everInHand,notSeen,improvement) |
| TDM | [Premier Draft](https://www.17lands.com/card_data?expansion=TDM&format=PremierDraft&view=table&columns=seen,picked,played,opening,drawn,everInHand,notSeen,improvement) |
| FIN | [Premier Draft](https://www.17lands.com/card_data?expansion=FIN&format=PremierDraft&view=table&columns=seen,picked,played,opening,drawn,everInHand,notSeen,improvement) |
| EOE | [Premier Draft](https://www.17lands.com/card_data?expansion=EOE&format=PremierDraft&view=table&columns=seen,picked,played,opening,drawn,everInHand,notSeen,improvement) |
| OM1 | [Pick-Two Draft](https://www.17lands.com/card_data?expansion=OM1&format=PickTwoDraft&view=table&columns=seen,picked,played,opening,drawn,everInHand,notSeen,improvement) (OM1 has no Premier Draft; Pick-Two has the most games) |
| TLA | [Premier Draft](https://www.17lands.com/card_data?expansion=TLA&format=PremierDraft&view=table&columns=seen,picked,played,opening,drawn,everInHand,notSeen,improvement) |
| ECL | [Premier Draft](https://www.17lands.com/card_data?expansion=ECL&format=PremierDraft&view=table&columns=seen,picked,played,opening,drawn,everInHand,notSeen,improvement) |
| TMT | [Premier Draft](https://www.17lands.com/card_data?expansion=TMT&format=PremierDraft&view=table&columns=seen,picked,played,opening,drawn,everInHand,notSeen,improvement) |
| SOS | [Premier Draft](https://www.17lands.com/card_data?expansion=SOS&format=PremierDraft&view=table&columns=seen,picked,played,opening,drawn,everInHand,notSeen,improvement) |
| MSH | [Premier Draft](https://www.17lands.com/card_data?expansion=MSH&format=PremierDraft&view=table&columns=seen,picked,played,opening,drawn,everInHand,notSeen,improvement) |
| HOB | [Premier Draft](https://www.17lands.com/card_data?expansion=HOB&format=PremierDraft&view=table&columns=seen,picked,played,opening,drawn,everInHand,notSeen,improvement) |
| FRA | [Premier Draft](https://www.17lands.com/card_data?expansion=FRA&format=PremierDraft&view=table&columns=seen,picked,played,opening,drawn,everInHand,notSeen,improvement). Export and commit it on or after 2026-10-12 (17Lands' embargo). |

If some exports are missing when you run the prompt, the agent builds with what's there and lists the missing sets. If none are present, it builds on synthetic sample files and reports that it's waiting for your exports.

## The prompt

````text
You're going to build and ship a complete web app in this repository: a mobile-first trainer that makes Magic: The Gathering Limited players measurably better at evaluating cards. Start from the near-empty repo and work autonomously through the milestones and the stretch goal in <priorities>; the definition of done is at the end. The brief gives you the goal, my requirements, facts about the data sources (checked against the live sources on 2026-10-03; the evidence is in prompt/RESEARCH_NOTES.md), and the constraints that matter. Where it leaves room, use your judgment in service of the metagoal and record significant judgment calls in DECISIONS.md.

<metagoal>
The app exists to improve the user's card-evaluation ability as efficiently as possible. Judge every decision — which card comes next, what the reveal shows, what the stats emphasize, how fast a rep feels — by whether it makes the user better per minute of practice.

"Better" is measurable here:
- Primary: lower error on cards the user is grading for the first time ("first-look error"). That is the skill that transfers to a brand-new set.
- Secondary: retention of card-specific knowledge (accuracy on cards seen before), which pays off directly when drafting the current formats on MTG Arena.
Measure both, show both to the user, and optimize for both, first-look error first.
</metagoal>

<audience>
Limited players (draft and sealed on MTG Arena) who know the rules and want an edge. They practice in short bursts on a phone, often one-handed, so a rep has to take seconds and feel good. They know 17Lands at a basic level; the app should deepen that understanding (what GIH WR captures, how format context changes card value) rather than assume it.
</audience>

<requirements>
1. Card pool: 17Lands data for every Standard-legal limited set forms the pool. Sets that have not been live for at least a week are excluded. Source rules and set logic are in <data_sources>.
2. Core loop: show a random card from the pool; the user grades it on the 13-step scale A+, A, A-, B+, B, B-, C+, C, C-, D+, D, D-, F; reveal the truth; repeat.
3. Tracking: for every evaluation keep the actual 17Lands grade and GIH WR, the user's grade, and all Scryfall-searchable characteristics of the card.
4. Practice filters: the user can restrict which cards appear using Scryfall search syntax.
5. Accuracy stats, filterable by the same card characteristics.
6. Smart feedback: synthesize the stats into the user's weak areas and what to do about them.
7. Mobile-first design.
8. Satisfying sounds and animations for all user actions.
9. Stats and progress are saved.
10. Optimize the whole service for the metagoal.
</requirements>

<data_sources>
These facts were true on 2026-10-03. Sources change: check Scryfall and the Standard list live before relying on them, and where something no longer holds, trust what you observe, adapt, and note it in DECISIONS.md. For 17Lands, my exports are the only evidence.

17Lands: my Card Data exports are the source of truth
- I download each set's data from the Table view of 17Lands' Card Data page using Export data → Download as CSV, and commit the files to data/17lands/. I keep the site's file names (card-ratings-YYYY-MM-DD.csv, sometimes with a " (1)" suffix) and keep old exports. The link I use has this pattern:
  https://www.17lands.com/card_data?expansion={EXP}&format={FORMAT}&view=table&columns=seen,picked,played,opening,drawn,everInHand,notSeen,improvement
- Don't fetch anything from 17Lands' site or API, whether from code or from a browser. Their usage guidelines discourage automated access, and the export button is the intended path. The one 17Lands file the pipeline may download is cards.csv from their public datasets (see the join below).
  - If a Standard-legal limited set has no valid export, build without it and list it with its link.
  - If data/17lands/ is empty or missing, build and test on synthetic exports in the documented format, skip the deploy, and report that you're waiting for my exports.
- File format (generated in the browser by the site):
  - UTF-8 with a BOM, comma-separated, every field double-quoted.
  - Header, with all column groups on: Name, Color, Rarity, # Seen, ALSA, # Picked, ATA, # GP, % GP, GP WR, # OH, OH WR, # GD, GD WR, # GIH, GIH WR, # GNS, GNS WR, IIH.
  - Value formats: win rates like "55.5%" (one decimal), IIH like "2.4pp", ALSA/ATA like "5.66", counts as integers.
  - Rarity is C/U/R/M; Color is "", "W", "UB", ….
  - A blank win rate means 17Lands hides it (fewer than 500 games in hand).
  - Names are front-face only (no " // ").
  - Only Name, # GIH and GIH WR are required; every other column group is optional, so degrade gracefully. On phones the page defaults to just Seen, Picked and IIH, which is why the link sets columns.
- The file carries no set code, format, or date, so get them elsewhere:
  - Set: run the join chain (below) against each candidate limited set, meaning the sets in the release-date config. Choose the unique candidate where at least 90% of rows match.
  - Format: from a small per-set config that I own (PremierDraft by default, PickTwoDraft for OM1). A file name may override it only with an exact 17Lands event name.
  - Export date: from the card-ratings-YYYY-MM-DD part of the name, otherwise the commit that added the file (check out with full history).
  - Use the newest valid export per set and format. When two share a date, take the one with the larger # GIH total.
- Validate each export against the previous one, meaning the newest older valid export of the same set and format. Refuse an export with a clear message unless it:
  - has the required columns;
  - contains cards of every color plus multicolor and colorless, and of all four rarities. A color- or rarity-filtered export won't. Don't use Scryfall's booster flag as a denominator: it's false for every OM1 printing, and set:tmt is:booster returns nothing.
  - has at least 95% as many rows as the previous export, if there is one;
  - has a set-average GIH WR (the grade population's unweighted mean) between 52% and 61%, and within 1.5 points of the previous export (a user-group or deck-color filter shifts it);
  - has a total # GIH no smaller than the previous export's (a shrinking total means a period other than "All time" was selected).
  A refused file is skipped: the set keeps its previous valid export, the status output flags it, and the pipeline still builds and deploys everything else.
- Freshness and status:
  - Show each set's export date in the app.
  - Provide a status command that lists every Standard-legal limited set (bonus sheets folded in, SPM mapped to OM1) with its state and reason: live, held back (embargo, missing release date, fewer than 15 graded cards), missing, refused, or stale.
  - An export is stale when it's older than 7 days for a set released in the last 8 weeks. Older sets don't go stale by default (configurable), because their all-time data stops changing.
  - The status command prints the export link for every set that isn't live and fresh.

17Lands: terms for this use (from 17lands.com/usage_guidelines)
- Credit 17Lands visibly at the top level of the app, with links to the Card Data pages the data comes from (see <attribution_and_terms>).
- Embargo: 17Lands asks third-party tools not to show a new expansion's data until "the 12th day it has been released on MTG Arena (typically the second Monday after the set release)".
  - Implement it as eligibility from 00:00 UTC on Arena release + 13 days (Arena releases are Tuesdays). It's on by default and stricter than my 7-day rule.
  - Keep both rules as config: minDaysLive = 7, respect17LandsEmbargo = true. Turning the embargo off is for local or private builds; the public deployment keeps it on.
  - Held-back sets produce no deployed files.
- No source you're allowed to use gives Arena release dates, so keep them in a small committed config. A set with an export but no release date is held back and flagged. Seed it with: WOE 2023-09-05, LCI 2023-11-14, MKM 2024-02-06, OTJ 2024-04-16, BLB 2024-07-30, DSK 2024-09-24, FDN 2024-11-12, DFT 2025-02-11, TDM 2025-04-08, FIN 2025-06-10, EOE 2025-07-29, OM1 2025-09-23, TLA 2025-11-18, ECL 2026-01-20, TMT 2026-03-03, SOS 2026-04-21, MSH 2026-06-23, HOB 2026-08-11, FRA 2026-09-29.

The grade
- 17Lands' Card Data page has an official Grades view; replicate its formula exactly:
  - Population: every card in the set's export that has a GIH WR. mean = unweighted mean of those GIH WRs; sd = population standard deviation (divide by n); require n ≥ 15.
  - z = (GIH WR − mean) / sd; t = floor(3 · (z + 11/6)); grade = [F, D-, D, D+, C-, C, C+, B-, B, B+, A-, A, A+][t], with t < 0 → F and t ≥ 12 → A+.
  - Each step is 1/3 SD: C covers z in [−1/6, +1/6), A+ starts at z = 13/6, F is z < −1.5. Grades are relative to a set and format; color or rarity filters never change a grade.
- The export rounds win rates to 0.1 points, so about 1–2% of cards land one step off the site's own Grades view (TLA: 4 of 295). That's acceptable; don't try to correct it.
- Label grades with source and window, for example "17Lands Card Data · TLA Premier Draft · all time through Oct 3, 2026".

Which sets
- Standard legality: a set is in Standard when whatsinstandard.com/api/v6/standard.json gives enterDate ≤ today and no exitDate on or before today (its list also holds past sets and future ones with null codes). Cross-check with Scryfall: most of the set's own booster printings should be legal:standard. If the two disagree, keep the last good data and flag it. Never hardcode the list. On 2026-10-03 it was WOE, LCI, MKM, OTJ, BIG, BLB, DSK, FDN, DFT, TDM, FIN, EOE, SPM, OM1, TLA, ECL, TMT, SOS, MSH, HOB, FRA; WOE through DSK rotate out in Q1 2027.
- 17Lands expansion codes are uppercase Arena codes. Bonus sheets and subsets are drafted inside a parent set and appear in the parent's 17Lands data: BIG, OTP, FCA, SOA, TLE, PZA, SPG, OMB, …. For example, 17Lands' TLA data includes 61 TLE cards and TMT includes 20 PZA cards. Keep them in the parent limited set and tag them. TLE cards aren't Standard-legal on their own, but they're still part of TLA's limited format. Alchemy variants (Y25DFT, Y26SOS, …) and cube/chaos/remix events are out.
- Spider-Man's Arena release is OM1 "Through the Omenpaths"; 17Lands has OM1, not SPM.
  - The 17Lands site names OM1 cards by their Marvel names, which match Scryfall's `name` for om1 printings; the Arena names are in `printed_name`.
  - om1 printings have no arena_id.
  - OM1's draft also includes 39 bonus cards from Scryfall set omb, whose parent_set_code is mar.
- Format per set: Premier Draft. For a set without it, I choose the draft format with the most games. For OM1 that's PickTwoDraft, which has about 3× the QuickDraft volume. Seed the format config with this.
- Live sets: a Standard-legal limited set is live, meaning in the pool, when it has a valid export, at least 15 graded cards, a release date, and passes the live-time rules above.
- Expected result on 2026-10-03, once the exports are in place: 18 limited sets — WOE, LCI, MKM, OTJ, BLB, DSK, FDN, DFT, TDM, FIN, EOE, OM1, TLA, ECL, TMT, SOS, MSH, HOB. FRA is held back until 2026-10-12 by the embargo, or 2026-10-06 with it off. SPM is covered by OM1.
- A pool entry is (limited set, Scryfall oracle_id). The same card in two limited sets is two entries, because grades are format-relative. Each entry has one display printing: the printing drafted in that limited set, meaning its regular booster version, or the bonus-sheet printing for bonus-sheet cards. For OM1 this shows the Arena name and art.
- 17Lands' public game-data dumps (CC BY 4.0) could later supply hands-off data for sets without exports. They're out of scope for this build; RESEARCH_NOTES.md has the details if I ask for them.

Scryfall
- Pipeline: use bulk data. GET https://api.scryfall.com/bulk-data lists files with jsonl_download_uri (gzipped JSON Lines) and compressed_size: default_cards (~80 MB) for printings, oracle_tags (~6 MB) for functional tags, and art_tags if you support art searches. The *.scryfall.io file hosts have no rate limit.
- API: send an accurate User-Agent (scripts: "AppName/version"; in the browser, leave the browser's own) and an Accept header. /cards/search, /cards/named, /cards/random and /cards/collection allow 2 requests per second; most other endpoints allow 10. A 429 locks you out for 30 seconds, so back off and never retry in a loop. Cache responses for at least 24 hours. CORS is open. Unknown search keywords are ignored with a warning (HTTP 200, `warnings`); syntax errors return 400 with `details`.
- Join chain from an exported card name to a Scryfall card:
  1. Name → 17Lands' public cards.csv (https://17lands-public.s3.amazonaws.com/analysis_data/cards/cards.csv; columns id = MTGA id, expansion, name, rarity, color_identity, mana_value, types, is_booster; one name can have several ids) rows for the set and its bonus codes → MTGA ids → Scryfall arena_id. Verified: 97274 → Aang's Journey in tla; 98622 → Teferi's Protection in tle.
  2. Otherwise, name, front-face name, or printed_name within the set's Scryfall codes (the main set plus sets whose parent_set_code is the main set).
  3. Otherwise, exact name or front-face name among Arena printings anywhere, for cross-set bonus sheets like SPG and OMB.
  Report anything still unmatched; the target is zero.
- Oracle tags are hierarchical, and otag: matches descendant tags (removal has no direct taggings but 25 child tags). A local evaluation using descendant closure matched the API exactly for removal, card-advantage, combat-trick, ramp and lifegain on TLA.
- Images: image_uris include display (WebP, 672×936, about 50 KB), large (JPEG, about 105 KB), png (about 600 KB), grid and thumb (WebP), and art_crop.
- Terms: don't paywall, don't imply Scryfall's endorsement or use its logo, and add value beyond repackaging. Card images must never have the artist or copyright line covered or cropped, be distorted, skewed, or stretched, be blurred, sharpened, desaturated, or color-shifted, or carry watermarks, stamps, or badges. If you show an art_crop, show the artist and copyright nearby. So grade badges, miss tints, and glows go on the UI around the card, never on the image.
</data_sources>

<filters>
- One filter component serves practice, stats, history, and drills. It has a Scryfall query field and quick chips (colors including multicolor and colorless, rarity, card type, mana value, limited set) that write visible syntax into the field, so the query is the single source of truth and the user picks up the syntax as they go. First-look vs. review and the date range are separate toggles, not part of the query. Show the live match count ("142 cards").
- An entry matches a query when its display printing matches. Results must equal what Scryfall returns for those printings.
- Evaluation: parse the query into a syntax tree.
  - Evaluate these terms locally and exactly against the pipeline's Scryfall data: boolean logic, parentheses and negation, c/id with comparison operators, t, o (including regex), name, mv, pow/tou/loy, r with comparisons, set, cn, kw, otag/function through the tag hierarchy, and the is:/has: flags you can derive exactly.
  - Resolve every other term by asking Scryfall's API for that subtree alone, restricted to the relevant Scryfall set codes with unique:prints. Page within the rate limit, map results back by Scryfall printing id, cache them, then combine the boolean logic locally. Show progress while API terms resolve.
  - Two app-only keywords are always evaluated locally and never sent to Scryfall:
    - lset: (limited set, including its bonus-sheet cards);
    - crowd:over and crowd:under (the crowd-gap classes defined in <learning_design>).
  - Don't add further local terms before the definition of done is met, and never approximate a term locally.
- Mirror Scryfall's behavior: unknown keywords are ignored with a non-blocking warning, and syntax errors show an inline error while the last valid pool stays active.
- History and stats filter against the snapshots stored with each evaluation, which also covers rotated sets. Offline, API-only terms use cached results when they exist and otherwise show a "needs a connection" note.
- Differential test: a corpus of at least 60 queries (otag, negation, regex, comparisons, DFCs, bonus-sheet cards, OM1, mixed local/API terms). CI runs it against a pinned fixture pool and a bulk-data subset recorded together with their API responses. The scheduled job runs it against the live API and reports drift without blocking deploys.
</filters>

<learning_design>
Core loop
- The card is the hero of the screen, and the card plus the grade input fit in one viewport without scrolling from 360×640 up. The card is as large as that allows, and the reveal replaces the grade-input area.
- A grade commits on pointer-up, sliding off the button cancels it, and the reveal starts within 50 ms; there's no confirm step. Answers are final once revealed. The next card is preloaded so it appears in under 100 ms.
- Record response time from "card fully visible" to the grade commit, plus why each card was selected and its selection probability.
- A low-prominence skip exists for cards that fail to load or can't be read. Skips are recorded and requeued, and never count as evaluations.

First looks and exposure
- A first look is the first graded evaluation of an oracle card whose grade the app has never shown the user, in any set. Showing a card's grade anywhere counts as exposure: in a reveal, as a contrasting case, or in a list. So pick contrasting cases from already-exposed cards when you can.
- Headline first-look metrics and the learning curve use uniformly sampled first looks only: Random-mode cards plus a fixed share (about 1 in 5) of uniform probe cards in Adaptive mode. That way they measure skill, and they don't shift when the scheduler's mix changes.

The reveal teaches. Order matters, and the first glance must be readable in about a second:
1. Actual vs. user grade on the 13-step scale, with the signed difference in steps ("+3, overrated"), color-coded.
2. GIH WR, the set mean, rank in set ("#12 of 281"), sample size, and an uncertainty cue when the truth is noisy.
3. A compact why-context block of at most three short lines from the export; skip any line whose columns are missing:
   - OH WR vs. GD WR (early vs. late value), and IIH.
   - How the card's color did in this format: the average GIH WR of cards of the same color against the set mean. For multicolor cards use the same color pair when it has at least 5 graded cards, otherwise all multicolor cards; for colorless cards use all colorless cards.
   - How drafters valued it. Compare its ALSA percentile (lower ALSA means picked earlier) with its GIH WR percentile among the set's graded cards. A gap of 25 points or more is the crowd gap: crowd:over (drafted ahead of its performance) or crowd:under. The gap between what drafters believe and what wins is one of the most valuable things this app can teach.
4. Two or three contrasting cases: same set, similar role (type, mana value, color), clearly different grade, as tappable thumbnails. Contrast is how people learn which features matter.
5. Links to the card on Scryfall and to the set's 17Lands Card Data page (https://www.17lands.com/card_data?expansion={EXP}&format={FORMAT}). The per-card details page there requires a 17Lands login, so don't link to it.

Ground truth is noisy; account for it everywhere
- SE of GIH WR ≈ sqrt(p(1 − p) / #GIH), which is ≈ 3·SE/sd grade steps. Example: in a set with a 4-point SD, a rare at 71.7% on 513 games in hand has an SE of about 2 points, or ±1.5 steps; a common with 30,000 games in hand is about ±0.2 steps.
- Show the uncertainty on reveal when it's around 0.75 steps or more.
- Count |error| ≤ 1 step as correct for streaks and scheduling: a step is only 1/3 SD, and low-sample cards carry ±0.5–1.5 steps of sampling noise. Report the exact-match rate separately.
- Headline stats are unweighted. Smart-feedback estimates weight each evaluation by 1/(τ̂² + SE²), where SE is in steps and τ̂ is the user's own error SD. That keeps noisy rares from creating a "weakness" without making them vanish.

Card selection
- Random mode: uniform over the filtered pool, without replacement (shuffle bag). This is the literal "random card" from my requirements; keep it one tap away.
- Adaptive mode is the default. It's still randomized, built on adaptive-sequencing results from perceptual-learning research (Mettler & Kellman's ARTS):
  - Misses (|error| ≥ 2) come back after a short delay of a few trials, so the answer isn't still in working memory. After that they return at expanding intervals: in trials within a session, and in days across sessions (for example 1, 3, 7 and 21 days). They retire after consecutive correct answers and come back only as rare long-interval checks.
  - Fast correct answers stretch intervals more than slow ones, because response time signals fluency.
  - Some new cards target the user's current weak facets. The rest are exploratory and stratified by actual grade band, because about two-thirds of a set sits between D+ and B-. Keep the oversampling of extreme grades to at most about twice their natural rate, so the user doesn't learn a distorted base rate.
  - Interleave sets and facets; avoid long runs of the same set or color.
  - Choose the remaining proportions and parameters, document them, and keep them easy to tune.
- Drills start from a card-facet insight with that facet's query, run adaptively inside it, and end at a mastery criterion or after N cards.
  - Measure progress on later first looks in the facet against the shrunken pre-drill estimate.
  - A raw before/after would show improvement from regression to the mean alone, because the facet was chosen for being extreme.
- Sessions default to 20 cards (configurable, with an endless option) and end in a summary: accuracy, biggest misses with one-tap review, change versus recent sessions, and the single recommended next drill. Sessions resume after the app is closed.
- Light motivation that rewards the right things: a daily streak, a daily rep goal, personal bests on first-look accuracy. Never reward speed alone.

Stats
- Everything is filterable by the shared filter plus date range, mode, and first-look/review.
- Headline numbers: mean absolute error in steps, exact %, within-one %, bias (mean signed error), calibration slope and intercept, rank correlation, counts and streaks — each split first-look vs. review, with a trend.
- Views: learning curve (rolling first-look error), calibration plot (user grade vs. actual, with the diagonal), confusion heatmap, facet table (n, MAE, bias, trend; sortable), per-set table, and a filterable, sortable history ("my worst misses on red removal").
- Say "steps" consistently, where one step is one notch such as B to B+ and three steps make a letter grade. Charts are legible at phone width, and heavy computation runs off the main thread.

Smart feedback — the core analytical feature; make it statistically honest
- Facets:
  - rarity;
  - each color, multicolor, colorless, and color count;
  - card type;
  - mana-value bucket;
  - creature stats relative to mana value;
  - keywords;
  - a curated list of functional oracle tags (removal, card advantage, combat tricks, counterspells, ramp and fixing, lifegain, evasion, sweepers, token makers, …);
  - set, bonus sheet, and layout (DFC, adventure, …);
  - the crowd gap (crowd:over / crowd:under), which reveals whether the user follows drafters' misjudgments;
  - any saved query, as a custom facet;
  - a few two-way interactions (color × type, color × mana value), held to a stricter threshold.
- Fit calibration and facet effects on first-look evaluations only; reviews measure memory, not judgment. Report the first-look vs. review gap separately.
- Separate global calibration from facet effects. First fit the user's calibration line (their grade against the actual grade, with the pivot at C). A slope < 1 means compression (too timid at the extremes), and an offset at C means optimism or pessimism. Then estimate facet effects on the residuals from that line, either jointly (for example ridge-regularized regression on facet indicators) or as shrunken weighted means. Why: a user who compresses will appear to "underrate" every high-quality facet (rares, removal) and "overrate" every low-quality one purely through regression to the mean, and reporting those as facet weaknesses would teach the wrong lesson.
- Surface an insight only with adequate evidence: enough effective sample, an interval excluding zero, and an effect of at least about 0.5 steps. Rank insights by impact (effect size × how often the facet appears in the user's practice pool). Show a handful at most, and show strengths too.
- Each card-facet insight has:
  - a plain-language headline ("You overrate green creatures by about 1.5 steps — half a letter grade");
  - evidence in a details drawer (n, effect, interval);
  - three example cards where it happened;
  - a one-tap "Drill this".
- Behavioral insights get a concrete tip instead of a drill: inconsistency (high variance without bias), speed–accuracy trade-offs, fatigue within sessions, and compression.
- Insight text is deterministic and templated; no LLM dependency.
- Validate the engine with 50 simulated users × 400 evaluations each, run through the real scheduler, with planted effects (for example +2 steps on red, calibration slope 0.6, noise σ ≈ 1.2 steps, clipped to F…A+). It must report each planted effect in at least 90% of runs and any given unplanted effect in at most 5%.

In-app learning: a short glossary/about page explaining GIH WR, OH/GD/IIH, ALSA/ATA, why grades are relative to a format, and GIH WR's known biases (deck quality, game length, color strength), linking 17Lands' "Using Win Rate Data" article (https://blog.17lands.com/posts/using-win-rate-data/).
</learning_design>

<experience_design>
Mobile-first
- Design for 360–430 px portrait and one-handed use: primary controls in the bottom third, 48 px minimum targets, safe-area insets, nothing that depends on hover, and no layout shift while images load (reserve the 63:88 card ratio). Tablet and desktop are enhancements: a side-by-side layout and keyboard shortcuts for every grade and action.
- During practice and the reveal, nothing is drawn over the card image: no badges, toasts, tooltips, or partial sheets. The card may shrink or move to make room. Full-screen views that replace the practice screen are fine.
- Legibility: tap to zoom full screen; DFCs flip; a text view (Oracle text, type line, P/T in large type) serves small screens and screen readers.
- Images: use display for the main card (large as a fallback), grid or thumb for thumbnails, and png only when zoomed. Preload the next two or three cards.
- Grade input: 13 options is a lot for a thumb. A strong default is a 4×3 grid (rows A/B/C/D, columns +, plain, −) plus a full-width F, in the thumb zone. A faster, less error-prone design is welcome; justify it in DESIGN.md.
- Budgets:
  - Cold first visit: first card visible within 2.5 s in Lighthouse mobile, with Performance ≥ 90 and Accessibility ≥ 95.
  - Warm repeat visit (service worker): first card within 1 s.
  - Next card: within 100 ms.
  - Interface time per rep (reveal sequence + advance + deal-in) of about 1.5 s or less, plus 60 fps animation. Measure these in Playwright with 4× CPU throttling.
  - Initial JS around 200 KB gzipped or less, data excluded.
- Data delivery: per set, ship every field Scryfall search can query (drop links, purchase URIs, and other unsearchable fields), lazy-loaded per set and cached by the service worker. Offline practice draws from cards whose images are already cached; keep a rolling cache of upcoming cards.
- Accessibility: WCAG 2.2 AA contrast, labeled controls, sensible focus order, screen-reader announcement of results, prefers-reduced-motion respected, and color never the only signal.

Sound, haptics, motion
- Build one feedback layer (for example feedback('grade.select')) that maps every user action to a sound, haptic, and motion token, so coverage is complete and easy to audit.
  - Discrete actions (tap, click, submit, toggle, navigate) get sound and motion.
  - Continuous input (typing, scrolling, dragging) maps to an explicit "none" or subtle motion only.
- Sound: synthesize with the Web Audio API or ship small original or CC0 assets. Keep sounds short, soft, and slightly varied so repetition never grates. Results scale with accuracy (exact > close > miss), streaks climb in pitch, and milestones get a short flourish. Unlock audio on the first gesture (iOS). Volume and mute live in settings and persist.
- Haptics: the Vibration API where supported; degrade silently elsewhere.
- Motion: the card deals in; buttons press with a spring; the reveal is a short staggered sequence (grade, win-rate count-up, marker sliding along the scale) that the next tap can skip; summaries and charts animate in. Keep core-loop animation within about 400 ms so reps stay fast. Animate transform and opacity only; reduced motion falls back to fades.

Visual design
- Write a short DESIGN.md before building screens: concept, palette as CSS variables, type scale, the grade color scale, motion principles, and sound palette. Build every screen to it from the start.
- Aim for a crafted object for Magic players — tactile, focused, a little dramatic at the reveal — not a SaaS dashboard. The card is the hero. The 13-step grade scale needs a strong, consistent identity, since it appears on the buttons, the reveal, and every chart.
- Avoid these defaults: cream or off-white page backgrounds; purple-to-blue gradients; Inter, Roboto, Arial, system-ui, or Space Grotesk; italic accent words in headlines; numbered "01 / 02 / 03" section labels; monospace eyebrow labels; pill-shaped buttons everywhere; a grid of glassmorphism cards.
- Don't imitate the trade dress or logos of Wizards of the Coast, MTG Arena, 17Lands, or Scryfall. For mana symbols use a properly licensed source (Scryfall's symbology SVGs or the Mana font) with attribution.
</experience_design>

<persistence>
- Local-first in IndexedDB (Dexie is a good fit), with no account needed. Store:
  - evaluations (timestamp; card key; user grade; the actual grade, GIH WR, #GIH, set mean/SD, ALSA, ATA and crowd-gap class at that moment; export date; mode; selection reason and probability; active filter; response time; first-look flag; session id);
  - the Scryfall-searchable fields plus oracle-tag slugs for every evaluated card, which keeps history filterable by every Scryfall characteristic even after rotation;
  - the exposure log, scheduler state, sessions, saved filters, and settings.
- When a new export changes a card's grade, keep the stored snapshot; analytics use the latest grade by default and mark changed items.
- Rotated sets leave the practice pool but stay in history and stats.
- Version the schema, with migrations, from the first release.
- Durability: call navigator.storage.persist(). iOS Safari can delete a site's storage after seven days of Safari use without a visit unless the site is installed to the Home Screen. So make the app an installable PWA, prompt iOS users to install after their first session, and provide JSON export/import with an occasional backup reminder.
</persistence>

<attribution_and_terms>
- 17Lands: credit them visibly on the practice screen itself, without navigation (a compact line is fine), and on the about page. Link to each set's Card Data page, e.g. "Win-rate data from 17Lands Card Data". The credit must not imply endorsement, and the name is styled "17Lands". On the about page, also credit cards.csv as part of 17Lands' public datasets (CC BY 4.0), with a license link.
- Scryfall: credit card data and images, imply no endorsement, and keep access free.
- Include the Wizards of the Coast Fan Content Policy notice: "[App name] is unofficial Fan Content permitted under the Fan Content Policy. Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC." The app is free.
- No ads and no third-party trackers.
</attribution_and_terms>

<architecture>
Defaults; change one only with a reason recorded in DECISIONS.md:
- Static PWA: Vite, React, TypeScript, Motion for animation, Dexie, vite-plugin-pwa (Workbox) for offline, Web Workers for query evaluation and analytics, Vitest and Playwright for tests.
- Data pipeline: a TypeScript or Python job in GitHub Actions. Triggers:
  - every push that touches data/17lands/ or the set and format config;
  - a manual trigger;
  - a daily schedule, which picks up Scryfall updates, rotation, and sets whose embargo has ended.
  
  Each run:
  - validates the exports;
  - joins them to Scryfall bulk data and oracle tags;
  - applies the Standard and live-time rules;
  - computes grades;
  - emits compact, versioned static JSON (a manifest plus per-set files) that the app fetches and caches.
  
  "Last good data" means the currently deployed manifest, read back at the start of each run. A refused export only affects its own set (see above). If a shared input breaks (Scryfall bulk data, the Standard list, the schema), the run fails loudly and doesn't deploy.
- Hosting: static (GitHub Pages or Cloudflare Pages), with the workflow deploying when data changes. If deployment credentials aren't available to you, finish everything else, make deployment a single documented step, and say so in your final report.
- The app itself needs no server; don't add one unless a requirement can't be met without it.
</architecture>

<priorities>
Build in this order. Each milestone ends with the app usable and the work committed:
1. Data pipeline: export importer and validator, Scryfall join, eligibility, and grades, with tests, run on the exports in data/17lands/. Also the status command.
2. Core loop on a phone viewport with persistence, built in the real design system rather than grey boxes.
3. Shared filter: local engine, API resolution, differential tests.
4. Stats.
5. Adaptive scheduling, exposure tracking and probes, smart feedback, drills, session summaries.
6. Sound, haptics, and motion coverage; PWA and offline; performance and accessibility budgets.
7. Deploy workflow and README.
After the definition of done is met, add one stretch goal, then stop: a compare mode ("which of these two has the higher GIH WR?"), which mirrors a draft pick. Skip cloud sync unless I've provided a backend.
When trade-offs come up: data correctness and source terms > speed and feel of the core loop > quality of feedback > breadth of features.
</priorities>

<how_to_work>
- Before building on Scryfall or the Standard list, check them live (fetch the Scryfall bulk-data index, the Standard list, and a HEAD of cards.csv). Use the exports in data/17lands/ as your 17Lands samples.
- Keep PLAN.md as your checklist (milestones → tasks with status) and DECISIONS.md for judgment calls. Commit after each meaningful step with a clear message, and keep the app runnable at every commit.
- Write tests for the logic the app's credibility rests on:
  - the export importer:
    - parsing: BOM, quoting, "%" and "pp" values, blanks, missing optional columns;
    - refusals: filtered or partial exports, the 52–61% and 1.5-point checks, a shrinking # GIH;
    - inference: set (including OM1's Marvel names), format override, export date, and picking the newest export with its tie-break;
    - a refused export falling back to the previous valid one;
  - grade band boundaries (z exactly on a band edge) and the 15-card minimum;
  - set eligibility with date fixtures: FRA on 2026-10-03 → held back; on 2026-10-12 → included; with the embargo off → included from 2026-10-06; an export without a release date → held back;
  - the status command's states and staleness rules;
  - the crowd-gap classes;
  - the Standard rule;
  - the join (bonus sheets, OM1, DFC names);
  - the query engine (the differential corpus);
  - the scheduler and exposure logic;
  - smart feedback (the simulations).
  Also exercise the app end to end on a mobile viewport with Playwright: complete a session, filter with a query, open stats and insights, reload and confirm persistence, then go offline and keep practicing.
- Use subagents only for large, independent tracks (the data pipeline vs. the UI shell, for example). Run at most two at a time, and don't use them to re-check work.
- Keep documents short: README (what it is, run, test, deploy, how to add or refresh exports), DESIGN.md, DECISIONS.md, PLAN.md.
- While working, write one sentence before you start, then a brief note when you finish a milestone or change direction.
- Keep going until the definition of done and the stretch goal in <priorities> are complete. Reaching a milestone, finishing a long stretch of work, or having options to offer are not reasons to stop and report; note them and continue. Stop early only when you're blocked on something only I can provide (deployment credentials, for example), and finish all the work that doesn't depend on it first.
</how_to_work>

<definition_of_done>
- From a clean checkout, documented commands install the app, build the data from the exports, run the app locally, and pass all tests.
- The pool contains every live set (18 on 2026-10-03, once the exports are in), with zero unmatched cards or each exception listed with a reason. Grades follow the 17Lands formula, and the status command reports every Standard-legal limited set's state with links for the ones that aren't live and fresh.
- The Playwright mobile run meets the budgets above. Every discrete action has sound and motion feedback, and nothing is drawn over the card image during practice.
- Filters accept Scryfall syntax with Scryfall-equal results over the pool (the differential corpus passes), and the same filter drives practice, stats, history, and drills.
- Stats and smart feedback work on real usage, the simulation thresholds pass, and every card-facet insight leads to a drill.
- Progress survives reloads, offline use, and export → import.
- Attribution and the fan-content notice are in place.
- A scheduled workflow refreshes data and deploys, or is ready to once credentials are added.
</definition_of_done>

<final_report>
When you finish, lead with what was built. Then cover:
- how to run, test, and deploy it, and how to add or refresh exports;
- what the data contained on the run date: sets, formats, export dates, and card counts, plus exclusions and why, including missing or stale exports with their links;
- any deviations from this brief and why;
- known limitations.
Keep it brief. If your environment supports it, attach screenshots or a short recording of the core loop at 390×844.
</final_report>
````
