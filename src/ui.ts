// The interface over the sea: the touch controls, the HUD of a match, and the screens around it (loading, the harbour,
// pause and settings, the chart, the results). Plain DOM over the canvas, in parchment and ink; per-frame updates write
// only what changed. Glyphs carry what they can, and words are kept for what they cannot.
import './ui.css';
import { makePaper, paperTile } from './paper.ts';
import * as THREE from 'three';
import { BIOMES, CELL, FLOW, HALF, PLACES, PLAY_R, RES, placeInfluence, sampleHeight, type World } from './world.ts';
import {
  GULL_COOLDOWN, GUST_RECHARGE, MAX_HULL, MAX_SHIELD, PARCELS, RARITY, SLOTS, STORM_PHASES, USES, WEAPONS,
  type GameEvent, type Item, type Match, type WeaponKind,
} from './game.ts';
import { PALETTE, type Look } from './gfx/ships.ts';
import { Globe } from './gfx/engine.ts';
import { CUT, INK, LANDMARKS, Territory, inkColor, type Perk } from './territory.ts';
import type { GullLook } from './gfx/creatures.ts';
import type { Stage } from './scene.ts';

makePaper();

const TAU = Math.PI * 2;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// ---------------------------------------------------------------- icons

const st = (d: string, w = 2.4) => `<path d="${d}" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const svg = (body: string, vb = '0 0 24 24') => `<svg viewBox="${vb}">${body}</svg>`;
export const ICON = {
  cannon: svg('<path d="M1.5 9.2h3l1.6 1.3h11.3l4.6-1.6v6.2l-4.6-1.6H6.1l-1.6 1.3h-3z"/><circle cx="8" cy="16.6" r="3.4"/>'),
  scatter: svg('<path d="M1.5 10.3h8.5l10-4.6v12.6l-10-4.6H1.5z"/><rect x="2.5" y="13.4" width="4.5" height="5.5" rx="1"/>'),
  harpoon: svg('<path d="M1 11.1h15v1.8H1z"/><path d="M14.5 7.2l8.5 4.8-8.5 4.8 2.4-4.8z"/><path d="M2.6 8.4l2.4 3.6-2.4 3.6H.8l2.4-3.6L.8 8.4z"/>'),
  mortar: svg('<path d="M6 15.2l6.4-10.6 5.4 3.3-6.4 10.6z"/><path d="M3 18.4h11.5V22H3z"/><ellipse cx="15.2" cy="6.2" rx="3.2" ry="1.5" transform="rotate(31 15.2 6.2)"/>'),
  repeater: svg('<rect x="3" y="5.6" width="18" height="2.8" rx="1.2"/><rect x="3" y="10.6" width="18" height="2.8" rx="1.2"/><rect x="3" y="15.6" width="18" height="2.8" rx="1.2"/><rect x="6" y="4" width="4" height="16" rx="1.2"/>'),
  glass: svg('<path d="M12 1.8l7.2 6.7L12 22.2 4.8 8.5z"/><path d="M12 1.8l3 6.7H9z" fill="rgba(243,230,196,.75)"/>'),
  pearl: svg('<circle cx="12" cy="12.5" r="8.2"/><circle cx="9.2" cy="9.4" r="2.5" fill="rgba(243,230,196,.85)"/>'),
  drift: svg('<path d="M2.8 15.6l14.6-10.4 3.8 4.4-14.6 10.4z"/><path d="M7 16.4l9-6.4M8.6 18.4l8.4-6" stroke="rgba(0,0,0,.35)" stroke-width="1.1"/>'),
  heart: svg('<circle cx="12" cy="12" r="9.4"/><circle cx="12" cy="12" r="6.2" fill="none" stroke="rgba(0,0,0,.35)" stroke-width="1.3"/><circle cx="12" cy="12" r="3" fill="none" stroke="rgba(0,0,0,.35)" stroke-width="1.3"/>'),
  gust: svg(st('M3 8.5h10.5a3 3 0 1 0-3-3') + st('M2 13h16a3 3 0 1 1-3 3') + st('M5 17.8h5')),
  reload: svg(st('M19.5 12.5a7.5 7.5 0 1 1-2.2-5.3', 2.8) + '<path d="M21 3v7h-7z"/>'),
  gull: svg('<path d="M1.2 9.3c3.6-1.6 6.8-.5 10.8 4.2 4-4.7 7.2-5.8 10.8-4.2-3 .3-6.6 2.5-10.8 7.8-4.2-5.3-7.8-7.5-10.8-7.8z"/>'),
  glimmer: svg('<path d="M12 1.2l2.7 8.1 8.1 2.7-8.1 2.7L12 22.8l-2.7-8.1L1.2 12l8.1-2.7z"/>'),
  sail: svg('<path d="M11 1.8v15H3.6z"/><path d="M12.6 4v12.8h7.4z"/><path d="M2.2 18.2h19.6L19 22H5z"/>'),
  target: svg(st('M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16M12 .8v5M12 18.2v5M.8 12h5M18.2 12h5') + '<circle cx="12" cy="12" r="2.4"/>'),
  storm: svg(st('M13.5 12a1.5 1.5 0 1 1-1.5-1.5a4 4 0 0 1 4 4a6.5 6.5 0 0 1-13 0a9 9 0 0 1 9-9', 2.2)),
  map: svg(st('M2 5.2l6.6-2.6 6.8 2.6 6.6-2.6v16.2l-6.6 2.6-6.8-2.6L2 21.4zM8.6 2.6v16.2M15.4 5.2v16.2', 2)),
  menu: svg('<rect x="3" y="5" width="18" height="2.8" rx="1.4"/><rect x="3" y="10.6" width="18" height="2.8" rx="1.4"/><rect x="3" y="16.2" width="18" height="2.8" rx="1.4"/>'),
  swap: svg(st('M4 8h14l-3.5-3.8M20 16H6l3.5 3.8', 2.6)),
  drop: svg(st('M12 2v12.5M6.5 9.5l5.5 6 5.5-6', 3) + st('M2 20.4c2.5-1.5 4.5-1.5 6.7 0s4.3 1.5 6.6 0 4.2-1.5 6.7 0', 2.2)),
  dive: svg(st('M5 4l7 6.5L19 4M5 12l7 6.5 7-6.5', 3)),
  sink: svg('<path d="M3 11.5l13.6 5.8 3-3.2-13.6-5.8z"/><path d="M8.6 8.8l3.2-7 2.6 8.6z"/>' + st('M1 21c2.5-1.3 4.5-1.3 7 0s4.5 1.3 7 0 4.5-1.3 7 0', 2)),
  ram: svg('<path d="M12 1.5l2.3 6.1 6.4-1.5-3.9 5.3 4.9 4.4-6.5.3L14 22.5 12 16.3l-2 6.2-1.2-6.4-6.5-.3 4.9-4.4-3.9-5.3 6.4 1.5z"/>'),
  // a quill nib, for the ink: trails, claims, cuts
  ink: svg('<path d="M20.5 2.5c-6.5 1-11 5.3-13.4 11.6l2.8 2.8C16.2 14.5 20.5 10 21.5 3.5z"/><path d="M7.1 14.1L3 21l6.9-4.1z"/>'),
  gear: svg('<path fill-rule="evenodd" d="M10.3 1.8h3.4l.5 2.6 1.9.8 2.2-1.5 2.4 2.4-1.5 2.2.8 1.9 2.6.5v3.4l-2.6.5-.8 1.9 1.5 2.2-2.4 2.4-2.2-1.5-1.9.8-.5 2.6h-3.4l-.5-2.6-1.9-.8-2.2 1.5-2.4-2.4 1.5-2.2-.8-1.9-2.6-.5v-3.4l2.6-.5.8-1.9-1.5-2.2 2.4-2.4 2.2 1.5 1.9-.8zM12 8.4a3.6 3.6 0 1 0 0 7.2a3.6 3.6 0 1 0 0-7.2z"/>'),
  close: svg(st('M5 5l14 14M19 5L5 19', 3)),
  clam: svg('<path d="M12 4C6 4 2 9 2 15h20c0-6-4-11-10-11z"/><path d="M4.5 16.6h15L17.6 20H6.4z"/>' + st('M12 5v9M7.5 6.5l2.5 7.5M16.5 6.5L14 14', 1.2)),
  crown: svg('<path d="M2.5 8l4.5 4 5-7 5 7 4.5-4-2 11h-15z"/>'),
  flower: svg('<circle cx="12" cy="6.5" r="4"/><circle cx="17.2" cy="10.3" r="4"/><circle cx="15.2" cy="16.4" r="4"/><circle cx="8.8" cy="16.4" r="4"/><circle cx="6.8" cy="10.3" r="4"/><circle cx="12" cy="12" r="3" fill="#ffd45a"/>'),
  cap: svg('<path d="M3 15c0-5 4-8.5 9-8.5s9 3.5 9 8.5z"/><path d="M2 15.5h20v3H2z"/>'),
  none: svg(st('M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M5.6 5.6l12.8 12.8', 2)),
  wave: svg(st('M2 13c2.5-2.5 5-2.5 7.5 0s5 2.5 7.5 0 3.5-2 5-1', 2.6)),
  hourglass: svg(st('M5.5 2.5h13M5.5 21.5h13M7.5 2.5c0 5.2 4.5 6 4.5 9.5s-4.5 4.3-4.5 9.5M16.5 2.5c0 5.2-4.5 6-4.5 9.5s4.5 4.3 4.5 9.5', 2) + '<path d="M9 19.6c.6-2.2 2-3 3-3.6 1 .6 2.4 1.4 3 3.6z"/>'),
  eye: svg(st('M1.8 12S5.6 5.2 12 5.2 22.2 12 22.2 12 18.4 18.8 12 18.8 1.8 12 1.8 12z', 2) + '<circle cx="12" cy="12" r="3.4"/>'),
  play: svg('<path d="M7 3.5l13 8.5-13 8.5z"/>'),
  leave: svg(st('M13.5 3.5H4.5v17h9M9.5 12h12M17.5 7.5l4.5 4.5-4.5 4.5', 2.4)),
  anchor: svg(st('M12 6v15M7.5 9.5h9M3.8 13.5c0 4.4 3.6 7.5 8.2 7.5s8.2-3.1 8.2-7.5', 2.4) + '<circle cx="12" cy="4" r="2.2" fill="none" stroke="currentColor" stroke-width="2"/>'),
  flag: svg(st('M5 2v20', 2.2) + '<path d="M6 3h13.5l-3.6 4.6 3.6 4.6H6z"/>'),
  hand: svg('<path d="M8.6 3a1.7 1.7 0 0 1 3.4 0v7.2l5.8.9c1.5.2 2.4 1.6 2.2 3l-1 5.6a3.2 3.2 0 0 1-3.1 2.6h-5.3a3.2 3.2 0 0 1-2.6-1.3l-4.4-5.8a1.7 1.7 0 0 1 2.6-2.1l2.4 2.2z"/>'),
  whale: svg('<path d="M12 21.5c0-4 .5-7.2 2-9.6 1.8 1 4.5 1.2 7.6.2-1.4-2.9-4-4.7-7.1-4.5C13.6 5.4 13 3.6 12 2c-1 1.6-1.6 3.4-2.5 5.6-3.1-.2-5.7 1.6-7.1 4.5 3.1 1 5.8.8 7.6-.2 1.5 2.4 2 5.6 2 9.6z"/>'),
  fleur: svg('<path d="M12 1.5c-2 2.6-3 5-1.6 8.3L12 13l1.6-3.2C15 6.5 14 4.1 12 1.5zM10.6 13.4C8.3 9.6 3.6 9.8 3 12.6c-.4 2 2 3.6 4 2.2-.4 2.2 1.2 3.4 3 2.6zM13.4 13.4c2.3-3.8 7-3.6 7.6-.8.4 2-2 3.6-4 2.2.4 2.2-1.2 3.4-3 2.6z"/><path d="M7.5 14.2h9v1.8h-9zM11 16h2v6.5h-2z"/>'),
};
/** What each landmark grants, as the glyph of what it improves. */
const PERK_ICON: Record<Perk, string> = { arch: ICON.reload, falls: ICON.heart, lagoon: ICON.gull, peak: ICON.cannon };
const PERK_PLACE: Record<Perk, string> = { arch: PLACES[8].name, falls: PLACES[7].name, lagoon: PLACES[0].name, peak: PLACES[5].name };
const EMBLEMS = [ICON.none, svg('<circle cx="12" cy="12" r="5"/>' + st('M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3M4.6 4.6l2.1 2.1M17.3 17.3l2.1 2.1M4.6 19.4l2.1-2.1M17.3 6.7l2.1-2.1', 2)),
  svg(st('M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16', 3.2)), svg('<path d="M15 3a9 9 0 1 0 6 15.5A7.5 7.5 0 1 1 15 3z"/>'), svg('<path d="M12 2l8 10-8 10-8-10z"/>'), ICON.wave,
  svg('<path d="M12 1.8l3 6.6 7.2.8-5.4 4.9 1.5 7.1L12 17.6l-6.3 3.6 1.5-7.1-5.4-4.9 7.2-.8z"/>')];
const pattern = (p: number, a: string, b: string) => svg(`<path d="M7 2.5h10.5L20 21.5H4z" fill="${a}"/>` + [
  '', `<path d="M6.2 7h12.2l.6 4.5H5.6zM5 15.5h14.6l.5 4H4.5z" fill="${b}"/>`, `<path d="M15 2.5h2.5L20 21.5h-4z" fill="${b}"/>`, `<path d="M10.6 2.5h3l.8 19h-4.6z" fill="${b}"/>`,
][p], '0 0 24 24');

const ITEM_ICON = (it: Item) => ICON[it.kind];
const PARCEL_ICON = [ICON.glass, ICON.harpoon, ICON.crown];
const RARITY_BG = ['#5d646d', '#3a8f2c', '#1f6fd0', '#7a35c4', '#c77a12'];
const RARITY_BG2 = ['#8a939e', '#5fc94a', '#46a3ff', '#ad65f2', '#ffbf3d'];

// ---------------------------------------------------------------- the profile

export interface Settings {
  name: string; sens: number; invert: boolean; autofire: boolean; leftFire: boolean; visualize: boolean; haptics: boolean;
  quality: 'battery' | 'balanced' | 'cinematic'; music: number; sfx: number;
}
export interface Profile {
  v: number; xp: number; wins: number; matches: number; kills: number; best: number;
  look: Look; gull: GullLook; settings: Settings; tips: string[];
}
export const SCARVES = [0, 0xd8443a, 0x2f6bd8, 0xf2c230, 0x2f9e64, 0xa04fd8, 0xff8ab0, 0x1d1d22, 0xffffff];
export const HATS: GullLook['hat'][] = ['none', 'cap', 'flower', 'crown'];

const KEY = 'tidefall.profile';
export function loadProfile(): Profile {
  const base: Profile = {
    v: 1, xp: 0, wins: 0, matches: 0, kills: 0, best: 0,
    look: { hull: PALETTE.hulls[2], accent: PALETTE.accents[2], trim: PALETTE.trims[0], sail: PALETTE.sails[0], sail2: PALETTE.sails[1], pattern: 1, emblem: 1, wisp: PALETTE.wisps[0] },
    gull: { scarf: SCARVES[1], hat: 'none' },
    settings: { name: 'Captain', sens: 1, invert: false, autofire: false, leftFire: true, visualize: true, haptics: true, quality: 'balanced', music: 0.6, sfx: 0.9 },
    tips: [],
  };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Profile>;
      return { ...base, ...p, look: { ...base.look, ...p.look }, gull: { ...base.gull, ...p.gull }, settings: { ...base.settings, ...p.settings }, tips: p.tips ?? [] };
    }
  } catch { /* a fresh profile */ }
  return base;
}
export function saveProfile(p: Profile): void {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* private browsing: progress lasts the session */ }
}

export function levelOf(xp: number): { level: number; into: number; need: number } {
  let level = 1, need = 700;
  while (xp >= need && level < 99) { xp -= need; level++; need = 700 + level * 100; }
  return { level, into: xp, need };
}

/** What can be worn, and from which level: a few of everything at once, more as you climb. The crown is for a win. */
type Part = 'hull' | 'accent' | 'trim' | 'sail' | 'sail2' | 'pattern' | 'emblem' | 'wisp' | 'scarf' | 'hat';
interface Opt { v: number | string; level: number; win?: boolean }
const gate = (vals: (number | string)[], free: number, start: number, step: number): Opt[] => vals.map((v, i) => ({ v, level: i < free ? 1 : start + (i - free) * step }));
const OPTIONS: Record<Part, Opt[]> = {
  hull: gate(PALETTE.hulls, 3, 2, 2),
  accent: gate(PALETTE.accents, 3, 3, 2),
  trim: gate(PALETTE.trims, 2, 4, 1),
  sail: gate(PALETTE.sails, 4, 2, 2),
  sail2: gate(PALETTE.sails, 4, 3, 2),
  pattern: gate([0, 1, 2, 3], 2, 3, 3),
  emblem: gate([0, 1, 2, 3, 4, 5, 6], 3, 4, 2),
  wisp: gate(PALETTE.wisps, 2, 2, 3),
  scarf: gate(SCARVES, 3, 2, 2),
  hat: [{ v: 'none', level: 1 }, { v: 'cap', level: 2 }, { v: 'flower', level: 5 }, { v: 'crown', level: 1, win: true }],
};
const unlocked = (o: Opt, p: Profile) => (o.win ? p.wins > 0 : levelOf(p.xp).level >= o.level);

export interface Summary { place: number; count: number; kills: number; dealt: number; glimmer: number; survived: number; win: boolean; killer: string | null }

/** The XP a match is worth, and what it unlocks. */
export function award(p: Profile, s: Summary): { total: number; before: number; unlocks: [Part, Opt][] } {
  const total = Math.round((s.count - s.place) * 14) + (s.win ? 500 : 0) + s.kills * 80 + Math.round(s.survived * 1.5) + Math.round(s.dealt / 4) + s.glimmer;
  const before = p.xp, l0 = levelOf(before).level, hadWin = p.wins > 0;
  p.xp += total;
  p.matches++;
  p.kills += s.kills;
  if (s.win) p.wins++;
  p.best = p.best ? Math.min(p.best, s.place) : s.place;
  const l1 = levelOf(p.xp).level;
  const unlocks: [Part, Opt][] = [];
  for (const [part, opts] of Object.entries(OPTIONS) as [Part, Opt[]][]) {
    for (const o of opts) if ((!o.win && o.level > l0 && o.level <= l1) || (o.win && s.win && !hadWin)) unlocks.push([part, o]);
  }
  return { total, before, unlocks };
}

/** How a choice looks on its swatch: a pooled colour, a sail pattern, an emblem, or a hat. */
function face(part: Part, v: number | string, p: Profile): string {
  if (part === 'pattern') return `<div class="ico">${pattern(v as number, hex(p.look.sail), hex(p.look.sail2))}</div>`;
  if (part === 'emblem') return `<div class="ico">${EMBLEMS[v as number]}</div>`;
  if (part === 'hat') return `<div class="ico">${ICON[v as 'none' | 'cap' | 'flower' | 'crown']}</div>`;
  if (part === 'scarf' && v === 0) return `<div class="ico">${ICON.none}</div>`;
  return `<div class="sw" style="background:${hex(v as number)}"></div>`;
}

// ---------------------------------------------------------------- small DOM helpers

const el = <T extends HTMLElement = HTMLDivElement>(cls: string, parent?: HTMLElement, html?: string, tag = 'div'): T => {
  const e = document.createElement(tag) as T;
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  parent?.appendChild(e);
  return e;
};
const cache = new WeakMap<object, Record<string, string>>();
function put(e: HTMLElement | SVGElement, key: string, v: string, apply: (v: string) => void): void {
  let c = cache.get(e);
  if (!c) cache.set(e, (c = {}));
  if (c[key] === v) return;
  c[key] = v;
  apply(v);
}
const text = (e: HTMLElement, v: string) => put(e, 'text', v, () => { e.textContent = v; });
const css = (e: HTMLElement | SVGElement, prop: string, v: string) => put(e, prop, v, () => { (e as HTMLElement).style.setProperty(prop, v); });
const cls = (e: HTMLElement, c: string, on: boolean) => { if (e.classList.contains(c) !== on) e.classList.toggle(c, on); };
const restart = (e: HTMLElement, c: string) => { e.classList.remove(c); void e.offsetWidth; e.classList.add(c); };

/** Haptics on the device; nothing in a browser. */
let buzz: (k: 'light' | 'medium' | 'heavy') => void = () => {};
async function initHaptics(): Promise<void> {
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (!Capacitor.isNativePlatform()) return;
    const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
    buzz = (k) => { Haptics.impact({ style: k === 'heavy' ? ImpactStyle.Heavy : k === 'medium' ? ImpactStyle.Medium : ImpactStyle.Light }).catch(() => {}); };
  } catch { /* no haptics here */ }
}

// ---------------------------------------------------------------- controls

/** Thumbs, mouse and keys, folded into one set of intents and written into the player's ship each frame. */
export class Controls {
  stick = { x: 0, y: 0 };
  look = { x: 0, y: 0 };
  lastLook = -99;
  fireIds = new Set<number>();
  mouseFire = false;
  diveHeld = false;
  gust = false; reload = false; swap = false; drop = false;
  select = -1; hail = -1;
  onTarget = false;
  sens = 1; invert = false; autofire = false;
  enabled = false;
  readonly keys = new Set<string>();
  private stickId = -1;
  private lookId = -1;
  private readonly last = new Map<number, { x: number; y: number }>();
  private origin = { x: 0, y: 0 };
  private readonly dir = new THREE.Vector3();
  private readonly layer: HTMLElement;
  private readonly stickEl: HTMLElement;
  private readonly knob: HTMLElement;

  constructor(layer: HTMLElement, stickEl: HTMLElement, onKey: (k: string, down: boolean) => void) {
    this.layer = layer;
    this.stickEl = stickEl;
    this.knob = el('knob', stickEl);
    layer.addEventListener('pointerdown', (e) => this.down(e));
    layer.addEventListener('pointermove', (e) => this.move(e));
    layer.addEventListener('pointerup', (e) => this.up(e));
    layer.addEventListener('pointercancel', (e) => this.up(e));
    layer.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== layer || !this.enabled) return;
      this.turn(e.movementX * 0.0022, e.movementY * 0.0022);
    });
    addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      const k = e.key.toLowerCase();
      if (k === 'tab' || k === ' ') e.preventDefault();
      if (e.repeat) return;
      this.keys.add(k);
      onKey(k, true);
    });
    addEventListener('keyup', (e) => { const k = e.key.toLowerCase(); this.keys.delete(k); onKey(k, false); });
    addEventListener('blur', () => this.release());
    this.rest();
  }

  get firing(): boolean {
    return this.fireIds.size > 0 || this.mouseFire;
  }

  release(): void {
    this.keys.clear();
    this.fireIds.clear();
    this.mouseFire = false;
    this.diveHeld = false;
    this.stickId = this.lookId = -1;
    this.stick.x = this.stick.y = 0;
    this.last.clear();
    this.rest();
  }

  turn(dx: number, dy: number): void {
    this.look.x += dx * this.sens;
    this.look.y += dy * this.sens * (this.invert ? -1 : 1);
    this.lastLook = performance.now() / 1000;
  }

  /** A finger that also turns the camera as it drags (the fire button aims as it shoots). */
  track(id: number, x: number, y: number): void {
    this.last.set(id, { x, y });
  }
  drag(id: number, x: number, y: number): void {
    const l = this.last.get(id);
    if (!l) return;
    this.turn((x - l.x) * 0.0056, (y - l.y) * 0.0046);
    l.x = x; l.y = y;
  }
  untrack(id: number): void {
    this.last.delete(id);
  }

  private down(e: PointerEvent): void {
    if (!this.enabled) return;
    if (e.pointerType === 'mouse') {
      if (document.pointerLockElement !== this.layer) {
        try { (this.layer.requestPointerLock as () => Promise<void> | void)()?.catch?.(() => {}); } catch { /* no lock: drag to look */ }
        this.track(e.pointerId, e.clientX, e.clientY);
        this.lookId = e.pointerId;
      }
      if (e.button === 0 && document.pointerLockElement === this.layer) this.mouseFire = true;
      return;
    }
    this.layer.setPointerCapture(e.pointerId);
    if (e.clientX < innerWidth * 0.42 && this.stickId < 0) {
      this.stickId = e.pointerId;
      this.origin = { x: e.clientX, y: e.clientY };
      this.place(e.clientX, e.clientY, 0, 0);
      cls(this.stickEl, 'live', true);
    } else if (this.lookId < 0) {
      this.lookId = e.pointerId;
      this.track(e.pointerId, e.clientX, e.clientY);
    }
  }

  private move(e: PointerEvent): void {
    if (e.pointerId === this.stickId) {
      const R = 62 * scale;
      let dx = e.clientX - this.origin.x, dy = e.clientY - this.origin.y;
      const d = Math.hypot(dx, dy);
      // past the rim the base follows the thumb
      if (d > R) { this.origin.x += dx * (1 - R / d); this.origin.y += dy * (1 - R / d); dx *= R / d; dy *= R / d; }
      this.stick.x = dx / R;
      this.stick.y = -dy / R;
      this.place(this.origin.x, this.origin.y, dx, dy);
    } else if (e.pointerId === this.lookId) {
      if (e.pointerType === 'mouse' && document.pointerLockElement === this.layer) return;
      this.drag(e.pointerId, e.clientX, e.clientY);
    }
  }

  private up(e: PointerEvent): void {
    if (e.pointerType === 'mouse' && e.button === 0) this.mouseFire = false;
    if (e.pointerId === this.stickId) { this.stickId = -1; this.stick.x = this.stick.y = 0; this.rest(); }
    if (e.pointerId === this.lookId) { this.lookId = -1; this.untrack(e.pointerId); }
  }

  private place(x: number, y: number, kx: number, ky: number): void {
    this.stickEl.style.left = `${x}px`;
    this.stickEl.style.top = `${y}px`;
    this.knob.style.transform = `translate(${kx}px, ${ky}px)`;
  }
  /** Where the stick waits, faintly, so a new player knows where the thumb goes. */
  rest(): void {
    cls(this.stickEl, 'live', false);
    this.place(150 * scale + 20, innerHeight - 160 * scale, 0, 0);
  }

  /** Writes this frame's intents into the player's ship. */
  apply(m: Match, stage: Stage, dt: number): void {
    const me = m.me, inp = me.input, rig = stage.rig;
    if (this.look.x || this.look.y) { rig.turn(this.look.x, this.look.y); this.look.x = this.look.y = 0; }
    let jx = this.stick.x, jy = this.stick.y;
    const k = this.keys;
    const kx = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0);
    const ky = (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0);
    if (kx || ky) { const l = Math.hypot(kx, ky); jx = kx / l; jy = ky / l; }
    const [sx, sz] = rig.steer(jx, jy);
    inp.steerX = sx;
    inp.steerZ = sz;
    // cruising, the camera swings round behind the bow; aiming, it stays where the player put it
    const idle = performance.now() / 1000 - this.lastLook > 1.4 && !this.firing;
    if (idle && me.alive && Math.hypot(jx, jy) > 0.2) {
      if (me.phase === 'sea') rig.follow(me.heading, dt, 0.6 * Math.min(1, me.speed / 8));
      else if (me.phase === 'glide') rig.follow(Math.atan2(me.vx, me.vz), dt, 0.5);
    }
    // the crosshair's ray bends with the globe: find where it meets the sea, and give the sim the straight flat ray there
    const cam = stage.camera, d = cam.getWorldDirection(this.dir), o = cam.position, p = new THREE.Vector3(), f = new THREE.Vector3();
    let L = 640;
    for (let s = 4; s < 640; s *= 1.07) {
      Globe.flat(p.copy(o).addScaledVector(d, s), f);
      if (f.y < Math.max(0, stage.ground(f.x, f.z))) { L = s; break; }
    }
    const a = Globe.flat(o, new THREE.Vector3()), b = Globe.flat(p.copy(o).addScaledVector(d, L), f).sub(a).normalize();
    inp.aimOrigin = [a.x, a.y, a.z];
    inp.aimDir = [b.x, b.y, b.z];
    inp.aimPoint = null;
    inp.fire = this.firing || (this.autofire && this.onTarget);
    inp.dive = this.diveHeld || k.has('shift');
    if (me.phase === 'gale' && this.drop) inp.drop = true;
    if (me.phase === 'sea') {
      if (this.gust) inp.gust = true;
      if (this.reload) inp.reload = true;
      if (this.swap) inp.swap = true;
      if (this.select >= 0) inp.select = this.select;
      if (this.hail >= 0) inp.hail = this.hail;
    }
    this.gust = this.reload = this.swap = this.drop = false;
    this.select = this.hail = -1;
  }
}

let scale = 1;

// ---------------------------------------------------------------- the chart

/** Watercolour for the land, laid thin on the paper. */
const WASH: Record<string, [number, number, number]> = {
  temperate: [150, 160, 98], blossom: [214, 150, 150], forest: [96, 124, 78], volcanic: [122, 102, 88], snow: [246, 242, 232],
  spires: [146, 146, 112], lush: [108, 150, 80], jade: [150, 188, 132], lagoon: [156, 170, 104],
};
const PAPER_RGB = [238, 223, 186], SHALLOW = [146, 190, 176], DEEP = [88, 134, 158], AGED = [206, 178, 128];
const FLEUR = 'M12 1.5c-2 2.6-3 5-1.6 8.3L12 13l1.6-3.2C15 6.5 14 4.1 12 1.5zM10.6 13.4C8.3 9.6 3.6 9.8 3 12.6c-.4 2 2 3.6 4 2.2-.4 2.2 1.2 3.4 3 2.6zM13.4 13.4c2.3-3.8 7-3.6 7.6-.8.4 2-2 3.6-4 2.2.4 2.2-1.2 3.4-3 2.6zM7.5 14.2h9v1.8h-9zM11 16h2v6.5h-2z';

/**
 * The sea as a portolan chart: water washed by depth and lined along every coast, land in watercolour with an
 * engraver's hatching on its shadowed slopes, rhumb lines fanning from a ring of winds, and a rose in the corner.
 */
function paintMap(world: World, size: number, R: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const img = g.createImageData(size, size);
  const e = (2 * R) / size;
  const mix = (a: number, b: number, k: number) => a + (b - a) * k;
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const x = -R + (i + 0.5) * e, z = -R + (j + 0.5) * e;
      const h = sampleHeight(world.heights, x, z);
      const gx = (sampleHeight(world.heights, x + e, z) - sampleHeight(world.heights, x - e, z)) / 2;
      const gz = (sampleHeight(world.heights, x, z + e) - sampleHeight(world.heights, x, z - e)) / 2;
      const gl = Math.max(1e-3, Math.hypot(gx, gz));
      // ink where the height crosses a level: a line of even width whatever the slope
      const line = (lv: number, w: number) => clamp(1 - Math.abs(h - lv) / gl / w, 0, 1);
      let r: number, gg: number, b: number, ink: number;
      if (h < 0.3) {
        const k = clamp(-h / 14, 0, 1), a = 0.36 + 0.34 * k;
        r = mix(PAPER_RGB[0], mix(SHALLOW[0], DEEP[0], k), a); gg = mix(PAPER_RGB[1], mix(SHALLOW[1], DEEP[1], k), a); b = mix(PAPER_RGB[2], mix(SHALLOW[2], DEEP[2], k), a);
        // water lines, fainter as they stand off the coast
        ink = Math.max(line(-0.9, 0.7) * 0.5, line(-2.4, 0.6) * 0.34, line(-4.6, 0.6) * 0.22, line(-7.8, 0.6) * 0.13);
      } else {
        const ix = clamp(Math.round((x + HALF) / CELL), 0, RES - 1), iz = clamp(Math.round((z + HALF) / CELL), 0, RES - 1);
        const w = h < 2.2 ? [228, 208, 154] : WASH[BIOMES[world.biome[iz * RES + ix]] ?? 'temperate'] ?? WASH.temperate;
        // lit from the north-west, as charts are
        const sx = gx / e, sz = gz / e, n = Math.hypot(sx, 1, sz);
        const lit = (sx * 0.62 + 0.75 + sz * 0.62) / n / 1.15;
        const dark = clamp((0.82 - lit) * 2.4, 0, 1);
        r = mix(PAPER_RGB[0], w[0], 0.62) * (1 - dark * 0.16); gg = mix(PAPER_RGB[1], w[1], 0.62) * (1 - dark * 0.16); b = mix(PAPER_RGB[2], w[2], 0.62) * (1 - dark * 0.16);
        // the engraver's hatching: strokes that thicken into the shadow, crossed where it is deepest
        const t1 = Math.abs(((i + j) % 3.4) / 3.4 - 0.5) * 2, t2 = Math.abs(((i - j + 4096) % 3.4) / 3.4 - 0.5) * 2;
        ink = Math.max(clamp((dark * 0.8 - t1) * 4, 0, 1) * 0.7, clamp(((dark - 0.5) * 1.3 - t2) * 4, 0, 1) * 0.55);
        const lv = Math.round(h / 16) * 16;
        if (lv > 0) ink = Math.max(ink, line(lv, 0.55) * 0.2);
      }
      ink = Math.max(ink, line(0.3, 1.05) * 0.95);
      // beyond the rim the paper browns and the ink fades: water no one has charted
      const out = clamp((Math.hypot(x, z) - PLAY_R - 20) / 100, 0, 1);
      r = mix(r, AGED[0], out * 0.45); gg = mix(gg, AGED[1], out * 0.45); b = mix(b, AGED[2], out * 0.45);
      ink *= 1 - out * 0.45;
      const o = (j * size + i) * 4;
      img.data[o] = mix(r, 42, ink); img.data[o + 1] = mix(gg, 28, ink); img.data[o + 2] = mix(b, 16, ink); img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  // the paper's grain through all of it
  g.globalAlpha = 0.4;
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = g.createPattern(paperTile(), 'repeat')!;
  g.fillRect(0, 0, size, size);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  // rhumb lines: sixteen winds from the centre and from sixteen points round it, principal winds in ink, half winds green
  const P = (v: number) => (v + R) / e, far = size * 1.6, u = size / 768;
  const hubs: [number, number][] = [[0, 0]];
  for (let k = 0; k < 16; k++) hubs.push([Math.cos((k / 16) * TAU) * PLAY_R * 0.74, Math.sin((k / 16) * TAU) * PLAY_R * 0.74]);
  g.lineWidth = 0.75 * u;
  for (let k = 0; k < 16; k++) {
    g.strokeStyle = k % 2 ? 'rgba(46, 104, 58, 0.2)' : 'rgba(42, 26, 13, 0.2)';
    g.beginPath();
    for (const [hx, hz] of hubs) { g.moveTo(P(hx), P(hz)); g.lineTo(P(hx) + Math.cos((k / 16) * TAU) * far, P(hz) + Math.sin((k / 16) * TAU) * far); }
    g.stroke();
  }
  // the currents, as a portolan shows them: a wash the width of the stream, a wavering line down it, and chevrons
  // pointing the way it runs
  g.lineCap = g.lineJoin = 'round';
  for (const line of world.currents) {
    g.strokeStyle = 'rgba(52, 104, 168, 0.16)';
    g.lineWidth = (FLOW.w * 1.5) / e;
    g.beginPath();
    line.forEach(([x, z], i) => (i ? g.lineTo(P(x), P(z)) : g.moveTo(P(x), P(z))));
    g.stroke();
    g.strokeStyle = 'rgba(36, 72, 132, 0.7)';
    g.lineWidth = 1.1 * u;
    g.beginPath();
    for (let i = 0; i < line.length; i++) {
      const [x, z] = line[i], [x2, z2] = line[Math.min(i + 1, line.length - 1)], [x0, z0] = line[Math.max(i - 1, 0)];
      const d = Math.hypot(x2 - x0, z2 - z0) || 1, w = Math.sin(i * 0.5) * 1.3 * u;
      const px = P(x) - ((z2 - z0) / d) * w, pz = P(z) + ((x2 - x0) / d) * w;
      if (i) g.lineTo(px, pz); else g.moveTo(px, pz);
    }
    g.stroke();
    g.lineWidth = 1.4 * u;
    for (let i = 8; i < line.length - 6; i += 12) {
      const [x, z] = line[i], [x2, z2] = line[i + 1], a = Math.atan2(z2 - z, x2 - x), l = 4.5 * u;
      g.beginPath();
      g.moveTo(P(x) + Math.cos(a + 2.5) * l, P(z) + Math.sin(a + 2.5) * l);
      g.lineTo(P(x), P(z));
      g.lineTo(P(x) + Math.cos(a - 2.5) * l, P(z) + Math.sin(a - 2.5) * l);
      g.stroke();
    }
  }
  rose(g, P(-R + 150), P(R - 150), 105 / e, u);
  return c;
}

/** A feathered arrow in lapis ink, flying the way the wind blows (a heading), its tail at (x, y). */
function windArrow(g: CanvasRenderingContext2D, x: number, y: number, dir: number, len: number, u: number): void {
  const dx = Math.sin(dir), dy = Math.cos(dir), nx = -dy, ny = dx, hx = x + dx * len, hy = y + dy * len;
  g.strokeStyle = g.fillStyle = '#24488a';
  g.lineCap = 'round';
  g.lineWidth = 1.5 * u;
  g.beginPath(); g.moveTo(x, y); g.lineTo(hx - dx * 3 * u, hy - dy * 3 * u); g.stroke();
  g.beginPath();
  g.moveTo(hx, hy); g.lineTo(hx - dx * 6 * u + nx * 3.2 * u, hy - dy * 6 * u + ny * 3.2 * u); g.lineTo(hx - dx * 6 * u - nx * 3.2 * u, hy - dy * 6 * u - ny * 3.2 * u);
  g.closePath(); g.fill();
  // the fletching: three pairs of barbs swept back from the tail
  g.lineWidth = 1 * u;
  for (let k = 0; k < 3; k++) {
    const bx = x + dx * k * 2.6 * u, by = y + dy * k * 2.6 * u;
    g.beginPath();
    g.moveTo(bx + (nx * 3 - dx * 2.6) * u, by + (ny * 3 - dy * 2.6) * u); g.lineTo(bx, by); g.lineTo(bx + (-nx * 3 - dx * 2.6) * u, by + (-ny * 3 - dy * 2.6) * u);
    g.stroke();
  }
}

/** A compass rose: thirty-two winds, the principal points shaded half in ink, north crowned with a fleur-de-lis. */
function rose(g: CanvasRenderingContext2D, cx: number, cy: number, R: number, u: number): void {
  g.save();
  g.translate(cx, cy);
  g.strokeStyle = '#2a1a0d';
  g.lineWidth = 1.1 * u;
  for (const r of [R * 0.9, R * 0.84]) { g.beginPath(); g.arc(0, 0, r, 0, TAU); g.stroke(); }
  for (let k = 0; k < 64; k++) {
    const a = (k / 64) * TAU, l = k % 2 ? 0.03 : 0.06;
    g.beginPath(); g.moveTo(Math.cos(a) * R * 0.84, Math.sin(a) * R * 0.84); g.lineTo(Math.cos(a) * R * (0.84 - l), Math.sin(a) * R * (0.84 - l)); g.stroke();
  }
  const point = (a: number, L: number, w: number, dark: string) => {
    const tx = Math.cos(a) * L, ty = Math.sin(a) * L, px = Math.cos(a + Math.PI / 2) * w, py = Math.sin(a + Math.PI / 2) * w;
    g.fillStyle = dark;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(tx, ty); g.lineTo(px, py); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#efe0bb';
    g.beginPath(); g.moveTo(0, 0); g.lineTo(tx, ty); g.lineTo(-px, -py); g.closePath(); g.fill(); g.stroke();
  };
  for (let k = 0; k < 16; k++) if (k % 2) point((k / 16) * TAU - Math.PI / 2, R * 0.5, R * 0.06, '#2e6a3a');
  for (let k = 0; k < 8; k++) if (k % 2) point((k / 8) * TAU - Math.PI / 2, R * 0.68, R * 0.1, '#2a1a0d');
  for (let k = 0; k < 4; k++) point((k / 4) * TAU - Math.PI / 2, R * 0.96, R * 0.13, k === 0 ? '#a3301c' : '#2a1a0d');
  g.fillStyle = '#a3301c';
  g.beginPath(); g.arc(0, 0, R * 0.05, 0, TAU); g.fill(); g.stroke();
  g.translate(-R * 0.12, -R * 1.22);
  g.scale(R * 0.01, R * 0.01);
  g.fill(new Path2D(FLEUR));
  g.restore();
}

const MAP_R = 640;

/** The storm's water on the chart: scored across with grey ink. */
const hatches = new WeakMap<CanvasRenderingContext2D, CanvasPattern>();
function stormHatch(g: CanvasRenderingContext2D, u: number): CanvasPattern {
  let p = hatches.get(g);
  if (p) return p;
  const s = Math.max(6, Math.round(7 * u)), c = document.createElement('canvas');
  c.width = c.height = s;
  const h = c.getContext('2d')!;
  h.fillStyle = 'rgba(70, 56, 82, 0.22)';
  h.fillRect(0, 0, s, s);
  h.strokeStyle = 'rgba(52, 38, 66, 0.6)';
  h.lineWidth = Math.max(1, u * 0.9);
  h.beginPath(); h.moveTo(-1, s + 1); h.lineTo(s + 1, -1); h.moveTo(-1, 1); h.lineTo(1, -1); h.moveTo(s - 1, s + 1); h.lineTo(s + 1, s - 1); h.stroke();
  p = g.createPattern(c, 'repeat')!;
  hatches.set(g, p);
  return p;
}

/** Every captain's water as a wash of their colour, a cell to a pixel; redrawn as it changes, a few times a second. */
class InkLayer {
  readonly c = document.createElement('canvas');
  private readonly g: CanvasRenderingContext2D;
  private readonly img: ImageData;
  private match: Match | null = null;
  private cols: number[][] = [];
  private ver = -1;
  private t = -1;

  constructor() {
    this.c.width = this.c.height = INK.n;
    this.g = this.c.getContext('2d')!;
    this.img = this.g.createImageData(INK.n, INK.n);
  }

  update(m: Match, now: number): void {
    if (m !== this.match) {
      this.match = m;
      this.ver = -1;
      this.cols = m.ships.map((s) => { const v = inkColor(s.id, m.player); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; });
    }
    const ink = m.ink;
    if (ink.version === this.ver || now - this.t < 0.25) return;
    this.ver = ink.version;
    this.t = now;
    const d = this.img.data, own = ink.owner, trail = ink.trail;
    for (let c = 0; c < own.length; c++) {
      const o = c * 4, id = trail[c] || own[c];
      if (!id) { d[o + 3] = 0; continue; }
      const col = this.cols[id - 1];
      d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = trail[c] ? 230 : 96;
    }
    this.g.putImageData(this.img, 0, 0);
  }
}
const inkLayer = new InkLayer();

/** A glyph as an image, for drawing on the chart. */
const glyphs = new Map<string, HTMLImageElement>();
function glyph(icon: string, color: string): HTMLImageElement {
  const key = icon + color;
  let im = glyphs.get(key);
  if (!im) {
    im = new Image();
    im.src = 'data:image/svg+xml,' + encodeURIComponent(icon.replace('<svg ', `<svg xmlns="http://www.w3.org/2000/svg" fill="${color}" `).replaceAll('currentColor', color));
    glyphs.set(key, im);
  }
  return im;
}

/** Draws the chart into a 2D context: a window of `span` metres around (cx, cz), or the whole sea. */
function drawMap(g: CanvasRenderingContext2D, W: number, base: HTMLCanvasElement, m: Match, stage: Stage, cx: number, cz: number, span: number, full: boolean, t: number): void {
  const k = W / (2 * span);
  const X = (x: number) => (x - cx) * k + W / 2, Z = (z: number) => (z - cz) * k + W / 2;
  const B = base.width / (2 * MAP_R);
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = '#d8c39a';
  g.fillRect(0, 0, W, W);
  g.drawImage(base, (cx - span + MAP_R) * B, (cz - span + MAP_R) * B, 2 * span * B, 2 * span * B, 0, 0, W, W);
  const me = m.me, s = m.storm, u = W / 200;
  // the captains' water
  inkLayer.update(m, t);
  g.imageSmoothingEnabled = true;
  g.drawImage(inkLayer.c, X(-INK.half), Z(-INK.half), 2 * INK.half * k, 2 * INK.half * k);
  // glimmer lanes: a dotted gold thread
  g.fillStyle = '#b8861c';
  for (const mo of m.motes) if (mo.t <= 0) { g.beginPath(); g.arc(X(mo.x), Z(mo.z), Math.max(1, 1.1 * u), 0, TAU); g.fill(); }
  // the storm: everything outside the eye scored grey, the eye's edge in red ink, the next eye dashed
  if (s.state !== 'idle') {
    g.beginPath();
    g.rect(0, 0, W, W);
    g.arc(X(s.x), Z(s.z), Math.max(0, s.r * k), 0, TAU, true);
    g.fillStyle = stormHatch(g, u);
    g.fill('evenodd');
    g.lineWidth = 1.8 * u;
    g.strokeStyle = '#8e2416';
    g.beginPath(); g.arc(X(s.x), Z(s.z), Math.max(0, s.r * k), 0, TAU); g.stroke();
    if (s.state === 'wait' || s.nr < s.r - 1) {
      g.strokeStyle = '#2a1a0d';
      g.lineWidth = 1.4 * u;
      g.setLineDash([4 * u, 2.5 * u]);
      g.beginPath(); g.arc(X(s.nx), Z(s.nz), Math.max(0, s.nr * k), 0, TAU); g.stroke();
      g.setLineDash([]);
    }
    // a course home when outside the coming eye
    if (me.alive && Math.hypot(me.x - s.nx, me.z - s.nz) > s.nr) {
      g.setLineDash([1.5 * u, 2.5 * u]);
      g.strokeStyle = '#2a1a0d';
      g.lineWidth = 1.3 * u;
      const a = Math.atan2(me.z - s.nz, me.x - s.nx);
      g.beginPath(); g.moveTo(X(me.x), Z(me.z)); g.lineTo(X(s.nx + Math.cos(a) * s.nr), Z(s.nz + Math.sin(a) * s.nr)); g.stroke();
      g.setLineDash([]);
    }
  }
  // the Gale's crossing
  const gl = m.gale;
  if (gl.t < gl.dur) {
    g.strokeStyle = '#2f64a8';
    g.lineWidth = 1.8 * u;
    g.setLineDash([5 * u, 3 * u]);
    g.beginPath(); g.moveTo(X(gl.ax), Z(gl.az)); g.lineTo(X(gl.bx), Z(gl.bz)); g.stroke();
    g.setLineDash([]);
    g.fillStyle = '#2f64a8';
    g.beginPath(); g.arc(X(gl.x), Z(gl.z), 3 * u, 0, TAU); g.fill();
  }
  // the leviathan, rising
  const lv = m.leviathan;
  if (lv.state === 'rising') {
    const p = 0.5 + 0.5 * Math.sin(t * 6);
    g.strokeStyle = `rgba(30, 110, 120, ${0.5 + p * 0.5})`;
    g.lineWidth = 1.6 * u;
    g.beginPath(); g.arc(X(lv.x), Z(lv.z), (6 + p * 4) * u, 0, TAU); g.stroke();
    const im = glyph(ICON.whale, '#1e6e78'), sz = 7 * u;
    if (im.complete) g.drawImage(im, X(lv.x) - sz / 2, Z(lv.z) - sz / 2, sz, sz);
  }
  if (full) {
    // landmarks: a medallion with what they grant, ringed in the colour of whoever holds the water
    for (const l of LANDMARKS) {
      const c = m.ink.cellAt(l.x, l.z), own = c >= 0 ? m.ink.owner[c] : 0, r = 5.5 * u;
      g.fillStyle = '#efe0bb';
      g.strokeStyle = own ? hex(inkColor(own - 1, m.player)) : '#2a1a0d';
      g.lineWidth = (own ? 2 : 1.2) * u;
      g.beginPath(); g.arc(X(l.x), Z(l.z), r, 0, TAU); g.fill(); g.stroke();
      const im = glyph(PERK_ICON[l.perk], '#2a1a0d');
      if (im.complete) g.drawImage(im, X(l.x) - r * 0.62, Z(l.z) - r * 0.62, r * 1.24, r * 1.24);
    }
    // the places, lettered in a chart hand
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `italic ${Math.round(6.4 * u)}px Fell, serif`;
    g.lineWidth = 3 * u;
    g.strokeStyle = 'rgba(238, 223, 186, 0.8)';
    g.fillStyle = '#2a1a0d';
    for (const p of PLACES) {
      // lettered above the place, or above its medallion when one sits close by
      let y = Z(p.z) - 9 * u;
      for (const l of LANDMARKS) if (Math.hypot(X(l.x) - X(p.x), Z(l.z) - Z(p.z)) < 16 * u) y = Math.min(y, Z(l.z) - 12 * u);
      g.strokeText(p.name, X(p.x), y);
      g.fillText(p.name, X(p.x), y);
    }
    // the wind, flying through the rose
    const rx = X(-MAP_R + 150), rz = Z(MAP_R - 150), rl = 24 * u;
    windArrow(g, rx - Math.sin(m.wind) * rl / 2, rz - Math.cos(m.wind) * rl / 2, m.wind, rl, u * 1.3);
    // the neat line round the chart
    g.strokeStyle = '#2a1a0d';
    g.lineWidth = 1.6 * u;
    g.strokeRect(2 * u, 2 * u, W - 4 * u, W - 4 * u);
    g.lineWidth = 0.7 * u;
    g.strokeRect(4.5 * u, 4.5 * u, W - 9 * u, W - 9 * u);
  }
  // you: the camera's wedge and a red-ink arrow
  const who = me.alive || stage.watch < 0 ? me : m.ships[stage.watch];
  const px = X(who.x), pz = Z(who.z);
  const yaw = stage.rig.yaw, fa = Math.atan2(Math.cos(yaw), Math.sin(yaw));
  const wedge = g.createRadialGradient(px, pz, 0, px, pz, 34 * u);
  wedge.addColorStop(0, 'rgba(42, 26, 13, 0.3)');
  wedge.addColorStop(1, 'rgba(42, 26, 13, 0)');
  g.fillStyle = wedge;
  g.beginPath(); g.moveTo(px, pz); g.arc(px, pz, 34 * u, fa - 0.55, fa + 0.55); g.closePath(); g.fill();
  g.translate(px, pz);
  g.rotate(Math.PI - who.heading);
  g.fillStyle = '#b3321c';
  g.strokeStyle = '#2a1a0d';
  g.lineWidth = 1.1 * u;
  g.beginPath();
  g.moveTo(0, -6.5 * u); g.lineTo(4.4 * u, 5 * u); g.lineTo(0, 2.6 * u); g.lineTo(-4.4 * u, 5 * u); g.closePath();
  g.fill(); g.stroke();
  g.setTransform(1, 0, 0, 1, 0, 0);
}

/** The minimap's bezel: a ring of parchment with the thirty-two winds ticked round it and north marked in red. */
function bezel(W: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = W;
  const g = c.getContext('2d')!, o = W / 2, R = W / 2 - 1, bw = W * 0.085, u = W / 200;
  g.lineWidth = bw;
  g.strokeStyle = g.createPattern(paperTile(), 'repeat')!;
  g.beginPath(); g.arc(o, o, R - bw / 2, 0, TAU); g.stroke();
  const burn = g.createRadialGradient(o, o, R - bw, o, o, R);
  burn.addColorStop(0, 'rgba(110, 58, 14, 0.35)'); burn.addColorStop(0.35, 'rgba(110, 58, 14, 0)'); burn.addColorStop(0.8, 'rgba(110, 58, 14, 0.1)'); burn.addColorStop(1, 'rgba(90, 44, 8, 0.6)');
  g.strokeStyle = burn;
  g.beginPath(); g.arc(o, o, R - bw / 2, 0, TAU); g.stroke();
  g.strokeStyle = '#2a1a0d';
  g.lineWidth = 1.8 * u;
  g.beginPath(); g.arc(o, o, R - u, 0, TAU); g.stroke();
  g.beginPath(); g.arc(o, o, R - bw, 0, TAU); g.stroke();
  g.lineWidth = 0.7 * u;
  g.beginPath(); g.arc(o, o, R - bw - 2.2 * u, 0, TAU); g.stroke();
  for (let k = 0; k < 32; k++) {
    const a = (k / 32) * TAU - Math.PI / 2, l = k % 8 === 0 ? 0.75 : k % 4 === 0 ? 0.55 : k % 2 === 0 ? 0.38 : 0.22;
    g.lineWidth = (k % 4 === 0 ? 1.4 : 0.8) * u;
    g.beginPath(); g.moveTo(o + Math.cos(a) * (R - 2 * u), o + Math.sin(a) * (R - 2 * u)); g.lineTo(o + Math.cos(a) * (R - bw * l - 2 * u), o + Math.sin(a) * (R - bw * l - 2 * u)); g.stroke();
  }
  g.fillStyle = '#a3301c';
  g.beginPath(); g.moveTo(o, 1.5 * u); g.lineTo(o + 4.5 * u, bw - 1.5 * u); g.lineTo(o - 4.5 * u, bw - 1.5 * u); g.closePath(); g.fill();
  return c;
}

// ---------------------------------------------------------------- the HUD

interface Num { el: HTMLDivElement; x: number; y: number; z: number; t: number; target: number; dmg: number; ox: number; live: boolean }
interface Ping { el: HTMLDivElement; a: number; t: number; live: boolean; kind: string }

const XHAIR: Record<WeaponKind | 'none', string> = {
  cannon: '<g class="tk"><path d="M0 -8 v-7"/><path d="M8 0 h7"/><path d="M0 8 v7"/><path d="M-8 0 h-7"/></g><circle r="1.8" fill="currentColor" stroke="none"/>',
  scatter: '<circle class="rg" r="16" fill="none"/><circle r="1.8" fill="currentColor" stroke="none"/>',
  harpoon: '<path d="M0 -26 v20 M0 6 v20 M-26 0 h20 M6 0 h20" stroke-width="1.6"/><path d="M0 -3 L3 0 L0 3 L-3 0 Z" fill="currentColor" stroke="none"/>',
  mortar: '<path d="M-14 4 Q0 16 14 4" fill="none"/><path d="M-20 0 h-8 M20 0 h8"/><circle r="2" fill="currentColor" stroke="none"/>',
  repeater: '<g class="tk"><path d="M0 -10 v-6"/><path d="M10 0 h6"/><path d="M0 10 v6"/><path d="M-10 0 h-6"/></g><circle r="1.5" fill="currentColor" stroke="none"/>',
  none: '<circle r="2" fill="currentColor" stroke="none"/>',
};
const FLOURISH = svg('<path d="M8 8C52 1 98 15 138 8M162 8c40-7 86 7 130 0"/><path d="M150 2.5l5.5 5.5-5.5 5.5-5.5-5.5z" fill="currentColor" stroke="none"/>', '0 0 300 16');
/** The sailable sea, for reckoning what share of it a captain holds. */
const SEA_AREA = Math.PI * PLAY_R * PLAY_R;

class Hud {
  readonly root: HTMLDivElement;
  readonly controls: Controls;
  private readonly profile: Profile;
  private readonly stage: Stage;
  private readonly sound: (k: string) => void;
  private readonly openMap: () => void;
  private readonly pause: () => void;
  // pieces
  private readonly xhair: HTMLDivElement;
  private xkind = '';
  private bloom = 0;
  private readonly reloadRing: HTMLDivElement;
  private readonly reloadArc: SVGCircleElement;
  private readonly hitmark: HTMLDivElement;
  private readonly nums: Num[] = [];
  private readonly tagsBox: HTMLDivElement;
  private readonly tags = new Map<number, { el: HTMLDivElement; sh: HTMLElement; hu: HTMLElement; t: number }>();
  private readonly dirs: { el: HTMLDivElement; a: number; t: number }[] = [];
  private readonly pings: Ping[] = [];
  private readonly use: HTMLDivElement;
  private readonly useArc: SVGCircleElement;
  private readonly useIco: HTMLDivElement;
  private readonly minimap: HTMLCanvasElement;
  private readonly mapG: CanvasRenderingContext2D;
  private ring: HTMLCanvasElement | null = null;
  private mapT = 0;
  readonly base: HTMLCanvasElement;
  private readonly chipStorm: HTMLDivElement;
  private readonly stormI: HTMLDivElement;
  private readonly stormT: HTMLElement;
  private readonly aliveT: HTMLElement;
  private readonly killsT: HTMLElement;
  private readonly compass: HTMLCanvasElement;
  private readonly compG: CanvasRenderingContext2D;
  private readonly glim: HTMLDivElement;
  private readonly glimT: HTMLElement;
  private readonly glimPlus: HTMLDivElement;
  private glimShown = 0;
  private glimPlusT = 0;
  private glimGain = 0;
  private readonly share: HTMLDivElement;
  private readonly shareT: HTMLElement;
  private shareShown = '';
  private readonly perksBox: HTMLDivElement;
  private perkMask = -1;
  private readonly banner: HTMLDivElement;
  private readonly bannerI: HTMLDivElement;
  private readonly bannerH: HTMLDivElement;
  private readonly queue: { icon: string; h: string; c: string }[] = [];
  private bannerT = 0;
  private readonly placeEl: HTMLDivElement;
  private readonly placeN: HTMLDivElement;
  private placeIdx = -1;
  private placeT = 0;
  private readonly feed: HTMLDivElement;
  private readonly toasts: HTMLDivElement;
  private readonly elim: HTMLDivElement;
  private readonly nudge: HTMLDivElement;
  private nudgeKey = '';
  private nudgeT = 0;
  private nudgeOn: HTMLElement | null = null;
  private readonly shieldFill: HTMLElement;
  private readonly shieldGhost: HTMLElement;
  private readonly hullFill: HTMLElement;
  private readonly hullGhost: HTMLElement;
  private readonly hullBar: HTMLDivElement;
  private readonly shieldV: HTMLElement;
  private readonly hullV: HTMLElement;
  private readonly slots: { el: HTMLDivElement; ico: HTMLDivElement; n: HTMLElement; rl: HTMLElement }[] = [];
  private readonly swapEl: HTMLDivElement;
  private readonly swapIco: HTMLDivElement;
  private readonly fire: HTMLDivElement;
  private readonly fireIco: HTMLDivElement;
  private readonly ammo: HTMLDivElement;
  private readonly fireL: HTMLDivElement;
  private readonly reload: HTMLDivElement;
  private readonly gust: HTMLDivElement;
  private readonly pips: HTMLElement[] = [];
  private readonly gullBtn: HTMLDivElement;
  private readonly gullCool: HTMLDivElement;
  private readonly gullBadge: HTMLDivElement;
  private readonly parcels: HTMLDivElement;
  private readonly parcelEls: { el: HTMLDivElement; cost: HTMLElement }[] = [];
  private readonly drop: HTMLDivElement;
  private readonly dive: HTMLDivElement;
  private readonly stickEl: HTMLDivElement;
  private readonly spectating: HTMLDivElement;
  private readonly spectT: HTMLElement;
  private lastHull = 100;
  private lastShield = 0;
  private readonly tmp = new THREE.Vector3();
  private time = 0;
  private seaT = 0;

  constructor(parent: HTMLElement, layer: HTMLElement, stage: Stage, profile: Profile, sound: (k: string) => void, openMap: () => void, pause: () => void) {
    this.stage = stage;
    this.profile = profile;
    this.sound = sound;
    this.openMap = openMap;
    this.pause = pause;
    const r = (this.root = el('hud', parent));
    this.stickEl = el('stick', r);
    this.controls = new Controls(layer, this.stickEl, (k, down) => this.key(k, down));

    // centre
    el('dirs', r);
    const sounds = el('sounds', r);
    this.xhair = el('xhair', r);
    this.reloadRing = el('reloadring', r, '<svg viewBox="0 0 84 84"><circle cx="42" cy="42" r="38" stroke="rgba(255,243,216,.25)"/><circle class="a" cx="42" cy="42" r="38" stroke="#fff3d8" stroke-dasharray="238.8" stroke-dashoffset="238.8" transform="rotate(-90 42 42)"/></svg>');
    this.reloadArc = this.reloadRing.querySelector('.a')!;
    this.hitmark = el('hitmark', r, '<i></i><i></i><i></i><i></i>');
    this.tagsBox = el('tags', r);
    const nums = el('nums', r);
    for (let i = 0; i < 28; i++) {
      const e = el<HTMLDivElement>('dmg num', nums);
      e.style.opacity = '0';
      this.nums.push({ el: e, x: 0, y: 0, z: 0, t: 0, target: -1, dmg: 0, ox: 0, live: false });
    }
    const dirs = r.querySelector('.dirs') as HTMLDivElement;
    for (let i = 0; i < 5; i++) this.dirs.push({ el: el('dir', dirs, svg('<path d="M-46 -128 A136 136 0 0 1 46 -128"/>', '-150 -150 300 300')), a: 0, t: 9 });
    for (let i = 0; i < 6; i++) this.pings.push({ el: el('snd', sounds), a: 0, t: 9, live: false, kind: '' });
    this.use = el('use', r, '<svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="22" stroke="rgba(255,243,216,.25)"/><circle class="a" cx="26" cy="26" r="22" stroke="#fff3d8" stroke-dasharray="138.2" stroke-dashoffset="138.2" transform="rotate(-90 26 26)"/></svg><div class="ico"></div>');
    this.useArc = this.use.querySelector('.a')!;
    this.useIco = this.use.querySelector('.ico')!;
    this.elim = el('elim', r, `<div class="i">${ICON.sink}</div><div class="n over"></div>`);
    this.nudge = el('nudge', el('nudges', r), `<div class="hand">${ICON.hand}</div>`);

    // top
    const tl = el('topleft', r);
    const pauseBtn = el('rb tap pausebtn', r, `<div class="ico">${ICON.menu}</div>`);
    this.press(pauseBtn, () => this.pause());
    const purse = el('purse pp', tl);
    this.glim = el('glim num', purse, `<div class="i">${ICON.glimmer}</div><span>0</span>`);
    this.glimT = this.glim.querySelector('span')!;
    this.share = el('share num', purse, `<div class="i">${ICON.flag}</div><span>0%</span>`);
    this.shareT = this.share.querySelector('span')!;
    this.glimPlus = el('glimplus num over', tl);
    this.perksBox = el('perks', tl);
    const cw = el('compass pp', r);
    this.compass = el<HTMLCanvasElement>('', cw, undefined, 'canvas');
    this.compG = this.compass.getContext('2d')!;
    this.banner = el('banner pp', r, '<div class="i"></div><div class="h"></div>');
    this.bannerI = this.banner.querySelector('.i')!;
    this.bannerH = this.banner.querySelector('.h')!;
    this.placeEl = el('place', r, `<div class="n over"></div><div class="f">${FLOURISH}</div>`);
    this.placeN = this.placeEl.querySelector('.n')!;
    this.spectating = el('spectating pp', r, `<div class="i">${ICON.eye}</div><span></span>`);
    this.spectT = this.spectating.querySelector('span')!;

    const mb = el('mapbox', r);
    const mm = el('minimap tap', mb);
    this.minimap = el<HTMLCanvasElement>('', mm, undefined, 'canvas');
    this.mapG = this.minimap.getContext('2d')!;
    this.press(mm, () => this.openMap());
    this.base = paintMap(stage.world, 768, MAP_R);
    const chips = el('chips pp', mb);
    this.chipStorm = el('chip storm num', chips, `<div class="i">${ICON.hourglass}</div><span>0:00</span>`);
    this.stormI = this.chipStorm.querySelector('.i')!;
    this.stormT = this.chipStorm.querySelector('span')!;
    const ca = el('chip num', chips, `<div class="i">${ICON.sail}</div><span>24</span>`);
    this.aliveT = ca.querySelector('span')!;
    const ck = el('chip num', chips, `<div class="i">${ICON.sink}</div><span>0</span>`);
    this.killsT = ck.querySelector('span')!;
    this.feed = el('feed', r);
    this.toasts = el('toasts', r);

    // bottom
    const bottom = el('bottom', r);
    this.swapEl = el('swap pp tap', r, `<div class="ico"></div><div class="arr">${ICON.swap}</div><span class="key num">E</span>`);
    this.swapIco = this.swapEl.querySelector('.ico')!;
    this.press(this.swapEl, () => { this.controls.swap = true; });
    const vit = el('vitals pp', bottom);
    const sb = el('bar shield', vit, '<i class="ghost"></i><i class="fill"></i><div class="seg"></div><span class="v num"></span>');
    const hb = (this.hullBar = el('bar hull', vit, '<i class="ghost"></i><i class="fill"></i><span class="v num"></span>'));
    this.shieldFill = sb.querySelector('.fill')!; this.shieldGhost = sb.querySelector('.ghost')!; this.shieldV = sb.querySelector('.v')!;
    this.hullFill = hb.querySelector('.fill')!; this.hullGhost = hb.querySelector('.ghost')!; this.hullV = hb.querySelector('.v')!;
    const bar = el('hotbar', bottom);
    for (let i = 0; i < SLOTS; i++) {
      const s = el('slot tap', bar, `<div class="ico"></div><span class="k num">${i + 1}</span><span class="n num"></span><i class="gem"></i><i class="rl"></i><i class="empty"></i>`);
      this.slots.push({ el: s, ico: s.querySelector('.ico')!, n: s.querySelector('.n')!, rl: s.querySelector('.rl')! });
      this.press(s, () => { this.controls.select = i; this.sound('tap'); });
    }

    // actions
    this.fire = el('rb tap fire', r, `<div class="ico"></div><div class="ammo num over"></div>`);
    this.fireIco = this.fire.querySelector('.ico')!;
    this.ammo = this.fire.querySelector('.ammo')!;
    this.hold(this.fire);
    this.fireL = el('rb tap firel', r, `<div class="ico">${ICON.target}</div>`);
    this.hold(this.fireL);
    this.reload = el('rb tap reload', r, `<div class="ico">${ICON.reload}</div>`);
    this.press(this.reload, () => { this.controls.reload = true; });
    this.gust = el('rb tap gust', r, `<div class="pips"><div class="pip"><i></i></div><div class="pip"><i></i></div></div><div class="ico">${ICON.gust}</div>`);
    this.gust.querySelectorAll<HTMLElement>('.pip i').forEach((p) => this.pips.push(p));
    this.press(this.gust, () => { this.controls.gust = true; });
    this.gullBtn = el('rb tap gull', r, `<div class="cool"></div><div class="ico">${ICON.gull}</div><div class="badge num" style="display:none"></div>`);
    this.gullCool = this.gullBtn.querySelector('.cool')!;
    this.gullBadge = this.gullBtn.querySelector('.badge')!;
    this.press(this.gullBtn, () => this.toggleParcels());
    this.parcels = el('parcels', r);
    PARCELS.forEach((p, i) => {
      const e = el('parcel pp tap', this.parcels, `<div class="ico">${PARCEL_ICON[i]}</div><div class="cost num"><div class="i">${ICON.glimmer}</div><span>${p.cost}</span></div>`);
      e.style.setProperty('--c', RARITY_BG2[i + 2] + '88');
      this.press(e, () => { const m = this.profileMatch; if (m && m.me.glimmer >= m.parcelCost(m.me, i)) { this.controls.hail = i; this.sound('hail'); } else this.sound('deny'); cls(this.parcels, 'on', false); });
      this.parcelEls.push({ el: e, cost: e.querySelector('.cost span')! });
    });
    this.drop = el('rb tap drop gone', r, `<div class="ico">${ICON.drop}</div>`);
    this.press(this.drop, () => { this.controls.drop = true; });
    this.dive = el('rb tap dive gone', r, `<div class="ico">${ICON.dive}</div>`);
    this.dive.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.controls.diveHeld = true; cls(this.dive, 'down', true); this.dive.setPointerCapture(e.pointerId); });
    const undive = () => { this.controls.diveHeld = false; cls(this.dive, 'down', false); };
    this.dive.addEventListener('pointerup', undive);
    this.dive.addEventListener('pointercancel', undive);
    this.resize();
  }

  private profileMatch: Match | null = null;

  /** A tap: fires on the press, for snappy buttons. */
  private press(e: HTMLElement, fn: () => void): void {
    e.addEventListener('pointerdown', (ev) => {
      ev.stopPropagation();
      cls(e, 'down', true);
      fn();
      buzz('light');
    });
    const up = () => cls(e, 'down', false);
    e.addEventListener('pointerup', up);
    e.addEventListener('pointercancel', up);
    e.addEventListener('pointerleave', up);
  }

  /** A fire button: held to fire, and dragging it aims. */
  private hold(e: HTMLElement): void {
    e.addEventListener('pointerdown', (ev) => {
      ev.stopPropagation();
      e.setPointerCapture(ev.pointerId);
      this.controls.fireIds.add(ev.pointerId);
      this.controls.track(ev.pointerId, ev.clientX, ev.clientY);
      cls(e, 'down', true);
    });
    e.addEventListener('pointermove', (ev) => { if (this.controls.fireIds.has(ev.pointerId)) this.controls.drag(ev.pointerId, ev.clientX, ev.clientY); });
    const up = (ev: PointerEvent) => { this.controls.fireIds.delete(ev.pointerId); this.controls.untrack(ev.pointerId); cls(e, 'down', false); };
    e.addEventListener('pointerup', up);
    e.addEventListener('pointercancel', up);
  }

  private toggleParcels(force?: boolean): void {
    const m = this.profileMatch;
    if (!m || m.me.gull !== 'home') { this.sound('deny'); return; }
    const on = force ?? !this.parcels.classList.contains('on');
    cls(this.parcels, 'on', on);
    this.sound('tap');
  }

  private key(k: string, down: boolean): void {
    const c = this.controls;
    if (!down || !c.enabled) return;
    const m = this.profileMatch;
    if (k === ' ') { if (m?.me.phase === 'gale') c.drop = true; else c.gust = true; }
    else if (k === 'r') c.reload = true;
    else if (k === 'e' || k === 'f') c.swap = true;
    else if (k === 'g' || k === 'q') this.toggleParcels();
    else if (k === 'm' || k === 'tab') this.openMap();
    else if (k === 'escape' || k === 'p') this.pause();
    else if (k >= '1' && k <= '5') {
      const i = Number(k) - 1;
      if (this.parcels.classList.contains('on') && i < 3) { this.parcelEls[i].el.dispatchEvent(new PointerEvent('pointerdown')); return; }
      c.select = i;
    }
  }

  resize(): void {
    const dpr = Math.min(2, devicePixelRatio || 1);
    const mw = Math.round(196 * scale * dpr);
    this.minimap.width = this.minimap.height = mw;
    this.ring = null;
    this.compass.width = Math.round(400 * scale * dpr);
    this.compass.height = Math.round(40 * scale * dpr);
    this.controls.rest();
  }

  // ---------------------------------------------------------------- a match

  start(m: Match): void {
    this.profileMatch = m;
    this.lastHull = 100; this.lastShield = 0;
    this.glimShown = 0;
    this.shareShown = '';
    this.perkMask = -1;
    this.placeIdx = -1;
    this.seaT = 0;
    this.feed.innerHTML = '';
    this.toasts.innerHTML = '';
    this.queue.length = 0;
    this.bannerT = 0;
    this.endNudge(false);
    cls(this.banner, 'on', false);
    cls(this.parcels, 'on', false);
    for (const t of this.tags.values()) t.el.remove();
    this.tags.clear();
    for (const n of this.nums) { n.live = false; n.el.style.opacity = '0'; }
    const c = this.controls, s = this.profile.settings;
    c.sens = s.sens; c.invert = s.invert; c.autofire = s.autofire;
    c.release();
    c.enabled = true;
    cls(this.fireL, 'gone', !s.leftFire);
    cls(this.root, 'on', true);
  }

  stop(): void {
    this.controls.enabled = false;
    this.controls.release();
    this.profileMatch = null;
    this.endNudge(false);
    cls(this.root, 'on', false);
    if (document.pointerLockElement) document.exitPointerLock();
  }

  /** A ribbon across the top, a glyph and a few words: one at a time, in order. */
  say(icon: string, h: string, c = 'var(--ink)'): void {
    if (this.queue.some((q) => q.h === h)) return;
    this.queue.push({ icon, h, c });
  }

  /** A slip at the side: a glyph and a count, no more. */
  toast(icon: string, text: string, color = 'var(--ink)'): void {
    const t = el('toast pp', this.toasts, `<div class="i">${icon}</div>${text ? `<span class="num">${text}</span>` : ''}`);
    t.style.setProperty('--c', color);
    setTimeout(() => t.remove(), 2700);
    while (this.toasts.children.length > 4) this.toasts.firstElementChild!.remove();
  }

  private kill(e: Extract<GameEvent, { t: 'elim' }>, m: Match): void {
    const v = m.ships[e.victim], k = e.killer >= 0 ? m.ships[e.killer] : null;
    const row = el('kill pp', this.feed);
    if (k && e.kind !== 'storm') row.innerHTML = `<span>${esc(k.name)}</span><div class="i">${ICON[e.kind]}</div><span>${esc(v.name)}</span>`;
    else row.innerHTML = `<div class="i">${ICON.storm}</div><span>${esc(v.name)}</span>`;
    cls(row, 'me', e.killer === m.player);
    cls(row, 'mine', e.victim === m.player);
    setTimeout(() => { row.style.opacity = '0'; setTimeout(() => row.remove(), 600); }, 7000);
    while (this.feed.children.length > 4) this.feed.firstElementChild!.remove();
  }

  /** The first time something is worth trying, a ring breathes round its control. Each is shown once, ever. */
  private nudge1(key: string, target: HTMLElement, when: boolean, thumb = false): void {
    if (!when || this.nudgeKey || this.profile.tips.includes(key)) return;
    this.nudgeKey = key;
    this.nudgeT = 0;
    this.nudgeOn = target;
    cls(this.nudge, 'thumb', thumb);
    cls(this.nudge, 'on', true);
  }

  private endNudge(learnt: boolean): void {
    if (learnt && this.nudgeKey) { this.profile.tips.push(this.nudgeKey); saveProfile(this.profile); }
    this.nudgeKey = '';
    this.nudgeOn = null;
    cls(this.nudge, 'on', false);
  }

  /** The HUD for one frame. */
  frame(m: Match, events: readonly GameEvent[], dt: number): void {
    this.time += dt;
    const me = m.me, W = innerWidth, H = innerHeight, t = this.time;
    const stage = this.stage;
    // ---------------------------------------- events
    for (const e of events) {
      switch (e.t) {
        case 'hit': {
          if (e.src === m.player && e.target !== m.player) {
            const blue = e.shield > 0 && e.hull <= 0;
            this.hitmark.style.setProperty('--c', e.crit ? '#f4cf6e' : blue ? '#a9d0ff' : '#fff3d8');
            restart(this.hitmark, 'go');
            this.number(e.target, e.x, e.y, e.z, e.dmg, e.crit, blue);
            this.tagHit(e.target);
            buzz(e.crit ? 'medium' : 'light');
          }
          if (e.target === m.player && e.kind !== 'storm' && e.src >= 0) {
            const s = m.ships[e.src];
            const yaw = stage.rig.yaw, dx = s.x - me.x, dz = s.z - me.z;
            const a = Math.atan2(dx * -Math.cos(yaw) + dz * Math.sin(yaw), dx * Math.sin(yaw) + dz * Math.cos(yaw));
            const d = this.dirs.find((q) => q.t > 1.2) ?? this.dirs[0];
            d.a = a; d.t = 0;
            buzz('heavy');
            this.nudge1('gust', this.gust, me.gusts > 0);
          }
          break;
        }
        case 'elim':
          this.kill(e, m);
          if (e.killer === m.player && e.victim !== m.player) {
            restart(this.hitmark, 'kill');
            const n = this.elim.querySelector('.n')!;
            n.textContent = m.ships[e.victim].name;
            restart(this.elim, 'go');
            buzz('heavy');
          }
          if (stage.watch === e.victim) stage.watch = e.killer >= 0 && m.ships[e.killer].alive ? e.killer : this.nextAlive(m);
          break;
        case 'pickup':
          if (e.ship === m.player) this.toast(ITEM_ICON(e.item), e.item.type === 'use' && e.item.count > 1 ? `×${e.item.count}` : '', RARITY_BG[e.item.rarity]);
          break;
        case 'fire':
          if (e.ship !== m.player && this.profile.settings.visualize) this.ping(m, m.ships[e.ship].x, m.ships[e.ship].z, 'fire', 170);
          break;
        case 'storm': {
          const ph = STORM_PHASES[e.phase];
          if (e.state === 'wait') {
            if (e.phase === 0) this.say(ICON.storm, 'The storm gathers');
            else if (ph.r <= 10) this.say(ICON.crown, 'The last eye', 'var(--gold)');
            else this.say(ICON.storm, 'The eye moves');
          } else this.say(ICON.storm, 'The storm closes', 'var(--rubric)');
          break;
        }
        case 'leviathan':
          if (e.state === 'rising') this.say(ICON.whale, 'A leviathan stirs', '#1e6e78');
          break;
        case 'stunt':
          if (e.ship === m.player) {
            if (e.kind === 'arch') this.say(ICON.glimmer, PLACES[8].name, 'var(--gold)');
            else this.say(ICON.glass, 'Blessed by the falls', 'var(--lapis)');
          }
          break;
        case 'hail':
          if (e.ship === m.player) this.toast(ICON.gull, '', RARITY_BG[e.tier + 2]);
          break;
        case 'mote':
          if (e.ship === m.player) { this.glimGain++; this.glimPlusT = 1.2; }
          break;
        case 'claim':
          if (e.ship === m.player && e.cells > 0) {
            this.glimGain += Territory.pay(e.cells);
            this.glimPlusT = 1.6;
            restart(this.share, 'bump');
            if (e.perk) this.say(PERK_ICON[e.perk], PERK_PLACE[e.perk], 'var(--gold)');
          }
          break;
        case 'lost':
          if (e.ship === m.player) this.toast(PERK_ICON[e.perk], '✕', 'var(--rubric)');
          break;
        case 'cut':
          if (e.by === m.player) { this.glimGain += CUT.glimmer; this.glimPlusT = 1.2; restart(this.hitmark, 'kill'); buzz('heavy'); }
          if (e.victim === m.player) { buzz('heavy'); this.toast(ICON.ink, '✕', 'var(--rubric)'); }
          break;
        case 'clam':
          if (e.ship === m.player) { this.glimGain += 4; this.glimPlusT = 1.2; }
          break;
        case 'splash':
          if (e.ship === m.player) { cls(this.parcels, 'on', false); this.seaT = 0; }
          break;
      }
    }

    // ---------------------------------------- phase and buttons
    const sea = me.alive && me.phase === 'sea', gale = me.alive && me.phase === 'gale', glide = me.alive && me.phase === 'glide';
    if (sea) this.seaT += dt;
    cls(this.drop, 'gone', !gale);
    cls(this.dive, 'gone', !glide);
    for (const b of [this.fire, this.reload, this.gust, this.gullBtn]) cls(b, 'gone', !sea);
    cls(this.fireL, 'gone', !sea || !this.profile.settings.leftFire);
    cls(this.swapEl, 'gone', !sea);
    if (!sea) cls(this.parcels, 'on', false);
    cls(this.root, 'dead', !me.alive);

    // vitals
    const hk = clamp(me.hull / MAX_HULL, 0, 1), sk = clamp(me.shield / MAX_SHIELD, 0, 1);
    css(this.hullFill, 'transform', `scaleX(${hk.toFixed(3)})`);
    css(this.shieldFill, 'transform', `scaleX(${sk.toFixed(3)})`);
    if (me.hull > this.lastHull || me.shield > this.lastShield) { css(this.hullGhost, 'transform', `scaleX(${hk.toFixed(3)})`); css(this.shieldGhost, 'transform', `scaleX(${sk.toFixed(3)})`); }
    else { css(this.hullGhost, 'transform', `scaleX(${clamp(this.lastHull / MAX_HULL, hk, 1).toFixed(3)})`); css(this.shieldGhost, 'transform', `scaleX(${clamp(this.lastShield / MAX_SHIELD, sk, 1).toFixed(3)})`); }
    // the ghost drains after a beat
    if (Math.random() < dt * 2) { this.lastHull = me.hull; this.lastShield = me.shield; }
    text(this.hullV, String(Math.ceil(me.hull)));
    text(this.shieldV, me.shield > 0 ? String(Math.ceil(me.shield)) : '');
    cls(this.hullBar, 'low', me.hull < 30);

    // hotbar
    const w = m.weaponOf(me);
    for (let i = 0; i < SLOTS; i++) {
      const it = me.slots[i], s = this.slots[i];
      cls(s.el, 'full', !!it);
      cls(s.el, 'sel', !!it && it.type === 'weapon' && me.sel === i);
      cls(s.el, 'using', me.useSlot === i);
      if (it) {
        put(s.el, 'kind', `${it.kind}${it.rarity}`, () => { s.ico.innerHTML = ITEM_ICON(it); s.el.style.setProperty('--c1', RARITY_BG[it.rarity]); s.el.style.setProperty('--c2', RARITY_BG2[it.rarity] + '70'); });
        text(s.n, it.type === 'weapon' ? String(it.ammo) : `×${it.count}`);
        cls(s.el, 'dry', it.type === 'weapon' && it.ammo <= 0);
      } else { put(s.el, 'kind', '', () => { s.ico.innerHTML = ''; }); text(s.n, ''); cls(s.el, 'dry', false); }
      const rel = it && it.type === 'weapon' && me.sel === i && me.reloadT > 0 ? 1 - me.reloadT / (WEAPONS[it.kind].reload * RARITY[it.rarity].reload) : 0;
      css(s.rl, 'transform', `scaleX(${rel.toFixed(3)})`);
    }

    // fire button and crosshair
    const kind = w ? w.kind : 'none';
    put(this.fire, 'w', kind, () => { this.fireIco.innerHTML = w ? ICON[w.kind] : ICON.target; });
    text(this.ammo, w && me.reloadT <= 0 ? String(w.ammo) : '');
    cls(this.fire, 'off', !w);
    cls(this.reload, 'off', !w || w.ammo >= WEAPONS[w.kind].mag || me.reloadT > 0);
    if (this.xkind !== kind) { this.xkind = kind; this.xhair.innerHTML = `<svg viewBox="-32 -32 64 64" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">${XHAIR[kind as WeaponKind]}</svg>`; }
    for (const e of events) if (e.t === 'fire' && e.ship === m.player) this.bloom = Math.min(1, this.bloom + (kind === 'repeater' ? 0.12 : 0.45));
    this.bloom = Math.max(0, this.bloom - dt * 3);
    const spread = (me.boostT > 0 ? 6 : 0) + this.bloom * 8 + (me.speed > 10 ? 2 : 0);
    const tk = this.xhair.querySelector<SVGGElement>('.tk');
    if (tk) tk.querySelectorAll('path').forEach((p, i) => css(p, 'transform', `translate(${[0, 1, 0, -1][i] * spread}px, ${[-1, 0, 1, 0][i] * spread}px)`));
    const rg = this.xhair.querySelector<SVGCircleElement>('.rg');
    if (rg) put(rg, 'r', (16 + spread).toFixed(1), (v) => rg.setAttribute('r', v));
    this.controls.onTarget = sea && !!w && this.aimedAt(m) >= 0;
    cls(this.xhair, 'foe', this.controls.onTarget);
    cls(this.fire, 'hot', this.controls.onTarget);
    css(this.xhair, 'opacity', sea ? '1' : '0');
    const reloading = sea && w && me.reloadT > 0;
    cls(this.reloadRing, 'on', !!reloading);
    if (reloading && w) { const f = 1 - me.reloadT / (WEAPONS[w.kind].reload * RARITY[w.rarity].reload); put(this.reloadArc, 'o', (238.8 * (1 - f)).toFixed(1), (v) => this.reloadArc.setAttribute('stroke-dashoffset', v)); }

    // mending
    const using = me.useSlot >= 0 ? me.slots[me.useSlot] : null;
    cls(this.use, 'on', !!using && sea);
    if (using && using.type === 'use') {
      const u = USES[using.kind], f = clamp(me.useT / u.time, 0, 1);
      put(this.useArc, 'o', (138.2 * (1 - f)).toFixed(1), (v) => this.useArc.setAttribute('stroke-dashoffset', v));
      put(this.useArc, 'c', u.color, (v) => this.useArc.setAttribute('stroke', v));
      put(this.useIco, 'k', using.kind, () => { this.useIco.innerHTML = ICON[using.kind]; });
    }

    // swap
    const near = me.nearLoot >= 0 ? m.loot.find((l) => l.id === me.nearLoot) : undefined;
    cls(this.swapEl, 'on', sea && !!near);
    if (near) {
      put(this.swapEl, 'it', `${near.item.kind}${near.item.rarity}`, () => {
        this.swapIco.innerHTML = ITEM_ICON(near.item);
        this.swapEl.style.setProperty('--c', RARITY_BG2[near.item.rarity] + '90');
      });
    }

    // gust pips
    for (let i = 0; i < 2; i++) {
      const f = i < me.gusts ? 1 : i === me.gusts ? 1 - me.gustT / GUST_RECHARGE : 0;
      css(this.pips[i], 'transform', `scaleX(${clamp(f, 0, 1).toFixed(3)})`);
    }
    cls(this.gust, 'off', me.gusts <= 0);

    // the gull
    const cost = PARCELS.map((_, i) => m.parcelCost(me, i));
    cls(this.gullBtn, 'off', me.gull !== 'home' || me.glimmer < cost[0]);
    if (me.gull === 'rest') css(this.gullCool, 'background', `conic-gradient(rgba(42,26,13,0.5) ${(me.gullT / GULL_COOLDOWN * 360).toFixed(0)}deg, transparent 0)`);
    else css(this.gullCool, 'background', 'none');
    const afford = cost.filter((c) => me.glimmer >= c).length;
    put(this.gullBadge, 'b', me.gull === 'home' && afford ? String(afford) : '', (v) => { this.gullBadge.textContent = v; this.gullBadge.style.display = v ? '' : 'none'; });
    this.parcelEls.forEach((p, i) => { cls(p.el, 'off', me.glimmer < cost[i]); text(p.cost, String(cost[i])); });
    if (me.gull !== 'home') cls(this.parcels, 'on', false);

    // glimmer, and the share of the sea in your ink
    if (me.glimmer !== this.glimShown) {
      if (me.glimmer > this.glimShown) restart(this.glim, 'bump');
      this.glimShown = me.glimmer;
      text(this.glimT, String(me.glimmer));
    }
    this.glimPlusT -= dt;
    if (this.glimGain && this.glimPlusT > 0) text(this.glimPlus, `+${this.glimGain}`);
    cls(this.glimPlus, 'on', this.glimPlusT > 0.3);
    if (this.glimPlusT <= 0) this.glimGain = 0;
    const pct = (100 * m.ink.area(m.player)) / SEA_AREA;
    const share = pct < 10 ? pct.toFixed(1) : pct.toFixed(0);
    if (share !== this.shareShown) { this.shareShown = share; text(this.shareT, `${share}%`); }
    const mask = m.ink.perks(m.player);
    if (mask !== this.perkMask) {
      this.perkMask = mask;
      this.perksBox.innerHTML = LANDMARKS.map((l, i) => (mask & (1 << i) ? `<div class="perk"><div class="ico">${PERK_ICON[l.perk]}</div></div>` : '')).join('');
    }

    // counters
    const s = m.storm;
    text(this.aliveT, String(m.alive));
    text(this.killsT, String(me.kills));
    let glyphNow = ICON.hourglass;
    if (m.gale.t < m.gale.dur) text(this.stormT, mmss(m.gale.dur - m.gale.t));
    else if (s.state === 'wait') text(this.stormT, mmss(s.t));
    else if (s.state === 'shrink') { text(this.stormT, s.t > 1e6 ? '—' : mmss(s.t)); glyphNow = ICON.storm; }
    put(this.stormI, 'g', glyphNow, (v) => { this.stormI.innerHTML = v; });
    const outside = me.alive && s.state !== 'idle' && Math.hypot(me.x - s.x, me.z - s.z) > s.r;
    cls(this.chipStorm, 'closing', s.state === 'shrink');
    cls(this.chipStorm, 'outside', outside);

    // banners
    this.bannerT -= dt;
    if (this.bannerT <= 0) {
      const q = this.queue.shift();
      if (q) {
        this.bannerI.innerHTML = q.icon;
        this.bannerH.textContent = q.h;
        this.banner.style.setProperty('--c', q.c);
        cls(this.banner, 'on', true);
        this.bannerT = 3;
        this.sound('banner');
      } else cls(this.banner, 'on', false);
    }

    // places
    if (sea || glide) {
      const pl = placeInfluence(me.x, me.z);
      const idx = pl.k > 0.6 ? pl.i : -1;
      if (idx >= 0 && idx !== this.placeIdx) {
        this.placeIdx = idx;
        this.placeN.textContent = PLACES[idx].name;
        cls(this.placeEl, 'on', true);
        this.placeT = 3.2;
      }
    }
    this.placeT -= dt;
    if (this.placeT <= 0) cls(this.placeEl, 'on', false);

    // nudges for the first matches
    if (this.nudgeKey) {
      this.nudgeT += dt;
      const k = this.nudgeKey;
      // a nudge leaves when it is taken up, its moment passes, or after a while
      const done = (k === 'drop' && !gale) || (k === 'glide' && !glide) || (k === 'gull' && this.parcels.classList.contains('on'))
        || (k === 'steer' && this.stickEl.classList.contains('live')) || (k === 'swap' && !near) || (k === 'storm' && !outside);
      if (done || this.nudgeT > 7) this.endNudge(true);
      else if (this.nudgeOn) {
        const b = this.nudgeOn.getBoundingClientRect(), pad = 10 * scale;
        css(this.nudge, 'left', `${(b.left - pad).toFixed(0)}px`);
        css(this.nudge, 'top', `${(b.top - pad).toFixed(0)}px`);
        css(this.nudge, 'width', `${(b.width + pad * 2).toFixed(0)}px`);
        css(this.nudge, 'height', `${(b.height + pad * 2).toFixed(0)}px`);
        css(this.nudge, 'border-radius', this.nudgeOn === this.chipStorm.parentElement || this.nudgeOn === this.swapEl ? `${(14 * scale).toFixed(0)}px` : '50%');
      }
    } else {
      this.nudge1('drop', this.drop, gale && m.gale.t > 4);
      this.nudge1('glide', this.dive, glide);
      this.nudge1('steer', this.stickEl, sea && this.seaT > 1, true);
      this.nudge1('swap', this.swapEl, sea && !!near);
      this.nudge1('gull', this.gullBtn, sea && me.glimmer >= cost[0] && me.gull === 'home');
      this.nudge1('storm', this.chipStorm.parentElement as HTMLElement, outside && s.state === 'shrink');
    }

    // ---------------------------------------- floating: numbers, tags, damage directions, sound pings
    for (const n of this.nums) {
      if (!n.live) continue;
      n.t += dt;
      if (n.t > 1.1) { n.live = false; n.el.style.opacity = '0'; continue; }
      const p = stage.project(n.x, n.y + 2.5 + n.t * 4, n.z, W, H);
      if (!p) { n.el.style.opacity = '0'; continue; }
      const pop = n.t < 0.12 ? 1.5 - n.t / 0.12 * 0.5 : 1;
      n.el.style.transform = `translate(${(p[0] + n.ox).toFixed(1)}px, ${p[1].toFixed(1)}px) translate(-50%, -50%) scale(${pop.toFixed(2)})`;
      n.el.style.opacity = String(n.t > 0.75 ? 1 - (n.t - 0.75) / 0.35 : 1);
    }
    for (const [id, tg] of this.tags) {
      tg.t += dt;
      const sh = m.ships[id];
      if (tg.t > 4 || !sh.alive) { tg.el.remove(); this.tags.delete(id); continue; }
      const p = stage.project(sh.x, 20 + sh.hop * 2, sh.z, W, H);
      if (!p) { tg.el.style.opacity = '0'; continue; }
      tg.el.style.transform = `translate(${p[0].toFixed(1)}px, ${p[1].toFixed(1)}px)`;
      tg.el.style.opacity = String(tg.t > 3.4 ? (4 - tg.t) / 0.6 : 1);
      css(tg.sh, 'transform', `scaleX(${(sh.shield / MAX_SHIELD).toFixed(3)})`);
      css(tg.hu, 'transform', `scaleX(${(sh.hull / MAX_HULL).toFixed(3)})`);
    }
    for (const d of this.dirs) {
      d.t += dt;
      d.el.style.opacity = d.t < 1.2 ? String(1 - d.t / 1.2) : '0';
      if (d.t < 1.2) d.el.style.transform = `rotate(${(d.a * 180 / Math.PI).toFixed(1)}deg)`;
    }
    // clams nearby glint at the edge of hearing
    if (this.profile.settings.visualize && sea && Math.random() < dt * 1.5) {
      for (const c of m.clams) if (!c.open && Math.hypot(c.x - me.x, c.z - me.z) < 80) { this.ping(m, c.x, c.z, 'clam', 80); break; }
    }
    const R = Math.min(W, H) * 0.3;
    for (const p of this.pings) {
      if (!p.live) continue;
      p.t += dt;
      if (p.t > 1.4) { p.live = false; p.el.style.opacity = '0'; continue; }
      p.el.style.opacity = String(p.t < 0.15 ? p.t / 0.15 : 1 - (p.t - 0.15) / 1.25);
      p.el.style.transform = `translate(${(Math.sin(p.a) * R).toFixed(1)}px, ${(-Math.cos(p.a) * R).toFixed(1)}px)`;
    }

    // chart and compass, a few times a second
    this.mapT -= dt;
    if (this.mapT <= 0) {
      this.mapT = 1 / 20;
      const who = me.alive || stage.watch < 0 ? me : m.ships[stage.watch];
      const span = me.phase === 'sea' ? 220 : 420, lim = MAP_R - span, Wm = this.minimap.width;
      drawMap(this.mapG, Wm, this.base, m, stage, clamp(who.x, -lim, lim), clamp(who.z, -lim, lim), span, false, t);
      // round it off and set it in its bezel
      this.mapG.globalCompositeOperation = 'destination-in';
      this.mapG.beginPath(); this.mapG.arc(Wm / 2, Wm / 2, Wm / 2 - 1, 0, TAU); this.mapG.fill();
      this.mapG.globalCompositeOperation = 'source-over';
      this.mapG.drawImage((this.ring ??= bezel(Wm)), 0, 0);
      // the wind: an arrow flying in over the rim from where it blows
      const o = Wm / 2, ru = Wm / 200, rr = o - 2 * ru;
      windArrow(this.mapG, o - Math.sin(m.wind) * rr, o - Math.cos(m.wind) * rr, m.wind, Wm * 0.13, ru * 1.15);
      this.drawCompass(m);
    }
    const watching = !me.alive && stage.watch >= 0;
    cls(this.spectating, 'on', watching);
    if (watching) text(this.spectT, m.ships[stage.watch].name);
  }

  private nextAlive(m: Match): number {
    let best = -1, bd = Infinity;
    const me = m.me;
    for (const s of m.ships) { if (!s.alive || s.id === m.player) continue; const d = Math.hypot(s.x - me.x, s.z - me.z); if (d < bd) { bd = d; best = s.id; } }
    return best;
  }

  /** The ship under the crosshair, if one is in reach of the gun. */
  private aimedAt(m: Match): number {
    const cam = this.stage.camera, me = m.me, w = m.weaponOf(me);
    if (!w) return -1;
    cam.getWorldDirection(this.tmp);
    const o = cam.position, d = this.tmp, L = WEAPONS[w.kind].range + 40;
    let best = -1, bt = Infinity;
    for (const s of m.ships) {
      if (s.id === m.player || !s.alive || s.phase !== 'sea') continue;
      if (Math.abs(s.x - me.x) > L || Math.abs(s.z - me.z) > L) continue;
      const hit = m.segmentShip(s, o.x, o.y, o.z, o.x + d.x * (L + 30), o.y + d.y * (L + 30), o.z + d.z * (L + 30));
      if (hit && hit.t < bt) { bt = hit.t; best = s.id; }
    }
    return best;
  }

  private number(target: number, x: number, y: number, z: number, dmg: number, crit: boolean, shield: boolean): void {
    // pellets and quick bursts on one ship add up into one number
    let n = this.nums.find((q) => q.live && q.target === target && q.t < 0.18);
    if (!n) {
      n = this.nums.find((q) => !q.live) ?? this.nums[0];
      n.live = true; n.t = 0; n.dmg = 0; n.target = target; n.x = x; n.y = y; n.z = z;
      n.ox = (Math.random() - 0.5) * 50 * scale;
    }
    n.dmg += dmg;
    n.t = Math.min(n.t, 0.05);
    n.el.textContent = String(Math.round(n.dmg));
    n.el.className = `dmg num${crit ? ' crit' : ''}${shield ? ' shield' : ''}`;
  }

  private tagHit(id: number): void {
    let tg = this.tags.get(id);
    if (!tg) {
      const e = el('tag', this.tagsBox, '<div class="b sh"><i></i></div><div class="b hu"><i></i></div>');
      tg = { el: e, sh: e.querySelector('.sh i')!, hu: e.querySelector('.hu i')!, t: 0 };
      this.tags.set(id, tg);
    }
    tg.t = 0;
  }

  private ping(m: Match, x: number, z: number, kind: 'fire' | 'clam', range: number): void {
    const me = m.me, dx = x - me.x, dz = z - me.z;
    if (Math.hypot(dx, dz) > range || Math.hypot(dx, dz) < 12) return;
    const yaw = this.stage.rig.yaw;
    const a = Math.atan2(dx * -Math.cos(yaw) + dz * Math.sin(yaw), dx * Math.sin(yaw) + dz * Math.cos(yaw));
    // one ping per direction at a time
    const same = this.pings.find((p) => p.live && p.kind === kind && Math.abs(Math.atan2(Math.sin(p.a - a), Math.cos(p.a - a))) < 0.3);
    if (same) { same.t = Math.min(same.t, 0.15); same.a = a; return; }
    const p = this.pings.find((q) => !q.live);
    if (!p) return;
    p.live = true; p.t = 0; p.a = a;
    if (p.kind !== kind) { p.kind = kind; p.el.innerHTML = kind === 'clam' ? ICON.clam : ICON.target; p.el.className = `snd ${kind}`; }
  }

  /** The compass ribbon: inked ticks sliding under a red notch, north in red, the eye and the leviathan marked. */
  private drawCompass(m: Match): void {
    const g = this.compG, W = this.compass.width, H = this.compass.height, u = H / 40;
    const yaw = this.stage.rig.yaw;
    const bearing = ((Math.atan2(Math.sin(yaw), -Math.cos(yaw)) * 180) / Math.PI + 360) % 360;
    const ppd = W / 140;
    g.clearRect(0, 0, W, H);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.strokeStyle = '#2a1a0d';
    for (let d = Math.ceil((bearing - 72) / 5) * 5; d <= bearing + 72; d += 5) {
      const x = W / 2 + (d - bearing) * ppd, dd = ((d % 360) + 360) % 360;
      // fade the ends into the paper
      g.globalAlpha = clamp(1.25 - Math.abs(d - bearing) / 72, 0, 1);
      if (dd % 90 === 0) {
        g.font = `${Math.round(24 * u)}px Fell, serif`;
        g.fillStyle = dd === 0 ? '#a3301c' : '#2a1a0d';
        g.fillText('NESW'[dd / 90], x, H * 0.52);
      } else if (dd % 45 === 0) {
        g.font = `italic ${Math.round(15 * u)}px Fell, serif`;
        g.fillStyle = '#2a1a0d';
        g.fillText(['NE', 'SE', 'SW', 'NW'][(dd - 45) / 90], x, H * 0.55);
      } else {
        g.lineWidth = (dd % 15 === 0 ? 1.6 : 1) * u;
        g.beginPath(); g.moveTo(x, H * (dd % 15 === 0 ? 0.3 : 0.4)); g.lineTo(x, H * 0.7); g.stroke();
      }
    }
    g.globalAlpha = 1;
    // marks: the eye when outside it, the leviathan rising
    const me = m.me, s = m.storm;
    const mark = (x: number, z: number, col: string) => {
      const b = ((Math.atan2(x - me.x, -(z - me.z)) * 180) / Math.PI + 360) % 360;
      let dd = b - bearing;
      dd = ((dd + 540) % 360) - 180;
      const px = W / 2 + clamp(dd, -66, 66) * ppd;
      g.fillStyle = col;
      g.beginPath(); g.moveTo(px - 6 * u, H * 0.1); g.lineTo(px + 6 * u, H * 0.1); g.lineTo(px, H * 0.32); g.closePath(); g.fill();
    };
    if (s.state !== 'idle' && Math.hypot(me.x - s.nx, me.z - s.nz) > s.nr) mark(s.nx, s.nz, '#2f64a8');
    if (m.leviathan.state === 'rising') mark(m.leviathan.x, m.leviathan.z, '#1e6e78');
    // the lubber's notch
    g.fillStyle = '#a3301c';
    g.beginPath(); g.moveTo(W / 2 - 6 * u, H - 2 * u); g.lineTo(W / 2 + 6 * u, H - 2 * u); g.lineTo(W / 2, H - 11 * u); g.closePath(); g.fill();
  }
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

