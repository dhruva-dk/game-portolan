// A plain debug globe: the world's heights on a lit sphere, coloured by region, with the sea as a second sphere and
// the landmarks as pins. The app falls back to it (?stage=debug) to check scenes and the capture tools without the
// real renderer.
import * as THREE from 'three';
import { R } from '../sim/sphere.ts';
import { LANDMARKS, REGIONS, heightAt, regionAt } from '../sim/world/index.ts';
import type { SceneSpec } from './scenes.ts';

export interface DebugCamera {
  pos: THREE.Vector3;
  look: THREE.Vector3;
  up: THREE.Vector3;
}

export class DebugStage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(55, 1, 0.5, 20000);
  readonly sun = new THREE.DirectionalLight(0xffffff, 2.4);
  readonly ship = new THREE.Group();

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(2, devicePixelRatio));
    this.scene.background = new THREE.Color(0x8fb4d8);
    this.scene.add(this.sun, new THREE.HemisphereLight(0xbfd8ff, 0x203040, 0.8));
    this.scene.add(this.globe(), this.sea(), this.pins());
    const hull = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 18), new THREE.MeshStandardMaterial({ color: 0x6b4a2b }));
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 18), new THREE.MeshStandardMaterial({ color: 0xeeeeee }));
    mast.position.y = 9;
    this.ship.add(hull, mast);
    this.ship.visible = false;
    this.scene.add(this.ship);
    this.resize();
  }

  private globe(): THREE.Mesh {
    const g = new THREE.IcosahedronGeometry(1, 96), p = g.attributes.position, colors = new Float32Array(p.count * 3);
    const v = new THREE.Vector3(), c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).normalize();
      const u = { x: v.x, y: v.y, z: v.z }, h = heightAt(u), reg = regionAt(u);
      v.multiplyScalar(R + h);
      p.setXYZ(i, v.x, v.y, v.z);
      c.setHSL(reg / REGIONS.length, 0.45, h > 0 ? 0.32 + Math.min(0.3, h / 200) : 0.6 + Math.max(-0.4, h / 80));
      colors.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.computeVertexNormals();
    return new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
  }

  private sea(): THREE.Mesh {
    return new THREE.Mesh(
      new THREE.SphereGeometry(R, 192, 96),
      new THREE.MeshStandardMaterial({ color: 0x1d5a7a, transparent: true, opacity: 0.82, roughness: 0.25 }),
    );
  }

  private pins(): THREE.Group {
    const g = new THREE.Group(), m = new THREE.MeshStandardMaterial({ color: 0xffd36a, emissive: 0x553300 });
    for (const lm of LANDMARKS) {
      const pin = new THREE.Mesh(new THREE.CylinderGeometry(3, 6, lm.height), m);
      const up = new THREE.Vector3(lm.pos.x, lm.pos.y, lm.pos.z);
      pin.position.copy(up).multiplyScalar(R + lm.height / 2);
      pin.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
      g.add(pin);
    }
    return g;
  }

  /** Points the camera for a fixed scene. */
  setScene(s: SceneSpec, sunDir: THREE.Vector3): void {
    const up = new THREE.Vector3(s.pos.x, s.pos.y, s.pos.z), fwd = new THREE.Vector3(s.heading.x, s.heading.y, s.heading.z);
    this.sun.position.copy(sunDir).multiplyScalar(5000);
    const day = Math.max(0.05, sunDir.dot(up) + 0.2);
    this.scene.background = new THREE.Color().setHSL(0.58, 0.45, Math.min(0.75, day * 0.7));
    this.ship.visible = s.ship;
    if (s.ship) {
      this.ship.position.copy(up).multiplyScalar(R + 1);
      this.ship.lookAt(this.ship.position.clone().add(fwd));
      this.ship.up.copy(up);
      this.ship.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(fwd.clone().cross(up), up, fwd));
    }
    if (s.camera === 'orbit') {
      this.camera.position.copy(up).multiplyScalar(R * 3.2);
      this.camera.up.copy(fwd);
      this.camera.lookAt(0, 0, 0);
      return;
    }
    const height = s.camera === 'high' ? 60 : 8, back = s.camera === 'chase' ? 24 : 0;
    this.camera.position.copy(up).multiplyScalar(R + height).addScaledVector(fwd, -back);
    this.camera.up.copy(up);
    this.camera.lookAt(this.camera.position.clone().addScaledVector(fwd, 100).addScaledVector(up, -3));
  }

  resize(): void {
    const c = this.renderer.domElement, w = c.clientWidth || innerWidth, h = c.clientHeight || innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  stats() {
    const r = this.renderer.info.render;
    return { tris: r.triangles, calls: r.calls };
  }
}
