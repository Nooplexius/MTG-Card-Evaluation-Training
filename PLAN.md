# PLAN

Status: `[x]` done · `[~]` in progress · `[ ]` to do. Milestones follow the brief's priority order.

## M0 · Setup
- [x] Live checks: Scryfall bulk index, whatsinstandard, cards.csv HEAD, 17Lands dev fixtures (filters, TLA PremierDraft, OM1 PickTwoDraft)
- [~] Scaffold: Vite + React + TS, Vitest, Playwright, tsx pipeline
- [ ] PLAN.md, DECISIONS.md, DESIGN.md

## M1 · Data pipeline
- [ ] Config: `data/config/sets.json` (release dates, formats, aliases), `data/config/pipeline.json` (switches)
- [ ] Shared inputs: Standard list, Scryfall sets + bulk default_cards + oracle_tags, cards.csv (cached, fail loudly)
- [ ] CSV export parser (BOM, quotes, %, pp, blanks, optional column groups)
- [ ] API row normalizer (same schema as exports)
- [ ] Set inference (join chain ≥ 90%), format config + filename override, export date (name, else git commit)
- [ ] Validation chain against previous data (columns, coverage, rows ≥ 95%, mean 52–61% and ±1.5, # GIH never shrinks)
- [ ] Join chain (mtga id → arena_id, set names/printed names, Arena printings anywhere), display printing
- [ ] Grades (17Lands formula), rank, SE, crowd gap
- [ ] Standard rule + Scryfall cross-check, bonus folding, SPM→OM1
- [ ] Eligibility: minDaysLive, embargo (+13 d), release dates from /data/filters with config fallback
- [ ] Daily fetch (filters + card_data), one request per set per day, stop on 429/error, kill switch, snapshots on data branch
- [ ] Output: manifest + per-set files + tags + status.json; last-good fallback from deployed manifest
- [ ] Status command (live, held back, missing, refused, fetch failed, stale) with export links
- [ ] Synthetic sample exports for when no real exports exist
- [ ] Tests for all of the above

## M2 · Core loop
- [ ] DESIGN.md (concept, palette, type, grade scale, motion, sound)
- [ ] App shell, data loading, card view (63:88 reserved, zoom, DFC flip, text view)
- [ ] Grade pad (commit on pointer-up, slide-off cancels), reveal (grade diff, GIH WR, rank, n, uncertainty, why-context, contrasts, links)
- [ ] Persistence (Dexie schema v1 + migrations), sessions, resume, skip
- [ ] Attribution line on practice screen

## M3 · Shared filter
- [ ] Parser → AST, local evaluator (exact terms), app-only `lset:` and `crowd:`
- [ ] API resolution for other subtrees (rate-limited, cached, progress)
- [ ] Filter component (query field + chips + live count), warnings and errors
- [ ] Differential corpus ≥ 60 queries with recorded fixtures; live drift job

## M4 · Stats
- [ ] Worker analytics: MAE, exact %, within-one %, bias, calibration, rank correlation, streaks, trends
- [ ] Learning curve, calibration plot, confusion heatmap, facet table, per-set table, history

## M5 · Learning engine
- [ ] Exposure log, first-look definition, probes (1 in 5)
- [ ] Adaptive scheduler (ARTS-style), random mode shuffle bag, selection reason + probability
- [ ] Smart feedback (calibration + ridge facet effects, thresholds, behavioral insights)
- [ ] Simulation test (50 users × 400 evals)
- [ ] Drills (mastery/N, shrunken pre-drill baseline), session summary, streak/goal/personal bests

## M6 · Feel, offline, budgets
- [ ] Feedback layer (sound, haptics, motion) with coverage test
- [ ] PWA (install prompt, iOS prompt), offline practice from cached images, rolling cache
- [ ] Playwright budgets (4× CPU), Lighthouse mobile, a11y checks

## M7 · Ship
- [ ] GitHub Actions: CI, daily data + deploy, corpus drift
- [ ] README

## Stretch
- [ ] Compare mode ("which has the higher GIH WR?")
