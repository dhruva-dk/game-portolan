# Plan: depth without draw cost

Bots, loot, weapons and aim made deeper and more varied, with matches of
distinct character, measured in the headless harness, at no cost to the
frame on an iPad Air M1 (30–40 fps). New art for weapons and rarities is in
scope, paid for out of the triangle budget.

Branch `depth`, worktree `/Users/dk/Developer/game-portolan-depth`, off `main`
at b184a13. `BOTS.md` stays the bots' design and log; this file is the
roadmap above it. After a compaction, read this file, then `BOTS.md`.

---

## Headline

**Already done (on `main`, from the `bot-harness` work).** Same 16 matches,
80 bots each, before and after:

| Measure                         | Before (975191c) | Now (b184a13) |
| ------------------------------- | ---------------- | ------------- |
| Bot seconds stuck (pinned)      | 20.1 s a ship    | 4.2 s (−79%)  |
| Seconds aground                 | 3.7 s            | 0.0 s         |
| Armed, and 90% of ships by      | 85%, 27 s        | 91%, 20 s     |
| Sim step, median / worst        | 1.56 / 17 ms     | 1.6 / 13 ms   |
| Draw calls (worst view, of 100) | 70               | 70            |
| Tests                           | all pass         | 372, all pass |

**Where the `depth` branch stands (2026-11-20, morning).** The plan's
targets, measured the same way on 64 dealt matches (80 bots each) unless
said; met ✓, not met ✗, the call left to the owner ◐:

