# Working

How work is done on this repo by an orchestrating agent and its subagents. `CLAUDE.md` comes first; this adds what
it does not say. `docs/decisions.md` holds what the owner has decided about the game.

## With the owner

- **Discuss a design change before starting it.** Describe what would be built and wait for a yes.
- **Ask, don't decide, on conventions**: what is on the minimap, what a ship starts with, how a screen changes.
  One decision at a time, with a recommendation.
- **Report briefly and faithfully**: what landed, what was checked and how, what was not verified.
- **`CLAUDE.md` is the owner's.** No agent edits it. The same for the owner's uncommitted edits to any file: never
  commit, revert or overwrite them.

## Agents

- The orchestrator delegates, reviews what comes back (the diff, the gates, the captures, with its own eyes), and
  lands it.
- **At most two subagents at a time, Opus at most**, the model named explicitly, each in its own worktree with a
  written brief: the goal, the files to read, the rules below, the gates, what to report.
- A subagent commits on its worktree's branch and does not push. The orchestrator lands it.

## Landing

1. The agent's branch starts at the tip of `main` and is rebased onto it if `main` has moved.
2. `git merge --ff-only <branch>` in the main checkout. History stays linear: no merge commits, no force pushes.
3. The gates, on main: `npm test`, `npm run build`, and those the change could touch of `npm run budget`,
   `npm run hitch`, `npm run steps`, `npm run audio`, `node tools/matches.ts 3`.
4. `git push origin main`.
5. Remove the agent's worktree and branch.

## The gates

| Gate | Holds |
|---|---|
| `npm test` | Types, the unit tests, and `tests/architecture.test.ts`: the layer table, 450 lines a file, no `any`, no casts, no words of temporary work, debug switches only in `src/debug.ts` |
| `npm run build` | The bundle builds |
| `npm run budget` | At most 100 draws, 900k triangles, 20 passes a frame (the map: 1M triangles) |
| `npm run hitch` | At most one frame over 50 ms and four over 33 ms |
| `npm run steps` | The sim's and the sea's step times |
| `npm run audio` | Every sound renders, none clips |
| `node tools/matches.ts 3` | Whole matches play out: none stuck, they end |

## The machine

- **Shell:** `.claude/hooks/shell-guard.mjs` turns back what would prompt or destroy. One action a call; the file
  tools for reading and editing; long commands in a script file; nothing deleted outside the worktree.
- **Browsers:** headless Chrome only, through the tools (`tools/capture.ts`, `tools/hero.ts`). Never Safari or a
  visible window. Leave no dev server or browser running: check with `pgrep -fl "headless|vite"`.
- **No `caffeinate`, no `sudo`, no stray processes.**
- **The previous game** is checked out read-only at `/Users/dk/Developer/game-portolan-0117`. Read it to port from;
  never change it.

## The phone

iPhone 16 Pro Max. Installs may be launched, and the phone may be screenshotted (`npm run shot`).

    npm run build
    npx cap sync ios
    sh tools/phone.sh

Frame rate, sound and feel are judged there by the owner; headless Chrome on the Mac measures none of them.

## Captures

`captures/` is not tracked. `captures/critique/round-00` is the art critic's baseline and stays until the second
critique; `captures/reference` stays. Anything else there is scratch: clear it when the work lands.

## Open

- **Critic pass 2**, now that weapons, handling and the architecture review are in. Round 0 scored Rich 3,
  Cinematic 3, Coherent 4, Readable 3.
- **Art round 2:** islands, the title screen, the rank seals, combat effects, aged UI (without stains), the Storm's
  face (flat, streaky at its base, jagged from space), how loot reads (washed out).
- **Bugs:** the result card reads "1 / 0" on a win by the Storm; the mortar reads as a stub on its mount and its
  muzzle clips the quarterdeck dead astern; the career's gain is not yet a real formula.
- **Tuning:** the mortar hits 30 to 50% of the time; a second kind of gun is found at about 27 s (median).
- **Code:** `ui/veil.ts` copies the canvas on PLAY; `Ball.to` in the sim is only drawn; audio and gunfire each keep
  a copy of a sim number, held equal by a test; five wall-clock asserts remain in the tests (territory, bot, route,
  planet).
- **Unmeasured on the phone:** the Storm's GPU cost; the turning rose on the loading screen.
- **If a bad low noise is still heard at the start of a match:** the `launch` cue on PLAY (`src/audio/sounds/ui.ts`)
  has the same kind of click train the creak had.
