// The chart's drawing kit: everything the player reads, drawn the way a sixteenth-century chartmaker drew it, on one
// canvas layer over the game (layer.ts). The kit draws; screens (#41-#47) decide what and where.
//
//   const layer = await ChartLayer.create(parchment, host);   // on the GPU painter's paper
//   layer.resize(innerWidth, innerHeight, devicePixelRatio, safeArea);
//   layer.addSheet((g, pen, l) => drawBaked(g, l.sheet('folio', w, h), x, y));   // baked once, painted on change
//   layer.addLive((g, now, dt, l) => { rose(l.pen, x, y, r, {}, part(t, 0, 1)); return { x, y, w, h }; });
//   layer.presses.add({ id: 'play', hit: { x, y, r: 48 }, press: new Press(), sound: 'play', haptic: 'medium', act });
//   loop: layer.frame(now)   // the live plane, its CPU cost in layer.cost
//
// Paper (paper.ts, sheet.ts): the sheet's grain and patterns; folio, half-sheet, scrap and the HUD disc, baked.
// Ink (pen.ts, inks.ts): quill strokes with t, rules, washes, gilt, hatching; iron-gall, rubric, verdigris, azurite,
// shell gold, lead white; washes in any captain's colour and the sea's.
// Objects: rose.ts (rose 8/16/32, graduated ring, rhumb line and web, fleur, needle, feathered arrow), marks.ts
// (pennant and staff, tally, sand-glass, pointing hand, stars, cross, burst, stamp, sun, moon, stick, quadrant,
// dividers, wake, dotted and storm rings), coast.ts (the planet's coastlines, traced from its heights and inked over
// the live globe), seal.ts (wax seals in five illuminations, with relief and sheen), cartouche.ts (strapwork
// cartouche, level rings), galleon.ts (the captain's mark), emblem.ts, numerals.ts (the numeral hand), woodcut.ts
// (the icon set's drawings inked as woodcuts).
// Motion (motion.ts): ink-in (t and `part`), unroll, fly-to and its stamp, stagger, dry.
// Press (press.ts): the spring, the look, the routing and the feedback hook. Layout (layout.ts): iPad and iPhone.
export { ChartLayer, drawSprite, type DragSurface, type LivePainter, type Rect, type SheetPainter, type Sprite } from './layer.ts';
export { Paper, canvas, ctx } from './paper.ts';
export { Pen, arcPts, cubic, shape, trace, type LineStyle, type Pts, type WashStyle, type Weight, type Widths } from './pen.ts';
export { INKS, WASH, type InkName } from './inks.ts';
export { bakeDisc, bakeSheet, drawBaked, ruledFrame, type Baked, type SheetWeight, type Side } from './sheet.ts';
export { arrow, fleur, needle, rhumb, rhumbWeb, ring, rose, type RingOptions, type RoseOptions } from './rose.ts';
export {
  burst, cross, dividers, dottedRing, hand, moon, pennant, quadrant, sandglass, staff, stamp, star, stick, stormRing, sun, tally, wake,
  type GlassOptions, type PennantOptions,
} from './marks.ts';
export { ILLUMINATIONS, bakeSeal, drawSeal, type Device, type Illumination, type Seal } from './seal.ts';
export { cartouche, rings, type CartoucheOptions, type Field } from './cartouche.ts';
export { drawGalleon, galleon, galleonSprite, type GalleonOptions } from './galleon.ts';
export { drawEmblem, emblemSprite, type Colours } from './emblem.ts';
export { figure, figureWidth, type FigureOptions } from './numerals.ts';
export { prims, woodcut } from './woodcut.ts';
export { coastRuns, coasts, traceCoasts, type Coasts, type Globe } from './coast.ts';
export { dryAlpha, ease, flight, part, progress, stagger, thin, unroll, type Flight } from './motion.ts';
export { Press, Presses, TARGET, hits, pressLook, type Hit, type Pressable } from './press.ts';
export { chartLayout, deviceClass, layoutProblems, type Box, type ChartLayout, type Circle, type DeviceClass, type Insets } from './layout.ts';
