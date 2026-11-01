// The lobby's menus, each in the page frame over the planet: abilities, the locker, rivals, the career with its
// chart, the rank ladder, and the settings. Each renders from its model and calls back; the app changes the career
// and hands the screen the new model through set().
import { ability, type AbilityId } from '../../sim/abilities.ts';
import {
  button, card, clear, cosmeticArt, el, emblemBadge, esc, hydrate, ICON, KIND_ICON, mmss, panel, progressBar, rankBadge, rarityFrame,
  rarityLabel, segmented, slider, stagger, tabs, thousands, toggle,
} from '../parts/index.ts';
import {
  KINDS, RANK_LADDER, TIER_NAMES, rankByName, unlockText, type AbilitiesModel, type AbilityView, type CareerModel, type CosmeticKind,
  type LockerModel, type Quality, type RankModel, type RivalView, type RivalsModel, type Settings,
} from '../model.ts';
import type { ScreenView } from '../shell.ts';
import { abilityGlyph, playerPlate } from './bits.ts';
import { drawChart } from './chart.ts';
import { page } from './frame.ts';
import './menus.css';

export interface MenuView<M> extends ScreenView {
  set(m: M): void;
}

/** A labelled section inside a page. */
const section = (title: string, parent: Element, cls = ''): HTMLElement => {
  const s = el(`s-sec${cls ? ' ' + cls : ''}`, parent);
  el('s-label', s, esc(title));
  return s;
};

/** Keeps a scroller where it was across a re-render. */
function keepScroll(e: HTMLElement, fn: () => void): void {
  const top = e.scrollTop, left = e.scrollLeft;
  fn();
  e.scrollTop = top;
  e.scrollLeft = left;
}

// ── abilities ──

export function abilitiesScreen(m0: AbilitiesModel, a: { onBack(): void; onEquip(id: AbilityId): void }): MenuView<AbilitiesModel> {
  const p = page({ title: 'Abilities', sub: 'One active and one passive sail with you', onBack: a.onBack, className: 's-abil' });
  const list = el('s-abil__list p-scroll', p.body);
  const side = panel({ kind: 'paper', parent: p.body, className: 's-abil__side' });
  let m = m0, sel: AbilityId = m.active;

  const render = () => {
    keepScroll(list, () => {
      clear(list);
      for (const kind of ['active', 'passive'] as const) {
        const sec = section(kind === 'active' ? 'Actives · tap a control in battle' : 'Passives · always on', list);
        const grid = el('s-abil__grid', sec);
        for (const v of m.abilities.filter((x) => x.kind === kind)) {
          const c = card({
            className: 's-abil__card', selected: v.id === sel, locked: !v.unlocked, lockText: `Level ${v.level}`,
            equipped: v.id === m.active || v.id === m.passive, isNew: v.isNew, parent: grid,
            onPress: () => { sel = v.id; render(); },
          }).el;
          c.dataset.id = v.id;
          abilityGlyph(v.id, c, 's-abil__glyph');
          el('s-abil__name', c, esc(v.name));
          if (v.kind === 'active') el('s-abil__cd', c, `${v.cooldown}s`);
        }
      }
    });
    detail(m.abilities.find((x) => x.id === sel) ?? m.abilities[0]);
  };

  const detail = (v: AbilityView) => {
    const b = side.body;
    clear(b);
    const load = el('s-abil__load', b);
    for (const id of [m.active, m.passive]) {
      const s = el('s-abil__slot', load);
      abilityGlyph(id, s);
      const d = ability(id);
      el('s-abil__slotT', s, `<span>${d.kind === 'active' ? 'Active' : 'Passive'}</span><b>${esc(d.name)}</b>`);
    }
    const head = el('s-abil__head', b);
    abilityGlyph(v.id, head, 's-abil__big');
    el('s-abil__title', head, `<b class="t-h3">${esc(v.name)}</b><span class="t-micro t-soft">${v.kind === 'active' ? `Active · ${v.cooldown}s to recharge` : 'Passive'}</span>`);
    el('s-abil__text', b, esc(v.text));
    const foot = el('s-abil__foot', b);
    const worn = v.id === m.active || v.id === m.passive;
    if (!v.unlocked) el('s-abil__why', foot, `${ICON.lock}<span>Reach level ${v.level} to unlock</span>`);
    else if (worn) el('s-abil__why is-on', foot, `${ICON.check}<span>Sailing with it</span>`);
    else button({ label: `Equip ${v.kind === 'active' ? 'active' : 'passive'}`, kind: 'primary', parent: foot, what: `abilities:equip:${v.id}`, onPress: () => a.onEquip(v.id) });
  };

  render();
  stagger(list.querySelector('.s-abil__grid') ?? list);
  return { ...p, set: (x) => { m = x; render(); } };
}

