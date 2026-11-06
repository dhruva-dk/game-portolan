// A flow worker: lays the current lanes out over the planet (flowField.ts) and hands the field back as half floats,
// ready to upload.
import { DataUtils } from 'three';
import { flowField } from './flowField.ts';

self.onmessage = () => {
  const field = flowField();
  const half = new Uint16Array(field.length);
  for (let i = 0; i < field.length; i++) half[i] = DataUtils.toHalfFloat(field[i]);
  (self as unknown as Worker).postMessage(half, [half.buffer]);
};
