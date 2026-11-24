import { NEGOTIATION } from '../tuning.ts';

export type Answer = 'signs' | 'counters' | 'refuses';

export function answerTo(score: number): Answer {
  if (score >= NEGOTIATION.signs) return 'signs';
  return score >= NEGOTIATION.counters ? 'counters' : 'refuses';
}
