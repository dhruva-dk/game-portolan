import type { Person } from '../state.ts';
import { WANTS } from '../tuning.ts';
import { stars } from './stars.ts';

export function askingWage(starCount: number, wageFactor: number): number {
  const raw =
    WANTS.askPerStar *
    Math.max(starCount, WANTS.askLeastStars) ** WANTS.askPower *
    wageFactor;
  return Math.max(
    WANTS.leastAsk,
    Math.round(raw / WANTS.askStep) * WANTS.askStep
  );
}

export const ask = (person: Pick<Person, 'stats' | 'wageFactor'>): number =>
  askingWage(stars(person.stats), person.wageFactor);
