// A free camera for reviewing the world (debug.ts: ?fly): drag to look, WASD to move, E/Q (or space
// and C) up and down, shift to go faster. It flies over the planet: along the level at where it is, its up always
// away from the planet's centre, its heading carried along with it. It stays above the water.

import { Matrix4, Quaternion, Vector3, type Camera } from 'three/webgpu';
import { add, along, cross, frameAt, fromLatLon, normalize, place, scale, transport } from './world/sphere';

/** Metres a second; shift multiplies it. */
const SPEED = 15;
const FAST = 6;
/** The lowest it goes, metres: there is no underwater view. */
const LOWEST = 2;
/** Radians a pixel of drag. */
const TURN = 0.004;

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

export function createFly(camera: Camera, element: HTMLElement, start: Start) {
  let at = fromLatLon(start.lat, start.lon);
  let height = Math.max(start.height, LOWEST);
  const f = frameAt(at);
  let heading = add(scale(f.north, Math.cos(start.bearing)), f.east, Math.sin(start.bearing));
  let pitch = start.pitch;

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
    pitch = Math.max(-1.55, Math.min(1.55, pitch - e.movementY * TURN));
  });

  const basis = new Matrix4(), turn = new Quaternion(), x = new Vector3(), y = new Vector3(), z = new Vector3();
  const axis = new Vector3(1, 0, 0);

  return (dt: number) => {
    const key = (plus: string[], minus: string[]) =>
      (plus.some((k) => held.has(k)) ? 1 : 0) - (minus.some((k) => held.has(k)) ? 1 : 0);
    const right = key(['KeyD', 'ArrowRight'], ['KeyA', 'ArrowLeft']), forward = key(['KeyW', 'ArrowUp'], ['KeyS', 'ArrowDown']);
    const rise = key(['KeyE', 'Space'], ['KeyQ', 'KeyC']);
    const size = Math.hypot(right, forward, rise);
    if (size > 0) {
      const step = (SPEED * (held.has('ShiftLeft') || held.has('ShiftRight') ? FAST : 1) * dt) / size;
      const flat = add(scale(heading, forward), cross(heading, at), right);
      const across = Math.hypot(...flat);
      if (across > 0) {
        const moved = along(at, scale(flat, 1 / across), across * step);
        heading = normalize(transport(heading, at, moved.p));
        at = moved.p;
      }
      height = Math.max(height + rise * step, LOWEST);
    }

    const up = normalize(at);
    camera.position.set(...place(up, height));
    // the camera looks down its −z, its x to the right, y up; then pitched about its x
    basis.makeBasis(x.set(...cross(heading, up)), y.set(...up), z.set(...scale(heading, -1)));
    camera.quaternion.setFromRotationMatrix(basis).multiply(turn.setFromAxisAngle(axis, pitch));
  };
}
