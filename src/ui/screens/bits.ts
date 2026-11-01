// Small pieces several screens share, built from the parts: the player's plate (level and rank), an ability's
// glyph medallion, and a captain's name line.
import { ability, type AbilityId } from '../../sim/abilities.ts';
import { ABILITY_ICON, el, esc, emblemBadge, progressBar, rankBadge, seal, type BarHandle } from '../parts/index.ts';
import type { Mark, PlayerView } from '../model.ts';

export interface PlateHandle {
  el: HTMLElement;
  xp: BarHandle;
  rank: BarHandle;
}

/** The player's level seal and XP, and rank medallion and progress. */
export function playerPlate(p: PlayerView, parent?: Element, className = ''): PlateHandle {
  const e = el(`s-plate p-smoke${className ? ' ' + className : ''}`, parent);
  seal(p.level.level, { cap: 'Level', parent: e });
  const mid = el('s-plate__mid', e);
  el('s-plate__line', mid, `<span class="s-plate__name">Level ${p.level.level}</span><span class="s-plate__soft">${p.level.into} / ${p.level.need} XP</span>`);
  const xp = progressBar({ kind: 'xp', value: p.level.into / p.level.need, parent: mid });
  el('s-plate__line', mid, `<span class="s-plate__name">${esc(p.rank.name)}</span><span class="s-plate__soft">${p.rank.tier >= 7 ? 'Top of the league' : `${Math.round(p.rank.progress * 100)}% to next`}</span>`);
  const rank = progressBar({ kind: 'rank', value: p.rank.progress, parent: mid });
  rankBadge(p.rank.tier, p.rank.step, { parent: e });
  return { el: e, xp, rank };
}

/** An ability's glyph in a medallion: wax for actives, lapis for passives. */
export function abilityGlyph(id: AbilityId, parent?: Element, className = ''): HTMLElement {
  const a = ability(id);
  return el(`s-glyph s-glyph--${a.kind}${className ? ' ' + className : ''}`, parent, ABILITY_ICON[id] ?? '');
}

/** A captain's emblem disc with its name beside it. */
export function markLine(m: Mark & { name: string }, sub: string, parent?: Element): HTMLElement {
  const e = el('s-mark', parent);
  emblemBadge(m.emblem, m.colours, { parent: e });
  el('s-mark__t', e, `<span class="s-mark__name">${esc(m.name)}</span><span class="s-mark__sub">${esc(sub)}</span>`);
  return e;
}
