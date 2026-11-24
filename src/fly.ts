import { Matrix4, Quaternion, Vector3 } from 'three/webgpu';
import { AIR_FOV, type Eye } from './snapshot.ts';
import { clamp } from './world/scalar.ts';
import {
  add,
  along,
  bearingAt,
  cross,
  fromLatLon,
  length,
  normalize,
  place,
  scale,
  transport,
} from './world/sphere.ts';

const SPEED = 15;
const FAST = 6;
const LOWEST = 2;
const TURN = 0.004;
type Keys = readonly [string, string];
const KEYS: Record<
  'right' | 'left' | 'forward' | 'back' | 'up' | 'down',
  Keys
> = {
  right: ['KeyD', 'ArrowRight'],
  left: ['KeyA', 'ArrowLeft'],
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  up: ['KeyE', 'Space'],
  down: ['KeyQ', 'KeyC'],
};

interface Start {
  lat: number;
  lon: number;
  height: number;
  bearing: number;
  pitch: number;
}

export function createFly(element: HTMLElement, start: Start) {
  let at = fromLatLon(start.lat, start.lon);
  let height = Math.max(start.height, LOWEST);
  let heading = bearingAt(at, start.bearing);
  let pitch = start.pitch;

  const held = new Set<string>();
  addEventListener('keydown', (e) => held.add(e.code));
  addEventListener('keyup', (e) => held.delete(e.code));
  addEventListener('blur', () => held.clear());

  let dragging = false;
  element.addEventListener('pointerdown', (e) => {
    dragging = true;
    element.setPointerCapture(e.pointerId);
  });
  element.addEventListener('pointerup', () => {
    dragging = false;
  });
  element.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const a = -e.movementX * TURN;
    heading = normalize(
      add(scale(heading, Math.cos(a)), cross(at, heading), Math.sin(a))
    );
    pitch = clamp(pitch - e.movementY * TURN, -1.55, 1.55);
  });

  const basis = new Matrix4(),
    turn = new Quaternion(),
    orientation = new Quaternion();
  const x = new Vector3(),
    y = new Vector3(),
    z = new Vector3(),
    axis = new Vector3(1, 0, 0);
  const either = (k: Keys) => held.has(k[0]) || held.has(k[1]);
  const key = (plus: Keys, minus: Keys) =>
    (either(plus) ? 1 : 0) - (either(minus) ? 1 : 0);

  return (dt: number): Eye => {
    const right = key(KEYS.right, KEYS.left),
      forward = key(KEYS.forward, KEYS.back),
      rise = key(KEYS.up, KEYS.down);
    const size = Math.hypot(right, forward, rise);
    if (size > 0) {
      const step =
        (SPEED *
          (held.has('ShiftLeft') || held.has('ShiftRight') ? FAST : 1) *
          dt) /
        size;
      const flat = add(scale(heading, forward), cross(heading, at), right);
      const across = length(flat);
      if (across > 0) {
        const moved = along(at, scale(flat, 1 / across), across * step);
        heading = normalize(transport(heading, at, moved.p));
        at = moved.p;
      }
      height = Math.max(height + rise * step, LOWEST);
    }

    const up = normalize(at);
    basis.makeBasis(
      x.fromArray(cross(heading, up)),
      y.fromArray(up),
      z.fromArray(heading).negate()
    );
    orientation
      .setFromRotationMatrix(basis)
      .multiply(turn.setFromAxisAngle(axis, pitch));
    const { x: qx, y: qy, z: qz, w: qw } = orientation;
    return {
      kind: 'air',
      position: place(up, height),
      orientation: [qx, qy, qz, qw],
      fov: AIR_FOV,
    };
  };
}
