# North Star: Water Pro + Sky Pro

What the threejswaterpro.com and threejsskypro.com demos do, read from their production bundles
(Nov 2026), and what we take for an iPhone 16 Pro Max at 30–40 FPS.

We implement from the published techniques, not from their code (Water Pro's is obfuscated and paid).

The core lesson: **quality lives in pixels, not geometry.** The water mesh is coarse (~33K tris);
the look comes from FFT normals, env reflection, absorption, scatter and foam. The sky is cheap
because almost everything is a LUT, a cache, or 1/64th of the pixels per frame.

## Sky

| Piece | Technique | Their numbers | Ours |
|---|---|---|---|
| Atmosphere | Hillaire LUTs: transmittance, multi-scatter, sky-view | 256×64, 32×32, 200×100 half-float; no ozone | Same. Rebake only when sun/params change |
| Ambient | Zenith/horizon radiance + sun transmittance computed on CPU, pushed as uniforms | on sun change | Same: the one source of sky light for every material |
| Fog | Analytic `1-exp(-d·k)` toward sky-view colour | — | Same |
| Clouds | Spherical shell raymarch, Worley FBM 3D noise (one RGBA8 texture reused for erosion), CPU Perlin weather map | shell 1.4–4 km, step 25 m, 256 max steps | 32³ noise, ≤96 steps, 3–4 light taps |
| Light | 6-tap cone march, 3-octave multi-scatter (two HG lobes), powder, base darkening | — | 3–4 taps, no moon march |
| Cost control | March 1/8 res per axis, one 4×4 Bayer cell per frame; history at 1/2 res; reprojection with hit distance, Catmull-Rom + neighbourhood clamp; blue-noise jitter | ~1/64 of pixels/frame | Keep exactly: this is why it fits |
| Cloud shadow | Top-down R16F map, 8 steps along sun; exposed as a node every material multiplies in | 128–1024² | 256², 4–6 steps, every 2–4 frames |
| Env map | Equirect bake of sky+clouds, clouds cached and re-marched every 5th frame, then PMREM | 256×128 … 1024×512 | 256×128, clouds every ≥8 frames |
| God rays | Half-res march sampling cloud shadow | 16–24 steps | Cut |
| Post | Auto-exposure, bloom ¼ res, ACES, dither; pixel ratio 1, no MSAA | — | ACES + dither; exposure fixed per preset |

Presets worth starting from: **fluffy** (low fair-weather cumulus, rayleigh 1.45, turbidity 1.5,
coverage .6, sun 38°) and **stunningSunset** (rayleigh 2.87, turbidity 2.4, sun 4°, cirrus + haze).

## Water

| Piece | Technique | Their numbers | Ours |
|---|---|---|---|
| Spectrum | JONSWAP (γ 3.3), wind-speed driven, directional spread, deep-water dispersion looped to a period | peak wavelength 1–200 m | Same |
| Cascades | Patch sizes shrink ×24/N; band-limited so cascades don't overlap | 3×256 → 1024 / 96 / 9 m | 2–3×256 |
| FFT | Compute; one workgroup-shared kernel per axis (2 dispatches) | — | Same |
| Outputs | Displacement buffer (choppy); RGBA16F normal + Jacobian texture, **mipmapped** | — | Same |
| Geometry | Clipmap: centre grid + 5 rings doubling, stitched seams, skirt to far plane, snapped to coarsest cell | 200 m base, 64 segs → ~33K tris | 32–48 segs |
| Reflection | PMREM sky env map; **roughness = base + normal-mip variance** (kills distant aliasing); SSR on high only | — | Env map only, no SSR |
| Fresnel | Exact dielectric, IOR 1.33, N·V floor, normals bent above horizon | — | Same |
| Refraction | Screen-space, offset by normal.xz × depth difference, reject foreground | — | Same |
| Colour | Absorption by thickness (scene depth − water depth); physical Jerlov water-type tables | — | Jerlov Oceanic I/IA for tropical clarity |
| Scatter | View-against-sun × N·−L subsurface term, faded 800–1600 m | — | Same |
| Glint | Blinn pow 512–2048, masked by foam | — | Same |
| Whitecaps | Jacobian → **persistent foam buffer** (ping-pong R16F, 400 m, exponential decay τ 0.5–2.5 s), textured along wind | 256–2048² | 512² |
| Surface/shore foam | Tiled texture by coverage; shoreline from depth difference | range 2–5 m | Same |
| Caustics | Texture at two scrolled scales, min-combined, RGB split, distorted by cascade-0 normals | 512² | Same, on seabed + sand |
| Wake | iWave height field, Bessel kernel | 100 m, 256–1024² | 256² later, or cut |
| Buoyancy | Compute probes, async readback one frame late | ≤128 probes | Same, ~8 probes for the ship |
| Cut entirely | Underwater, spray, sun shafts, rain, SMAA, separate transparent passes | — | — |

Closest preset to our look: **seaOfThieves** (wind 10.2 m/s, peak wavelength 130 m, choppiness 1.96,
water `#006b8f`, transmission `#46fbf8`, glint 2048).

## What this means for our architecture

1. **The sky is the light source of the whole world.** One `Environment` holds time of day, sun, weather and wind.
   The sky turns it into LUTs, ambient uniforms, a cloud-shadow node and an env map. Every other
   material (water, sand, palms, hull) reads those, and none keeps its own colour hacks.
2. **Every expensive thing is cached or amortised:** LUTs only rebake when the sun changes, the env map
   re-marches clouds rarely, clouds march a fraction of the pixels each frame, foam accumulates over time.
3. **One frame graph owns the passes:** opaque → water (needs scene depth + colour) → clouds composite → post.
   Systems contribute nodes and meshes; they never create their own passes.
4. **Pixel ratio 1, no MSAA**, as both demos do.
