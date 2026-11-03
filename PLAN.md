# Portolan: the plan

This is the only design document for Portolan. It's the owner's, and agents never edit it.

## Rules

- **No humans, and no sign that people ever lived here.** No buildings, masonry, ruins, harbours, docks, lighthouses or crews. Ships sail themselves, and their captains are spirits.
- **All geometry is generated in code.** Textures and recorded sounds come from free libraries, and every one is credited in CREDITS.md.
- **No reference images.** The world is described in words.
- **Replace anything when the replacement is better.** Never leave a feature missing: whatever replaces it lands in the same change.
- **Commit and push to main often.**
- **Design decisions go in commit messages,** and nowhere else.

## How to work

- **Spend the effort on implementation:** shaders, generated models, systems and content. Not on tests, tooling or documents. Expect the game to grow to several hundred thousand lines. You decide what complete means.
- **The owner works on this Mac while agents build. Develop and look at the game only in headless browsers, preferably Playwright's WebKit, which is the iPad's own engine. Never open a visible window: no headed browser, no `vite --open`, no iOS Simulator.**

## The game

Portolan is a battle royale at sea with Fortnite's feel, on one planet you learn over many matches. It's single-player and offline. You fight 19 bot captains inside a career that remembers you.

- **Devices:** landscape only, on an iPad with an M1 or newer and an iPhone 15 Pro or newer, on iOS 26 or later. Both layouts are designed, not scaled.
- **No fallbacks of any kind:** no WebGL path, no accessibility options, no low-quality mode and no support for older devices.
- **The look:** the world is cinematic and photographic. Parchment and ink appear only in the interface, the chart and the title.
- **Names:** anything the player has to understand gets a plain name: ranks, items, abilities, currency and stats. Places, captains and cosmetics get evocative ones.

## The planet

### Size and shape

- **A real sphere,** about 554 m in radius, with poles and a true horizon. Ships sail great circles.
- **The top speed is 14.5 m/s,** so a lap of the equator takes about 4 minutes.
- **The horizon is part of every fight.** From the chase camera, another ship's mast drops below the horizon at about 240 m, and ships rise over it as they close.
- **The climate changes with latitude,** from ice at one pole to heat toward the other.

### One world

The planet is one very cohesive world. It must never feel like random points of interest slapped onto a blank patch of sea. Named places and the unnamed water between them flow into each other, the way a battle royale map's areas run together with no seams. You invent the places and name them.

- **Places have landmarks.** Whoever holds a landmark gains its perk for as long as they hold it.
- **Places have events** that change them during a match.
- **No humans,** here as everywhere.

### Day and night

- **There is one sun, so half the planet is always dark.**
- **Each match starts at a random hour,** and the sun moves during it.
- **The planet's tilt varies from match to match,** so a pole can have midnight sun or polar night.
- **Night changes fights.** Beyond about 150 m, an enemy shows only as its lantern's glow.

### Weather

Weather systems drift across the planet, and you see them coming as real cloud formations. Each kind has one clear effect on play, such as fog that shortens the sightline, rain with gusts and rough water, thunder whose lightning strikes ships in the open, or a calm that kills the wind. The planet shapes its weather: snow where it's cold, and ash downwind of fire.

### Wind, tides and currents

- **Wind** blows over the whole planet, with gusts, and calm water behind islands. It shows on the water and the sails, and weather systems bend it.
- **Tides** rise and fall during a match, opening and closing shallows, reef gaps and channels.
- **Currents** are the fast lanes. A great current runs around the equator.

### Creatures

- **The gull** brings deliveries. Flocks follow ships and gather at cliffs.
- **The whale** surfaces, blows and dives. A giant one breaching can lift and flip ships.

## A match

