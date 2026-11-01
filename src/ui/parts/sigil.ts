// Emblems drawn from the cosmetics library's own charges (src/render/cosmetics/emblems.ts), so the rivals page shows
// exactly what flies on the sails. Each charge is rasterised once into an alpha mask and coloured by CSS; masks are
// made a few per frame, so a page of forty captains never stalls, and each fades in as it lands. Ids the library
// does not know fall back to the kit's own glyphs.
import { EMBLEMS, isEmblem, type EmblemId } from '../../render/cosmetics/emblems.ts';

/** Career emblem ids that the library draws under another name. */
const ALIAS: Record<string, EmblemId> = {
  wave: 'waves', whirlpool: 'nautilus', leapingFish: 'dolphin', petal: 'lotus', shell: 'scallop', twinStars: 'northStar',
  northernCrown: 'northStar', lightningStroke: 'lightning', thunderbolt: 'stormCloud', whaleTail: 'whale',
};

/** The library's charge for an id, if it has one. */
export function chargeOf(id: string): EmblemId | null {
  if (isEmblem(id)) return id;
  return ALIAS[id] ?? null;
}

/** The library's name for a charge, such as "Goshawk". */
export const chargeName = (id: EmblemId): string => EMBLEMS[id].name;

const SIZE = 72;
const masks = new Map<EmblemId, string>();
const waiting = new Map<EmblemId, ((url: string) => void)[]>();
let running = false;

function draw(id: EmblemId): string {
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  const g = c.getContext('2d')!, img = g.createImageData(SIZE, SIZE), d = img.data, f = EMBLEMS[id].charge, px = 2 / SIZE;
  for (let j = 0; j < SIZE; j++) for (let i = 0; i < SIZE; i++) {
    // the charge's field runs -1 to 1 with y up
    const v = f((i + 0.5) * px - 1, 1 - (j + 0.5) * px), a = Math.min(1, Math.max(0, 0.5 - v / px));
    const o = (j * SIZE + i) * 4;
    d[o] = d[o + 1] = d[o + 2] = 255;
    d[o + 3] = a * 255;
  }
  g.putImageData(img, 0, 0);
  return c.toDataURL('image/png');
}

function pump(): void {
  const t0 = performance.now();
  for (const [id, cbs] of waiting) {
    if (performance.now() - t0 > 8) break;
    const url = draw(id);
    masks.set(id, url);
    waiting.delete(id);
    for (const cb of cbs) cb(url);
  }
  running = waiting.size > 0;
  if (running) requestAnimationFrame(pump);
}

/** Calls back with the charge's mask (a data URL), at once if it is made, else within a few frames. */
export function withMask(id: EmblemId, cb: (url: string) => void): void {
  const done = masks.get(id);
  if (done) { cb(done); return; }
  const list = waiting.get(id);
  if (list) list.push(cb);
  else waiting.set(id, [cb]);
  if (!running) { running = true; requestAnimationFrame(pump); }
}

/** Fills an element with the charge as a CSS mask over its background colour (currentColor by default). */
export function maskInto(e: HTMLElement, id: EmblemId): void {
  e.classList.add('p-mask');
  withMask(id, (url) => {
    e.style.setProperty('-webkit-mask-image', `url(${url})`);
    e.style.setProperty('mask-image', `url(${url})`);
    e.classList.add('is-ready');
  });
}