// ---------------------------------------------------------------- the screens and the whole

export interface UiHooks {
  play(): void;
  leave(): void;
  harbour(): void;
  again(): void;
  paused(on: boolean): void;
  look(): void;
  settings(): void;
  sound(kind: string): void;
}

const TAB_ICON = {
  ship: svg('<path d="M1.5 11h21l-3.4 7.5H4.9z"/><path d="M11 2.5h2V11h-2z"/><path d="M13 3.5l6 5.5h-6z"/>'),
  sails: ICON.sail,
  flair: EMBLEMS[6],
  gull: ICON.gull,
};

export class UI {
  readonly root: HTMLElement;
  readonly hud: Hud;
  private readonly hooks: UiHooks;
  private readonly profile: Profile;
  private readonly stage: Stage;
  private readonly boot: HTMLDivElement;
  private readonly harbourEl: HTMLDivElement;
  private readonly pauseEl: HTMLDivElement;
  private readonly settingsEl: HTMLDivElement;
  private readonly mapEl: HTMLDivElement;
  private readonly mapCanvas: HTMLCanvasElement;
  private readonly deathEl: HTMLDivElement;
  private readonly resultsEl: HTMLDivElement;
  private tab: keyof typeof TAB_ICON = 'ship';
  private match: Match | null = null;
  inMatch = false;
  paused = false;

