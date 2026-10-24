# Portolan

A naval battle royale for iPhone and iPad on a hand-built ocean planet drawn as a living portolan chart. Ten
ships ride a great ocean current across the planet, peel off into the region of their choosing, claim the sea by
sailing loops out of their own waters, and fight to be the last one afloat while a storm closes in. Between
matches the player climbs a league of thirty rival captains that learn how it plays. Every image, sound, letter
and note is generated in code.

[PROMPT.md](PROMPT.md) is the specification. The game is being built in work packages; [progress.html](progress.html)
(open it straight from disk) shows the state of every part, the acceptance checks, the captures, the log and what
comes next.

## Run

```sh
npm start
```

Installs the dependencies on first run, then serves the game at http://localhost:5173 and opens it. Needs
Node.js 24 or newer.

## Build

```sh
npm run build     # static site in dist/
npm run preview   # serve dist/ locally to check it
```

`dist/` is self-contained (relative paths, everything bundled, no requests to other hosts).

## iOS

```sh
npm run ios                                        # iPad Pro 13-inch simulator
npm run ios -- --device iphone --shot shot.png     # iPhone 17 Pro Max, and a screenshot once the game runs
```

One command builds the web game, syncs it into the Capacitor project in `ios/` (configured by
`capacitor.config.ts`; Swift Package Manager, no CocoaPods), builds the app with `xcodebuild`, boots a
simulator headless with `xcrun simctl` (no Xcode or Simulator window), turns it to landscape, installs and
launches the app. It needs Xcode and an iOS Simulator runtime (`xcodebuild -downloadPlatform iOS`). The app's
output, including the web view's console, goes to `$TMPDIR/portolan-ios/app.log`. `tests/ios.ts` exports
the same steps for tests (`simulator`, `boot`, `install`, `launch`, `screenshot`, `backgroundAndResume`,
`appProblems`); its comments explain the simulator workarounds.

The app is landscape-only and full screen, with the status bar and home indicator hidden. It ships no image
files: the launch screen is plain parchment and the app icon set is empty. An app icon, if one is added, must be
generated in code like every other image.

## Tests

Install the test browsers once with `npx playwright install chromium webkit`.

```sh
npm test                    # every tests/**/*.test.ts
npm run check:assets        # no image, model, font, or audio files in the source or the build
npm run typecheck
```

- `tests/sim/` tests the simulation kernel: the accuracy of the deterministic math against `Math.*`
  (`math.test.ts`), the cube-sphere grids and great circles (`sphere.test.ts`), the state codec and hash
  (`codec.test.ts`), inputs, recordings, replay and resuming from snapshots (`input.test.ts`), the purity rules
  of `src/sim` and `src/career` (`purity.test.ts`), and the determinism vectors of `vectors.ts`, which must be
  bit-identical in Node, Chromium and WebKit (`determinism-vectors.test.ts`).
- Browser tests and captures run on `tests/harness.ts`: `serve()` starts Vite (dev or production build),
  `launch()` starts headless Chromium with WebGL on the GPU (ANGLE over Metal), `DEVICES` defines the iPhone and
  iPad landscape profiles (the only place they are defined), and `openGame()` opens the game on one with touch,
  pixel ratio, and safe areas emulated. The returned `Game` scripts touch (`tap`, `drag`, `pinch`, `gesture`,
  `touch`), reads and waits on the game's `window.__portolan` hook (`hook`, `until`), takes screenshots at
  device resolution, throttles the CPU, and records console errors, warnings, and stray requests (`problems`,
  `assertClean`). `tests/harness.test.ts` checks the harness itself (`SHOTS=dir` keeps its screenshots).

## Code

Layers, each in its own folder under `src/` (the full module plan is in progress.html, Architecture):

| Folder | What it holds |
| --- | --- |
| `sim/` | The deterministic simulation: every game rule, run headless on a fixed 1/30 s tick. |
| `career/` | The career state and its deterministic update from each match's result. |
| `style/` | The one style module: pigments, line, hatching, washes, paper, generated textures. |
| `lettering/` | The cancelleresca hand: glyphs as pen strokes, the broad-nib renderer. |
| `render/` | The three.js world; reads the match state, never writes it. |
| `ui/` | Screens, the HUD and touch controls, which turn touch into ship inputs. |
| `audio/` | Synthesized sound and score. |
| `app/` | Boot, the fixed-step loop, saving and resuming, test hooks. |

`src/sim` and `src/career` give bit-identical results in Node and in every browser engine: they use no
transcendental `Math` function (the engines disagree in the last bits; `src/sim/math.ts` builds sine, arctangent,
exponential and logarithm from exactly rounded operations), no clock, no `Math.random`, and nothing outside
themselves; `tests/sim/purity.test.ts` enforces it. The kernel:

- `math.ts`: the deterministic functions, vectors, and seeded sfc32 generators kept in the state.
- `sphere.ts`: the planet's radius, the cube-sphere grids that territory and the world fields live on, exact cell
  areas, local frames, great-circle movement, the horizon.
- `codec.ts`: schemas from which a state's type, versioned binary encoding and 64-bit hash all follow.
- `state.ts`: the match state, created from a match setup; `encodeMatch`/`decodeMatch` are its snapshot and
  `matchHash` its hash.
- `input.ts`: `ShipInput`, the only way the player and the captains act on a match; recordings and replay.
- `match.ts`: the step, which runs every system in order once per tick, and the headless runner.

## Credits

Libraries and tools, with sources and licences, are listed in [CREDITS.md](CREDITS.md).
