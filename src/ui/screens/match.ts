// The screens over a running match, blocked out: the HUD, death, victory, and the results (the Gale and spectating
// are drawn on the chart). Over the sea only small boxes in the corners take touches; everything else lets them through to the
// controls layer underneath, where the stick and the look live.
import { REGIONS } from '../../sim/world/index.ts';
import {
  ABILITY_ICON, button, ceremony, chartMark, chip, cosmeticArt, el, EMBLEM, emblemBadge, esc, hydrate, ICON, mmss, ordinal, PERK_ICON, progressBar,
  rarityFrame, WEATHER_ICON, type BarHandle,
} from '../parts/index.ts';
import type { ConsumableId, DeathModel, HudModel, ResultsModel, Slot, VictoryModel, WeaponId } from '../model.ts';
import { CONSUMABLE, WEAPON_NAME } from '../model.ts';
import type { ScreenView } from '../shell.ts';
import { LandLayer } from './chart.ts';
import { page } from './frame.ts';
import './match.css';

/** What the HUD's buttons do: hold or let go of a control, pick or trade hotbar slots, set the sails, or call a gull. */
export type HoldWhat = 'fire' | 'gust' | 'reload' | 'ability' | 'take' | 'hail' | 'dive' | 'drop';

export interface HudActions {
  press(what: HoldWhat, down: boolean): void;
  pick(slot: number): void;
  /** A slot dragged onto another: the two trade places. */
  trade(from: number, to: number): void;
  /** The sails set: 1 full, 0.5 half, 0 furled. */
  sails(v: number): void;
  /** A gull called for a parcel tier. */
  call(tier: number): void;
  /** Names an element for the juice to pop, squash or count up; null as the HUD leaves. */
  target?(name: string, el: HTMLElement | null): void;
}

/** A ship's mark on the map, CSS pixels across: the chart mark's size. */
const MARK = 24;

/** The weather as the HUD names it. */
const WEATHER_WORD = { fog: 'Fog', rain: 'Rain', thunder: 'Thunder', calm: 'Calm', snow: 'Snow', ash: 'Ash' } as const;
const PERK_NAME = new Map(REGIONS.map((r) => [r.perk as string, r.perkName]));

/** A box over the sea that takes the touches landing on it. */
const box = (cls: string, parent: Element, html?: string) => el(`s-mx__box ${cls}`, parent, html);

/** A round control held while a finger is on it. */
function holdButton(cls: string, icon: string, label: string, parent: Element, what: HoldWhat, a: HudActions): HTMLElement {
  const b = box(`s-mx__hold ${cls}`, parent, `<i class="s-mx__holdI">${icon}</i><span class="s-mx__holdL">${esc(label)}</span><b class="s-mx__holdN"></b>`);
  b.dataset.what = what;
  const up = (e: PointerEvent) => {
    if (!b.classList.contains('is-down')) return;
    b.classList.remove('is-down');
    a.press(what, false);
    e.stopPropagation();
  };
  b.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    e.preventDefault();
    b.setPointerCapture?.(e.pointerId);
    b.classList.add('is-down');
    a.press(what, true);
  });
  b.addEventListener('pointerup', up);
  b.addEventListener('pointercancel', up);
  b.addEventListener('lostpointercapture', up);
  return b;
}

// ── the HUD ──

export interface HudView extends ScreenView {
  set(m: HudModel): void;
}

const slotIcon = (s: Slot): string => (s.kind === 'weapon' ? ICON[s.weapon] : s.kind === 'consumable' ? ICON[s.item] : '');
const slotName = (s: Slot): string => (s.kind === 'weapon' ? WEAPON_NAME[s.weapon as WeaponId] : s.kind === 'consumable' ? CONSUMABLE[s.item as ConsumableId].name : '');