| Measure                              | Before         | Now (`depth`)                                                                                                                        |
| ------------------------------------ | -------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Distinct bot personalities           | 6, one per bot | ✓ 6 personas, each a temper and a crew, each measured apart (shots, home, dealt, taken, kills, place)                                |
| Match types                          | 1              | ✓ 4: mixed, bloodbath, gold rush, cagey. 90% armed by 13 / 13 / 11 / 34 s; half down by 60 s (bloodbath), 104 s (cagey)              |
| What can be varied in the harness    | brain tables   | ✓ brain, gunnery, option weights, rules (loot, caches, storm, assist), a player's thumb                                              |
| Combat measured in the harness       | none           | ✓ shots and hits by range, gun, rarity, skill and who laid it; damage; where hits fall on a hull; ratings by gun                     |
| Strongest personality over median    | unknown        | ✗ by 0.2 se: turtle +1.2 se over 256 matches (θ +0.03; was scavenger +7.8 se, θ +0.16); weakest brawler −4.4 se (θ −0.06, was −0.21) |
| Player assist vs best bot's hit rate | unmeasured     | ◐ measured: a player's stand-in beats sharp bots by 4 / 11 / 14 points close / mid / far; the bots' hand, A3                         |
| Sim step, median / worst             | 1.6 / 13 ms    | ✓ 1.8 / 11.9 ms (`npm run steps` on the head; main 1.6 / 13.9). It was 22 ms before the first routes were spread                     |
| Triangles, ships and coast views     | 1359k / 1304k  | ✓ 630k / 576k (worst view 893k of 900k)                                                                                              |
| Draw calls, worst view               | 70             | ✓ 77 (a palm one draw, not two; every view fewer: sea 62, coast 64, ships 64, lobby 49, map 33)                                      |
| Bot seconds stuck                    | 4.2 s          | ✓ 4.1 s (runs on this code range 3.5–4.3 s)                                                                                          |
| Guns, one against one                | unmeasured     | ◐ `duel.ts`: harpoon beats cannon, mortar far; scatter loses 19 in 20 (its spray or the gun band: the owner's)                       |

**Targets for this plan.** Each is a gate a milestone must meet, measured the
same way:

| Measure                                    | Now            | Target                                                  |
| ------------------------------------------ | -------------- | ------------------------------------------------------- |
| Distinct bot personalities                 | 6, one per bot | 6+, each with a measured, separate behaviour profile    |
| Match types (aggressive, gold rush, …)     | 1 (equal odds) | 4, chosen by match seed, each measurably different      |
| What can be varied in the harness          | brain tables   | brain + gunner + option weights + rules (guns, loot)    |
| Combat measured in the harness             | none           | shots, hits, hit rate by range, kind, skill; damage     |
| Strongest personality's rating over median | unknown        | within one standard error (none dominant)               |
| Player assist vs best bot's hit rate       | unmeasured     | assist never better than the best bot                   |
| Sim step, median / worst                   | 1.6 / 13 ms    | ≤ 2 / ≤ 16 ms                                           |
| Triangles, ships and coast views           | 1359k / 1304k  | ≤ 900k (budget), new weapon and rarity art included     |
| Draw calls, worst view                     | 70             | ≤ 80, with every weapon, rarity and shot type on screen |
| Bot seconds stuck                          | 4.2 s          | ≤ 4.2 s (no regression)                                 |

---

## 1. What already exists (so we build on it, not beside it)

Several things I proposed in conversation are already in the code. This list
is the starting point, checked against the source:

- **Five gun kinds** (`src/kinds.ts`: cannon, scatter, repeater, harpoon,
  mortar) with per-kind range, damage, reload, spread, pellets, wind-up and
  fall-off (`sim/handling.ts GUNS`, `sim/gun.ts`).
- **Five rarity tiers** that ease damage, reload and spread (`GUN.rarities`,
  `damageBy`, `reloadBy`, `spreadBy`).
- **One aim assist for player and bots alike** (`sim/gun.ts laid`): the target
  nearest the line of sight within a cone, led to where she'll be when the ball
  lands (closed-form flight, `sim/shot.ts`), land blocking the line.
- **Bot gunnery by skill** (`sim/gunner.ts`): reaction time, a wandering aim
  error a sharp captain keeps to a sixth of a green one's, an unsteady hand
  widening the spread, bursts and pauses, the gun chosen for the range
  (`armFor`), and a ring held at each kind's best range.
- **Loot with kinds and rarity weights** (`sim/loot.ts LOOT`), storm-phase
  caches of rarer goods, sunk ships spilling their cargo (`overboard`,
  `cargo`), and four stores (shields, repairs).
- **Temperament** (`sim/temper.ts`): six styles, one drawn per bot by her seed,
  her numbers nudged, plus `skill` and `aggro`.
- **The harness** (`tools/harness/`): parallel headless matches, brain
  variants, mixed fleets, paired intervals, `inspect`, `wedge`, `compare`,
  `replay`; `tests/golden.test.ts` and `tests/scenarios.test.ts`.

So the work is less "add weapons and aim" and more: **make all of it
variable, measurable, and expressed as personality and match character**, then
add new kinds and art where the numbers show a gap.

---

## 2. Ground rules

1. **Depth goes into decisions, not into things drawn.** A behaviour shows
   through what's already on screen: where a ship goes, her heading, speed,
   when she fires, the shots and the crates. New art is welcome for new
   _things_ (a weapon kind, a rarity), never as a signal for a behaviour.
2. **The sim never knows about art.** A kind or rarity is an id in `sim/`; the
   renderer maps it to a look. `sim/` and `world/` stay headless and
   deterministic (the architecture tests already enforce this).
3. **Draw calls grow with kinds, not with counts.** One instanced mesh per
   kind (or one per family with a per-instance variant index into an atlas).
   80 ships firing costs what one does.
4. **Rarity is per-instance data on a shared material** (tint, glow, a band),
   not a material per rarity.
5. **Every change is measured.** It lands with harness numbers before and
   after, logged in `BOTS.md` (bots) or here (everything else). A deliberate
   behaviour change re-records the golden hash in the same commit.
6. **Budgets are gates**, every milestone: `npm test`, `npm run check`,
   `npm run budget` (draws, triangles, passes), `node tools/steps.ts` (median
   ≤ 2 ms, worst ≤ 16 ms), and on-device frame time for anything touching the
   renderer (`tools/ipad.sh`).
7. **Rebase only, commit often, never push.** One worktree, no subagents
   unless asked.

---

## 3. Workstreams

### H. Harness first (prerequisite for everything else)

The harness is good at motion and choices, blind to combat, loot and
personality. Close that before tuning anything it can't see.

| Step | What                                                                                                                                                                                                                                                                                                   | Files                                            | Gate                                                                       |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ | -------------------------------------------------------------------------- |
| H1   | **Combat stats per ship:** shots, hits, hit rate by range band, gun kind and rarity; damage dealt and taken; kills; time in hand per kind. Read from `state` reports (`gunfire`, sinkings), not by reaching into sim.                                                                                  | `tools/harness/metrics.ts`, `summary.ts`         | numbers agree with `tools/matches.ts` on the same seed                     |
| H2   | **Fold `tools/matches.ts` into the harness** (its armed, hits, territory and stuck figures), then delete it. Two definitions of "stuck" today (15 m in 30 s there; pinned episodes here).                                                                                                              | `tools/matches.ts` (gone), `tools/harness/*`     | every figure it printed is in `summary`                                    |
| H3   | **Results by personality**: group by temper style (and by persona once P2 lands), not only by brain.                                                                                                                                                                                                   | `run.ts` records each ship's style; `summary.ts` | six rows per brain                                                         |
| H4   | **Rules overrides in a run** (`Spec.rules`): variant gun, rarity, loot and storm tables, separate from brains, since they are the game's rules, not a mind's. Needs the Rules seam (R2).                                                                                                               | `tools/harness/rules.ts` (like `brains.ts`)      | a `--rules` variant changes the result; the default leaves the golden hash |
| H5   | **Match type as a spec field** once P3 lands; sweep over types.                                                                                                                                                                                                                                        | `run.ts`, `cli.ts`                               | per-type summary                                                           |
| H6   | **Tournament ratings**: a Plackett–Luce (ranking) model fitted to placements over mixed fleets, with standard errors; `tools/harness/rate.ts`. Round-robins personalities, brains or rules.                                                                                                            | new `rate.ts`                                    | stable ratings over two seeds of 64 matches                                |
| H7   | **A stand-in player** for aim-assist fairness: a scripted "player" ship that aims through the camera line exactly as the player does (centre of screen on the foe with human-like jitter), so assist hit rate can be compared with bots'. It measures fairness, not feel; feel needs hands on an iPad. | `tools/harness/player.ts`                        | hit rate by range for assist on/off                                        |
| H8   | **Replay shows combat and personality**: shots and hits as marks, the persona in the inspector.                                                                                                                                                                                                        | `replay.ts`                                      | headless Chromium check, no errors                                         |

### A. Aim

| Step | What                                                                                                                                                                                                                                                   | Gate                                                    |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| A1   | **`GUNNER` into the brain** as a `gunner` slice (it is module-private today, so no variant can touch aim). Same pattern as the other parts: the part reads `c.b.gunner`; the architecture tests' own-slice rules extend to it.                         | golden hash unchanged (pure refactor)                   |
| A2   | **Measure**: hit rate by skill, range and kind (H1), with the stand-in player (H7) beside the bots.                                                                                                                                                    | a table in this file                                    |
| A3   | **Tune the assist curve** (cone width, how the pull fades with angle, how far the lead is trusted) so the player's assisted hit rate sits at or below the best bots' at each range. One function, two users: player and bots stay on the same physics. | assist ≤ best bot at every range band                   |
| A4   | **Skill shows in aim style**, not only error size: a green gunner leads too little on a crossing target and over-corrects; a sharp one leads true. Readable from the shots alone.                                                                      | hit rate monotone in skill; replay shows the difference |

### P. Personalities and match character

The ask: some seeds give really aggressive matches with aggressive bots.
Today the six styles are drawn with equal odds, so every match has about the
same mix, and a style changes only a bot's temper numbers, never how her crew
works.

| Step | What                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Gate                                                                                                                           |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| P1   | **Option weights into the brain** (`mind.weights`). `OPTIONS` in `bot.ts` holds them as literals (storm 6, heal 3.5, flee 3.3, fight 2.6, hunt 2, loot 1.8, claim 1.5), out of reach of variants and personas.                                                                                                                                                                                                                                                                                                                  | golden unchanged                                                                                                               |
| P2   | **A persona = temper numbers + a brain override** (`sim/persona.ts`): `{ style, over: Over }`, where `Over` is the harness's existing `variant` shape moved into `src`. An aggressive persona is high fight, low run, close standoff, high aggro, _and_ a brain that hears guns further (`hunting.earshot`), rams keener (`ramming`), never hides (`mind.cover: 0`), fights near the storm edge (`storming` margin), weights fight and hunt higher (`mind.weights`). Each persona's brain is built once per match, not per bot. | each persona's behaviour profile (fight time, nearest-foe distance, rams, place) apart from the rest by more than its interval |
| P3   | **Match types from the match seed** (`sim/persona.ts matchMix`): weights over personas. Bloodbath (brawlers and hunters), gold rush (scavengers, richer loot table), cagey (turtles and homesteaders), mixed (as today). The match type can also pick a rules variant (a gold rush has more loot). Deterministic: same seed, same match.                                                                                                                                                                                        | per-type summaries differ: bloodbath has the shortest median match and most kills                                              |
| P4   | **Mood that moves**: `aggro` rises with a sinking she dealt, falls with damage taken and with each storm phase, inside her persona's band. A new memory slice owned by the captain.                                                                                                                                                                                                                                                                                                                                             | spread of behaviour within one persona grows; no persona's rating moves outside its interval                                   |
| P5   | **Legible without new effects**: behaviour first (a brawler charges, a turtle hugs the calm). Optionally a sail tint per persona (one per-instance number) and the persona in the kill feed ("sunk by a raider").                                                                                                                                                                                                                                                                                                               | budget unchanged; playtest: can you name the aggressive bots after a minute                                                    |
| P6   | **Balance**: the tournament (H6) over personas and match types. No persona dominates; each wins some match type.                                                                                                                                                                                                                                                                                                                                                                                                                | strongest within one standard error of the median, per match type                                                              |

### W. Weapons

Five kinds exist. Make them data that varies, then add kinds only where the
numbers show an empty niche.

| Step | What                                                                                                                                                                                                                       | Gate                                                  |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| W1   | **Gun tables behind the Rules seam** (R2), so harness rule variants can change them.                                                                                                                                       | golden unchanged with default rules                   |
| W2   | **Map the niches**: damage per second by range for each kind and rarity (from the tables, and measured by H1). Find the gaps (for instance, nothing that rewards broadside position, nothing that denies an area).         | a chart in this file                                  |
| W3   | **Tactics per kind**: the tactician already keeps each kind's best range. Add a stance per kind where it matters (harpoon: hold a long line and pull; mortar: keep land between; scatter: close in fast, ram when loaded). | per-kind hit rate and kills rise; stuck seconds don't |
| W4   | **New kinds, only for the gaps W2 finds** (one or two at most), each a row in `KINDS` and `GUNS`, a stance, art (G2), a sound. Each is balanced in the tournament before its art is final.                                 | no kind dominates in the tournament; budgets hold     |

### L. Loot

| Step | What                                                                                                                                                                                                                                                | Gate                                           |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| L1   | **Loot stats** (H1 extension): pickups by kind and rarity, time on the water, drops fought over (two or more ships within 150 m of a piece when it's taken).                                                                                        | in `summary`                                   |
| L2   | **Loot tables per match type and storm phase** behind the Rules seam (the caches already rise in rarity by phase).                                                                                                                                  | gold rush arms faster than bloodbath           |
| L3   | **New goods only where they change decisions**: a sail (speed for a while), plating (hull cap), a powder cask (next reload faster). Each needs a sim effect, a purser score, a HUD line, a crate look (G2), and a harness check that bots value it. | each new good is picked up and changes a fight |

### G. Graphics and art

| Step | What                                                                                                                                                                                                                                                                                                                                                                     | Gate                                                  |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| G0   | **Pay back the triangle overruns before adding art.** Today: ships view 1359k, coast 1304k (budget 900k); map 3517k (its own 1000k). Find what's spending them (`budget` split by system) and cut with level of detail at distance, not by lowering near quality.                                                                                                        | all views within budget                               |
| G1   | **A worst-case budget scene**: 80 ships, each with the heaviest gun of the highest rarity, every shot type in the air, every crate type on the water.                                                                                                                                                                                                                    | draws ≤ 80, triangles ≤ 900k, passes unchanged        |
| G2   | **Art per weapon kind and rarity** under the rules in §2: one instanced mesh per kind (or one atlas mesh with a variant index), rarity as per-instance tint and glow on a shared node material, three levels of detail (a gun on a ship is a few pixels at play distance). Crates the same. Muzzle flashes and hits from the one shared puff pool `gunfire` already has. | G1 holds; on-device frame time unchanged within noise |
| G3   | **An art seam** for weapons and crates: today their geometry is built in code (`loot/loot.ts gun(kind)`). Authored models will be a second source, so this becomes a real seam (two adapters): a table of kind → geometry and LODs, procedural or loaded.                                                                                                                | swapping one kind's look touches one row              |

### R. Architecture fixes

From the review below. Each is a refactor that leaves the golden hash alone,
unless it says otherwise.

| Step | What                                                                                                     | Why first                                                    |
| ---- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| R1   | Split `sim/bot.ts` along the crew lines BOTS.md already draws, and break the crew's import cycle (§6.1). | P1, P2 and P4 all land in `bot.ts`; it is 759 lines already. |
| R2   | The Rules seam (§6.2).                                                                                   | H4, W1, L2 and P3 need it.                                   |
| R3   | One measuring path: `tools/matches.ts` into the harness (H2).                                            | two sources of truth for "stuck"                             |
| R4   | `state.debug` out of the production state object (§6.3).                                                 | small; reduces what the live game carries                    |
| R5   | Gunfire split by mesh (§6.4).                                                                            | before G2 adds per-kind looks                                |
| R6   | The art seam (G3).                                                                                       | before G2                                                    |

---

## 4. Order and milestones

Each milestone ends green on every gate in §2 and is logged.

| Milestone       | Steps                         | Output                                                                       |
| --------------- | ----------------------------- | ---------------------------------------------------------------------------- |
| M1 Foundations  | R1, R2, A1, P1, R3/H2, H1, H3 | everything variable and measured; golden hash unchanged                      |
| M2 Measure      | H4, H6, H7, A2, W2, L1        | tables in this file: hit rates, niches, loot flow, ratings of today's styles |
| M3 Personality  | P2, P3, H5, P4, P6, P5        | match types and personas, balanced; new golden hash                          |
| M4 Combat depth | A3, A4, W3, L2                | assist fair, skill readable, stances per kind                                |
| M5 Art budget   | G0, G1, R5, R6                | room for art, and the seams it needs                                         |
| M6 New things   | W4, L3, G2, H8                | one or two new kinds and goods, with art, balanced                           |
| M7 Review again | §7 re-run                     | the review's findings closed or re-justified                                 |

M1 and M2 come before anything a player sees, because tuning what you can't
measure is guessing. M5 can run beside M3 and M4 (different files).

---

## 5. Risks

| Risk                                                                                     | Mitigation                                                                                                       |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Threading rules through the sim slows the hot loops (megamorphic objects, extra lookups) | One rules object per match, every table in one shape (as `variant` does for brains); `steps.ts` before and after |
| Personas make matches feel random rather than characterful                               | Few match types, strongly different; playtest each; the kill feed names them                                     |
| Aggressive personas raise stuck time (more ramming near shore)                           | Stuck seconds is a gate on every milestone; scenarios for ramming near land                                      |
| Balance by harness overfits to bots and misses how players play                          | The stand-in player (H7), then real playtests on device before anything ships                                    |
| New art blows the iPad budget                                                            | G0 and G1 first; art lands only inside the worst-case scene's budget                                             |
| The golden hash churns and hides an unintended change                                    | Refactor commits must leave it; behaviour commits change it alone, with numbers in the log                       |

---

## 6. Review: a harsh senior staff graphics and gameplay pass

Measured on `main` at b184a13: 195 files and 47.7k lines in `src`, 372 tests,
budgets as in the headline. The good first, briefly, because it is what to
protect.

**What's strong.**

- **The layering is real and enforced.** `sim/` imports only `world/` and
  `kinds.ts`; nothing in the sim knows three.js. Architecture tests police
  layers, cycles, determinism, `any`, parameter counts, clones, colours,
  pointers, the frame owning every pass, exports nobody uses and file size.
  Few codebases this size have that.
- **Determinism is bit-exact and tested** (golden hash), which is what makes
  the harness trustworthy.
- **Draw calls are low** (70 of 100 at worst) and passes fixed at 15.
- **The bot crew has a real design** (lookout, captain, tactician, pilot,
  helmsman, gunner), with per-part tuning and memory, and tests that stop the
  sailing parts from knowing about modes.

**What's wrong**, most severe first:

### 6.1 The bot crew is one knot, and `bot.ts` is the captain plus four other jobs (severity: high)

- `sim/bot.ts` is 759 lines. It holds the lookout (`SIGHT`, `perceive`,
  `hidden`), the captain's choice (`decide`, `OPTIONS`), and the storm, fight,
  flee and roam options with their tuning (`STORMING`, `ROAMING`, `stormUrge`,
  `stormGoal`, `keptInside`, `fightUrge`, `holdBack`, `losing`, `evading`,
  `away`, `cover`, `roamGoal`). BOTS.md's own table says the lookout should be
  `sim/lookout.ts`; it never moved.
- There's a 9-file import cycle among `bot`, `captain`, `brain`, `purser`,
  `hunter`, `tactician`, `pilot`, `helmsman` and `claimer`. It's type-only, so the cycles
  test lets it through and it costs nothing at run time. But it means no part
  can be read alone. The cause is that `captain.ts` does three jobs: it holds
  the shared `Ctx`, it holds geometry helpers (`between`, `open`, `rotate`),
  and it assembles `Memory` by importing every part's memory type. Meanwhile
  `brain.ts` imports every part's tuning table, and `bot.ts` owns four of them.
- **Option weights are literals** in `OPTIONS`, and **`GUNNER` isn't in the
  brain**. So two of the biggest personality levers can't be varied by the
  harness or by a persona.
- **Two personality systems overlap with no rule between them.** `Temper` (per
  bot, numbers) and `Brain` (per fleet, tables) both shape "how aggressive she
  is": `t.fight * (0.6 + 0.4 * t.aggro)` in `fightUrge`, and `MIND`'s weights.
  Nobody can say which knob to turn for "more aggressive".

**Fix (R1, P1, P2, A1):**

- `captain.ts` becomes a leaf, `crew/ctx.ts`, holding only the context type
  and shared geometry. It imports no part.
- `Memory` and `Brain` are composed in one place, `crew.ts`, the only module
  that knows the list of parts.
- `bot.ts` splits into `lookout.ts`, `storming.ts`, `fighting.ts` (fight, flee
  and cover) and `roaming.ts`. `bot.ts` keeps only `think`, `decide` and the
  option list, about 200 lines.
- Option weights and `GUNNER` go into the brain.
- A persona is defined as temper plus brain override (P2), and the rule is
  written into BOTS.md: temper is who she is, brain is how her crew works.
- Add an architecture test that forbids type cycles inside `sim/` too.

### 6.2 The game's rules are module constants: nothing can vary them (severity: high, for this plan)

- `GUNS`, `GUN` and `FALLOFF` (`handling.ts`), `LOOT` (`loot.ts`) and `STORM`
  (`storm.ts`) are imported directly wherever they're read.
- So a harness run can't try a different gun table, a match type can't carry a
  richer loot table, and a weapon variant means editing source and
  re-recording the golden hash.

**Fix (R2):**

- A `Rules` object with those tables, made once per match and passed through
  `createState` to the sim the way `Brain` is.
- Default rules are the current constants (golden hash unchanged); harness
  variants are a second adapter, so this is a real seam.
- Keep one shape for every rules object so the hot loops stay monomorphic,
  and gate on `steps.ts`.

### 6.3 `play/state.ts` is deep but carries debug and holds everything in one closure (severity: medium)

- 868 lines, imports 33 files, about 20 mutable `let`s in one closure. Its
  interface is small (`start`, `advance`, reads), so the deletion test says it
  earns its place: it's a deep module, not a god object.
- Two faults:
  - It ships a `debug` sub-interface (`atSea`, `strew`, `sink`, `mindOf`)
    inside the production object.
  - Its phases (`sail`, `fight`, `hold`, `rideOn`, `founderAll`) are internal
    seams that are tested only through the whole. A bug in looting is found
    by a whole-match golden diff, not by a focused test.

**Fix (R4):**

- Move `debug` into a separate module that the tools and debug page build on
  top of the state, through an internal seam, not the public interface.
- Later, and only if a phase grows, give phases their own modules with their
  own tests.
- Don't split it for size alone.

### 6.4 The render modules for shots and loot are monoliths, just before we add art to them (severity: medium)

- `gunfire/gunfire.ts` is 911 lines, the biggest file in `src`: balls, marks,
  puffs and their shaders in one module. `loot/loot.ts` (543) builds each gun
  kind's crate geometry procedurally (`gun(kind)`).
- G2 will add per-kind and per-rarity looks to both. Done in place, that
  doubles them.

**Fix (R5, G3):**

- Split `gunfire.ts` by mesh: balls, marks and puffs.
- Make weapon and crate looks a table of kind → geometry and levels of
  detail, procedural now and authored later. With two sources that's a real
  seam.

### 6.5 The triangle budget is broken in three of five views, and nothing stops it getting worse (severity: high for art)

- **Ships** 1359k, **coast** 1304k against 900k; **map** 3517k against its own
  1000k.
- `npm run budget` reports OVER and exits 0, so the overrun is tolerated, and
  every art change would add to it unnoticed.
- 15 passes a frame is also a lot for a tile-based mobile GPU: each pass is a
  render-target switch and a round trip through memory. The budget counts
  them but nothing ties them to measured device time.

**Fix (G0, G1):**

- Cut back to budget with level of detail at distance.
- Make `budget` fail when a view is over (each view's exception written down
  with a reason, like the architecture tests' exceptions).
- Add the worst-case scene.
- For passes, measure device frame time per pass on the iPad once
  (`tools/ipad.sh`) and record which passes could merge. Don't merge blind.

### 6.6 Two ways to measure a match (severity: medium)

- `tools/matches.ts` and `tools/harness/` both run whole matches, with
  different "stuck" definitions (15 m in 30 s there; pinned episodes here),
  and only `matches.ts` counts hits. Two sources of truth will drift.

**Fix (R3/H2):** fold `matches.ts` into the harness and delete it.

### 6.7 Smaller findings (severity: low)

- **Debug code ships in the production bundle.** `debug.ts` (612 lines,
  importing `play` and `sim`) is imported statically by `main.ts`. Check the
  built bundle; if it's there, load it with a dynamic import behind the debug
  switch.
- **A render module reads sim tables directly.** `sky/storm-field.ts` imports
  `sim/storm.ts` as values, where other render code reads the snapshot. It's
  allowed by the layer table, but it's a second path for storm state; route
  it through the snapshot.
- **`palette.ts` has 56 exports.** That's fine for named colours, but group
  the world's colours by system so a new rarity's tint has an obvious home.
- **The golden test covers one seed for 300 s.** Add a second, short golden
  on a seed with many personas once P3 lands, so match types are protected
  too. _Done: one for each other type (log)._
- **Choosing personalities is unweighted**
  (`styles[Math.floor(u() * styles.length)]`), which is why every match looks
  alike. P3 fixes it.

---

## 7. Improve-codebase-architecture run

Run with the deep-module method: depth is what a caller gets per unit of
interface; the deletion test checks whether a module earns its place; one
adapter is a hypothetical seam, two are a real one. Candidates, best first:

| #   | Module / cluster                                           | Today                                                                                                                                                                                              | Deletion test                                                                                         | Proposal                                                                                                                                                                                                                                                         | Seam real?                                                                     |
| --- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 1   | **The crew** (`bot`, `captain`, `brain`, 6 parts)          | Interface is `think(own, others, sea, memory, nature)`: small and good. But adding a part means editing `captain.ts` (Memory), `brain.ts` (Brain), `bot.ts` (OPTIONS) and the harness's `variant`. | Delete `captain.ts`: its helpers and types reappear in every part. It earns its place, but as a leaf. | A **part registry** in `crew.ts`: each part exports `{ tuning, memory(), options? }`; `Brain`, `Memory`, OPTIONS and `variant` are derived from the list. Adding a part (a gunner slice, a mood) is one new file and one line. `think`'s interface is unchanged. | Yes: brains already vary (default and variants), and personas will.            |
| 2   | **Rules** (`GUNS`, `GUN`, `LOOT`, `STORM`)                 | Constants imported in a dozen places.                                                                                                                                                              | No module to delete; complexity is spread across readers.                                             | One `Rules` value through `createState`; readers take it from context. Interface: the tables, nothing more.                                                                                                                                                      | Yes once harness variants or match types exist (M1–M3); premature before that. |
| 3   | **Personality** (`temper.ts` + brain variants)             | Two overlapping mechanisms; the variant builder lives in `tools/`.                                                                                                                                 | Delete `temper.ts`: its draw moves into the persona; nothing else is lost.                            | `sim/persona.ts`: `personaOf(matchSeed, botSeed) → { temper, brain }`, the match mix inside it. `variant` moves from `tools/harness/brains.ts` into `src` (personas need it at run time).                                                                        | Yes: several personas, several match types.                                    |
| 4   | **Match measurement** (`matches.ts`, `harness/metrics.ts`) | Two implementations of the same questions.                                                                                                                                                         | Delete `matches.ts`: nothing lost once H2 lands.                                                      | One `metrics` module observing `state` through its public interface.                                                                                                                                                                                             | Not a seam: one module.                                                        |
| 5   | **Shots and crates' looks** (`gunfire.ts`, `loot/loot.ts`) | Geometry built inline per kind.                                                                                                                                                                    | Splitting doesn't remove complexity; a table removes the per-kind branching.                          | `looks.ts`: `kind → { geometry by level of detail, rarity tint rule }`. `gunfire` and `loot` draw from it.                                                                                                                                                       | Yes when authored art arrives (procedural and authored adapters).              |
| 6   | **The match state** (`play/state.ts`)                      | Deep: small interface, large implementation.                                                                                                                                                       | Delete it and everything falls apart: it earns its place.                                             | Leave the interface. Move `debug` out (R4). Split phases into modules only when one needs its own tests.                                                                                                                                                         | n/a                                                                            |

Rejected:

- **Splitting `play/state.ts` or `play/game.ts` for size alone.** Their
  interfaces are small; splitting would make them shallower.
- **A "Router" or "Steering" interface for the pilot and helm.** Each has one
  adapter, so the seam is hypothetical until a second router exists. BOTS.md
  already says "later".

**Order:** 1 and 2 in M1 (they unblock everything), 3 in M3, 4 in M1, 5 in
M5, 6 any time. Each lands as a refactor commit that leaves the golden hash,
then the behaviour commits on top.

---

## 8. Log

- 2026-11-20: worktree made. `main` fast-forwarded to `bot-harness`
  (b184a13); stale worktrees and fully merged branches removed (manager work
  kept). Uncommitted iPad stick work from the old `ipad-fixes` worktree saved
  to `~/Downloads/ipad-fixes-uncommitted.patch`. Baseline: 372 tests pass;
  budget as in the headline. This plan written.
- 2026-11-20 (G0): where the triangles go (`node tools/budget.ts --split`).
  Every view's triangles are in its one world pass; the other 14 passes are
  post (bloom, shafts, grade: a quad each), and the land's shadow map (2048²)
  is drawn again only when the sun or the place moves (2.4k tri, a frame in a
  hundred). So it is the land's things, not passes: coast 1304k = palms coarse
  298k, palms 239k, rocks 175k, shrubs 172k, terrain 151k, shrubs coarse 125k,
  rocks far 46k, sea 30k, ship 18k; ships 1359k the same plus 36k more ship;
  sea 822k = palms coarse 219k, terrain 148k, shrubs 125k, shrubs coarse 95k,
  palms 70k; lobby 814k = palms 282k, shrubs 212k, rocks 139k; map 3517k =
  palms coarse 2413k, rocks far 578k, shrubs 165k, palms 158k. Two causes:
  the coarse palm (~1100 tri) is the last level, drawn out to the horizon and,
  from space, over the whole lit planet (some 2200 palms); and the tiles the
  shadow map covers (143 m round the land tile nearest the eye) are drawn at
  full detail in the world pass, seen or not, however far off (the map's
  near palms, shrubs and rocks are those, 1200 m away).
- 2026-11-20 (G0 done): every view within budget. The shadow map's
  stand-ins have their own instances (`land/site.ts` casting), so the world
  pass draws only tiles in view, each at its distance's level; palms gain far
  (past 220 m, 320 tri) and distant (past 600 m, 44 tri: a blade a frond)
  levels, shrubs far (past 220 m, 20 leaves), rocks distant (past 600 m);
  one table of reaches in `land/groves.ts` (REACH). Far levels use fewer
  shapes (palms two leans then one, shrubs one) to hold the draws.

  | view  | before             | after          |
  | ----- | ------------------ | -------------- |
  | sea   | 69 draws, 822k tri | 70 draws, 477k |
  | coast | 70 draws, 1304k    | 73 draws, 576k |
  | ships | 70 draws, 1359k    | 73 draws, 630k |
  | lobby | 54 draws, 814k     | 59 draws, 259k |
  | map   | 60 draws, 3517k    | 34 draws, 513k |

  Passes unchanged (15). Ashore, 14 m up among the palms: 974k to 674k.
  Judged by eye and by pixel diff against the old captures: under 0.15% of
  pixels differ in any view, all on palms 90–300 m off; ashore 0.03%. From
  space the palms and rocks read as before (blade shaded and sized to match a
  crown's leaflets). The map's own 1000k limit is dropped: it is held to the
  sea's 900k. `npm run budget` already exited 1 when a view was over (§6.5's
  "exits 0" was stale); it is the gate.

- 2026-11-20 (R1, A1, P1): the captain split along her crew's lines
  (`lookout`, `storming`, `fighting`, `roaming` parts); her option weights
  and gunnery are brain slices. Golden unchanged.
- 2026-11-20 (R2): a match carries its rules (`sim/rules.ts`: loot table,
  storm table), read where loot is laid (`loot.ts laying`) and the storm
  planned; `Storm.final` so nothing else reads its phases; `variant` moved
  into `src` (`sim/tables.ts` holds `merged`, `weighed`). Golden unchanged.
- 2026-11-20 (H1–H3): the harness counts the fighting from `advance`'s
  report (shots, strikes, splashes, pickups); a block per persona and per
  match type; `tools/matches.ts` deleted, its figures reproduced on match 1.
- 2026-11-20 (P2, P3, H5): `sim/persona.ts`. A persona is a temper and a
  crew (shares of the brain she sails: options' weights, ear, eye, cover);
  four match types dealt by seed (mixed 55%, bloodbath, gold rush, cagey),
  each a persona mix and rules; `--type` runs one. Bloodbath is the
  shortest (376 s, against 420 mixed and 453 cagey), gold rush lays 618
  pieces and arms a second kind most (75%), cagey arms slowest (90% by 38 s)
  and holds the most water. Golden → `cb57b52c` (BOTS.md log has the table).
- 2026-11-20 (H6): `tools/harness/rate.ts`, Plackett–Luce ratings (worst
  first) with bootstrapped errors; the summary rates personas, and within
  each type. Two sets of 64 matches agree on the order (BOTS.md log).
- 2026-11-20 (P4, P6, R4): mood moves (damage cools, a kill warms, it
  settles back); four balance passes, two kept. Spread of θ 0.63 → 0.38 and
  0.57 → 0.35 on two independent sets; brawler −0.34 → −0.17/−0.20. The
  gate (strongest within one se of the median) is not met: the scavenger's
  edge is sitting out the fights, and held through every change to her
  loot. BOTS.md has the table and what was dropped as noise. `debugOf(state)`
  replaces `state.debug`. Golden → `1655ebe1`.
- 2026-11-20 (H4, L1, W2): `--rules` variants; loot flow in the summary
  (pieces laid with the match are taken after 23 s on the water, 67% with
  another ship within 150 m; drops after 21 s, 81%). The gun niches
  (`tools/harness/niches.ts`, 64 dealt matches):

  | gun      | on paper, hp/s common (20 / 70 / 100 / 150 / 200 m) | home close / mid / far | hp a shot | in a match, hp/s close / mid |
  | -------- | --------------------------------------------------- | ---------------------- | --------- | ---------------------------- |
  | cannon   | 33 / 33 / 33 / 27 / 17                              | 88% / 51% / 21%        | 16.9      | ~29 / ~15                    |
  | scatter  | 48 / 24 / 0 / 0 / 0                                 | 95% / – / –            | 41.6      | ~31 / 0                      |
  | repeater | 43 / 43 / 39 / 21 / 0                               | 67% / 24% / –          | 5.0       | ~29 / ~9                     |
  | harpoon  | 28 at every range to 240                            | 98% / 94% / 82%        | 68.9      | ~24 / ~23                    |
  | mortar   | 23 from 30 to 220 m                                 | 80% / 62% / 21%        | 32.4      | ~12 / ~9                     |

  The gaps:
  - **Close in, three guns tie** (~30 hp/s). The scatter, the close gun,
    is no better there than the cannon or the repeater.
  - **Mid range is the harpoon's alone**, by half again over the cannon.
    Only its rarity (4% of pickups) holds it.
  - **The mortar is weakest everywhere.** Its niche (over land, and a splash
    for a crowd) goes unused: no bot keeps land between herself and a foe.
  - **The repeater is two shots in three, and sprays at mid range** (24% home).
  - **No gun rewards a broadside, and none denies an area over time.**

  W3's stances are aimed at the first three.

- 2026-11-20 (G1): `npm run budget` has a `worst` view: 79 ships packed in a
  fan ahead of her (`?pack`), each with a legendary gun, the kinds in turn
  (`?arm`), six seconds into fighting; her own gun fired; a row of every kind
  of piece and stores under her. 86 draws, 903k triangles, 15 passes: the
  ships 225k, all five guns 18k in five draws, the loot 41k in eight, the
  gunfire 8k in three. **The gate (≤ 80 draws) is missed by 6.** Rarity
  costs no draw and neither do more ships or pieces; each kind of gun costs
  two (on the ships, on the water), and that is the 6. One merged mesh per
  system would pay ~5× the vertices per gun (the masked shapes still run the
  vertex stage), over 900k; a vertex-pulled single draw would not, but it is a
  lot of machinery for ~0.3 ms of draw CPU on the M1. That choice is G2's
  (one mesh per kind, or one atlas mesh with a variant index); until then the
  view is held to what it measured (86 draws, 920k) so no new draw lands
  unnoticed. A sixth gun kind would cost two more. Headless frame 7 ms CPU.
- 2026-11-20 (G1 done): the gate met, not by the guns but by the palms.
  Each palm shape was two draws, trunk and crown, apart only for their
  lighting; a leaf's light is the toon's and the sun through it from
  behind, so `light.leaf` takes how much comes through (crown 1, trunk 0:
  the trunk lit as toon is, to the bit) and one double-sided material draws
  both (`land/palms.ts`). Nine draws fewer in the worst view, and some in
  every view; triangles unchanged everywhere:

  | view  | before   | after    |
  | ----- | -------- | -------- |
  | sea   | 70 draws | 62 draws |
  | coast | 73 draws | 64 draws |
  | ships | 73 draws | 64 draws |
  | lobby | 59 draws | 49 draws |
  | map   | 34 draws | 33 draws |
  | worst | 86, 896k | 77, 896k |

  Pixel diff against the old captures (all six views, and ashore among the
  palms looking down on the crowns): the pixels more than 16 levels off are
  0.02–0.34%, as the old captures differ from themselves (0.02–0.29%: the
  grain, drifting clouds, the sails); the nearest crowns, enlarged, are the
  same. The worst view is held to 77. The guns' two draws a kind stay G2's.

- 2026-11-20 (W3): a stance with each gun, as brain knobs (`gunnery.rush`,
  `gunnery.reach`, per kind): rush in with a loaded scatter and stand off
  reloading; hold a repeater's fire till nearer. **Neither makes a bot
  stronger**: on 128 fresh matches every variant is within 0.7 se of the
  game's (a first set's +0.07 was noise; BOTS.md has the table). The rush
  changes the fight (more kills, more damage taken), not the outcome. The
  knobs stay, all off; the game is unchanged. So the niche gaps above are
  the guns' own numbers to close (W2's table), not the bots' stances.
- 2026-11-20 (H7, A2): a stand-in for a player (`tools/harness/player.ts`,
  `--players k`): her gun laid along the chase camera's line through the
  middle of the screen, on her foe's body as it was 0.2 s ago, the reticle
  wandering 0.04 rad; the assist became a match rule (`rules.aim`, so
  `--rules noAssist` takes it away), and `laid` takes a record (its 8-argument
  exception is gone). `tools/harness/aim.ts` reports shots home by who laid
  the gun (the stand-in, or bots by skill third) and range band. On 64
  matches, close / mid / far, all guns:

  | who        | assisted        | no assist       |
  | ---------- | --------------- | --------------- |
  | stand-in   | 85% / 50% / 47% | 48% / 2% / 2%   |
  | green bots | 69% / 27% / 33% | 68% / 25% / 22% |
  | fair bots  | 75% / 30% / 28% | 72% / 30% / 23% |
  | sharp bots | 81% / 39% / 33% | 80% / 38% / 17% |

  Bots' hit rates already climb with skill. The assist does all a thumb's
  aiming: a sloppier thumb (0.3 s late, 0.07 rad of wander) hits the same, to
  the point; without it a thumb barely hits past the scatter's range. So the
  player's edge over the sharpest bots (+4 / +11 / +14 points) is not the
  assist, which bots use too: it is the bots' unsteady hand, their spread
  `1 + 4.5 (1 − skill)` times the gun's, the player's the gun's own.

- 2026-11-20 (A3): **not tuned; a design call left open.** The gate (the
  player at or below the best bots) can only be met by narrowing the
  assist, and the numbers above say a narrower cone takes a thumb from 50%
  at mid toward 2% long before it touches the bots, whose own eye already
  sits on the body. The lever that moves the gap is the bots' hand
  (`unsteady` in gunner.ts: at skill 0.9 it is 1.45×); bringing a sharp bot
  to the gun's own spread puts her level with a player. Which side should
  give is how the game should feel, so it is the owner's: the knobs, and
  the harness to measure either choice, are in place.
- 2026-11-20 (A4): **tried, measured, dropped.** A gunner who leads short
  by her greenness (she laid 1 + (1 − skill)(swing·w − under) of the true
  lead, through the assist) and the harness's new measure of it: where her
  balls come down about a ship under way, within 40 m, astern of her middle
  or ahead (`ShipResult.fell`, by range; `aim.ts`). Bots' shares did follow
  skill (0.44 / 0.60 / 0.79 by thirds at `under` 1), but on 32 matches a run,
  close / mid:

  | astern of her middle | green     | fair      | sharp     |
  | -------------------- | --------- | --------- | --------- |
  | the game (control)   | 50% / 46% | 50% / 50% | 53% / 51% |
  | leading short, deep  | 57% / 57% | 56% / 62% | 56% / 58% |

  Every third moves alike and hit rates not at all: bots fight close, where
  the whole lead is a few metres along a 30 m hull, under a spread of as
  much. Skill already reads in how often she hits (A2); a style of lead does
  not read in this game's fighting, so the code is gone and the golden is
  unchanged. The measure stays for any later try.

- 2026-11-20 (G2, first slice): **a ship's gun shows its rarity**: its
  bronze cast in its rarity's light and a rim of it where it turns from the
  eye, as a floating piece has (`ship/arms.ts`, `gunSurface`'s tint). The
  light rides in the instance's three spare floats: no draw, no attribute,
  no triangle more (the worst view 77 draws, 919k, as before). Uncommon,
  rare and epic read plainly across a deck; **legendary barely does**, its
  orange (#FFA21F) near the gilded bronze every common gun wears (#F5C542).
  Making it pop means a plainer bronze for common guns: an art call left to
  the owner. `?rarity=` (or `all`) arms the fly view's ships so.
- 2026-11-20 (H8): the replay (`tools/harness/replay.ts`) draws each shot
  as a line from her to where it came down, by its gun's colour, a hit
  solid with a burst, a miss faint with a ring; a ship followed shows her
  persona, skill and her tally to the moment (shots, hits, kills, dealt,
  taken); a legend for both. A full match's page grows 3.7% (1.63 to
  1.69 MB).
- 2026-11-20 (§6.7): debug.ts no longer ships in the release script: main.ts
  loads it by `import()` only on the dev server or with `?debug` (an
  architecture test holds it). Bytes about even (the shared code splits into
  a chunk of its own), but the release neither fetches nor runs it.
  `sky/storm-field.ts` took no storm state from `sim/storm.ts`, only the
  cloud's fixed base height, so it is not routed through the snapshot; it
  now imports that constant alone, and a test holds render code to types and
  `CLOUD` from that file.
- 2026-11-20 (L2): loot and caches by match type behind the Rules seam
  (`persona.ts` TYPES; `loot.ts` `cache.more`, pieces added to each cache as
  the storm closes). Gate met: a gold rush arms 90% of ships by 11 s (it was
  13), a bloodbath by 13; cagey 34. The golden match is dealt a bloodbath,
  so it is re-recorded (`abb64139`); detail in BOTS.md. Mixed matches are
  unchanged. Also `rate.ts --by gun` (the kind she held longest), for W4.
- 2026-11-20 (W4): **no new kind; the mortar retuned.** Its shell 60 → 75:
  damage a minute held 53 → 72, its ships place 41.4 → 39.8. Cannon,
  repeater, harpoon and mortar ships now rate within 2 se of each other.
  The scatter's ships rate −13 se. **The scatter is weak, and the gate is
  not met for it**: duels (`tools/harness/duel.ts`, logged below) show it
  losing to a cannon 19 times in 20 even from 40 m, as the cannon opens out
  and the scatter's captain holds her ring instead of chasing. Its numbers
  can't fix that (reach, magazine, no burst pauses: each tried); it wants a
  pursuit, or a light gun's speed. The owner's call; BOTS.md has the
  tables. Golden `060f4d3b`.
- 2026-11-20 (P5, in part): her end screen shows the gun that sank her (it
  drew a cannon for any ball): a strike names its gun (`battle.ts` Strike,
  null for a ram), the sinking carries it (`match.ts` Sunk, `player.ts`
  End). The persona in words ("sunk by a raider") would break the screens'
  wordless language, and a glyph or sail tint per persona is new art, so
  both are the owner's. Golden unchanged.
- 2026-11-20 (step budget): the branch's worst step had risen to 22 ms
  (gate ≤ 16): at the storm's next calm every ship wanting a fresh route ran
  the pathfinder in one step. A ship's first route in open water is now
  looked for within 6 steps, by her cell (`route.ts` ROUTE.spread): worst
  12.5 ms (main 13.9), median 1.8; over 64 matches stuck 3.6 → 4.1 s,
  within the noise of those runs (3.5–4.3 s on this code), arming the
  same. Golden `72ddf57a`; BOTS.md has the numbers.
- 2026-11-20 (§7 #1, the crew part registry): **not done, on purpose.**
  Read again, adding a part is three explicit edits (`Brain`, `variant`,
  `Memory`), each guarded by the architecture test; deriving them from a
  list needs mapped tuple types or casts (none allowed in `src`). That is a
  more abstract interface, not a deeper one. Revisit when a part is next
  added and the three edits actually hurt.
- 2026-11-20 (R5): `gunfire/gunfire.ts` split by mesh: `balls.ts` (251
  lines, with SHOT), `marks.ts` (121, MARK), `puffs.ts` (596, every event's
  puffs and the trails); `gunfire.ts` (54) keeps the shared clock and
  composes them. Same draws and triangles in every budget view, golden
  unchanged.
- 2026-11-20 (duels): `tools/harness/duel.ts`, one gun against another,
  two bots alone, from 40–200 m. It overturned W4's first reading of the
  scatter (above); BOTS.md has the matrix against the cannon. A general
  pursuit (flat out when far from her ring) was tried for it: no help in
  duels, no gain over 64 matches, personas wider; dropped. So were its own
  numbers (BOTS.md has the table): a tighter cone wins duels (cone 0.04: 7
  of 20 at 40 m) but nothing in matches; pellets of 14 win both (11 of 20;
  θ −0.18 → +0.02) but sink a bare hull in one volley, against the gun
  band. Left for the owner: the scatter's spray, or the band.
- 2026-11-20 (§6.7, golden): a golden match for each other type,
  `tests/golden-types.test.ts`: mixed, gold rush and cagey, 120 s each on
  the same seed with the type forced (`478c4fb1`, `9188f956`, `73f8b05b`).
  The run and hash are shared with `golden.test.ts` in
  `tests/golden/run.ts`; that hash is unchanged.
- 2026-11-20 (review): a fresh review of the branch's `src` (main…26b4833)
  for bugs, determinism, hot paths and three.js use. Determinism, hot paths
  and three.js came out clean; the refactors (storm.final, Strike/Sunk gun,
  the gunfire split, first-route spreading, grove LOD, rarity glow packing)
  checked equivalent. Two findings, both real: (1) the hunter's, raider's
  and brawler's longer ears draw them no further than anyone's (guns past
  HUNTING `far` score nothing); mending and dropping them both measured
  worse for the fighters, so they stay and `persona.ts` says what they do;
  (2) only balls cooled a bot's mood, not rams, against MIND's rule; fixed
  (`bruised`), neutral over 64 matches. Golden `5b47591c`, the type
  goldens re-recorded.
- 2026-11-20 (P6, balance by skill and eye): the personas' spread of θ
  0.371 → 0.093 over 256 dealt matches (1–256, the same matches before and
  after), the strongest +7.8 se → +1.2 se. What moved it:
  - **Skill by style** (`temper.ts SKILL`): the fighters drawn sharper (hunter
    and brawler 0.55–1), the scavenger the least sharp (0.15–0.7), the
    raider a little less (0.3–0.85), the rest as before (0.35–0.9); each
    within 0–1. Fighting is the fighters' trade; it is what they lose by when
    green. This alone took the fighters within a se (hunter −5.2 → −0.8,
    brawler −7.3 → −1.0, on 1–64 then 1–128).
  - **The cautious see trouble later** (their `notice`): scavenger 120 → 60 m,
    turtle 120 → 85 m, raider 160 → 130 m; the turtle runs at 35 hull, not 50. A captain who sees a ship at 120 m slips away from every fight;
    nearer, she is caught by some. Scavenger loot 1 → 0.75 and reach
    170 → 140 m; the brawler loots 0.6 (0.45), mends at 60 (55), runs at 32
    (28).
  - The rest of the bots' play holds (1–64): stuck 4.1 → 3.4 s, armed the
    same, shots home 62 → 65%, kills 0.92 → 0.93; the personas still play
    apart (shots a ship: brawler 23.4, hunter 20.4, scavenger 13.1; kills
    1.41, 1.29, 0.63) and place within 39–43 of 80.
  - Tuned on 1–128 and checked on 129–256, which it had not seen: the head
    there +5.4 / −8.9 se (spread 0.391), tuned (12th pass) +2.1 / −1.4
    (0.093). By type, the leader differs: cagey turtle, gold rush raider,
    mixed scavenger, bloodbath scavenger, each within 2 se of all.
  - Why not the last 0.2 se: at this spread a change to any persona moves
    every match, and with it every persona by about ±0.03 θ (the raider rose
    0.04 with nothing of hers changed; the brawler fell 0.04 with nothing of
    hers). A gate in standard errors also tightens with every match run: with
    1,000 matches any real difference fails it. A gate the owner might keep
    instead: every persona within ±0.07 θ of the median (her odds of
    outlasting another within 7%); now met (+0.029 … −0.064).
  - `rate.ts` takes several runs and rates them as one. Golden `5b47591c` →
    `915a82b4`; mixed, gold rush, cagey `c827b8e7`, `e9044250`, `162d9ab0`.
