# Build prompt: MTG Limited card-evaluation trainer

Written for Claude Opus 5.5 at Max effort, running as a coding agent in this repository (Cursor agent or Cloud Agent, or Claude Code). Paste everything inside the block below as one message. The data-source facts in it were checked against the live sources on 2026-10-03; the evidence is in [`RESEARCH_NOTES.md`](./RESEARCH_NOTES.md).

````text
You're going to build and ship a complete web app in this repository: a mobile-first trainer that makes Magic: The Gathering Limited players measurably better at evaluating cards. Start from the near-empty repo and work autonomously through the milestones and stretch goals in <priorities>; the definition of done is at the end. The brief gives you the goal, my requirements, facts about the data sources (checked against the live sources on 2026-10-03; the evidence is in prompt/RESEARCH_NOTES.md), and the constraints that matter. Where it leaves room, use your judgment in service of the metagoal and record significant judgment calls in DECISIONS.md.

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
These facts were true on 2026-10-03. Sources change: check them live before building on them, and where something no longer holds, trust what you observe, adapt, and note it in DECISIONS.md.

17Lands — which data you may use
- Don't call 17Lands' JSON endpoints (/api/card_data, the older /card_ratings/data, /data/*), even though they are easier and more current. Every /api/card_data response says: "This data is only for use on 17Lands.com. The only data permitted for outside use (public or private) is available at 17lands.com/public_datasets." Their usage guidelines also discourage automated scraping without explicit permission.
- Build on the public datasets (typically CC BY 4.0). Bucket listing is denied, so discover files with HEAD requests on the predictable URLs. A file that doesn't exist returns 403, not 404: treat 403 as "not published", and fail the run only if cards.csv or a previously seen file stops returning 200. Use ETag/Last-Modified to skip unchanged files.
  - https://17lands-public.s3.amazonaws.com/analysis_data/game_data/game_data_public.{EXP}.{FORMAT}.csv.gz — 10–100 MB gzipped; stream it.
  - https://17lands-public.s3.amazonaws.com/analysis_data/cards/cards.csv — columns id (MTGA id), expansion, name, rarity, color_identity, mana_value, types, is_booster. One name can have several ids (alternate-art printings).
  - draft_data_public.{EXP}.{FORMAT}.csv.gz (same folder pattern under draft_data/) is about 3× larger; it's only needed for the pick-order stretch goal.
- Cadence: 17Lands says it intends to publish game data about 3 weeks into a set; in practice dumps arrive 5–7 weeks after the Arena release (HOB: released 2026-08-11, file posted 2026-10-01; TMT: 2026-03-03 → 2026-04-08) and are rarely updated afterwards. So "live" means the pipeline picks up new dumps automatically every day, and the newest set appears weeks after release. Say so plainly in the UI (for example "FRA: waiting for 17Lands public data").
- Live adapter, built but dormant: implement a second data-source adapter for /api/card_data (params: expansion, event_type, time_period=ALL_TIME) behind a config gate that records explicit permission from 17Lands. Test it with fixtures only — never call the endpoint while the gate is closed. When enabled, it fetches server-side at most once per set per day with a descriptive User-Agent, produces the same output schema, and applies 17Lands' embargo for third-party tools: a new expansion appears only from its Arena release + 13 days (17Lands: "the 12th day … typically the second Monday after the set release"; Arena releases are Tuesdays).

17Lands — computing the numbers
- Game files have one row per game: metadata columns (including won, draft_time, game_time, rank, main_colors, splash_colors, on_play, num_turns, and user skill buckets) plus five count columns per card, keyed by card name: deck_, sideboard_, opening_hand_, drawn_, tutored_. Names are front-face only (no " // "). Basic lands appear as columns; exclude them.
- Match 17Lands' definitions. Every metric is weighted by copies (a game with two copies in hand counts twice):
  - #GIH = Σ(opening_hand + drawn); GIH WR = Σ won·(opening_hand + drawn) / #GIH. Tutored copies don't count.
  - OH WR from opening_hand, GD WR from drawn, GP WR from deck; games-not-seen per game = max(0, deck − opening_hand − drawn − tutored); IIH = GIH WR − GNS WR.
  - 17Lands hides win rates below about 500 games in hand; use #GIH ≥ 500 as the pool cutoff.
- The actual grade uses 17Lands' own grading formula (from the official Grades view on their Card Data page), computed from the public data:
  - Population: every card in that set + format + data window with #GIH ≥ 500. mean = unweighted mean of those cards' GIH WRs; sd = population standard deviation (divide by n); require n ≥ 15.
  - z = (GIH WR − mean) / sd; t = floor(3 · (z + 11/6)); grade = [F, D-, D, D+, C-, C, C+, B-, B, B+, A-, A, A+][t], with t < 0 → F and t ≥ 12 → A+.
  - Each step is 1/3 SD: C covers z in [−1/6, +1/6), A+ starts at z = 13/6, F is z < −1.5. Grades are relative to a set and format; color or rarity filters never change a grade.
  - Label grades in the UI with their source and window ("17Lands formula · public data · TMT Premier Draft, Mar 3 – Apr 4 2026"), because the live site covers a longer window and can differ by a step.
- Validation fixture: game_data_public.TMT.PremierDraft (180,204 games, 2026-03-03 → 2026-04-04) gives 186 cards with #GIH ≥ 500, mean GIH WR 0.5731, population SD 0.0413. Grades computed from it matched 17Lands' live grades exactly for 78% of cards and within one step for 100% (Spearman 0.993). Assert these numbers only in an opt-in network test, never in pipeline code.

Which sets
- Standard legality: a set is in Standard when whatsinstandard.com/api/v6/standard.json gives enterDate ≤ today and no exitDate on or before today (its list also holds past sets and future ones with null codes). Cross-check with Scryfall: most of the set's own booster printings are legal:standard. If the two disagree, keep the last good data and flag it. Never hardcode the list. On 2026-10-03 it was WOE, LCI, MKM, OTJ, BIG, BLB, DSK, FDN, DFT, TDM, FIN, EOE, SPM, OM1, TLA, ECL, TMT, SOS, MSH, HOB, FRA; WOE through DSK rotate out in Q1 2027.
- 17Lands expansion codes are uppercase Arena codes. Bonus sheets and subsets (BIG, OTP, FCA, SOA, TLE, PZA, SPG, OMB, …) are drafted inside a parent set and appear in the parent's 17Lands data: 17Lands' TLA data includes 61 TLE cards and TMT includes 20 PZA cards. Keep them in the parent limited set and tag them. (TLE cards aren't Standard-legal on their own; they're still part of TLA's limited format.) Alchemy variants (Y25DFT, Y26SOS, …) and cube/chaos/remix events are out.
- Spider-Man's Arena release is OM1 "Through the Omenpaths"; 17Lands has OM1, not SPM. On Scryfall, om1 printings have no arena_id, and their `name` is the Marvel name while `printed_name` holds the Arena name that 17Lands uses ("Agent Venom" / "Rhilex the Accursed"). OM1's draft environment also includes 39 bonus cards from Scryfall set omb, whose parent_set_code is mar, not om1.
- Format per set: Premier Draft when its public game file exists, else the next draft format with data (TradDraft, QuickDraft, PickTwoDraft). OM1 has no Premier Draft data; its public game files are PickTwoDraft, PickTwoTradDraft, Sealed and TradSealed. Record and show the format used for each set; skip sealed-only sets.
- Eligibility: a limited set is in the pool when it is Standard-legal, has a public draft-format game file, and its earliest draft_time is at least 7 days ago. Don't substitute other dates: whatsinstandard's enterDate is the prerelease date and Scryfall's released_at is the tabletop date (FRA: enterDate 2026-09-25, released_at 2026-10-02, Arena 2026-09-29). Public dumps have so far arrived weeks after release, so the 7-day check needs synthetic fixtures to be tested.
- Expected result on 2026-10-03: 18 limited sets — WOE, LCI, MKM, OTJ, BLB, DSK, FDN, DFT, TDM, FIN, EOE, OM1, TLA, ECL, TMT, SOS, MSH, HOB. FRA has no public data yet; SPM is covered by OM1.
- A pool entry is (limited set, Scryfall oracle_id). The same card in two limited sets is two entries, because grades are format-relative. Each entry has one display printing: the printing drafted in that limited set, meaning its regular booster version, or the bonus-sheet printing for bonus-sheet cards. For OM1 this shows the Arena name and art.

Scryfall
- Pipeline: use bulk data. GET https://api.scryfall.com/bulk-data lists files with jsonl_download_uri (gzipped JSON Lines) and compressed_size: default_cards (~80 MB) for printings, oracle_tags (~6 MB) for functional tags, and art_tags if you support art searches. The *.scryfall.io file hosts have no rate limit.
- API: send an accurate User-Agent (scripts: "AppName/version"; in the browser, leave the browser's own) and an Accept header. /cards/search, /cards/named, /cards/random and /cards/collection allow 2 requests per second; most other endpoints allow 10. A 429 locks you out for 30 seconds, so back off and never retry in a loop. Cache responses for at least 24 hours. CORS is open. Unknown search keywords are ignored with a warning (HTTP 200, `warnings`); syntax errors return 400 with `details`.
- Join chain from a 17Lands card name to a Scryfall card:
  1. Name → cards.csv rows for the set and its bonus codes → MTGA ids → Scryfall arena_id (verified: 97274 → Aang's Journey in tla; 98622 → Teferi's Protection in tle).
  2. Otherwise, name, front-face name, or printed_name within the set's Scryfall codes (the main set plus sets whose parent_set_code is the main set).
  3. Otherwise, exact name among Arena printings anywhere, for cross-set bonus sheets like SPG and OMB.
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
  - The app-only keyword lset: (limited set, including its bonus-sheet cards) is always evaluated locally and never sent to Scryfall.
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
3. One line of why-context from the data: OH WR vs. GD WR (early vs. late value), IIH, and how the card's colors performed in this format (deck win rates from main_colors).
4. Two or three contrasting cases: same set, similar role (type, mana value, color), clearly different grade, as tappable thumbnails. Contrast is how people learn which features matter.
5. Links to the card on Scryfall and to the set's 17Lands Card Data page (https://www.17lands.com/card_data?expansion={EXP}&format={FORMAT}). The per-card details page there requires a 17Lands login, so don't link to it.

Ground truth is noisy; account for it everywhere
- SE of GIH WR ≈ sqrt(p(1 − p) / #GIH), which is ≈ 3·SE/sd grade steps. Example: TMT's Umezawa's Jitte has 71.7% on 513 games in hand (A+), an SE of about 2 points, or ±1.5 steps; a common with 30,000 games in hand is about ±0.2 steps.
- Show the uncertainty on reveal when it's around 0.75 steps or more.
- Count |error| ≤ 1 step as correct for streaks and scheduling; ±1 step is the data's own noise floor, per the TMT check above. Report the exact-match rate separately.
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

In-app learning: a short glossary/about page explaining GIH WR, OH/GD/IIH, why grades are relative to a format, and GIH WR's known biases (deck quality, game length, color strength), linking 17Lands' "Using Win Rate Data" article (https://blog.17lands.com/posts/using-win-rate-data/).
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
  - evaluations (timestamp; card key; user grade; the actual grade, GIH WR, #GIH and set mean/SD at that moment; data version; mode; selection reason and probability; active filter; response time; first-look flag; session id);
  - the Scryfall-searchable fields plus oracle-tag slugs for every evaluated card, which keeps history filterable by every Scryfall characteristic even after rotation;
  - the exposure log, scheduler state, sessions, saved filters, and settings.
- When a data refresh changes a card's grade, keep the stored snapshot; analytics use the latest grade by default and mark changed items.
- Rotated sets leave the practice pool but stay in history and stats.
- Version the schema, with migrations, from the first release.
- Durability: call navigator.storage.persist(). iOS Safari can delete a site's storage after seven days of Safari use without a visit unless the site is installed to the Home Screen. So make the app an installable PWA, prompt iOS users to install after their first session, and provide JSON export/import with an occasional backup reminder.
</persistence>

<attribution_and_terms>
- 17Lands: credit them visibly on the practice screen itself, without navigation (a compact line is fine), and on the about page. Link to the pages the data comes from, e.g. "Win-rate data: 17Lands public datasets (CC BY 4.0)". The credit must not imply endorsement, and the name is styled "17Lands". CC BY also calls for a license link and a note that you derived new values (the grades).
- Scryfall: credit card data and images, imply no endorsement, and keep access free.
- Include the Wizards of the Coast Fan Content Policy notice: "[App name] is unofficial Fan Content permitted under the Fan Content Policy. Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC." The app is free.
- No ads and no third-party trackers.
</attribution_and_terms>

<architecture>
Defaults; change one only with a reason recorded in DECISIONS.md:
- Static PWA: Vite, React, TypeScript, Motion for animation, Dexie, vite-plugin-pwa (Workbox) for offline, Web Workers for query evaluation and analytics, Vitest and Playwright for tests.
- Data pipeline: a TypeScript or Python job that a scheduled GitHub Actions workflow runs daily. It:
  - finds eligible sets and downloads only changed files;
  - streams the CSVs and computes metrics and grades;
  - joins Scryfall bulk data and oracle tags;
  - validates the result (unmatched cards, set sizes, distribution sanity);
  - emits compact, versioned static JSON (a manifest plus per-set files) that the app fetches and caches.
  Runners are ephemeral, so keep its state (the ETag/Last-Modified manifest and the last good outputs) on a data branch, or read it back from the deployed site at the start of each run. If a source breaks, it fails loudly and keeps serving the last good data.
- Hosting: static (GitHub Pages or Cloudflare Pages), with the workflow deploying when data changes. If deployment credentials aren't available to you, finish everything else, make deployment a single documented step, and say so in your final report.
- The app itself needs no server; don't add one unless a requirement can't be met without it.
</architecture>

<priorities>
Build in this order. Each milestone ends with the app usable and the work committed:
1. Data pipeline producing the real pool for every eligible set, with tests for metrics, grades, eligibility, and the join.
2. Core loop on a phone viewport with persistence, built in the real design system rather than grey boxes.
3. Shared filter: local engine, API resolution, differential tests.
4. Stats.
5. Adaptive scheduling, exposure tracking and probes, smart feedback, drills, session summaries.
6. Sound, haptics, and motion coverage; PWA and offline; performance and accessibility budgets.
7. Deploy workflow and README.
After the definition of done is met, add the stretch goals in this order, then stop:
1. A compare mode ("which of these two has the higher GIH WR?"), which mirrors a draft pick.
2. Pick-order stats from the draft data, shown on the reveal as how early drafters took the card versus how it performed. The gap between what drafters believe and what wins is one of the most valuable things this app can teach.
Skip cloud sync unless I've provided a backend.
When trade-offs come up: data correctness and source terms > speed and feel of the core loop > quality of feedback > breadth of features.
</priorities>

<how_to_work>
- Before building on any external source, check it live (HEAD a few dataset URLs, fetch the Scryfall bulk-data index and the Standard list).
- Keep PLAN.md as your checklist (milestones → tasks with status) and DECISIONS.md for judgment calls. Commit after each meaningful step with a clear message, and keep the app runnable at every commit.
- Write tests for the logic the app's credibility rests on:
  - metric formulas, using a small synthetic CSV with multiple copies, tutored copies, and basic lands;
  - grade band boundaries (z exactly on a band edge);
  - set eligibility, using date fixtures (FRA on 2026-10-03 → excluded; synthetic sets 6 and 8 days old → excluded and included);
  - the Standard rule;
  - the join (bonus sheets, OM1, DFC names);
  - the query engine (the differential corpus);
  - the scheduler and exposure logic;
  - smart feedback (the simulations);
  - the live adapter's gate and embargo (fixtures only).
  Also exercise the app end to end on a mobile viewport with Playwright: complete a session, filter with a query, open stats and insights, reload and confirm persistence, then go offline and keep practicing.
- Use subagents only for large, independent tracks (the data pipeline vs. the UI shell, for example). Run at most two at a time, and don't use them to re-check work.
- Keep documents short: README (what it is, run, test, deploy, data sources), DESIGN.md, DECISIONS.md, PLAN.md.
- While working, write one sentence before you start, then a brief note when you finish a milestone or change direction.
- Keep going until the definition of done and the stretch goals in <priorities> are complete. Reaching a milestone, finishing a long stretch of work, or having options to offer are not reasons to stop and report; note them and continue. Stop early only when you're blocked on something only I can provide (deployment credentials, for example), and finish all the work that doesn't depend on it first.
</how_to_work>

<definition_of_done>
- From a clean checkout, documented commands install the app, build real data with the pipeline, run the app locally, and pass all tests.
- The pool contains every eligible set (18 on 2026-10-03) with zero unmatched cards, or each exception listed with a reason, and grades follow the 17Lands formula.
- The Playwright mobile run meets the budgets above. Every discrete action has sound and motion feedback, and nothing is drawn over the card image during practice.
- Filters accept Scryfall syntax with Scryfall-equal results over the pool (the differential corpus passes), and the same filter drives practice, stats, history, and drills.
- Stats and smart feedback work on real usage, the simulation thresholds pass, and every card-facet insight leads to a drill.
- Progress survives reloads, offline use, and export → import.
- Attribution and the fan-content notice are in place.
- A scheduled workflow refreshes data and deploys, or is ready to once credentials are added.
</definition_of_done>

<final_report>
When you finish, lead with what was built. Then cover how to run, test, and deploy it; what the data contained on the run date (sets, formats, card counts, exclusions and why); any deviations from this brief and why; and known limitations. Keep it brief. If your environment supports it, attach screenshots or a short recording of the core loop at 390×844.
</final_report>
````
