// What the HUD and the drop share: the minimap's disc and the stick. The disc's paper, its graduated rim and her arrow
// hold still and are baked; what is on the sea (the land, the Storm, the ships) is a plate re-inked a few times a
// second, a dotted course and the Storm's first circle drawn on it while the Gale blows. The stick floats where the
// thumb set it, or rests faintly at its home.
import {
  Pen, arrow, canvas, ctx, dottedRing, drawBaked, drawEmblem, drawSprite, pennant, ring, star, stormRing, WASH, type ChartLayer, type Circle, type Sprite,
} from '../chart/index.ts';
import type { Controls } from '../app/controls.ts';
import type { MapView } from '../ui/model.ts';
import { LandLayer } from '../ui/screens/chart.ts';
import { stickBase, stickNub } from './instruments.ts';

const TAU = Math.PI * 2;
/** Room round a baked instrument for its shadow. */
const PAD = 16;

/**
 * One instrument baked to its own small canvas and re-inked only when what it shows has changed, drawn each frame as a
 * single image. Everything a number or a state can change is one of these; what never changes is a sprite
 * (ChartLayer.sprite), and only what truly moves (the rings, the needle) is drawn with the pen each frame.
 */
export class Plate {
  readonly sprite: Sprite;
  readonly pen: Pen;
  key = '';

  constructor(layer: ChartLayer, w: number, h: number) {
    const W = Math.ceil(w), H = Math.ceil(h), c = canvas(W * layer.dpr, H * layer.dpr), g = ctx(c);
    g.setTransform(layer.dpr, 0, 0, layer.dpr, 0, 0);
    this.pen = new Pen(layer.paper, layer.dpr, layer.layout.widths).on(g);
    this.sprite = { c, w: W, h: H, ax: W / 2, ay: H / 2 };
  }

  /** Re-inks it, centred at (cx, cy) in its own coordinates. */
  ink(key: string, draw: (pen: Pen, cx: number, cy: number) => void): void {
    this.key = key;
    this.pen.g.clearRect(0, 0, this.sprite.w, this.sprite.h);
    draw(this.pen, this.sprite.w / 2, this.sprite.h / 2);
  }
}

/** The map's contents on their plate: the land round her, sampled as she sails, and what `v` shows on the sea. */
export class Minimap {
  readonly #land = new LandLayer();

  /** The land, the Storm's edge in red, the next circle dotted, the Gale's course dotted, loot in gold, ships by their emblems or as marks, my marker's pennant. */
  ink(pen: Pen, cx: number, cy: number, layer: ChartLayer, v: MapView, tide: number): void {
    const g = pen.g, R = layer.layout.hud.r, ri = R * 0.82, k = ri / v.range;
    g.save();
    g.beginPath();
    g.arc(cx, cy, ri, 0, TAU);
    g.clip();
    g.save();
    g.translate(cx - ri, cy - ri);
    g.globalAlpha = 0.6;
    this.#land.draw(g, ri, v.lat, v.lon, v.range, tide);
    g.restore();
    const at = (x: number, y: number) => [cx + x * k, cy - y * k] as const;
    if (v.storm) {
      const [sx, sy] = at(v.storm.x, v.storm.y), sr = v.storm.r * k;
      // everything outside the safe circle under a thin wash of the Storm's red
      const outside = new Path2D();
      outside.rect(cx - R, cy - R, R * 2, R * 2);
      outside.arc(sx, sy, sr, 0, TAU, true);
      g.fillStyle = 'rgba(176,40,22,0.14)';
      g.fill(outside, 'evenodd');
      stormRing(pen, sx, sy, sr, 1, 0.5);
    }
    if (v.next) {
      const [nx, ny] = at(v.next.x, v.next.y);
      dottedRing(pen, nx, ny, v.next.r * k, 1, 'iron', 5, 0.85);
    }
    if (v.first) {
      const first: number[] = [];
      for (let i = 0; i < v.first.length; i += 2) first.push(...at(v.first[i], v.first[i + 1]));
      pen.rule([first], { w: 'fine', ink: 'rubric', alpha: 0.9, wobble: 0.3, seed: 43 });
    }
    if (v.course) {
      const dots = v.course.map((run) => {
        const pts: number[] = [];
        for (let i = 0; i < run.length; i += 2) pts.push(...at(run[i], run[i + 1]));
        return pts;
      });
      pen.rule(dots, { w: 'fine', ink: 'iron', alpha: 0.9, wobble: 0.2, seed: 44 }, 1, [0, 6]);
    }
    const loot = new Path2D();
    for (const mk of v.marks) {
      if (mk.kind !== 'loot') continue;
      const [x, y] = at(mk.x, mk.y);
      loot.moveTo(x + 2.4, y);
      loot.arc(x, y, 2.4, 0, TAU);
    }
    pen.fill(loot, 'gold', 0.95);
    if (v.fleet) {
      // a fleet this far off is too close together for emblems: each ship a dot of ink on a fleck of white
      const white = new Path2D(), ink = new Path2D();
      for (const sh of v.ships) {
        const [x, y] = at(sh.x, sh.y);
        white.moveTo(x + 3.4, y);
        white.arc(x, y, 3.4, 0, TAU);
        ink.moveTo(x + 2.2, y);
        ink.arc(x, y, 2.2, 0, TAU);
      }
      pen.fill(white, 'white', 0.75);
      pen.fill(ink, 'iron', 0.95);
    } else {
      const size = Math.max(20, Math.round(R * 0.2));
      for (const sh of v.ships) {
        const [x, y] = at(sh.x, sh.y);
        drawEmblem(g, layer.paper, sh.emblem, sh.colour, x, y, size, layer.dpr, sh.spotted ? 0.55 : 1);
      }
    }
    if (v.marker) {
      // pinned to the rim when it lies farther than the map shows
      const dx = v.marker.x, dy = v.marker.y, far = Math.min(1, v.range * 0.95 / Math.max(1, Math.hypot(dx, dy)));
      const [x, y] = at(dx * far, dy * far);
      pennant(pen, { x, y: y - 16, length: 22, height: 9, colour: WASH.vermilion, seed: 41 });
    }
    g.restore();
  }
}

