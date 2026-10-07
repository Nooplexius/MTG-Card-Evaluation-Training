# PLAN

Status: `[x]` done · `[~]` in progress · `[ ]` to do · `[!]` waiting on the owner. Milestones follow the brief's priority order.

## M0 · Setup
- [x] Live checks: Scryfall bulk index, whatsinstandard, cards.csv HEAD, 17Lands dev fixtures (filters, TLA PremierDraft, OM1 PickTwoDraft)
- [x] Scaffold: Vite + React + TS, Vitest, Playwright, tsx pipeline
- [x] PLAN.md, DECISIONS.md, DESIGN.md

## M1 · Data pipeline
- [x] Config: `data/config/sets.json` (release dates, formats, bonus mappings), `data/config/pipeline.json` (switches)
- [x] Shared inputs: Standard list, Scryfall sets + bulk default_cards + oracle_tags, cards.csv (cached, fail loudly)
- [x] CSV export parser (BOM, quotes, %, pp, blanks, optional column groups) and API row normalizer
- [x] Set inference, format config + filename override, export date (name, else git add date)
- [x] Validation chain against previous data; newest valid export wins, refused ones fall back
- [x] Join chain and display printing (bonus sheets, OM1, DFC names); zero unmatched on the synthetic samples
- [x] Grades (17Lands formula), rank, SE, crowd gap
- [x] Standard rule + Scryfall cross-check, BIG→OTJ, SPM→OM1
- [x] Eligibility: minDaysLive, embargo (+13 days), release dates from /data/filters with config fallback
- [x] Daily fetch with fetch-state on the data branch; snapshot pruning (newest 14 per set and format)
- [x] Output: manifest + hashed per-set files + tags + status.json; last-good fallback from the deployed manifest
- [x] Status command with export links; synthetic samples; `--no-17lands` for CI
- [x] Tests for all of the above

## M2 · Core loop
- [x] DESIGN.md (concept, palette, type, grade scale, motion, sound)
- [x] Card view (63:88 reserved, zoom, DFC flip, text view), 5×3 grade key bed, reveal that fits without scrolling
- [x] Persistence (Dexie in the worker), sessions, resume, skip; attribution on the practice screen

## M3 · Shared filter
- [x] Parser, exact local evaluator, app-only `lset:` and `crowd:`
- [x] API resolution for other subtrees (rate-limited, cached, progress, offline note)
- [x] Filter screen (query field, chips, live count, saved filters); same filter for practice, stats, history, drills, compare
- [x] Differential corpus: 152 queries, equal to live Scryfall; weekly drift workflow

## M4 · Stats
- [x] Headline first-look vs. review metrics, learning curve, calibration plot, confusion heatmap, facet and set tables, history

## M5 · Learning engine
- [x] Exposure log, first looks, uniform probes (1 in 5)
- [x] Adaptive scheduler, Random mode shuffle bag, selection reason + probability
- [x] Smart feedback (stepwise weighted fit, calibration, behavioral insights) passing the 50 × 400 simulation
- [x] Drills with mastery, session summaries, streaks, daily goal, personal best
- [x] Evidence decay: recency weights with a per-user half-life chosen by predictive likelihood, sandwich standard errors

## M6 · Feel, offline, budgets
- [x] Feedback layer (sound, haptics, motion) with a coverage test
- [x] PWA: install prompt, offline practice from cached images, rolling prefetch, backup export/import
- [x] Playwright budgets under 4× CPU; Lighthouse mobile (Performance 99–100, Accessibility 100, LCP < 2 s)

## M7 · Ship
- [x] GitHub Actions: CI, daily data + deploy, Scryfall drift check
- [x] README
- [x] Real 17Lands exports for the 18 finished sets (2026-10-05); FRA follows through the daily fetch from 2026-10-12
- [!] Enable GitHub Pages (Settings → Pages → Source: GitHub Actions); merging the exports then deploys

## Stretch
- [x] Compare mode ("which has the higher GIH WR?")
