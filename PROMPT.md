# Portolan: from battle royale to a racing-team manager you sail yourself

This is the brief for every agent working on Portolan from here on. Read all of it before changing anything. Where it
and the code disagree about what exists today, the code is right: say so and stop. Where it leaves something
undecided, section 2 says so: ask the owner, do not decide.

`CLAUDE.md` is the owner's and comes first. This file adds to it.

## 1. What the game is

Portolan today is a naval battle royale: the player sails a galleon on a small ocean planet against bots, picks up
guns from the water, claims sea by sailing loops, and survives a closing storm. That match is kept.

Around it we are building the depth of *Motorsport Manager* (PC, 2016), moved to this setting:

- **You manage a racing crew and sail one of its two ships yourself.** A race is one battle royale match.
- **Everyone is a seagull.** Captains, bosuns, shipwrights, pit crew, the chairman: anthropomorphic gulls. Every gull
  wears dark sunglasses at all times. There are no humans anywhere.
- **It is anachronistic and played straight.** Galleons are run like a modern motorsport team, with a glass factory,
  a test tank and a control tower. Nothing winks at the joke.
- **Three leagues of ten crews, two ships per crew, twenty ships in a race.** The champion is promoted and the last
  crew relegated.
- **Between races** you hire and fire, scout, design and improve ship parts, build facilities, sign patrons, vote on
  rules and answer events. The calendar runs in days.
- **Each race is on a different planet,** fixed for the season when it starts.

The player enjoys sailing and shooting. Nothing may make that worse.

## 2. Decisions

### 2.1 Settled by the owner

