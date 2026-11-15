// Part plate: a ship's part as a maker's plate: its type's woodcut, its name and tags, and its performance,
// reliability and condition as stat bars, each with its maximum marked. Condition under half is inked vermilion.

import type { PartType } from '../../race';
import type { Glyph } from '../glyphs';
import { WASH, glyph, svg } from '../ink';
import { make, type Part } from './part';
import { statBar } from './statbar';
import { tag, type TagText } from './tag';

export interface PlateView {
  type: PartType; name: string; tags: readonly TagText[];
  perf: number; perfMax: number; reliability: number; reliabilityMax: number; condition: number;
}

/** A part plate. */
export function plate(): Part<PlateView> {
  const el = make('div', 'k-plate'), mark = make('div', '', el), title = make('div', '', el);
  const name = make('div', 'bold', title), tags = make('div', '', title);
  const bars = [statBar(), statBar(), statBar()];
  for (const b of bars) el.appendChild(b.el);
  return {
    el,
    set(p) {
      mark.innerHTML = svg(40, 40, glyph(`part.${p.type}` as Glyph, 20, 20, 36));
      name.textContent = p.name;
      tags.textContent = '';
      for (const t of p.tags) tags.appendChild(tag(t).el);
      bars[0].set({ label: 'Performance', value: p.perf, max: 100, mark: p.perfMax, wash: WASH.ultramarine });
      bars[1].set({ label: 'Reliability', value: p.reliability, max: 100, mark: p.reliabilityMax, wash: WASH.viridian });
      bars[2].set({ label: 'Condition', value: p.condition, max: 100, text: `${Math.round(p.condition)}%`, wash: p.condition < 50 ? WASH.vermilion : WASH.ochre });
    },
  };
}
