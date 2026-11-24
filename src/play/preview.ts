import type { Chart } from '../player.ts';

export function surveyor(): (name: string) => Promise<Chart | null> {
  let worker: Worker | null = null,
    asked: ((chart: Chart | null) => void) | null = null,
    last: Chart | null = null;
  const start = () =>
    new Worker(new URL('./survey.ts', import.meta.url), { type: 'module' });
  return (name) => {
    if (last?.name === name) return Promise.resolve(last);
    if (asked) {
      worker?.terminate();
      worker = null;
      asked(null);
      asked = null;
    }
    const w = (worker ??= start());
    return new Promise((resolve) => {
      asked = resolve;
      w.onmessage = (e: MessageEvent<Chart>) => {
        last = e.data;
        asked = null;
        resolve(e.data);
      };
      w.onerror = () => {
        worker = null;
        asked = null;
        resolve(null);
      };
      w.postMessage({ name });
    });
  };
}
