# Ports: where each old feature is best

Source map for porting old Portolan features back onto the clean core. All line counts and commits were checked with `git`, read-only.

## Orientation

- **Last good old game:** `ae981b6` (11-11 01:17), checked out at `/Users/dk/Developer/game-portolan-0117`. It is an ancestor of main.
- **Last old state on main:** `1fc9a32` (11-11 11:03, "BROKEN: final state of the old codebase before the reset"). Use `ae981b6` instead.
- **Eras on main:** v1 is `a3536d0`/`5b775af` (10-17), also the tip of branch `legacy-territory`. v2 is the "WP" rewrite (10-24 to 10-26). v3 is the compact battle royale (from 11-01, `2c10a8a`).
- **Divergence:** `simplify-renderer` split from `3672591` (11-10 22:45). Its 11-10 23:01 to 23:24 commits are not in 0117.
- **Main's rules, which constrain ports:** per `CLAUDE.md` and `tests/architecture.test.ts` (`e412f9e`), main has a pure world layer, a 450-line file cap, passes only in `frame.ts`, and WebGPU only. Almost every old file listed below exceeds 450 lines or breaks the layering, so "verbatim" still means splitting files.
- **Paths:** paths below are relative to the worktree named in each section.

## 1. Motion and sailing with a touch stick

**Best source:** `3558760` (11-11 00:35) through `ae981b6` (01:17), worktree 0117. This is the only motion work in the 20:00 to 02:00 window.

Commits in or near the window:
- `3558760` adds `src/sea/*`; `index.html` now opens on it.
- `46753d1` and `8c797f5` rework the wake; `f9e3f6e` hugs the bow wave to the hull. All are in `sea/ocean.ts`.
- `3672591` (22:45) moves to three r187.
- The full game's controls and sailing are untouched since 11-08 and 11-06.

**The 1 am candidate is the sea lab, not the full game.** The page opened on `src/sea`, a standalone sphere with its own helm. The full game's stick and sailing physics are a second candidate. The owner's "1 am" most likely means the sea lab. Confirm by running both.

| Part | File | Lines | Notes |
|---|---|---|---|
| Stick, keys, orbit camera | `src/sea/main.ts` | 413 | Stick radius `STICK = 56`, left 45% of the screen. Up gives throttle, sideways gives rudder. Drag orbits (yaw 0.006, pitch 0.005), pinch zooms, wheel zooms. Camera code is in `placeCamera`. |
| Ship physics | `src/sea/ship.ts` | 80 | `TOP=14 m/s, ACCEL=2.2, DRAG=0.35, TURN=0.42`. Rudder bite is `min(1, 0.25+speed/6)`. Turn rate is smoothed at 2.5 per second. |
| Sphere sailing | `src/sea/world.ts` | 160 | `R=1500`. `sail()`, `turn()` and `eastAt()` move the ship along great circles. |

The sea lab's `ship.ts` imports `render/actors/caravel.ts` (`Kit`, `ShipModel`), `common.ts` and `cosmetics.ts`. The ship's roll samples `ocean.heightAt`.

**Full game, second candidate:**
- `src/app/controls.ts` (283): floating stick (`STICK_RADIUS=62`, left 42% or right 58% for left-handed), look drag, keys. It has no imports. Last changed `7349964` (11-08).
- `src/sim/input.ts` (166): `ShipInput` with `steer` and `throttle`. Pure.
- `src/sim/sailing.ts` (369): point-of-sail, tacking, irons, drag. Last changed `11818b3`, with tacking from `8b98ebc` (11-06). It imports `tables.ts` (`SHIP`, `ABOUT`, `WIND`), `wind`, `parts`, `harm`, `sphere`, `state` and `world`.
- `src/render/camera.ts` (247): chase camera with the land-clearance rule from `cfccd68`.
- `src/juice/camera.ts` (230): shake and kicks.

**Pure vs rendering:**
- Pure: `sea/world.ts` `sail`/`turn`/`eastAt` (imports three only for `Vector3`), the physics in `sea/ship.ts`, `sim/input.ts`, `sim/sailing.ts`, and `controls.ts`.
- Rendering: `sea/main.ts` camera code and `render/camera.ts`.

**Verdict:** port tuning and behaviour, rewrite code. The sea lab's constants are tiny and easy to lift. The sim version is coupled to the whole 0117 sim state.

## 2. Territory

**Best source:** v1 `5b775af`, which is also branch `legacy-territory`. Two files matter.

- **Sim, `src/sim.ts` (1016):** `claim()` is at about line 771 and trail handling at 726 to 870. Leaving home opens a trail; coming home closes the loop and floods the enclosed regions. A cut trail sinks the owner. Cells live on a 512-per-face cube grid (`GRID`, `HOME_RADIUS=10`).
  - It is a monolith, not a standalone territory module. Pure TypeScript with deterministic `dsin`/`dcos`.
  - Tests: `tests/territory.test.ts` (149 lines).
- **Render, `src/territory.ts` (1028):** a CPU bake of Gaussian-smoothed owner shares, read in the water shader as a quadratic B-spline 0.5 contour.
  - **Thin line:** `terrLine(…, 0.07, …)`, with an extra halo only at night.
  - **Subtle fill:** the water colour shifts a third toward the owner's hue (`tint.a * 0.3` in `ocean.ts` ~line 781, brightness-preserving), plus `tint.a * 0.035` emission. Reflections and glitter stay the sea's.
  - **Trails:** glowing ribbons, with a flood crest line when a loop closes.
  - **Coupling:** GLSL, `ocean.ts` swell, `sky.ts` fog, `post.ts`, `ctx`. WebGL, so it must be rewritten for TSL.

