// Things that come over a screen: toasts, pop-ups and modals, and the full-screen ceremony for big moments (winning,
// levelling up, ranking up, unlocking an ability, and the shield break in a match).
import { button, iconButton, type ButtonOptions } from './button.ts';
import { el, esc, mmss } from './dom.ts';
import { effect, type UiHaptic, type UiSound } from './feedback.ts';
import { ICON } from './icons.ts';

// ---------------------------------------------------------------- toasts

export interface ToastOptions {
  icon: string;
  text: string;
  sub?: string;
  /** The disc behind the glyph. */
  color?: string;
  ms?: number;
  sound?: UiSound;
}

/** A stack of toasts at the top of the screen: each slides in, waits, and slides out. At most three at once. */
export class Toasts {
  readonly el: HTMLElement;
  constructor(parent: Element) {
    this.el = el('p-toasts', parent);
  }
  show(o: ToastOptions): HTMLElement {
    const t = el('p-toast', this.el, `<span class="p-toast__icon">${o.icon}</span><span>${esc(o.text)}</span>${o.sub ? `<span class="p-toast__sub">${esc(o.sub)}</span>` : ''}`);
    t.dataset.part = 'toast';
    if (o.color) t.style.setProperty('--tc', o.color);
    effect(`toast:${o.text}`, o.sound ?? 'toast', 'light');
    const out = () => { t.classList.add('is-out'); setTimeout(() => t.remove(), 260); };
    setTimeout(out, o.ms ?? 2600);
    while (this.el.children.length > 3) this.el.firstElementChild!.remove();
    return t;
  }
}

// ---------------------------------------------------------------- a region's event

export interface EventBannerView {
  /** The event's glyph. */
  icon: string;
  name: string;
  tip: string;
  /** Something to keep clear of, something to go for, or a change in the sea: its colour once it runs. */
  tone: 'danger' | 'prize' | 'sea';
  /** Warned and not started yet: it pulses gold, and the time counts down to the start. */
  warning: boolean;
  seconds: number;
}

export interface EventBannerHandle { el: HTMLElement; set(v: EventBannerView | null): void }

/**
 * A region's event over the match: a glyph disc, the event's name and what to do about it, and the time to its
 * start or its end. It springs in when it is first warned, and again as it starts.
 */
export function eventBanner(o: { parent: Element; className?: string }): EventBannerHandle {
  const b = el(`p-event${o.className ? ' ' + o.className : ''}`, o.parent);
  b.dataset.part = 'eventBanner';
  const icon = el('p-event__icon', b);
  const words = el('p-event__words', b);
  const name = el('p-event__name', words, '', 'b');
  const tip = el('p-event__tip', words, '', 'span');
  const time = el('p-event__time', b, '', 'b');
  let shown = '';
  const set = (v: EventBannerView | null) => {
    b.classList.toggle('is-on', v !== null);
    if (!v) { shown = ''; return; }
    const key = `${v.name}|${v.warning}`;
    if (key !== shown) {
      shown = key;
      icon.innerHTML = v.icon;
      name.textContent = v.name;
      tip.textContent = v.tip;
      b.dataset.tone = v.tone;
      b.classList.toggle('is-warn', v.warning);
      // spring in again
      b.classList.remove('is-on');
      void b.offsetWidth;
      b.classList.add('is-on');
      effect(`event:${key}`, 'none', v.warning ? 'warning' : 'medium');
    }
    time.textContent = v.warning ? `in ${mmss(v.seconds)}` : mmss(v.seconds);
  };
  return { el: b, set };
}

// ---------------------------------------------------------------- a first-time tip

export interface TipView {
  /** Which tip: the card springs in again when this changes. */
  id: string;
  /** The tip's glyph. */
  icon: string;
  title: string;
  text: string;
}

export interface TipCardHandle { el: HTMLElement; set(v: TipView | null): void }

/**
 * A short tip the first time something happens: a parchment card with a glyph disc, a title and a line on what to do.
 * It springs in as its tip comes and slips away as it goes; it takes no touches, so the sea under it still steers.
 */
