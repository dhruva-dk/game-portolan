// A GPU device that is lost cannot be got back: the page has to start again, and it opens on the title. A device lost
// again straight after that would only go round in a loop, so a second loss soon after the first is left alone.

/** Seconds after a reload in which another loss does not reload. */
const SOON = 30;
const KEY = 'portolan.gpu-lost';

type Store = Pick<Storage, 'getItem' | 'setItem'>;

/** Whether to reload now, `now` in milliseconds; notes that it has. A store that fails says not to, so it cannot loop. */
export function shouldReload(store: Store, now: number): boolean {
  try {
    const last = Number(store.getItem(KEY) ?? 0);
    if (now - last < SOON * 1000) return false;
    store.setItem(KEY, String(now));
    return true;
  } catch {
    return false;
  }
}
