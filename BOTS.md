# Bots: design, plan and log

The working file for the `bot-harness` branch (a worktree off `main` at 975191c).
Read **Design** before touching bot code; after any compaction, re-read this
whole file before doing anything else. Design changes only by a Decision.

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

| Role      | Module                                                                       | Takes                      | Gives                                                    | Tuning                           | Memory slice         |
| --------- | ---------------------------------------------------------------------------- | -------------------------- | -------------------------------------------------------- | -------------------------------- | -------------------- |
| Lookout   | `sim/lookout.ts` (from bot.ts perceive/hidden)                               | fleet, depth               | `Sighting`: foe, where last seen, who rammed/shot her    | `SIGHT`                          | `m.look`             |
| Captain   | `sim/bot.ts` (decide, OPTIONS)                                               | Sighting, storm, own state | `Intent`                                                 | `MIND` (+ each option's owner's) | `m.mind`             |
| — options | storm/fight/flee/roam: `bot.ts`; heal/loot: `purser.ts`; claim: `claimer.ts` | Ctx view                   | a score 0..1 with named factors; a goal                  | `PURSER`, `CLAIMER`, `STORMING`  | `m.purse`, `m.claim` |
| Tactician | `sim/tactician.ts` (ramCourse, recoil; gunner.ts ring)                       | Intent, foe now            | `Mark`: where to route to, the aim if clear, pace        | `RAMMING`                        | `m.tactic`           |
| Pilot     | `sim/pilot.ts` over `sim/route.ts`, later behind `Router`                    | Mark, chart                | `Way`: the tangent to steer, distance, pace, foe         | `ROUTE`                          | `m.route`            |
| Helmsman  | `sim/helmsman.ts`, later behind `Steering`                                   | Way, depth, nearby rams    | `Helm`: course, throttle; and `lost` (pilot drops route) | `HELM`                           | `m.helm`             |
| Gunner    | `sim/gunner.ts`                                                              | foe, held gun              | `Order`, arm                                             | `GUNNER`                         | `m.gun`              |

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
- [ ] **B. Refactor, hash unchanged.**
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
  - [ ] C3 Scenarios: crossing pairs (200 fixed), channel, storm-from-a-cove,
        duel, chase. Suite under 60 s as a test.
- [ ] **D. Loot more plentiful** (user ask, measured). See Decision 3.
- [ ] **E. Navigation**, each change measured, hash re-recorded:
  - [ ] E1 Clearance in metres; cells under the hull's need barred; cost by clearance.
  - [ ] E2 Water bodies labelled; goals snapped to her own.
  - [ ] E3 Progress-based stuck; goal blacklist.
  - [ ] E4 Storm flow field per phase (Router #2).
  - [ ] E5 Context steering on the clearance field (Steering #2).
- [ ] **F. Stretch.** Mixed-fleet tournament + ratings; 2D replay HTML; breaking
      line of sight when fleeing; hunting to the sound of guns.

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