- **20 ships, about 10–12 minutes.**
- **The Gale drop:** the Gale carries the fleet high over the planet, showing the globe with its day and night halves and its weather, and you dive to where you choose.
- **The Storm closes in.** Its first safe zone covers half the planet. It damages the hull directly and ignores the shield.
- **One ship type,** the way Fortnite has one body. Ships differ only in cosmetics, and every ship carries a spirit lantern.
- **Weapons** come in classes and rarities, held on a hotbar, and are aimed by the player.
- **The shield is an aura around the ship.** It brightens as it fills, ripples where it's hit and cracks as it weakens. Breaking it is one of the biggest moments in the game. Ships start each match with no shield.
- **Consumables** restore the shield and repair the hull.
- **The gust** is a basic move everyone has, like sprinting: a burst of wind and a hop off the water.
- **Abilities:** you bring an active one and a passive one into each match. Everyone starts with the same solid pair, and later abilities are different, never stronger. Bots choose abilities too.
- **Water you hold takes your colour,** and you slowly repair in it.
- **Coins** exist only inside a match. You earn them in play and spend them on gull deliveries.

## Gameplay depth

The game must reward skill and reward learning the planet. These are directions, not a checklist. Add mechanics of your own.

- **Sailing skill:** wind shadows behind islands, tacking, riding a current at the right moment, and timing the tides.
- **Combat counterplay:** every attack has an answer, and positioning, angle and the horizon matter as much as aim.
- **Damage to parts of the ship:** sails tear, a mast can fall, the hull floods and a rudder can be shot away.
- **Places as tactical puzzles:** each place plays differently because of its ground, its landmark, its event and its water.
- **Bots that use all of it,** so you learn from watching them.

## The career

- **A league of captains,** each with a temperament. Each is a spirit, shown by a sail emblem, never a face.
- **Captains learn your habits and hold grudges.** Your rivals turn up more often.
- **A hidden skill rating** picks your opponents. The bots are tuned so you finish in the top 5 about half the time.
- **Ranks** follow the skill rating.
- **Levels unlock abilities and cosmetics,** and ranks unlock show-off cosmetics.
- **No shop,** and no currency between matches.

## Interface

The interface should feel like a polished, big-budget mobile game, in the menus as much as in a match.

- **Parchment and ink are the material,** but readability wins: bold type, big thumb-sized buttons and strong rarity colours.
- **Shared parts** are built once from one set of tokens: colours, type sizes, spacing, corner radii and shadows. Every screen uses them.
- **Every tap is answered** with a press animation, a sound and a haptic.
- **Nothing pops in.** Every screen change animates, lists stagger in, numbers count up and rewards fly into their counters. There are no blank frames, no layout jumps and no unstyled loading states.
- **The lobby sits over the live 3D planet,** with your ship on the water at the current hour, wearing your cosmetics.
- **Big moments get a full-screen ceremony,** with camera, particles, sound and haptics.
- **The HUD is minimal,** and the important things are big.
- **iPad and iPhone layouts are each designed,** respecting safe areas and thumb reach.
- **No graphics quality setting.**

## Graphics

WebGPU only, through three.js's WebGPURenderer and TSL, with three pinned at 0.186.1. There's no WebGL path. Every GLSL shader in the repo, whether a ShaderMaterial or an `onBeforeCompile` patch, is rewritten in TSL. Three ships ready-made TSL effects in `node_modules/three/examples/jsm/tsl/display/`, including SSGI, SSR, GTAO, TRAA, bloom, depth of field, motion blur, god rays and lens flare, run through `RenderPipeline`.

WebGPU works in Playwright's headless WebKit on this Mac and in headless Chromium launched with `--enable-unsafe-webgpu --use-angle=metal`. It doesn't work in the iOS Simulator.

Use the best real-time techniques there are:

- **Lighting:**
  - physically based materials: GGX with multiple scattering, clearcoat, sheen, transmission and thin subsurface scattering;
  - image-based lighting from the live sky, re-captured as it changes, with spherical-harmonic probes and reflection probes;
  - cascaded shadow maps with soft contact-hardening shadows, plus screen-space contact shadows;
  - ambient occlusion from GTAO with bent normals, on top of occlusion baked into the generated meshes;
  - clustered lighting for the many small lights: lanterns, beacons, muzzle flashes and fire.