export function hudScreen(m: HudModel, a: HudActions): HudView {
  const root = el('s-mx s-hud');

  const vit = box('s-hud__vit p-smoke', root);
  const shield = progressBar({ kind: 'shield', value: 0, label: '', icon: ICON.shield, parent: vit });
  const hull = progressBar({ kind: 'hull', value: 0, label: '', icon: ICON.hull, parent: vit });
  // her parts, under the bars: a mark for each that is hurt, amber then red, and the fallen mast's countdown
  const partsRow = el('s-hud__parts', vit);
  const partMark = (name: string, icon: string) => {
    const e = el('s-hud__part', partsRow, `<i>${icon}</i><b></b>`);
    e.dataset.part = name;
    return { el: e, label: e.querySelector('b')! };
  };
  const pSail = partMark('sail', ICON.sail), pMast = partMark('mast', ICON.mast), pRudder = partMark('rudder', ICON.rudder);
  const pFlood = partMark('flood', ICON.leak), pFire = partMark('fire', ICON.fire), pIce = partMark('ice', EMBLEM.snowflake);
  const grade = (m: { el: HTMLElement }, k: number, bad: number, title: string) => {
    const lvl = k >= bad ? 'bad' : k >= 0.15 ? 'hurt' : '';
    m.el.dataset.lvl = lvl;
    m.el.classList.toggle('is-on', lvl !== '');
    m.el.title = title;
  };

  const info = box('s-hud__info p-smoke', root);
  const storm = el('s-hud__storm', info);
  const count = el('s-hud__count', info);
  const counter = (icon: string) => el('s-hud__n', el('', count, `<i>${icon}</i>`, 'span'), '', 'b');
  const nShips = counter(ICON.flag), nKills = counter(ICON.sink), nCoins = counter(ICON.coin);
  const map = box('s-hud__map', root);
  const canvas = el<HTMLCanvasElement>('s-hud__mapC', map, undefined, 'canvas');

  const where = box('s-hud__where p-smoke', root);
  // under it, what the sea is doing round you and the perks you hold; they take no touches
  const state = el('s-hud__state', root);
  let stateKey = '';
  const land = new LandLayer();

  const bar = box('s-hud__bar', root);
  // the gull: a tap opens the parcels, priced in coins; a parcel you can't call yet is greyed
  const gull = el('s-hud__slot s-hud__act s-hud__gull', bar, `<i class="s-hud__slotI">${ICON.gull}</i><span class="s-hud__slotN"></span>`);
  gull.dataset.what = 'hud:gull';
  const tray = el('s-hud__tray p-smoke', bar);
  const parcels = m.gull.parcels.map((pc, t) => button({
    label: pc.name, sub: `${pc.price}`, icon: ICON.coin, kind: 'secondary', size: 'sm', parent: tray, what: `hud:parcel${t}`,
    onPress: () => {
      if (!lastGull[t]) return;
      a.call(t);
      tray.classList.remove('is-on');
    },
  }));
  let lastGull: boolean[] = m.gull.parcels.map((pc) => pc.ready);
  gull.addEventListener('pointerdown', (e) => { e.stopPropagation(); tray.classList.toggle('is-on'); });

  // a slot tapped is selected; dragged onto another, the two trade places
  const slots: { el: HTMLElement; ring: HTMLElement; count: HTMLElement }[] = [];
  let drag: { from: number; id: number; x: number; moved: boolean } | null = null;
  const slotAt = (x: number, y: number): number => {
    const t = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest<HTMLElement>('.s-hud__slot[data-slot]');
    return t ? Number(t.dataset.slot) : -1;
  };
  const endDrag = (e: PointerEvent, drop: boolean) => {
    if (!drag || drag.id !== e.pointerId) return;
    const to = drop && drag.moved ? slotAt(e.clientX, e.clientY) : -1;
    if (to >= 0 && to !== drag.from) a.trade(drag.from, to);
    for (const v of slots) v.el.classList.remove('is-lift', 'is-over');
    drag = null;
  };
  for (let k = 0; k < 5; k++) {
    const s = el('s-hud__slot', bar);
    s.dataset.slot = String(k);
    s.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      a.pick(k);
      s.setPointerCapture?.(e.pointerId);
      drag = { from: k, id: e.pointerId, x: e.clientX, moved: false };
    });
    s.addEventListener('pointermove', (e) => {
      if (!drag || drag.id !== e.pointerId) return;
      if (!drag.moved && Math.abs(e.clientX - drag.x) < 12) return;
      drag.moved = true;
      const over = slotAt(e.clientX, e.clientY);
      slots.forEach((v, j) => { v.el.classList.toggle('is-lift', j === drag!.from); v.el.classList.toggle('is-over', j === over && j !== drag!.from); });
    });
    s.addEventListener('pointerup', (e) => endDrag(e, true));
    s.addEventListener('pointercancel', (e) => endDrag(e, false));
    slots.push({ el: s, ring: el('s-hud__ring', s), count: el('s-hud__slotN', s) });
  }
  const dropB = el('s-hud__slot s-hud__act s-hud__drop', bar, `<i class="s-hud__slotI">${ICON.drop}</i><span class="s-hud__slotN">Drop</span>`);
  dropB.dataset.what = 'hud:drop';
  dropB.addEventListener('pointerdown', (e) => { e.stopPropagation(); a.press('drop', true); a.press('drop', false); });
  const using = el('s-hud__using', bar);
  const usingBar: BarHandle = progressBar({ kind: 'plain', value: 0, parent: using });

  // the sails, under the stick's thumb: full, half, or furled to a stop
  const sails = box('s-hud__sails p-smoke', root);
  const sailSteps = ([[1, 'Full'], [0.5, 'Half'], [0, 'Stop']] as const).map(([v, label]) => {
    const b = el('s-hud__sail', sails, `<i>${v ? ICON.sail : ICON.anchor}</i><span>${label}</span>`);
    b.dataset.what = `hud:sails${label.toLowerCase()}`;
    b.dataset.v = String(v);
    b.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); a.sails(v); });
    return b;
  });

  // a heavy gun winding up on you: a marker round the middle of the screen, the way it lies from your aim, filling as
  // it nears firing, with the gun's name under the crosshair
  const aimed = el('s-hud__aimed', root);
  const aimedArc = el('s-hud__aimedArc', aimed);
  el('s-hud__aimedTip', aimedArc, ICON.target, 'i');
  const aimedName = el('s-hud__aimedName', aimed);

  const take = box('s-hud__take', root);
  const takeB = button({ label: 'Take', icon: ICON.hand, kind: 'secondary', size: 'sm', parent: take, what: 'hud:take', onPress: () => { a.press('take', true); a.press('take', false); } });

  const pad = box('s-hud__pad', root);
  const fireB = holdButton('s-hud__fire', ICON.cannon, 'Fire', pad, 'fire', a);
  // in a seaway, a ring round Fire that fills as the deck steadies at the top of each roll
  const steadyRing = el('s-hud__steady', fireB);
  const gust = holdButton('s-hud__gust', ICON.gust, 'Gust', pad, 'gust', a);
  const abil = holdButton('s-hud__abil', ICON.star, 'Ability', pad, 'ability', a);
  const reload = holdButton('s-hud__reload', ICON.reload, 'Reload', pad, 'reload', a);

  const drawMap = (mv: HudModel['map'], tide: number) => {
    // not laid out yet (the screen is still being mounted): the next refresh draws it
    const size = Math.round(map.clientWidth * devicePixelRatio);
    if (size < 8) return;
    if (canvas.width !== size) canvas.width = canvas.height = size;
    const g = canvas.getContext('2d');
    if (!g) return;
    const c = size / 2, k = c / mv.range;
    g.clearRect(0, 0, size, size);
    g.save();
    g.beginPath();
    g.arc(c, c, c - 1, 0, Math.PI * 2);
    g.clip();
    // the land and the sea, against the tide
    land.draw(g, c, mv.lat, mv.lon, mv.range, tide);
    // north stays up; x east, y north
    const at = (x: number, y: number) => [c + x * k, c - y * k] as const;
    if (mv.storm) {
      // everything outside the safe circle under the Storm's wash
      const [sx, sy] = at(mv.storm.x, mv.storm.y);
      g.beginPath();
      g.rect(0, 0, size, size);
      g.arc(sx, sy, mv.storm.r * k, 0, Math.PI * 2, true);
      g.fillStyle = 'rgba(70, 40, 110, 0.42)';
      g.fill('evenodd');
    }
    if (mv.next) {
      const [nx, ny] = at(mv.next.x, mv.next.y);
      g.strokeStyle = 'rgba(255, 255, 255, 0.9)'; g.lineWidth = 1.5 * devicePixelRatio;
      g.beginPath(); g.arc(nx, ny, mv.next.r * k, 0, Math.PI * 2); g.stroke();
    }
    for (const mk of mv.marks) {
      const [x, y] = at(mk.x, mk.y);
      g.fillStyle = mk.kind === 'loot' ? '#c99a2e' : '#fff';
      g.fillRect(x - 2 * devicePixelRatio, y - 2 * devicePixelRatio, 4 * devicePixelRatio, 4 * devicePixelRatio);
    }
    // each ship by her captain's mark; one only spotted, faint
    const mark = Math.round(MARK * devicePixelRatio);
    for (const sh of mv.ships) {
      const [x, y] = at(sh.x, sh.y);
      g.globalAlpha = sh.spotted ? 0.55 : 1;
      g.drawImage(chartMark(sh.emblem, sh.colour, mark), x - mark / 2, y - mark / 2);
    }
    g.globalAlpha = 1;
    g.translate(c, c);
    g.rotate(mv.heading);
    g.fillStyle = '#1d1208';
    g.beginPath();
    const u = 6 * devicePixelRatio;
    g.moveTo(0, -u * 1.4); g.lineTo(u, u); g.lineTo(0, u * 0.5); g.lineTo(-u, u); g.closePath(); g.fill();
    g.restore();
  };

  const set = (h: HudModel) => {
    shield.set(h.shield / h.shieldMax, false);
    shield.setLabel(`${h.shield}`);
    hull.set(h.hull / h.hullMax, false);
    hull.setLabel(`${h.hull}`);
    hull.el.classList.toggle('is-low', h.hull < 35);
    const p = h.parts;
    grade(pSail, p.sail, 0.6, 'Canvas torn: less drive');
    pSail.label.textContent = p.sail >= 0.15 ? `${Math.round(p.sail * 100)}%` : '';
    if (p.down > 0) {
      pMast.el.dataset.lvl = 'bad';
      pMast.el.classList.add('is-on');
      pMast.el.title = 'Mainmast down: rigging a jury mast';
      pMast.label.textContent = `${Math.ceil(p.down)}s`;
    } else {
      grade(pMast, p.mast, 0.7, p.jury ? 'Jury mast: less sail than she had' : 'Mainmast sprung');
      if (p.jury) { pMast.el.dataset.lvl = pMast.el.dataset.lvl || 'jury'; pMast.el.classList.add('is-on'); }
      pMast.label.textContent = p.jury ? 'jury' : '';
    }
    grade(pRudder, p.rudder, 0.5, 'Rudder shot about: slow to turn');
    pRudder.label.textContent = '';
    grade(pFlood, p.flood / p.sinks, 0.75, p.flood > p.sinks ? 'Foundering: get her pumped or mended' : 'Taking water: heavy and listing');
    pFlood.label.textContent = p.flood >= 0.08 ? `${Math.round(p.flood * 100)}%` : '';
    pFlood.el.classList.toggle('is-sinking', p.flood > p.sinks);
    pFire.el.dataset.lvl = p.burning ? 'bad' : '';
    pFire.el.classList.toggle('is-on', p.burning);
    pFire.el.title = 'On fire: canvas burning';
    // ice: amber as it starts to tell on her turning, red when she is iced up
    grade(pIce, p.ice, 0.7, 'Iced up: slow to turn');
    pIce.label.textContent = p.ice >= 0.15 ? `${Math.round(p.ice * 100)}%` : '';
    partsRow.classList.toggle('is-on', partsRow.querySelector('.is-on') !== null);
    const st = h.storm;
    const line = `<i>${ICON.storm}</i><span>${st.shrinking ? 'Storm closing' : `Storm ${st.phase + 1}/${st.phases}`} · ${mmss(st.seconds)}</span>`;
    if (storm.dataset.html !== line) storm.innerHTML = storm.dataset.html = line;
    storm.classList.toggle('is-out', st.outside);
    nShips.textContent = `${h.ships}`;
    nKills.textContent = `${h.kills}`;
    nCoins.textContent = `${h.coins}`;
    where.innerHTML = `<b>${esc(h.region)}</b>${h.perk ? `<span>${esc(h.perk)}</span>` : ''}${h.night ? `<i>${ICON.moon}</i>` : ''}`;
    h.slots.forEach((s, k) => {
      const v = slots[k];
      v.el.classList.toggle('is-sel', k === h.selected);
      v.el.classList.toggle('is-empty', s.kind === 'empty');
      v.el.dataset.rarity = s.kind === 'weapon' ? String(s.rarity) : '';
      // what is in the slot is rebuilt only when it changes, so a weapon's render isn't asked for again each shot
      const what = s.kind === 'weapon' ? `w:${s.weapon}` : s.kind === 'consumable' ? `c:${s.item}` : '';
      if (v.el.dataset.what !== what) {
        v.el.dataset.what = what;
        // a weapon is shown as the studio draws it on its mount, its glyph standing in until the render arrives
        const studio = s.kind === 'weapon' ? ` data-studio="weapon:${s.weapon}"` : '';
        v.el.innerHTML = `<i class="s-hud__slotI"${studio}>${slotIcon(s)}</i><span class="s-hud__slotN"></span>`;
        v.el.title = slotName(s);
        v.count = v.el.querySelector('.s-hud__slotN')!;
        v.ring = el('s-hud__ring', v.el);
        if (studio) hydrate(v.el);
      }
      const n = s.kind === 'weapon' ? `${s.ammo}/${s.mag}` : s.kind === 'consumable' ? `×${s.count}` : '';
      if (v.count.textContent !== n) v.count.textContent = n;
      v.ring.style.transform = `scaleX(${s.kind === 'weapon' ? s.reload : 0})`;
    });
    using.classList.toggle('is-on', h.using !== null);
    if (h.using) usingBar.set(h.using.progress, false);
    const sel = h.slots[h.selected];
    dropB.classList.toggle('is-off', !sel || sel.kind === 'empty');
    for (const b of sailSteps) b.classList.toggle('is-sel', Number(b.dataset.v) === h.throttle);
    lastGull = h.gull.parcels.map((pc) => pc.ready);
    h.gull.parcels.forEach((pc, t) => {
      const b = parcels[t];
      if (!b) return;
      b.setDisabled(!pc.ready);
      const sub = b.el.querySelector('.p-btn__sub');
      if (sub && sub.textContent !== `${pc.price}`) sub.textContent = `${pc.price}`;
    });
    gull.querySelector('.s-hud__slotN')!.textContent = `${h.gull.price}`;
    gull.classList.toggle('is-off', !h.gull.ready);
    take.classList.toggle('is-on', h.pickup !== null);
    if (h.pickup) takeB.el.title = h.pickup;
    gust.querySelector('.s-mx__holdN')!.textContent = `${h.gust.charges}`;
    gust.classList.toggle('is-off', h.gust.charges === 0);
    abil.querySelector('.s-mx__holdN')!.textContent = h.ability.ready >= 1 ? '' : `${h.ability.seconds}`;
    abil.classList.toggle('is-off', h.ability.ready < 1);
    reload.classList.toggle('is-off', h.slots[h.selected]?.kind !== 'weapon');
    aimed.classList.toggle('is-on', h.aimed !== null);
    if (h.aimed) {
      aimedArc.style.setProperty('--b', `${h.aimed.bearing.toFixed(3)}rad`);
      aimedArc.style.setProperty('--w', h.aimed.wound.toFixed(2));
      if (aimedName.textContent !== h.aimed.weapon) aimedName.textContent = h.aimed.weapon;
    }
    fireB.classList.toggle('is-rolling', h.steady !== null);
    if (h.steady !== null) steadyRing.style.setProperty('--steady', h.steady.toFixed(2));
    // the weather you are in, the tide's level and way, then the perks you hold
    const level = Math.round(((h.tide.level + 1) / 2) * 10);
    const key = `${h.weather}|${level}|${h.tide.rising}|${h.perks.join()}`;
    if (key !== stateKey) {
      stateKey = key;
      state.replaceChildren();
      if (h.weather) chip(WEATHER_ICON[h.weather], WEATHER_WORD[h.weather], { small: true, parent: state, className: 's-hud__wx' });
      const tide = chip(EMBLEM.waves, 'Tide', { small: true, parent: state, className: 's-hud__tide' });
      tide.dataset.way = h.tide.rising ? 'up' : 'down';
      tide.title = h.tide.rising ? 'The tide is rising' : 'The tide is falling';
      el('s-hud__tideA', tide, ICON.up, 'i');
      el('s-hud__gauge', tide, '', 'b').style.setProperty('--level', `${level * 10}%`);
      for (const id of h.perks) chip(PERK_ICON[id] ?? ICON.star, '', { small: true, gold: true, title: PERK_NAME.get(id) ?? id, parent: state });
      // a first-time tip sits under the row, however many lines it wraps to
      const pui = root.closest<HTMLElement>('.pui');
      if (pui && state.offsetHeight) pui.style.setProperty('--hud-state', `${state.offsetHeight}px`);
    }
    drawMap(h.map, h.tide.level);
  };
  set(m);
  const named: [string, HTMLElement][] = [
    ['shield', shield.el], ['hull', hull.el], ['shieldValue', shield.el.querySelector<HTMLElement>('.p-bar__label')!],
    ['hullValue', hull.el.querySelector<HTMLElement>('.p-bar__label')!], ['hotbar', bar], ['gust', gust], ['kills', nKills],
  ];
  for (const [n, e] of named) a.target?.(n, e);
  return { el: root, set, leave: () => { for (const [n] of named) a.target?.(n, null); } };
}

