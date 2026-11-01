// The gallery of every shared part, at the size of the frame it is in.
import {
  ABILITY_ICON, CONSUMABLE_ICON, COLOR, EMBLEM, ICON, KIND_ICON, RARITY, RANK_TIERS, SPACE, TYPE, WEAPON_ICON, button, card, ceremony, chip, countUp, el,
  emblemBadge, flyTo, header, iconButton, modal, panel, progressBar, rankBadge, rankSvg, rarityFrame, ring, seal, segmented, slider, stagger, stat, tabs, toggle,
  type Rarity,
} from '../src/ui/parts/index.ts';
import type { Shell } from '../src/ui/shell.ts';

export function partsGallery(shell: Shell): HTMLElement {
  const page = el('dev-parts');
  const top = header({ title: 'Parts', sub: shell.form === 'phone' ? 'iPhone' : 'iPad', parent: page, onBack: () => history.back() });
  top.right.append(chip(ICON.info, 'every part, from the tokens', {}));
  const scroll = el('dev-parts__scroll p-scroll', page);
  const section = (title: string) => {
    const p = panel({ title, kind: 'paper', ruled: true, parent: scroll, className: 'dev-sec' });
    return p.body;
  };
  const row = (parent: Element, label?: string) => {
    const r = el('dev-row', parent);
    if (label) el('dev-row__l t-micro t-soft', r, label);
    return el('dev-row__c', r);
  };

  // ---------------------------------------------------------------- tokens
  {
    const b = section('Tokens');
    const sw = row(b, 'Colour');
    for (const [n, v] of Object.entries(COLOR)) el('dev-sw', sw, `<i style="background:${v}"></i><span>${n}</span>`);
    const rr = row(b, 'Rarity');
    RARITY.forEach((r) => el('dev-sw', rr, `<i style="background:linear-gradient(180deg,${r.hi},${r.base},${r.lo})"></i><span>${r.name}</span>`));
    const ty = row(b, 'Type');
    for (const n of Object.keys(TYPE.tablet)) {
      const cls = n === 'display' ? 't-display' : n === 'h1' ? 't-h1' : n === 'h2' ? 't-h2' : n === 'h3' ? 't-h3' : n === 'micro' ? 't-micro' : n.startsWith('num') ? 't-num' : n === 'small' ? 't-small' : 't-body';
      el('dev-type', ty, `<span class="${cls}" style="font-size:var(--fs-${n})">Ag 12</span><span class="t-micro t-soft">${n}</span>`);
    }
    const sp = row(b, 'Space');
    SPACE.tablet.forEach((_, i) => { if (i) el('dev-space', sp, `<i style="width:var(--sp-${i});height:var(--sp-${i})"></i><span class="t-micro">${i}</span>`); });
    const ra = row(b, 'Radius and shadow');
    for (const r of ['sm', 'md', 'lg', 'xl']) el('dev-rad p-paper', ra, `<span class="t-micro">${r}</span>`).style.borderRadius = `var(--r-${r})`;
    for (const s of ['1', '2', '3']) el('dev-rad', ra, `<span class="t-micro">shadow ${s}</span>`).style.cssText = `box-shadow:var(--sh-${s});background:var(--c-paperHi);border-radius:var(--r-md)`;
  }

  // ---------------------------------------------------------------- buttons
  {
    const b = section('Buttons');
    for (const size of ['lg', 'md', 'sm'] as const) {
      const r = row(b, size === 'lg' ? 'Large' : size === 'md' ? 'Medium' : 'Small');
      button({ label: 'Play', icon: ICON.play, kind: 'gold', size, parent: r });
      button({ label: 'Equip', kind: 'primary', size, parent: r });
      button({ label: 'Back', icon: ICON.back, kind: 'secondary', size, parent: r });
      button({ label: 'Spectate', icon: ICON.eye, kind: 'dark', size, parent: r });
      button({ label: 'Locked', icon: ICON.lock, kind: 'primary', size, disabled: true, parent: r });
    }
    const big = row(b, 'Call to action');
    button({ label: 'Play', icon: ICON.play, sub: 'Double Storm today', kind: 'gold', size: 'lg', parent: big, className: 'dev-play' });
    const ib = row(b, 'Icon buttons');
    iconButton({ icon: ICON.gear, label: 'Settings', parent: ib });
    iconButton({ icon: ICON.back, label: 'Back', kind: 'dark', parent: ib });
    iconButton({ icon: ICON.close, label: 'Close', kind: 'wax', parent: ib });
    iconButton({ icon: ICON.abilities, label: 'Abilities', badge: 2, parent: ib });
    iconButton({ icon: ICON.locker, label: 'Locker', kind: 'dark', badge: '', parent: ib });
    iconButton({ icon: ICON.pause, label: 'Pause', kind: 'dark', size: 'sm', parent: ib });
    iconButton({ icon: ICON.map, label: 'Map', size: 'sm', parent: ib });
  }

  // ---------------------------------------------------------------- cards and rarity frames
  {
    const b = section('Cards and rarity frames');
    const r = row(b, 'Cards');
    const mk = (title: string, o: Parameters<typeof card>[0], rar: Rarity, icon: string) => {
      const c = card({ ...o, parent: r, className: 'dev-card', onPress: () => {} });
      rarityFrame(rar, icon, { parent: c.el, className: 'p-card__art dev-card__art' });
      el('p-card__body dev-card__body', c.el, `<div class="t-h3">${title}</div><div class="t-small t-soft">${o.locked ? 'Unlocks later' : 'Ready'}</div>`);
    };
    mk('Repair', { equipped: true }, 0, ABILITY_ICON.repair);
    mk('Ram', { selected: true }, 2, ABILITY_ICON.ram);
    mk('Decoy', { isNew: true }, 3, ABILITY_ICON.decoy);
    mk('Drift Mine', { locked: true, lockText: 'Level 34' }, 4, ABILITY_ICON.driftMine);
    const f = row(b, 'Rarity frames');
    ([0, 1, 2, 3, 4] as Rarity[]).forEach((k) => rarityFrame(k, [ICON.cannon, ICON.harpoon, ICON.mortar, ICON.repeater, ICON.broadside][k], { name: true, parent: f, className: 'dev-rframe' }));
  }

  // ---------------------------------------------------------------- panels
  {
    const b = section('Panels');
    const r = row(b);
    const p1 = panel({ title: 'Paper', kind: 'paper', ruled: true, parent: r, className: 'dev-panel' });
    el('t-small', p1.body, 'A rounded parchment sheet with an inked rule.');
    const p2 = panel({ title: 'Torn', kind: 'torn', parent: r, className: 'dev-panel' });
    el('t-small', p2.body, 'A torn-edged sheet, for the big pages.');
    const p3 = panel({ title: 'Smoke', kind: 'smoke', parent: r, className: 'dev-panel' });
    el('t-small', p3.body, 'Dark glass, over the live planet.');
  }

  // ---------------------------------------------------------------- controls
  {
    const b = section('Tabs, toggles, sliders, choices');
    const r1 = row(b, 'Tabs');
    tabs({ items: [{ id: 'a', label: 'Active', icon: ICON.abilities }, { id: 'p', label: 'Passive', icon: ICON.shield, badge: 1 }, { id: 'x', label: 'All' }], value: 'a', onChange: () => {}, parent: r1 });
    tabs({ items: Object.entries(KIND_ICON).map(([id, icon]) => ({ id, label: id, icon })), value: 'sailColour', onChange: () => {}, iconsOnly: true, parent: r1 });
    const r2 = row(b, 'Toggle, slider, segmented');
    toggle({ value: true, label: 'Haptics', onChange: () => {}, parent: r2 });
    toggle({ value: false, label: 'Invert', onChange: () => {}, parent: r2 });
    slider({ value: 0.7, label: 'Effects', onChange: () => {}, parent: r2 });
    segmented({ items: [{ id: 'battery', label: 'Battery' }, { id: 'balanced', label: 'Balanced' }, { id: 'cinematic', label: 'Cinematic' }], value: 'balanced', label: 'Quality', onChange: () => {}, parent: r2 });
  }

  // ---------------------------------------------------------------- progress
  {
    const b = section('Progress');
    const r = row(b, 'Bars');
    const xp = progressBar({ kind: 'xp', value: 0.62, label: '6 200 / 10 000 XP', parent: r, className: 'dev-bar' });
    progressBar({ kind: 'rank', value: 0.35, label: 'Gold II', parent: r, className: 'dev-bar' });
    const sh = progressBar({ kind: 'shield', value: 0.5, segments: 4, parent: r, className: 'dev-bar' });
    const hu = progressBar({ kind: 'hull', value: 0.8, parent: r, className: 'dev-bar' });
    progressBar({ kind: 'hull', value: 0.22, parent: r, className: 'dev-bar is-low' });
    progressBar({ kind: 'plain', value: 0.4, segments: 7, parent: r, className: 'dev-bar' });
    const rr = row(b, 'Rings and motion');
    for (const [c, v] of [['#3f9cff', 0.3], ['#ffd76e', 0.7], ['#fff6e2', 1]] as const) {
      const host = el('dev-ring', rr);
      ring({ color: c, width: 9, parent: host }).set(v);
    }
    button({ label: 'Hit', kind: 'secondary', size: 'sm', parent: rr, onPress: () => { sh.set(Math.max(0, sh.value() - 0.25)); if (sh.value() <= 0) hu.set(Math.max(0, hu.value() - 0.2)); } });
    button({ label: 'Heal', kind: 'secondary', size: 'sm', parent: rr, onPress: () => { sh.set(1); hu.set(1); } });
    const n = el('t-num dev-count', rr, '0');
    button({ label: 'Count', kind: 'secondary', size: 'sm', parent: rr, onPress: () => { void countUp(n, 1250, { tick: true }); xp.set(Math.random()); } });
    const coin = el('dev-coin', rr, `<span class="dev-coin__i">${ICON.coin}</span><span class="t-num">40</span>`);
    button({ label: 'Fly', kind: 'gold', size: 'sm', parent: rr, onPress: () => void flyTo(n, coin, { icon: ICON.coin, count: 7 }) });
  }

  // ---------------------------------------------------------------- badges
  {
    const b = section('Seals, ranks, emblems, chips, stats');
    const r1 = row(b, 'Seal');
    seal(7, { parent: r1 });
    seal(23, { cap: 'LVL', parent: r1 });
    const r2 = row(b, 'Every rank');
    RANK_TIERS.forEach((t, tier) => { for (let s = 1; s <= t.steps; s++) rankBadge(tier, s, { parent: r2 }); });
    const r2b = row(b, 'Rank, large');
    rankBadge(3, 2, { size: 'lg', parent: r2b });
    rankBadge(6, 1, { size: 'lg', parent: r2b });
    rankBadge(7, 1, { size: 'lg', parent: r2b });
    rankBadge(1, 1, { size: 'lg', locked: true, parent: r2b });
    const r3 = row(b, 'Emblems');
    const pal = ['#8e2a1a', '#1f3f6e', '#2f5e2a', '#5a2a6e', '#7a5a14', '#1e5a5e', '#3a3a3a'];
    Object.keys(EMBLEM).forEach((name, i) => emblemBadge(name, [pal[i % pal.length], '#f4e3c0'], { parent: r3 }));
    const r4 = row(b, 'Chips and stats');
    chip(ICON.sail, '17 left', { parent: r4 });
    chip(ICON.sink, '3', { parent: r4 });
    chip(ICON.coin, '120', { paper: true, parent: r4 });
    stat(ICON.trophy, 12, 'Wins', { parent: r4 });
    stat(ICON.sink, 341, 'Kills', { parent: r4 });
  }

  // ---------------------------------------------------------------- overlays
  {
    const b = section('Toasts, pop-ups, ceremonies');
    const r = row(b);
    button({ label: 'Toast', kind: 'secondary', size: 'sm', parent: r, onPress: () => shell.toasts.show({ icon: ICON.repairKit, text: 'Repair Kit ×2', sub: 'picked up', color: 'var(--rar1)' }) });
    button({ label: 'Pop-up', kind: 'secondary', size: 'sm', parent: r, onPress: () => modal({ title: 'Leave the match?', body: 'You will be placed where you stand, and keep the XP you have earned.', parent: shell.overlay, dismissable: true, actions: [{ label: 'Stay', kind: 'secondary' }, { label: 'Leave', kind: 'primary' }] }) });
    const cer = (kind: Parameters<typeof ceremony>[0]['kind']) => () => {
      const o = {
        victory: { kicker: 'First of twenty', title: 'Victory', sub: '7 sunk · 2 140 damage', art: ICON.crown },
        levelUp: { kicker: 'Level up', title: 'Level 12', sub: 'Smoke Screen unlocked', art: `<div class="p-seal" style="width:100%;height:100%;font-size:calc(90px * var(--k))">12</div>` },
        rankUp: { kicker: 'Rank up', title: 'Gold I', sub: 'You will not drop below Gold', art: rankSvg(3, 1), color: '#ffe38a', colorDeep: '#c7901c' },
        unlock: { kicker: 'New ability', title: 'Decoy', sub: 'Leave a ghost ship that sails on and draws fire.', art: ABILITY_ICON.decoy, color: '#dcb0ff', colorDeep: '#a64ff0' },
        shieldBreak: { title: '', color: '#a8d6ff', colorDeep: '#3f9cff' },
      }[kind];
      void ceremony({ kind, parent: shell.overlay, ...o });
    };
    for (const k of ['victory', 'levelUp', 'rankUp', 'unlock', 'shieldBreak'] as const) button({ label: k, kind: 'secondary', size: 'sm', parent: r, onPress: cer(k) });
    const r2 = row(b, 'At rest');
    el('p-toast dev-static', r2, `<span class="p-toast__icon" style="--tc:var(--rar2)">${ICON.bigShield}</span><span>Big Shield</span><span class="p-toast__sub">picked up</span>`);
    const sheet = el('p-modal__sheet p-paper p-ruled dev-static dev-sheet', r2);
    el('p-modal__title t-h2', sheet, 'A pop-up');
    el('p-modal__body', sheet, 'Its sheet springs in over a dimmed screen.');
    const acts = el('p-modal__actions', sheet);
    button({ label: 'Cancel', kind: 'secondary', parent: acts });
    button({ label: 'OK', kind: 'primary', parent: acts });
  }

  // ---------------------------------------------------------------- glyphs
  {
    const b = section('Glyphs');
    const g = (label: string, set: Record<string, string>) => {
      const r = row(b, label);
      for (const [n, s] of Object.entries(set)) el('dev-glyph', r, `<i>${s}</i><span>${n}</span>`);
    };
    g('Weapons', WEAPON_ICON);
    g('Consumables', CONSUMABLE_ICON);
    g('Abilities', ABILITY_ICON);
    g('Cosmetics', KIND_ICON);
    g('Interface', ICON);
  }

  stagger(scroll, ':scope > .dev-sec');
  return page;
}