  constructor(root: HTMLElement, stage: Stage, profile: Profile, hooks: UiHooks) {
    this.root = root;
    this.stage = stage;
    this.profile = profile;
    this.hooks = hooks;
    this.resize();
    addEventListener('resize', () => this.resize());
    const layer = el('touch', root);
    this.hud = new Hud(root, layer, stage, profile, hooks.sound, () => this.showMap(true), () => this.setPaused(true));
    this.boot = document.querySelector('.boot') ?? el('screen boot on', root, '<div class="wordmark">PORTOLAN</div><div class="progress"><i></i></div><div class="what"></div>');
    this.harbourEl = el('screen harbour', root);
    this.pauseEl = el('screen modal pause', root);
    this.settingsEl = el('screen modal settings', root);
    this.mapEl = el('screen modal bigmap', root, `<div class="wrap"><div class="sheet pp"><canvas></canvas></div><div class="rb tap close"><div class="ico">${ICON.close}</div></div></div>`);
    this.mapCanvas = this.mapEl.querySelector('canvas')!;
    this.mapEl.addEventListener('pointerdown', () => this.showMap(false));
    this.deathEl = el('screen death', root);
    this.resultsEl = el('screen results', root);
    void initHaptics();
    document.addEventListener('pointerlockchange', () => {
      if (!document.pointerLockElement && this.inMatch && !this.paused && this.match?.me.alive && !this.mapEl.classList.contains('on')) this.setPaused(true);
    });
  }