**0117 later version:**
- `src/sim/territory.ts` (525) adds the cut-trail hull cost, a trail cap (`INK.trail=260`), rent, landmark perks and block-wise flood. It imports `harm`, `nav`, `perks`, `state`, `tables` and `world`.
- `src/render/ocean/territory.ts` (390) plus `inkField.ts` (718) are the TSL port of v1's B-spline contour (line width 0.09).
- The fill is stronger than v1: `ocean/surface.ts` ~L431 uses 0.4 to 0.65 share plus glow. So v1's subtle fill is a tuning choice, not just a port.
- Fixed tests: `tests/territory.test.ts` and `inkField.test.ts`.

**Ambiguity:** the owner's description matches both v1 and the 0117 port. The thin line is identical in spirit. Only the fill strength differs, and v1's is subtler. v2's WP20 render (`e625635`, 10-24) is a third candidate I did not read.

**Verdict:** sim: port rules and behaviour, rewrite code. It is cleaner to lift 0117's `sim/territory.ts` rules than to untangle v1's monolith. Render: port the numbers (line width, 0.3 hue shift, 0.035 glow), then redo it in TSL, using 0117's `inkField.ts` as the structure.

## 3. Loot

- **Crates introduced:** `c79ef49` (11-08 10:27), "Draw loot as an inked cask or crate under a column of hatching".
- **Last commit with highlighted items:** its parent `2a8f74e` (11-08 10:15). Loot tokens date back to `dff64a8` (11-01).
- **Files at `2a8f74e`:**
  - `src/render/actors/loot.ts` (164). Each item is a token: a gun on its mount, a shield crystal (octahedron), a repair cask, or a coin. Each turns, bobs and glows in rarity colour over a water halo, under a light column that grows with rarity.
  - `src/render/actors/tsl/loot.ts` (43). Token and beam node materials.
  - `src/sim/items.ts` (295). Pure.
  - `src/audio/sounds/items.ts` (246).
- **Today at `ae981b6`:** `loot.ts` is 152 lines and `tsl/loot.ts` 106. The HUD imports `LOOT_INKS` from it.
- **Coupling:** `loot.ts` depends on `common.ts`, `effects.ts` (`RARITY_GLOW`), `particles.ts` (`SPRITE`), `view.ts` and the actors' gun shapes.

**Verdict:** port tuning and behaviour, rewrite code (token geometry plus beam). The sim is pure and moves verbatim.

## 4. The gull

- **Best and latest (v3):** 0117, `src/render/actors/gull.ts` (235). One instanced flock with wings hinged in the shader, using `tsl/fauna.ts` (60), `mesher.ts` and `effects.ts`. It was last touched in `56a7672` and `faaba41` (11-09, "hail from a seal, drop its parcel").
- **Sim:** `src/sim/economy.ts` (98), pure. Delivery flight uses `DELIVERY` in `tables.ts`.
- **Other touchpoints:** the `hail` intent in `controls.ts` and `input.ts`, the HUD gull seal, and `chart/galleon.ts` references.
- **v1:** no gull.
- **v2 is a different concept:** a companion gull per ship with abilities (Talons, Wings and so on).
  - Sim: `src/sim/gull.ts` (273, `4266774`).
  - Render: `src/render/gull.ts` (536) plus `fauna.ts` (450, `ba6e572`).
  - It is drawn as an ink-and-wash herring gull.
  - The owner didn't say which they mean. v3 is the latest.

**Verdict:** the render is "port tuning/behaviour, rewrite code". The sim is "port logic nearly verbatim", but only if v3's delivery model is wanted.

## 5. Bots (AI captains)

**Best source:** 0117, `src/sim/captains/*`, 2246 lines. Last meaningful change `bab6612` (11-10).

| File | Lines |
|---|---|
| `brain.ts` | 1526 |
| `director.ts` | 133 |
| `influence.ts` | 139 |
| `utility.ts` | 114 |
| `hearing.ts` | 110 |
| `temperaments.ts` | 67 |
| `exposure.ts` | 66 |
| `learning.ts` | 50 |
| `tree.ts` | 41 |

- **Structure:** utility-scored choices run as a behaviour tree. The influence map weighs the sea. Hearing is per gun. A pacing director spaces fights. Temperaments vary per captain.
- **Coupling is very heavy.** `brain.ts` imports about 25 sim modules: `sailing`, `combat`, `items`, `nav`, `territory`, `storm`, `weather`, `wind`, `opening`, `visibility`, `economy`, `perks`, `seaway`, `world`, `tables` and `state`.
- **Pure:** nothing imports three. It reads `MatchState` and `Ship` directly and emits `ShipInput`.
- **v1 `bots.ts` (704) is a simpler alternative:** it does bite-sized territory loops.

**Verdict:** port tuning/behaviour, rewrite code. The brain cannot move until the sphere, state, sailing, combat and territory exist. Only `utility.ts`, `tree.ts`, `temperaments.ts` and `hearing.ts` are near-standalone. Port those first.

## 6. Weapons and healing

All pure sim, in 0117 `src/sim/`:
- `combat.ts` (392): eight weapons, shot flight with drop, magazines, and the broadside.
- `harm.ts` (96): shield then hull.
- `parts.ts` (218): canvas, mast, rudder and waterline damage and mending.
- `items.ts` (299): hotbar, loot and consumables. Repair kit and full repair heal here.
- `abilities.ts` (42) and `powers.ts` (145): actives, including Repair, plus perks.
- `perks.ts` (30), `seaway.ts` (50) and `tables.ts` (479, the `WEAPONS`, `ITEM` and `PARTS` data).

- **Pure vs render:** the sim imports no three.js; the "three" matches in the sim are only prose.
- **Coupling:** a closed cluster (`harm`, `state`, `sphere`, `math`, `perks`, `tables`, `weather`, `world`). `parts.ts` reaches into `territory.ts`, `wind.ts` and `weather.ts`.
- **Render counterparts (`src/render/actors/`):**
  - `projectiles.ts` (245)
  - `effects.ts` (385)
  - `particles.ts` (355)
  - `aura.ts` (149)
  - `debris.ts` (332)
  - `lightning.ts` (274)
  - `numbers.ts` (105)
  - gun mounts inside `caravel.ts` (1203)
