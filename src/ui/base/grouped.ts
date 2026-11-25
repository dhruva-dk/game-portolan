export const MINUS = '−';

export const grouped = (n: number): string =>
  `${n < 0 ? MINUS : ''}${Math.abs(n).toLocaleString('en-US')}`;