  private resize(): void {
    scale = clamp(Math.min(innerHeight / 860, innerWidth / 1240), 0.55, 1.3);
    document.documentElement.style.setProperty('--s', scale.toFixed(3));
    this.hud?.resize();
  }

  get controls(): Controls {
    return this.hud.controls;
  }

  progress(f: number, what: string): void {
    const bar = this.boot.querySelector<HTMLElement>('.progress i');
    if (bar) bar.style.transform = `scaleX(${f})`;
    const w = this.boot.querySelector('.what');
    if (w && what) w.textContent = what;
  }

  private screen(e: HTMLElement, on: boolean): void {
    cls(e, 'on', on);
  }

  // ---------------------------------------------------------------- the harbour

  showHarbour(): void {
    this.screen(this.boot, false);
    this.screen(this.resultsEl, false);
    this.screen(this.deathEl, false);
    this.inMatch = false;
    this.renderHarbour();
    this.screen(this.harbourEl, true);
  }

  private renderHarbour(): void {
    const p = this.profile, lv = levelOf(p.xp);
    const h = this.harbourEl;
    const stat = (icon: string, v: string | number) => `<div><div class="i">${icon}</div><span class="num">${v}</span></div>`;
    h.innerHTML = `
      <div class="side pp ruled">
        <div class="wordmark">PORTOLAN</div>
        <div class="lvl"><div class="seal num">${lv.level}</div><div class="xp"><div class="b"><i style="transform:scaleX(${(lv.into / lv.need).toFixed(3)})"></i></div><div class="t num">${lv.into} / ${lv.need}</div></div></div>
        <div class="stats">${stat(ICON.crown, p.wins)}${stat(ICON.sail, p.matches)}${stat(ICON.sink, p.kills)}${stat(ICON.flag, p.best ? '#' + p.best : '—')}</div>
        <div class="tabs">${(Object.keys(TAB_ICON) as (keyof typeof TAB_ICON)[]).map((t) => `<div class="tab${this.tab === t ? ' on' : ''}" data-t="${t}"><div class="ico">${TAB_ICON[t]}</div></div>`).join('')}</div>
        <div class="custom"></div>
      </div>
      <button class="btn cta play">Set sail</button>
      <div class="rb gear"><div class="ico">${ICON.gear}</div></div>`;
    h.querySelectorAll<HTMLElement>('.tab').forEach((t) => t.addEventListener('click', () => { this.tab = t.dataset.t as typeof this.tab; this.hooks.sound('tap'); this.renderHarbour(); }));
    h.querySelector('.play')!.addEventListener('click', () => { this.hooks.sound('play'); this.hooks.play(); });
    h.querySelector('.gear')!.addEventListener('click', () => { this.hooks.sound('tap'); this.showSettings(true); });
    const box = h.querySelector<HTMLElement>('.custom')!;
    const rows: [string, Part][] = this.tab === 'ship' ? [['Hull', 'hull'], ['Band', 'accent'], ['Metal', 'trim']]
      : this.tab === 'sails' ? [['Sail', 'sail'], ['Second', 'sail2'], ['Pattern', 'pattern']]
        : this.tab === 'flair' ? [['Emblem', 'emblem'], ['Lantern', 'wisp']]
          : [['Scarf', 'scarf'], ['Hat', 'hat']];
    for (const [label, part] of rows) {
      const row = el('row', box, `<div class="h">${label}</div>`);
      const opts = el('opts', row);
      for (const o of OPTIONS[part]) {
        const cur = part === 'scarf' ? p.gull.scarf : part === 'hat' ? p.gull.hat : p.look[part as keyof Look];
        const open = unlocked(o, p);
        const b = el(`opt${cur === o.v ? ' on' : ''}${open ? '' : ' locked'}`, opts, face(part, o.v, p));
        if (!open) b.insertAdjacentHTML('beforeend', `<div class="lock num">${o.win ? `<div class="ico" style="width:60%;height:60%;opacity:1">${ICON.crown}</div>` : o.level}</div>`);
        b.addEventListener('click', () => {
          if (!open) { this.hooks.sound('deny'); return; }
          if (part === 'scarf') p.gull.scarf = o.v as number;
          else if (part === 'hat') p.gull.hat = o.v as GullLook['hat'];
          else (p.look as unknown as Record<string, number>)[part] = o.v as number;
          saveProfile(p);
          this.hooks.sound('tap');
          this.hooks.look();
          this.renderHarbour();
        });
      }
    }
  }

