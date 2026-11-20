# Bots: design, plan and log

The working file for the `bot-harness` branch (a worktree off `main` at 975191c).
Read **Design** before touching bot code; after any compaction, re-read this
whole file before doing anything else. Design changes only by a Decision.

**Status (16 matches, 80 bots each, same matches before and after):**

| Measure                   | Base (975191c) | Now         |
| ------------------------- | -------------- | ----------- |
| Pinned (stuck, not claim) | 20.1 s a ship  | 4.2 s       |
| Ships ever pinned         | not logged     | 27%         |
| Aground                   | 3.7 s          | 0.0 s       |
| Mean speed                | 13.4 m/s (E3c) | 14.5 m/s    |
| Armed (90% of ships by)   | 85% (27 s)     | 91% (20 s)  |
| Median step / worst step  | 1.56 / 17 ms   | 1.6 / 13 ms |

What moved it, biggest first: the calm's flow field (E4, −8 s), roomy loot
and the side flip (E3, −6 s), easing when coming about with land ahead (E3c,
−1.5 s), steering by eye off the shore (E1a). New behaviour: hunting to the
sound of guns (F1), running for cover behind land (F2), storm-phase loot
caches and more loot (D). Tools: the harness, `inspect`, `wedge`, `compare`,
`replay`; scenarios in `tests/scenarios.test.ts`. Left: pocket wedges that only
the shared shoal physics can free (E3d), crossing/channel scenarios (C3).

---

## 1. Design

### 1.1 How a bot thinks (the one page)

A bot is a crew. Each role is one module, owns one tuning table and one slice of
memory, and hands the next role one small, named thing. To answer "why did she
turn left?", follow the arrows: it is never more than five hops.

```
            every think (0.2 s)                          every step (1/30 s)
 ┌──────────┐  Sighting  ┌──────────┐  Intent   ┌────────────┐  Mark  ┌───────────┐   Way    ┌────────────┐  Helm
 │ Lookout  │──────────▶│ Captain  │─────────▶│ Tactician  │──────▶│ Pilot     │────────▶│ Helmsman   │──────▶ ship
 │ sees     │           │ chooses  │          │ where, now │       │ routes    │◀─ lost ─│ steers     │
 └──────────┘           └──────────┘          └────────────┘       └───────────┘         └────────────┘
                              │ asks                 │ foe
                              ▼                      ▼
                         ┌──────────┐          ┌──────────┐
                         │ Purser   │          │ Gunner   │──────▶ Order (aim, fire), arm
                         │ Claimer  │          └──────────┘
                         └──────────┘
```

