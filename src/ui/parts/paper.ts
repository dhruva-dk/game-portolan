// Parchment for the interface, made once at boot (ported from the rewrite's src/paper.ts): a tileable sheet of laid
// paper and a torn edge that masks any panel as a nine-slice. Both become CSS variables (--paper, --torn) on the page
// root, so every panel shares the same two images. The chart painter borrows the same grain.

/** A hash in [0, 1) of an integer lattice point. */
function hash(i: number, j: number, s: number): number {
  let h = (i * 374761393 + j * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Value noise that wraps every `p` lattice cells, so a tile of it repeats without a seam. */
function wrapNoise(x: number, y: number, p: number, s: number): number {
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const m = (k: number) => ((k % p) + p) % p;
  const a = hash(m(i), m(j), s), b = hash(m(i + 1), m(j), s), c = hash(m(i), m(j + 1), s), d = hash(m(i + 1), m(j + 1), s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Paper grain at a point of a tile `size` pixels wide: mottling from big to small, in roughly [-1, 1]. */
export function grain(x: number, y: number, size: number, seed = 1): number {
  let v = 0, amp = 0.55, f = 3;
  for (let o = 0; o < 5; o++) {
    v += amp * (wrapNoise((x / size) * f, (y / size) * f, f, seed + o) * 2 - 1);
    amp *= 0.5;
    f *= 2;
  }
  return v;
}

const PAPER = [234, 216, 178];
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

function makeTile(size: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const img = g.createImageData(size, size), d = img.data;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const n = grain(x, y, size), fine = hash(x, y, 9) - 0.5;
    // laid paper: faint lines close together one way, chain lines far apart the other
    const laid = Math.cos((y / size) * Math.PI * 2 * 48) * 0.012 + (Math.abs(((x / size) * 4) % 1 - 0.5) < 0.012 ? -0.02 : 0);
    const k = 1 + n * 0.07 + fine * 0.035 + laid;
    const o = (y * size + x) * 4;
    d[o] = PAPER[0] * k; d[o + 1] = PAPER[1] * (k - n * 0.012); d[o + 2] = PAPER[2] * (k - n * 0.03); d[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  // fibres, drawn on every wrap so they cross the seams
  let s = 7;
  const r = () => (s = hash(s, 3, 5) * 1e6 | 0, hash(s, 1, 2));
  g.lineCap = 'round';
  for (let i = 0; i < 260; i++) {
    const x = r() * size, y = r() * size, a = r() * Math.PI * 2, l = 3 + r() * 14, dark = r() < 0.6;
    g.strokeStyle = dark ? `rgba(120, 84, 40, ${0.05 + r() * 0.08})` : `rgba(255, 250, 235, ${0.1 + r() * 0.12})`;
    g.lineWidth = 0.4 + r() * 0.6;
    for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) {
      g.beginPath();
      g.moveTo(x + ox, y + oy);
      g.quadraticCurveTo(x + ox + Math.cos(a) * l * 0.5 + (r() - 0.5) * 3, y + oy + Math.sin(a) * l * 0.5, x + ox + Math.cos(a) * l, y + oy + Math.sin(a) * l);
      g.stroke();
    }
  }
  // foxing: a couple of faint rust freckles (more would show the tile repeating)
  for (let i = 0; i < 3; i++) {
    const x = r() * size, y = r() * size, rad = 0.8 + r() * 2.5;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad * 2);
    gr.addColorStop(0, `rgba(140, 80, 30, ${0.06 + r() * 0.08})`);
    gr.addColorStop(1, 'rgba(140, 80, 30, 0)');
    g.fillStyle = gr;
    g.fillRect(x - rad * 2, y - rad * 2, rad * 4, rad * 4);
  }
  return c;
}

/**
 * The torn edge, as an alpha mask in nine slices of `t` pixels: opaque inside, the outer band torn in long swells and
 * short nicks. Each side's tear repeats every slice, so the edges tile round any size of panel.
 */
function tornMask(t: number): HTMLCanvasElement {
  const S = t * 3, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const img = g.createImageData(S, S), d = img.data;
  const tear = (u: number, side: number) => {
    let v = 0, amp = 0.5, f = 1;
    for (let o = 0; o < 5; o++) { v += amp * (wrapNoise((u / t) * f, side * 7.3, f, 20 + o) * 2 - 1); amp *= 0.5; f *= 2; }
    return v;
  };
  const m = t * 0.46, A = t * 0.42, rad = t * 0.12;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const L = m + A * tear(y, 0), R = S - m - A * tear(y, 1), T = m + A * tear(x, 2), B = S - m - A * tear(x, 3);
    const dx = Math.max(L - x, x - R) + rad, dy = Math.max(T - y, y - B) + rad;
    const sd = Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - rad;
    // a pixel of softness, and a few fibres thinning the very edge
    const a = clamp01(0.5 - sd * 0.6) * (sd > -1.5 && hash(x, y, 31) < 0.2 ? 0.55 : 1);
    const o = (y * S + x) * 4;
    d[o] = d[o + 1] = d[o + 2] = 255; d[o + 3] = a * 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

let tile: HTMLCanvasElement | null = null;
/** The sheet itself, for whoever paints on parchment (the chart). */
export function paperTile(): HTMLCanvasElement {
  return (tile ??= makeTile(256));
}

/** Makes the parchment and hangs it on the page's root as CSS variables. */
export function makePaper(): void {
  const root = document.documentElement.style;
  if (root.getPropertyValue('--paper')) return;
  root.setProperty('--paper', `url(${paperTile().toDataURL('image/jpeg', 0.88)})`);
  root.setProperty('--torn', `url(${tornMask(48).toDataURL('image/png')})`);
}
