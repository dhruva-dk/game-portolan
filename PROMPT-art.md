# Portolan: the battle royale in the look of `art/target/race.png`

This brief stands alone. It changes how the existing battle royale is drawn and nothing else: no rule of the match,
no bot, no screen, no sound. `PROMPT.md` describes a larger plan (a management game); ignore it for this work.

`CLAUDE.md` is the owner's and comes first. Where this brief and the code disagree about what exists today, the code
is right: say so and stop.

## 1. The target

Open `art/target/race.png` and keep it open. It is a generated painting, not a screenshot, so copy what it does and
not its every pixel.

**What it does, and we will do:**

- **Two tones a surface.** Each thing has one lit colour and one shadow colour, with a crisp edge between them. The
  rocks, the hulls and the palm trunks all show it.
- **Chosen shadows.** A shadow is a second colour, warm and saturated (terracotta rock goes to plum, sand to burnt
  orange, canvas to a warm tan). It is never the lit colour made grey or black.
- **No surface texture.** There is no wood grain, no sand grain, no rock photo. Detail is shape and a few drawn
  lines: planks, window frames, a rail.
- **A sea-chart palette:** vermilion, ochre, verdigris, ultramarine, gold and parchment cream, against a violet
  storm.
- **Clear shallows.** Turquoise water with the bed and its stones seen through it, deepening quickly to
  ultramarine.
- **Foam as flat white shapes:** a thick band where water meets shore, and a bold scalloped wake.
- **Ships read by their sails.** Each enemy is one strong colour, hull and canvas alike. The player's is cream
  canvas with a vermilion cross over a vermilion and timber hull.
- **The storm is a violet wall** with lightning in it, and the fair-weather clouds are cream with rose undersides.
- **Territory is a thin bright line** in the owner's colour with only a faint tint inside.
- **Loot is the gilded gun itself** under a thin beam of light.

**What it does, and we will not do in this work:**

- **Mesas and sea stacks.** Island shapes come from `src/world/`, which the match's rules read. They stay as they
  are.
- **The fish-eye horizon.** The camera stays as it is.
- **Soft bounced light** (the warm glow under the palms, the gradient across a sail). That is a painter's light, not
  one a game computes each frame. We light directly: sun or shadow.

## 2. What must not change

- **The match.** Nothing under `src/world/`, `src/sim/` or `src/play/` changes except `src/play/colours.ts`
  (section 5, step 9). `node tools/matches.ts 3` gives the same results before and after.
- **The shapes.** The galleon's geometry and cloth sails (`src/ship/`: `hull.ts`, `rig.ts`, `sails.ts`, `cloth.ts`,
  `build.ts`, `fleet.ts`, `kit.ts`), the islands' ground, rocks' shapes and trees' shapes, the waves.
- **The pipeline.** `src/frame.ts` keeps its passes and their order. Change it only to pass a system something new
  or to remove what nothing uses.
- **The UI and the sound.**
- **The size it is drawn at** (`SCALE` in `frame.ts`) and the layout page.

## 3. Rules

These are enforced by `tests/architecture.test.ts`; read it before starting.

- **No three.js hacks:** no `onBeforeCompile` or render hooks, no `.prototype` patching, no private (`_x`) or
  `.backend` access, no deep `three/src` imports, no cast through `unknown`, no `any`, no `@ts-ignore`. Materials
  are TSL node materials, as they are now. If three cannot do something cleanly, stop and bring the choice to the
  owner.
- **Passes, the renderer and the camera live in `frame.ts` only.**
- **450 lines a file.** No exported mutable bindings. Debug switches only in `debug.ts`.
- **No words of temporary work** in `src`: no TODO, placeholder, workaround, "for now".
- **Replace; do not add a second path.** There is no switch between the old look and the new, no quality setting
  and no fallback. The old look stays in git's history.
- **Leave nothing unused.** When the last reader of a function, file or texture is gone, delete it in the same
  commit, with its row in the architecture test.
