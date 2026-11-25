import type { Screen } from '../play/player.ts';
import type { Paused } from '../ui/sea/pause.ts';

export type SeaPhase = 'sailing' | 'sunk' | 'watching' | 'settling' | 'over';

export function seaScreen(
  phase: SeaPhase,
  o: { offered: boolean; paused: Paused }
): Screen {
  if (o.paused === 'settings') return 'settings';
  if (phase === 'sailing') return 'match';
  if (phase === 'watching') return 'spectate';
  if (phase === 'sunk' && !o.offered) return 'sinking';
  return 'sunk';
}

export function teamWon(
  ships: readonly { place: number }[],
  teams: readonly number[],
  own: number
): boolean {
  const first = ships.findIndex((s) => s.place === 1);
  return first >= 0 && teams[first] === teams[own];
}
