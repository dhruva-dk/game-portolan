# Portolan: the plan

This is the only design document for Portolan. It's the owner's, and agents never edit it.

## Rules

- **No humans, and no sign that people ever lived here.** No buildings, masonry, ruins, harbours, docks, lighthouses or crews. Ships sail themselves, and their captains are spirits.
- **All geometry is generated in code.** Textures and recorded sounds come from free libraries, and every one is credited in CREDITS.md.
- **No reference images.** The world is described in words.
- **Replace anything when the replacement is better.** Never leave a feature missing: whatever replaces it lands in the same change.
- **Commit and push to main often.**
- **Design decisions go in commit messages,** and nowhere else.
- **No planning or documentation files.** Never add plans, notes, design documents, logs, task lists or READMEs to the repo. This plan is the only design document, decisions live in commit messages, and everything else is code.

## How to work

- **Spend the effort on implementation:** shaders, generated models, systems and content. Not on tests, tooling or documents. Expect the game to grow to several hundred thousand lines. You decide what complete means.
- **The owner works on this Mac while agents build. Develop and look at the game only in headless browsers. `tools/harness.ts` drives headless Chromium, and Playwright's WebKit, the iPad's own engine, is for checking that it draws the same. Never open a visible window: no headed browser, no `vite --open`, no iOS Simulator.**
- **Look at the game to build it, not to prove it.** When a capture shows something wrong, fix it and move on.
- **Look in the repo before building something.** It already has a library of scanned materials, plant kits, weather effects and a rock kit, and capture tools in `tools/capture/`.

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

## Gameplay

Design the game the way a design team at a top studio does: from pillars, through loops, into systems that interact. What follows is direction, not a checklist. Add mechanics of your own.

### Pillars

Every feature is judged against these.

1. **Read the sea.** Wind, tides, currents, weather, light and the curve of the world are the terrain. A captain who reads them beats a captain who only aims.
2. **Every fight is a decision.** When to engage, from which side, with which weapon, and when to break off. Position wins more fights than reflexes.
3. **Easy to sail, a lifetime to master.** A low skill floor and a high skill ceiling: the first match is fun, and the hundredth still teaches you something.
4. **A living planet.** Systems, not scripts. Places change during a match and systems combine in ways nobody scripted, so no two matches play alike.

### Loops

- **Moment to moment,** the "thirty seconds of fun" Bungie built Halo's combat around: steering against the wind, lining up a shot over the swell, the gust hop, reading a hit.
- **The encounter:** a mast rises over the horizon. You choose to engage, shadow or avoid. You fight for position, trade fire, break a shield, and then finish, break off, or get third-partied by a ship the noise drew in.
- **The match:** the drop, the first loot, rotating ahead of the Storm, contesting landmarks, and endgame circles where position is everything.
- **The career:** rank, unlocks, and rivals who remember you.

### Sailing

- **Points of sail.** Speed depends on the angle to the apparent wind: slowest head to wind, fastest on a broad reach. Head to wind is slow but never a dead stop. Tacking and gybing are skills with a cost and a payoff.
- **Weight.** The ship heels in strong wind, slides to leeward, carries momentum through turns, and turns tighter when slow.
- **Wind shadows.** Islands and ships cast them. A ship upwind of a rival blankets its sails.
- **Set and drift.** Currents carry you. Riding the great current is fast, and crossing it costs time. Tides open reef passages for a few minutes at a time.
- **Sea state.** Weather builds the swell, and a rolling deck throws off aim.

### Combat

- **Engagement ranges are built around the horizon** at about 240 m. Long-range fire arcs over the curve at a mast you can see above a hull you can't. Mid range is the duel. Close range is broadsides and scatter shot.
- **Ballistics:** shots have travel time and drop, so you lead a moving target and correct your aim from the fall of shot.
- **Time to kill** is long enough for a fight to have an arc (react, reposition, outplay, break off) and short enough that an ambush from a good position pays.
- **Position, in naval terms:**
  - **The weather gage:** the upwind ship chooses when a fight starts and when it ends.
  - **Raking fire:** a shot down a ship's length, through the bow or the stern, does the most harm.
  - **Crossing the T:** bringing your broadside to bear on a ship that can only answer with its bow.
  - **Cover:** islands, stacks, fog and the horizon itself break line of sight.
