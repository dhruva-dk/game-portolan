// The scene's resolution, held to what the GPU can draw in a thirtieth of a second. An iPad's GPU slows as it warms
// (an M1 Air's frame took half as long again after a few minutes of a match), so no one resolution holds the frame
// rate through a match: the scene is drawn at the most of the screen that fits, between a floor and a ceiling for the
// kind of device, and the upscaler brings it to the screen. It moves in small steps, a second apart, on the GPU's
// own time for a frame (the frame log's timestamps, shape.ts).
import { shape } from './shape.ts';

/** The GPU's time for a frame aimed at, ms: under a thirtieth of a second, with room for a frame that runs long. */
const AIM = 28;
/** Over this the scene is drawn smaller; under the low mark, larger. */
const HIGH = 31;
const LOW = 23;
/** The most a step moves the scale by, either way. */
const DOWN = 0.82;
const UP = 1.04;

export class Resolution {
  /** The share of the screen's width (and height) the scene is drawn at. */
  scale: number;
  readonly #min: number;
  readonly #max: number;
  #seen: unknown = null;

  constructor(max: number, min: number) {
    this.scale = this.#max = max;
    this.#min = min;
  }

  /** After a frame: the scale for the next, changed once the frame log has timed a frame since it last changed. */
  update(): boolean {
    const f = shape.timed;
    if (!f || f === this.#seen) return false;
    this.#seen = f;
    let gpu = 0;
    for (const p of f.passes) gpu += Math.max(p.gpu, 0);
    if (gpu <= 0) return false;
    let next = this.scale;
    // most of the frame's time goes as its pixels, the square of the scale
    if (gpu > HIGH) next = Math.max(this.#min, this.scale * Math.max(DOWN, Math.sqrt(AIM / gpu)));
    else if (gpu < LOW) next = Math.min(this.#max, this.scale * UP);
    next = Math.round(next * 100) / 100;
    if (next === this.scale) return false;
    this.scale = next;
    return true;
  }
}
