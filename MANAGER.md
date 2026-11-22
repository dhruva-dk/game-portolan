# MANAGER: Portolan as Motorsport Manager, sailed by you

The brief for every agent on the `mm` branch. Read all of it before changing
anything. `CLAUDE.md` is the owner's and comes first. Where this file and the
code disagree about what exists, the code is right: say so. Where this file is
silent on a career rule, `git show manager-c2:PROMPT.md` (sections 4 and 6)
and `git show manager-c2:docs/decisions.md` are the detail; this file wins
where they differ. The owner is away for the whole run: decide by this file,
record what you decided in your commit message, and do not stop to ask.

## 1. The game

- A career in the shape of *Motorsport Manager* (PC, 2016; "MM"): you manage a
  racing team and sail one of its four ships yourself.
- Three championship tiers of 20 teams. Four ships a team, 80 ships a race,
  ten races a season. The champion goes up, the last team down.
- A race is today's 80-ship match on today's sim, the bots at their full depth
  (personas, brains, the lot), sailed in teams: no friendly fire, a team's water
  shared, over when one team is left afloat.
- Your team: you, three hired drivers, one reserve. A rival team: four drivers
  and a reserve. You always sail ship 0 of your race.
- No practice, no qualifying, no setup tuning. Race day goes to the race.
- Between races, as MM: hire and fire, scout, design and improve parts, build
  the headquarters, sign sponsors, vote on rules, answer mail. Days pass.
- Today's seeded match (seed panel, match types, livery picker) stays as
  **Single Race**, untouched: its goldens hold to the bit.
- Everyone is a seagull in dark sunglasses, played straight. **One gull, the
  same for everyone**; only the jacket takes a team's colours. No gull is drawn
  in a race.

## 2. Words

MM's words for people, organisation and screens; ship words for the machine.

| Was (manager-c2) | Is |
|---|---|
| crew | team |
| captain | driver |
| reserve captain | reserve driver |
| bosun | race mechanic (one a ship) |
| shipwright | lead designer |
| flight (gulls) | pit crew |
| elder | chairman |
| rookery | headquarters (HQ) |
| patrons | sponsors |
| market | scouting |
| Coin | balance (still one currency) |
| league | championship (tier 1, 2, 3) |
| Admiralty | the Admiralty, in MM's GMA slot |
| yard | part improvement |

