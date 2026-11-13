# Art direction

A late trade-wind afternoon on a toy ocean planet: warm sun, a deep teal sea, a few big sunlit clouds, and the
player's galleon as the brightest, most colourful thing in the frame. Painterly, saturated and readable on a phone
at 956×440. Each rule below can be checked against `node tools/hero.ts <dir>` (seven hero shots and a numbered sheet).

## Sun
- The sun is 25–30° up (`main.ts` RELEASE hours 16.3 → 27°), off the chase camera's quarter: the canvas is lit from
  the side or from behind, never flat from the front.
- It is fixed for the match. The grade, the shafts and the haze's glow are keyed on its height (`post/grade.ts` DAY).
- Alternates: `?mood=warm` (17.4 h, 12°, a deeper sea, more haze) and `?mood=noon` (12.6 h, 70°, less haze).

## Value structure (darkest to brightest)
1. Hull shadows and the sea's deep troughs. They are lifted by the grade's fade and never reach black.
2. The sea's body: deep teal to blue, darker than the sky at the horizon.
3. Sky, haze band and the islands' sand.
4. Sunlit cloud tops.
5. The player's canvas, backlit or sunlit, and the glint path. These are the brightest things that are not the sun.
- Nothing is blown flat. AgX rolls highlights toward white. The bloom only spills light past its knee.

## Palette
- The player sails cream canvas with a red cross pattée (`play/colours.ts` LOOK). The red shows through the backlit
  canvas.
- Every enemy has its own strong dye (woad, saffron, verdigris, madder, charcoal, murrey, ochre) and a painted hull.
  The dyes cycle by ship, so seven in a row never repeat.
- Islands are warm sand, red-brown rock, and clear green palms and shrubs. They read green at 30 px, not as a dark
  blot.
- The grade pushes warm hues (sails, hulls, sand) and the sea's teal. It holds the sky's blue back, so the sky never
  outshines the ship.

## Haze and distance
- A warm haze of the planet's own scale (`sky/sky.ts` fog). The near 60 m stays clear. Ships at 60–150 m keep their
  colour. The horizon dissolves into a warm band.
- The haze lies low, 8 m deep: masts stand out of it over their hulls.
- Where pixels are scarce there is haze, not detail.

## Light
- A warm rim on every hull's outline (`sky/light.ts` rim), strongest against the sun. Use it instead of dark
  outlines.
- Backlit canvas glows (`ship/materials.ts` THROUGH 0.55). Painted parts glow less, so the emblem reads as a
  silhouette in the light.
- Light shafts stream from bright sky gaps round the sun, at a quarter of the frame's size. They are strongest when
  the sun is low.
- Bloom is soft and wide, at a quarter of the frame's size and below. Glint, foam, muzzle flash and splash spill.
  Canvas only glows at its brightest.

## Clouds
- A few big masses (`sky/cloud-field.ts` MASS), as tall as they are wide, with bright tops and soft grey bellies.
  No field of popcorn.

## Grade and finish
- Exposure, then the vignette, then AgX, then the colourist's look from a 33³ table. The storm has a cold, flat
  look of its own, mixed in by how deep the eye is in the storm.
- Fine grain on the midtones and a triangular dither, so gradients never band.
- FOV 50.

## Forbidden
- Tall cliffs; anything man-made on the islands; any sign of people.
- Thin dark lines against a bright sky. Rigging should fade into the haze; it is never inked.
- Crushed blacks, blown flat highlights, pastel wash over the whole frame, milky white fog.
- Murky brown-grey water.
- Quality settings, fallbacks, and any pass outside `frame.ts`.

## Cost (phone, 956×440)
| Pass | Size | Taps |
|---|---|---|
| Light to texture | 956×440 | 1 |
| Bloom (7 passes) | 239×110 down to 30×14 | ~0.2 M |
| Shafts (3 passes) | 239×110 | ~0.9 M |
| Grade, film, composite | 956×440 | bloom + shafts + 2 LUT reads |
| FXAA | 956×440 | as before |
