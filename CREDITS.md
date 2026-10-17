# Credits

Third-party libraries and assets bundled with or used to build the game.
Licences: CC0 1.0 = https://creativecommons.org/publicdomain/zero/1.0/ · MIT = https://opensource.org/license/mit ·
Apache-2.0 = https://www.apache.org/licenses/LICENSE-2.0
All 3D geometry, the sky and all audio are generated in code; no models, HDRIs or sound files are bundled.
To add an entry, append one line: `- <file(s)> — <original name> — <source URL> — <author> — <licence>`.

## Libraries

- three — https://threejs.org — three.js authors — MIT (runtime)
- vite — https://vite.dev — Evan You and Vite contributors — MIT (build)
- typescript — https://www.typescriptlang.org — Microsoft — Apache-2.0 (dev)
- playwright — https://playwright.dev — Microsoft — Apache-2.0 (tests)
- @types/three, @types/node — https://github.com/DefinitelyTyped/DefinitelyTyped — DefinitelyTyped contributors — MIT (dev)

## Textures (src/assets/)

Maps: color = sRGB albedo; normal = OpenGL convention (+Y up); arm = R ambient occlusion, G roughness, B metalness
(AO = 1 where the source has none; metalness = 0 except iron). Resized and re-encoded as JPEG;
otherwise unmodified.

- sand_white_{color,normal}.jpg — "Ground 061" (Ground061) — https://ambientcg.com/a/Ground061 — ambientCG, by Lennart Demes — CC0 1.0
- sand_black_{color,normal}.jpg — "Gravel 024" (Gravel024) — https://ambientcg.com/a/Gravel024 — ambientCG, by Lennart Demes — CC0 1.0
- rock_cliff_{color,normal}.jpg — "Cliff Side" — https://polyhaven.com/a/cliff_side — Poly Haven, by James Ray Cock, Jenelle van Heerden, Dario Barresi — CC0 1.0
- rock_basalt_{color,normal}.jpg — "Dark Rock 02" — https://polyhaven.com/a/dark_rock_02 — Poly Haven, by Amal Kumar — CC0 1.0
- rock_coast_{color,normal,arm}.jpg — "Rock 048" (Rock048) — https://ambientcg.com/a/Rock048 — ambientCG, by Lennart Demes — CC0 1.0
- lava_{color,normal}.jpg — "Rock 033" (Rock033) — https://ambientcg.com/a/Rock033 — ambientCG, by Lennart Demes — CC0 1.0
- bark_palm_{color,normal}.jpg — "Palm Bark" — https://polyhaven.com/a/palm_bark — Poly Haven, by Charlotte Baglioni — CC0 1.0
- bark_pine_{color,normal}.jpg — "Pine Bark" — https://polyhaven.com/a/pine_bark — Poly Haven, by Dimitrios Savva — CC0 1.0
- wood_hull_{color,normal,arm}.jpg — "Dark Wooden Planks" — https://polyhaven.com/a/dark_wooden_planks — Poly Haven, by Amal Kumar — CC0 1.0
- wood_deck_{color,normal}.jpg — "Brown Planks 09" — https://polyhaven.com/a/brown_planks_09 — Poly Haven, by Rob Tuytel — CC0 1.0
- wood_weathered_{color,normal,arm}.jpg — "Brown Planks 03" — https://polyhaven.com/a/brown_planks_03 — Poly Haven, by Rob Tuytel — CC0 1.0
- iron_{color,normal,arm}.jpg — "Rusty Metal 04" — https://polyhaven.com/a/rusty_metal_04 — Poly Haven, by Amal Kumar — CC0 1.0
- rope_{color,normal,arm}.jpg — "Rope 001" (Rope001) — https://ambientcg.com/a/Rope001 — ambientCG, by Lennart Demes — CC0 1.0
- masonry_{color,normal,arm}.jpg — "Castle Wall Variation" — https://polyhaven.com/a/castle_wall_varriation — Poly Haven, by Rob Tuytel — CC0 1.0
- moss_{color,normal}.jpg — "Moss 002" (Moss002) — https://ambientcg.com/a/Moss002 — ambientCG, by Lennart Demes — CC0 1.0
- gravel_{color,normal}.jpg — "Gravel 041" (Gravel041) — https://ambientcg.com/a/Gravel041 — ambientCG, by Lennart Demes — CC0 1.0
- thatch_{color,normal,arm}.jpg — "Thatched Roof 001 A" (ThatchedRoof001A) — https://ambientcg.com/a/ThatchedRoof001A — ambientCG, by Lennart Demes — CC0 1.0
- canvas_{color,normal}.jpg — "Hessian 380" — https://polyhaven.com/a/hessian_380 — Poly Haven, by colormass, Rico Cilliers — CC0 1.0
- papyrus_color.jpg — "Blank papyrus paper" (backlit photo of modern blank papyrus, Cairo; cropped to 1600×1600, not tileable) — https://commons.wikimedia.org/wiki/File:Blank_papyrus_paper.jpg — B. Simpson (Wikimedia user Cairocamels) — Public domain
