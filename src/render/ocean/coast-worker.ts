// A coast worker: bakes the planet's height grid and the coastline's distance field from it (coastField.ts), and
// hands the field back as half floats, ready to upload.
import { DataUtils } from 'three';
import { bakeHeights } from '../../sim/world/index.ts';
import { R } from '../../sim/sphere.ts';
import { coastField } from './coastField.ts';

self.onmessage = () => {
  const field = coastField(bakeHeights(), R);
  const half = new Uint16Array(field.length);
  for (let i = 0; i < field.length; i++) half[i] = DataUtils.toHalfFloat(field[i]);
  (self as unknown as Worker).postMessage(half, [half.buffer]);
};
