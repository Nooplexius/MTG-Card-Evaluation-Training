# DESIGN

## Concept: the assay bench

Loupe is an appraiser's bench at night. The card lies under a warm lamp on dark felt; you judge it, then the assay result is stamped beside it. Everything is built around one object, the card, and one instrument, the 13-step grade scale, which reads like an assay strip running from oxblood through copper and pewter to verdigris and gold. Controls feel like brass-edged keys: square-shouldered, pressed with a short spring. The reveal is the one dramatic moment: the grade stamps in, the win rate counts up, a marker slides along the strip.

## Palette

```css
--felt-0: #0e1311;   /* page */
--felt-1: #141b18;   /* surfaces */
--felt-2: #1b2420;   /* raised keys */
--felt-3: #26322c;   /* borders, pressed */
--lamp:   #3a2c17;   /* warm glow behind the card */
--bone:   #ede6d6;   /* primary text, 15:1 on felt-0 */
--bone-2: #bdb5a3;   /* secondary text, 9:1 */
--bone-3: #948d7e;   /* tertiary text, 5.7:1 */
--brass:  #c9a24a;   /* accent, focus rings, links */
--brass-hi: #e6c36a;
--miss:   #c4553c;   /* error and miss accents (always paired with a sign and words) */
```

No cream or off-white backgrounds, no purple-to-blue gradients, no glass panels.

## Grade scale

One color per step, F to A+, lightness rising monotonically (OKLCH L from 0.51 to 0.91) so the order survives grayscale and color blindness. Hue moves by letter: oxblood F, copper D, pewter C, verdigris B, gold A. Letters are always printed with the color; color is never the only signal.

| Step | Hex | Label on fill |
| --- | --- | --- |
| F | `#ae3736` | bone |
| D- | `#b1422a` | bone |
| D | `#b35124` | bone (large text only) |
| D+ | `#c26d32` | ink |
| C- | `#a0876b` | ink |
| C | `#97958d` | ink |
| C+ | `#8ba790` | ink |
| B- | `#6cb69a` | ink |
| B | `#62c1a5` | ink |
| B+ | `#6ecaa4` | ink |
| A- | `#dbbb56` | ink |
| A | `#f1c955` | ink |
| A+ | `#fee165` | ink |

Filled chips are used at large-text sizes (≥ 18.7 px bold); small labels (history rows, tables) use an outlined chip: a 3 px colored bar plus bone text on felt. Charts use the same colors in the same left-to-right order (F left, A+ right) as the grade pad, so position means the same thing everywhere.

## Type

- **Alegreya** (OFL, self-hosted) for grade glyphs, headlines and big numbers: a calligraphic book serif with weight and bite. Numbers use `lining-nums tabular-nums`.
- **Alegreya Sans** (OFL, self-hosted) for everything else: a humanist sans that stays legible at 13 px.
- Scale (rem): 0.8125 caption · 0.9375 small · 1 body · 1.25 title · 1.625 heading · 2.5 grade · 4 reveal grade.
- Section labels are small caps with 0.08em tracking. No monospace labels, no numbered section markers, no italic accent words.

## Grade input

A 5 × 3 key bed, not the default 4 × 3 + F:

```
 F | D+ | C+ | B+ | A+
   | D  | C  | B  | A
   | D- | C- | B- | A-
```

- Columns run F → A left to right, the same direction as the reveal strip and every chart, so the key you pressed sits directly above where the marker lands.
- Rows are modifiers (+ top, plain middle, − bottom). F spans all three rows, so it is the biggest key and impossible to miss.
- Three rows instead of five cut the pad from ~264 px to ~176 px at 360 × 640. That height goes to the card, which grows from about 209 to 260 px wide: more legible text, better judgments.
- Keys are at least 62 × 52 px. Commit happens on pointer-up; sliding off a key cancels. No confirm step.
- Keyboard: type the letter, then `+`/`=` for plus, `-` for minus, or Enter/Space for plain (F commits at once). Arrow keys move focus across the pad.

## Layout

- Portrait 360–430 px: compact top bar (menu, filter summary, session count), the 17Lands credit line, the card (63:88 box reserved before the image loads), then the key bed in the bottom third, above the safe-area inset.
- During the reveal the panel replaces the key bed at the height of its content and the card shrinks into the space above it, so everything shows at once with no scrolling from 360 × 640 up. Nothing is ever drawn on top of the card image: grades, tints and glows sit around it.
- Wide screens (≥ 900 px): card on the left, pad or reveal on the right, keyboard hints visible.
- Every other screen (filter, stats, insights, history, settings, about) is a full-screen view that replaces practice.
- Compare mode mirrors a two-card draft pick: the question and both cards sit centered as one group, each card over an info block of fixed height (name before the pick; grade, GIH WR, games and ALSA after), so nothing moves at the reveal. The two pick buttons sit in the thumb zone under their cards. The winner gets a brass ring around its card box, never on the image; a tap on a card opens it full size.

## Motion

- Core-loop motion stays within 400 ms: deal-in 220 ms (rise 24 px, scale 0.96 → 1, fade in); key press spring (stiffness 700, damping 32, scale 0.94); reveal stagger: grade stamp at 0 ms (scale 1.15 → 1, 160 ms), difference at 60 ms, win-rate count-up 0–320 ms, strip marker slide 280 ms.
- The next tap skips whatever is still animating.
- Only `transform` and `opacity` animate. With `prefers-reduced-motion` (or the setting), everything becomes a 120 ms fade and count-ups jump to the value.
- Summaries and charts draw in once (stroke-dashoffset is avoided; bars scale from their baseline with transforms).

## Sound and haptics

One feedback layer maps every action name (`grade.press`, `grade.commit`, `reveal.exact`, `nav.open`, …) to a sound, a haptic pattern and a motion token. Discrete actions get sound and motion; typing, scrolling and dragging map to `none` or subtle motion.

- Sounds are synthesized with the Web Audio API: short (≤ 250 ms), each play detuned ±3% and gain ±10% so repetition never grates. Levels are set for phone speakers (peaks around −7 dBFS through a limiter, no sound carried below 250 Hz). On iPhone they follow the Ring/Silent switch.
  - Key press: a muted wooden tick. Commit: a small brass tink.
  - Result: exact = a bright three-note bell, within one step = a two-note rise, miss = a low felt thump (never a buzzer).
  - Streaks raise the result chime one pentatonic step per streak level; milestones (daily goal, personal best) get a four-note flourish.
  - Navigation: a soft paper slide. Toggles: a click whose pitch follows on/off. Errors: a dull double tick.
- Haptics use the Vibration API (8–30 ms pulses) and degrade silently.
- Audio unlocks on the first gesture (iOS). Volume, mute and haptics live in settings and persist.

## Attribution placement

The practice screen carries a one-line credit under the top bar: "Win rates: 17Lands Card Data · TLA Premier Draft" linking to that set's Card Data page. The about page carries the full credits (17Lands, cards.csv under CC BY 4.0, Scryfall, mana symbols, fonts) and the Fan Content Policy notice.