// ── the locker ──

export function lockerScreen(
  m0: LockerModel,
  a: { onBack(): void; onEquip(id: string): void; onPreview(kind: CosmeticKind, id: string | null): void },
): MenuView<LockerModel> {
  const p = page({ title: 'Locker', sub: 'Your ship as the league sees it', onBack: a.onBack, backdrop: 'side', className: 's-lock' });
  const pane = el('s-lock__pane', p.body);
  let m = m0, kind: CosmeticKind = 'sailColour', sel: string = m.look[kind];
  const newIn = (k: CosmeticKind) => m.cosmetics.filter((c) => c.kind === k && c.isNew && c.unlocked).length;
  const bar = tabs({
    items: KINDS.map((k) => ({ id: k.kind, label: k.name, icon: KIND_ICON[k.kind], badge: newIn(k.kind) })), value: kind, iconsOnly: true, fill: true,
    parent: pane, className: 's-lock__tabs', onChange: (id) => { kind = id as CosmeticKind; sel = m.look[kind]; a.onPreview(kind, null); render(); },
  });
  const kindName = el('s-lock__kind s-label', pane);
  const grid = el('s-lock__grid p-scroll', pane);
  const foot = el('s-lock__foot p-paper', pane);

  const render = () => {
    kindName.textContent = KINDS.find((k) => k.kind === kind)?.name ?? '';
    keepScroll(grid, () => {
      clear(grid);
      for (const v of m.cosmetics.filter((c) => c.kind === kind)) {
        const c = card({
          className: 's-lock__card', selected: v.id === sel, locked: !v.unlocked, lockText: unlockText(v.unlock), equipped: m.look[kind] === v.id,
          isNew: v.isNew, parent: grid,
          onPress: () => { sel = v.id; a.onPreview(kind, v.id === m.look[kind] ? null : v.id); render(); },
        }).el;
        c.dataset.id = v.id;
        rarityFrame(v.rarity, cosmeticArt(v), { parent: c, className: 'p-card__art s-lock__art' });
        el('s-lock__name', c, esc(v.name));
      }
      hydrate(grid);
    });
    const v = m.cosmetics.find((c) => c.id === sel);
    clear(foot);
    if (!v) return;
    el('s-lock__info', foot, `<b class="s-lock__title">${esc(v.name)}</b><span class="s-lock__meta">${rarityLabel(v.rarity)} · ${esc(KINDS.find((k) => k.kind === v.kind)?.one ?? '')}</span><span class="s-lock__hint">${esc(v.hint)}</span>`);
    const act = el('s-lock__act', foot);
    if (!v.unlocked) el('s-abil__why', act, `${ICON.lock}<span>${esc(unlockText(v.unlock))}</span>`);
    else if (m.look[kind] === v.id) el('s-abil__why is-on', act, `${ICON.check}<span>Wearing it</span>`);
    else button({ label: 'Equip', kind: 'primary', parent: act, what: `locker:equip:${v.id}`, onPress: () => a.onEquip(v.id) });
  };

  render();
  return {
    ...p,
    leave: () => { p.leave?.(); a.onPreview(kind, null); },
    set: (x) => {
      m = x;
      KINDS.forEach((k, i) => { const b = bar.el.querySelectorAll('.p-tab')[i]; b?.querySelector('.p-badge')?.remove(); const n = newIn(k.kind); if (n && b) el('p-badge', b, String(n)); });
      render();
    },
  };
}

// ── rivals ──

