# Kolonet — brand-lock spec

This is the merkelås-spek for the Sportivista mark (WP-97 · Design-biblioteket).
It documents what already ships (`ios/Sportivista/ContentView.swift`,
`ios/Sportivista/Onboarding/OnboardingView.swift`, `ios/SportivistaWidget/SportivistaWidget.swift`,
`docs/css/layout.css`) — it does not introduce a new look. Any change to the
mark itself is a `DESIGN.md` § Tokens decision (amber, wordmark, icon are all
"skall" — see `DESIGN.md` § Visjon vs. skall); this file is the enforcement
detail underneath that decision.

## The mark

**SPORTIVISTA:** — the wordmark in full-caps, immediately followed (zero gap)
by an amber colon. The colon is not decoration bolted on afterward: it *is*
the brand idea. Sportivista's whole product is **når · hva · hvor** — the
colon is literally the punctuation of a clock face ("18:00"), the same glyph
that answers *når* on every row of the agenda. The app icon (`kolonet.svg`)
is the colon alone, blown up to fill the frame: two amber dots, stacked
vertically, on their own.

- **Source vector:** `design/brand/kolonet.svg` — two `#FFB000` filled
  circles on transparent, 1024×1024 reference frame, radius 118 / vertical
  gap (edge-to-edge) 168, both centred on x = 512, the pair centred on
  y = 512 (top circle cy = 310, bottom circle cy = 714).
- **Regeneration:** `design/brand/generate-icons.swift` renders the same
  geometry at any size/background (see its header for usage). The 1024
  render was verified **pixel-identical** (zero per-channel delta across
  all four RGBA bytes, every pixel) to the shipped
  `ios/Sportivista/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png`, and
  likewise for `docs/icons/icon-{512,192,180}x*.png` and `docs/favicon.png`.
  The PNG *files* are not byte-identical (the shipped files carry a 12-byte
  larger `eXIf` metadata chunk of unknown provenance — 56 vs 68 bytes, purely
  metadata, zero effect on the decoded image); the `IDAT` (pixel data) chunks
  are the same length and the decoded pixel buffers are exactly equal. See
  the WP-97 PR for the inspection transcript.

## Construction rules

1. **Zero gap, one lockup.** The wordmark and the colon sit with no space
   between them — `spacing: 0` (`HStack(spacing: 0)` in Swift; `.wordmark-lockup
   { display: inline-flex; align-items: baseline; white-space: nowrap; }` on
   web, which exists *specifically* so a parent flex `gap` can never separate
   them). Never lay them out with a container that could introduce a gap.
2. **The colon is one step heavier than the wordmark.** Since WP-183 the lockup
   is set in the DISPLAY face (Space Grotesk — `DESIGN.md` § Display-font), whose
   shipped range tops out at 700: the wordmark is **SemiBold (600)** and the
   colon **Bold (700)**, identically on iOS, widget and web
   (`Font.sportivistaDisplay(.title, weight: .semibold)` / `.bold` in
   `ContentView.swift`, `OnboardingView.swift`, `SportivistaWidget.swift`,
   `ShareCard.swift`; `.wordmark { font-weight: 600 }` / `.wordmark-colon
   { font-weight: 700 }` in `docs/css/layout.css`). Before WP-183 it was
   SF bold/heavy on iOS and — a small drift — 700/700 on web; the relative rule
   is the normative one and now holds literally on every surface. The colon
   should always read as the punchiest element in the lockup, never lighter or
   equal.
3. **Tracking.** The wordmark carries letter-spacing so the caps breathe:
   `tracking(2)` at header/onboarding size, `tracking(1)` at widget
   (caption) size — scale tracking down as the type size shrinks, never keep
   it fixed. Web: `letter-spacing: 0.02em`.
4. **One accessibility element, one label.** Wordmark + colon are exposed to
   VoiceOver/assistive tech as a single element labelled exactly `"Sportivista"`
   (`.accessibilityElement(children: .ignore)` + `.accessibilityLabel("Sportivista")`
   on every surface that renders the lockup). Never let a screen reader
   announce the colon separately ("Sportivista, colon").