export function tipCard(o: { parent: Element; className?: string }): TipCardHandle {
  const c = el(`p-tip p-paper${o.className ? ' ' + o.className : ''}`, o.parent);
  c.dataset.part = 'tip';
  const icon = el('p-tip__icon', c);
  const words = el('p-tip__words', c);
  const title = el('p-tip__title', words, '', 'b');
  const text = el('p-tip__text', words, '', 'span');
  let shown = '';
  const set = (v: TipView | null) => {
    if (!v) {
      if (shown) c.classList.replace('is-on', 'is-out');
      shown = '';
      return;
    }
    if (v.id === shown) return;
    shown = v.id;
    icon.innerHTML = v.icon;
    title.textContent = v.title;
    text.textContent = v.text;
    c.classList.remove('is-on', 'is-out');
    void c.offsetWidth;
    c.classList.add('is-on');
    effect(`tip:${v.id}`, 'toast', 'light');
  };
  return { el: c, set };
}

// ---------------------------------------------------------------- pop-ups and modals

export interface ModalOptions {
  title: string;
  body?: string | HTMLElement;
  actions?: ButtonOptions[];
  /** A close button in the corner, and a tap on the scrim closes it. */
  dismissable?: boolean;
  onClose?: () => void;
  parent: Element;
  className?: string;
}

export interface ModalHandle { el: HTMLElement; sheet: HTMLElement; close(): Promise<void> }

/** A pop-up over a dimmed screen: a parchment sheet that springs in, with a title, a body and a row of buttons. */
export function modal(o: ModalOptions): ModalHandle {
  const m = el(`p-modal${o.className ? ' ' + o.className : ''}`, o.parent);
  m.dataset.part = 'modal';
  const sheet = el('p-modal__sheet p-paper p-ruled', m);
  el('p-modal__title t-h2', sheet, esc(o.title));
  if (o.body) {
    const b = el('p-modal__body', sheet);
    if (typeof o.body === 'string') b.innerHTML = esc(o.body);
    else b.appendChild(o.body);
  }
  let closed = false;
  const close = () => {
    if (closed) return Promise.resolve();
    closed = true;
    m.classList.add('is-out');
    effect('modal:close', 'close', 'none');
    o.onClose?.();
    return new Promise<void>((r) => setTimeout(() => { m.remove(); r(); }, 240));
  };
  if (o.actions?.length) {
    const row = el('p-modal__actions', sheet);
    for (const a of o.actions) button({ ...a, parent: row, onPress: () => { a.onPress?.(); void close(); } });
  }
  if (o.dismissable) {
    iconButton({ icon: ICON.close, label: 'Close', kind: 'wax', size: 'sm', parent: sheet, className: 'p-modal__close', sound: 'close', onPress: () => void close() });
    m.addEventListener('pointerdown', (e) => { if (e.target === m) void close(); });
  }
  effect('modal:open', 'popup', 'light');
  return { el: m, sheet, close };
}

// ---------------------------------------------------------------- the ceremony

export type CeremonyKind = 'victory' | 'levelUp' | 'rankUp' | 'unlock' | 'shieldBreak';

export interface CeremonyOptions {
  kind: CeremonyKind;
  kicker?: string;
  title: string;
  sub?: string;
  /** The art in the middle: SVG markup, or an element (a rank medallion, a rarity frame). */
  art?: string | HTMLElement;
  /** The ceremony's light, and its deeper shade. */
  color?: string;
  colorDeep?: string;
  parent: Element;
  /** How long before it closes itself; 0 waits for a tap. Brief kinds close themselves. */
  ms?: number;
}

const SOUND: Record<CeremonyKind, [UiSound, UiHaptic]> = {
  victory: ['victory', 'success'], levelUp: ['levelUp', 'success'], rankUp: ['rankUp', 'success'], unlock: ['unlock', 'medium'], shieldBreak: ['none', 'heavy'],
};