- **Audio:** `src/audio/sounds/weapons.ts` (465), `combat.ts` (258) and `items.ts` (246), over `audio/kit.ts`.

**Verdict:** sim: port logic nearly verbatim, with files split under 450 lines. Render and audio: port tuning/behaviour, rewrite code.

## 7. Galleon and cloth

**Galleon**
- **Source:** branch `galleon`, worktree `/Users/dk/Developer/game-portolan-galleon`, `0b397b2` (11-11 08:41, after the 01:17 snapshot). It also contains the land prototype commits.
- **Files (`src/render/galleon/`):** `hull.ts` 558, `rig.ts` 387, `mesh.ts` 221, `materials.ts` 101, `lines.ts` 97, `index.ts` 39. The viewer is `dev/galleon.ts` (146). `tools/capture/galleon.ts` (48) shoots the reference views.
- **How the mesh is generated:** per-material accumulators (`Acc`) fed by lofted sheets, tubes, lathes, boxes and ropes, all in code. Rope vertices carry a radius that the material widens at distance. The result is four masts with square courses and topsails, a lateen mizzen and a carved stern.
- **Triangle count:** not stated in any code or commit text. `buildGalleon()` returns `triangles` per material, and the viewer logs it. Run `dev/galleon.html` for the number.
- **Imports:** only `three/webgpu`, plus the viewer's `three/addons`. No game state.
- **Sails:** static lofted sheets (`sheet()` in `mesh.ts`), no cloth.
- **Verdict:** port logic nearly verbatim (geometry generators). The materials need a check against main's lighting.

**Shipyard branch** (`6af3a71`, 07:46)
- It refits the caravel only: `caravel.ts` +260 lines, `tsl/caravel.ts` and `dev/shipyard.ts`. It has no cloth changes.

**Cloth: best simulation**
- **Source:** 0117 `src/render/actors/cloth.ts` (508). It is GPU XPBD in small steps, with long-range attachments, sheets and vangs as rope chains, and shot holes. History: `912dee4`, `ab90365` (11-06), `3672591` (r187 touch-up).
- **Coupling:** `gpu/work.ts` (`everyFrame`), `gpu/preparation.ts`, `gpu/uniforms.ts` (`P`), `tsl/kit.ts`, and `caravel.ts`'s sail and rigging grids (`ClothGrid`, `ClothRope`).
- **Alternative:** `1d76803` on `simplify-renderer` deletes the cloth for a vertex-shader billow. Use it if the performance budget demands the cheaper option.
- **Verdict:** port tuning/behaviour, rewrite code. It is tied to the caravel grid layout, so redo it against the galleon sails.

## 8. UI inventory (0117, last night)

Everything is drawn on one canvas chart layer in a 16th-century map style. The kit is `src/chart/*` (about 6k lines). It includes the quill pen (`pen.ts`), parchment (`paper.ts`), ink (`inks.ts`), woodcut icons, wax seals, the rose, cartouche, galleon mark, numerals, press-feedback and motion. The screens are in `src/screens/*`, with models in `src/ui/model.ts`. Flow is in `src/app/flow.ts`.

- `title.ts` (382): blank sheet, rhumb web and a 32-point rose ink in; a needle swings while loading; press anywhere to go on.
- `lobby.ts` (642): live ship at anchor and the view of six instruments. These are the career plate (level ring plus rank seal), a settings wheel, four menu tabs, and PLAY.
- `folio.ts` (590): parchment sheet for abilities, locker, rank, rivals and settings. Opens from the right.
- `cards.ts` (158): the woodcut card. Rarity ruled in ink, locked ones faint, worn ones sealed.
- `gale.ts` (287): the drop. Gale seconds, a minimap with course, the fleet and the Storm's first circle, and DIVE.
- `hud.ts` (872): the match HUD.
  - Vitals: shield and hull bars with a parts display.
  - Sails: arc lever.
  - Gust: charges.
  - Ability: button with cooldown.
  - Storm: clock, with an outside-the-circle warning.
  - Ships afloat: count.
  - Hotbar: five slots, with a pickup prompt.
  - Aim: reticle, heavy-gun wind-up bearing, and deck steadiness.
  - Consumable: use progress.
  - Region: sign.
  - Tide: reading.
  - Gull: hail seal.
  - Spectate mode after sinking.
- `minimap.ts` (184) and `land.ts` (122): the minimap disc with land, Storm and ships, plus the floating stick. `land.ts` samples terrain.
- `fullmap.ts` (420): full-screen map over the live planet, with standings, emblems and a pennant marker.
- `planet.ts` (336): planet chart sheet with coasts inked through a window.
- `result.ts` (342): result sheet with place in a laurel, three woodcut stats, the career plate filling, and held-water chart.
- `wash.ts` (71): watercolour of held water.
- `scraps.ts` (106) and `app/tips.ts`: wordless teaching scraps pinned once each.
- `instruments.ts` (365): shared HUD family of buttons, bars and discs.
- `app/moments.ts` (527): moments, banners and tallies. I did not read it for UI specifics.
- Not covered: I did not check whether a victory screen exists beyond the `victory` name in `flow.ts`.

**Verdict:** the chart kit is "port tuning/behaviour, rewrite code"; the screens are "redo", for the design-sheet review.

## 9. Day and night

Checked read-only in the worktrees named below. No commit message anywhere records night being removed or abandoned as unreadable. The only note is `b7eb01f` (11-08): the fight fixture is held at 18:00 because at 19:00 "dark" the sun's shadows and light were not drawn.

**Iterations**