5. **Colour — one lock, both surfaces (harmonised WP-98).** The wordmark
   itself is `label` (system text colour, white/black); only the colon is
   amber. This is now identical on iOS, widget, AND web
   (`.wordmark { color: var(--fg); }` / `.wordmark-colon { color: var(--accent);
   }`, `docs/css/layout.css`) — the wordmark colon is one of web's five
   explicitly sanctioned amber uses (`docs/css/base.css`: "Amber is the ONLY
   accent and is used only for: the wordmark colon, day headers, the must-see
   dot, the clock, selected state"). Before WP-98, web shipped the entire
   wordmark in amber — a drift from the owner-approved lock the iOS/widget
   surfaces always used, not an intentional platform variance. It was
   corrected, not left as documented divergence: the shipped-iOS lock is the
   fasit (see `design/tokens.json` and the WP-98 PR).
6. **The mark is set in the display face.** The wordmark and its colon are one
   of the display font's exactly three sanctioned surfaces (`DESIGN.md`
   § Display-font — the other two are the agenda's time column and the share
   cards). Never set the lockup in the system font "just here"; never introduce a
   second display face for it.
7. **No separate image mark next to text.** When the mark appears as *text*
   (wordmark contexts), it is always the literal wordmark + `":"` glyph in
   the app's own font — never the `kolonet.svg` dots rendered inline next to
   the word. The dots are for icon contexts only (app icon, favicon, PWA
   icons) where there is no wordmark to pair with.

## Spacing & minimum sizes

- **Icon safe area:** the mark itself occupies the middle ~60% of the frame
  vertically (top circle top edge at `y ≈ 0.188 × size`, bottom circle
  bottom edge at `y ≈ 0.813 × size`, radius `≈ 0.115 × size`) — this is
  already how the shipped icon is composed; treat the surrounding margin as
  fixed padding, do not crop into it.
- **Minimum icon size:** verified legible (two visibly distinct blobs, not a
  single smear) down to **16×16px** — the smallest size actually shipped
  (`docs/favicon.png`, browser tab favicon). Below 16px the geometry has not
  been tested and is not recommended. For any context where the mark needs
  to read as "a colon" rather than just "a brand blob" (app switcher, share
  sheets, list rows), prefer **≥ 32px**.
- **Minimum wordmark size:** the smallest shipped instance is the widget's
  `.caption` role (`SportivistaWidget.swift`, small-widget family) — do not
  go smaller; below the system caption size the tracking rules above stop
  reading as intentional letterspacing and start reading as broken kerning.
- **Clear space:** no numeric keyline exists today (none of the three
  surfaces reserves a measured margin around the lockup beyond ordinary
  layout padding) — treat the surface's own standard content inset
  (`SportivistaSpacing.l` = 16pt on iOS, `.wrap` padding on web, 16–22px) as
  the de-facto minimum clear space until a stricter rule is set.

## Misbruk (never do this)

- **Never italicise** the wordmark or the colon.
- **Never abbreviate** the wordmark ("SPRTVSTA", "SV:", initials). The full
  word is the mark; there is no short-form lock-up.
- **Never use the colon as inline punctuation in running text.** `"Se
  Sportivista: agendaen din"` is prose, not the mark — do not set the colon
  in accent amber there, and do not zero-gap it. The mark is *only* the
  `SPORTIVISTA:` lockup used as a standalone brand element (masthead,
  headers, icon), never mid-sentence.
- **Never recolour the dots/colon** to anything but `#FFB000` (dark) /
  `#9A6800` (light) — see `design/tokens.json` `color.accent`. Amber is the
  ONE accent (`DESIGN.md` § Grunnlov #4); the mark does not get its own
  separate brand palette.
- **Never add a gradient, glow, shadow, or outline** to the dots or the
  wordmark. Flat colour on flat background, matching `DESIGN.md`'s
  forbudsliste (no DIY glass/glow/shadow anywhere in the system). *Ett
  sanksjonert unntak (WP-152 iOS / WP-180 web):* det LIVE kolon-signalet bærer en
  myk amber-glød mens noe du følger sender NÅ — eier-godkjent og normativ i
  `DESIGN.md` § Bevegelse. Det hvilende merket er fortsatt flatt, og gløden
  forsvinner igjen når live er over.
- **Never change the two circles' relative size or spacing** without
  updating `kolonet.svg` AND re-running `generate-icons.swift` against every
  shipped size — a hand-edited one-off icon will drift from the vector.
- **Never pair the wordmark with the dot-icon inline** (rule 7 above) — pick
  one form per context, never both stacked together as if they were two
  separate logos.

## Tagline

**«Hele sporten. Ett rolig utsyn.»** — two short sentences, full stop after
each (not an ellipsis, not an exclamation — `DESIGN.md` § Cross-surface:
"Aldri utropstegn i kromet"). Used sparingly (App Store subtitle, onboarding,
marketing surfaces) — it is not part of the masthead lockup and does not
appear next to the wordmark in-product.