  // ---------------------------------------------------------------- a match

  startMatch(m: Match): void {
    this.match = m;
    this.inMatch = true;
    this.paused = false;
    this.deathShown = false;
    this.screen(this.harbourEl, false);
    this.screen(this.resultsEl, false);
    this.screen(this.deathEl, false);
    this.screen(this.boot, false);
    this.hud.start(m);
  }

  private deathShown = false;
  private deathT = 0;

  frame(m: Match, events: readonly GameEvent[], dt: number): void {
    this.hud.frame(m, events, dt);
    if (this.mapEl.classList.contains('on')) {
      const W = this.mapCanvas.width;
      drawMap(this.mapCanvas.getContext('2d')!, W, this.hud.base, m, this.stage, 0, 0, MAP_R - 30, true, performance.now() / 1000);
    }
    // sunk: a moment to watch her go, then the card
    if (!m.me.alive && !this.deathShown) {
      this.deathT += dt;
      if (this.deathT > 1.8) { this.deathShown = true; this.showDeath(m); }
    } else if (m.me.alive) this.deathT = 0;
  }

  private showDeath(m: Match): void {
    const me = m.me, killer = me.killer >= 0 && me.killer !== me.id ? m.ships[me.killer] : null;
    this.stage.watch = killer && killer.alive ? killer.id : this.firstAlive(m);
    this.hud.controls.enabled = false;
    this.hud.controls.release();
    this.deathEl.innerHTML = `<div class="card pp ruled">
      <div class="rank num">#${me.place}<small> / ${m.ships.length}</small></div>
      <div class="by"><div class="i">${killer ? ICON.sink : ICON.storm}</div>${killer ? esc(killer.name) : ''}</div>
      <div class="tally">${tally(ICON.sink, me.kills)}${tally(ICON.target, Math.round(me.dealt))}</div>
      <div class="cardbtns"><button class="btn spec"><div class="i">${ICON.eye}</div></button><button class="btn cta res"><div class="i">${ICON.play}</div></button></div></div>`;
    this.deathEl.querySelector('.spec')!.addEventListener('click', () => { this.hooks.sound('tap'); this.screen(this.deathEl, false); this.showSpecBar(); });
    this.deathEl.querySelector('.res')!.addEventListener('click', () => { this.hooks.sound('tap'); this.hooks.leave(); });
    this.screen(this.deathEl, true);
  }