// ── death and victory ──

export function deathScreen(m: DeathModel, a: { onSpectate(): void; onLeave(): void }): ScreenView {
  const root = el('s-mx s-end');
  const card = box('s-end__card p-paper', root);
  el('s-end__kicker', card, 'Sunk');
  el('s-end__place', card, `${ordinal(m.place)} <span>of ${m.ships}</span>`);
  if (m.killer) {
    const k = m.killer, who = el('s-end__who', card);
    emblemBadge(k.emblem, k.colours, { parent: who });
    const grudge = k.grudge > 0 ? ' · holds a grudge' : '';
    el('s-end__whoT', who, `<b>${esc(k.name)}</b><span>${esc([k.rank, k.temperament].filter(Boolean).join(' · ') + grudge)}</span>`);
  }
  el('s-end__by', card, sunkBy(m));
  stats(card, m.kills, m.damage, m.survived);
  const row = el('s-end__row', card);
  button({ label: 'Spectate', icon: ICON.eye, kind: 'secondary', parent: row, what: 'death:spectate', onPress: a.onSpectate });
  button({ label: 'Leave', icon: ICON.leave, kind: 'primary', parent: row, what: 'death:leave', onPress: a.onLeave });
  return { el: root };
}

/** How the player's ship went down, in a line: "rammed by Sirocchia", "by Sirocchia, in the Storm", "by the sea". */
const HOW: Record<string, [string, string]> = {
  ram: ['rammed by %', 'rammed'], burn: ['burned out by %', 'burned out'], ink: ['by %, in the ink', 'in the ink'],
  mine: ["by %'s mine", 'by a mine'], wave: ["by %'s wave", 'by a wave'], storm: ['by %, in the Storm', 'by the Storm'],
  lightning: ['by %, under lightning', 'by lightning'], ash: ['by %, in the ash', 'by the ash'], whale: ['by %, and the whale', 'by the whale'],
  rock: ['by %, under falling rock', 'by falling rock'], flood: ['holed below the waterline by %', 'swamped and foundered'],
};