| # | Decision |
|---|---|
| D1 | The look is `art/target/race.png`: two-tone toon shading, a sea-chart palette, clear shallows, no photo textures. |
| D2 | The UI is parchment with inked serif type and woodcut icons, the existing chartmaker's hand (`src/ui/ink.ts`). |
| D3 | The management UI copies Motorsport Manager's structure: a navigation bar across the top, a dashboard as home, date, money and Continue at top right. Controls are sized for a finger. |
| D4 | The target device is the iPad Air with an M1, at 30 to 40 frames a second (`CLAUDE.md`). The phone is no longer the target. |
| D5 | Territory stays. A crew's held water is its pit. |
| D6 | The rank seals, the career level and the rank screen are deleted. |
| D7 | Three leagues, ten crews each, two ships per crew, twenty ships a race. Champion up, last place down. |
| D8 | The player always sails ship one of their crew. Ship one has no captain stats. |
| D9 | A sunk ship is out of the race. No respawn. |
| D10 | No practice, no qualifying, no race-day setup tuning. Race day goes straight to the race. |
| D11 | Parts development has Motorsport Manager's depth: six parts, performance and reliability, components, risk, carry-over to next season. |
| D12 | The pit crew ("the flight") are gulls who fly to a ship in her crew's water and restore things. They can botch a job, which slows it. |
| D13 | Ship speed doubles. Turn rate, ramming thresholds and Gust scale with it. Gun range and muzzle speed stay. |
| D14 | The arena is made small by the storm, which starts already closed round part of the planet. The planet's radius does not change. |
| D15 | Headless race runs report numbers. They gate nothing about feel. The owner judges feel on the device. |
| D16 | Every stat shown on a gull changes what the sim does. |
| D17 | Unscouted gulls show a range of stars. Hiring is a negotiation. Rival crews hire, poach and age under the same rules. New gulls arrive each season and old ones retire. Pay captains exist. |
| D18 | Races the player does not sail are played by the real sim, headless. No result is rolled from ratings. |
| D19 | Choices are presented as cards (three parts, three candidates, a dilemma's options). There is no deck played during a race. |
| D20 | Home is a dashboard. The rookery (the crew's campus, on its own planet seen from orbit) is one screen. |
| D21 | Points: the top ten ships score 25, 18, 15, 12, 10, 8, 6, 4, 2, 1; one point per sinking; one point to the crew holding the most sea when the race ends. |
| D22 | One currency. |
| D23 | The elder (chairman) can dismiss the player, who then takes another crew's offer and the save continues. |
| D24 | The save is an append-only journal with checksummed snapshots and a backup. |
| D25 | The work must show engineering fundamentals: edge cases, crash consistency, failure handling, backups. |
| D26 | Clean architecture first. No three.js hacks, no reaching past a library's public interface, no workarounds kept. |
| D27 | The layout page is 1180 × 820 CSS px (the iPad Air in landscape), scaled to fit. |
| D28 | The world is drawn at 1.0 × CSS size to start. It is raised only after the owner measures headroom on the device. |
| D29 | If the app is killed mid-race, on relaunch the race is offered again from its start, on the same planet and plan. |
| D30 | The currency is "Coin". |
| D31 | Contracts, negotiation, patience and the star formula are as section 6.3 and 6.1 have them: our own design, not Motorsport Manager's numbers. |
| D32 | The rookery's buildings are the nine of section 6.6. |
| D33 | Flight gulls have contracts and wages like everyone else. |
| D34 | `frame.dispose` is added to the names test `f2` lets callers use, with a comment saying why (section 5.10). |
| D35 | A crewmate's water counts as a ship's own for closing a loop. The cells' owner does not change. |
| D36 | The other leagues' races run in a Worker, one at a time, while the player's race is drawn. If `npm run hitch` or the device shows a cost, they run after the result instead. |
| D37 | The top bar has eight tabs. Standings and the Admiralty share the League tab; the ledger and patrons share Finance. |

### 2.2 Still open: both need the owner's eyes, and neither stops Phases 0, A or B

| # | Question | What agents do until the owner answers |
|---|---|---|
| Q4 | Final palette and the approval of the UI's look. | Use the values in `PROMPT-art.md` and section 7's grammar. Phase C's first screen (`home`) and each step of Phase D are shown to the owner as captures before the next is started. |
| Q6 | Race length and season length. | About five minutes and ten races, from section 5.5's starting values. The owner tunes them on the device. |

### 2.3 Rules for deciding

- A change of design is discussed with the owner before it is started.
- Conventions (what a screen shows, what a ship starts with) are asked, one at a time, with a recommendation.
- Numbers marked *starting value* are to be tuned by the owner on the device. Put each in one named table.

## 3. What exists today and must be kept

32,000 lines of TypeScript, 308 passing tests. **Do not rewrite a module that is listed here.** Change it only as
section 5 or 9 says. If a task seems to need a rewrite of one, stop and ask.

### 3.1 Layers (enforced by `tests/architecture.test.ts`)

| Part | What it is | May import |
|---|---|---|
| `src/world/` | The planet, the sphere's arithmetic, seeded random, sun, wind, weather, the sea's long waves. Pure, headless, deterministic. | itself |
| `src/sim/` | The rules of a match: sailing, contact, guns, shot, health, loot, storm, territory, bots. Pure, headless, deterministic, fixed step of 1/30 s. | `sim/`, `world/`, `kinds.ts` |
| `src/play/` | Runs the sim for a match and says what to draw and show, as plain data. Touches no DOM. | `play/`, `sim/`, `world/`, the seams |
| `src/snapshot.ts` | Seam: what the frame draws each frame. | |
| `src/player.ts` | Seam: what passes between the game and the UI (hands in, status out). | |
| `src/environment.ts` | The world built for a planet seed (planet, wind, climate). | `world/` |
| `src/frame.ts` | The only owner of the renderer, the camera and every GPU pass. | the render folders |
| `src/view/ sky/ land/ water/ ship/ gunfire/ loot/ post/` | What draws the world, in three's TSL node materials. | see the test's table |
| `src/ui/` | The DOM and SVG laid over the canvas. Imports nothing from `play/`, three or a render folder. | `ui/`, seams, `world/` |
| `src/audio/` | All sound, synthesized. | `audio/`, seams, `world/` |
| `src/main.ts` | Wires everything. The only file that may import anything. | all |
| `src/debug.ts` | Every debug switch, read from the page's query. | see the test |

### 3.2 The match, kept as it is

| Feature | Where | Notes for this work |
|---|---|---|
| Fixed-step clock | `sim/fixed.ts` | `STEP = 1/30`. Keep. |
| Sailing | `sim/ship.ts`, `sim/shoal.ts`, `sim/ride.ts` | `step(s, helm, dt, depth)` reads the global `SHIP` table. Section 5.3 gives it per-ship handling. |
| Tuning tables | `sim/handling.ts` | `SHIP`, `RAM`, `HEALTH`, `HOLDING`, `GUST`, `GUNS`, `FALLOFF`, `GUN`. These become the *spec* values every ship starts from. |
| Hull contact and ramming | `sim/contact.ts` | Keep. |
| Guns, two slots, five kinds, five rarities | `sim/gun.ts`, `sim/battle.ts`, `sim/shot.ts`, `sim/sight.ts` | Keep. Aim assist included. |
| Hit points | `sim/health.ts` | 100 hull behind 100 shield; shield starts at 0. |
| Loot and the hold | `sim/loot.ts`, `sim/hold.ts`, `sim/stores.ts` | Every ship starts with nothing. Keep. |
| Gust | `sim/gust.ts` | Two charges. Keep. |
| Storm | `sim/storm.ts` | Seven phases from the whole planet. Section 5.5 makes the plan a parameter. |
| Territory | `sim/territory.ts`, `sim/enclose.ts`, `sim/holding.ts`, `world/cells.ts` | Ownership is per ship. Section 5.2 adds the crew. |
| Spawning | `sim/spawn.ts` | `berths(water, seed, count, depth)` spreads ships over the whole planet. Section 5.5 confines it. |
| Bots | `sim/bot.ts`, `captain.ts`, `helmsman.ts`, `gunner.ts`, `purser.ts`, `claimer.ts`, `route.ts`, `utility.ts`, `temper.ts` | A bot is a pure function `think(own, others, sea, memory, seed)`. `temper(seed)` draws one of six styles plus skill and mood. Section 5.4 feeds it from a captain's stats. |
| Match course | `sim/match.ts`, `play/referee.ts` | `SHIPS = 80`, `PLAYER = 0`, placing, spectating. Section 5.1 and 5.6 change these. |
| Match state | `play/state.ts` | `createState(planet, sea, waters, first)`, `start(match, manned)`, `advance(helm, gun, ask)`. Already runs whole matches headless (`tools/matches.ts`). |
| The game view | `play/game.ts`, `chase.ts`, `arrival.ts`, `finale.ts`, `shake.ts`, `stops.ts`, `moments.ts` | Stick steering, chase camera, descent from space, hit-stop. Keep. |
| Match setup | `play/setup.ts`, `play/sounding.ts` | Sounds the planet's water in a Worker; deals matches by seed. |

### 3.3 Rendering, kept unless section 9 changes it

| Feature | Where |
|---|---|
| Sphere view, charts | `view/` |
| Atmosphere, sky, volumetric clouds | `sky/atmosphere.ts`, `tables.ts`, `sky.ts`, `clouds.ts`, `cloud-field.ts` |
| The one lighting function every surface uses | `sky/light.ts` (`createLighting`: `light(p, n)`, `light.glossy`, `light.rim`) |
| The storm drawn as violet cloud, rain and lightning | `sky/storm.ts`, `storm-field.ts`, `storm-bolt.ts` |
| Water: waves, clear shallows, caustics, foam, wakes, territory lines and tint | `water/` |
| Seabed, sea-floor stones | `land/seabed.ts`, `land/strewn.ts` |
| Islands: ground, rocks, palms, shrubs, one shadow map | `land/`, shapes from `world/planet-islands.ts`, `world/island-shape.ts`, `world/scatter.ts` |
| The galleon, generated in code, three levels of detail, GPU cloth sails | `ship/` |
| Ships' colours: hull paint, sail dye, pattern | `play/colours.ts`, `snapshot.ts` `Look` |
| Guns' balls, smoke, splashes | `gunfire/gunfire.ts` |
| Loot floating as the gun itself under a beam | `loot/loot.ts` |
| Post chain: bloom, shafts, AgX grade with a look table, film grain | `post/`, composed in `frame.ts` |

### 3.4 UI and sound, kept

| Feature | Where |
|---|---|
| UI layer and tap handling | `ui/ui.ts` (`uiLayer`, `piece`, `onTap`, `fade`) |
| The chartmaker's hand: inks, paper, slips, bars, rings, figures, woodcut glyphs | `ui/ink.ts`, `ui/glyphs.ts` |
| Compass rose and laurel | `ui/marks.ts` (`rose`, `laurel`, `rhumbs`) |
| Match HUD, minimap, hit marks, flashes | `ui/hud.ts`, `minimap.ts`, `disc.ts`, `held.ts`, `isles.ts`, `hits.ts`, `flash.ts`, `juice.ts` |
| Touch stick and look | `ui/input.ts`, `ui/stick.ts` |
| Full map: the live planet from space in a parchment window | `ui/globe.ts` |
| Screens as a table of ways | `ui/ways.ts`, `ui/flow.ts` |
| Parchment passage between a match and home | `ui/passage.ts` |
| Cross-fade on PLAY | `ui/veil.ts` |
| Result panels over the live world | `ui/ends.ts` |
| All sound | `audio/` |

### 3.5 Deleted by this work (D6)

- `play/placeholder.ts` and its row in the architecture test's `STAND_INS`.
- `Career` in `player.ts`; `Careers` in `ui/flow.ts`.
- The `rank` screen: its entry in `SCREENS`, `WAYS`, `TAPS`, `createRank` in `ui/screens.ts`.
- `seal`, `TIERS`, `levelRing`, `plate` in `ui/marks.ts`.
- The lobby screen, replaced by the dashboard (section 7).

### 3.6 The old game

Commit `ae981b6` is the previous battle royale. `README.md` lists features it had that this game lacks. Its parts
damage (`src/sim/parts.ts` there) is a reference for section 5.7. Port rules and numbers; rewrite code to this
architecture.

## 4. Architecture for the new work

### 4.1 New parts of `src`

| Part | What it is | May import |
|---|---|---|
| `src/career/` | The management game: gulls, crews, contracts, parts, facilities, money, rules, calendar, standings. Pure, headless, deterministic. No DOM, no three, no `Date`, no `Math.random`. | `career/`, `world/random.ts`, `race.ts`, `office.ts`, `kinds.ts` |
| `src/race.ts` | Seam between the career and a match: the `RaceCard` that goes in and the `RaceResult` that comes out, and the plain types both sides share: `CaptainStats`, `Handling`, `Colours`, `Rules`, `StormPlan`. Plain data, no logic. | `kinds.ts`, `world/` |
| `src/office.ts` | Seam between the career and the UI: the view models the screens draw and the `Command` union the screens send. Plain data. | `kinds.ts` |
| `src/store/` | Persistence adapters (IndexedDB in the app). The port they implement is `career/store.ts`. | `store/`, `career/store.ts` |
| `src/campus/` | Draws the rookery's buildings on its planet. A render folder like `land/`. | as `land/` |
| `src/palette.ts` | The world's colours, linear RGB, named once. A leaf. | nothing |

Add a row to `LAYERS` in `tests/architecture.test.ts` for each, and extend test `g` (deterministic and headless) to
`career/`. `ui/` gains `office.ts`; `play/` and `sim/` gain `race.ts`. Neither `ui/` nor `play/` imports `career/`,
and `career/` imports neither. `main.ts` wires them.

`snapshot.ts` keeps `Look` (what is drawn). `play/colours.ts` makes a ship's `Look` from her crew's `Colours`.

**Who runs a race.** The career never runs one. It only says which races are due and takes their results.

- `play/race.ts` (new): `runRace(card, planet, waters): RaceResult`, a pure function over `createState`, with no DOM.
  It sails every ship by bot on a flat sea, as `tools/matches.ts` does today. That tool's header says the waves only
  lift the drawn ships; confirm no rule reads the sea's height before relying on it, and say so if one does.
- `play/league.ts` (new): a module Worker, like `play/sounding.ts`. Given a `RaceCard` it builds the planet for the
  card's seed, sounds its water, calls `runRace` and posts the `RaceResult`.
- `main.ts` asks the career which races are due, starts the Worker for each unsailed one, and sends a `RecordRace`
  command for each result.
- `tools/season.ts` calls `runRace` directly in node.

### 4.2 The career is a reducer over a journal

- **State.** One immutable `CareerState` value holds the whole world: every gull, crew, contract, part, building,
  the calendar, the standings, the rules, the inbox, and the random streams' counters.
- **Commands.** Everything the player does is a `Command` (plain data, defined in `office.ts`): `SignPatron`,
  `OfferContract`, `StartDesign`, `Advance`, and so on. `apply(state, command)` returns a new state or a typed
  refusal (`{ ok: false, reason }`). It never throws for a bad command.
- **Time.** `Advance` moves the calendar to the next event (a design finishing, a negotiation answer, race day) and
  applies everything due, rival crews' decisions included.
- **Randomness.** Each stream is `random(hash(worldSeed, streamName, counter))` from `world/random.ts`. Counters live
  in the state. The same state and command always give the same result.
- **Races.** On race day `Advance` stops: the state lists the round's three `RaceCard`s as awaited. `RaceStarted`
  marks the player's race begun. Each race's `RaceResult` arrives from outside in a `RecordRace` command, the
  player's from the sailed match and the others' from the headless Worker. The round closes, and `Advance` works
  again, when all three are recorded. A headless race is a pure function of its card, so a result lost to a crash is
  made again.
- **Journal.** Every applied command is appended to the journal with a sequence number. The state is, by definition,
  the journal replayed from the world seed. A test asserts this for a long random session.

### 4.3 Persistence and crash consistency (D24, D25)

`career/store.ts` defines the port:

```ts
interface Store {
  append(entries: readonly Entry[]): Promise<void>;   // atomic: all or none
  snapshot(at: number, state: Bytes, sum: string): Promise<void>;
  load(): Promise<{ snapshot: { at: number; state: Bytes; sum: string } | null; entries: readonly Entry[] }>;
  backup(): Promise<void>;                             // copy the current save aside
  restore(): Promise<boolean>;                         // from the backup
}
```

- **Serialization.** An entry and a snapshot are canonical JSON (object keys sorted, no whitespace), so `Bytes` is a
  string. The checksum is 32-bit FNV-1a over that string, written in `career/`: it detects corruption and is not
  security. No library and no Web Crypto, so the career stays synchronous and headless.
- **Entries** carry `seq`, the command, and a checksum chained from the previous entry's.
- **Snapshots** are taken every 50 entries and at each race's end. They are an optimisation only: loading verifies
  the snapshot's checksum, replays the entries after it, and verifies the chain.
- **Recovery order on load:** valid snapshot plus valid tail; else replay the whole journal; else the backup; else
  tell the player plainly and offer a new career. Never start a new career silently.
- **A torn tail** (the last entry incomplete or failing its checksum) is dropped, and the player is told what was
  lost.
- **Versions.** The save carries a schema version. Each bump ships a pure migration with a test that loads a saved
  fixture of the old version.
- **Adapters.** `store/indexed.ts` for the app (one IndexedDB transaction per `append`), an in-memory adapter for
  tests, and a fault-injecting adapter that fails or truncates at a chosen write.
- **Tests required:** kill at every write position of a scripted session and reload; corrupt each byte class
  (entry, snapshot, checksum) and reload; a migration fixture per version; replay equals state.

No new runtime dependency is added for any of this. The dependencies stay three and Capacitor.

### 4.4 Rules that apply to all new code

- **No three.js hacks** (test `d`): no `onBeforeCompile` or render hooks, no `.prototype` patching, no private
  (`_x`) or `.backend` access, no deep `three/src` imports, no cast through `unknown`, no `any`, no `@ts-ignore`.
  If three cannot do something cleanly, stop and bring the choice to the owner.
- **Passes, the renderer and the camera live in `frame.ts` only** (tests `c`, `f`, `f2`).
- **450 lines a file** (test `b`). Split by responsibility, not by line count.
- **No exported mutable bindings** (test `e`).
- **`play/` touches no DOM** (test `i`). **`ui/` imports no `play/`, three or render code** (test `i2`).
- **Debug switches only in `debug.ts`** (test `h`).
- **No words of temporary work** in `src` (test `j`): no TODO, placeholder, workaround, "for now".
- **The sim holds nothing that exists only to be drawn.**
- **No gate is weakened to land work.** A margin that must move is moved with a comment saying why.
- **Every rule in `career/` and `sim/` has a unit test.** Tests use seeds, never wall-clock time.
- **Property tests** for the career: random command sequences never take coin below the debt floor, never let a
  race start with a ship that has no one to sail her (section 6.1), never break the journal chain.

### 4.5 Performance rules

- The frame budget is `npm run budget`: at most 100 draws, 900k triangles, 20 passes.
- `npm run hitch`: at most one frame over 50 ms and four over 33 ms.
- Work that does not need the live match's state runs in a Worker, as `play/sounding.ts` and `land/bake.ts` do:
  other leagues' races, save compaction, world generation. One such Worker at a time while a race is drawn (D36).
- The race holds 30 to 40 frames a second on the iPad Air M1 (D4). Only the owner can measure that; say so plainly
  when a change may cost frames, and never claim a device result from the Mac.
- Work on the live match's state stays on the main thread in slices of at most 8 ms a frame: Skip to result
  (section 5.6).
- Management screens are DOM. They must not run a layout pass while a race is being drawn.
- Lists longer than a screen (the market, standings) render only the rows in view.

### 4.6 Gates

Before pushing: `npm test`, `npm run build`, and whichever the change touches of `npm run budget`, `npm run hitch`,
`npm run steps`, `npm run audio`, `node tools/matches.ts 3`. Headless Chrome only, through `tools/`. Leave no process
running. One action per shell call. Commit and push to `main` often, with linear history.

## 5. Changes to the race

Each of these is a change to existing code. Keep every existing test passing or update it with the rule it now
checks.

### 5.1 Fleet size is a parameter

- `SHIPS = 80` in `sim/match.ts` becomes a field of the match (`Match.ships`, 20 for a race). Everything that reads
  `SHIPS` takes the count from the match: `play/state.ts` `start`, `play/setup.ts` `watersOf` (the count it posts to
  the sounding Worker), `main.ts` `RELEASE.drawing.fleet`, and `debug.ts`.
- The frame's fleet size is fixed when the frame is made (`FrameOptions.fleet`): make it for 20.
- `PLAYER = 0` stays. The player's ship is id 0 in every race she sails. `play/state.ts` branches on it in three
  places; keep them.
- `tools/matches.ts` takes the count as an argument.

### 5.2 Crews

- A `RaceCard` (in `race.ts`) has the planet's seed, the `Rules`, the `StormPlan`, and the ships:
  `{ id, side, colours, handling, captain, flight, orders }`. Ships `2k` and `2k + 1` are side `k`. In the player's
  league's race, ship 0 is the player's and her `captain` is null: she is never sailed by a bot (the race is always
  sailed, and Skip to result is offered only once she has sunk). Every other ship has a captain.
- **The name.** `sim/battle.ts` already exports `Crew` (one ship's health, guns, hold and gust). In `sim/` and
  `play/` the pair of ships is a **side**, never a crew. "Crew" is the career's and the screens' word.
- **No friendly fire.** A ball that meets a hull of her own side stops and does no damage. A shell's splash
  (`sim/battle.ts`) spares her own side. A ram between ships of one side does no damage; the hulls still push apart.
- **Bots** never choose a ship of their own side as a target, and aim assist never lays on one. `Seen` in
  `sim/captain.ts` gains `side`.
- **Side water.** Cells stay owned per ship. `Waters` in `sim/holding.ts` gains what it needs for `atHome` to be
  true in water held by either ship of her side; shield regeneration and the home speed bonus apply there. In
  `sim/territory.ts` a ship of her side crossing a trail does not cut it, and in closing a loop her side's water
  counts as her own, the cells' owner unchanged (D35).
- **Colours.** Both ships of a side share hull paint and sail dye. Ship `2k` carries the `plain` pattern and ship
  `2k + 1` the `band`, so the two are told apart. `play/colours.ts` makes each `Look` from the card.

### 5.3 Per-ship handling

Today every ship reads the global `SHIP`, `HEALTH` and `GUNS` tables. Parts need each ship to have her own numbers.

- `Handling` (in `race.ts`) is `{ top; gather; turn; answer; hull; spread; reload }`. `top`, `gather`, `turn`,
  `answer` and `hull` are absolute values. `spread` and `reload` are multipliers (1 is spec) applied on top of the
  gun's kind and rarity, which stay as they are.
- Add `sim/fit.ts`: `SPEC: Handling`, built from the existing tables with `spread` and `reload` at 1.
- **Her own `top`** is read by `sim/ship.ts` `step` and `bite`, `sim/ride.ts`, `sim/helmsman.ts` and
  `sim/claimer.ts`. **The spec's `top`** stays in what is worked out once for all ships: `BOT.outrun` and
  `BOT.outran` in `sim/captain.ts`, and the sound's copy in `audio/listen.ts`.
- **Her own `hull`** is her most hull: in `sim/health.ts`, the storm's damage as a share of a hull
  (`sim/battle.ts`), the HUD's `hullMax` (`play/game.ts`), and what a bot takes a full hull to be (`sim/bot.ts`). The
  items' fixed amounts in `sim/hold.ts` stay, capped at her most.
- Constants that are not one of those seven stay global.
- `play/state.ts` holds each ship's `Handling` from the `RaceCard`.
- With every ship on `SPEC`, every existing test and `tools/matches.ts` must give results identical to the bit to
  those before this change. Keep each expression's order of arithmetic so they do. Land this first, in its own
  commit, before any number moves.

### 5.4 Captains drive the bots

A captain has nine stats, each 0 to 20 (`CaptainStats` in `race.ts`; section 6.1). `sim/temper.ts` gains
`temperOf(stats, style)` beside `temper(seed)`. Today `think` in `sim/bot.ts` makes the temper from the seed every
step: it takes the temper as an argument instead, made once when the ship is launched, and `Sea` gains the match's
clock and length for Stamina. For a stat `x`, write `u = x / 20`.

Today one number, `Temper.skill` (0.35 to 0.9), is read in about a dozen places across `bot.ts`, `gunner.ts`,
`helmsman.ts`, `purser.ts`, `claimer.ts` and `utility.ts`. Each read moves to the stat named below. Any read not
named keeps a general `skill`, which is the mean of Gunnery, Helm and Lookout over 20. `Temper.aggro` comes from
Nerve.

| Stat | What it changes | Where |
|---|---|---|
| Gunnery | Shot spread, aim error and weave: every read of `skill` in `sim/gunner.ts`, by its present formulas (`GUNNER.unsteady` and the rest) with `u` in place of `skill`. | `sim/gunner.ts` |
| Helm | Every read of `skill` in `sim/helmsman.ts`, and seeing a ram coming and evading it in `sim/bot.ts`. | `sim/helmsman.ts`, `sim/bot.ts` |
| Seamanship | How fast her parts wear in a race (section 5.7). | `sim/wear.ts` (new) |
| Nerve | `Temper.fight` and the hull she runs at (`Temper.run`). | `sim/temper.ts` |
| Consistency | Her form for a race: one seeded draw per race shifts all her stats by up to `±3 × (1 − u)`. | `career/form.ts`, applied to the `RaceCard` |
| Stormcraft | `Temper.margin`: a better captain keeps a smaller margin and is caught outside less. | `sim/temper.ts` |
| Stamina | After the race's midpoint her effective Gunnery and Helm fall by up to `4 × (1 − u)` points by the end. | `sim/temper.ts`, by the match clock |
| Feedback | Extra improvement points to one part after the race (section 6.5). | `career/yard.ts` |
| Lookout | `Temper.notice` and how soon she answers being shot. | `sim/temper.ts` |

Each captain also has a **style**, one of the six that `temper.ts` already has (hunter, homesteader, raider, turtle,
scavenger, brawler). It sets the loot, mending, claim and standoff numbers, and is shown as a trait.

For each stat there is a test: two otherwise identical captains, one at 4 and one at 16, run across at least 50
seeded headless races, differ in the expected direction on the measure that stat should move (D16).

### 5.5 Speed and the arena (D13, D14)

- `SHIP.top` 13.5 → 27. `SHIP.turn` 0.47 → 0.94 and `SHIP.answer` scaled to match, so the turning circle is
  unchanged. `RAM.least`, `RAM.past`, `RAM.damage`, `GUST.speed`, `GUST.accel`, `GUST.shed` scale as their comments
  say they were derived (shares of top speed). `GUNS` is untouched.
- Bots' constants that are shares of `SHIP.top` follow by themselves. Those that are metres or seconds chosen for
  the old speed (`BOT.feel`, `BOT.run`, `BOT.letGo`, the roam distances) are reviewed one by one with
  `node tools/matches.ts` before and after.
- The storm's plan becomes a parameter: `createStorm(seed, depth, plan)`, with a `StormPlan` in `race.ts`. Today the
  first cap is the whole planet; a plan gives an opening radius in its place, and the storm is already there at the
  race's first second.
  *Starting values:* opening radius 480 m, damage 0.03 of a hull a second outside it, then phases

  | wait | close | radius | damage |
  |---|---|---|---|
  | 30 | 20 | 300 | 0.03 |
  | 25 | 16 | 180 | 0.05 |
  | 20 | 12 | 100 | 0.07 |
  | 20 | 10 | 55 | 0.09 |
  | 15 | 8 | 25 | 0.12 |

  That is about three minutes to the last cap; the rising damage after it ends the race. The target length is the
  owner's to set on the device (Q6).
- `berths` in `sim/spawn.ts` and `strewn` in `sim/loot.ts` place ships and loot inside the opening cap only. The
  sounding Worker (`play/sounding.ts`) is sent the opening cap with the count. Loot count scales with the cap's
  area.
- Report race length, time to first shot and how ships sank from `tools/matches.ts`. Gate nothing on them (D15).

### 5.6 How a race ends and scores

- The race ends when the ships afloat all belong to one side, or none are afloat. `stepMatch` in `sim/match.ts`
  sets `over` by that rule; today it waits for one ship or none.
- **Finishing order:** ships are placed by the order they sank, last sunk highest. Ships afloat at the end take the
  top places, ordered by sinkings credited, then that ship's own share of the sea, then lower id.
- **Points** (D21) are computed in `career/`, not in the sim, from the `RaceResult`:
  `{ order: id[], sinkings: {by, id, cause}[], seaHeld: {id, share}[], faults, flightStops, seconds }`. The sea-held
  point goes to the side whose two ships' shares sum highest at the end; a tie gives no point.
- When the player sinks, the ship she watches first is her crewmate if afloat, else as `next` in `sim/match.ts`
  chooses today. A **Skip to result** button finishes the race on the main thread (`state.advance` in slices of at
  most 8 ms a frame, the world still drawn) and shows the result.
- `sim/match.ts` keeps its phases. `won` now means the race ended with the player afloat.

### 5.7 Parts in a race

- Six parts feed the seven `Handling` numbers:

  | Part | Handling | Fault when it fails |
|---|---|---|
  | Sails | `top` | Torn: top speed × 0.7 |
  | Rigging | `gather` | Fouled: acceleration × 0.5 |
  | Rudder | `turn`, `answer` | Jammed: turn × 0.6 |
  | Hull | `hull` | Sprung plank: 1 hull point lost a second |
  | Keel | `spread` | Loose ballast: spread × 1.5 |
  | Gun mounts | `reload` | Seized: reload × 1.5 |

- **Performance** is 0 to 1000. A part's number is `spec × (1 + 0.15 × performance / 1000)` (*starting value*); for
  `spread` and `reload`, where less is better, `1 − 0.15 × performance / 1000`. `career/` works this out and puts
  the result in the card's `Handling`.
- **Wear.** `sim/wear.ts`: each part has a condition, 1 at the start. A second it falls by
  `(1.5 − u) / 600`, `u` her captain's Seamanship over 20 (the player's ship: 0.5), and by 1/200 for each hull point
  she loses. *Starting values.*
- **Failure.** At the start each part draws a threshold, uniform in `[0, 1 − reliability]`, seeded from the match
  seed, the ship's id and the part. The part fails when its condition falls below it. A part of reliability 1 never
  fails.
- **A fault** multiplies her `Handling` as the table says, in the sim's state for that ship, until the flight
  repairs it. Repaired, the part's condition is set to its threshold plus 0.2.
- The sim reports a fault and a repair as its own plain events, as it reports blows today. `play/moments.ts` turns
  them into `Deed`s (new kinds `faulted` and `repaired` in `player.ts`) for the HUD and the sound.

### 5.8 The flight (D12)

- One button on the HUD, enabled while the player's ship is in her crew's water and not already being served.
- The flight arrives after 4 s (*starting value*) and works while she stays in crew water. Leaving, or losing the
  water under her, ends the stop.
- Four jobs, done one at a time in the order set in the race plan; a job with nothing to do is passed over. With
  `r` the gull's rating over 20 and `k = 0.5 + r` (*starting values*):

  | Job | What it does | Rate |
  |---|---|---|
  | Mend hull | Hull points, up to her most | `8 × k` a second |
  | Gust | One charge at a time, up to `GUST.charges` | one every `3 / k` s |
  | Stores | Puts one repair kit in an empty item slot, once a stop | after `5 / k` s |
  | Part | Repairs one failed part | after `6 / k` s |

- **Botch.** When a job starts, one seeded draw: the chance is `0.25 × (1 − r) + 0.25 × fatigue / 100`. A botch
  pauses that job for 3 s (*starting value*). It never damages the ship.
- **Fatigue** is 0 to 100, kept in the career. A gull gains 25 for each race in which they worked, and loses
  `10 × (1 + flight loft level)` a day.
- Bots call their flights by the same rule, through a new option in the bot's utility list.
- The rules live in `sim/flight.ts`. The gulls are drawn later (section 9); the first version shows the stop on the
  HUD only.

### 5.9 Orders to the second ship

- Set before the race in the race plan: one of *hunt*, *hold water*, *loot first*, *shadow me*. Each is a set of
  weights on the bot's existing options.
- One HUD button in the race toggles her between *with me* (shadow) and her plan.

### 5.10 A new planet per race

Today `main.ts` builds one world and one frame for the page's life. A race on a new planet needs both rebuilt.

- `main.ts` gains a way to restage: under the parchment passage (`ui/passage.ts`), dispose the frame's systems and
  build the world and frame for a new seed, then lift the parchment once the first frames are drawn.
- Each render system gets a `dispose()` that releases what it made, through three's public `dispose` methods only,
  and the frame a `dispose()` that calls them. Test `f2` lets callers use only `frame.resize`, `render`, `ready` and
  `anchors` today: add `dispose` to them (D34).
- **Made once and kept:** the renderer, the canvas, the resize listener, the animation loop, the UI layer, the
  input, the stick, the HUD, the flow, the audio's mixer and sounds.
- **Made again for each planet,** all of which `main.ts` builds once today: the world (`createWorld`), the frame
  (`createFrame`), the matches (`createMatches`), the sounding Worker (`watersOf` starts one per call and never ends
  it: the old one is terminated), the game (`createGame`), the referee, the coasts (`traceCoasts`), the globe
  (`createGlobe`), and what the audio reads of the planet's height (`createAudio(planet.height)`).
- Anything of the "kept" list that holds a reference to something of the "made again" list takes it through a
  getter or is told of the change. No module-level variable holds a world.
- The rookery's planet is restaged the same way when the player opens the rookery or returns from a race.
- Measure memory across ten restages with a tool in `tools/`. If three's WebGPU renderer cannot release something
  through its public interface, stop and bring it to the owner (D26).

## 6. The management game

All numbers here are *starting values* in `career/tuning.ts`.

### 6.1 Gulls

Every gull has: a seed, a generated name, a home colony, an age, a role, a contract or none, morale (0 to 100),
marketability (0 to 100), a hidden improvability (0 to 1), a peak age, and up to three traits.

| Role | Per crew | Stats (0 to 20) |
|---|---|---|
| Captain | 2 in every rival crew; 1 in the player's crew (ship two), the player sailing ship one | Gunnery, Helm, Seamanship, Nerve, Consistency, Stormcraft, Stamina, Feedback, Lookout; and a style |
| Reserve captain | 1 | As a captain. Sails if the hired captain is injured or leaves. |
| Bosun | 2, one per ship | Concentration, Repairs, Flight Handling (in a race); Reliability, Performance (in the yard); Chemistry |
| Shipwright | 1 | One rating per part: Sails, Rigging, Rudder, Hull, Keel, Gun Mounts; plus known components |
| Flight gull | 4, one per job | Rating for their job; fatigue (0 to 100) |

- **Stars** (0 to 5, in halves) are the mean of a gull's role stats divided by 4. Potential is the same for their
  projected peak.
- **Growth.** Each season a gull below peak age gains points toward potential at a rate set by improvability and
  the crew's training building; past peak they lose points. Captains retire between 34 and 40.
- **Morale** moves with results, with being given the worse part, with contract status and with events. It shifts a
  captain's effective stats by up to ±1.
- **Traits** are small, specific modifiers, permanent or temporary. Examples: *Storm Specialist* (+2 Stormcraft
  outside the cap), *Hothead* (+2 Nerve, −2 Consistency), *Crowd Favourite* (+20 marketability), *Pay Captain*
  (brings coin per race). Each trait is data: a name, a condition and a modifier.
- **Bosun and captain** build a bond over races together. At bond levels 1 to 3 the bosun's perk unlocks (examples:
  flight arrives 1 s sooner; one free part repair a race; Gust recharges 10% faster).
- **Portraits** are drawn in code from the gull's seed (`ui/gull.ts`): plumage, beak, jacket in crew colours, one
  accessory. Sunglasses always.

### 6.2 The world at the start

- Thirty crews in three leagues, each with a generated name, a look, an elder, a budget, facilities by league, and a
  full staff.
- About sixty free agents across all roles.
- The player founds a crew that takes the place of the weakest crew in League Three: they choose its name, its two
  colours and its emblem. They inherit that crew's staff, contracts and facilities. That crew had two captains and a
  reserve, as every crew does: the player takes ship one, the stronger captain keeps ship two, the reserve stays, and
  the weaker captain is released to the market.
- **Every crew has a reserve,** the player's and the rivals' alike. The only difference between them is that the
  player sails ship one where a rival has a second hired captain.
- **Injury and illness.** A captain may be unfit for a number of races: a small seeded chance when her ship is
  sunk, and by events from the inbox. An unfit captain cannot be picked in the race plan; rivals follow the same
  rule.
- **A ship with no one to sail her.** If a crew's captain is unfit or gone on race day, its reserve sails. If it has
  no reserve either, a free agent is signed for that race at their asking wage. The player cannot start a race with
  ship two empty: Continue opens the Crew screen and says why.
- **When the player is dismissed and joins another crew,** that crew's stronger captain is released to the market
  and the player takes ship one.

### 6.3 Scouting and hiring (D17)

- **The market** lists every gull not on the player's crew, with filters by role, league and contract status.
- **Unscouted** gulls show name, age, colony, role, last season's results, and stars as a range (for example 2.5 to
  4). Stats and potential are hidden.
