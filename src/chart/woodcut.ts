// Woodcuts: the icon set's drawings (src/icons) cut as a printer cut a block, for an ability's cartouche, a region's
// sign, the small diagrams that teach. A solid shape is never printed flat (that is a glyph, not a cut): it is a firm
// outline round close hatching, the hatching crossed where the shape turns from the light, at its lower right; the
// cuts are bare paper. The icon set stays the one place the game's glyphs are drawn; here they are only inked.
import type { Prim } from '../icons/draw.ts';
import { ABILITY_ICONS } from '../icons/sets/abilities.ts';
import { GULL_TIER_ICONS, HUD_ICONS, MENU_ICONS } from '../icons/sets/hud.ts';
import { PERK_ICONS } from '../icons/sets/perks.ts';
import { REGION_ICONS } from '../icons/sets/regions.ts';
import { CONSUMABLE_ICONS, WEAPON_ICONS } from '../icons/sets/weapons.ts';
import type { InkName } from './inks.ts';
import type { Pen } from './pen.ts';

const FAMILIES: Record<string, Record<string, Prim[]>> = {
  ability: ABILITY_ICONS, perk: PERK_ICONS, region: REGION_ICONS, hud: HUD_ICONS, menu: MENU_ICONS, gull: GULL_TIER_ICONS,
  weapon: WEAPON_ICONS, item: CONSUMABLE_ICONS,
};

/** An icon's drawing by its name in the icon set ('ability.ram', 'region.fjords'). */
export function prims(name: string): readonly Prim[] {
  const [fam, id] = name.split('.');
  const p = FAMILIES[fam]?.[id];
  if (!p) throw new Error(`no drawing named ${name}`);
  return p;
}

/** An SVG transform list as a matrix. */
function matrixOf(tr: string | undefined): DOMMatrix {
  const m = new DOMMatrix();
  if (!tr) return m;
  for (const [, fn, args] of tr.matchAll(/(\w+)\(([^)]*)\)/g)) {
    const a = args.split(/[\s,]+/).filter(Boolean).map(Number);
    if (fn === 'translate') m.translateSelf(a[0], a[1] ?? 0);
    else if (fn === 'scale') m.scaleSelf(a[0], a[1] ?? a[0]);
    else if (fn === 'rotate') {
      if (a.length >= 3) m.translateSelf(a[1], a[2]).rotateSelf(a[0]).translateSelf(-a[1], -a[2]);
      else m.rotateSelf(a[0]);
    } else if (fn === 'matrix') m.multiplySelf(new DOMMatrix(a));
  }
  return m;
}

/**
 * Inks a drawing from the icon set centred at (x, y), `size` CSS pixels across (the set's 24-unit grid): its solids
 * hatched and outlined, its lines in ink, its cuts as paper. Fine detail shows from 40 px.
 */
export function woodcut(pen: Pen, drawing: readonly Prim[], x: number, y: number, size: number, ink: InkName | string = 'iron', alpha = 1): void {
  if (alpha <= 0) return;
  const g = pen.g, k = size / 24, fine = size >= 40;
  const x0 = x - 12 * k, y0 = y - 12 * k;
  const shown = drawing.filter((p) => (p.fine ? fine : p.bold ? !fine : true));
  /** A prim's shape on the grid, or (`screen`) placed and sized on the sheet. */
  const shapeOf = (p: Prim, screen = false): Path2D => {
    const m = matrixOf(p.tr);
    if (screen) m.preMultiplySelf(new DOMMatrix([k, 0, 0, k, x0, y0]));
    const out = new Path2D();
    out.addPath(new Path2D(p.d), m);
    return out;
  };
  const strokeIt = (p: Prim, paper: boolean) => {
    g.save();
    g.translate(x0, y0);
    g.scale(k, k);
    g.lineWidth = p.w ?? 2;
    g.lineCap = p.cap ?? 'round';
    g.lineJoin = 'round';
    if (p.dash) g.setLineDash(p.dash.split(/[\s,]+/).map(Number));
    if (paper) {
      g.strokeStyle = pen.paper.anchor(g, pen.paper.surface, pen.ox, pen.oy, pen.dpr);
    } else {
      g.globalCompositeOperation = 'multiply';
      g.globalAlpha = alpha * (p.op ?? 1) * 0.92;
      g.strokeStyle = pen.paper.anchor(g, pen.paper.ink(ink), pen.ox, pen.oy, pen.dpr);
    }
    g.stroke(shapeOf(p));
    g.restore();
  };
  /**
   * The solids of one pass, cut as one block: their outline drawn round them all (doubled, and its inner half
   * covered with paper, so where two shapes overlap no line runs between them), hatched, each shadowed on its own.
   */
  const solids = (list: Prim[]) => {
    if (!list.length) return;
    const union = new Path2D();
    for (const p of list) union.addPath(shapeOf(p, true));
    const a = alpha * (list[0].op ?? 1);
    const gap = Math.min(3, Math.max(1.35, size / 21));
    const box = [x0 - 2, y0 - 2, 24 * k + 4, 24 * k + 4] as const;
    g.save();
    g.globalCompositeOperation = 'multiply';
    g.globalAlpha = a * 0.95;
    g.lineWidth = 2 * Math.max(pen.width('fine'), size / 34);
    g.lineJoin = 'round';
    g.strokeStyle = pen.paper.anchor(g, pen.paper.ink(ink), pen.ox, pen.oy, pen.dpr);
    g.stroke(union);
    g.restore();
    pen.paperFill(union, alpha);
    pen.hatch(union, ...box, -0.78, gap, { ink, alpha: 0.95 * a, seed: 3 });
    // the shadow: what lies off the light, each shape less itself moved up and left
    const d = Math.max(1.6, size * 0.07);
    for (const p of list) {
      const path = shapeOf(p, true), off = new Path2D();
      off.rect(box[0] - 4, box[1] - 4, box[2] + 8, box[3] + 8);
      off.addPath(path, new DOMMatrix([1, 0, 0, 1, -d, -d]));
      g.save();
      g.clip(off, 'evenodd');
      pen.hatch(path, ...box, 0.78, gap, { ink, alpha: 0.9 * a, seed: 8 });
      g.restore();
    }
  };
  const pass = (list: Prim[]) => {
    solids(list.filter((p) => p.k === 'f'));
    for (const p of list) if (p.k !== 'f') strokeIt(p, false);
  };
  pass(shown.filter((q) => !q.cut && !q.top));
  // the cuts: the block cut away, the paper left bare
  for (const p of shown.filter((q) => q.cut)) {
    if (p.k === 'f') pen.paperFill(shapeOf(p, true), alpha);
    else strokeIt(p, true);
  }
  pass(shown.filter((q) => !q.cut && q.top));
}
