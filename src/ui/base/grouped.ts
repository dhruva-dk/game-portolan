const MINUS = '−';

export const grouped = (n: number, digits?: number): string =>
  `${n < 0 ? MINUS : ''}${Math.abs(n).toLocaleString(
    'en-US',
    digits === undefined
      ? undefined
      : { minimumFractionDigits: digits, maximumFractionDigits: digits }
  )}`;
