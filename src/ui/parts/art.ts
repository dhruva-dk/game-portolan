// Card art for cosmetics: a swatch sail for a colour, a hull for a paint, the pattern itself on a sail, a wake
// curling on dark water, and the cosmetics library's own charges for figureheads and emblems. Art comes back as
// markup; charges arrive as masks a frame or two later (hydrate fills them in).
import { emblem, KIND_ICON } from './icons.ts';
import { chargeOf, maskInto } from './sigil.ts';
import type { EmblemId } from '../../render/cosmetics/emblems.ts';

let uid = 0;
const SAIL = 'M10 6h28l5 36H5z';
const MAST = '<path d="M24 1v46" stroke="#3b2a1a" stroke-width="2.4" stroke-linecap="round"/>';

/** The pattern on a sail, drawn in the sail's ink colour over its cloth. */
function pattern(id: string): string {
  const s = (d: string, w = 3) => `<path d="${d}" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
  const star = (x: number, y: number, r: number) => {
    let d = '';
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.42 : r;
      d += `${i ? 'L' : 'M'}${(x + rr * Math.cos(a)).toFixed(1)} ${(y + rr * Math.sin(a)).toFixed(1)}`;
    }
    return `<path d="${d}z"/>`;
  };
  switch (id) {
    case 'singleStripe': return '<rect x="0" y="19" width="48" height="9"/>';
    case 'twinBands': return '<rect x="0" y="14" width="48" height="5"/><rect x="0" y="27" width="48" height="5"/>';
    case 'quartered': return '<rect x="0" y="0" width="24" height="24"/><rect x="24" y="24" width="24" height="24"/>';
    case 'chevron': return '<path d="M0 12l24 18 24-18v9L24 39 0 21z"/>';
    case 'waveCrest': return '<path d="M0 34c6-6 10-6 14-1s8 5 12 0 9-6 14-1 6 4 8 3v13H0z"/>';
    case 'spiral': return s('M24 24c0-2 3-2 3 0 0 4-6 4-6 0 0-6 9-6 9 0 0 8-12 8-12 0 0-10 15-10 15 0', 2.6);
    case 'scales': {
      let d = '';
      for (let y = 10; y < 46; y += 7) for (let x = (y / 7) % 2 ? 4 : 0; x < 48; x += 8) d += `M${x - 4} ${y}a4 4 0 0 0 8 0`;
      return s(d, 1.8);
    }
    case 'ripples': return s('M5 42a8 8 0 0 1 8-8M5 42a16 16 0 0 1 16-16M5 42a24 24 0 0 1 24-24M5 42a32 32 0 0 1 32-32', 2.4);
    case 'starfield': return [[16, 14, 3], [30, 11, 2.4], [22, 24, 3.4], [34, 27, 2.6], [13, 33, 2.8], [27, 37, 3]].map(([x, y, r]) => star(x, y, r)).join('');
    case 'feathered': return '<path d="M14 40C14 26 18 14 24 8c2 10-2 24-10 32z"/><path d="M26 42c2-12 6-22 14-28 0 10-4 22-14 28z"/>';
    case 'forkedLightning': return '<path d="M28 4L14 26h8l-6 18 18-24h-8l6-16z"/>';
    case 'tideLines': return s('M2 14c5-3 9-3 14 0s9 3 14 0 9-3 14 0M2 23c5-3 9-3 14 0s9 3 14 0 9-3 14 0M2 32c5-3 9-3 14 0s9 3 14 0 9-3 14 0', 2);
    case 'laurelEdge': {
      let d = '';
      for (let t = 0; t <= 1.001; t += 0.125) d += `<ellipse cx="${(10.5 - 4.5 * t).toFixed(1)}" cy="${(8 + 32 * t).toFixed(1)}" rx="2.2" ry="4" transform="rotate(-25 ${(10.5 - 4.5 * t).toFixed(1)} ${(8 + 32 * t).toFixed(1)})"/><ellipse cx="${(37.5 + 4.5 * t).toFixed(1)}" cy="${(8 + 32 * t).toFixed(1)}" rx="2.2" ry="4" transform="rotate(25 ${(37.5 + 4.5 * t).toFixed(1)} ${(8 + 32 * t).toFixed(1)})"/>`;
      return d;
    }
    case 'diamondLattice': return s('M0 8l24 24 24-24M0 24l16 16M48 24L32 40M0 40L32 8M48 40L16 8', 1.8);
    case 'crownOfStars': return Array.from({ length: 7 }, (_, i) => { const a = Math.PI * (1.1 + (i / 6) * 0.8); return star(24 + 14 * Math.cos(a), 30 + 14 * Math.sin(a), 3.4); }).join('');
    default: return '';
  }
}

const sailSvg = (cloth: string, ink: string, pat: string) => {
  const id = `ps${++uid}`;
  return `<svg viewBox="0 0 48 48" aria-hidden="true"><defs><clipPath id="${id}"><path d="${SAIL}"/></clipPath></defs>${MAST}<path d="${SAIL}" fill="${cloth}" stroke="#3b2a1a" stroke-width="1.6" stroke-linejoin="round"/><g clip-path="url(#${id})" fill="${ink}" style="color:${ink}">${pat}</g><path d="${SAIL}" fill="none" stroke="#3b2a1a" stroke-width="2" stroke-linejoin="round"/></svg>`;
};

/** Figureheads the library has a charge for. */
const FIGURE: Record<string, EmblemId> = {
  heron: 'heron', stormPetrel: 'swift', narwhalTusk: 'narwhal', coiledEel: 'serpent', ammonite: 'nautilus', coralAntler: 'stag',
  iceShard: 'crystal', kelpCrown: 'fern', whaleFluke: 'whale', leapingDolphin: 'dolphin', emberBloom: 'flame', sunburst: 'sun',
  greatWhale: 'leviathan',
};

const charge = (id: EmblemId, colour = 'currentColor') => `<i class="p-art__charge" data-charge="${id}" style="color:${colour}"></i>`;

export interface ArtItem { id: string; kind: string; colour?: string }

/** Card art for a cosmetic, as markup. Call hydrate on the container once it is in the page. */
export function cosmeticArt(c: ArtItem): string {
  switch (c.kind) {
    case 'sailColour': return `<div class="p-art">${sailSvg(c.colour ?? '#e8dcc0', 'transparent', '')}</div>`;
    case 'sailPattern': return `<div class="p-art">${sailSvg('#efe2c2', '#a12a17', pattern(c.id))}</div>`;
    case 'hullPaint': return `<div class="p-art"><svg viewBox="0 0 48 48" aria-hidden="true"><path d="M2 22h44l-7 16H9z" fill="${c.colour ?? '#9a8f80'}" stroke="#2a1a0d" stroke-width="2" stroke-linejoin="round"/><path d="M5 27h38" stroke="rgba(255,255,255,.28)" stroke-width="2"/><path d="M9 33h30" stroke="rgba(0,0,0,.25)" stroke-width="2"/></svg></div>`;
    case 'wake': return `<div class="p-art p-art--water" style="color:${c.colour ?? '#fff'}"><svg viewBox="0 0 48 48" aria-hidden="true"><path d="M6 40c8-2 12-8 17-15s10-14 21-17" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><path d="M12 44c8-3 14-9 18-16s9-12 16-14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity=".6"/><circle cx="14" cy="28" r="2.4" fill="currentColor"/><circle cx="30" cy="38" r="2.8" fill="currentColor"/><circle cx="38" cy="26" r="1.8" fill="currentColor"/></svg></div>`;
    case 'figurehead': {
      const f = FIGURE[c.id];
      return `<div class="p-art p-art--ink">${f ? charge(f) : KIND_ICON.figurehead}</div>`;
    }
    case 'emblem': {
      const f = chargeOf(c.id);
      return `<div class="p-art p-art--ink">${f ? charge(f) : emblem(c.id)}</div>`;
    }
    default: return `<div class="p-art">${KIND_ICON[c.kind] ?? ''}</div>`;
  }
}

/** Fills in every charge mask under root. */
export function hydrate(root: Element): void {
  root.querySelectorAll<HTMLElement>('[data-charge]:not(.p-mask)').forEach((e) => maskInto(e, e.dataset.charge as EmblemId));
}