  private showSpecBar(): void {
    this.deathEl.innerHTML = `<div class="cardbtns" style="pointer-events:auto"><button class="btn next"><div class="i">${ICON.swap}</div></button><button class="btn cta res"><div class="i">${ICON.play}</div></button></div>`;
    this.deathEl.querySelector('.next')!.addEventListener('click', () => {
      const m = this.match;
      if (!m) return;
      const alive = m.ships.filter((s) => s.alive && s.id !== m.player);
      if (!alive.length) return;
      const i = alive.findIndex((s) => s.id === this.stage.watch);
      this.stage.watch = alive[(i + 1) % alive.length].id;
      this.hooks.sound('tap');
    });
    this.deathEl.querySelector('.res')!.addEventListener('click', () => { this.hooks.sound('tap'); this.hooks.leave(); });
    this.screen(this.deathEl, true);
  }

  private firstAlive(m: Match): number {
    let best = -1, bd = Infinity;
    for (const s of m.ships) { if (!s.alive || s.id === m.player) continue; const d = Math.hypot(s.x - m.me.x, s.z - m.me.z); if (d < bd) { bd = d; best = s.id; } }
    return best;
  }

  endMatch(): void {
    this.hud.stop();
    this.inMatch = false;
    this.screen(this.deathEl, false);
    this.screen(this.pauseEl, false);
    this.showMap(false);
    this.match = null;
  }

