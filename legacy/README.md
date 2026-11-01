# Legacy: the old game's career, tuning tools and simulation tests

The sim rewrite replaced the old game's mechanics (hull forms, fittings, pigments, loops and purses, the gull's
upgrades) with Portolan's core loop, so these files no longer build against `src/sim`. They are kept byte for
byte, outside the typecheck and the test run, as reference for porting: the new tests in `tests/sim` carry over
every check whose mechanic survived.

- `career/`: the old game's career (league, learn, progress, setup, state, voyage). Portolan's career in
  `src/career` never used them.
- `sim/world/`: the old twelve-region world (geography, regions and its navigation grid), drawn for the old
  planet's radius. The new world is `src/sim/world/index.ts` and its sixteen region modules.
- `tools/`: the captains' tournament and the tuning sweep, built on that career and the old sim, and geodump,
  which drew the old world's charts.
- `tests/sim/`: the old simulation's tests, the old world's tests, and the old determinism vectors.

Whether to delete them is the owner's call (PLAN.md: never delete a working system without asking).
