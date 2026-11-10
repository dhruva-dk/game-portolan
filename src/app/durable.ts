// Where what must outlast the app is kept. A web view's local storage can be cleared by iOS when the device runs short of
// room, so the native app keeps it in the device's own preferences instead, read once at the start and written through;
// whatever an earlier build left in local storage is carried across the first time. The browser, and the capture tools
// with it, go on using local storage.

export type Item = Pick<Storage, 'getItem' | 'setItem'>;

/** The device's preferences, as @capacitor/preferences has them. */
export interface Prefs {
  get(o: { key: string }): Promise<{ value: string | null }>;
  set(o: { key: string; value: string }): Promise<unknown>;
}

let opened: Item | null = null;

/** Reads `keys` from the device, bringing across from `old` any it has not got. To be awaited before anything reads them. */
export async function openDurable(prefs: Prefs, old: Item, keys: readonly string[]): Promise<void> {
  const held = new Map<string, string>();
  for (const key of keys) {
    let value = (await prefs.get({ key })).value;
    if (value === null) {
      try {
        value = old.getItem(key);
      } catch {
        value = null;
      }
      if (value !== null) await prefs.set({ key, value });
    }
    if (value !== null) held.set(key, value);
  }
  opened = {
    getItem: (key) => held.get(key) ?? null,
    setItem: (key, value) => {
      held.set(key, value);
      void prefs.set({ key, value }).catch(() => {
        // the change holds for this visit
      });
    },
  };
}

/** The store to use: the device's once opened, else the browser's (which can throw when storage is blocked). */
export const durable = (): Item => opened ?? localStorage;

/** Forgets the device's store (tests). */
export const closeDurable = (): void => {
  opened = null;
};