Nautical still: ship (never car), the six parts (sails, rigging, rudder, hull,
keel, gun mounts), the nine driver stats (gunnery, helm, seamanship, nerve,
consistency, stormcraft, stamina, feedback, lookout), guns, storm, sea held.
Code is renamed with the UI: no `Crew`, `Captain`, `Elder`, `Rookery`,
`Patron`, `Gull` in new or ported identifiers (`sim/battle.ts` keeps its own
`Crew`, one ship's hands; do not touch it).

## 3. The race (sim/, play/, race.ts)

`src/race.ts` is the seam and is already written: `RaceCard` in, `RaceResult`
out. Change it only with a commit that says why, and tell the orchestrator.

1. **Card-less is today.** A match with no card is Single Race: every golden
   (`tests/golden*`, the harness goldens) stays identical to the bit. Land the
   seams first, in commits that move no number, before any rule changes.
2. **Teams.** Ships `4k … 4k+3` are team `k` (`race.ts TEAM`). A ball that
   meets a teammate's hull stops and harms nothing; a shell's burst spares her
   team; a ram between teammates harms neither (the hulls still part). Bots
   never choose a teammate as a target and the aim assist never lays on one.
3. **Team water.** Cells stay owned per ship. A ship is at home in any
   teammate's water (shield regeneration, the pit). A teammate crossing a
   trail does not cut it; closing a loop, her team's water counts as her own.
4. **The end.** The race is over when every ship afloat is of one team, or
   none is. Places as `RaceResult.order` says. Points are the career's.
5. **Parts.** `RaceShip.parts` gives each of six parts a performance (times
   spec) and a reliability. Performance makes her handling: sails her top
   speed, rigging how fast she gathers way, rudder her turn, hull her most
   hull, keel her guns' spread, gun mounts her reload. Reliability moves the
   hull at which her zones fault (`sim/faults.ts FAULTS.minor / major`):
   sails and rigging her rigging zone, rudder her rudder, hull and keel her
   waterline, gun mounts her deck; 0.5 is today's 40 / 25. One fault system,
   main's. Every number in one named table, as a starting value.
6. **Drivers.** `RaceShip.driver` gives a bot her seed, persona and nine
   stats. Her persona and brain are untouched; her stats take the place of
   what her temper draws by seed (`sim/temper.ts skill, aggro` and the reads
   of them), by the table in `manager-c2:PROMPT.md` 5.4. Ten in every stat is
   today's bot of that seed and persona. A test a stat: two drivers alike but
   for one stat at 4 and at 16 differ the expected way over seeded races.
7. **The pit stop.** In her team's water a ship may pit. A stop is a list of
   jobs chosen up front: repair a zone (its tally cleared, the hull it took
   given back), take on gust charges, take on a repair kit. Each job takes
   time, by `PitCrew.pace`; a job may slip (`PitCrew.slip`), which adds a
   delay and harms nothing. The work runs while she stays in team water;
   leaving ends it with what is done kept. She sails on meanwhile: the race
   never pauses. Bots pit by the same rule, an option in their own choosing.
   In a carded race this takes the place of the water's passive mending
   (`faults.ts MEND`); shield regeneration stays. Card-less, MEND stays.
8. **Team orders.** `RaceShip.call`: free, attack, hold (our water), form (on
   ship 0 of the team). A call biases the weights her brain already chooses
   by; it never replaces her choosing. The player may change her team's call
   mid-race; teammates decide their own stops.
9. **Headless.** `play/race.ts runRace(card, planet, waters, pilot?)` is a
   pure function: the same card on the same planet gives the same
   `RaceResult`, hash and all, in node, in a Worker, on arm64 and x86-64. The
   player's seat with a driver on the card is sailed by a bot (the harness);
   `driver: null` is sailed by the pilot's hands (the game).
10. **The seam to the HUD.** `player.ts` gains what the race HUD shows: her
    three teammates (hull, shield, state, place), the standings tower (every
    ship: place, team, afloat, sinkings), the pit's state, her team's call.

## 4. The career (career/, store/)

Ported from `manager-c2` (`src/career/`, `src/store/`, their tests,
`tools/season.ts`), renamed by section 2, reformatted by this repo's prettier,
and resized: 3 tiers × 20 teams × 4 ships, where it had 40 crews × 2.

- Pure, headless, deterministic: no DOM, no three, no `Date`, no
  `Math.random`. A reducer over an append-only journal with checksummed
  snapshots and a backup (`manager-c2:PROMPT.md` 4.2, 4.3). Never continue past
  a failed save.
- The career never runs a race. It deals `RaceCard`s and takes `RaceResult`s.
  The other two tiers' races are real headless races (`runRace`) in a Worker
  while the player sails. No result is ever rolled.
- **Points:** 25, 18, 15, 12, 10, 8, 6, 4, 2, 1 to the first ten ships; one a
  sinking; one to the team holding the most sea at the end. A drivers' table
  and a teams' table, as MM.
- **Staff a team:** drivers (4 and a reserve), a race mechanic a ship, one
  lead designer, a pit crew, scouts, a chairman.
- **Every stat shown changes what the sim or the career does.**
- **Decisions pay**, as MM: a part risk that comes off, a cheap driver who is
  strong, training, an HQ building, a sponsor well chosen.
- **The climb is slow.** The player's team starts about 17th to 18th of 20 in
  tier 3. Tuned against three scripted managers (section 6), the player's seat
  sailed by a bot of the tier's median stats:
  - *idle* (never spends, never hires): the bottom five, and the sack;
  - *sensible*: the upper half of the tier over 4 to 5 seasons;
  - *shrewd*: promotion from each tier in 4 to 5 seasons (median), a few
    places gained in season one (17th to about 13th).

## 5. The office (ui/, the seams to it)

**Every screen is built from its MM reference, panel for panel**: the same
panels in the same places and proportions, the same content in each, the same
kind of control (stat tiles, dials, bar charts, tables). Only names and dress
change. The references are `reference/` in the main checkout
(`/Users/dk/Developer/game-portolan/reference/`, untracked: never commit one,
nor a picture that contains one). Open the reference before laying out its
screen, and compare your capture with it before you land.

- **Page:** 1180 × 820 CSS px, landscape. MM is 16:9; keep its arrangement and
  let the panels grow taller, not letterboxed.
- **Shell, as MM's:** a strip across the top (team emblem, screen title,
  balance, standings, next race, the Admiralty, notifications) and the nav
  along the bottom (back and forward, the tabs, the date, **Continue** at the
  bottom right). Tabs, as MM's: Home, Player, Mail, Ship, HQ, Team, Drivers,
  Staff, Scouting, Finances, Sponsors, Standings, Calendar.