const PIPS = (n: number, of: number) => Array.from({ length: of }, (_, i) => `<i class="${i < n ? 'is-on' : ''}"></i>`).join('');

export function rivalsScreen(m: RivalsModel, a: { onBack(): void }): MenuView<RivalsModel> {
  const p = page({ title: 'Rivals', sub: 'The captains of the league, and what they make of you', onBack: a.onBack, className: 's-riv' });
  const list = el('s-riv__list p-scroll', p.body);
  const side = panel({ kind: 'paper', parent: p.body, className: 's-riv__side' });
  const body = el('s-riv__body p-scroll', side.body);
  let rivals = m.rivals, sel = rivals.find((r) => r.isRival)?.id ?? rivals[0]?.id ?? '';

  const render = () => {
    keepScroll(list, () => {
      clear(list);
      for (const r of rivals) {
        const row = card({ className: 's-riv__row', selected: r.id === sel, parent: list, onPress: () => { sel = r.id; render(); } }).el;
        row.dataset.id = r.id;
        emblemBadge(r.emblem, r.colours, { parent: row });
        el('s-riv__who', row, `<b>${esc(r.name)}</b><span>${esc(r.rank)} · ${esc(r.temperament.name)}</span>`);
        if (r.isRival) el('s-riv__tag', row, 'Rival');
        el('s-riv__grudge', row, PIPS(r.grudge, 3)).title = 'Grudge';
      }
    });
    detail(rivals.find((r) => r.id === sel));
  };

  const detail = (r: RivalView | undefined) => {
    keepScroll(body, () => {
      clear(body);
      if (!r) { el('s-riv__none', body, 'No captains yet.'); return; }
      const head = el('s-riv__head', body);
      emblemBadge(r.emblem, r.colours, { size: 'lg', parent: head });
      el('s-riv__title', head, `<b class="t-h3">${esc(r.name)}</b><i>${esc(r.meaning)}</i><span class="t-micro t-soft">${esc(r.sigil)}</span>`);
      const rk = rankByName(r.rank);
      rankBadge(rk.tier, rk.step, { parent: head });
      el('s-riv__temper', body, `<b>${esc(r.temperament.name)}.</b> ${esc(r.temperament.text)}`);
      const load = el('s-riv__load', body);
      for (const id of [r.active, r.passive]) {
        const s = el('s-abil__slot', load);
        abilityGlyph(id, s);
        el('s-abil__slotT', s, `<span>${ability(id).kind === 'active' ? 'Active' : 'Passive'}</span><b>${esc(ability(id).name)}</b>`);
      }
      const rec = el('s-riv__rec', body);
      for (const [v, l] of [[r.met, 'Met'], [r.ahead, 'You ahead'], [r.behind, 'It ahead'], [r.sunkByYou, 'You sank it'], [r.sankYou, 'It sank you']] as const) {
        el('s-riv__stat', rec, `<b>${v}</b><span>${l}</span>`);
      }
      el('s-riv__bars', body, `<span class="s-label">Grudge</span><span class="s-riv__pips">${PIPS(r.grudge, 3)}</span><span class="s-label">Rivalry</span>`);
      progressBar({ kind: 'rank', value: r.rivalry, parent: body.lastElementChild!, className: 's-riv__rivalry' });
      const lines = el('s-riv__lines', body);
      for (const l of r.lines) el('s-riv__line', lines, esc(l));
    });
  };

  render();
  stagger(list);
  return { ...p, set: (x) => { rivals = x.rivals; render(); } };
}

// ── the career ──