/** The disc at D: its paper, then `plate` drawing what is on the sea, then the rim and her arrow on top; the width of
 *  the square it was all drawn in. */
export function mapFace(g: CanvasRenderingContext2D, layer: ChartLayer, D: Circle, alpha: number, heading: number, plate: () => void): number {
  const R = D.r, d = layer.disc(R);
  drawBaked(g, d, D.x - R, D.y - R, alpha);
  plate();
  const rim = layer.sprite(`hud|rim|${R}`, R * 2, R * 2, R, R, (p) => {
    ring(p, R, R, R * 0.84, R * 0.96, { ticks: 128 }, 1);
    star(p, R, R - R * 0.9, R * 0.05);
  });
  drawSprite(g, rim, D.x, D.y, { alpha });
  const size = Math.ceil(R * 0.44), h = size / 2;
  const arrowS = layer.sprite(`hud|arrow|${size}`, size, size, h, h, (p) => arrow(p, h, h + R * 0.16, h, h - R * 0.16));
  drawSprite(g, arrowS, D.x, D.y, { alpha, rot: heading });
  return (R + d.pad) * 2.2;
}

/** The stick: floating where the thumb is, or resting faintly at its home so a cold player knows to put a thumb there.
 *  `touch` is told the squares it drew in. */
export function drawStick(g: CanvasRenderingContext2D, layer: ChartLayer, home: Circle, v: Controls['stickView'], alpha: number, touch?: (x: number, y: number, w: number, h: number) => void): void {
  const r = v.r, base = (r + PAD) * 2, nub = (r * 0.36 + PAD) * 2;
  const ring0 = layer.sprite(`hud|stick|${r}`, base, base, base / 2, base / 2, (p) => stickBase(p, base / 2, base / 2, r));
  const nubS = layer.sprite(`hud|nub|${r}`, nub, nub, nub / 2, nub / 2, (p) => stickNub(p, nub / 2, nub / 2, r));
  const x = v.active ? v.x : home.x, y = v.active ? v.y : home.y, a = (v.active ? 1 : 0.42) * alpha;
  drawSprite(g, ring0, x, y, { alpha: a });
  drawSprite(g, nubS, x + (v.active ? v.dx : 0), y + (v.active ? v.dy : 0), { alpha: a });
  touch?.(x, y, base, base);
  if (v.active) touch?.(x + v.dx, y + v.dy, nub, nub);
}