| Role      | Module                                                                                                                                    | Takes                      | Gives                                                    | Tuning                                                        | Memory slice                   |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | -------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------ |
| Lookout   | `sim/lookout.ts` (perceive, hidden)                                                                                                       | fleet, depth               | the foe she has her eye on, when and where last seen     | `SIGHT` (+ `MIND.grudge`)                                     | `LookMemory`                   |
| Captain   | `sim/bot.ts` (think, decide, OPTIONS weighted by `CHOICE`)                                                                                | Sighting, storm, own state | `Intent`                                                 | `CHOICE`                                                      | `MindMemory`                   |
| — options | storm: `storming.ts`; fight/flee/cover: `fighting.ts`; roam: `roaming.ts`; heal/loot: `purser.ts`; claim: `claimer.ts`; hunt: `hunter.ts` | Ctx view                   | a score 0..1 with named factors; a goal                  | `STORMING`, `MIND`, `ROAMING`, `PURSER`, `CLAIMER`, `HUNTING` | `m.purse`, `m.claim`, `m.hunt` |
| Tactician | `sim/tactician.ts` (ramCourse, recoil; gunner.ts ring)                                                                                    | Intent, foe now            | `Mark`: where to route to, the aim if clear, pace        | `RAMMING`                                                     | `m.tactic`                     |
| Pilot     | `sim/pilot.ts` over `sim/route.ts` (A\* routes; the calm's field when one falls short, E4)                                                | Mark, chart, `Sea.calm`    | `Way`: the tangent to steer, distance, pace, foe         | `ROUTE`                                                       | `m.route`                      |
| Helmsman  | `sim/helmsman.ts`, later behind `Steering`                                                                                                | Way, depth, nearby rams    | `Helm`: course, throttle; and `lost` (pilot drops route) | `HELM`                                                        | `m.helm`                       |
| Gunner    | `sim/gunner.ts`                                                                                                                           | foe, held gun              | `Order`, arm                                             | `GUNNERY` (brain); `GUNNER` (aim feel, shared)                | `Gunner`                       |

**The Intent** is the seam between choosing and sailing. The helm never sees
modes, loot or claims; the captain never sees rudders or banks.

```ts
interface Intent {
  // captain.ts; bot.ts intentOf derives it from memory each step
  goal: Vec3; // where she means to be
  foe: number; // the ship she means to fight; -1 none
  arrive: 'through' | 'gently'; // gently: ease up near it (loot, mending)
}
```

Ram, ring or bear away is the tactician's call from the foe and her gun, so
Intent carries no stance. The tactician's `Pace` (`ram` | `turn` | `gently`)
is all the helm learns of why.

### 1.2 Three lifetimes, never mixed

| What   | Lives                                     | Owner                    | May hold                       |
| ------ | ----------------------------------------- | ------------------------ | ------------------------------ |
| Tuning | a variant (all game, for `DEFAULT_BRAIN`) | each role's module       | numbers and number tables only |
| Temper | a ship (seed + the variant's styles)      | `temper.ts`              | numbers                        |
| Memory | changes every step                        | each role, its own slice | state                          |

### 1.3 The Brain

`src/sim/brain.ts` composes the roles' tuning; it adds no field of its own.

```ts
export interface Brain { sight; mind; roaming; storming   // bot.ts
  ramming /* tactician */; helm; purser; claimer; styles /* temper */ }
export const DEFAULT_BRAIN: Brain = { sight: SIGHT, mind: MIND, ... };
export const nature = (seed, brain = DEFAULT_BRAIN): Nature  // seed, brain, temper
```

- A ship's `Nature` sits on her `Hand` (play/orders.ts), made at launch from
  `createState(..., brainOf)` (the game passes none: every ship the default).
- Each part reads **its own slices** off `c.b` (the Ctx carries the brain, as
  it carries her memory): `c.b.helm.feel` in helmsman.ts, never `HELM.feel`,
  never `c.b.purser`. Enforced by the "own slices" rule, not by signatures:
  threading slices as parameters would break the parameter ratchet (think
  already takes 6) for no gain the rule doesn't give.
- Out of the brain, on purpose: `BOT` (shared), `GUNNER` (aim feel: fairness to
  the player, Decision 4), `ROUTE`/`REASON`/`WORTH` (tools every part uses
  alike). Option weights (bot.ts OPTIONS 6, 3.5, …) are still literals: next
  to move into `mind` when a variant wants them.
- Variants live in `tools/brains/*.ts` as typed partial overrides, merged onto
  `DEFAULT_BRAIN` into whole objects, same keys in the same order (one hidden
  class, so V8 keeps the hot loops fast and the harness's ms are honest).
- Different _behaviour_ (not numbers) goes behind a seam (`Router`, `Steering`)
  chosen in `bot.ts`, introduced only when its second implementation lands.

### 1.4 Every choice prints

Each option's score is `weight × utility(named factors) × momentum`. The trace
records, each think, the top three options with their factors, so the harness can
say: `chose storm 0.82 (edge 0.90 × due 0.91) over loot 0.40 (worth 0.7 × near 0.6)`.
A choice that can't be printed this way is a design bug.

### 1.5 Rules (each a test in `tests/architecture-bots.test.ts`)

1. **Own tuning only.** A part names no tuning table but its own (test "own tuning").
2. **Own slices.** A part reads its tuning off the brain it is given, its own
   slices alone, and never its table directly (test "own slices").
3. **The helm knows no modes.** tactician, pilot, helmsman and route import
   nothing of `bot.ts`, `purser.ts`, `claimer.ts`, and never name `Mode`.
4. **Memory owners.** A memory field (`…Memory`, `Gunner`, `Chance`) is written
   only in the file that declares it.
5. **Golden match.** A whole match with `DEFAULT_BRAIN` hashes to the recorded
   value; tracing on or off, the same. A deliberate change of behaviour re-records
   it, with its metrics before and after, in the Log.
6. `src` never imports `tools/`. (Seams need two real implementations: a review
   rule, not a test.)

### 1.6 Glossary (the code's words)

| Word             | Means                                           | Where             |
| ---------------- | ----------------------------------------------- | ----------------- |
| think            | a decision tick, every 6 steps                  | bot.ts            |
| mode             | the option in hand                              | captain.ts `Mode` |
| bite             | a claim loop: out, across, back                 | claimer.ts        |
| ring             | the circle at gun range she keeps round her foe | gunner.ts         |
| purser           | stores: loot, mending, arming                   | purser.ts         |
| wade / backT < 0 | working off a bar under her bow                 | helmsman.ts stuck |
| strafe           | which way she turns backing off a bank          | helmsman.ts stuck |
| recoil           | bearing away after her ram touches              | helmsman.ts       |
| margin           | metres she keeps inside the storm's edge        | temper.ts         |
| chart            | 6.8 m cells of open water, baked once           | route.ts          |
| open             | deep enough: draught + 0.3 m                    | captain.ts        |

### 1.7 The harness (five layers)

| Layer        | What                                                                                                                                | Where                                                     |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| 1 Seam       | Brain per ship, golden hash                                                                                                         | `src/sim/brain.ts`, `play/orders.ts`                      |
| 2 Runner     | `runMatch(spec) → result`; worker pool (8 P-cores); chart cached per planet seed; JSONL keyed by spec hash                          | `tools/harness/`                                          |
| 3 Observe    | optional trace sink in Ctx (typed events per role); metric reducers                                                                 | `src/sim/trace.ts`, `tools/harness/metrics/`              |
| 4 Experiment | scenarios (set-piece starts, seconds each); single-variant and mixed-fleet tournaments; paired seeds, bootstrap CIs, held-out seeds | `tools/harness/scenarios/`, `tools/harness/tournament.ts` |
| 5 Inspect    | replay any spec with full trace; 2D top-down HTML (tracks by mode, stuck heatmap, why-lines); find-examples query                   | `tools/harness/replay.ts`                                 |

Fidelity is not traded for speed: no cut-down sim. Speed is parallelism,
caching, and short scenarios.

### 1.8 Worked example: why bots circle at 12 m/s

Baseline (seed 7922, one match): 38/80 bots moved under 15 m in 30 s, **0
aground**, median speed while stuck 12.5 m/s. From reading the code (to be
confirmed by trace in phase C):

1. Pilot (route.ts): A\* treats any 6.8 m cell with depth ±2.3 m as passable; a 26 m
   ship turning a ~27 m circle cannot use a one-cell slot.
2. Helmsman: side feelers sit ~18 m either side; in any channel under ~36 m both
   touch land, so she turns hard away and holds it 0.8 s; the route pulls her back.
   Planner (chart) and reflex (true depth) disagree, and she circles.
3. Pilot (route.ts): with no route in 4000 cells, A\* hands back the cell nearest the
   goal as the crow flies, a cove; she replans every 2 s to the same cove.
4. Captain: goals are checked open at a point, never reachable.
5. Helmsman: stuck means under 0.93 m/s, so circling at speed is never seen.

In the new design: (1) the chart knows clearance in metres and bars cells
under half a beam plus margin; (2) Steering reads the same clearance field as
the Pilot; (3, 4) the Captain's goals are snapped into her own body of water
(components labelled at bake), storm goals come from a shared flow field; (5)
the Helmsman judges progress along the Way over a window, and on failure
the Pilot blacklists that goal for a while. Each shows in the trace as a
named event.

---

## 2. Plan (priority order; any prefix is a coherent stop)

House rules: worktree only; rebase, never merge; no push; commit often, prose
messages in the house voice; one action per shell call; `npm test` green on every
commit; anything visible checked in headless chromium; iPad Air M1 at 30–40 fps
(watch ms/step: 0.70 desktop baseline).

- [x] **A. Lock behaviour.** Golden-match test (hash of every ship's place, hull,
      and the result after N steps on a fixed seed). Baseline metrics recorded.
- [x] **B. Refactor, hash unchanged.**
  - [x] B1 Split `BOT` to its owners (SIGHT, MIND, ROAMING, STORMING, HELM,
        RAMMING); captain.ts BOT keeps only `every` and `open`, shared by all.
  - [x] B2 `Intent` → tactician.ts `Mark` → pilot.ts `Way` → helmsman. The helm
        knows no modes; PURSER.near/slow became HELM.near/gently.
  - [x] B3 Memory in slices per role: each part declares `…Memory` and its
        starting values; captain.ts `Memory` gathers them; bot.ts `mind()`
        builds them. Options' `act` returns the goal (the mind alone writes it).
        Rules 1, 3 and memory owners: tests/architecture-bots.test.ts.
  - [x] B4 `Brain` composed in brain.ts; `Nature` per ship on the `Hand`;
        `createState(..., brainOf)`; parts read `c.b.<own slice>`. Rules 1–4.
- [ ] **C. Harness.**
  - [x] C1 `node tools/harness/cli.ts --brains default,wary --matches 16`:
        runMatch(spec), worker pool (9 threads), JSONL in `.cache/harness/`,
        summary with paired bootstrap CI. The world is made once per worker
        (~0.3 s): no disk cache needed.
  - [x] C2 Observation without a trace sink: the harness reads each bot's
        memory once a second (`state.debug.mindOf`), so the sim is untouched.
        Metrics: time in mode, stuck by mode, pinned (stuck, not claiming)
        with "why" (avoid/back/short/dry/none) and episodes (where, when);
        armed by t, place. Tools: `inspect.ts` (one ship second by second),
        `wedge.ts` (can a ship in this state free herself, per helm).
        Why-lines (scores of the top options) deferred: not needed so far.
  - [ ] C3 Scenarios (`tests/scenarios.test.ts`): cover behind an island and
        an island's shoulder done; crossing pairs, channel, storm-from-a-cove
        to come (duel, storm caps, routes already in bot/gunner/route tests).
        Suite under 60 s as a test.
- [x] **D. Loot more plentiful** (user ask, measured). See Decision 3.
- [ ] **E. Navigation**, each change measured, hash re-recorded:
  - [ ] E1 Clearance in metres; cells under the hull's need barred; cost by clearance.
        (E1a done: steering by eye wants water `ROUTE.wide` cells off.)
  - [ ] E2 Water bodies labelled; goals snapped to her own.
  - [ ] E3 Progress-based stuck; goal blacklist.
  - [x] E4 Storm flow field per phase (Router #2): `Sea.calm`, `downField`.
  - [ ] E5 Context steering on the clearance field (Steering #2).
- [ ] **F. Stretch.** Mixed-fleet tournament + ratings; 2D replay HTML.
  - [x] F1 Hunting to the sound of guns (`sim/hunter.ts`, its own role:
        `HUNTING`, `c.b.hunting`, `HuntMemory`; the sea keeps each ship's
        last shot ringing 6 s, handed to bots as `Sea.gunfire`).
  - [x] F2 Breaking line of sight when fleeing (bot.ts `cover`, MIND
        `cover`/`rings`/`wide`/`gain`).
  - [x] F3 Mixed fleets balanced by match (`brains[(id + match) % n]`) and
        a paired place interval in the summary.
  - [x] F4 2D replay: `node tools/harness/replay.ts --match 4 [--brain b]`
        writes one self-contained page (~1.7 MB): the planet unrolled
        (land, shallows, sea at 1440 × 720), each ship each second coloured
        by her mind's mode with her heading, the storm's edge and the next
        calm; play, scrub, speed, zoom, pan, click a ship to follow her.
        Checked in headless Chromium (no errors; follow and play work).

## 3. Decisions

1. **Crew-role modules** (lookout, captain, tactician, pilot, helmsman,
   gunner, purser, claimer): the code already names modules by role; one role,
   one table, one memory slice keeps each small enough to hold in the head.
   (The router role is the **pilot**: `navigator` trips the determinism test's
   browser-global scan, and a pilot is the one who takes a ship round land.)
2. **Refactor before harness.** The harness needs the Brain seam; the seam done
   right is the refactor. Both from one piece of work, under one golden hash.
3. **Loot (asked for mid-run).** Now 200 spots × 1.4 ≈ 280 pieces, cut on
   purpose from ~570 so the first gun is a scramble (most armed by 20–30 s).
   Target: about twice the consumables and some more guns, _keeping_ the opening
   scramble: armed median still ≥ 5 s, 90% armed by ≤ 30 s. Levers, tried in
   order on the harness: spots 200 → ~320 with gun share 0.5 → ~0.42; then a
   resupply drift per storm phase, laid inside the next cap (draws fights to it).
   Check the drawn loot's cost in headless chromium (more instances on iPad).
4. **The gunner's tuning stays out of the brain.** Her aim (reaction, error,
   spread by skill) is how fair a bot is to shoot against, the same for every
   bot; skill (temper) already varies it. Variants are about choices and
   sailing. Revisit only if a variant needs a different gunner.

## 4. Log

- 975191c baseline (seed 7922, 1 match): 438 s, 0.70 ms/step; stuck 38/80, 0
  aground, median 12.5 m/s; armed 65/80, median 7 s, 90% by 22 s; 283 pieces.
- A: golden match, 300 s of seed SEED's first dealt match → `e5efec20`
  (10 s to run; suite 362 tests, ~22 s).
- B1: BOT split by owner. Golden unchanged.
- B2: Intent/Mark/Way seam; tactician.ts, pilot.ts new. Golden unchanged.
  Note: the architecture scans flag the words "navigator" and "for now".
- B3: memory slices (MindMemory bot.ts, TacticMemory, PilotMemory, HelmMemory,
  PurseMemory, ClaimMemory, Gunner, Chance). New seams: pilot `lose`, gunner
  `sighted`, purser `lootTime`/`healAct` (policy in purser, geometry from the
  mind by callback). Golden unchanged; 365 tests.
- B4: brain.ts (Brain, DEFAULT_BRAIN, Nature, nature); think takes a Nature;
  Hand.nature; createState brainOf; temper takes styles; weaponWorth takes
  `other`. Golden unchanged; 366 tests.
- C1/C2 harness baseline (16 matches, default, 45 s on 9 workers;
  `.cache/harness/baseline.jsonl`): 421 s a match, 1.53 ms/step (9 at once);
  **pinned 20.1 s a ship, 44% of ships ever**, aground 3.7 s, claim-circling
  6.4 s; armed 85%, median 7 s, 90% by 27 s. Stuck by mode: storm 65%, claim
  24%, loot 7%. Pinned, mind showing: back 67%, none 31%, dry 1%, short 0%.
  Runs of ≥30 s hold 21.6k of 25.7k pinned seconds.
- **Why bots are stuck (found, not guessed):** the routes are fine (short 0%).
  The long runs are a ship with her bow on a shore in a cove (m4 #25, m6 #37).
  `wedge.ts` from her exact state: one side frees her (head swings 83–176°),
  the other moves her 0 m: shoal.ts refuses any turn that puts a hull point in
  worse water. Her helm keeps choosing the blocked side: (a) `deepest`'s
  turn and the back-off side are picked by feel, never checked against her
  head actually swinging; (b) `crawling` is judged step to step, and a hull
  surging against a shore (4–11 m/s, eased back each step) is never crawling,
  so no reflex fires at all ("none"). A slow crawl (0.35) frees her better
  than full. The fix (E3, re-scoped): progress over a window, and a turn
  that doesn't swing her head is given up for the other side.
- E3 measured (16 paired matches each; brain variants switch each change
  off, e.g. `helm.budge: 1e9`; a variant equal to the old code reproduced
  the baseline to the digit). Window + flip together: worse (+4.8 s). Flip
  alone −2.4 s; window alone −0.9 s (n.s.). Slow backing (0.35): +4.6 s.
  Inspecting m4 #25 from 0 s showed the real trap: she went for loot at
  16 m/s into a cove, took it, and ran on to the cove's head, wedged
  (`wedge.ts` at her final state: no helm moves her at all; open water only
  astern, and no reverse). Loot spots on land were moved to the _nearest_
  open water, i.e. onto shorelines and cove heads.
  - Purser skipping inshore pieces (chart `clearAt` < 2): pinned −7.5 s but
    90% armed slid 27 → 92 s. Rejected as the main lever.
  - **Loot laid roomy** (loot.ts `roomy`: open water `LOOT.room` 14 m round
    every way, for strewn and berthed guns): old helm 20.1 → 15.6 s pinned,
    and arming _faster_, 90% by 21 s (was 27). Strewing costs ~8 ms desktop
    once a match (est. 20–25 ms iPad; one-off).
  - Kept: roomy loot + side flip (`HELM.budge` 1.5 s, `swing` 0.15 rad) +
    purser room 2 (for spilled pieces). Window dropped (it hurt).
  - **Result: pinned 20.1 → 13.8 s a ship (−31%), aground 3.7 → 5.2 s,
    armed 85%, median 7 s, 90% by 21 s (was 27).** Golden → `076db454`.
  - Left: storm mode is now 76% of stuck time. Next to inspect.
- E3b, storm-mode wedges (m11 #68): chasing a foe straight (no route) into
  a pocket one chart cell off shore, her next route cell 123° to starboard;
  the shallows refuse that swing, while hard to port frees her in 4 m
  (`wedge.ts`). She surges ~5 cm a step, so the step test never calls her
  stuck. Three helm reflexes tried, all **worse** (16 paired matches vs.
  the committed helm, 13.8 s pinned):
  - headway window (net < crawl×1 s → crawling): +3.1 s;
  - stricter window (net < 0.3 m in 1 s / 0.6 m in 1–2 s): +3.8–3.9 s;
  - coming about the long way when a > 0.5 rad turn doesn't swing her head
    in 1.5 s: +4.0 s (0.3 rad: +4.8 s); "circling in claim" rose too.
  - Lesson: more helm reflexes fight the planner. The cause is upstream:
    goals (foes, loot) drawing her into water her hull can't turn in. Leads
    for later: a foe/loot goal in clear < 2 water is not chased straight
    but via the route; `ROUTE.hug` (2.5×) higher. Parked for D.
  - `inspect.ts` gained per-second made/sailed/most-step, her chart cell
    (open, clearance) and her route's next cell as bearing/metres.
- D1, loot more plentiful: `LOOT.spots` 200 → 320, `gun` 0.5 → 0.42 (~440
  pieces: consumables ×2.0, guns ×1.35). Game tuning, so measured with
  `compare.ts` (two runs of the same 16 matches, paired): armed 85 → 90%,
  median 7 → 7 s, 90% by 21 → 17 s (bounds ≥ 5 s, ≤ 30 s: kept); loot time
  11 → 14%, heal 2 → 3%; pinned +1.0 s [−1.0, 3.1] (n.s.). Golden →
  `fecf349e`. Headless budget: +4–7k triangles, +0 draws (instanced, cap 512;
  ~35% of the planet within the 700 m drawn, ~180 pieces). NB the budget's
  coast/ships/map views are over on triangles _before_ this change too
  (1.30M / 1.35M / 3.51M vs 0.9M / 1.0M): pre-existing, not the bots'.
- D2, storm caches: as each phase after the first begins, `LOOT.cache` (5
  pieces, guns of rare+ tiers 40%, else big shield / full repair) dropped
  within half the next cap's radius of its centre on roomy water
  (loot.ts `cached`, state.ts `dropped`). 4 matches: 115 dropped, 40% taken,
  median 30 s after the drop (the rest unwanted by bots already armed well;
  rich pickings in the calm for the player). Harness vs D1: pinned +0.4 s
  [−0.0, 0.8], armed/heal unchanged. Golden → `d133157f`.
- D done. Next: C3 scenarios, then F depth (hunting to the sound of guns,
  breaking line of sight when fleeing).
- F1, hunting to the sound of guns: armed, hull+shield over 70, no foe in
  sight and not resting, she makes for the nearest guns heard within 500 m
  (not in the storm), keener by her fight temper × aggro and the nearer
  (450 → 150 m); silent, she keeps on 20 s to where they last spoke, gives
  up there (45 m) and rests 15 s. Option weight 2 (between fight 2.6 and
  loot 1.8). play/orders.ts's step now takes `player` and `now` records
  (was 9 positional parameters). Harness, 16 matches, whole fleets vs
  `deaf` (earshot 0): hunt 2% of time, matches 426 → 416 s, pinned −1.4 s
  [−2.8, 0.1]; `keenEar` (800 m): hunt 4%, 406 s. Mixed fleets (`--mix`):
  place 40.0 hunters vs 40.4 deaf vs 41.1 keen: liveliness, not power.
  Golden → `654f4299`. (Those mixed places were biased: see F3.)
- F3, harness bug: `--mix` gave ship `id` brain `id % n`, and a ship's id
  sets her temperament, berth and more: in two-brain mixes the even ids
  armed 92% vs 89% and placed ~0.7 better _whatever brain they sailed_
  (swapping the order flipped the result). Now `brains[(id + match) % n]`,
  so over matches each brain sails every id alike (armed then 90/91%). The
  summary also gives mixed fleets a paired place interval, match by match.
  Re-measured, 24 balanced mixed matches: hunters vs deaf place −0.94
  [−2.87, 1.06]: neutral to positive.
- F2, breaking line of sight: fleeing, she makes for cover: open water within
  180 m (3 rings × 12 bearings, nearest first), inside the storm by her
  margin, land between it and where her foe was last seen (`hidden`, the
  lookout's own test), kept while it stays so. First cut (any bearing):
  83% of flee goals behind land, but runners afloat 20 s after a flight
  74% → 65% (cover off her beam took her across the foe's guns; 6 matches,
  scratch tool). Narrowed to ±60° off straight away and further from the foe
  by 0.6 of the step out (`wide`, `gain`): 69% behind land, afloat after
  74% = no cover's, flee time 3552 → 2987 s (contact broken sooner). Whole
  fleets: pinned +0.1 s [−2.1, 2.0]; balanced mixed: place −0.37 [−2.65,
  1.89] vs `noCover`. Visible behaviour, no cost. Golden → `8c6241ba`.
  Scenario test: see E1a.
- Step cost after E3, D, F1–F2 (`tools/steps.ts`, 60 s, desktop; base
  975191c timed in a scratch worktree the same way): command median 0.54 →
  0.58–0.62 ms, step 1.56 → 1.66–1.74 ms (+6–10%), most likely the 57% more
  loot each bot weighs a think; the worst step's spike (17–20 ms, route
  finding) is the base's own. Under the 5 ms median gate. Headless budget
  unchanged from the base (its triangle overs pre-exist).
- C3/E1a, an island's shoulder: the first scenario (a bot fleeing past a
  round island, `tests/scenarios.test.ts`) had her, with or without cover,
  lie with her bow on the island for 12 s of 16, holding a route, her helm
  reading 4.3 m/s into the land and its stuck clock at 0. Cause: `course`
  looks ahead along the route as far as `clearLine` holds, and that took any
  _open_ cell, including those hard by the shore (`clear` 1): the look ahead
  cut the route's offshore cells and the shoulder with them. Now a chord is
  clear through cells `ROUTE.wide` (2) from the shore, or as far as its ends
  are (she can leave water close in, and make for it). Scenario: pinned 12 →
  0 s both ways, hidden 0 → 5.2 s with cover (both fail with `wide` 1).
  Whole fleets, 16 matches: pinned +0.2 s [−1.7, 2.1] (storm-mode wedges
  have another cause), aground 4.7 → 4.0 s. Golden → `72969f30`. Open: the
  helm's stuck clock didn't see a bow driven on to land at speed (E3 lead).
- E3c, how the long wedges begin: 76% of pinned time is in runs over 40 s,
  nearly all storm mode, but they begin earlier. m11 #12 (162 s): in claim
  at 16 m/s for a bite mark 20 m off with land 30 m beyond; the mark
  reached, the next lay 150° astern; coming round at full (a 27 m circle)
  she put her bow and port side in a notch, where `wedge.ts` finds no helm
  that moves her (no reverse; the shallows refuse any swing touching at two
  points: a physics matter, shared with the player, left alone). Her feel
  ahead runs along her course, open astern, so nothing warned her.
  - Claim marks `CLAIMER.room` 3 cells from the shore (as the purser's
    loot): pinned −0.1 s [−1.7, 1.4], neutral; kept (closes that path).
  - **Cramp**: course over `HELM.cramp` (90°) off her heading with land on
    her heading within feel + speed, she eases to `leastWay` (a 9 m circle,
    not 27). A pace, not a turn: it doesn't fight the planner. **Pinned
    14.0 → 12.4 s a ship, −1.5 [−2.8, −0.3]; aground 4.2 → 3.7 s; claim
    circling 2.3 → 1.8 s.** From 60°: +0.6 s worse than 90°.
  - Golden → `e9be4e05`. Variants `shoreBites`, `noCramp` kept.
- E4, the way into the calm (flow field): clustering pinned runs by place
  (40 m), 15 places held 60% of all pinned time, the worst 9% (33 runs in 5
  matches): the planet's traps, the same every match. m2 #27 there: not
  wedged (`wedge.ts` frees her any way), but her route was 3 cells long for
  a storm goal 462 m off _in her own water_ (a flood says so). `findPath`
  caps its work at 16,000 cells; round a ragged coast with the shore's
  surcharge that isn't enough, and a route given up on runs to the cell
  nearest the mark: the head of the cove pointing at the calm, where every
  storm-bound ship near piled in. More A\* work is out (80 ships re-route
  every 2 s). Now: `route.ts` `building(ch, into)` finds a Dijkstra field
  over the whole chart from the calm's heart outward (the shore's cells
  dearer, as `findPath`), 8,000 cells a step (`orders.ts` `CALM_WORK`,
  whole in < 1 s) as each phase sets the next cap; the orders hand it to
  bots as `Sea.calm`. The pilot, whose route to a mark inside the calm was
  not found, steers `downField` (the furthest cell down it, up to 6 on, the
  water clear). Mode-free: a property of the mark, not her mind's mode.
  findPath's neighbour loop is now `stepsOf`, shared (bit-exact).
  - **Pinned 12.4 → 4.2 s a ship (−8 s, intervals far from 0); aground 3.7
    → 0.0 s; mean speed 13.4 → 14.5 m/s.** 27% of ships ever pinned (35%).
    Stuck now: storm 52%, claim 27%, loot 12%.
  - Cost: built at once, 20 ms (worst step 34 ms, a hitch each phase on
    the iPad), so built in shares: worst step 13 ms (base 17–20: the field
    spares the long failed searches), median 1.6 ms as before. Headless
    budget unchanged.
  - Test: `scenarios.test.ts`, a long wall between her and the heart.
  - Golden → `109c72f7`.
- E3d, the wedges left (after E4, 4.2 s a ship): the worst place now (13%,
  m7 #73) is a true pocket: bow and port side on land, `wedge.ts` frees her
  hard to starboard only. Her helm works off it toward the deepest water,
  but each step she surges more than a crawl (0.08–0.12 m, to and fro) its
  clock starts again; she never gets 2.5 s into it. Tried steadying the
  crawl test (her way made good as a vector, averaged over 0.5 s, the
  surge cancelling): **worse, +2.5 s [1.5, 3.5]**; "back" rose to 82% of
  pinned time. With E3b's windows, twice now: a more sensitive stuck test
  calls her stuck in tight turns she was making, and backing off costs more
  than it saves. **The step test's deafness is load-bearing.** Reverted.
  A fix must be specific to the pocket (two hull points touching), not a
  keener ear; or the shallows (shoal.ts) letting a hull touching at two
  points ease off, which is the game's physics (the player's too), not
  this branch's.
- PLAN H1–H3 (the `depth` branch): the harness counts the fighting from what
  each step did (`state.advance` returns its shots, strikes, splashes and
  pickups): shots by gun, range band and rarity and how many home (a shot
  home once, however many pellets strike), damage dealt, rammed and taken,
  kills, pickups, time with each gun in hand, a second kind, water at
  30/60/120/240 s; a block per persona and per match type. `tools/matches.ts`
  is gone; on match 1 the harness gives its very figures (1302 shots, by gun,
  armed shares, silence, loot), but for hits (77% of strikes per shot there,
  64% of shots home here).
- PLAN P2/P3, personas and match types (`sim/persona.ts`): a persona is her
  temper (as before) and a crew, changes to the brain she sails: the weights
  of her options (CHOICE), how far she hears guns and sees ships, a turtle's
  reach for cover. Each match is dealt a type by its seed: mixed 55%,
  bloodbath, gold rush, cagey 15% each, each a mix of personas and rules
  (loot laid, the storm's waits). 8 matches a type, 80 bots:

  | Type      | Length | Armed 90% by | Shots home | Loops a ship | Loot laid |
  | --------- | ------ | ------------ | ---------- | ------------ | --------- |
  | bloodbath | 376 s  | 13 s         | 56%        | 4.3          | 446       |
  | gold rush | 414 s  | 13 s         | 65%        | 6.5          | 618       |
  | mixed     | 420 s  | 21 s         | 62%        | 6.8          | 447       |
  | cagey     | 453 s  | 38 s         | 70%        | 8.4          | 446       |

  The crews part the personas (8 matches before, 16 mixed after): brawler
  16.4 → 21.4 shots a ship, 0.84 → 1.09 kills, place 52 → 50 (she dies
  first); homesteader 19.0 → 15.5 shots, 0.96 → 0.70 kills. Pinned 5.6 → 4.6
  s a ship over all. The scavenger is pinned most (10.3 s: her loot reach
  takes her inshore), and places best (35): P6's to balance.
  - Golden → `cb57b52c`.

- PLAN H6, ratings (`tools/harness/rate.ts`): each persona's strength θ fitted
  to the order ships went down in (Plackett–Luce, worst first; standard
  errors bootstrapped over matches). Two independent sets of 64 dealt
  matches agree on the order: scavenger +0.28/+0.22, turtle +0.09/+0.13,
  homesteader +0.04/−0.00, raider +0.01/+0.08, hunter −0.07/−0.07, brawler
  −0.34/−0.35 (se 0.03–0.05). The brawler: half sunk by 41 s, her will to
  fight clearing the threshold through the early restraint.
- PLAN P4/P6, mood and balance. A bot's mood moves (`fighting.ts mood`, her
  `heat` off her temper's aggro, read by `captain.ts aggroOf`): each 100 hp
  she takes cools it 0.45, each ship she sinks warms it 0.2, settling back by
  half every 45 s, never more than 0.5 off. Alone it barely moves the ratings
  (brawler −0.34 → −0.33): it is texture, not a balance lever. What moved
  them (four passes of 64 matches, each kept only if it held):
  - brawler: runs at 28 hull, not 15; loot 0.45 (0.3), mends at 55 (40); her
    crew no longer cuts her flee (she could not break off a fight she was
    losing); a crowd cools her 1.6 times as much (she duels; most of her
    deaths were a third ship's).
  - scavenger: loot reach 170 m (220), runs at 30 (40).
  - tried and dropped as noise: scavenger reach 140 and mend 50, brawler
    fight 0.95, scavenger fight 0.4, a hunter's crowd wariness.

  | set (64 matches) | scavenger | turtle | raider | homesteader | hunter | brawler | spread |
  | ---------------- | --------- | ------ | ------ | ----------- | ------ | ------- | ------ |
  | 1–64 before      | +0.28     | +0.09  | +0.01  | +0.04       | −0.07  | −0.34   | 0.63   |
  | 1–64 after       | +0.21     | +0.06  | +0.00  | +0.03       | −0.13  | −0.17   | 0.38   |
  | 65–128 before    | +0.22     | +0.13  | +0.08  | −0.00       | −0.07  | −0.35   | 0.57   |
  | 65–128 after     | +0.15     | +0.09  | +0.05  | +0.02       | −0.10  | −0.20   | 0.35   |

  A scavenger's odds of outlasting a brawler: 1.8 → 1.4. Not yet the gate
  (strongest within a standard error of the median): the scavenger's edge is
  the battle royale's own, sitting out the fights, and held through every
  change to her loot, reach and running; the fighters lead in kills (brawler
  1.13 a ship, scavenger 0.9). Brawler median death 41 → 60 s. Pinned 3.9 →
  4.1 s a ship (noise); 1.1 ms a step. Golden → `1655ebe1`.

- PLAN W3, a stance with each gun (`gunner.ts` GUNNERY `rush`, `reach`, per
  kind): with a loaded scatter she closes on her ring flat out and stands off
  at twice it reloading (`rushScatter`); with a repeater she holds her fire
  till within 0.75 of its range (`holdRepeater`). Measured as brains sailed
  side by side in mixed matches:

  | set                      | default | rushScatter | holdRepeater | both             |
  | ------------------------ | ------- | ----------- | ------------ | ---------------- |
  | 64 matches, three brains | −0.039  | +0.013      | +0.027       |                  |
  | 64 matches, two brains   |         |             |              | −0.019 vs +0.019 |
  | 128 fresh matches, four  | +0.001  | +0.002      | +0.010       | −0.012           |

  (θ, se 0.014–0.022.) The first set's +0.07 for holding the repeater was
  noise: on 128 fresh matches no stance moves a bot's place by more than
  0.7 se. The rush shows in how she fights (0.95 kills a ship, not 0.88;
  dealt 200 hp, took 232, against 196 and 229), not in where she places.
  Kept as knobs, all off: the game's gunnery unchanged, golden unchanged
  (`1655ebe1`); the variants stay in `tools/harness/brains.ts`.

- PLAN L2, loot and caches by match type (`persona.ts` TYPES, `loot.ts`
  `cache.more`): a gold rush lays a second gun more often (0.55), a gun
  near every berth (80 m, 30–60 m off), and caches that grow as the storm
  closes (7 pieces, then 9, 11 …); a bloodbath's caches are 6 pieces, three
  in four of them guns; a cagey match's are 4, one in four a gun. Mixed
  matches are as they were. Over 16 matches of each type:

  | type      | armed 90% by | a second kind | shots a ship, home    | half down by |
  | --------- | ------------ | ------------- | --------------------- | ------------ |
  | gold rush | 13 → 11 s    | 77 → 80%      | 17.0 → 18.5, 67 → 66% | 85 → 89 s    |
  | bloodbath | 13 → 13 s    | 69 → 69%      | 16.1 → 16.3, 56%      | 60 → 60 s    |
  | cagey     | 32 → 34 s    | 61 → 61%      | 19.3, 67%             | 104 → 104 s  |

  A gold rush now arms soonest of the four. The golden match is dealt a
  bloodbath, so its hash moves: `1655ebe1` → `abb64139`.

- PLAN W4, the guns' numbers for W2's gaps, no new kind: the mortar's shell
  60 → 75 (`handling.ts` GUNS). Rated by the gun each ship held longest
  (`rate.ts --by gun`), with damage a minute held, 64 dealt matches each:

  | gun held longest | θ before       | θ after        | hp a minute held | life s | place       |
  | ---------------- | -------------- | -------------- | ---------------- | ------ | ----------- |
  | cannon           | +0.419 ± 0.030 | +0.387 ± 0.026 | 102 → 104        | 120    | 36.8        |
  | repeater         | +0.443 ± 0.034 | +0.381 ± 0.027 | 114 → 116        | 121    | 36.7        |
  | harpoon          | +0.389 ± 0.066 | +0.420 ± 0.071 | 136 → 133        | 122    | 38.3        |
  | mortar           | +0.278 ± 0.070 | +0.295 ± 0.058 | **53 → 72**      | 112    | 41.4 → 39.8 |
  | scatter          | −0.209 ± 0.039 | −0.215 ± 0.042 | 254 → 252        | 73     | 48.4        |

  The four guns but the scatter are now within 2 se of each other. The
  scatter deals the most a minute held, but its ships live 73 s against 120.
  (I first read that as selection, the scatter held by ships that fought
  closest; **the duels below say otherwise: the scatter is weak.**) Tried
  and dropped: its reach 70 → 85 m (carry 110 → 134) left it −13.0 se.
  `gunner.test.ts` now
  holds "far off, the harpoon" only while her foe is beyond the scatter's
  reach (she closes on him, and may take it up inside). Golden re-recorded:
  `abb64139` → `060f4d3b`.

- The worst step, 22 ms on this branch (14 on main), was the step the storm
  sets its next calm: every ship making for the calm has her mark jump at
  once, and those whose water to it had been clear (no route) all ran the
  pathfinder in that step (profiled: 20 of its 24 ms in `findPath` under
  `course`). Now a ship wanting a route where she had none, in open water,
  looks for it on one of the next 6 steps, picked by the cell she is in
  (`route.ts` ROUTE.spread; in shoal water still at once); meanwhile she
  steers straight, or down the calm's field. Spreading a moved mark's
  re-path instead, tried first, did nothing. The worst step by match type,
  the game's seed, flat sea: mixed 16.4 → 11.3 ms, bloodbath 20.9 → 11.7,
  gold rush 18.2 → 12.6, cagey 16.1 → 14.7; `npm run steps` 22.0 → 12.5
  (main 13.9). Over 64 dealt matches: pinned 4.1 → 3.6 s a ship, aground
  0.1 → 0.0 s, armed 90% by 16 → 15 s, ms a step 1.26 → 1.13. Golden
  `060f4d3b` → `72ddf57a`.
- Duels (`tools/harness/duel.ts`): two bold bots alone on open water, one
  gun each, from 40–200 m, each pair sailed both ways. Wins against a
  cannon, of 20 at 40 / 80 / 120 / 160 / 200 m:

  | gun      | 40 m | 80 m | 120 m | 160 m | 200 m |
  | -------- | ---- | ---- | ----- | ----- | ----- |
  | scatter  | 1    | 2    | 0     | 0     | 1     |
  | repeater | 5    | 5    | 5     | 2     | 2     |
  | mortar   | 7    | 9    | 11    | 16    | 15    |
  | harpoon  | 15   | 16   | 15    | 19    | 17    |

  One against one the longer gun wins: it opens out, and the shorter can't
  close (same top speed, guns that bear any way). The scatter loses even
  from 40 m, and a trace shows why: it wins the first exchange (151 hp dealt
  to 80 by 4 s), then the cannon opens out at 15 m/s while she sails on at
  5–9, circling at her ring at a turn's pace rather than chasing, and by
  6 s she is 80 m off and out of reach. None of its numbers fix that (each
  tried, each 1–2 of 20 at 40 m): reach 100 m; a magazine of 6; no pause
  between bursts (`GUNNERY.burst`, a rhythm that suits a cannon, not a gun
  fired once a second); a magazine of 6 and no pause together; W3's rush
  stance. Nor does a pursuit: tried, a captain farther than `out` of her
  ring makes for it flat out, whatever her gun (`chasing`, beside
  `rushing`). She then sails at 16 m/s, as fast as the cannon, and still
  loses 19 of 20: equal speeds hold the gap, and a scatter is near harmless
  past about 45 m while a cannon does its 20 dps at any range. Over 64
  matches that rule left places as they were (40.5) and spread the
  personas wider (scavenger +3.8 → +5.8 se), so dropped. **The scatter's
  weakness is its damage against its reach**, not its helm: it wants more
  bite close, or a light gun's speed. The owner's call; the duel tool
  measures it. In free-for-all matches close fights still come (the scatter deals
  most a minute held there), so this is a duel's weakness first.