function sunkBy(m: DeathModel): string {
  const who = m.killer ? `<b>${esc(m.killer.name)}</b>` : '', weapon = (WEAPON_NAME as Record<string, string>)[m.how];
  if (weapon) return who ? `by ${who}'s ${weapon.toLowerCase()}` : `by a stray ${weapon.toLowerCase()}`;
  const h = HOW[m.how];
  return h ? (who ? h[0].replace('%', who) : h[1]) : who ? `by ${who}` : 'by the sea';
}

/** The win: a full-screen ceremony first, then the card with the match's numbers once it is dismissed or done. */
export function victoryScreen(m: VictoryModel, a: { onContinue(): void }): ScreenView {
  const root = el('s-mx s-end s-end--win');
  const card = box('s-end__card p-paper is-waiting', root);
  void ceremony({
    kind: 'victory', kicker: 'Last ship afloat', art: ICON.crown, title: 'Victory', parent: root, ms: 6000,
    sub: `1st of ${m.ships} · ${m.kills} sunk`,
  }).then(() => card.classList.remove('is-waiting'));
  el('s-end__kicker', card, `${ICON.crown} Last ship afloat`);
  el('s-end__place', card, `1st <span>of ${m.ships}</span>`);
  stats(card, m.kills, m.damage, m.survived);
  const row = el('s-end__row', card);
  button({ label: 'Continue', icon: ICON.next, kind: 'gold', parent: row, what: 'victory:continue', onPress: a.onContinue });
  return { el: root };
}