- **Dress:** parchment panels with inked borders over the live world, dimmed
  and blurred behind them (the player's ship at anchor on the next race's
  planet). Start from the Nov 16 prototype's dress
  (`git show prototype-office:prototype/office/style.css`, `main.ts`): navy
  strip and nav, parchment panels, green, amber and red washes for data.
- **Type:** Avenir Next (the system's; no font is added) for labels, tables
  and figures; the inked serif of `ui/ink.ts` for screen titles and team names
  only. Nothing under 13 px.
- **Words:** a word stands only where MM has a label, a value or a button
  doing the same job. No sentence of explanation anywhere, not MM's own
  either (no strip subtitle, no blurb under a panel's title), and none of the
  old office's subtexts ("37th of 40", "next at 5 races").
- **Touch:** every control at least 44 × 44 px, 8 px apart. No hover.
- **The gull:** one module makes the one bust, rendered once, the same for
  everyone, the jacket in the team's colours. Swappable: nothing else knows
  how it is drawn.
- **How it is built:** HTML elements for layout, text and scrolling; SVG for
  frames, icons, charts. No framework, no CSS library, no dependency. A screen
  is one file in `ui/office/`; it draws one view model and sends commands; it
  works out no rule. Each screen's view model is its own file of `src/office/`
  (the seam), built by a selector in `career/views-*.ts` with a test. Each
  screen opens from the page's query (`?screen=<name>` on a fixture career,
  `debug.ts`) so `tools/capture.ts` can photograph it.
- **A tab not built** is shown unavailable. Nothing is filled with made-up
  content.

| Screen | Reference (reference/…) |
|---|---|
| main menu: New Career, Continue, Single Race, Preferences | 19/047 |
| create team: name, emblem, livery | 19/050, 19/052 |
| home | 00/001 |
| mail; a dilemma's choices | 00/002; 00/003 |
| drivers; a driver; an unscouted driver | 01/005; 01/004; 03/010 |
| staff; a designer; a mechanic | 02/007; 02/006; 02/008 |
| scouting; a contract offer | 03/009; 04/011 |
| sponsors; finances | 05/012; 05/013 and MM's grammar |
| team; standings; calendar | 06/014; 06/016; 06/015 |
| HQ | 07/017, 07/018 |
| ship; part fitting | 08/019; 08/020 |
| part design; part improvement | 09/021, 09/022; 10/023 |
| next season's ship (suppliers) | 11/024 |
| race preparation | 12/025, 12/026, 12/027 |
| the race HUD; the live view once sunk | 15/033 (034 to 038 beside it) |
| the pit panel; team orders | 16/039, 16/040; 16/041 |
| podium; results; team report | 17/042; 17/044; 17/043 |
| a vote; its result | 18/046; 18/045 |

**The race HUD** takes MM's arrangement round the touch controls: her vitals
card at the bottom left with the Pit button, her teammates' cards at the
bottom right, a standings tower on the left that folds away, the minimap at
the top right, the storm's clock at the bottom centre where MM has the lap.
The stick and the gun buttons stay where her thumbs are. Glyphs first at sea:
words only where MM's race screen has them. Once she has sunk: MM's full live
view (tower open, the cards, a speed control, Skip to result).

**Flow.** Title, then the menu. A career's office floats over the next race's
planet, so going to the race needs no new world. After the result, Continue
advances the calendar and the page sails to the next round's planet by the
address (`address.ts`, as a seed is sailed today), the office restored from
the save. Killed mid-race: the race is offered again from its start.

## 6. The harness (tools/)

One command makes a committed report (`docs/fairness/`) of seven claims, each
with its numbers and their spread:

1. **Deterministic.** The same seed and commands give a byte-identical season:
   run twice, and in a Worker; pinned by goldens.
2. **The same on every machine.** The same hashes on the Mac (arm64) and the
   lab's x86-64 machines; every shard run on two hosts and compared.
3. **No seat advantage.** Teams alike in everything score alike whatever
   their slot, berth or colours, within chance, over many seasons.
4. **Strength pays.** Better drivers and parts score more, monotonically.
5. **Decisions pay.** Each lever alone (a part risk, a bargain driver,
   training, an HQ building) raises points over many seasons.
6. **No hidden help.** No rule reads the player's seat (only input and camera
   do): a test, and a bot in her seat scores as in any other.