- **Scouting** assigns a slot to a gull for a number of days (fewer with a better crow's nest). When it ends, exact
  stats, potential and traits are revealed and stay revealed. Slots: 1, 2, 3 by building level.
- **A gull can be approached unscouted.**
- **An offer** has: wage per race, signing fee, length in seasons (1 to 3), role (ship two, reserve), a bonus per
  podium, and a break clause.
- **Negotiation.** The gull has an asking wage and fee (from stars, age, marketability and the leagues' pay scale),
  a list of what they care about (from traits), and patience of 3. The player sends an offer; the gull answers
  after 2 days with accept, a counter, or refuse. Each offer below their floor costs one patience. At zero they
  refuse to talk for 30 days.
- **A gull will not join** a crew more than one league below their level, unless out of contract.
- **Signing an employed gull** pays their break clause to their crew.
- **Dismissing a gull** pays the rest of this season's wage.
- **Contracts end** at season's end. In the last 60 days other crews may approach. The player is told when one of
  their gulls is approached and may make a renewal offer.
- **Rival crews** run the same rules through a simple manager (`career/rivals.ts`): fill empty roles, replace the
  weakest when coin allows, renew the best, poach when a clear upgrade is affordable.
- **Each new season** twenty young gulls enter as free agents with low stats and hidden potential.

### 6.4 Race plan

Opened from the dashboard on race day. One screen:

- The planet and its traits (islands, wind, length).
- Which captain sails ship two (hired or reserve).
- Which parts go on which ship, where the crew owns more than one of a kind.
- Ship two's orders (section 5.9).
- The flight's job order.
- This race's patron objective (section 6.7).
- **Sail** begins the race.

### 6.5 Parts (D11)

- A crew owns a list of parts. Each has a type, performance, maximum performance, reliability, maximum reliability,
  a risk level, and which ship it is fitted to.
- **Designing** a part: choose the type, then fill component slots from the components the shipwright knows and the
  buildings allow. Each component adds performance, maximum performance, reliability, shorter build time, or a larger
  gain with risk. The new part starts from the crew's best part of that type plus the shipwright's rating for it.
  Designing takes days and coin, then building takes days.
- **Improving** fitted parts: the yard has work points per day (from the factory's level and the bosuns'
  Reliability and Performance). The player splits them between performance and reliability across parts.
- **Risk.** After each race one crew in three is inspected (seeded). A part with risk is found with a chance equal
  to its risk. Found, it is confiscated, the crew is fined and loses that race's points.
- **Spec parts.** Each league's rules name which part types are spec (fixed for all). League Three: three spec
  types. League Two: one. League One: none.
- **Next season's hull.** In the off-season the player chooses a timber, canvas and cordage supplier. Each sets a
  trade-off (for example wear rate against improvability) and a cost. Parts carry over at a share of their
  performance; risk is stripped.

### 6.6 The rookery

Buildings, each with levels 1 to 3, a cost, a build time and upkeep:

| Building | Effect |
|---|---|
| Factory | Yard work points per day |
| Drawing loft | Component slots and design time |
| Test tank | Unlocks higher-tier sail, rigging and keel components |
| Foundry | Unlocks higher-tier rudder, hull and gun mount components |
| Sailing school | Captains' growth rate |
| Flight loft | Flight gulls' fatigue recovery |
| Crow's nest | Scouting slots and speed |
| Fish market | Income per race |
| Landing pad | Unlocks the best patrons |

The screen shows the rookery's planet from orbit (the existing space eye), with each building drawn on its island.
Tapping a building opens its card. A building under construction shows scaffolding and days left.

### 6.7 Money, patrons and the elder

- **Income:** patrons, prize money at season's end, the fish market, pay captains.
- **Costs:** wages per race, part design and building, facilities and their upkeep, fines, break clauses.
- **Patrons.** A crew has patron slots. Offers depend on the crew's marketability. Each patron pays either a fixed
  sum per race, or a bonus for an objective chosen before each race (finish top six; sink two ships), harder paying
  more.
- **The ledger** lists every transaction and a projection to season's end.
- **Debt.** Coin may go negative to a floor. Below zero, the elder's confidence falls each race.
- **The elder** sets a target position at the start of the season. Confidence (0 to 100) moves with results against
  the target. At zero the player is dismissed (D23): they are shown offers from other crews, take one, and continue
  with that crew.

### 6.8 The Admiralty

- Twice a season the crews vote on one rule change for next season. Each crew has one vote; rival crews vote for
  what suits their strengths.
- Rules that can change: which parts are spec; the storm's speed; whether mortars or harpoons are banned; points
  per sinking; whether the sea-held point exists; prize money's spread; the inspection rate.
- Every rule is a field of a `Rules` value that the `RaceCard` and the scoring read.

### 6.9 The inbox

Messages and dilemmas arrive by date. A dilemma has two or three options with stated costs. Each is data in
`career/events.ts`: a trigger, a text with slots for names, options and effects. Nothing about an event is written
in a screen.

**Messages,** one for each of these, sent when it happens: a scout's report is ready; a gull answers an offer; a
rival crew approaches one of your gulls; a contract enters its last 60 days; a design is finished; a part is built;
a building is finished; an inspection's result; a patron's offer; a patron's objective met or missed; a vote is
due; a vote's result; a captain is unfit, and fit again; the elder's word after each race (only when confidence
crosses 75, 50 or 25); the other leagues' results for the round; a gull retires; a trait gained or lost.

**Dilemmas,** the first set. At most one arrives between two races, drawn by seed from those whose trigger holds:

| Dilemma | Trigger | Options |
|---|---|---|
| A captain asks for a rise | Morale below 40 with a year or more left | Pay 15% more; refuse (morale −15); promise a podium bonus |
| The two ships argue over the new part | A new part fitted to one ship | Give it to the other (morale swaps); hold firm (the loser's morale −10) |
| A bosun and their captain fall out | Bond at level 0 after five races | Swap the bosuns (both bonds reset); send them to dinner (coin; bond +1); leave it |
| A shipwright offers a grey component | Any design in hand | Take it (performance up, risk up); refuse; report it (marketability +5) |
| A patron wants a guest aboard | Any fixed-sum patron | Agree (coin now; ship two's Consistency −2 next race); decline (the patron's renewal less likely) |
| The flight is worn out | Any flight gull's fatigue above 75 | Rest them (their job is done at half rate next race); push on (botch chance up); hire cover for one race (coin) |
| A rival offers a part swap | A rival ranks higher in one type and lower in another | Swap; decline |
| The press asks about the elder | Confidence below 40 | Back the elder (confidence +5, marketability −5); speak freely (the reverse); say nothing |
| A young gull asks for a trial | A free agent under 20 with high potential | Sign as reserve at a low wage; scout them free; decline |
| Storm damage at the rookery | Once a season at most | Repair now (coin); repair slowly (one building's effect halved for 20 days) |
| An unfit captain wants to sail | A captain unfit for one more race | Let them (Stamina −6 that race; a chance of two more races out); rest them |
| The Admiralty offers a testing exemption | Lowest two crews in the league | Take it (yard points +20% for 30 days; marketability −5); decline |

Every number above is a starting value in `career/tuning.ts`.

### 6.11 Names and looks

Nothing is named or drawn by hand, one at a time (section 10).

- **Gulls:** a given name and a family name, each built by seed from tables of syllables in `career/names.ts`, with
  a home colony from a table of about forty. No two living gulls share a full name.
- **Crews:** "<place> <noun>" from two tables (for example "Saltmarsh Corsairs"). No two crews share either word.
- **Patrons:** a family name and a trade from a table ("Harrow & Daughters, Chandlers").
- **Planets:** one word from a syllable table, seeded by the planet's seed.
- **Crew colours:** thirty pairs dealt from the palette so that no two crews in one league are near each other and
  none is near the sea's colours. The player's choice at founding takes its pair out of the deal.
- **Emblems:** twelve woodcut glyphs added to `ui/glyphs.ts`; a crew's is dealt by seed.
- **Rival crews vote** (section 6.8) for the option that scores best on a simple measure of their own state: a
  crew strong in a part type votes against making it spec; a crew short of coin votes for a flatter prize spread;
  a crew with weak gunners votes for banning what it is sunk by most.

### 6.10 The calendar and the season

- A season is ten races, fourteen days apart, then a thirty-day off-season.
- The ten planets (their seeds and traits) are fixed and shown when the season starts.
- **Race day, per round:** the player's league's race is sailed. The other two leagues' races run headless in a
  Worker while the player sails, and their results are recorded when both are done.
- **Season's end, in order:** prize money; promotion and relegation; retirements; new gulls; contract expiries;
  rule changes take effect; the elder's verdict; next season's hull; the new calendar.

## 7. Screens and flows

Every management screen follows the grammar in 7.1 to 7.3 and its own spec in 7.4. Where a spec is silent, follow
the grammar; where both are silent, copy the nearest specified screen and say so in the commit. The structure is
Motorsport Manager's (D3); the dress is the chartmaker's (D2).

### 7.1 The page

- **Size.** The layout page is 1180 × 820 CSS px (D27), landscape only, scaled to fit the screen. `W` and `H` in
  `ui/screens.ts` change to this.
- **Top bar:** the full width, 64 px high (7.3).
- **Body:** below the bar, with a 16 px margin: 1148 × 724 px. A grid of **12 columns** with 16 px gutters (a column
  is 81 px). Specs give a panel's place as columns, for example "1–4".
- **A screen never scrolls as a whole.** A table or list inside a panel scrolls within its panel.
- **How it is built.** Management screens are HTML elements (layout, text, scrolling). Frames, rules, icons, bars
  and portraits are SVG made by `ui/ink.ts`, `ui/glyphs.ts` and `ui/marks.ts`. The match HUD and the existing title
  stay as they are built today. No UI framework and no CSS library.
- **Type.** The serif of `ui/ink.ts` (`FIGURES`) everywhere. Screen title 28 px; panel heading 20 px small caps;
  body 16 px; small 13 px. Nothing smaller than 13 px. Numbers are tabular and right-aligned in tables.
- **Colour.** Paper ground (`PAPER`); text and lines in the inks of `INK`; fills in the washes of `WASH`. No colour
  is written in a screen's file: add a named ink or wash if one is missing. The player's crew colours appear only
  on their emblem, their rows and their ships.
- **Touch.** Every tappable thing is at least 44 × 44 px with 8 px between neighbours. No hover states, no
  drag-and-drop, no long-press, no keyboard shortcuts. A pressed control darkens by one wash.
- **Motion.** Screens change by the existing `fade`. Nothing else animates except a bar filling to a new value
  (200 ms).

### 7.2 The parts every screen is made of

Each is one small file in `ui/kit/`, a function that returns an element and a way to update it. Build each once,
before the first screen, and use only these.

| Part | What it is |
|---|---|
| **Panel** | A paper rectangle with a rough inked border (`roughRect`) and a heading line. Every region of every screen is a panel. |
| **Sub-tabs** | A strip of two to four segments under the top bar, at the body's top left, 48 px high. Used where one tab holds several screens. |
| **Segmented choice** | Two to five joined buttons, one chosen. For filters and small enumerations. |
| **Table** | A header row (tap a heading to sort; the sorted one carries an arrow) and rows 56 px high. Draws only the rows in view. A row may be tappable as a whole. The player's rows carry their crew colour as a 6 px bar at the left. |
| **Portrait** | A gull drawn from their seed (`ui/gull.ts`), in three sizes: 40, 96 and 240 px. Sunglasses always. |
| **Stars** | Five stars in halves. A range is drawn as filled stars to the low value and outlined stars to the high. Potential is a second, smaller row. |
| **Stat bar** | A label, a figure 0 to 20, and an inked bar (`bar`). An arrow up or down beside the figure if it changed this season. Hidden stats draw a hatched bar and "?". |
| **Meter** | A bar for 0 to 100 (morale, confidence, fatigue, condition), with three washes: low, middle, high. |
| **Coin** | A coin glyph and an amount with thin spaces between thousands. Negative amounts in the red ink with a minus. |
| **Tag** | A small inked label: a trait, "Spec", "Unfit 2 races", "Approached", "Risk". |
| **Part tile** | 176 × 96 px: the part's glyph and type, performance as a figure and a bar against its maximum, reliability the same, condition as a meter, and tags. |
| **Card** | 240 × 320 px, for choices (D19): a title, a picture or glyph, three to five lines of consequences with figures, and a Choose button. Cards are always shown two to four in a row, never one. |
| **Button** | 48 px high. Three kinds: primary (filled ink, one per screen at most), plain (outlined), danger (red ink, always opens a dialog). A disabled button is pale and shows why in 13 px text beneath it. |
| **Stepper** | A figure between − and + buttons, with its limits. Holding is not needed: each tap moves one step, and the step grows with the amount (1, 10, 100, 1000 by magnitude). |
| **Dialog** | A panel 560 px wide centred over a paper wash that dims the screen. A title, a sentence saying exactly what will happen and what it costs, and two buttons: the action and Cancel. Used for every spend above zero that cannot be undone and every danger button. |
| **Notice** | One line across the top of the body for 4 s: a command refused (with its reason), a save failed. Never used for news; news goes to the inbox. |
| **Empty state** | A panel with nothing to list says so in one sentence and offers the one button that fixes it, if there is one. |
| **Chart disc** | The race's planet as a small drawn chart: its islands' coasts and the storm's opening cap, drawn as `ui/minimap.ts` draws them. |

### 7.3 The top bar, on every management screen

- **Left, 200 px:** the crew's emblem (40 px) and name. Tapping it goes `home`.
- **Middle, 680 px:** eight tabs of 85 px, each a woodcut glyph over a 13 px small-caps label: **Home, Crew, Ship,
  Rookery, Scouting, League, Finance, Inbox.** The open tab is underlined in the crew's colour. Inbox carries a
  count of unread messages; a waiting dilemma makes the count red.
- **League** holds `standings` and `admiralty` as sub-tabs. **Finance** holds `ledger` and `patrons`.
- **Right, 300 px:** the date ("Day 12, Season 1"), the coin, and **Continue** (primary).
- **Continue** sends `Advance`. Its label says what it will do: "Continue" between races, "Race plan" on race day.
  If something blocks it (an unanswered dilemma, an empty seat on race day, a vote due), it opens that item and a
  notice says why.
- The bar is not shown on `title`, `found`, `recover`, in a race, or on `season` and `dismissed`.
- A gear at the far right of `home`'s body opens `settings`.

### 7.4 Each screen

Every screen is one file in `ui/office/`, `create<Name>(send)`, which returns its element and `show(view)`. It
draws one view model from `office.ts` and sends `Command`s; it keeps no career state of its own and never works
out a rule (whether a button is allowed, what something costs): the view model says. The view models are built in
`career/views.ts` and unit-tested there. Each screen opens directly from the page's query (`?screen=<name>` with a
fixture career from `debug.ts`) so `tools/capture.ts` can photograph it.

**`title`** (launch). As today: the rose over parchment while loading; a tap goes on.

**`found`** (from `title`, when no save exists).
- *1–7, the form.* The crew's name (a text field, 1 to 24 characters, filled with a generated name; a Reroll
  button beside it). First colour and second colour, each chosen from twelve swatches of the palette; a swatch
  already taken by the other is disabled. An emblem from twelve woodcut emblems in a 6 × 2 grid.
- *8–12, the preview.* The galleon (`galleon` in `ui/ink.ts`) in the chosen colours, the emblem and the name as
  they will appear in the top bar; under it one line on the crew being replaced (its league and its elder).
- **Found the crew** (primary) sends `Found`. A name that is empty or already a crew's shows why under the field.

**`recover`** (from `title`, when the save does not verify). One panel, 3–10. It says in plain words what was
found and what is lost (for example "The last 3 actions since Day 41 could not be read"). One plain button for
each way forward that section 4.3 allows, in its order: continue from the last good entry; restore the backup
(with its date); start a new career (danger). Nothing is chosen for the player.

**`home`** (the Home tab; where every launch lands).
- *1–5, top 320 px: Next race.* "Round 4 of 10", the planet's name, the chart disc, days to go, the elder's target
  for the season and the confidence meter, and the patron objective if one is set. On race day the heading reads
  Race Day.
- *6–12, top 320 px: The ships.* Two halves. Ship one: "You", her bosun's portrait (40) and name, six small part
  marks (type glyph, with a red mark on any part below half condition). Ship two: her captain's portrait (96),
  name, stars, morale meter and any tag (unfit, approached), her bosun, and the same six marks. A half is tappable:
  ship one's opens `ship`, ship two's the captain's `profile`.
- *1–4, below: The yard.* The design in hand with days left, or "Nothing on the board" and a Design button; the
  day's work points and how they are split.
- *5–8, below: The table.* The crews' standings: the two rows above the player's crew, the player's, and the two
  below, with points. Tapping opens `standings`.
- *9–12, below: Inbox.* The four newest messages (unread in bold; dilemmas tagged). Tapping one opens it in
  `inbox`.

**`crew`** (the Crew tab).
- *1–9: a table* of every gull on the crew, grouped under role headings in the order captain, reserve, bosuns,
  shipwright, flight. Columns: portrait (40), name, age, stars with potential, morale, wage per race, contract's
  end, tags. Tapping a row opens `profile`. The player's own row heads the captains: "You, ship one", no stats.
- *10–12: the roster's summary.* Wages per race in total; each empty role with a Find button that opens
  `scouting` filtered to it; the flight's four jobs with who holds each and their fatigue.

**`profile`** (from any row or portrait of a gull).
- *1–4: who they are.* Portrait (240), name, age, home colony, role, stars and potential (a range if unscouted),
  traits as tags (tapping one shows its effect in a line beneath), morale and marketability meters.
- *5–9: what they can do.* The role's stats as stat bars: a captain's nine and their style; a bosun's six and
  their bond with their captain (a meter with the three perks, locked ones pale); a shipwright's six part ratings
  and their known components; a flight gull's job, rating and fatigue. Unscouted: hatched bars. Beneath, their
  history as a table: season, crew, league, races, best finish, points, sinkings.
- *10–12: contract and actions.* Their crew, wage, the contract's end, the break clause. Then the buttons that
  apply, each disabled with its reason when it cannot be used: **Scout** (days it will take; needs a free slot),
  **Make offer** (opens `offer`), **Renew** (opens `offer` with their present terms), **Dismiss** (danger; the
  dialog states the wage still owed).
- A Back button at the body's top left returns to where the player came from.

**`offer`** (from `profile`).
- *1–7: the terms.* Role (ship two or reserve; segmented), wage per race, signing fee, length (1, 2 or 3 seasons;
  segmented), bonus per podium, break clause: each a stepper. When the gull has countered, their figure stands
  beside each field as "asks 1 200". Beneath: what this costs now and per race, and the coin left after it.
- *8–12: the gull.* Portrait (96), name, stars; what they care about, as up to three lines with glyphs; patience
  as three pips; their last answer in a sentence; earlier offers as a short list.
- **Send offer** (primary) sends `OfferContract`. With a counter on the table: **Accept their terms**. Always:
  **Withdraw**.
- *States.* Waiting: the form is locked and a line says which day the answer is due. Refused to talk: locked, with
  the day they will listen again. Signed: a line says the day they join, and the screen returns to `profile`.

**`ship`** (the Ship tab).
- *1–4: ship one. 5–8: ship two.* Each a column of six part tiles under the ship's name and who sails her. Tapping
  a tile opens a dialog listing the crew's parts of that type as part tiles, with **Fit** on each; a spec part's
  tile carries the Spec tag and does nothing.
- *9–12: the yard.* Work points a day and where they come from. For each fitted part that is not spec, two
  steppers: points to performance and points to reliability; a line shows points left to give. Beneath: the design
  in hand with days left, or **Design a part** (opens `design`).
- *Across the bottom, 96 px: against the league.* For each of the six part types, the crew's best part's place
  among the league's ten crews ("Sails 4th").

**`design`** (from `ship`).
- *1–3: the type.* The six types as a list; spec types are disabled with the Spec tag.
- *4–9: the components.* One slot for each the drawing loft allows. Tapping an empty slot opens three cards
  (D19) dealt from the components the shipwright knows and the buildings allow; choosing one fills the slot. A
  filled slot may be emptied until Confirm.
- *10–12: what it will be.* Performance at the start and at most, reliability at the start and at most, risk,
  cost, days to design and days to build. **Confirm** (primary; a dialog states cost and days) sends
  `StartDesign`.
- *Blocked:* a design is already in hand; not enough coin. Each says so under Confirm.

**`rookery`** (the Rookery tab).
- *1–8: the campus.* From Phase E, the rookery's planet from orbit behind a clear panel, each building standing on
  its island; a tap on a building selects it. Before Phase E, a drawn chart of the island with a glyph for each
  building in its place, tappable the same way.
- *9–12: the buildings.* A list of the nine: name, level as three pips, what it gives now, and "Building: 6 days"
  if under way. Selecting one shows its card beneath the list: what the next level gives, cost, days, upkeep, and
  **Build** or **Upgrade** (a dialog states the cost). Any number may be under way at once.

**`scouting`** (the Scouting tab).
- *1–9: the market.* Above the table, filters: role (segmented), league, contract (any, out of contract, last 60
  days), and "scouted only". Columns: portrait (40), name, age, role, crew, stars (a range if unscouted), asking
  wage ("?" if unscouted), contract's end. Tapping a row opens `profile`.
- *10–12: the scouts.* One row for each slot the crow's nest gives: the gull being scouted with days left and a
  Cancel button, or "Free". There is no queue.

**`standings`** (the League tab, first sub-tab).
- Two segmented choices at the top: league (One, Two, Three; the player's is chosen first) and Crews or Captains.
- *1–8: the table.* Crews: place, emblem, name, points, wins, sinkings, the last five races' places. Lines mark
  the promotion and relegation places. Captains: place, portrait (40), name, crew, points, wins, sinkings; the
  player is listed as "You". A captain's row opens `profile`; a crew's row opens a dialog with its staff's stars
  and its parts' places.
- *9–12: the calendar.* The season's ten rounds: number, planet, day, and the winner once sailed. The next round
  is marked.

**`admiralty`** (the League tab, second sub-tab).
- *1–6: the rules in force,* each field of `Rules` as a sentence, those that differ from last season tagged New.
- *7–12: the next vote.* Its day and the proposal in a sentence. When the vote is due: two cards, For and Against,
  each stating what it would change for the player's crew; choosing sends `Vote`. Once cast, the cards give way to
  "You voted For"; the result comes by inbox. Beneath: past votes and how they went.

**`ledger`** (the Finance tab, first sub-tab).
- *Across the top, 96 px:* five figures: coin now, income a race, costs a race, the projection at season's end,
  and the debt floor.
- *1–8: the transactions,* newest first: day, what it was, amount, balance. A segmented filter: all, wages,
  parts, buildings, patrons, prizes, fines.
- *9–12: this season by kind,* as labelled bars, income above costs.

**`patrons`** (the Finance tab, second sub-tab).
- *The slots,* as cards in a row. A signed patron: name, emblem, what they pay (a sum a race, or a bonus for an
  objective), and races left. An empty slot: "Open".
- *Beneath: offers,* as cards: the patron, their terms, the length, and the marketability they ask. **Sign** (a
  dialog states the length) sends `SignPatron`. With no free slot the buttons are disabled and say so.

**`inbox`** (the Inbox tab).
- *1–4: the list,* newest first: a glyph for the kind, the title, the day; unread in bold; a dilemma tagged
  Decision.
- *5–12: the message.* Its text; a button to the gull, part or screen it concerns; and, for a dilemma, its options
  as cards, each stating its costs and effects in figures. Choosing sends `AnswerDilemma`. An answered dilemma
  shows what was chosen.

**`plan`** (from Continue on race day).
- *1–4: the planet.* Its name, the chart disc at 240 px, its traits (islands, wind, how long the storm takes to
  close), and any rule new this season that bears on the race.
- *5–9: the ships.* Ship one: "You". Ship two: a segmented choice between the captain and the reserve, an unfit
  gull disabled with the tag. Under each ship her six part marks; where the crew owns two of a type, a Swap button
  between the two ships' marks. Then ship two's orders (section 5.9) as four cards.
- *10–12: the flight and the patron.* The four jobs in order, each row with Up and Down buttons. If an objective
  patron is signed: the objectives as cards, harder paying more. At the bottom right, **Sail** (primary).
- Every change sends `SetPlan`. Sail sends `RaceStarted`. *Blocked:* ship two has no one to sail her.

**In the race** (`match`, `sinking`, `sunk`, `spectate`, `won`). As today, laid out for the new page with each
piece kept in its present corner. New on the HUD:
- *The crewmate,* beside the player's own hull bar: portrait (40), her hull as a bar, and a word for her state
  (sailing, in crew water, sunk).
- *The order toggle,* beside it: "With me" or her plan's name.
- *The flight button,* above the gun buttons: a gull glyph. Pale outside crew water; a ring fills while the flight
  is on its way; while they work, the job's name stands beside it and a botch shakes it once.
- *Faults,* under the hull bar: the failed part's glyph in the red ink.
- `sunk` gains two buttons: **Watch** (her crewmate first) and **Skip to result**.
- Capture the HUD on the device's size and show the owner before settling where these sit.

**`result`** (when the race ends).
- *1–7: the finishing order,* all twenty: place, the crew's colour, the ship's captain, how and by whom she sank
  (or "Afloat"), sinkings, points. The player's crew's two rows carry their colour.
- *8–12: what it meant.* The crew's points from this race, by source (places, sinkings, sea held); the sea held by
  the three leading sides, as bars; faults; flight stops and botches; the patron objective, met or missed, with
  its coin; and the crew's place in the table before and after.
- **Continue** (primary).

**`season`** (after round ten's result). One panel, 3–10, one step of section 6.10 at a time, with a row of pips
for the nine steps. Each step is a heading, a table or a sentence of what happened, and Continue. The step for
next season's hull shows three rows of three cards (timber, canvas, cordage) and waits for a choice in each.

**`dismissed`** (when the elder's confidence reaches zero).
- *1–5: the elder's letter.*
- *6–12: offers,* as cards: the crew, its league, its elder's target, its coin, its staff's stars. There is always
  at least one, from the lowest league. Choosing sends `TakeOffer`.

**`settings`** (a dialog over `home`). Sound and look sensitivity as sliders, as today. **Back up now**, with the
day of the last backup. **Restore the backup** (danger).

### 7.5 Flows, step by step

**First launch.** Title → no save → `found` → the player names the crew and picks colours and emblem → the world is
generated from a new seed, the journal's first entry is written → `home`. If that first write fails, the player
stays on `found`, is told the save failed, and may try again.

**Later launches.** Title → the save loads and verifies → `home`. If it does not verify → `recover`.

**A day between races.** `home` → the player visits tabs and sends commands; each is applied and journaled before
the screen redraws → Continue → the calendar jumps to the next event → a card says what happened → `home`.

**Hiring.** `scouting` → filter → tap a gull → `profile` (a star range if unscouted) → Scout (a slot is taken, days
shown) or Make Offer → `offer` → send terms → Continue until the answer arrives in the inbox → accept, counter or
give up → on signing, fee and any break clause are paid and the gull joins on the stated date.

**Designing a part.** `ship` → Design → `design` → pick type and components → Confirm (coin paid, days shown) →
later, the inbox says it is built → `ship` → fit it to a ship.

**Race day.** `home` shows Race Day; Continue opens `plan` → Sail → the parchment comes over → the world is restaged
for the race's planet → the parchment lifts into the descent from space → `match`.

**In the race.** The player sails and shoots as today. New on the HUD: the crewmate's hull and state, the order
toggle, the flight button, part faults.

**The player sinks.** `sinking` → `sunk` → Watch (crewmate first) or Skip to result → `result`.

**The race ends.** `result` → Continue → the parchment comes over → the other leagues' results are recorded (waiting
for the Worker if it is not done, with a line saying so) → inspections → a snapshot is saved → `home`.

**Killed mid-race.** The journal has a `RaceStarted` entry with no `RecordRace` for the player's race. On launch →
`home` shows Race Day again with the same planet and plan (D29).

**Killed after the player's race is recorded, before the other leagues' are.** The round is still open. On launch
the Worker runs the awaited races again from their cards, and `home` says the round is being settled until they are
recorded.

**Season's end.** After round ten's result → `season` walks through each step of section 6.10, one card at a time →
`home` on day one of the new season.

**Dismissed.** `result` or `season` → `dismissed` → pick an offer → `home` with the new crew.

**Save failure while playing.** If `append` rejects, the command is not applied, the screen says the save failed,
and the player may retry. The game never continues on unsaved state.

## 8. Order of work

Each phase ends with the gates green and something the owner can try on the device. Phases A and B touch different
layers and may run in parallel, one agent each.

**Phase 0: ground.** Delete what section 3.5 lists. Move the layout page to the iPad's. Add the new `LAYERS` rows as
their folders appear. The game still plays as today.

**Phase A: the race.**
1. Fleet size as a parameter (5.1).
2. Per-ship handling with every ship on spec, results unchanged (5.3).
3. Crews and no friendly fire (5.2).
4. Speed and the arena (5.5). The owner tunes on the device.
5. How a race ends and its `RaceResult` (5.6), with `race.ts`.
6. Captains drive the bots, with a test per stat (5.4).
7. Parts in a race and wear (5.7).
8. The flight (5.8) and orders (5.9).
9. A new planet per race (5.10).

**Phase B: the career, headless first.**
1. The reducer, journal, store port and in-memory adapter, with the crash and corruption tests (4.2, 4.3).
2. World generation: gulls, crews, leagues (6.1, 6.2).
3. Calendar, season, standings and points, driven by headless races through `race.ts` (6.10, 5.6).
4. A tool, `tools/season.ts`, that plays whole seasons with no UI and prints the tables.
5. Contracts, the market, scouting, negotiation, rival managers (6.3).
6. Parts, the yard, inspections (6.5).
7. Buildings (6.6). Money, patrons, the elder (6.7).
8. The Admiralty (6.8). The inbox and dilemmas (6.9).
9. Season's end and the off-season.
10. The IndexedDB adapter, migrations, backup and restore.

**Phase C: the screens.** First the kit of section 7.2 and the gull portrait, each captured on one sheet for the
owner. `ui/ways.ts` stays the one table of screens and ways: every screen of 7.4 is added to it. Then the screens in
this order, each wired to the career through `office.ts`, `home` shown to the owner before the rest: top bar and
`home`; `found`;
`plan` and `result`; `standings`; `crew` and `profile`; `scouting` and `offer`; `ship` and `design`; `ledger` and
`patrons`; `inbox`; `admiralty`; `season` and `dismissed`; `recover` and `settings`.

**Phase D: the look** (section 9). May start any time after Phase 0; it touches only render folders.

**Phase E: the rookery in 3D,** the flight drawn as gulls, and biomes.

## 9. The look

**`PROMPT-art.md` is the full brief for the race's look** and stands alone: an agent doing Phase D reads that file,
and this section only for what the manager adds (crew looks, the campus, biomes). Where the two differ on the race's
look, `PROMPT-art.md` is right.

The target is `art/target/race.png`. Further targets (the dashboard, a profile, the rookery) will be added to
`art/target/` by the owner. Judge by eye against them, with `node tools/hero.ts`, and let the owner judge on the
device. Do not build a numeric image-difference gate.

### 9.1 Principles

- **Two tones per surface.** A lit colour and a shadow colour with a crisp edge. Shadow colours are chosen, warm and
  saturated, never computed grey.
- **No photo textures.** Detail is shape: plank lines, window frames, a rail.
- **No outlines.**
- **One palette,** in `src/palette.ts`, used by every material. *Starting values:* vermilion, verdigris, ochre,
  ultramarine, gold, parchment cream.
- **The player's crew is the brightest thing in the frame.** No crew's colours match the sea's.
- **Everything reads at a glance:** own ship, crewmate, enemies, shot, loot, storm, border.

### 9.2 Changes, in order

1. **Lighting.** In `sky/light.ts`, add a toon light beside the existing one: given a point, a normal, a lit colour
   and a shadow colour, return the lit colour where the sun reaches (through cloud and island shadow) and the shadow
   colour elsewhere, with a narrow smooth edge, scaled by the sun's and sky's brightness so exposure stays right.
   Keep `rim`.
2. **Ship materials** (`ship/materials.ts`, `ship/wood.ts`): flat colours from the crew's `Look` and the palette;
   plank lines drawn from the hull's own coordinates; no texture reads; no glossy highlight.
3. **Land** (`land/sand.ts`, `rocks.ts`, `palms.ts`, `shrubs.ts`): flat colours with a height gradient; rocks
   faceted with flat normals.
4. **Remove** `src/textures.ts`, `public/tex`, and their row in the architecture test once nothing reads them.
5. **Water** (`water/optics.ts`, `foam.ts`): turquoise shallows to ultramarine deep; foam as thick, flat white
   bands at shores and hulls; less fine glitter. Transparency, caustics and the seabed stay.
6. **Territory** (`water/claims.ts`): a thin glowing line in the crew's colour and almost no tint.
7. **Grade** (`post/grade.ts`): a new look table for the palette; bloom reduced so flat colours stay flat.
8. **Clouds and storm:** keep. Adjust colour only.
9. **Crew looks** (`play/colours.ts`): ten distinct crew colour pairs from the palette, none near the sea's.

After each step: `npm run budget`, `npm run hitch`, and hero captures.

### 9.3 Later

- **The flight as gulls** over a ship being served.
- **The rookery's buildings** (`campus/`): simple blocky forms generated in code, in the palette.
- **Biomes.** Each is a coastline shape, a height profile, a palette and one rule that changes how the race is
  sailed. Islands are built from an irregular coast and a profile curve (beach, slope, cliff, terrace, top), never
  from a circle pushed upward; trees stand only on flat ground, in clumps. Until biomes exist, every planet is
  today's kind on a different seed.

## 10. What not to do

- Do not rewrite the sim, the bots, the renderer's pipeline or the UI kit. Extend them as written above.
- Do not add a dependency.
- Do not add a quality setting, a fallback path or WebGL.
- Do not hand-write gull names, crews or events one by one where a seeded generator and a data table will do.
- Do not show a stat that does nothing.
- Do not roll a race result.
- Do not continue past a failed save.
- Do not tune by feel from headless numbers, and do not gate on them.
- Do not edit `CLAUDE.md`, or commit, revert or overwrite the owner's uncommitted changes.
- Do not start a design change without the owner's yes.
