# Portolan

Portolan is a single-player, offline battle royale at sea for iPad and iPhone. You sail one of twenty ships
against nineteen bot captains on one small planet you learn over many matches, inside a career that remembers you.

This file holds what is true of every change. What to build lives in GitHub issues; why something was built lives
in commit messages. This file and CREDITS.md are the only documents in the repo.

## Working

- **Never deploy to Vercel.** The Vercel project serves the first Portolan from the `legacy-territory` branch and
  nothing else. Don't run `vercel` deploy commands from main, even when a change looks ready to show.
- **Work comes from issues** on dhruva-dk/game-portolan. An issue is a title and a list of user stories. It is done
  when every story is true on the iPad, and the commit that makes it true closes it.
- **The owner decides what gets built.** Build only what an issue asks for. File bugs you find as issues; propose
  new features, modes and content to the owner, never just build them.
- **Depth before breadth.** Make what is in the game beautiful, polished and solid before anything new goes in.
  Less code is better when the result is the same; delete what nothing uses.
- **Replace anything when the replacement is better,** in the same change. Remove a feature only when an issue says so.
- **Spend the effort on the game,** not on tests, tooling or documents.
- **Commit and push to main often.** Design decisions go in commit messages and nowhere else. No Co-Authored-By
  or other attribution lines.
- **No planning or documentation files:** no plans, notes, task lists, logs or READMEs.
- **Look in the repo before building something.** It has scanned materials, plant and rock kits, weather effects,
  and capture tools in `tools/capture/`.
- **Look at the game to build it, not to prove it.** When a capture shows something wrong, fix it and move on.

## Where the game is judged

- **The iPad is the truth.** An M1 iPad Air is the floor. `npm run ios:ipad` builds, installs and launches the game
  over USB, and `xcrun devicectl device process launch --console --terminate-existing --device <iPad> com.portolan.game`
  streams its console. iOS's WebGPU enforces limits desktop Chrome doesn't, so nothing is done until it runs there.
- **On this Mac, headless only.** `tools/harness.ts` drives headless Chromium. Never open a visible window: no headed
  browser, no `vite --open`, no iOS Simulator.
- **Devices:** landscape only, on an M1 iPad or newer and an iPhone 15 Pro or newer, running iOS 26 or later. Both
  layouts are designed, not scaled.
- **Platform:** WebGPU only, through three.js 0.186.1's WebGPURenderer and TSL. No WebGL path, no fallbacks, no
  quality setting, no accessibility options, no older devices.

## The world

- **No humans, and no sign that people ever lived here:** no buildings, ruins, harbours, docks or crews. Ships sail
  themselves, and their captains are spirits.
- **All geometry is generated in code.** Textures and recorded sounds come from free libraries: the best scanned
  version on ambientCG or Poly Haven, never ambientCG's "Approximated". Every one is credited in CREDITS.md. The
  build can be up to 2 GB.
- **One ship.** Every ship is the same ship; captains differ by colour, emblem and cosmetics.
- **The bar is a current AAA console game as it ships on an iPad,** in motion and up close: physically based and
  art-directed, at a steady 30 fps on an M1 iPad Air. When an effect costs more than it shows, the cheaper one wins.
  The painterly feel comes from light, atmosphere and composition, never from outlines or flat colour. Each hour and
  each weather has its own palette.
- **Readability first.** Every captain reads at a glance by colour and emblem. Ships separate from the sea in value
  and silhouette. Enemies, shots, the Storm's edge and loot read before anything else. Nothing shimmers, crawls,
  flickers or bands.

## The interface is the chart

Everything the player reads is drawn the way a sixteenth-century chartmaker would draw it: papyrus and vellum,
iron-gall ink and watercolour, compass roses, rhumb lines, graduated rings, cartouches, pennants and wax seals.
The interface of the first Portolan (commit a3536d0, `src/chart.ts`) is the standard to meet.

- **No words and no numerals.** Captains are their emblems and colours, places are their signs and coastlines, and
  quantities are drawn: pennant lengths, inked rings, a sand-glass, tally marks, shot.
- **Teach with drawings** the first time something appears: a pointing hand, dotted courses, small woodcut diagrams.
- **Buttons are objects:** seals, cartouches, instruments, pennants. **Screens are sheets:** the lobby is a chart
  over the live planet, and the menus are its folios. No rounded rectangles, gradients, smoked glass, drop-shadow
  panels or glyph-font icons.
- **Rarity is illumination:** plain ink, red rubric, red and blue, silver leaf, gold leaf.
- **Every tap is answered** with a press, a sound and a haptic. **Nothing pops in:** screens animate, lists stagger,
  rewards fly to where they go.

## Play

Every feature is judged against four pillars:
1. **Read the sea.** Wind, tides, currents, weather, light and the curve of the world are the terrain.
2. **Every fight is a decision:** when to engage, from which side, with what, and when to break off.
3. **Easy to sail, a lifetime to master.**
4. **A living planet:** systems, not scripts, so no two matches play alike.

**Feel:** every action is seen and heard coming, and lands with hit-stop, a flash, the camera, debris, layered sound
and a haptic. Controls answer on the next frame; a ship's weight comes from its motion and the camera, never from
input lag.

**Sound:** no music anywhere. The sea, the wind, the weather and the guns, layered, and every place with its own ambience.