export function careerScreen(m: CareerModel, a: { onBack(): void }): MenuView<CareerModel> {
  const p = page({ title: 'Career', sub: 'Every match you have sailed', onBack: a.onBack, className: 's-car' });
  const left = el('s-car__left p-scroll', p.body);
  const right = panel({ kind: 'paper', parent: p.body, className: 's-car__chart' });
  const cap = el('s-car__cap', right.body);
  const canvas = el<HTMLCanvasElement>('s-car__canvas', right.body, '', 'canvas');
  let model = m;

  const render = () => {
    clear(left);
    playerPlate(model.player, left, 's-car__plate');
    const s = model.stats;
    const grid = el('s-car__stats', left);
    const rows: [string, string][] = [
      [thousands(s.matches), 'Matches'], [thousands(s.wins), 'Wins'], [thousands(s.top5), 'Top 5'], [s.bestPlace ? `#${s.bestPlace}` : '—', 'Best place'],
      [thousands(s.kills), 'Ships sunk'], [thousands(s.damage), 'Damage'], [s.survived >= 3600 ? `${Math.floor(s.survived / 3600)}h ${Math.floor((s.survived % 3600) / 60)}m` : mmss(s.survived), 'Afloat'],
      [s.matches ? `${Math.round((s.wins / s.matches) * 100)}%` : '—', 'Win rate'],
    ];
    for (const [v, l] of rows) el('s-car__stat p-smoke', grid, `<b>${esc(v)}</b><span>${esc(l)}</span>`);
    const hab = section('How the captains read you', left, 's-car__habits p-smoke');
    if (!model.habits.length) el('s-car__habit', hab, 'They have not seen enough of you yet.');
    for (const h of model.habits) el('s-car__habit', hab, esc(h));
    const known = model.chart.filter((r) => r.sailed > 0).length;
    cap.innerHTML = `<b class="t-h3">The chart</b><span class="t-micro t-soft">${known} of ${model.chart.length} seas charted</span>`;
    requestAnimationFrame(() => drawChart(canvas, model.chart));
  };
  const ro = new ResizeObserver(() => drawChart(canvas, model.chart));
  render();
  stagger(left);
  const view: MenuView<CareerModel> = { ...p, set: (x) => { model = x; render(); } };
  const e0 = p.enter, l0 = p.leave;
  view.enter = () => { e0?.(); ro.observe(canvas); };
  view.leave = () => { l0?.(); ro.disconnect(); };
  return view;
}

// ── rank ──

export function rankScreen(m: RankModel, a: { onBack(): void }): MenuView<RankModel> {
  const p = page({ title: 'Rank', sub: 'Climb the league; a tier once reached is never lost', onBack: a.onBack, className: 's-rank' });
  const now = panel({ kind: 'paper', parent: p.body, className: 's-rank__now' });
  const ladder = el('s-rank__ladder p-hscroll', p.body);
  let model = m;

  const render = () => {
    const r = model.rank;
    clear(now.body);
    rankBadge(r.tier, r.step, { size: 'xl', parent: now.body });
    el('s-rank__name t-h3', now.body, esc(r.name));
    const top = r.tier >= 7;
    el('s-rank__next t-micro t-soft', now.body, top ? 'Top of the league' : `${Math.round(r.progress * 100)}% to ${esc(RANK_LADDER[r.index + 1]?.name ?? '')}`);
    progressBar({ kind: 'rank', value: top ? 1 : r.progress, parent: now.body, className: 's-rank__bar' });
    el('s-rank__note', now.body, r.floored ? `Held up by your ${esc(TIER_NAMES[r.tier])} floor: you cannot fall below it.` : 'Finish high to climb; sinking early costs a little.');

    keepScroll(ladder, () => {
      clear(ladder);
      for (let tier = 0; tier < TIER_NAMES.length; tier++) {
        const col = el(`s-rank__tier${tier === r.tier ? ' is-now' : ''}${tier > model.bestTier ? ' is-ahead' : ''}`, ladder);
        el('s-rank__tname', col, esc(TIER_NAMES[tier]));
        const steps = el('s-rank__steps', col);
        for (const s of RANK_LADDER.filter((x) => x.tier === tier)) {
          const st = el(`s-rank__step${s.index === r.index ? ' is-here' : ''}`, steps);
          rankBadge(s.tier, s.step, { locked: s.index > r.index, parent: st });
          el('s-rank__sname', st, esc(s.name));
        }
        const rewards = model.rewards.filter((c) => c.unlock.by === 'rank' && c.unlock.tier === tier);
        for (const v of rewards) {
          const c = el(`s-rank__reward${v.unlocked ? '' : ' is-locked'}`, col);
          rarityFrame(v.rarity, cosmeticArt(v), { parent: c, className: 's-rank__art' });
          el('s-rank__rname', c, esc(v.name));
        }
      }
      hydrate(ladder);
    });
    requestAnimationFrame(() => ladder.querySelector<HTMLElement>('.is-now')?.scrollIntoView({ inline: 'center', block: 'nearest' }));
  };

  render();
  return { ...p, set: (x) => { model = x; render(); } };
}

