export type Count = {
  id: string;
  at: number;
  ms: number;
  before: string;
  value(k: number): string;
  attr?: string;
};

export const eased = (k: number) => 1 - (1 - k) ** 3;

export const counted = (
  id: string,
  at: number,
  ms: number,
  from: number,
  to: number,
  shown: (n: number) => string
): Count => ({
  id,
  at,
  ms,
  before: shown(from),
  value: (k) => shown(Math.round(from + (to - from) * eased(k))),
});

export const morphed = (
  id: string,
  attr: string,
  at: number,
  ms: number,
  shown: (k: number) => string
): Count => ({
  id,
  attr,
  at,
  ms,
  before: shown(0),
  value: (k) => shown(eased(k)),
});

export function createTicker(host: () => Element | null) {
  let counts: Count[] = [],
    start = 0,
    frame = 0;
  const set = (c: Count, text: string) => {
    const node = host()?.querySelector(`#${c.id}`);
    if (!node) return;
    if (c.attr === undefined) {
      if (node.textContent !== text) node.textContent = text;
      return;
    }
    if (node.getAttribute(c.attr) !== text) node.setAttribute(c.attr, text);
  };
  const step = (now: number) => {
    const t = now - start;
    let live = false;
    for (const c of counts) {
      if (t < c.at) {
        live = true;
        set(c, c.before);
        continue;
      }
      const k = Math.min(1, (t - c.at) / c.ms);
      if (k < 1) live = true;
      set(c, c.value(k));
    }
    if (live) frame = requestAnimationFrame(step);
  };
  return {
    run(next: Count[]) {
      cancelAnimationFrame(frame);
      counts = next;
      start = performance.now();
      counts.forEach((c) => set(c, c.before));
      frame = requestAnimationFrame(step);
    },
    finish() {
      cancelAnimationFrame(frame);
      counts.forEach((c) => set(c, c.value(1)));
    },
  };
}
