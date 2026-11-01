// Renders the bank off the main thread. The page sends the order to render in, and asks for anything it needs
// sooner (a bed for the region ahead); each render is posted back as it finishes.
import { render, type SoundName } from './bank.ts';

type Item = [SoundName, number];
const post = self as unknown as { postMessage(m: unknown, transfer: Transferable[]): void };
const queue: Item[] = [], done = new Set<string>();
let busy = false;

function step(): void {
  busy = false;
  const item = queue.shift();
  if (!item) return;
  const key = `${item[0]}:${item[1]}`;
  if (!done.has(key)) {
    done.add(key);
    const chs = render(item[0], item[1]);
    post.postMessage({ name: item[0], v: item[1], chs }, chs.map((c) => c.buffer as ArrayBuffer));
  }
  next();
}

function next(): void {
  if (busy || !queue.length) return;
  busy = true;
  setTimeout(step, 0);
}

self.onmessage = (e: MessageEvent<{ order?: Item[]; want?: Item[] }>) => {
  if (e.data.order) queue.push(...e.data.order);
  if (e.data.want) queue.unshift(...e.data.want);
  next();
};
