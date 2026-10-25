// WP28: the sound bank rendered off the main thread. Synthesis is pure (sfx.ts), so the worker renders every variant,
// the ambience beds and the commonest sounds first, and hands each over as transferred Float32Arrays; the engine only
// wraps them in AudioBuffers. The whole bank takes about 3 s of a core on the dev Mac, never a frame of the main thread.
import { SOUND_NAMES, SOUNDS, render, type SoundName } from './sfx.ts';

const FIRST: readonly SoundName[] = ['sea', 'swell', 'wind', 'rigging', 'creak', 'slap', 'canvasFill', 'block', 'tap', 'page', 'cannon', 'cannonFar', 'splash', 'hit', 'whistle', 'coin', 'chord', 'surf'];
const post = self as unknown as { postMessage(m: unknown, transfer: Transferable[]): void; close(): void };
for (const name of [...FIRST, ...SOUND_NAMES.filter((n) => !FIRST.includes(n))]) {
  for (let v = 0; v < SOUNDS[name].variants; v++) {
    const chs = render(name, v);
    post.postMessage({ name, v, chs }, chs.map((c) => c.buffer as ArrayBuffer));
  }
}
post.close();