7. **The economy holds.** A median team about balances over a season; the
   leader's lead does not run away. And the three scripted managers land in
   section 4's bands.

**The fleet.** UT CS lab machines over plain ssh, as `dkumar@<host>.cs.utexas.edu`
(the Mac's key logs in; `ssh garnet '/lusr/bin/cshosts publinux'` lists 137).
Gem names are 20-thread i5-14600s (prefer them); cereal names are 16-thread
Xeons (use some for the cross-CPU check). The home directory is NFS, shared by
all: one copy of the code (rsync from the Mac, a folder a commit, no
credentials put there) and one Node (the Mac's version, installed under the
home directory; the system's is 18) serve every host. Results are files there.

Limits, the owner's, never exceeded:
- at most 30 machines at once; up to 50 only while machines are free;
- only machines with a load under 2, checked before each batch;
- every job `nice -n 19`, four threads left free a machine;
- bounded batch jobs only; nothing left running; one command stops all of ours.

## 7. Rules for all work

- `CLAUDE.md`: never merge, only rebase; commit often; one action a shell
  call; file tools for reading and editing; timeouts on anything long; never
  delete outside your worktree; test in headless Chromium; no three.js hacks.
  The target is the iPad Air M1 at 30 to 40 fps: never claim a frame rate
  from the Mac; say when a change may cost frames.
- The architecture tests are the law (`tests/architecture*.test.ts`): add a
  row for each new part of `src`; weaken no gate to land work.
- `sim/`, `world/`, `career/` are pure and deterministic. `ui/` imports no
  `play/`, `sim/` (but the storm's cap), `career/` or three. `career/` and
  `play/` do not import each other. `main.ts` wires.
- Every rule in `sim/` and `career/` has a unit test, by seed.
- No new dependency. No fallback path. No words of temporary work in `src`.
- Numbers to tune are starting values in one named table each.
- Do not edit `CLAUDE.md`. Do not touch another agent's worktree.

**Gates before landing:** `npm test` green (it type-checks, tests and checks
formatting; `npm run format` first), and for UI a capture of each screen you
touched (`node tools/capture.ts`), looked at beside its reference.

**Landing on `mm`** (never a merge), from your worktree:
1. `git rebase mm`, then `npm test`.
2. `git merge-base --is-ancestor mm HEAD` must hold.
3. Message the orchestrator: "ready to land `<your-branch>` at `<commit>`". An
   agent's worktree is isolated and cannot move `mm` itself: the orchestrator
   fast-forwards `mm` to your branch, runs `npm test` there, and answers. Carry
   on meanwhile; when `mm` has moved, go to 1 before you ask again.
Land early and often: a seam others wait on is landed the hour it is done.

## 8. Order

1. The race (section 3), goldens first. The fleet and its dispatcher beside it.
2. The career ported, renamed, resized; whole seasons headless; the report;
   the tuning of section 4.
3. The kit, the gull, the shell; then the loop: menu, create team, home, race
   preparation, the race HUD and pit panel, results, home again, saved.
4. The other screens: standings and calendar; drivers and a driver; ship and
   part fitting; part design and improvement; scouting and a contract; mail;
   sponsors and finances; staff; HQ; votes; the season's end and next
   season's ship. The HQ in 3D is last, a drawn view its fallback.
