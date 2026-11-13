# Decisions

If something you want to do "violates" a decision here. note it so we can make the necessary correction.

What the owner has decided, one line each with its reason. These are not open for a port, an agent or a critic to
change; bring a change to the owner first. `CLAUDE.md` holds the platform rules, `docs/art-direction.md` the look,
`tests/architecture.test.ts` the code rules. This file holds the rest.

## Play

- **Fortnite's conventions are the default.** Where the game has no rule of its own, do as Fortnite does, and ask the
  owner before departing from it.
- **Every ship starts with nothing.** No gun, no stores: the first minute is the hunt for loot.
- **Two gun slots**, five kinds (cannon, scatter, repeater, harpoon, mortar), five rarities. Their numbers are in
  `src/sim/handling.ts`, ported from the previous battle royale; change them by play-testing, not by taste.
- **Damage numbers stay.**
- **A sunk ship drops what she held.**
- **The camera sits back and up** (about 55 m up and 64 m astern, `src/play/chase.ts`): the fight around her matters
  more than her own decks.
- **No night.** The sun stands at the same height over every place (`src/world/sun.ts`); the clock does not advance.
  A fixed sun on a 554 m globe put a player in the dark within a minute.
- **Weather drifts slowly and globally** (wind, cloud, haze: `src/world/weather.ts`). No local systems, no events,
  nothing that depends on where the players are.

## Minimap

- **North-up.**
- **No enemy ships on it, ever.**
- **No loot on it.** Loot is found by eye: its glow and beam in the world.

## Look

- **The Storm is violet**, so it never reads as an enemy's red.
- **Territory is a crisp glowing border with a flat, light tint.** No hatching.
- **No figurehead.** The hull is varnished timber, made to look good as wood.
- **A painted hull is not decided.** If done: paint on the upper works and stern only, timber below; never a tint
  over the whole hull.
- **No coffee rings or stains** on any parchment: UI, loading screen, icon.
- **The drawn compass rose** (`src/ui/marks.ts` `rose`) is the game's mark: the loading screen, the app icon.
- **Loot floats as the thing itself** (the gun, glowing in its rarity's colour under a beam), not as a cask or crate.

## Screens

- **PLAY dissolves into the descent from space.** Leave it as it is.
- **Leaving a match goes under held parchment** with the rose turning: at least half a second, and until the lobby
  is drawn. No text.
- **Panels over the live game** (sunk, spectate, won, result) never get a loading screen: the game is not covered.

## Sound

- **All sound is synthesized** (`src/audio`).
- **No timber creak.** It sounded terrible on the phone. The rope's creak stays.

## Rendering

- **The scene renders at 1.5 times CSS size** (1434×660 on the phone). Twice stutters on the iPhone 16 Pro Max;
  measured by the owner, by hand.
- **Sharper without the cost** (effects kept at today's size, an edge-aware upscale) was offered and declined.

## Code

- **Clean architecture comes first; no three.js hacks.** No private fields, no patched internals, no workarounds
  kept "for now". If three cannot do it cleanly, bring the choice to the owner.
- **The sim holds nothing that exists only to be drawn.** (Known exception: `Ball.to`.)
- **Port from the previous battle royale rather than redesign** where it had the feature: its rules and numbers,
  rewritten to this architecture. `docs/ports.md` maps where each old feature lives.
- **No gate is weakened to land work.** A test margin that must move is moved with a comment saying why.
