// A free camera for reviewing the world (debug.ts: ?fly): drag to look, WASD to move, E/Q (or space
// and C) up and down, shift to go faster. It flies over the planet: along the level at where it is, its up always
// away from the planet's centre, its heading carried along with it. It stays above the water.

import { Matrix4, Quaternion, Vector3 } from 'three/webgpu';
import { AIR_FOV, type Eye } from './snapshot.ts';
import { clamp } from './world/scalar.ts';
import { add, along, bearingAt, cross, fromLatLon, length, normalize, place, scale, transport } from './world/sphere.ts';

/** Metres a second; shift multiplies it. */
const SPEED = 15;
const FAST = 6;
/** The lowest it goes, metres: there is no underwater view. */
const LOWEST = 2;
/** Radians a pixel of drag. */
const TURN = 0.004;
/** Each way it flies, by either of two keys. */
type Keys = readonly [string, string];
const KEYS: Record<'right' | 'left' | 'forward' | 'back' | 'up' | 'down', Keys> = {
  right: ['KeyD', 'ArrowRight'], left: ['KeyA', 'ArrowLeft'], forward: ['KeyW', 'ArrowUp'], back: ['KeyS', 'ArrowDown'],
  up: ['KeyE', 'Space'], down: ['KeyQ', 'KeyC'],
};

/** Where the camera starts: radians, but for its height above the sea, in metres. */
export interface Start {
  lat: number;
  lon: number;
  height: number;
  /** Which way it faces, clockwise from north. */
  bearing: number;
  /** How far it looks up (negative: down). */
  pitch: number;
}

export function createFly(element: HTMLElement, start: Start) {
  let at = fromLatLon(start.lat, start.lon);
  let height = Math.max(start.height, LOWEST);
  let heading = bearingAt(at, start.bearing);
  let pitch = start.pitch;

  // (its listeners are never removed: the flyer is made once, on a debug page, and flies until the page is left)
  const held = new Set<string>();
  addEventListener('keydown', (e) => held.add(e.code));
  addEventListener('keyup', (e) => held.delete(e.code));
  addEventListener('blur', () => held.clear());

  let dragging = false;
  element.addEventListener('pointerdown', (e) => { dragging = true; element.setPointerCapture(e.pointerId); });
  element.addEventListener('pointerup', () => { dragging = false; });
  element.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    // turned left (toward up × heading) by a drag to the left
    const a = -e.movementX * TURN;
    heading = normalize(add(scale(heading, Math.cos(a)), cross(at, heading), Math.sin(a)));
    pitch = clamp(pitch - e.movementY * TURN, -1.55, 1.55);
  });

  const basis = new Matrix4(), turn = new Quaternion(), orientation = new Quaternion();
  const x = new Vector3(), y = new Vector3(), z = new Vector3(), axis = new Vector3(1, 0, 0);
  /** 1 for either key of `plus` held, −1 for either of `minus`, 0 for both or neither. */
  const either = (k: Keys) => held.has(k[0]) || held.has(k[1]);
  const key = (plus: Keys, minus: Keys) => (either(plus) ? 1 : 0) - (either(minus) ? 1 : 0);

  /** The eye after dt seconds of flying. */
  return (dt: number): Eye => {
    const right = key(KEYS.right, KEYS.left), forward = key(KEYS.forward, KEYS.back), rise = key(KEYS.up, KEYS.down);
    const size = Math.hypot(right, forward, rise);
    if (size > 0) {
      const step = (SPEED * (held.has('ShiftLeft') || held.has('ShiftRight') ? FAST : 1) * dt) / size;
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
    // the camera looks down its −z, its x to the right, y up; then pitched about its x
    basis.makeBasis(x.fromArray(cross(heading, up)), y.fromArray(up), z.fromArray(heading).negate());
    orientation.setFromRotationMatrix(basis).multiply(turn.setFromAxisAngle(axis, pitch));
    // (a new eye each frame, as the game's are: what reads it may keep it)
    const { x: qx, y: qy, z: qz, w: qw } = orientation;
    return { kind: 'air', position: place(up, height), orientation: [qx, qy, qz, qw], fov: AIR_FOV };
  };
}
