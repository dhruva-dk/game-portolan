const loads: { stage: string; at: number }[] = [];

export function loaded(stage: string) {
  const at = performance.now(),
    since = at - (loads.at(-1)?.at ?? 0);
  loads.push({ stage, at });
  console.info(`load ${stage} ${at.toFixed(0)} ms (+${since.toFixed(0)})`);
}
