// Small DOM helpers shared by every part and screen. Per-frame writers (text, css, cls) touch the DOM only when the
// value changed, so the HUD can call them every frame.

/** Makes an element with classes, appends it to a parent, and optionally fills it with HTML. */
export function el<T extends HTMLElement = HTMLDivElement>(cls: string, parent?: Element | null, html?: string, tag = 'div'): T {
  const e = document.createElement(tag) as T;
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  parent?.appendChild(e);
  return e;
}

const cache = new WeakMap<object, Record<string, string>>();
function put(e: Element, key: string, v: string, apply: (v: string) => void): void {
  let c = cache.get(e);
  if (!c) cache.set(e, (c = {}));
  if (c[key] === v) return;
  c[key] = v;
  apply(v);
}

/** Sets text content, only when it changed. */
export const text = (e: Element, v: string | number): void => put(e, '#text', String(v), (s) => { e.textContent = s; });
/** Sets an inline style property, only when it changed. */
export const css = (e: Element, prop: string, v: string): void => put(e, prop, v, (s) => (e as HTMLElement).style.setProperty(prop, s));
/** Sets an attribute, only when it changed. */
export const attr = (e: Element, name: string, v: string): void => put(e, '@' + name, v, (s) => e.setAttribute(name, s));
/** Sets inner HTML, only when it changed. */
export const html = (e: Element, v: string): void => put(e, '#html', v, (s) => { e.innerHTML = s; });
/** Toggles a class, only when it changed. */
export const cls = (e: Element, c: string, on: boolean): void => { if (e.classList.contains(c) !== on) e.classList.toggle(c, on); };
/** Replays a CSS animation class. */
export const restart = (e: HTMLElement, c: string): void => { e.classList.remove(c); void e.offsetWidth; e.classList.add(c); };

/** Escapes text for HTML. */
export const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Minutes and seconds, as 3:07. */
export const mmss = (s: number): string => {
  const t = Math.max(0, Math.ceil(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};


/** An ordinal place, as 1st, 2nd, 13th. */
export const ordinal = (n: number): string => {
  const t = n % 100, u = n % 10;
  return n + (t >= 11 && t <= 13 ? 'th' : u === 1 ? 'st' : u === 2 ? 'nd' : u === 3 ? 'rd' : 'th');
};