- **Telegraphing and counterplay:** every heavy attack winds up where you can see and hear it, and every attack has an answer, such as the gust hop, turning bow-on, breaking line of sight, the shield or smoke.
- **Damage to parts of the ship.** Hits land where they land. Torn sails cost drive, a shot-through mast falls, waterline hits flood the hull so it lists and slows, and a damaged rudder makes steering sluggish. Shot made for a purpose, such as chain shot for rigging or heated shot for fire, makes aiming at a part a choice. Repairing under fire is a decision.
- **Risk and reward:** the best loot and the landmarks sit where you're most exposed, and holding a landmark announces you.
- **Third-partying:** gunfire, smoke and burning ships draw others in, so every fight is a gamble on who's watching.
- **Comebacks:** a damaged ship can still win through position, the gust, a current or the weather.

### Systems that combine

Build rules, not scripted set pieces, so systems combine the way Breath of the Wild's chemistry engine does ("Breaking Conventions with The Legend of Zelda: Breath of the Wild", GDC 2017). For example:
- fire spreads across canvas faster downwind, and rain puts it out;
- lightning finds the tallest mast;
- fog swallows lantern light;
- a falling tide strands a ship on a reef;
- a breaching whale swamps whatever is near;
- ice on the rigging slows turning.

### Places as encounter spaces

Design each place the way a level designer does:
- sightlines and the horizon;
- chokepoints and channels;
- flanking routes;
- cover;
- safe and exposed water;
- landmarks for finding your way, using Kevin Lynch's paths, edges, districts, nodes and landmarks (*The Image of the City*, 1960).

Each place favours a different kind of fight, and its event and the tide change which kind.

### Bots

- **Captains are built like a shipped game's AI.** Utility scoring picks what to do next (Mark and Lewis, "Building a Better Centaur: AI at Massive Scale", GDC 2015). Behaviour trees carry it out (Isla, "Handling Complexity in the Halo 2 AI", GDC 2005). Influence maps of danger, loot and the Storm choose where to go.
- **Fair perception:** a captain sees only what could be seen from its ship, given the horizon, night, fog and lanterns. It hears gunfire. It never sees through anything.
- **Believable skill:** aim error, reaction time and the quality of decisions scale with skill, and captains make the mistakes players make.
- **Personality:** a captain's temperament changes what it values, and its memory and grudges change whom it hunts.
- **They use every system:** wind, currents, tides, weather, cover, abilities and landmarks. You learn the game by watching them.
- **A pacing director** watches the match's tension and nudges where captains go, so a match builds instead of stalling (Booth, "The AI Systems of Left 4 Dead", AIIDE 2009).

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

### The bar

The bar is a current AAA console release, in motion and up close. It is not "good for a web game". Build every system the way a rendering team at a top studio does: physically based, temporally stable, art-directed, and made from the techniques in the spec below. The talks and papers named there are where each technique was defined. They're methods to use, never looks to copy.

### Platform

WebGPU only, through three.js's WebGPURenderer and TSL, with three pinned at 0.186.1. There's no WebGL path. Every GLSL shader in the repo, whether a ShaderMaterial or an `onBeforeCompile` patch, is rewritten in TSL. Three ships ready-made TSL effects in `node_modules/three/examples/jsm/tsl/display/`, including SSGI, SSR, GTAO, TRAA, bloom, depth of field, motion blur, god rays and lens flare, run through `RenderPipeline`.

WebGPU works in Playwright's headless WebKit on this Mac and in headless Chromium launched with `--enable-unsafe-webgpu --use-angle=metal`. It doesn't work in the iOS Simulator.

### The visual target

These are frames the game must be able to produce, described the way an art director describes key art. They set the bar. They aren't shots to reproduce, and the places in them are yours to invent.

- **The Gale drop.** The planet hangs below with the line between day and night cutting across it. One half is lit, and the other is pricked with beacon and lantern light. The atmosphere is a thin glowing rim at the planet's edge, and weather systems are real cloud masses throwing shadows on the sea.
- **Dusk under a thunderhead.** The sun is below the cloud base and lights its underside orange while the sea beneath goes slate. Rain hangs in shafts. Wet sails turn dark and glossy. Lightning lights the cloud from inside a beat before the bolt lands.
- **Shallows at noon.** The water is clear enough to show the reef. Caustics dance on the sand. The colour runs from turquoise over sand to ink-blue where the shelf drops away, and a ship's shadow falls on the seabed.
- **A night battle.** Moonlight silvers the swell. Lanterns, beacons and glowing wakes are the only warm light. Muzzle flashes light their own smoke from inside, and burning sails give a ship away.
- **High latitude in snow.** A low sun casts long blue shadows. Sea smoke rises off dark, heavy water. Ice builds on the rigging, and snow streaks past the camera.
- **Downwind of fire.** Grey ash falls like snow, and embers drift. The sun is a red disc through the smoke, and lava glow lights the plume from below.
- **The ship at ten metres.** The planking is wet, with a salt crust at the waterline. Ropes have real twist and sag. The canvas glows against the sun so its seams show. The lantern's glass bends its flame.
- **The shield breaking.** Shards of the aura scatter with refraction and motion blur, a flash blooms, and a ring of ripples runs out across the sea.