// ── settings ──

export function settingsScreen(s0: Settings, a: { onBack(): void; onChange(s: Partial<Settings>): void }): MenuView<Settings> {
  const p = page({ title: 'Settings', onBack: a.onBack, className: 's-set' });
  const cols = el('s-set__cols p-scroll', p.body);
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const row = (parent: Element, label: string, sub?: string) => {
    const r = el('s-set__row', parent);
    el('s-set__l', r, `<b>${esc(label)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}`);
    return el('s-set__c', r);
  };
  const box = (title: string, icon: string) => {
    const b = panel({ kind: 'paper', parent: cols, className: 's-set__box' });
    el('s-set__h', b.body, `<i>${icon}</i><b>${esc(title)}</b>`);
    return b.body;
  };

  const sound = box('Sound', ICON.sound);
  const volumes: [keyof Settings & ('master' | 'effects' | 'ambience' | 'interface'), string, string][] = [
    ['master', 'Everything', ''], ['effects', 'Guns and ships', 'Cannon, hits, the whale'], ['ambience', 'Sea and weather', 'Wind, waves, rain, thunder'], ['interface', 'Interface', 'Taps and menus'],
  ];
  const sliders = volumes.map(([k, l, sub]) => slider({ value: s0[k], label: l, format: pct, parent: row(sound, l, sub || undefined), onChange: (v) => a.onChange({ [k]: v }) }));

  const feel = box('Feel', ICON.haptic);
  const haptics = toggle({ value: s0.haptics, label: 'Haptics', parent: row(feel, 'Haptics', 'The ship answers in your hands'), onChange: (v) => a.onChange({ haptics: v }) });
  const shake = slider({ value: s0.shake, label: 'Shake', format: pct, parent: row(feel, 'Screen shake', 'Hits, blasts and the storm'), onChange: (v) => a.onChange({ shake: v }) });

  const ctl = box('Controls', ICON.controls);
  const sens = slider({ value: s0.sensitivity, min: 0.5, max: 2, step: 0.05, label: 'Sensitivity', format: (v) => `×${v.toFixed(2)}`, parent: row(ctl, 'Aim speed'), onChange: (v) => a.onChange({ sensitivity: v }) });
  const invert = toggle({ value: s0.invertY, label: 'Invert', parent: row(ctl, 'Invert the look', 'Drag down to look up'), onChange: (v) => a.onChange({ invertY: v }) });
  const lefty = toggle({ value: s0.leftHanded, label: 'Left-handed', parent: row(ctl, 'Left-handed', 'Stick on the right, guns on the left'), onChange: (v) => a.onChange({ leftHanded: v }) });
  const auto = toggle({ value: s0.autoFire, label: 'Auto-fire', parent: row(ctl, 'Auto-fire', 'Fire while the guns hold a ship'), onChange: (v) => a.onChange({ autoFire: v }) });

  const gfx = box('Graphics', ICON.quality);
  const quality = segmented({
    items: [{ id: 'low', label: 'Battery' }, { id: 'medium', label: 'Balanced' }, { id: 'high', label: 'Best' }], value: s0.quality, label: 'Quality',
    parent: row(gfx, 'Quality', 'Battery saves power; Best wants a recent device'), onChange: (id) => a.onChange({ quality: id as Quality }),
  });

  stagger(cols);
  return {
    ...p,
    set: (s) => {
      volumes.forEach(([k], i) => sliders[i].set(s[k]));
      haptics.set(s.haptics);
      shake.set(s.shake);
      sens.set(s.sensitivity);
      invert.set(s.invertY);
      lefty.set(s.leftHanded);
      auto.set(s.autoFire);
      quality.set(s.quality);
    },
  };
}