| Iteration | World | Sun and clock | Night |
|---|---|---|---|
| Tidefall, `archive/rebuild-tidefall` (`aafe033`, 11-10; 0117 repo) | Flat 2000 m square (`world.ts` `HALF=1000`) | No clock. `gfx/sky.ts` `WEATHERS`: five fixed moods (Misty Dawn, Clear Morning, Golden Hour, Rain Squall, Starlit Night), one per match from `pickWeather(seed)` in `main.ts`; `?w=` forces one. Each sets sun elevation and azimuth, fog, clouds and rain, and never changes during a match. | "Starlit Night" mood only: `night:1`, `stars:1`, fireflies, a blue moon-coloured key light. |
| v1, `5b775af` (10-17; branch `legacy-territory`) | Globe, `R=200` units (1 unit about 7 m) | Client only, not in the sim. `sky.ts` `CYCLE_SECONDS=480`, a `frame.cycle` phase mapped to an hour by a monotone cubic through the `PACE` table (a scripted pacing: golden hour, sunset and storm get the most seconds). Opens at `OPENING_HOUR`; key `T` fast-forwards 30x. Sun on an arc around a celestial pole tilted by `SUN_DEC`, moon `MOON_LAG` behind. One sun for the planet, so it is day on one side and night on the other, and the local sky follows the focus ship's up vector. | Moon at `MOON_E=0.11` of the sun, stars, planet shadow and a night-side ambient. `env.night` drives lanterns, beacons, bioluminescent wake sparks, chart and audio mood (`audio.ts` hush). Cloud cover, haze and aerosol are also keyed to the hour (`COVER`, `HAZE`, `AEROSOL`). |
| v2 WP6, `afeca4a` (10-24) | Globe | First sim-side time of day (`DAY`, `sunDir`). The commit message is empty; the code is what survives in 0117. | As v3. |
| v3 / 0117, `ae981b6` (also `galleon`, `shipyard`, `simplify-renderer`) | Globe, `R=554` (`src/sim/sphere.ts`) | **In the sim, per match.** `src/sim/environment.ts`: `hourOf = state.hour + tick*TICK*DAY.rate`; `sunDir = fromLatLon(state.tilt, (12 - hour)/24 * 2pi)`. `DAY.rate = 4/630` h/s ("about 4 hours over a match"), so the sun turns 0.095 deg/s and a full day would take about 63 min. The start hour is random (`setup.ts:93`, seeded, 0 to 24) and the tilt is random within +-0.45 rad (`setup.ts:94`), so a match may open in daylight, dusk or dark and a pole may see midnight sun or polar night. One sun for the whole globe: `sunHeight(p) = dot(p, sun)`, so time of day differs by position (`localHour` is the hour at longitude 0 plus 1 h per 15 deg east, UI only). The sun is fixed in the planet frame and the planet turns under it, so it moves the same everywhere; a ship does not outrun it. The lobby takes the hour from the device clock (`app.ts:150`). | `render/sun.ts`: moon nearly opposite the sun, "a nearly full moon that lights the night side"; `render/atmosphere/light.ts`: sun and moon each lit only while above something in view, plus "the faint light left when neither sun nor moon is up: the stars and the glow of the high air". `P.night` drives lamps (`LAMP = mix(0.4, 0.005, night)`), audio, and the grade's looks (moonlit night, blue hour, dawn, golden hour, noon, picked by sun height at the eye, not the clock: `2945c3c`). `6a9ac85` (11-11 01:08) Evenings: partial eye adaptation, a lengthened horizon path for red sunsets, a softened planet shadow, a brighter moon. |

**Gameplay coupling (0117 only):** `sim/visibility.ts:46`. Beyond `SIGHT.lantern=150` m at night (`sunHeight < DAY.dusk=-0.05`) a ship shows only as a lantern (`SEEN.lantern`); the `fogSight` perk cancels it. Night did not touch the Storm (the shrinking zone), the bots or territory. Nothing else reads the hour.

**Scripted:** v1's `PACE` hour table and v1's storm track (see Weather). In 0117 the day is a constant rate with a seeded start, with no event keyed to the hour. Capture fixtures (`app/moments.ts`) set the hour directly, for screenshots only.

**Galleon, shipyard, simplify, attic:** `src/sim` is identical to 0117 in galleon, shipyard and simplify (`diff -rq`), and `render/atmosphere` is identical in galleon and shipyard. In `simplify-renderer`, `1d9157c` (11-10 22:57) deletes the haze, froxel fog, aerial perspective volume, sky probe, sun cascades and light shafts; sun, moon and night are untouched. `game-portolan-attic` is not a git repository and holds no source (empty `src/`, only captures, `dist`, `ios`, `public`).

**Current game**
- `src/environment.ts` holds `timeOfDay` (hours at longitude 0, default 14) and `sunDirection`. **Nothing ever advances `timeOfDay`**: `updateEnvironment(env, _dt, eye, wind)` ignores `dt`, and `main.ts:34` sets it only from `?t=`. The sun never moves with the clock.
- **The sun direction is computed in one place, `placeSun()`, `src/environment.ts:51-55`:** `hourAngle = (timeOfDay - 12)/12 * pi`; `sunDirection = fromLatLon(DECLINATION, -hourAngle)`, with `DECLINATION = 23.44 deg` fixed (`:43`). At the default `t=14` that is lat 23.4 deg, lon -30 deg, **fixed in planet space** (the world frame, +y north). It is one vector for the whole planet, copied by `sky/sky.ts:102` and `frame.ts:106`, then rotated into the eye's frame for the sky (`toSky`, `sky.ts:103`).
- **Confirmed as the cause of the agent's night.** Seed 3's start (south of the largest island, island centre lat 8.7, lon -11.6) is about 23 deg (about 220 m) from the sub-solar point. The terminator is 90 deg out, `pi/2 * 554 = 870 m`. Sailing straight away from the sun, about 650 m remains, which is about 54 s at 12 m/s; it is dark by then (about a minute) and the circumference is 3481 m (about 290 s a lap), so the player returns to day on the far side. This is the geometry of a fixed sun on a small globe, not a bug in the sky shaders.
- Night in the current sky: the Hillaire tables (`src/sky/`) darken with no sun; a grep of `src/sky` finds no moon, stars or night term, so night is lit by the sky's afterglow only. Not run or viewed.
- `docs/north-star.md` rule 1: "One `Environment` holds time of day, sun, weather and wind." `c05b6a3` (11-11): defaults "early afternoon (t = 14, the sun 67 deg up over the largest island)".
- `docs/north-star.md` says the tables rebake only when sun or params change; `sky.update` passes the sun and `haze` to `tables.update` each frame. The cost of a moving sun is not measured.

