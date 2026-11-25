export type Widen<T> = T extends number
  ? number
  : T extends string
    ? string
    : { readonly [K in keyof T]: Widen<T[K]> };

export function weighed(weights: readonly number[], u: number): number {
  let r = u * weights.reduce((a, b) => a + b, 0),
    k = 0;
  while (k < weights.length - 1 && r >= weights[k]) r -= weights[k++];
  return k;
}