function stats(parent: Element, kills: number, damage: number, survived: number): void {
  const s = el('s-end__stats', parent);
  for (const [v, l] of [[`${kills}`, 'Sunk'], [`${damage}`, 'Damage'], [mmss(survived), 'Afloat']] as const) el('s-end__stat', s, `<b>${v}</b><span>${l}</span>`);
}

// ── results ──

export function resultsScreen(m: ResultsModel, a: { onDone(): void }): ScreenView {
  const p = page({ title: 'Results', sub: `${ordinal(m.place)} of ${m.ships}`, onBack: a.onDone, className: 's-res' });
  const left = el('s-res__col p-paper', p.body);
  el('s-res__place', left, `${ordinal(m.place)} <span>of ${m.ships}</span>`);
  stats(left, m.kills, m.damage, m.survived);
  const xp = el('s-res__xp', left);
  for (const part of m.xp.parts) el('s-res__xpRow', xp, `<span>${esc(part.label)}</span><b>+${part.amount}</b>`);
  el('s-res__xpRow s-res__xpRow--total', xp, `<span>XP</span><b>+${m.xp.total}</b>`);

  const right = el('s-res__col p-paper', p.body);
  const lv = m.level;
  el('s-res__line', right, `<span>Level</span><b>${lv.before.level}${lv.after.level !== lv.before.level ? ` → ${lv.after.level}` : ''}</b>`);
  progressBar({ kind: 'xp', value: lv.after.into / lv.after.need, label: `${lv.after.into} / ${lv.after.need}`, parent: right });
  const rk = m.rank;
  el('s-res__line', right, `<span>Rank</span><b>${esc(rk.before.name)}${rk.change !== 'same' ? ` → ${esc(rk.after.name)}` : ''}</b>`);
  progressBar({ kind: 'rank', value: rk.after.progress, parent: right });
  // what the match unlocked, as the cards themselves: each cosmetic worn by the ship, each ability by its mark
  if (m.unlocked.abilities.length || m.unlocked.cosmetics.length) {
    el('s-res__kicker', right, 'Unlocked');
    const got = el('s-res__got', right);
    let k = 0;
    for (const ab of m.unlocked.abilities) {
      const c = el('s-res__reward', got);
      c.style.setProperty('--i', String(k++));
      rarityFrame(3, `<div class="p-art p-art--ink">${ABILITY_ICON[ab.id] ?? ICON.star}</div>`, { parent: c, className: 's-res__art' });
      el('s-res__rewardName', c, esc(ab.name));
    }
    for (const v of m.unlocked.cosmetics) {
      const c = el('s-res__reward', got);
      c.style.setProperty('--i', String(k++));
      rarityFrame(v.rarity, cosmeticArt(v), { parent: c, className: 's-res__art' });
      el('s-res__rewardName', c, esc(v.name));
    }
    hydrate(got);
  }
  const news: string[] = [];
  for (const r of m.newRegions) news.push(`Charted ${r.name}`);
  const WHAT = { sankYou: 'sank you', sunkByYou: 'was sunk by you', grudge: 'holds a grudge', firstMeeting: 'met you for the first time' } as const;
  // first meetings fold into one line: the first match meets the whole fleet
  const met = m.rivals.filter((r) => r.what === 'firstMeeting');
  for (const r of m.rivals) if (r.what !== 'firstMeeting' || met.length <= 3) news.push(`${r.name} ${WHAT[r.what]}`);
  if (met.length > 3) news.push(`Met ${met.length} captains for the first time`);
  const list = el('s-res__news', right);
  for (const n of news) el('s-res__newsRow', list, esc(n));
  const row = el('s-end__row', right);
  button({ label: 'Continue', icon: ICON.next, kind: 'gold', parent: row, what: 'results:continue', onPress: a.onDone });
  return p;
}
