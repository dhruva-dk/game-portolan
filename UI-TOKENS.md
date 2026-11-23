# UI tokens: draft, non-binding

A proposal for the one set of tokens the race (main's HUD and screens) and the manager's office share. Nothing here
is decided until it lands in code on main. Direction: **MM's layouts, drawn in the chartmaker's hand** (main's
`src/ui/ink.ts`). mm's office kit (`OFFICE`, `src/ui/kit/*`) is not a source: it is what this replaces.

## How this stays consistent with main

1. **One source of values.** Every colour is a constant in main's `ink.ts`. Tokens are role names onto those
   constants. A value the kit lacks is added to `ink.ts` on main first, never to a kit file.
2. **Main's marks, not copies.** Hand-cut paper is `roughRect`/`slip`; figures are `figure()`; icons are `glyph()`
   with `DEFS`' hatches; bars are `bar()`'s construction. A slip in the HUD and a letter in the office are the
   same edge.
3. **One scale rule.** Main sizes everything in drawn units times `--k` (`ui.ts size()`). The kit does too, with
   floors in CSS px where a size must not shrink (touch, small text).
4. **Main's meanings become rules**, written out below, and extended, never contradicted.
5. **Two layers.** Ink on paper is shared. Light on the world (`LIGHT`, the frame's `METER`) is the race's alone.
6. **Enforced.** The tokens module imports only `ink.ts`; an architecture test fails a kit or screen file holding a
   hex literal or a raw px size. Tokens live on main; mm rebases onto them.

## What main already uses (unwritten until now)

| What          | Value on main                                                                                | Where                            |
| ------------- | -------------------------------------------------------------------------------------------- | -------------------------------- |
| Scale         | drawn page 956 × 440; `k = min(h / 440, w / 680)`; iPad Air 1180 × 820 → **k = 1.735**       | `ui.ts` DRAWN, LEAST, size       |
| Edge margins  | gutter 16, inset 2 inside the safe area (units)                                              | `ui.ts` GUTTER, INSET            |
| Face          | Iowan Old Style, Palatino, Georgia; figures italic, weight 400                               | `ink.ts` FIGURES, figure         |
| Figure sizes  | 13, 15, 16, 17, 21, 23–26, 28 (units)                                                        | hud, vitals, fleet, globe, ends  |
| Words         | none: "numerals only" (the seed's name excepted)                                             | `screens.ts` header              |
| Paper         | parchment gradient `#pg` (f7eedb → f0e2c4 → dcc396); flat `PAPER`; `GILT` chosen; `CUT`      | `ink.ts`                         |
| Outlines      | 0.5 inner rule @ 55%; 0.9 slip and bar; 1.2 folio rule; 1.6 bold (banner, disc, bold slip)   | `slip`, `bar`, `folio`, `banner` |
| Inner rules   | slip: one, inset 3; folio: two, inset 10 (1.2) and 14 (0.5)                                  | `slip`, `folio`                  |
| Cut edge      | roughRect, a point every ~11 units, wander ±0.6                                              | `roughRect`                      |
| Shadow        | one: dy 1.5, blur 1.6, `SHADOW` @ 45%                                                        | `DEFS` #sh                       |
| Dim           | `SHADOW` @ 25% round a folio                                                                 | `folio`                          |
| Bar           | track `PAPER`, outline iron 0.9, fill a wash @ 85%, inset 1.5                                | `bar`                            |
| Hatch         | a −45° hatch per ink, normal (1.3) and dense (0.8) for glyphs ≥ 56                           | `DEFS` h-\*                      |
| Motion        | screens fade 320 ms, never cut; the needle settles on `cubic-bezier(.3,1.6,.5,1)` 0.9 s      | `ways.ts` FADE, `screens.ts`     |
| Touch         | only `.press` takes a touch; tap/hold/drag in `touch.ts`                                     | `ui.ts`, `touch.ts`              |
| The way on    | the banner (pennant) "every way on is drawn on"                                              | `screens.ts` banner              |
| Meaning marks | rose, rhumbs, laurel (a place), badge (a trait), spyglass, anchor (home), pencil (edit), die | `marks.ts`                       |
| Glyphs        | 17 woodcuts: HUD, weapons, items, menu                                                       | `glyphs.ts`                      |

## Decisions this needs (flagged)

| #   | Conflict                                                                                              | Proposal                                                                                                   |
| --- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| D1  | Main sizes in units × k; an office in CSS px would drift from the HUD on every other screen size.     | Kit sizes in units × `--k`, with px floors (touch 44 px, text 13 px).                                      |
| D2  | Main is wordless; the office is mostly words.                                                         | Add roman text styles to the type ladder. The HUD stays wordless.                                          |
| D3  | Main draws whole screens as SVG sheets; tables, scrolling and text need HTML.                         | Office layout in HTML/CSS; tokens emitted as CSS custom properties from `ink.ts`; main's marks set inline. |
| D4  | Two reds: rubric (harm) and scarlet (hers, her blood).                                                | Office uses rubric only. Scarlet stays the race's.                                                         |
| D5  | `RARITY` reuses `INK.green` and `INK.blue`, which also mean good and act.                             | Quality is shown in **washes** (light); meaning and action in **inks** (dark). Needs a purpure wash.       |
| D6  | Labels in sepia sit near 4.5:1 on parchment and below it on the sunk paper.                           | Add a darker second ink to `ink.ts` (about `#5e4631`, ~6:1 on `PAPER`).                                    |
| D7  | `PARCHMENT` and `METER.label` are private in `ink.ts`.                                                | Export them.                                                                                               |
| D8  | Main has no pressed or disabled state.                                                                | Add both (States, below), and use them in the HUD too.                                                     |
| D9  | 17 glyphs; the office needs ~45 subjects (13 tabs, 6 parts, 9 buildings, roles, mail kinds, actions). | Draw them as woodcuts in `glyphs.ts`; no second, line-drawn icon set.                                      |

## The tokens

Units are main's drawn units; iPad px = units × 1.735. CSS names in `code`.

### 1. Scale

| Token      | Value                  | Use                                     |
| ---------- | ---------------------- | --------------------------------------- |
| `--k`      | `ui.ts size()`         | every size below is multiplied by it    |
| `--u`      | `calc(1px * var(--k))` | one drawn unit                          |
| `--gutter` | 16u                    | screen edge to content (main's GUTTER)  |
| `--touch`  | `max(44px, 26u)`       | least side of anything that takes a tap |

### 2. Paper (surfaces)

| Token            | Value                                      | Use                                                                |
| ---------------- | ------------------------------------------ | ------------------------------------------------------------------ |
| `--paper`        | `PAPER` #f1e4c8                            | the sheet: panels, folios, the page's papers                       |
| `--paper-raised` | `PARCHMENT[0]` #f7eedb                     | a paper on a paper: card, input, letter, popover                   |
| `--paper-sunk`   | `blend(PAPER, PARCHMENT[2], .5)` ≈ #e6d3ad | a well cut into a sheet: table head, region, track of a list       |
| `--parchment`    | `#pg` gradient                             | hand-cut papers only (sheets, slips, folios), never behind a table |
| `--gilt`         | `GILT` #f3dfa8                             | chosen, hers, won: a row, a segment, a banner                      |
| `--cut`          | `CUT` #f4e8cf                              | paper showing through a woodcut                                    |
| `--plate`        | `INK.iron` #261910                         | a plate: ink laid solid under words (title bar, a card's headline) |
| `--plate-ink`    | `CUT`                                      | words on a plate                                                   |
| `--plate-faint`  | `METER.label` #b9a98c                      | labels on a plate                                                  |
| `--brass`        | `BRASS` #5b3a1e                            | the rim of a window onto the world (minimap, the 3D insets)        |
| `--dim`          | `SHADOW` @ 25%                             | the world round a folio or a modal                                 |

Rule: four papers and the plate. Nothing else fills a panel.

### 3. Ink (text and lines)

| Token      | Value               | Use                                                |
| ---------- | ------------------- | -------------------------------------------------- |
| `--ink`    | `INK.iron` #261910  | text, outlines, figures                            |
| `--ink-2`  | new, ≈ #5e4631 (D6) | labels, captions, a figure's unit                  |
| `--rule`   | iron @ 20%          | the line between rows                              |
| `--line`   | iron @ 55%          | inner rules, a track's edge (main's inner rule)    |
| `--on-ink` | `INK.white` #fcf6e6 | text on a solid ink (a button, a filled tag)       |
| `--halo`   | `figure({ halo })`  | a figure set on the world, not on paper (HUD only) |

### 4. Meaning (inks: solid, dark)

| Token     | Value                | Means, and only this                                  |
| --------- | -------------------- | ----------------------------------------------------- |
| `--act`   | `INK.blue` #264c8c   | you can do this: a button, a link, the needle         |
| `--harm`  | `INK.rubric` #b8301a | loss, damage, danger, a refusal, dismiss              |
| `--good`  | `INK.green` #3a683e  | gain, on target, sound                                |
| `--warn`  | `WASH.ochre` #c99a4a | under way, caution, running out (ink text on it)      |
| `--won`   | `INK.gold` #be8a2c   | stars, a win, a place earned                          |
| `--storm` | `INK.storm` #622e8c  | the Storm. Nothing else is violet.                    |
| `--note`  | `INK.sepia` #805e3e  | neutral emphasis: a number of something, no judgement |

Rule: a meaning ink on a thing says the thing's meaning. Decoration never uses one.

### 5. Quality ladder (washes: light, magnitude, no judgement)

One ladder for everything that is "how good": guns (main's `RARITY`), parts, stats, staff, facilities.

| Step | Name      | Wash (D5)               | Stat 0–20 | Text on it |
| ---- | --------- | ----------------------- | --------- | ---------- |
| q0   | silver    | `WASH.silver` #b4b8c2   | 0–5       | ink        |
| q1   | verdigris | `WASH.viridian` #4f9488 | 6–9       | on-ink     |
| q2   | azurite   | `WASH.azure` #4a78b8    | 10–13     | on-ink     |
| q3   | purpure   | new purpure wash        | 14–17     | on-ink     |
| q4   | gold      | `WASH.gold` #d4a84a     | 18–20     | ink        |

A stat of 4 is silver, not red: weak is not harm. The ladder's inks (`RARITY`) outline; its washes fill. On-ink
on verdigris is about 3.5:1, so text on a wash is large text only (`--fig-s` and up).

### 6. Team

| Token      | Value                            | Use                                                   |
| ---------- | -------------------------------- | ----------------------------------------------------- |
| `--team`   | the livery's first dye (`dyeOn`) | a strip at a row's left, a crest, a jacket, a pennant |
| `--team-2` | the livery's second dye          | the second band of the same                           |

Rule: a team's colours are never a ground or a text colour (27 liveries cannot all be read on).

### 7. Light (race only)

`LIGHT`, the frame's `METER`: flashes, glows, blows, the meter. The office never uses them.

### 8. Type

One face: `FIGURES` (Iowan Old Style, Palatino, Georgia).

| Token       | Units | iPad px | Style                                  | Use                             |
| ----------- | ----- | ------- | -------------------------------------- | ------------------------------- |
| `--t-label` | 7.5   | 13      | italic 500, `--ink-2`; floor 13 px     | labels, captions, table heads   |
| `--t-body`  | 8.5   | 14.7    | roman 500                              | text, table cells               |
| `--t-name`  | 10    | 17.4    | roman 600                              | a person's or thing's name      |
| `--t-head`  | 10    | 17.4    | roman 700, capitals, tracking .12em    | a panel's head                  |
| `--t-title` | 13    | 22.6    | roman 700, capitals, tracking .14em    | the screen's title, a plate     |
| `--fig-s`   | 15    | 26      | figure: italic 400, old-style numerals | a stat tile                     |
| `--fig-m`   | 17    | 29.5    | figure                                 | a key figure in a panel         |
| `--fig-l`   | 21    | 36.4    | figure                                 | the headline figure of a screen |
| `--fig-xl`  | 25    | 43.4    | figure                                 | HUD vitals                      |
| `--fig-xxl` | 28    | 48.6    | figure                                 | HUD counts                      |

Rules: figures alone are italic old-style (main's `figure`); figures in a column are roman **tabular lining** so they
line up; nothing under 13 px. The HUD uses the figures only (D2).

### 9. Space

| Token   | Units   | iPad px | Use                                  |
| ------- | ------- | ------- | ------------------------------------ |
| `--s1`  | 2       | 3.5     | inset (main's INSET), a figure's gap |
| `--s2`  | 4       | 7       | inside a control                     |
| `--s3`  | 6       | 10.4    | between items in a panel             |
| `--s4`  | 8       | 14      | panel padding; gap between panels    |
| `--s5`  | 12      | 21      | between groups                       |
| `--s6`  | 16      | 28      | the gutter                           |
| `--row` | 20 / 26 | 35 / 45 | a table row; a row that takes a tap  |

### 10. Edges and strokes

| Token          | Value                                     | Use                                                               |
| -------------- | ----------------------------------------- | ----------------------------------------------------------------- |
| `--edge-cut`   | `roughRect` edge, outline + shadow + rule | **paper things**: sheet, slip, card, letter, folio, stamp, button |
| `--edge-ruled` | straight rectangle                        | **data**: table, bar, chart, stat tile, gauge, well               |
| `--w-hair`     | 0.5u @ 55%                                | inner rule                                                        |
| `--w-fine`     | 0.9u                                      | slip outline, bar outline                                         |
| `--w-rule`     | 1.2u                                      | a folio's rule, a chosen thing's outline                          |
| `--w-bold`     | 1.6u                                      | bold slip, banner, disc, the screen's main paper                  |
| `--rule-in`    | inset 3u, `--w-hair`                      | every cut paper's inner rule                                      |
| `--rule-twice` | inset 10u `--w-rule` + 14u `--w-hair`     | formal papers: a contract, a modal, the folio                     |
| `--shadow`     | dy 1.5u, blur 1.6u, `SHADOW` @ 45%        | a paper lying on the world, or raised on another; never on data   |
| radius         | none; circles for discs and portraits     | nothing has rounded corners                                       |

Rule: **paper things are hand-cut, data is ruled.** It is main's own split (slips cut, bars straight).

### 11. Fills and patterns

| Token       | Value                                   | Use                                         |
| ----------- | --------------------------------------- | ------------------------------------------- |
| `--hatch`   | `DEFS` h-<ink> (dense at ≥ 56u)         | woodcut glyphs; a bar's fill under its wash |
| `--fill`    | a wash @ 85%, inset 1.5u (main's `bar`) | every bar and column                        |
| `--track`   | `PAPER` in a `--w-fine` outline         | an empty bar                                |
| `--stripes` | ochre stripes at −45°                   | work under way (a build, a scout, a design) |
| `--range`   | hatch between lo and hi, no fill        | a value not yet known: a scouted range      |

### 12. States

| State   | Look                                                                   |
| ------- | ---------------------------------------------------------------------- |
| chosen  | `--gilt` ground, `--w-rule` outline                                    |
| pressed | down 1u, shadow gone, 80 ms (D8)                                       |
| off     | 42% strength, deaf; the reason under it in `--t-label`                 |
| new     | a rubric paper disc with a figure (unread, notices)                    |
| unknown | the quality ladder hatched over its range; stars past the known hollow |
| busy    | `--stripes` as far as the work has got                                 |

### 13. Layers

world · dim · screen · piece · popover · folio and modal (over `--dim`) · toast · title (over all, main's z 3).

### 14. Motion

| Token      | Value                               | Use                                       |
| ---------- | ----------------------------------- | ----------------------------------------- |
| `--fade`   | 320 ms ease (`ways.ts` FADE)        | a screen in or out; screens never cut     |
| `--quick`  | 120 ms ease-out                     | press, popover, a tab                     |
| `--settle` | `cubic-bezier(.3,1.6,.5,1)`, 240 ms | a thing landing: a stamp, a needle, a pip |

Opacity and transform only. Nothing animates while the race's frame is being drawn.

### 15. Icons and marks

- **Glyphs** (`glyph()`): woodcuts, hatched in an ink with paper cuts; subjects (tabs, parts, buildings, roles,
  weapons). 20u and up. One set (D9).
- **Marks** (`marks.ts`): a meaning, wherever it appears: laurel = a place earned; badge = a trait; spyglass =
  scouting; anchor = home; pencil = editable; rose = the chart's own (title, a compass of stats).
- **The way on** is main's banner: Continue, Race, Sign. A gilt banner is the one way on of a screen.

### 16. Touch

`--touch` least side; only `.press` takes a touch (main's rule); tap, hold for the explanation popover, drag;
no hover states.
