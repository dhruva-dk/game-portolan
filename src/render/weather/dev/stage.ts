// A stand-in planet for the weather's dev page only: a sea sphere, a sky with the sun, moon and stars, and a few
// natural forms for scale (islands, a rock arch, cedar trunks, ice spires). It shares the weather's light model,
// so what you see here is how the effects sit in a scene lit the same way. The game uses the planet renderer.
import * as THREE from 'three';
import { COMMON_GLSL, frameAt, newFrame, placeOn, rng, skyAmbient, sunColor, type Shared, type Vec3Like } from '../common.ts';

const SEA_VERT = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const SEA_FRAG = /* glsl */ `
uniform float uChop, uFog, uFlash;
uniform vec3 uFogColor;
varying vec3 vWorld;
float waves(vec3 p) {
  float t = uTime;
  return texture2D(uNoise, p.xz * 0.045 + vec2(t * 0.012, t * 0.007)).g * 0.6
       + texture2D(uNoise, p.zy * 0.05 - vec2(t * 0.01, t * 0.013)).g * 0.6
       + texture2D(uNoise, p.xy * 0.16 + vec2(t * 0.03, -t * 0.02)).b * 0.3;
}
void main() {
  vec3 up = normalize(vWorld), e, n;
  tangents(up, e, n);
  float h0 = waves(vWorld), hx = waves(vWorld + e * 0.6), hy = waves(vWorld + n * 0.6);
  vec3 nrm = normalize(up + (e * (h0 - hx) + n * (h0 - hy)) * uChop);
  vec3 v = normalize(vWorld - cameraPosition);
  vec3 r = reflect(v, nrm);
  float fres = 0.02 + 0.98 * pow(1.0 - max(dot(-v, nrm), 0.0), 5.0);
  vec3 amb = skyAmbient(up);
  vec3 sky = amb * mix(1.6, 1.0, clamp(dot(r, up), 0.0, 1.0));
  vec3 sun = sunColor(up, 0.0);
  vec3 deep = vec3(0.015, 0.05, 0.065) * (amb * 2.2 + sun * 0.3 * max(dot(up, uSunDir), 0.0));
  vec3 col = mix(deep, sky, fres);
  col += sun * pow(max(dot(r, uSunDir), 0.0), 260.0) * 6.0;
  col += moonColor(up) * pow(max(dot(r, uMoonDir), 0.0), 120.0) * 8.0;
  col += vec3(0.6, 0.66, 0.85) * uFlash * 0.25;
  float dist = length(vWorld - cameraPosition);
  col = mix(col, uFogColor, 1.0 - exp(-dist * uFog));
  gl_FragColor = vec4(col * uGain, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const SKY_FRAG = /* glsl */ `
