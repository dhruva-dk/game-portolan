# Portolan

An Age of Discovery territory game on a planet small enough that the horizon always curves. You sail a
galleon against twenty rival captains: leave your waters, lay a trail across the sea, come home to close
the loop and the enclosed sea floods with your colour. Cut a rival's open trail and it sinks.

Everything is generated in code from a seed: the planet, islands, vegetation, ships and the match itself.

## Run

```sh
npm start
```

Installs the dependencies on first run, then serves the game at http://localhost:5173 and opens it.
Needs Node.js 24 or newer. Add `?seed=42` to the URL for another planet and match.

## Build

```sh
npm run build     # static site in dist/
npm run preview   # serve dist/ locally to check it
```

`dist/` is self-contained (relative paths, every texture and library bundled, no requests to other hosts),
so it can be hosted from any static host or folder.

## Controls

The ship is always under way; you work the helm.

| Input | Action |
| --- | --- |
| Mouse | The ship steers for the sea under the cursor (hold course by keeping the cursor near the ship) |
| A / D or ← / → | Turn to port / starboard; a tap nudges, holding swings the helm hard over |
| W or ↑ | Ease the helm: alone it checks the swing and holds the course, with a turn key it turns gently |
| S or ↓ | Hard over: alone it tightens the current turn, with a turn key it turns at full rudder at once |
| Drag | Orbit the camera |
| Wheel | Zoom from deck level out to the whole planet |
| Hold T | Run the time of day fast (the match is unaffected) |
| M | Globe menu with the live planet and the standings; pauses the match |
| N | Mute |

## Tests

Install the test browser once with `npx playwright install chromium`.

```sh
npm test                    # acceptance checks 1–3: territory geometry, distinct bots, determinism
npm run perf                # acceptance check 4: frame rate through a full day at Retina resolution
npm run capture -- shots/   # every required screenshot, scripted and seeded, into shots/
npm run typecheck
```

- **Determinism** (`tests/determinism.test.ts`) records a scripted captain's helm while running a seed headless
  in Node, replays it in Chromium with full rendering at 30 and then 20 fps with a pause in the globe menu in
  between, and compares the territory hashes at the same tick.
- **Performance** (`tests/perf.ts`) serves a production build in a 1512×982 window at device pixel ratio 2,
  sweeps the clock through all 24 hours (storm included) while the match runs, and reports mean fps, 1% low,
  worst frame and the dynamic render scale per hour. Close other GPU-heavy apps while it runs.
- **Captures** (`tests/capture.ts`) find each gameplay moment (an open trail, a closing loop, a sinking, a respawn,
  a crowd of ships) by running the seeded match headless first, then replay it in the browser and frame it.
- `node tests/shot.ts --out shot.png --hour 17.5` takes a single screenshot of a running dev server (flags in the
  file header).

## Code

`src/main.ts` boots the game and runs the fixed-step loop. `src/sim.ts` is the deterministic match (it runs
headless, with no renderer), `src/world.ts` the seeded planet it plays on and `src/bots.ts` the rival captains,
who steer only through the same helm input as the player. `src/audio.ts` synthesizes the sound,
`src/craft.ts` holds the procedural-geometry kit the modelling modules share, and every other file in `src/`
draws one part of the world or the chart interface, named for what it draws.

## Credits

Third-party textures and libraries, with sources and licences, are listed in [CREDITS.md](CREDITS.md).