How it's directed:
- **A colour script.** Each hour and each kind of weather has its own palette, so a match plays out as a sequence of moods, the way a film's colour script does.
- **Light is the art direction.** The painterly feel comes from light, atmosphere and composition, never from outlines or flat colour.
- **Readability.** Ships always separate from the sea in value and silhouette. What matters for play reads first: enemies, shots, the Storm's edge and loot.
- **Temporal stability.** Nothing shimmers, crawls, flickers or bands. Dither every gradient (Gjøl and Svendsen, "The Rendering of INSIDE", GDC 2016).
- **Cinematic tone.** A physically based sky and lighting that still look art-directed, as in Patry's "Real-Time Samurai Cinema" on Ghost of Tsushima's lighting, atmosphere and tone mapping (SIGGRAPH 2021, Advances in Real-Time Rendering).

### The rendering spec

**Lighting and materials**
- **Physically based shading:** GGX microfacets with Smith visibility, the model in Karis's "Real Shading in Unreal Engine 4" (SIGGRAPH 2013) and Lagarde and de Rousiers's "Moving Frostbite to Physically Based Rendering" (SIGGRAPH 2014).
  - Energy-conserving multiple scattering (Kulla and Conty, SIGGRAPH 2017; Fdez-Agüera, JCGT 2019).
  - Clearcoat for paint and wet surfaces, and sheen for canvas and rope.
  - Transmission and thin-surface subsurface scattering for sails, leaves, ice and the shield.
- **Image-based lighting from the live sky:** the sky is re-captured into a prefiltered environment map as the sun and weather change, with spherical-harmonic irradiance and local reflection probes, so every material sits in the same light.
- **Shadows:**
  - cascaded shadow maps, stabilised so their edges never shimmer;
  - percentage-closer soft shadows that harden near contact (Fernando, SIGGRAPH 2005);
  - screen-space contact shadows;
  - cloud shadows cast onto the sea and the land.
- **Ambient occlusion:** GTAO with bent normals (Jimenez et al., "Practical Real-Time Strategies for Accurate Indirect Occlusion", SIGGRAPH 2016), on top of occlusion baked into the generated meshes.
- **Bounce light:** screen-space global illumination off sails, cliffs and the sea.
- **Many lights:** clustered forward shading (Olsson, Billeter and Assarsson, HPG 2012) for lanterns, beacons, muzzle flashes, fire and lightning.

**Sky and atmosphere**
- **Hillaire's atmosphere** ("A Scalable and Production Ready Sky and Atmosphere Rendering Technique", EGSR 2020):
  - lookup tables for transmittance, multiple scattering and the sky view;
  - an aerial-perspective volume, so distance turns islands blue and sunsets redden through real optical depth.

  The planet is tiny, so tune the atmosphere so the haze still reads at a few hundred metres.
- **Volumetric clouds,** raymarched as in Horizon Zero Dawn's Nubis (Schneider and Vos, SIGGRAPH 2015; Schneider, SIGGRAPH 2017) and Red Dead Redemption 2 (Bauer, SIGGRAPH 2019, Advances in Real-Time Rendering):
  - coverage comes from a weather map that the simulation's storm systems paint;
  - lighting uses the Beer–powder model, with temporal reprojection;
  - lightning lights the clouds from inside.
- **Froxel volumetric fog** with unified participating media (Wronski, "Volumetric Fog", SIGGRAPH 2014; Hillaire, "Physically Based and Unified Volumetric Rendering in Frostbite", SIGGRAPH 2015). It covers fog banks, rain haze, ash, sea smoke, god rays through cloud gaps and rigging, and lantern halos.
- **Night:** stars, a moon with phases that lights the scene, and aurora at high latitude.

**Water**
- **An FFT ocean** (Tessendorf, "Simulating Ocean Water", 2001):
  - several cascades;
  - an empirical directional wave spectrum (Horvath, DigiPro 2015) driven by the simulation's wind and weather;
  - choppy horizontal displacement;
  - whitecaps wherever the Jacobian folds the surface.