uniform float uFog, uFlash;
uniform vec3 uFogColor;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir), up = normalize(cameraPosition);
  float el = dot(d, up);
  vec3 amb = skyAmbient(up);
  vec3 zen = amb * vec3(0.62, 0.8, 1.3) * 1.25;
  vec3 hor = amb * 1.75;
  float s = max(dot(d, uSunDir), 0.0);
  vec3 sunC = sunColor(up, 40.0);
  vec3 col = mix(hor, zen, pow(clamp(el, 0.0, 1.0), 0.5));
  col += sunC * (pow(s, 6.0) * 0.18 + pow(s, 60.0) * 0.5);
  col += sunC * smoothstep(0.99985, 0.99992, s) * 40.0;
  float m = dot(d, uMoonDir);
  col += vec3(0.85, 0.9, 1.0) * smoothstep(0.99965, 0.99975, m) * 3.0 * nightAt(up);
  col += vec3(0.35, 0.4, 0.55) * pow(max(m, 0.0), 80.0) * 0.08 * nightAt(up);
  // stars
  vec3 c = floor(d * 280.0);
  float st = hash13(c);
  vec3 f = fract(d * 280.0) - 0.5;
  col += vec3(0.9, 0.95, 1.0) * step(0.9965, st) * smoothstep(0.5, 0.0, length(f)) * nightAt(up) * 2.0 * smoothstep(0.0, 0.2, el);
  col += vec3(0.6, 0.66, 0.9) * uFlash * 0.4;
  col = mix(col, uFogColor, 1.0 - exp(-uFog * 300.0));
  gl_FragColor = vec4(col * uGain, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const SKY_GLSL_EXTRA = /* glsl */ `
float hash13(vec3 p3) { p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }`;

export interface Stage {
  group: THREE.Group;
  /** Land materials, for the weather's icing and wetness hooks. */
  land: THREE.MeshStandardMaterial[];
  update(local: { fogDensity: number; fogColor: THREE.Color; flash: number; rain: number; thunder: number; calm: number }, eye: THREE.Vector3): void;
}

export interface Spots { arch: Vec3Like; mistwood: Vec3Like; pole: Vec3Like; isles: Vec3Like[] }

export function buildStage(shared: Shared, spots: Spots): Stage {
  const R = shared.uRadius.value, group = new THREE.Group();
  const own = { uChop: { value: 0.5 }, uFog: { value: 0.0006 }, uFogColor: { value: new THREE.Color() }, uFlash: { value: 0 } };
  const sea = new THREE.Mesh(
    new THREE.SphereGeometry(R, 512, 256),
    new THREE.ShaderMaterial({ uniforms: { ...shared, ...own }, vertexShader: SEA_VERT, fragmentShader: COMMON_GLSL + SEA_FRAG }),
  );
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(1, 64, 32),
    new THREE.ShaderMaterial({
      uniforms: { ...shared, ...own }, vertexShader: SKY_VERT, fragmentShader: COMMON_GLSL + SKY_GLSL_EXTRA + SKY_FRAG,
      side: THREE.BackSide, depthWrite: false,
    }),
  );
  sky.scale.setScalar(20000);
  sky.renderOrder = -100;
  sky.frustumCulled = false;
  group.add(sky, sea);

  const sunLight = new THREE.DirectionalLight(0xffffff, 3), hemi = new THREE.HemisphereLight(0xffffff, 0x222222, 1);
  group.add(sunLight, sunLight.target, hemi);

  const rock = new THREE.MeshStandardMaterial({ color: 0x5f6355, roughness: 0.92 });
  const basalt = new THREE.MeshStandardMaterial({ color: 0x2b2c2e, roughness: 0.85 });
  const bark = new THREE.MeshStandardMaterial({ color: 0x3a2e26, roughness: 0.95 });
  const needles = new THREE.MeshStandardMaterial({ color: 0x1d3328, roughness: 0.9 });
  const ice = new THREE.MeshStandardMaterial({ color: 0xcfe2f0, roughness: 0.35 });
  const r = rng(7), f = newFrame(), p = new THREE.Vector3();

  // islands: noisy domes whose edges slip under the sea
  const island = (at: Vec3Like, radius: number, height: number, mat: THREE.Material): void => {
    frameAt(at, f);
    const rings = 22, sectors = 56, pos: number[] = [], idx: number[] = [], lobes = Array.from({ length: 5 }, () => [r() * 6.28, 0.12 + r() * 0.2]);
    for (let i = 0; i <= rings; i++) {
      const rho = i / rings;
      for (let j = 0; j < sectors; j++) {
        const a = (j / sectors) * Math.PI * 2;
        let k = 1;
        for (const [ph, amp] of lobes) k += amp * Math.cos(a * 2 + ph) * 0.5 + amp * Math.sin(a * 3 + ph * 2) * 0.3;
        const d = rho * radius * k, h = height * Math.pow(Math.max(0, 1 - rho * rho), 1.4) * (0.85 + 0.3 * r()) - 4 * rho;
        placeOn(f, Math.cos(a) * d, Math.sin(a) * d, h, R, p);
        pos.push(p.x, p.y, p.z);
      }
    }
    for (let i = 0; i < rings; i++) {
      for (let j = 0; j < sectors; j++) {
        const a = i * sectors + j, b = i * sectors + ((j + 1) % sectors), c = a + sectors, d = b + sectors;
        idx.push(a, c, b, b, c, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    group.add(new THREE.Mesh(g, mat));
  };
  for (const at of spots.isles) island(at, 28 + r() * 30, 14 + r() * 26, rock);

  // a natural arch of black rock, with stacks either side
  {
    frameAt(spots.arch, f);
    const g = new THREE.TorusGeometry(24, 7, 14, 48, Math.PI), q = g.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < q.count; i++) {
      const x = q.getX(i), y = q.getY(i), z = q.getZ(i), n = Math.sin(x * 0.4) * Math.cos(y * 0.5) * 1.6 + Math.sin(z * 0.9 + x * 0.2);
      q.setXYZ(i, x + n * 0.4, y + Math.abs(n) * 0.6, z * 1.3 + n * 0.5);
    }
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, basalt);
    m.matrixAutoUpdate = false;
    m.matrix.makeBasis(f.e, f.c, f.n).setPosition(f.c.clone().multiplyScalar(R - 2));
    group.add(m);
    island({ x: f.c.x + f.e.x * 0.12, y: f.c.y + f.e.y * 0.12, z: f.c.z + f.e.z * 0.12 }, 16, 30, basalt);
    island({ x: f.c.x - f.e.x * 0.13 + f.n.x * 0.05, y: f.c.y - f.e.y * 0.13 + f.n.y * 0.05, z: f.c.z - f.e.z * 0.13 + f.n.z * 0.05 }, 14, 22, basalt);
  }

  // Mistwood: a low rooty island under tall cedar trunks
  {
    island(spots.mistwood, 75, 4, rock);
    frameAt(spots.mistwood, f);
    const trunk = new THREE.CylinderGeometry(0.9, 2.4, 1, 10).translate(0, 0.5, 0), crown = new THREE.ConeGeometry(5, 1, 9).translate(0, 0.5, 0);
    for (let k = 0; k < 26; k++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 62, hgt = 45 + r() * 30;
      const t = new THREE.Mesh(trunk, bark), c = new THREE.Mesh(crown, needles);
      placeOn(f, Math.cos(a) * d, Math.sin(a) * d, 0, R, p);
      const up = p.clone().normalize();
      for (const [mesh, base, len] of [[t, 0, hgt], [c, hgt * 0.55, hgt * 0.5]] as const) {
        mesh.position.copy(p).addScaledVector(up, base);
        mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
        mesh.scale.set(1, len, 1);
        group.add(mesh);
      }
    }
  }

  // ice spires round the pole
  {
    frameAt(spots.pole, f);
    const cone = new THREE.ConeGeometry(1, 1, 7).translate(0, 0.5, 0);
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2 + r() * 0.3, d = k === 0 ? 0 : 18 + r() * 14, hgt = k === 0 ? 70 : 25 + r() * 25;
      const m = new THREE.Mesh(cone, ice);
      placeOn(f, Math.cos(a) * d, Math.sin(a) * d, -2, R, p);
      m.position.copy(p);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p.clone().normalize());
      m.scale.set(6 + r() * 4, hgt, 6 + r() * 4);
      group.add(m);
    }
  }

  const amb = new THREE.Color(), sunC = new THREE.Color(), up = new THREE.Vector3();
  return {
    group,
    land: [rock, basalt, bark, needles, ice],
    update(local, eye) {
      up.copy(eye).normalize();
      own.uFog.value = local.fogDensity;
      own.uFogColor.value.copy(local.fogColor);
      own.uFlash.value = local.flash;
      own.uChop.value = 0.5 * (1 + 1.4 * Math.max(local.rain, local.thunder)) * (1 - 0.85 * local.calm);
      sky.position.copy(eye);
      const sun = shared.uSunDir.value;
      sunColor(up, 10, sun, R, sunC);
      sunLight.color.copy(sunC).multiplyScalar(1 / Math.max(0.001, Math.max(sunC.r, sunC.g, sunC.b)));
      sunLight.intensity = Math.max(sunC.r, sunC.g, sunC.b) * 3.1;
      sunLight.position.copy(eye).addScaledVector(sun, 400);
      sunLight.target.position.copy(eye);
      skyAmbient(up, sun, shared.uMoonDir.value, amb);
      hemi.color.copy(amb).multiplyScalar(3.2).add(new THREE.Color(0.6, 0.66, 0.85).multiplyScalar(local.flash * 2));
      hemi.groundColor.copy(amb).multiplyScalar(0.8);
      hemi.intensity = 1;
      hemi.position.copy(up);
    },
  };
}
