# DEPTH: damage you can see, liveries, and the UI made plain

The demo's engineering depth: a ship's damage lands in places, you can see where, and below a hull band it costs
her something she can feel. With it, her own livery, and the UI's opaque pieces made plain. Three workstreams on
three branches off `telemetry` (itself off `seeds`), rebased together at the end: A `faults`, B `hud`, C `lobby`.
Never merge; rebase and commit often.

## The contract (A writes it, B and C read it)

`player.ts Status` gains, for the ship the camera follows (hers, or the one she watches):

- `zones: readonly [number, number, number, number]`: each zone's share of the hull damage taken since her hull was
  last above 40 (0..1, summing to at most 1), in the order `ZONES = ['rigging', 'rudder', 'waterline', 'deck']`.
- `faults: readonly [Fault, Fault, Fault, Fault]`, `Fault = 0 | 1 | 2` (none, minor, major), same order.
- `mending: boolean`: her water mending her hull now.

`snapshot.ts ShipDraw` gains `wear: 0 | 1 | 2` (hull above 40, 25–40, 25 or below) and
`faults: readonly [Fault, Fault, Fault, Fault]`, for every ship, so smoke and each zone's mark show on the bots too.

`ZONES` and `Fault` live in `player.ts` (the UI may not import sim/). Until A lands, B fills them from a debug
switch (`?zones=r,u,w,d&faults=a,b,c,d&wear=n`), which stays as a debug switch afterwards.

## A. Faults (sim, bots, harness)

**Zones.** Every hit that reaches her hull (past the shield: while her shield holds, no zone is harmed) is counted
against one zone, by where it struck her: aloft (above her deck) → rigging; her after third → rudder; her side low →
waterline; along her length (raking, within ~25° of her line) or plunging (mortar) → deck. Where the sim has no
height for a strike, the gun's kind leans it: scatter → rigging, mortar → deck, cannon / repeater / harpoon by bearing
(astern → rudder, else waterline). A ram counts against the rammed ship's waterline. Tallies clear when her hull
rises above 40.

**Bands.** Faults are a function of her hull and her tallies, not a separate state:

| Hull | Faults |
|---|---|
| above 40 | none |
| 25 < hull ≤ 40 | the most-hit zone minor |
| ≤ 25 | the most-hit zone major, the second minor |

| Zone | Minor | Major |
|---|---|---|
| rigging | top speed ×0.85 | top speed ×0.7 |
| rudder | turn ×0.8 | turn ×0.6 |
| waterline | top speed ×0.92 | a leak, 0.5 hull/s, never below 15, stopped while she mends |
| deck | reload ×1.2 | reload ×1.5 |

**Mending.** Five seconds without taking or dealing a blow, in her own water: her hull mends (some 2 hull/s) up to 25,
never past it, which lifts her out of a major fault but not a minor. Stores mend past it as now. Her shield in her own
water comes back faster: HOLDING.shield doubled to start, tuned by the harness. The scatter's rigging cut stays (4 s,
half speed), apart from the bands.