- **No new dependency.**
- **No gate is weakened to land work.**
- **A change of design is discussed with the owner before it is started.** This brief is the design; anything it
  does not cover is asked.

## 4. How the frame is lit today

Read these before writing anything:

- **`src/sky/light.ts`**, `createLighting(sky, below, visible)`, is the one function every solid surface is lit by.
  It returns `light(p, n)`: radiance per unit albedo at a point facing a normal. That is the sun (through the air,
  the clouds' shadow, the island's shadow map and the water above the point) times `n · l`, plus the sky's ambient.
  It also has `light.glossy` (a GGX highlight and the sky's reflection) and `light.rim`.
- **Every material multiplies an albedo by `light(p, n)`.** The albedo comes from photo textures on the hull, deck,
  sand, rock and bark.
- **`src/textures.ts`** loads `public/tex`. Its readers are `ship/wood.ts` (planks, deck, their normal and
  roughness maps), `land/sand.ts` (sand, its normal map, leaf litter), `land/rocks.ts` (rock and its normal map),
  `land/palms.ts` (bark) and `water/foam.ts` (a foam pattern).
- **`light.glossy`** is used by `ship/wood.ts`, `ship/gun.ts` and `loot/loot.ts`. **`light.rim`** by `ship/wood.ts`.
- **The water** (`src/water/optics.ts`) reflects the sky itself (`sky.reflect`); it is not lit through `light.ts`.
- **`src/post/grade.ts`** applies exposure, AgX and a colourist's look baked into a table, keyed on the sun's
  height, with a second table for inside the storm. `post/bloom.ts`, `shafts.ts` and `film.ts` follow.
- **The sun's height differs from match to match,** and the storm darkens the scene. Both must still show in the
  new look.

## 5. The work, in order

One step a commit or a few. After each: the gates of section 6, and a set of hero captures.

### Step 1. The palette

Add `src/palette.ts`: every colour of the world, named once, in linear RGB, importing nothing. Add its row to
`LAYERS` in the architecture test so the render folders and `play/colours.ts` may import it. From here on no render
file writes a colour of its own.

*Starting values* (sRGB hex, read by eye from the target; convert to linear in the file). Each solid has a lit and a
shadow colour. The owner approves or changes them from the captures.

| Name | Lit | Shadow |
|---|---|---|
| Sand | `#F2B632` | `#C9772A` |
| Rock | `#B8553A` | `#74304A` |
| Palm leaf | `#4DA63A` | `#1F6148` |
| Palm trunk | `#8A5630` | `#55303A` |
| Shrub | `#6FAE3C` | `#2C6A4A` |
| Timber (hull, spars) | `#9A5A2C` | `#5A2F2E` |
| Deck | `#D9A86A` | `#9A6548` |
| Tar (wales, iron) | `#3A2A2E` | `#221827` |
| Canvas | `#F3E6C8` | `#C9A98A` |
| Gilding | `#F5C542` | `#B8792A` |
| Seabed sand | `#E8D08A` | `#B89A6A` |
| Seabed stone | `#8FA08A` | `#55707A` |

| Name | Colour |
|---|---|
| Sea, shallow | `#2FC2A8` |
| Sea, middle | `#1E86B8` |
| Sea, deep | `#1F4FA8` |
| Foam | `#FFF9EC` |
| Storm, lit / shadow | `#7A4FB8` / `#3D2670` |
| Lightning | `#D9C2FF` |
| Cloud, lit / underside | `#FFF1D6` / `#E8A58C` |
| Vermilion | `#D2332A` |
| Ochre | `#E8A21C` |
| Verdigris | `#1F8F5A` |
| Ultramarine | `#2447B8` |
| Murrey | `#8A2A6A` |
| Charcoal | `#2E2A33` |

### Step 2. The toon light

In `src/sky/light.ts`, add `light.toon(p, n, lit, shadow)`, returning radiance.

- **The edge.** `band = smoothstep(−w, w, n · l − TURN)`, with the edge about a pixel or two wide on a near ship.
  *Starting values:* `TURN = 0.1`, `w = 0.04`.
- **Cast shadow is part of the same edge.** Multiply `band` by the island's shadow (`visible`) and the clouds'
  shadow, each sharpened by its own `smoothstep`, so a surface in cast shadow shows its shadow colour exactly as one
  turned from the sun does.
- **The colour** is `mix(shadow, lit, band)`.
- **The level.** Multiply by one brightness for the place and hour: what the present `light` gives a white surface
  facing straight up there, without the island's and clouds' shadows. That keeps exposure right at every sun height
  and lets the storm darken the scene, while shadows keep their chosen colour instead of the sky's blue. Under
  water, the present `below` terms still apply.
- **Keep the sun's own colour out of the lit tone at midday;** let a low sun warm it. One named number sets how
  much of the sun's tint is kept.
- A leaf or a sail lit from behind uses the same function with the normal turned, as `leafLight` does now.

Then move every solid surface from `albedo × light(p, n)` to `light.toon`, in steps 3 to 5. When nothing calls the
old `light(p, n)`, `glossy` or `rim` any more, delete each with what only it used (`envBRDF`, and
`sky/reflection.ts` only if the water does not need it: it does today).

### Step 3. The ship

- **`ship/wood.ts`** is rewritten, same job and same signature. No texture reads, no normal map, no roughness, no
  varnish, no gloss. Each `KIND` gets a lit and shadow pair from the palette: timber for the hull and spars, deck,
  tar for the wales and iron, gilding for the mouldings. Painted strakes take the ship's `paint` as their lit colour
  and a darker, redder mix of it as their shadow, by one named rule.
- **Plank lines** are drawn from the hull's own `uv`: thin dark lines a strake apart, a pixel wide and fading out
  once too fine to draw, exactly as the sail's seams are drawn in `ship/materials.ts` (`line`).
- **Wet hull:** a flat darker band just above the waterline, with a hard edge.
- **Gilding and the guns** (`ship/gun.ts`): two tones, plus one small hard highlight where the sun's reflection
  would fall (a threshold on `n · h`), in cream. This replaces `light.glossy` there.
- **Cloth** (`ship/materials.ts`): canvas lit by `light.toon`. Keep the seams, the boltrope edge, the cross, band
  and stripes. Keep the glow of a sail with the sun behind it, as a flat third tone: the dye, brighter and more
  saturated, where the far side is lit. Drop the soft hollow shading inside the bag, or make it the shadow tone.
- **Ropes:** the tar colour, toon lit. Their widening and opacity stay.

### Step 4. The land

- **`land/sand.ts`:** the sand pair, with a second, paler band near the waterline and a drier one higher up, each a
  flat colour with a hard edge by height. No texture reads; the litter under the trees becomes a darker flat patch
  or goes.
- **`land/rocks.ts`:** the rock pair. Flat facets: take the normal from the surface's own derivatives so each face
  is one tone. No normal map.
- **`land/palms.ts`, `land/shrubs.ts`:** trunk and leaf pairs; leaves keep their light from behind as the lit tone.
- **`land/seabed.ts`, `land/strewn.ts`:** the seabed pairs; caustics stay.
- **`land/shadow.ts`** stays. Its result now cuts a hard edge (step 2).

### Step 5. Foam, and the end of the textures

- **`water/foam.ts`:** the foam pattern comes from the shore distance and a procedural shape (scallops that move
  with the swell), not from `foam.png`. Foam is the flat foam colour, fully opaque inside its shape, with a hard
  edge. A thick band at every shore, a thinner one round each hull.
- Then delete `src/textures.ts`, `public/tex`, and `textures.ts` from the architecture test (it is named in three
  places there).

### Step 6. The water

- **`water/optics.ts`:** the water's own colour runs shallow to middle to deep from the palette, by depth, reaching
  deep within a few metres of depth more than today so the turquoise hugs the shores. The bed stays visible through
  the shallows. The sky's reflection stays but is weaker and takes fewer, larger shapes.
- **`water/glitter.ts`:** fewer, larger, flatter glints; or remove it if the captures read better without.
- **`water/wake.ts`:** the wake is the foam colour in bold scalloped lobes with hard edges, widest at the stern.
  Its geometry and how it follows the ship stay.
- **`water/waves.ts`** stays: the same swell, so the ships ride as they do.
- **`gunfire/gunfire.ts`:** smoke as flat cream puffs with a rose shadow tone; splashes in the foam colour.

### Step 7. Territory

- **`water/claims.ts`, `claimed.ts`, `trails.ts`:** the border is a thin bright line in the owner's colour, steady
  in width on screen. The fill inside is that colour at a faint, even tint. The trail a ship is drawing is the same
  line, dashed.

### Step 8. Sky, storm, grade

- **Clouds** (`sky/clouds.ts`): colour only. Cream where lit, rose beneath.
- **Storm** (`sky/storm.ts`, `storm-field.ts`, `storm-bolt.ts`): colour only. The storm pair, lightning in its own
  colour.
- **`post/grade.ts`:** new looks for the palette. Contrast and saturation near 1, since the colours are now chosen
  and no longer need pushing; no split toning that would tint the chosen shadows; a small vignette. The storm's
  look still cools and dims.
- **`post/bloom.ts`:** only the loot's beam, lightning, muzzle flashes and the sun's glints bloom. Flat colours
  must stay flat.
- **`post/film.ts`:** remove the grain, and the file with it if nothing else is in it.
- **`post/shafts.ts`:** keep if it reads well over flat colour in the captures; otherwise ask the owner.

### Step 9. The ships' colours

- **`play/colours.ts`:** the player's ship is canvas sails with a vermilion cross and vermilion paint, pattern
  `plain`. The others' paints and sails come from the palette: each ship one strong colour, hull and canvas of the
  same family (ochre, verdigris, ultramarine, murrey, charcoal and so on). None is a blue or green near the sea's.
  No other ship is vermilion. `seaColourOf` follows.
- **`loot/loot.ts`:** the floating gun in gilding, two tones and the hard highlight; the beam thin and gold.

## 6. Checking the work

- **Gates, every step:** `npm test`, `npm run build`, `npm run budget` (at most 100 draws, 900k triangles, 20
  passes), `npm run hitch` (at most one frame over 50 ms and four over 33 ms). Headless Chrome only, through
  `tools/`. Leave no process running. One action per shell call.
- **Hero captures, every step:** `node tools/hero.ts captures/art-<step>`. Look at the sheet beside the target and
  write down, in the commit or to the owner, what still differs and why.
- **Check each of these in the captures:** a low sun and a high one; inside the storm; a ship in an island's shadow;
  a crowd of ships far off (the two tones must not flicker or dissolve into noise at distance); the shore's foam
  band from close and far; a sail with the sun behind it.
- **Do not build a numeric image-difference gate.** The owner judges the look.
- **Performance.** The target is the iPad Air M1 at 30 to 40 frames a second. This work should make a frame
  cheaper (eleven texture files no longer read, no GGX), never dearer. Only the owner can measure the device: never claim a
  device result from the Mac.
- **Show the owner** the captures after step 3 (ship and light settled) before going on, and again at the end.

## 7. Stop and ask when

- A step cannot be done without breaking a rule of section 3.
- A capture looks worse than the present game in a way the brief did not foresee.
- Something reads worse in play: an enemy lost against the sea, a shot hard to follow, the storm's edge unclear.
  Reading the game comes before matching the picture.
- A colour in the table is plainly wrong on screen. Propose its replacement with a capture.
