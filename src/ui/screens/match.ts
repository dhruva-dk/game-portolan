// The screens over a match's end, blocked out: death, victory, and the results (the HUD, the Gale and spectating are
// drawn on the chart). Over the sea only small boxes in the corners take touches; everything else lets them through to
// the controls layer underneath, where the stick and the look live.
import {
  ABILITY_ICON, button, ceremony, cosmeticArt, el, emblemBadge, esc, hydrate, ICON, mmss, ordinal, progressBar, rarityFrame,
} from '../parts/index.ts';
import type { DeathModel, ResultsModel, VictoryModel } from '../model.ts';
import { WEAPON_NAME } from '../model.ts';
import type { ScreenView } from '../shell.ts';
import { page } from './frame.ts';
import './match.css';

/** A box over the sea that takes the touches landing on it. */
const box = (cls: string, parent: Element, html?: string) => el(`s-mx__box ${cls}`, parent, html);

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