  showMap(on: boolean): void {
    if (on && !this.inMatch) return;
    this.screen(this.mapEl, on);
    if (on) {
      const r = this.mapCanvas.getBoundingClientRect();
      this.mapCanvas.width = this.mapCanvas.height = Math.round(Math.min(r.width, r.height) * Math.min(2, devicePixelRatio || 1));
      if (document.pointerLockElement) document.exitPointerLock();
    }
    this.hooks.sound('tap');
  }

  setPaused(on: boolean): void {
    if (!this.inMatch) return;
    this.paused = on;
    cls(this.hud.root, 'paused', on);
    this.hud.controls.release();
    if (on) {
      if (document.pointerLockElement) document.exitPointerLock();
      this.pauseEl.innerHTML = `<div class="card pp ruled" style="align-items:stretch">
          <button class="btn cta resume"><div class="i">${ICON.play}</div>Resume</button>
          <button class="btn cog"><div class="i">${ICON.gear}</div>Settings</button>
          <button class="btn quit"><div class="i">${ICON.leave}</div>Leave</button></div>`;
      this.pauseEl.querySelector('.resume')!.addEventListener('click', () => { this.hooks.sound('tap'); this.setPaused(false); });
      this.pauseEl.querySelector('.cog')!.addEventListener('click', () => { this.hooks.sound('tap'); this.showSettings(true); });
      this.pauseEl.querySelector('.quit')!.addEventListener('click', () => { this.hooks.sound('tap'); this.setPaused(false); this.hooks.leave(); });
    }
    this.screen(this.pauseEl, on);
    this.hooks.paused(on);
  }

