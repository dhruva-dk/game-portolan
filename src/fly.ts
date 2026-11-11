// A free camera for reviewing the world, until there is a ship to sail: drag to look, WASD to move, E/Q (or space
// and C) up and down, shift to go faster. It stays above the water.

import type { Camera } from 'three/webgpu';
import { Vector3 } from 'three/webgpu';

/** Metres a second; shift multiplies it. */
const SPEED = 15;
const FAST = 6;
/** The lowest it goes, metres: there is no underwater view. */
const LOWEST = 2;
/** Radians a pixel of drag. */
const TURN = 0.004;

export function createFly(camera: Camera, element: HTMLElement) {
  const held = new Set<string>();
  addEventListener('keydown', (e) => held.add(e.code));
  addEventListener('keyup', (e) => held.delete(e.code));
  addEventListener('blur', () => held.clear());

  let dragging = false;
  element.addEventListener('pointerdown', (e) => { dragging = true; element.setPointerCapture(e.pointerId); });
  element.addEventListener('pointerup', () => { dragging = false; });
  element.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const r = camera.rotation;
    r.order = 'YXZ';
    r.y -= e.movementX * TURN;
    r.x = Math.max(-1.55, Math.min(1.55, r.x - e.movementY * TURN));
  });

  const move = new Vector3();
  return (dt: number) => {
    const axis = (plus: string[], minus: string[]) =>
      (plus.some((k) => held.has(k)) ? 1 : 0) - (minus.some((k) => held.has(k)) ? 1 : 0);
    move.set(axis(['KeyD', 'ArrowRight'], ['KeyA', 'ArrowLeft']), 0, axis(['KeyS', 'ArrowDown'], ['KeyW', 'ArrowUp']));
    move.applyQuaternion(camera.quaternion);
    move.y += axis(['KeyE', 'Space'], ['KeyQ', 'KeyC']);
    if (move.lengthSq() === 0) return;
    const speed = SPEED * (held.has('ShiftLeft') || held.has('ShiftRight') ? FAST : 1);
    camera.position.addScaledVector(move.normalize(), speed * dt);
    camera.position.y = Math.max(camera.position.y, LOWEST);
  };
}
