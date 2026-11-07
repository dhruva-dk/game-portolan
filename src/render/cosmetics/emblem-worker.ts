// An emblem worker: paints every emblem's roundel (emblems.ts) away from the page and hands them back, for the ships
// to wear. Painted on the page as a match began, the twenty ships' emblems held it for half a second on the iPad.
import { EMBLEM_IDS, emblemRoundel } from './emblems.ts';

self.onmessage = (e: MessageEvent<number>) => {
  const painted = EMBLEM_IDS.map((id): [string, Uint8Array] => [id, emblemRoundel(id, e.data)]);
  (self as unknown as Worker).postMessage(painted, painted.map(([, px]) => px.buffer));
};
