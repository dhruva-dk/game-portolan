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

## Uncertainties

1. The 1 am motion could mean the sea lab or the full game's controls.
2. The territory fill strength differs between v1 and 0117, and v2's WP20 render was not compared.
3. The galleon triangle count is not in any code or commit text.
4. The gull is a v2 companion or a v3 delivery gull.
5. Some commits appear twice with different hashes (for example the v2 gull render, `ba6e572` and `184efeb`). Hashes cited here are from the first set listed.