  // ---------------------------------------------------------------- settings

  showSettings(on: boolean): void {
    if (!on) { this.screen(this.settingsEl, false); return; }
    const s = this.profile.settings;
    const sw = (k: keyof Settings) => `<div class="sw2${s[k] ? ' on' : ''}" data-k="${k}"></div>`;
    this.settingsEl.innerHTML = `<div class="card pp ruled"><h2>Settings</h2>
      <div class="set">
        <span>Captain</span><input type="text" maxlength="14" value="${esc(s.name)}">
        <span>Look speed</span><input type="range" min="0.4" max="2" step="0.05" value="${s.sens}" data-k="sens">
        <span>Invert look</span>${sw('invert')}
        <span>Fire on target</span>${sw('autofire')}
        <span>Left fire button</span>${sw('leftFire')}
        <span>Show sounds</span>${sw('visualize')}
        <span>Haptics</span>${sw('haptics')}
        <span>Music</span><input type="range" min="0" max="1" step="0.05" value="${s.music}" data-k="music">
        <span>Effects</span><input type="range" min="0" max="1" step="0.05" value="${s.sfx}" data-k="sfx">
        <span>Graphics</span><div class="seg3">${(['battery', 'balanced', 'cinematic'] as const).map((q) => `<span data-q="${q}" class="${s.quality === q ? 'on' : ''}">${q}</span>`).join('')}</div>
      </div>
      <div class="cardbtns"><button class="btn cta done">Done</button></div></div>`;
    const card = this.settingsEl;
    card.querySelector<HTMLInputElement>('input[type=text]')!.addEventListener('change', (e) => { s.name = (e.target as HTMLInputElement).value.trim().slice(0, 14) || 'Captain'; this.saveSettings(); });
    card.querySelectorAll<HTMLInputElement>('input[type=range]').forEach((r) => r.addEventListener('input', () => { (s as unknown as Record<string, number>)[r.dataset.k!] = Number(r.value); this.saveSettings(); }));
    card.querySelectorAll<HTMLElement>('.sw2').forEach((b) => b.addEventListener('click', () => { const k = b.dataset.k as keyof Settings; (s as unknown as Record<string, boolean>)[k] = !s[k]; b.classList.toggle('on'); this.hooks.sound('tap'); this.saveSettings(); }));
    card.querySelectorAll<HTMLElement>('.seg3 span').forEach((b) => b.addEventListener('click', () => {
      s.quality = b.dataset.q as Settings['quality'];
      card.querySelectorAll('.seg3 span').forEach((x) => x.classList.toggle('on', x === b));
      this.hooks.sound('tap');
      this.saveSettings();
    }));
    card.querySelector('.done')!.addEventListener('click', () => { this.hooks.sound('tap'); this.showSettings(false); if (!this.inMatch) this.renderHarbour(); });
    this.screen(this.settingsEl, true);
  }

  private saveSettings(): void {
    const s = this.profile.settings, c = this.hud.controls;
    c.sens = s.sens; c.invert = s.invert; c.autofire = s.autofire;
    if (!s.haptics) buzz = () => {};
    else void initHaptics();
    saveProfile(this.profile);
    this.hooks.settings();
  }

  // ---------------------------------------------------------------- results

  showResults(s: Summary): void {
    const p = this.profile;
    const a = award(p, s);
    saveProfile(p);
    const l0 = levelOf(a.before), l1 = levelOf(p.xp);
    this.resultsEl.innerHTML = `<div class="card pp ruled">
      ${s.win ? `<div class="crown">${ICON.crown}</div>` : ''}
      <div class="big num">#${s.place}<small> / ${s.count}</small></div>
      ${s.killer ? `<div class="by"><div class="i">${ICON.sink}</div>${esc(s.killer)}</div>` : ''}
      <div class="tally">${tally(ICON.sink, s.kills)}${tally(ICON.target, Math.round(s.dealt))}${tally(ICON.glimmer, s.glimmer)}${tally(ICON.hourglass, mmss(s.survived))}</div>
      <div class="lvl"><div class="seal num">${l1.level}</div><div class="xp"><div class="b"><i style="transform:scaleX(${l1.level > l0.level ? 0 : (l0.into / l0.need).toFixed(3)})"></i></div></div><div class="xpnum num">+${a.total}</div></div>
      ${a.unlocks.length ? `<div class="unlocks">${a.unlocks.slice(0, 8).map(([part, o], i) => `<div class="unlock" style="animation-delay:${(0.6 + i * 0.12).toFixed(2)}s">${face(part, o.v, p)}</div>`).join('')}</div>` : ''}
      <div class="cardbtns"><button class="btn harb"><div class="i">${ICON.anchor}</div>Harbour</button><button class="btn cta again"><div class="i">${ICON.sail}</div>Sail again</button></div></div>`;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const bar = this.resultsEl.querySelector<HTMLElement>('.xp .b i');
      if (bar) bar.style.transform = `scaleX(${(l1.into / l1.need).toFixed(3)})`;
    }));
    this.resultsEl.querySelector('.harb')!.addEventListener('click', () => { this.hooks.sound('tap'); this.hooks.harbour(); });
    this.resultsEl.querySelector('.again')!.addEventListener('click', () => { this.hooks.sound('play'); this.hooks.again(); });
    this.screen(this.resultsEl, true);
    this.hooks.sound(s.win ? 'victory' : 'results');
  }
}

const tally = (icon: string, v: string | number) => `<div><div class="i">${icon}</div><span class="num">${v}</span></div>`;