- **Shading:**
  - Fresnel reflection;
  - light scattering through wave crests;
  - Beer–Lambert absorption by depth over the seabed;
  - refraction and caustics.
- **Reflections:** stochastic screen-space reflections (Stachowiak, SIGGRAPH 2015) that fall back to the sky probe.
- **Shore and wakes:**
  - shore foam from a signed distance field of the coastline;
  - wakes, bow waves and shot splashes in a GPU height field or wave particles (Yuksel, House and Keyser, SIGGRAPH 2007), which ships actually ride.
- **Flow:** flow maps for currents and whirlpools (Vlachos, "Water Flow in Portal 2", SIGGRAPH 2010).
- **The ocean as the star of a game:** Ang, Catling, Cifariello Ciardi and Kozin, "The Technical Art of Sea of Thieves" (SIGGRAPH 2018).

**Land, plants and surfaces**
- **Terrain:**
  - scanned materials blended by height and projected on three axes;
  - stochastic tiling so no texture visibly repeats (Heitz and Neyret, HPG 2018; Mikkelsen's hex-tiling, JCGT 2022);
  - parallax occlusion mapping up close (Tatarchuk, I3D 2006).
- **Weathering in the shader:**
  - wetness that darkens the surface and sharpens its highlights, with puddles in rain;
  - snow and ice that settle on upward-facing surfaces;
  - moss on shaded rock;
  - salt crust at the waterline.
- **Decals** for scorch marks, shot holes and damage.
- **Plants:**
  - instanced on the GPU, with layered wind motion (Sousa, "Vegetation Procedural Animation and Shading in Crysis", GPU Gems 3, 2007; Wohllaib, "Procedural Grass in Ghost of Tsushima", GDC 2021);
  - leaves that let light through;
  - octahedral impostors in the distance (Brucks, "Realistic Foliage Imposter and Forest Rendering in UE4", GDC 2018).

**Effects**
- **GPU particles simulated in compute:**
  - soft and lit;
  - six-way lightmapped smoke;
  - flipbook explosions;
  - ribbon trails for wakes and shots;
  - sparks that hit the sea.
- **Heat haze** around fire and gunfire.
- **Destruction:** hulls and masts break into generated debris that floats, and sails tear.
- **Cloth and rope:** sails and rigging simulated with position-based dynamics (Müller et al., 2007; Macklin, Müller and Chentanez, XPBD, 2016) and filled by the wind.

**Post-processing**
- **Auto-exposure** from a luminance histogram, within art-directed limits.
- **Physically based bloom** from a downsample and upsample chain, with no threshold (Jimenez, "Next Generation Post Processing in Call of Duty: Advanced Warfare", SIGGRAPH 2014).
- **Tone mapping and grade:** AgX tone mapping, and a colour-grading lookup table for each hour and each kind of weather.
- **Anti-aliasing:** temporal anti-aliasing with upscaling (Karis, "High Quality Temporal Supersampling", SIGGRAPH 2014).
- **Lens and camera:**
  - per-object motion blur;
  - depth of field in the lobby and ceremonies;
  - lens flare and lens dirt;
  - film grain.

**Interface**
- **Parchment as a real material,** rendered on the GPU:
  - fibre normals and deckled edges;
  - ink that bleeds and pools by Kubelka–Munk pigment mixing (Curtis et al., "Computer-Generated Watercolor", SIGGRAPH 1997);
  - wax seals with a soft sheen.
- **3D icons** rendered from the game's own models and materials.

## Feel

Feel is game feel in Swink's sense (*Game Feel*, 2008): control in real time, a simulated space, and polish. Its working vocabulary comes from Jonasson and Purho's "Juice It or Lose It" (2012) and Nijman's "The Art of Screenshake": anticipation, hit-stop, screen shake, recoil, squash and stretch, impact frames, and permanence (debris and scorch marks that stay).

Every mechanic should feel physical:
- you see and hear it coming;
- it lands with a hit-stop, a flash and a clear hit marker;
- the camera kicks, shakes or zooms in proportion to the moment;
- splinters, spray, smoke or sparks fly;
- its sound is layered, such as a crack, a boom and a tail;
- the numbers, bars and markers react;
- the phone or iPad responds with a haptic.

Controls answer on the next frame. A ship's weight comes from its motion and the camera, never from input lag. Everything reads at a glance on a phone.

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
