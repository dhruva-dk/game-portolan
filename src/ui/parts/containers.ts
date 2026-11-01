// Cards, rarity frames, panels and the screen header: the containers every screen is built from.
import { iconButton } from './button.ts';
import { el, esc } from './dom.ts';
import type { UiHaptic, UiSound } from './feedback.ts';
import { ICON } from './icons.ts';
import { press } from './press.ts';
import { RARITY, type Rarity } from './tokens.ts';

export interface CardOptions {
  className?: string;
  selected?: boolean;
  locked?: boolean;
  /** Shown on the lock tag when locked, such as "Level 12". */
  lockText?: string;
  equipped?: boolean;
  isNew?: boolean;
  sound?: UiSound;
  haptic?: UiHaptic;
  onPress?: () => void;
  parent?: Element;
}

export interface CardHandle {
  el: HTMLElement;
  setSelected(v: boolean): void;
}

/** A parchment card. Fill it with art and body; it shows selection, a lock with its rule, equipped and new. */
export function card(o: CardOptions = {}): CardHandle {
  const c = el(`p-card${o.className ? ' ' + o.className : ''}`, o.parent);
  c.dataset.part = 'card';
  if (o.locked) {
    c.classList.add('is-locked');
    const t = lockTag(o.lockText ?? 'Locked', c);
    t.style.left = '50%';
    t.style.top = '50%';
    t.style.transform = 'translate(-50%, -50%)';
  }
  if (o.equipped) equippedTag(c);
  if (o.isNew && !o.locked) newTag(c);
  const setSelected = (v: boolean) => c.classList.toggle('is-selected', v);
  setSelected(!!o.selected);
  if (o.onPress) press(c, () => o.onPress!(), { sound: o.sound ?? 'select', haptic: o.haptic ?? 'selection' });
  return { el: c, setSelected };
}

/** A lock tag with the unlock rule. */
export function lockTag(text: string, parent?: Element): HTMLElement {
  return el('p-lock', parent, `<span class="p-lock__i">${ICON.lock}</span><span>${esc(text)}</span>`);
}
/** The green "equipped" tag. */
export function equippedTag(parent?: Element): HTMLElement {
  const t = el('p-equipped', parent, `${ICON.check}<span>Equipped</span>`);
  t.style.top = 'calc(6px * var(--k))';
  t.style.left = 'calc(6px * var(--k))';
  return t;
}
/** The gold "new" tag. */
export function newTag(parent?: Element): HTMLElement {
  const t = el('p-new', parent, 'New');
  t.style.top = 'calc(6px * var(--k))';
  t.style.right = 'calc(6px * var(--k))';
  return t;
}

/** A rarity frame round some art: the rarity's colour as border, light and name band. */
export function rarityFrame(rarity: Rarity, art: string, o: { name?: boolean; parent?: Element; className?: string } = {}): HTMLElement {
  const f = el(`p-rar p-rar--${rarity}${o.className ? ' ' + o.className : ''}`, o.parent, `<div class="p-rar__art">${art}</div>`);
  f.dataset.rarity = RARITY[rarity].id;
  if (o.name) el('p-rar__name', f, RARITY[rarity].name);
  return f;
}

/** A small rarity gem and name, for text. */
export const rarityLabel = (r: Rarity): string => `<span class="p-rar--${r}" style="display:inline-flex;align-items:center;gap:.35em;font-family:var(--f-display);font-weight:800;color:var(--rl)"><i class="p-rargem p-rar--${r}"></i>${RARITY[r].name}</span>`;

export interface PanelOptions {
  title?: string;
  /** 'paper' (rounded parchment), 'torn' (torn-edged sheet), 'smoke' (dark glass over the scene). */
  kind?: 'paper' | 'torn' | 'smoke';
  ruled?: boolean;
  parent?: Element;
  className?: string;
}

export interface PanelHandle {
  el: HTMLElement;
  head: HTMLElement | null;
  body: HTMLElement;
}

/** A panel: a sheet with an optional title and a body. */
export function panel(o: PanelOptions = {}): PanelHandle {
  const kind = o.kind ?? 'paper';
  const p = el(`p-panel ${kind === 'smoke' ? 'p-smoke' : kind === 'torn' ? 'p-paper p-torn' : 'p-paper'}${o.ruled ? ' p-ruled' : ''}${o.className ? ' ' + o.className : ''}`, o.parent);
  p.dataset.part = 'panel';
  let head: HTMLElement | null = null;
  if (o.title) head = el('p-panel__head', p, `<div class="p-panel__title">${esc(o.title)}</div>`);
  const body = el('p-panel__body', p);
  return { el: p, head, body };
}

export interface HeaderOptions {
  title: string;
  sub?: string;
  onBack?: () => void;
  parent?: Element;
}

/** A screen's header: back in thumb reach on the left, then the title; the right side is for the screen. */
export function header(o: HeaderOptions): { el: HTMLElement; right: HTMLElement } {
  const h = el('p-header', o.parent);
  if (o.onBack) iconButton({ icon: ICON.back, label: 'Back', kind: 'dark', sound: 'back', parent: h, onPress: o.onBack });
  el('p-header__title', h, `<span>${esc(o.title)}</span>${o.sub ? `<span class="p-header__sub">${esc(o.sub)}</span>` : ''}`);
  const right = el('p-header__right', h);
  return { el: h, right };
}
