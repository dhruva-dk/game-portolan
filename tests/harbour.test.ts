// The harbour: where it stands on a planet (world/harbour-site.ts), and the
// camera over it (play/anchorage.ts harbourEye, seenAt).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eyeOut, harbourEye, overall, seenAt } from '../src/play/anchorage.ts';
import { harbourOf } from '../src/world/harbour-site.ts';
import { PLOTS, builtOn } from '../src/world/harbour.ts';
import { landOf, planetOf } from '../src/world/land.ts';
import { distance, fromChart, place } from '../src/world/sphere.ts';

const planet = planetOf(3, landOf(3)),
  harbour = harbourOf(planet);

test('the harbour: the same for a planet every time, off her berth, every foot dry and on or over its ground', () => {
  assert.deepEqual(harbourOf(planet), harbour);
  assert.ok(
    distance(planet.start.at, harbour.chart.at) < 300,
    'it lies off her berth'
  );
  for (const id of PLOTS) {
    const s = harbour.plots[id],
      at = fromChart(harbour.chart, s.x, s.z);
    assert.ok(s.foot >= 1, `${id}: its foot is over the sea`);
    assert.ok(
      s.foot >= planet.height(at) - 1e-9,
      `${id}: its foot is not under its ground`
    );
    assert.ok(builtOn(harbour, at), `${id}: its plot is cleared`);
  }
  assert.ok(!builtOn(harbour, planet.start.at), 'her berth is not built on');
});

test('the eye over the harbour sees every building, on the screen; framed, its picture is drawn that large about its centre', () => {
  const [w, h] = [1180, 820];
  // the whole campus from its middle
  const middle = overall({ x: 0, z: 0, back: 0 }),
    eye = eyeOut(),
    whole: [number, number] = [0, 0],
    framed: [number, number] = [0, 0];
  for (const id of PLOTS) {
    const s = harbour.plots[id],
      head = place(fromChart(harbour.chart, s.x, s.z), s.foot + s.tall);
    eye.centre[0] = eye.centre[1] = 0;
    eye.size = 1;
    assert.ok(seenAt(harbourEye(harbour, middle, eye), head, w, h, whole), id);
    assert.ok(
      whole[0] > 0 && whole[0] < w && whole[1] > 0 && whole[1] < h,
      `${id}: on the screen (${whole.map(Math.round).join(', ')})`
    );
    // half the size about a centre a quarter of the screen left and up
    eye.centre[0] = eye.centre[1] = -0.5;
    eye.size = 0.5;
    assert.ok(seenAt(harbourEye(harbour, middle, eye), head, w, h, framed), id);
    assert.ok(Math.abs(framed[0] - (w / 4 + (whole[0] - w / 2) / 2)) < 1e-6);
    assert.ok(Math.abs(framed[1] - (h / 4 + (whole[1] - h / 2) / 2)) < 1e-6);
  }
});