**Seam first.** Per-ship handling (her top, turn, reload as her own numbers, not the shared tables'), every result
bit-identical before any fault (cf. `manager-fix` Phase A step 2, `sim/fit.ts`; its `sim/wear.ts` and the old game's
`ae981b6:src/sim/parts.ts` are prior art for faults and hit location: read, don't merge).

**Bots.** A faulted bot wants mending more (purser), and her own water more; one whose rigging or rudder is faulted
can't run, so her will to flee falls and to fight rises when cornered. Pure, deterministic, her brain's own slice.

**Gates** (tools/harness report, pooled, --against the baseline): damage a minute within 2 se; longest lull no
longer; fault time a ship and comebacks from under 30 hull reported (new metrics), comebacks no rarer than before;
persona spread within 1 se. At most 3 tuning passes. Goldens re-recorded and named in the commit.

## B. The telemetry HUD and the damage on the ships (render, HUD)

**Vitals as telemetry** (Forza's damage readout, in the chart's hand). The top-left slip's two bars become a
top-down ship silhouette, inked, her four zones drawn as parts of her (masts and canvas across her middle; her
stern; her sides along the waterline; her deck from bow aft). Each zone washed from paper through ochre to vermilion
by its share; a faulted zone rubric, its fault's mark beside it (minor drawn, major filled). Her shield an azure
outline round her, its arc as full as her shield; her hull's numeral large, her shield's small. A hit: the struck
zone flashes and the silhouette jolts (a few px, ~250 ms, eased). A fault coming on: a bigger beat (a camera punch, a
timber crack's sound cue: audio.ts) once. Mending: a slow gold shimmer over her and a mark that she mends. Redrawn
only when what it shows changes. Drawn for the iPad Air: legible at arm's length, a thumb's clear of the stick.

**Shot from off the screen.** A blow on her from a ship off the screen or behind: an arc at the screen's edge at its
bearing (Moment.bearing), held 2 s, fading, as heavy as the blow. Replaces the rings round her that read as rings.

**Smoke.** Through the puffs (gunfire/puffs.ts), no new pass: a ship with wear 1 trails thin grey wisps, wear 2 a
dark column. Budgeted for the iPad Air at 30-40 fps: a cap on emitters, thinned with distance, none past sight.

**Faults on the 3D ships**, every ship's, from ShipDraw.faults, through the materials' and the ride's own public
inputs (no three.js hacks): rigging, her canvas darkened and holed or ragged (cloth/canvas inputs, if they allow it
cleanly; else darkened and slack); rudder, a yaw wobble in her ride; waterline, a list and spray at her side
(ride.ts heel); deck, smoke from her gun ports.

**The storm's mark.** The spiral becomes a lightning bolt: hollow while the storm holds, filled while it closes, on
the clock and the full map. As a closing begins, a bolt strikes at the edge (sky/storm-bolt.ts) and thunder rolls.

## C. The lobby: her livery, and the UI made plain

**Livery.** One set of liveries for every ship: COLOURS (eight dyes: vermilion and the six of play/colours.ts and one
more, none near the sea's blues and greens, the foam's cream or the storm's violet) × PATTERNS (plain, band, stripes).
Her choice is kept on the device (localStorage, every read and write in try/catch; vermilion plain by default). The
seed deals every bot hers from the same set (hash(seed, id)), never her colour: her colour is hers alone at sea. Her
water, her line on the sea and her mark on the minimap take her colour.

In the lobby: a paper disc at its foot (a dye pot or a sail swatch: drawn in the house hand) opens a slim folio
docked at the bottom, so her ship at anchor stays in view above it and changes as she taps: a row of eight daubs of
dye, a row of three small sails showing each pattern in the chosen dye, the chosen one gilt-ringed. While it is open
the camera eases round to her broadside. Tap outside or the close mark to close. Big targets (44 pt at least), no
words, nothing that shifts as she taps.

**The UI made plain** (from the UX audit):

- Seed chip: the seed's two-word name, a small pencil mark, so it reads as hers to change.
- Settings: look speed an eye with arrows (not a crosshair); the stats a small graph (not an hourglass).
- Seed panel: the match type's mark with its one word under it; the trait rows behind a long press on the fleet
  card; the standout captains a badge, not the spyglass.
- Sea held: her colour on a patch of waves for its mark; one number format (0.0%) everywhere.
- End banners: the same seed again a circular arrow (not the palm), a new seed dice (not the seed); the spyglass
  stays.
- Spectate: leaving an anchor (home to port), not the seed's disc.

## Review

Each branch, once its builder reports done, is read by a harsh reviewer who has not seen the builder's reasoning, only
the diff (`git diff telemetry...<branch>`), this file and CLAUDE.md. It is looking for:

- **Testable:** every rule in this file held by a test that would fail without it; pure arithmetic kept out of three
  and the DOM; no test that only re-states the code.
- **Clean:** no abstraction broken (the UI never imports sim/; a bot part reads only its own brain slice:
  tests/architecture-bots.test.ts); no three.js hacks; no dead switches; files under the repo's sizes; the house's
  comment style.
- **Deep:** small interfaces over much behaviour; no shallow pass-through modules; no logic duplicated across sim, HUD
  and render.
- **Honest:** gates measured, not asserted; numbers in the commits that the reviewer can reproduce.

The reviewer reports findings ranked by severity. The builder fixes every blocker and says why for anything left.
One round, a second only if a blocker remains.

## Done when

Each branch: `npm test` passes; the change seen in headless Chromium (tools/capture.ts, its ?screen and debug
switches) at the iPad Air's 1180 × 820, no console errors; frame cost no worse than seeds' on the same shots.
Rebased onto `telemetry` in order A, B, C, and built onto the iPad.