**Options (not decided)**
1. *Keep the sun fixed* (day always, as the defaults). Cheapest; no night to light; the planet needs no moon or stars. A player can still reach the night side by sailing, unless the sun is made to follow the eye.
2. *Sun follows the player/camera* (a fixed elevation in the eye's frame, or the sun carried with the start). No day side or night side; nothing to solve for lighting at night. This is nearest to Tidefall's fixed moods. It gives up v1's and 0117's one sun for the whole globe.
3. *Advance `timeOfDay` in the Environment at a rate* (a one-line addition to `updateEnvironment`). A global clock with a seeded start hour and tilt, as in 0117 (`DAY.rate`, `setup.ts`). Needs a night look: moon and stars, which the current sky lacks. Port from 0117: `sim/environment.ts` (about 30 lines, pure) and the arithmetic of `render/sun.ts`; the moon and stars in `atmosphere/light.ts` and `sky.ts` are WebGPU/TSL and tied to 0117's `P` uniforms (redo).
4. *Advance the clock slowly* (0117's rate, 0.095 deg/s). As 3. A quarter turn, day to night, takes about 16 min, so over a match the clock matters less than where the ship sails; the 54 s above remains unless the sun is also decoupled from position (option 2).
5. *Port the visibility rule* (lantern-only past 150 m at night, `sim/visibility.ts`). Only if night exists and other captains' ships do.
Trade-off: night costs a moon and stars (art and sky work) and playability on a 6-inch screen; with 0117 there was no recorded complaint, and the exposure and grade work for it exists only in 0117.

**Decided and done (11-12): option 2, no night.** The "Current game" bullets above describe the game before this.
- `src/world/sun.ts` (pure, `tests/sun.test.ts`): the time of day is the same everywhere. Over every place the sun stands as high as the hour says (the hour's sun at lat 10 deg on the solstice), so its elevation never changes as a ship sails. Its bearing is set by the compass at the start island's centre, carried to an origin, and from there to every place along the great circle between them (parallel transport). A constant-elevation field on a sphere must have a zero (Poincare-Hopf), so it has exactly one, the origin's antipode. It is placed at the centre of the largest island at least 90 deg from the start (land; on seed 3 the 59 m island at 42.5, -167.9). Along great circles from the origin the sun turns only with the sea's own curve. Across them it turns tan(theta/2) more, and round that island 2/r rad per metre (0.8 deg/m at its apron's edge).
- It depends only on the place and the match, so all players agree. `?t=` sets the hour everywhere (default 15:00). The clock does not advance.
- Every surface is lit by the sun over itself (`sky.sun(p)`, the same rotation in TSL), and sun illuminance is one value. The island shadow map is drawn along the sun over the island's centre, so it never redraws as the eye moves. The sky and clouds use the sun over the eye, whose sky elevation is constant, so the sky-view table rebakes only as the camera's height changes the horizon's dip (under 2 a second).
- Checked: a 320 s drive at 12 m/s (more than a lap) and views over both geographic poles all show the same afternoon.
- Not done: the eye's frame (`frameAt`) is singular at the geographic poles, so the clouds' map (slid along the eye's east and south) and the cloud reprojection jump when the eye crosses one. The sun is unaffected.

## 10. Weather

**Iterations**

| Iteration | What | Driven by | Reach | Effect on play | Render |
|---|---|---|---|---|---|
| Tidefall (`aafe033`) | 5 moods incl. "Rain Squall" (rain 1, cloud 1, fog 0.0034, `sunI` 0.9) | One mood per match, `pickWeather(seed)` | Global, static | None found (rain gain in `audio.ts` only) | Dome clouds, rain streaks, fog in one shader |
| v1 (`5b775af`) | Global wind field `sim.ts wind(p,t)`: trade-wind belts (easterlies at the equator, westerlies at mid-latitudes, polar easterlies) plus a wandering vortex (`t*0.013`) and slow gusts (+-22%). One storm cell, `sky.ts` `STORM` track | Wind: a function of position and time, in the sim. Storm: a **scripted** arc table crossing the player at 15:00 and spending the night on the far side; cover, haze and aerosol are hour tables | Wind global; the storm is relative to the player (`stormCenter` from the focus up vector and a stored approach axis that follows the wind slowly) | Wind sets ship speed. The storm changes visuals and audio only (`env.storm`, `env.rain`, `env.wet`) | GLSL cloud shell with spiral arms, rain, lightning, mist (`fx.ts`: thick at dawn, thin at midday, more at night and in the storm) |
| v2 WP6 (`afeca4a`) | First weather in the sim | as v3 | | | |
| v3 / 0117 | `src/sim/weather.ts` (254): 3 to 5 systems (`WEATHER.slots=5`, `least=3`), six kinds, each one clear effect. `sim/wind.ts` (151): a seeded field of `WIND.terms` swirls turning slowly, plus gust discs, lee calm behind land, weather bending it | Seeded RNG stream `STREAM.weather` in the match state, deterministic; **not scripted**: systems form, drift at 0.15 of the local wind, live 70 to 150 s (`rise` 12 s), then re-form. The first ones start mid-life. Forming rule: 85% a region's own kinds (`REGIONS[].weather`), else fog/rain/thunder/calm; after the start, half form over the Storm's calm "where the fleet is" (`gather: 0.5`, commit `12e22f4`; the comment in `tables.ts:372` says "Settled overnight in the owner's absence; the owner may change it") | **Local**: discs of radius 70 to 130 m on the 554 m globe. `skyAt(state, p)` gives each field's depth, 1 in the core (inner 60%) to 0 at the edge; wind is global but has direction and gust variation over the map | Fog: sightline x0.35 and the ship drops off the map at depth 0.5. Rain: wind x1.4, sea rougher x1.8, swirls the wind x3. Thunder: as rain, plus lightning at the tallest mast in the open every 6 to 12 s, 1.5 s warning, 25 hull damage within 12 m. Calm: wind x0.15. Snow (lat above 50 deg only): ice slows turning to 0.5. Ash (near the Fire Archipelago only): after 4 s, 1.5 hp/s. Gusts: `GUSTS.strength` on `windAt`. Sailing reads `windAt` | `render/atmosphere/clouds.ts` raymarch of each system (Nubis-style, towers scaled to the 554 m planet), `fall.ts` rain/snow/ash/embers, `lightning.ts` leader and return strokes, froxel fog `fog.ts`, the grade's weather looks, `gale.ts` |
| galleon, shipyard | Same as 0117 (sim and atmosphere identical) | | | | |
| `simplify-renderer` | Same sim. `1d9157c`: froxel fog and aerial perspective deleted; clouds placed in the depth buffer; `4fde489`: sea from eight Gerstner waves | | | | |
| `wip/clouds-tweak` (`b875d75`, 11-11) | parked cloud-shape tweaks, "not on main" | | | | |

**Cost recorded (0117):** `39b9115` (11-05): every cloud system as the inside of a bounding sphere at full resolution cost 55 ms a frame inside a covering system; the compute pass at half resolution with 25% temporal reprojection measured "rain 72 -> 22.4 ms, thunder 21.7 ms, clear 17.0 ms (headless vsync floor 16.7)". Not measured on the iPhone in the text read. `11818b3` (11-07) cut the sixteen region events (the fog banks and storms that captains ran for), keeping the weather systems. `d0cee21` (11-05): one froxel medium for haze, weather, sea smoke and lantern halos.

**Scripted items to avoid:** v1's storm track (`STORM` in `sky.ts`) and hour tables (`COVER`, `HAZE`, `AEROSOL`); the 0117 region events (`planEvents`, removed in `11818b3`) and `app/moments.ts` capture fixtures. The 0117 weather systems are not scripted in the rule's sense (a seeded random process, no timeline), but `gather` steers them toward the players, which is a design choice the owner may count as a scripted event.

**Current game**
- `Environment`: `windSpeed` 7.6 m/s (default, `?wind=`), the same everywhere and constant; `cloudCoverage` 0.3 (`?cloud=`), global and constant; `haze` 1 (`?haze=`); none of the three changes with time or position. `windDirection` is the only varying field.
- `src/world/wind.ts`: a seeded prevailing wind (`createWind(seed)`): the direction at every point from a potential on the sphere, two calms at +-a (Poincare-Hopf), `BEND = 0.15`. It is steady, with no gusts and no time dependence. Speed is uniform.
- Consumers: waves (`water/water.ts:235` `waves.update({wind: env.windSpeed, fetch})`, `play/game.ts:42` swell), the fleet's sails (`ship/fleet.ts:96-110`), the clouds' drift (`sky/sky.ts:107-108`). Clouds are fair-weather cumulus only; there is no rain, storm, fog bank or lightning, and no local weather. The haze scales the atmosphere tables (`tables.update(s[1], env.haze)`).

**Options (not decided)**
1. *Constants only* (as now). No cost, nothing to build; every match has the same sea and sky, and `?wind=`, `?cloud=` stay debug.
2. *Slow global drift* of `windSpeed`, `cloudCoverage` and `haze` over a match from a seeded smooth noise in time (no events). Small: only `updateEnvironment`; `dt` is already passed in. Everything that reads them already follows (waves, sails, clouds, haze). Waves re-bake as the wind changes; I did not check how much the swell tables cost to re-tune at runtime.
3. *Wind field that varies with place and time* (0117's swirls and gusts, `sim/wind.ts`: pure, about 150 lines, port nearly verbatim; or Tidefall-style bands). Needs the planet's wind to become time-dependent, which `world/wind.ts` is not; the current potential-field design (two calms) would have to be kept or replaced. Gives gust-driven sailing change. Affects ship speed in `ship/fleet.ts` and, in future, in the sailing sim.
4. *Local weather systems* (0117 `sim/weather.ts`): about 250 lines of sim that is pure and portable apart from `harm.ts`, `parts.ts` and `nav.ts` couplings (hull damage, mast strikes, shore clearance), which can be dropped for fog/rain/calm only. The render (volume cloud per system, fall, lightning, froxel fog) is TSL tied to 0117's `P` uniforms and its froxel fog and temporal upscaler: redo. The cost of the old cloud pass was 17 to 22 ms with a covering system on a desktop (above); the current clouds are a different design and unmeasured with local systems.
5. *Visibility-only weather* (fog shortens sight and rain gusts the wind, no damage). Cheapest local gameplay from the old rules: `skyAt` and `windAt` in the sim. Fog needs a fog volume in the atmosphere (current `sky/` has haze only; `simplify-renderer` is the precedent for dropping the froxel fog for cost).
Trade-off: a fixed `windSpeed` keeps waves, sails and clouds consistent and cheap; each thing that varies (speed, direction, local systems) multiplies what the swell, the sails and the clouds must track, and local systems add gameplay rules the current game does not have yet.

**Decided and done (11-12): option 2, slow global drift.**
- `src/world/weather.ts` (pure, `tests/weather.test.ts`): wind speed, cloud cover and haze, each its mean plus a seeded sum of three sines with 6-20 min periods. Ranges: wind 7.6 +- 1.6 m/s, cover 0.37 +- 0.12, haze 1.6 +- 25%. There are no events and nothing depends on where players are. `?wind=`, `?cloud=` and `?haze=` pin one quantity.
- The sea's waves keep the match's mean wind (`Environment.seaWind`), because a sea takes hours to develop and the CPU swell the sim reads must stay fixed. Regenerating the spectrum costs about 80 ms of CPU on the Mac. The whitecaps, ripples, foam fade, sails, wakes and cloud drift follow the drifting wind.
- The air's tables take the haze in 1% steps, one table a frame. That is about 1.1 ms of Mac compute for three frames, at most every few seconds (2.3 ms at once before).
- Default haze 1.6 (an aerosol column of 0.13, a hazy trade-wind day). Above about 2 the whole sky greys before the horizon band grows, because the band's height and the zenith's whitening come from the same column. The north star's thick pale band therefore cannot come from `haze` alone; see the report for the optical-scale option.

## 11. Ship collisions and ramming

**Best source:** 0117, `src/sim/sailing.ts:320-369` (`collide`, `contact`), called once a tick from `match.ts:140` after every ship has sailed. Tuning in `tables.ts:23-35` (`SHIP`) and `:316` (`POWERS.ram`). Damage goes through `harm.ts:37` (`hurt`: shield first, then hull). No test in 0117 covers it.

**What 0117 did**
- **Hull:** a circle. Two ships closer than `SHIP.touch = 10` m, centre to centre, touch. With `half = 8.6` m, two bows meeting head-on overlapped by 7 m before they touched, and ships lying alongside never touched.
- **Contact:** each was pushed half the overlap apart along the line between centres. This was a single pass over the pairs `i < j` in index order, so the result depended on the list order. Nothing checked the shallows. If they were closing, each got a shove of `0.6 * closing` apart, decaying at 1.5/s (`sailing.ts:171-175`), and **both lost 30% of their speed** (`speed *= 0.7`), whatever the angle. There was no sliding, no turn and no grip.
- **Ram:** closing faster than `SHIP.ram = 7` m/s, with top speed 14.5. The damage was `dmg = (closing - 5) * 2.2`. Each ship took `dmg * (0.3 + 0.7 * other's share of the closing)`, so the one driving in took less, capped at `ramCap = 45` a collision. A ship had 100 hull behind 100 shield. It raised `EVENT.ram` (`state.ts:308`) and `CAUSE.ram` (`:25`).
- **Re-arm:** none. Ships pushed apart each tick, and a ship holding throttle could close faster than 7 m/s again after the bounce, so repeated rams were possible.
- **Ram ability** (`POWERS.ram`: +12 m/s for 1.5 s, a flat 40 damage on contact, `abilities.ts:23`) and the bots' use of it (`captains/brain.ts:1235, 1461`): out of scope, since there are no abilities or bots yet.

**What I took:** the rule's numbers, scaled to this game's top speed (12/14.5 = 0.83), so the same share of top speed does the same damage:
- threshold 7 became 5.8 m/s;
- offset 5 became 4.1;
- 2.2 per m/s became 2.65;
- the cap of 45 and the `0.3 + 0.7 * share` split are kept as they were;
- the shove decay is kept at 1.5/s, and its effective 0.2 bounce became `RAM.bounce`.

A full-speed square ram into a still ship does 20.9 to her, as 0117 did at its full speed (tested). All of these live in `RAM` in `src/sim/handling.ts`.

**What I wrote new** (`src/sim/contact.ts`, `tests/contact.test.ts`)
- **Hull:** a capsule, 26 m by 6.5 m (radius 3.25 m, keel segment ±9.75 m), not a circle.
- **Contact:** found on a chart about the midpoint of the pair. The response is one rigid-body impulse at the contact point. The two hulls have equal mass ahead and twice the mass broadside (`RAM.sway`), turn about a 7.8 m radius of gyration, part at 0.2 of the closing, and grip at 0.2 (Coulomb). So a glancing blow slides, an off-centre blow turns her, and the rammer loses her way while the struck ship is shoved sideways. This replaces 0117's flat 30% loss of speed for both.
- **Shove:** what an impulse does across her or astern is a shove (`Vessel.shove`), carried along her path through the shoal check.
- **Overlap:** removed by up to 8 Gauss-Seidel passes, split by how much each ship yields. A push that would ground a ship isn't made, and the other ship takes all of it. Any overlap left is put back to the start of the step. Pairs are taken in id order.
- **Damage:** also multiplied by where the blow lands: bow 0.5, side 1, stern 0.75. Bow means within 50° of dead ahead. So bow into side is 6.7:1, against 0117's 3.3:1.
- **Re-arm:** a pair that has rammed can't ram again until they are 3 m clear.

**What I left:**
- 0117's circle and its order-dependent single pass;
- the flat 30% loss of speed;
- the Ram ability and its 40 flat damage;
- `spar` (the bots' damage scaling, `harm.ts:20`);
- shield and hull: no health exists here yet, so a blow reports the damage each ship takes and nothing subtracts it.

**Verdict:** port the rules and numbers, rewrite the code. 0117's code is 50 lines tied to `MatchState`, `hurt` and `emit`. It is order-dependent, uses circle hulls and has no shoal check. The numbers are the part worth keeping.

## 12. Health, the gun and aim assist

**What 0117 did** (`src/sim/harm.ts`, `combat.ts`, `tables.ts`)
- **Health:** 100 hull, shield capped at 100 but put to sea at **0** (`setup.ts:68`) and filled only from loot (`USES`, caps 50 or 100). `hurt` takes the shield first and the overflow to the hull in the same blow; the storm, trail cuts and flooding skip the shield. No regeneration. Rams went through the shield.
- **Cannon:** 20 damage, 8-ball magazine at 0.42 s, 1.9 s reload, 165 m/s, a fake 7 m/s² drop, 200 m range, 0.008 rad spread. Laid on the touched point, a fixed flight time to it; balls flew great circles at a height, and took nothing of the ship's way. Five rarities, Common to Legendary, scaling damage (1 to 1.32) and reload (1 to 0.8).

**What I took:** the shield-first rule and its overflow, the 100/100 caps, the five tiers and their damage and reload tables, 20 damage, the 200 m reach, and the muzzle speed scaled by top speed (165 × 12/14.5 = 136 m/s). Balls still take nothing of the ship's way.

**What I wrote new** (`src/sim/health.ts`, `gun.ts`, `shot.ts`, `battle.ts`, `tests/battle.test.ts`)
- **Flight:** a true orbit about the centre, stepped by velocity Verlet. At 136 m/s a ball on a 554 m planet under 9.8 m/s² would go round it, so the pull is chosen to make 200 m the furthest carry: some 11 g at the sea. Carry and flight time are had in closed form (the range-angle equation and Kepler's), which the stepped flight matches to centimetres (tested). 150 m takes 1.2 s, as 0117's 200 m did.
- **One gun, one ball:** at most one gun, on the waist's plinth; none at the start. Reload 2 s, one ball at a time.
- **Aim assist:** aimed on a bearing; the ship nearest it within a cone (0.2 to 0.42 rad by rarity) and in range is laid on, led along her present course by iterating the closed-form flight time; else along the bearing at full range. Spread: a seeded draw within a cone (0.05 to 0.014 rad by rarity), from the battle's seed, the ship's id and her shot count.
- **Hits:** the hull capsule of contact.ts standing 4 m from the waterline, probed every 0.25 m along the path; land in the way stops a ball.
- **Shield at sea:** full (100), since there is no loot yet to fill it.

**What I left:** magazines, the other seven weapons, crits and the weak spot, falloff with range, parts damage, the spread from turning, the seaway and weather, bots' sparring scale, and the shield-skipping causes (supported by `harmed(…, past)` but unused).

## 13. Bots and the Storm

`src/sim/bot.ts` (the mind), `helmsman.ts` (the helm), `captain.ts` (the shared table, memory and context). `think` takes the storm now on the match's clock (`storm.ts` `Storm`: cap, next cap, closing, seconds to next, phase) as plain input in its `Sea`; without one a bot ignores it, so storm-free voyages are bit-for-bit what they were.

**Ported from 0117** (`src/sim/captains/brain.ts`; temperament margins already in `temper.ts` from `temperaments.ts`)
- **The `storm` option** (`brain.ts:191-200`), first, weight 6: score `max(ramp(edge, 0.55·margin, 0.3·margin), late && !inNext && phase < LAST)`. `late` is closing or under 25 s to the close (`decide`, `brain.ts:368`); `inNext` is more than half her margin inside the next cap (`brain.ts:367`). It makes for the current cap while not late or within 0.4 of her margin of its edge, else for the next one.
- **`inward`** (`brain.ts:827`): stay put if within `r − margin`, else 0.6 of `r` out from the centre toward her, then open water near there (`nav.ts nearestOpen`, 20 cells of 6.8 m, here rings out to 136 m).
- **`keepInside`** (`brain.ts:860`) on the flee option's mark (`brain.ts:221-233`).
- **`roamGoal`** (`brain.ts:797-815`): marks kept a margin inside the edge, drawn 0.4 toward the centre once the cap is under 600 m, and a fall-back inward by twice her margin.

**New here**
- While the next cap is late, roam marks are kept inside it, not inside the current cap. This storm's edge closes at up to 8 m/s, 0117's at 2 to 4 m/s. With 0117's rule, a bot with a small margin sat just inside the next cap, roamed out between the two caps, and was overtaken (`tests/bot.test.ts`).
- `inward` measures along the surface; 0117 used the chord.
- The fall-back to the deepest water is kept when she is already well inside.

**Left:** the fight option's "wait at the edge" for a player who lingers in the Storm (needs `learning.ts`), hunting, sheltering from weather, and the Storm-edge checks of loot, home and hunt.

**Early restraint, ported** (`brain.ts:75-82` `restraint` and `lastFew`, `holdBack` `:596`, `fightUrge` `:451-463`, the fire hold in `aimAndFire` `:1291-1294`)
- Will to fight falls by `[0.5, 0.5, 0.45, 0.35, 0.25, 0.1, 0, 0]` by Storm phase, and by 0.4 more with three ships or fewer afloat.
- "Close aboard" shrinks by 50 m × restraint.
- Armed, she lets a ship heading away go past 90 m (by heading, `ramp(off, 0, 0.35)` in a fight, `ramp(off, −0.45, −0.15)` out of one).
- She holds her fire outside a fight she chose, except at a ship within 90 m that shot her in the last 5 s.
- The bots' memory learns of shots through `shot(memory, by)` (`captain.ts`), as it learns of rams through `rammed`.
- Unchanged: ramming bots keep their speed-based let-go at all times.
- **Effect** (19 armed bots and a slow ship among them, 5 seeds, scratch run): time to sink her goes from 27 to 74 s with no restraint to 44 s to over 120 s in phase 0. Bots still often fight, because 0117's restraint worked with the loot (1.8) and claim (0.7) options outscoring a weak fight, and here only roam (0.15) competes.

## Uncertainties

1. The 1 am motion could mean the sea lab or the full game's controls.
2. The territory fill strength differs between v1 and 0117, and v2's WP20 render was not compared.
3. The galleon triangle count is not in any code or commit text.
4. The gull is a v2 companion or a v3 delivery gull.
5. Some commits appear twice with different hashes (for example the v2 gull render, `ba6e572` and `184efeb`). Hashes cited here are from the first set listed.