/** A full-screen moment: rays, a flash, particles, the art springing in and the title landing. Resolves on dismiss. */
export function ceremony(o: CeremonyOptions): Promise<void> {
  const brief = o.kind === 'shieldBreak';
  const c = el(`p-cer p-cer--${o.kind}${brief ? ' p-cer--brief' : ''}`, o.parent);
  c.dataset.part = `ceremony:${o.kind}`;
  if (o.color) c.style.setProperty('--cc', o.color);
  if (o.colorDeep) c.style.setProperty('--cc2', o.colorDeep);
  if (!brief) el('p-cer__rays', c);
  const canvas = el<HTMLCanvasElement>('p-cer__canvas', c, undefined, 'canvas');
  el('p-cer__flash', c);
  if (!brief) {
    const stack = el('p-cer__stack', c);
    if (o.kicker) el('p-cer__kicker', stack, esc(o.kicker));
    if (o.art) {
      const art = el('p-cer__art', stack);
      if (typeof o.art === 'string') art.innerHTML = o.art;
      else art.appendChild(o.art);
    }
    el('p-cer__title t-gold', stack, esc(o.title));
    if (o.sub) el('p-cer__sub', stack, esc(o.sub));
    el('p-cer__hint', c, 'Tap to continue');
  }
  const [sound, haptic] = SOUND[o.kind];
  effect(`ceremony:${o.kind}`, sound, haptic);
  const stop = particles(canvas, brief ? 'shards' : 'leaf', o.color ?? '#ffd76e');
  return new Promise((resolve) => {
    let done = false;
    const close = () => {
      if (done) return;
      done = true;
      c.classList.add('is-out');
      setTimeout(() => { stop(); c.remove(); resolve(); }, brief ? 0 : 420);
    };
    if (brief) setTimeout(close, 900);
    else {
      // a tap closes it, but not before the title has landed
      const t0 = performance.now();
      c.addEventListener('pointerdown', () => { if (performance.now() - t0 > 900) { effect(`ceremony:${o.kind}:dismiss`, 'tap', 'light'); close(); } });
      if (o.ms) setTimeout(close, o.ms);
    }
  });
}

/** Gold leaf that bursts and flutters down, or glass shards that fly out: drawn on a canvas until stopped. */
function particles(canvas: HTMLCanvasElement, kind: 'leaf' | 'shards', color: string): () => void {
  const g = canvas.getContext('2d');
  if (!g) return () => {};
  const dpr = Math.min(2, devicePixelRatio || 1);
  let W = 0, H = 0, raf = 0;
  const size = () => {
    W = canvas.clientWidth || innerWidth;
    H = canvas.clientHeight || innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
  };
  size();
  const n = kind === 'leaf' ? 140 : 46, s = Math.min(W, H) / 440;
  const cols = kind === 'leaf' ? [color, '#fff3b8', '#f2c14e', '#fff6e2', '#d39a2a'] : ['#cfe8ff', '#7fc0ff', '#ffffff', '#3f9cff'];
  const ps = Array.from({ length: n }, (_, i) => {
    const a = Math.random() * Math.PI * 2, v = (kind === 'leaf' ? 4 + Math.random() * 11 : 9 + Math.random() * 16) * s;
    return {
      x: W / 2, y: H * 0.46, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (kind === 'leaf' ? 6 * s : 0), r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
      w: (kind === 'leaf' ? 5 + Math.random() * 7 : 6 + Math.random() * 14) * s, h: (kind === 'leaf' ? 3 + Math.random() * 4 : 4 + Math.random() * 10) * s,
      c: cols[i % cols.length], delay: kind === 'leaf' ? Math.random() * 12 : 0, life: 0,
    };
  });
  const t0 = performance.now();
  const frame = () => {
    const age = (performance.now() - t0) / 1000;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    for (const p of ps) {
      if (p.delay > 0) { p.delay--; continue; }
      p.life++;
      p.vx *= kind === 'leaf' ? 0.965 : 0.94;
      p.vy = p.vy * (kind === 'leaf' ? 0.965 : 0.94) + (kind === 'leaf' ? 0.32 : 0.5) * s;
      p.x += p.vx + (kind === 'leaf' ? Math.sin(p.life * 0.08 + p.r) * 0.8 * s : 0);
      p.y += p.vy;
      p.r += p.vr;
      g.save();
      g.translate(p.x, p.y);
      g.rotate(p.r);
      g.scale(1, kind === 'leaf' ? Math.cos(p.life * 0.15 + p.r) : 1);
      g.globalAlpha = kind === 'leaf' ? Math.max(0, Math.min(1, 4 - age * 0.9)) : Math.max(0, 1 - age * 1.3);
      g.fillStyle = p.c;
      if (kind === 'leaf') g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      else { g.beginPath(); g.moveTo(-p.w / 2, p.h / 2); g.lineTo(p.w / 2, p.h / 3); g.lineTo(0, -p.h / 2); g.closePath(); g.fill(); }
      g.restore();
    }
    if (age < 5) raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(raf);
}
