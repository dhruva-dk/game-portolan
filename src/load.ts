// The load's stages, each said once as it is reached: when (ms since the page began, performance.now) and how long
// since the last. One console line each, `load <stage> <at> ms (+<since>)`, read by tools and, on the iPad, through
// the native console (tools/ipad.sh --console); all of them kept as `loads` for the page's tools.

/** The stages reached so far, in order: what, and when (ms since the page began). */
export const loads: { stage: string; at: number }[] = [];

/** Notes a stage of the load reached now. */
export function loaded(stage: string) {
  const at = performance.now(), since = at - (loads.at(-1)?.at ?? 0);
  loads.push({ stage, at });
  console.info(`load ${stage} ${at.toFixed(0)} ms (+${since.toFixed(0)})`);
}