- **Sky:**
  - a physically based atmosphere with aerial perspective;
  - raymarched volumetric clouds drawn from the simulation's weather systems, lit from inside by lightning;
  - volumetric fog and god rays;
  - stars, a moon with phases, and aurora.
- **Water:**
  - an FFT ocean in several cascades, with foam where waves fold;
  - light absorbed by depth, refraction and caustics;
  - screen-space reflections that fall back to probes;
  - shore foam from a distance field;
  - wakes in a GPU height field;
  - flow maps for the currents and whirlpools.
- **Surfaces:**
  - terrain blended by height, projected on three axes and tiled without repetition, with parallax occlusion;
  - weathering in the shader: wet, snow, moss and salt;
  - decals for scorch marks and damage;
  - instanced plants that move in the wind, with impostors in the distance.
- **Effects:**
  - GPU particles: soft and lit, with six-way-lit smoke, flipbooks and ribbon trails;
  - heat haze;
  - fracture and debris;
  - cloth sails and ropes.
- **Post-processing:**
  - auto-exposure from a histogram;
  - physically based bloom;
  - AgX tone mapping with a colour-grading LUT;
  - temporal anti-aliasing and upscaling;
  - motion blur, depth of field, lens flare with lens dirt, and film grain.
- **Interface:**
  - parchment rendered on the GPU, with fibre normals, deckled edges, ink that bleeds and wax seals that catch the light;
  - 3D icons made from the game's own models.

## Feel

Every mechanic should feel physical:
- you see and hear it coming;
- it lands with a hit-stop, a flash and a clear hit marker;
- the camera kicks, shakes or zooms in proportion to the moment;
- splinters, spray, smoke or sparks fly;
- its sound is layered, such as a crack, a boom and a tail;
- the numbers, bars and markers react;
- the phone or iPad responds with a haptic.

It reads at a glance on a phone.

## Sound

- **No music, anywhere.** A match sounds like the sea, the wind, the weather and the guns.
- **Sounds are layered,** and every place has its own ambience.
- **Sounds can be synthesized or recorded** from free libraries. Every recording is credited.

## Assets

- **Textures:** for each material, use the best scanned or Substance-built version from ambientCG or Poly Haven. Never use ambientCG materials tagged "Approximated".
- **Credits:** every texture and sound is credited in CREDITS.md.
- **The build can be up to 2 GB.**

## Later, or out

- **Later:** a free voyage mode on the same planet, with no Storm and no timer; and secrets to find, some of which pay off in matches.
- **Parked:** other ship types.
- **Out:** trading, music and online play.

## Where things live

- `index.html` loads `src/app/main.ts`.
- `src/app/`: the app: the frame loop, the flow between screens, and the adapters that connect the simulation, the stage, the interface, sound and the career.
- `src/sim/`: a match on the sphere: sailing, wind, weather, the Storm, combat, items, abilities, perks, territory, the whale, and the bot captains (`captains/`). `src/sim/world/` holds the planet's places and terrain.
- `src/render/`: the planet on screen: the engine, sky, water, terrain and its materials, landmarks, beacons and events (`regions/`), and the ships, gull, whale, projectiles, particles and wakes (`actors/`).
- `src/ui/`: the interface: shared parts and tokens (`parts/`) and screens (`screens/`).
- `src/career/`: the league, captains, rating, ranks, levels, cosmetics and saving.
- `src/audio/`: the sound engine and every sound. `src/juice/`: camera kicks, hit-stop, haptics and easing. `src/icons/`: icons drawn in code.
- `dev/`: pages that show one part on its own.
- `public/`: textures and fonts.
- `tools/`: `harness.ts` serves the game and opens it in a headless browser, `capture/` takes screenshots and frame strips, `check-assets.ts` checks the build's assets, and `ios.ts` builds the iOS app.
- `ios/`: the Capacitor shell.
- **Built but not in the game yet:** the scanned material library (`src/render/materials/`), the plant kits (`src/render/flora/`) and the weather effects (`src/render/weather/`). The rock kit (`src/render/rocks/`) is used only for ice floes.
