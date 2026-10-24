// The style gallery: a test page outside the game build (tests/pages/style.html), where the style module and the
// ink pipeline are judged before any game scene exists. A stretch of the real-sized planet (R = 200) round an island
// at the north pole, primitive solids in the illuminator's pigments on the sea before it, a row of cones running
// over the curve to show lines fading with distance, gold leaf, and the interface primitives over it all.
//
//   ?hour=17.5            hour of the day (palette and sun)
//   ?view=deck|high|orbit camera preset
//   ?ui=0                 hide the interface
//   ?dynamic=1            let the render scale float (default: pinned at 1 for captures)
//
// window.__style drives it from tests/style/gallery.test.ts and tests/pages/style.shots.ts.
import * as THREE from 'three';
import { Pipeline } from '../../src/render/pipeline.ts';
import { STYLE_GLSL, illustratedMaterial, inkMaterial, linearVec, transmittanceVec } from '../../src/style/glsl.ts';
import { PIGMENTS, SEA_WASHES, TEAMS, hex, type RGB } from '../../src/style/palette.ts';
import { ButtonBase, Scrap, ThreatVignette } from '../../src/ui/parchment.ts';

const R = 200;
const ISLAND = new THREE.Vector3(0, 1, 0);
const params = new URLSearchParams(location.search);

const canvas = document.querySelector('canvas')!;
const pipeline = new Pipeline(canvas);
const style = pipeline.style;
if (params.get('dynamic') !== '1') pipeline.pinScale(1);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1, 0.3, 3000);

/** The point on the sea at tangent-plane offset (x, z) from the island, and its up direction. */
function surface(x: number, z: number, height = 0): { at: THREE.Vector3; up: THREE.Vector3 } {
  const up = new THREE.Vector3(x, R, z).normalize();
  return { at: up.clone().multiplyScalar(R + height), up };
}

// ---- the planet's sea: depth washes from the island's shallows to the deep, and portolan coast rings ----------
const SEA_FRAG = /* glsl */ `
in vec3 vWorld;
uniform vec3 uIsland;
uniform vec3 uLagoonT, uShallowT, uShelfT, uDeepT;
uniform vec4 uDensity; // the SEA_WASHES densities, lagoon to deep
void main() {
  vec3 up = normalize(vWorld);
  Paper q = paperAt(vWorld, up, 1.0);
  float dist = acos(clamp(dot(up, uIsland), -1.0, 1.0)) * ${R.toFixed(1)}; // from the island's centre, world units
  vec3 col = parchment(q);
  // the deep and the shelf bleed softly into one another; the shallows were laid after, with a frilled edge where
  // their pigment dried into a darker ring
  float shelf = 1.0 - smoothstep(30.0, 70.0, dist), e = dist + (q.bloom - 0.5) * 5.0;
  float shallow = 1.0 - smoothstep(27.0, 28.2, e), dried = smoothstep(23.5, 28.0, e) * shallow;
  col = glaze(col, uDeepT, (1.0 - shelf) * uDensity.w, 0.0, q);
  col = glaze(col, uShelfT, shelf * (1.0 - shallow) * uDensity.z, 0.0, q);
  col = glaze(col, uShallowT, shallow * uDensity.y, dried * 0.9, q);
  // coast rings: fine parallel lines spreading out from the shore, fainter as they go
  float ring = (dist - 21.0) / 1.5, px = fwidth(ring);
  float line = clamp(0.35 * uRenderPx + 0.5 - abs(fract(ring) - 0.5) / px, 0.0, 1.0) * step(0.5, ring) * (1.0 - smoothstep(0.0, 6.0, ring));
  col = mix(col, uInk, line * 0.55);
  writeInk(col, up);
}
`;
const sea = new THREE.Mesh(
  new THREE.SphereGeometry(R, 720, 360),
  inkMaterial(style, {
    vertexShader: /* glsl */ `out vec3 vWorld; void main() { vWorld = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0); }`,
    fragmentShader: SEA_FRAG,
    inkWeight: 0.7,
    uniforms: {
      uIsland: { value: ISLAND },
      uLagoonT: { value: transmittanceVec(SEA_WASHES.lagoon.pigment) },
      uShallowT: { value: transmittanceVec(SEA_WASHES.shallows.pigment) },
      uShelfT: { value: transmittanceVec(SEA_WASHES.shelf.pigment) },
      uDeepT: { value: transmittanceVec(SEA_WASHES.deep.pigment) },
      uDensity: {
        value: new THREE.Vector4(SEA_WASHES.lagoon.density, SEA_WASHES.shallows.density, SEA_WASHES.shelf.density, SEA_WASHES.deep.density),
      },
    },
  }),
);
scene.add(sea);

// ---- the island: a terrain-like surface with peaks, cliffs and a shelf, hatched along its contours ------------
function islandHeight(x: number, z: number): number {
  const r = Math.hypot(x, z), s = (a: number, b: number, t: number) => {
    const u = Math.min(Math.max((t - a) / (b - a), 0), 1);
    return u * u * (3 - 2 * u);
  };
  // ridged value noise for the rock, on a dome with a western summit and a lower eastern shoulder, falling to a shelf
  const hash = (i: number, j: number) => {
    const h = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
    return h - Math.floor(h);
  };
  const noise = (u: number, v: number) => {
    const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j, a = fu * fu * (3 - 2 * fu), b = fv * fv * (3 - 2 * fv);
    return hash(i, j) * (1 - a) * (1 - b) + hash(i + 1, j) * a * (1 - b) + hash(i, j + 1) * (1 - a) * b + hash(i + 1, j + 1) * a * b;
  };
  let ridges = 0;
  for (let o = 0, f = 0.16, amp = 1; o < 4; o++, f *= 2.03, amp *= 0.48) ridges += amp * (1 - Math.abs(noise(x * f + 3.1 * o, z * f - 1.7 * o) * 2 - 1));
  const dome = 8.5 * Math.exp(-(((x + 3) ** 2 + (z + 2) ** 2) / 70)) + 4 * Math.exp(-(((x - 8) ** 2 + (z - 3) ** 2) / 40));
  const base = 2.2 * (1 - s(10, 22, r)) - 1.8 * s(19, 30, r);
  return base + (dome + 2.2 * ridges) * (1 - s(9, 20, r));
}
{
  const rings = 120, segs = 320, reach = 34, pos: number[] = [], index: number[] = [];
  for (let j = 0; j <= rings; j++) {
    const arc = reach * (j / rings) ** 1.15;
    for (let i = 0; i < segs; i++) {
      const phi = (i / segs) * Math.PI * 2, x = arc * Math.cos(phi), z = arc * Math.sin(phi);
      const p = surface(x, z, islandHeight(x, z)).at;
      pos.push(p.x, p.y, p.z);
    }
  }
  for (let j = 0; j < rings; j++) {
    for (let i = 0; i < segs; i++) {
      const a = j * segs + i, b = j * segs + ((i + 1) % segs), c = a + segs, d = b + segs;
      index.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  scene.add(new THREE.Mesh(g, illustratedMaterial(style, { pigment: hex('#8c7a48'), hatch: { axis: [0, 1, 0] } })));
}

// ---- primitive solids in the illuminator's pigments -----------------------------------------------------------
function place(mesh: THREE.Mesh, x: number, z: number, height: number, turn = 0): THREE.Mesh {
  const { at, up } = surface(x, z, height);
  mesh.position.copy(at);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
  mesh.rotateY(turn);
  scene.add(mesh);
  return mesh;
}
const solid = (geometry: THREE.BufferGeometry, pigment: RGB, hatch?: Parameters<typeof illustratedMaterial>[1]['hatch'], density = 1) =>
  new THREE.Mesh(geometry, illustratedMaterial(style, { pigment, density, hatch, anchor: 'object' }));

// The deck camera stands at FOOT; things are placed by distance and bearing from it (degrees, + to the right of
// the view axis AXIS), so the island sits in the right third, sinking below the curve, and a row of cones runs off
// over the horizon on the left.
const FOOT = [-22, 46] as const, AXIS = 10.5;
function bearing(distance: number, degrees: number): [number, number] {
  const t = THREE.MathUtils.degToRad(AXIS + degrees);
  return [FOOT[0] + distance * Math.sin(t), FOOT[1] - distance * Math.cos(t)];
}
place(solid(new THREE.SphereGeometry(2, 96, 64), PIGMENTS.ultramarine, { mode: 'uv', scale: [12.6, 6.3] }), ...bearing(24, -16), 1.1);
place(solid(new THREE.ConeGeometry(1.7, 4.6, 96, 1), PIGMENTS.vermilion), ...bearing(20, -7), 2.3);
place(solid(new THREE.TorusGeometry(2.1, 0.75, 64, 128), PIGMENTS.malachite, { mode: 'uv', scale: [13.2, 4.7], angle: Math.PI / 2 }), ...bearing(21, 9), 0.45).rotateX(Math.PI / 2);
place(solid(new THREE.CylinderGeometry(1.1, 1.25, 6.5, 96, 1), PIGMENTS.ochre, undefined, 0.9), ...bearing(31, 26), 3.2);
place(solid(new THREE.BoxGeometry(2.6, 2.6, 2.6), PIGMENTS.umber, { axis: [0.3, 1, 0.2] }), ...bearing(15, 17), 0.9, 0.5);
place(solid(new THREE.CylinderGeometry(0.9, 0.9, 3.2, 6, 1), PIGMENTS.verdigris, undefined, 1.2), ...bearing(29, 2), 1.6, 0.3);
place(solid(new THREE.SphereGeometry(1.3, 64, 48), PIGMENTS.roseMadder, { mode: 'uv', scale: [8.2, 4.1] }), ...bearing(12, 5), 0.9);
place(new THREE.Mesh(new THREE.TorusKnotGeometry(0.95, 0.32, 256, 32), illustratedMaterial(style, { pigment: PIGMENTS.goldLeaf, gold: true, anchor: 'object', hatch: { mode: 'uv', scale: [30, 2] } })), ...bearing(16, -3), 1.9);
for (const [k, [d, b]] of [[26, -25], [36, -23], [48, -21.5], [62, -20.3], [78, -19.4], [96, -18.7], [116, -18.2]].entries()) {
  place(solid(new THREE.ConeGeometry(1.5, 4.2, 64, 1), k % 2 ? PIGMENTS.vermilion : PIGMENTS.indigo, undefined, k % 2 ? 1 : 0.6), ...bearing(d, b), 2.1);
}

// ---- the sky: a wash deepening to the zenith, giving way to bare parchment as the camera leaves the planet ------
const SKY_FRAG = /* glsl */ `
in vec3 vWorld;
uniform vec3 uZenith, uHorizon;
void main() {
  vec3 dir = normalize(vWorld - cameraPosition), up = normalize(cameraPosition);
  Paper q = paperAt(dir * 400.0, dir, 0.0);
  float sky = 1.0 - smoothstep(40.0, 260.0, length(cameraPosition) - ${R.toFixed(1)});
  vec3 wash = mix(uHorizon, uZenith, smoothstep(-0.02, 0.55, dot(dir, up)));
  writeInk(mix(parchment(q), parchment(q) / uPaper * wash, sky), dir);
}
`;
const skyUniforms = { uZenith: { value: new THREE.Vector3() }, uHorizon: { value: new THREE.Vector3() } };
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(2800, 64, 32),
  inkMaterial(style, {
    vertexShader: /* glsl */ `out vec3 vWorld; void main() { vWorld = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0); }`,
    fragmentShader: SKY_FRAG, id: 0, side: THREE.BackSide, uniforms: skyUniforms,
  }),
);
sky.frustumCulled = false;
scene.add(sky);

// ---- the interface ----------------------------------------------------------------------------------------------
const SWATCH_FRAG = /* glsl */ `
in vec2 vLocal;
layout(location = 0) out vec4 outColor;
uniform vec2 uSize;
uniform vec3 uTeamLin[10];
uniform vec3 uTeamT[10];
uniform vec3 uSeaT;
void main() {
  // two rows of five cells: each the team's waters over the sea, and its trail pattern below on bare parchment
  vec2 p = vLocal + uSize * 0.5, cell = uSize / vec2(5.0, 2.0);
  ivec2 c = ivec2(p / cell);
  int k = c.y * 5 + c.x;
  vec2 f = (p - vec2(c) * cell) / cell;
  vec3 paper = uPaper * (1.0 + (texture(tPaper, p / 280.0).r - 0.5) * 0.15);
  vec3 col = paper;
  float a = 0.0;
  if (f.y > 0.12 && f.y < 0.5 && f.x > 0.1 && f.x < 0.9) {
    col = watersColour(wash(paper, uSeaT, 0.8), uTeamLin[k], uTeamT[k]);
    a = 1.0;
  }
  float s = (f.x - 0.1) * cell.x / 9.0, t = (f.y - 0.72) * cell.y / 9.0;
  float trail = trailPattern(k, s, t, fwidth(s)) * step(0.1, f.x) * step(f.x, 0.9);
  col = mix(col, trailColour(uTeamLin[k], uTeamT[k]), trail);
  outColor = vec4(toDisplay(col), max(a, trail));
}
`;

const vignette = new ThreatVignette(style);
const ui: { place(w: number, h: number, inset: { left: number; right: number; bottom: number }): void }[] = [];
if (params.get('ui') !== '0') {
  const hull = new Scrap(style, { width: 230, height: 58, frame: 'double', torn: [0.15, 1, 0.3, 0.1], age: 0.25 });
  const card = new Scrap(style, { width: 330, height: 156, frame: 'rule', torn: [0.9, 0.3, 0.2, 0.6], age: 0.35 });
  const swatches = new THREE.Mesh(
    new THREE.PlaneGeometry(300, 120),
    new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: /* glsl */ `out vec2 vLocal; void main() { vLocal = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: STYLE_GLSL + SWATCH_FRAG,
      uniforms: {
        ...style.uniforms,
        uSize: { value: new THREE.Vector2(300, 120) },
        uTeamLin: { value: TEAMS.map((t) => linearVec(t.primary)) },
        uTeamT: { value: TEAMS.map((t) => transmittanceVec(t.primary)) },
        uSeaT: { value: transmittanceVec(SEA_WASHES.shelf.pigment) },
      },
      transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
    }),
  );
  const buttons = [new ButtonBase(style, 30), new ButtonBase(style, 30), new ButtonBase(style, 30), new ButtonBase(style, 38)];
  buttons[0].sweep(0.65, PIGMENTS.ultramarine);
  buttons[1].sweep(0.3, PIGMENTS.vermilion);
  buttons[2].pressed = 1;
  buttons[3].disabled = 1;
  pipeline.ui.add(vignette, hull, card, swatches, ...buttons);
  vignette.set(Math.PI, 0.75);
  ui.push({
    place(w, h, inset) {
      // the interface keeps its size on the iPad and shrinks to fit the short side of an iPhone
      const k = Math.min(1, h / 720), m = 24 * k;
      for (const o of [hull, card, swatches, ...buttons]) o.scale.setScalar(k);
      hull.position.set(inset.left + m + 115 * k, m + 29 * k, 0);
      card.position.set(inset.left + m + 165 * k, h - inset.bottom - m - 78 * k, 0);
      swatches.position.copy(card.position);
      const bx = w - inset.right - m, by = h - inset.bottom - m;
      buttons[3].position.set(bx - 38 * k, by - 38 * k, 0);
      buttons[0].position.set(bx - 122 * k, by - 30 * k, 0);
      buttons[1].position.set(bx - 42 * k, by - 114 * k, 0);
      buttons[2].position.set(bx - 112 * k, by - 104 * k, 0);
      vignette.setView(w, h);
    },
  });
}

// ---- views, hours, frames -----------------------------------------------------------------------------------------
const VIEWS = {
  deck: { from: [-22, 46, 4.0], to: [-12.9, -3.2, 1.2], fade: [24, 110] },
  high: { from: [-36, 88, 34], to: [-16, 22, 0], fade: [40, 170] },
  orbit: { from: null, to: null, fade: [420, 1300] },
} as const;
type View = keyof typeof VIEWS;

function setView(name: View): void {
  const v = VIEWS[name];
  if (v.from && v.to) {
    const from = surface(v.from[0], v.from[1], v.from[2]), to = surface(v.to[0], v.to[1], v.to[2]);
    camera.position.copy(from.at);
    camera.up.copy(from.up);
    camera.lookAt(to.at);
  } else {
    camera.position.set(170, 520, 520);
    camera.up.set(0, 1, 0);
    camera.lookAt(0, 30, 0);
  }
  pipeline.ink.fadeStart = v.fade[0];
  pipeline.ink.fadeEnd = v.fade[1];
  camera.updateMatrixWorld();
}

/** The sun's direction at an hour, rising in the east (+x) and setting in the west, and the moon by night. */
function setHour(hour: number): void {
  style.setHour(hour);
  const day = ((hour - 6) / 12) * Math.PI, el = Math.sin(day);
  const sun = el > 0.05
    ? new THREE.Vector3(Math.cos(day), Math.max(el, 0.12) * 1.1, 0.45)
    : new THREE.Vector3(-0.55, 0.85, 0.5);
  style.uniforms.uSun.value.copy(sun.normalize());
  skyUniforms.uZenith.value.copy(linearVec(style.palette.skyZenith));
  skyUniforms.uHorizon.value.copy(linearVec(style.palette.skyHorizon));
}

function resize(): void {
  const w = innerWidth, h = innerHeight;
  pipeline.setSize(w, h, devicePixelRatio);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
  document.body.append(probe);
  const cs = getComputedStyle(probe);
  const inset = { left: parseFloat(cs.paddingLeft), right: parseFloat(cs.paddingRight), bottom: parseFloat(cs.paddingBottom) };
  probe.remove();
  for (const u of ui) u.place(w, h, inset);
}

let last = performance.now();
function frame(): void {
  const now = performance.now();
  sky.position.copy(camera.position);
  pipeline.render(scene, camera, Math.min((now - last) / 1000, 0.1));
  last = now;
}

/** Device-pixel position of a world point in the current view, or null when behind the camera. */
function project(p: THREE.Vector3): [number, number] | null {
  const v = p.clone().project(camera);
  if (v.z > 1) return null;
  const s = canvas.width / innerWidth;
  return [((v.x + 1) / 2) * innerWidth * s, ((1 - v.y) / 2) * innerHeight * s];
}

/**
 * Render a frame, then the fine grain at each device-pixel position: the mean luminance of the 3×3 pixels there less
 * that of the 9×9 round it, so broad washes and stains drop out and paper, granulation and strokes remain. NaN where
 * the 9×9 block leaves the frame.
 */
function probePixels(px: ([number, number] | null)[]): number[] {
  frame();
  const gl = pipeline.renderer.getContext(), block = new Uint8Array(81 * 4);
  return px.map((q) => {
    if (!q) return NaN;
    const x = Math.round(q[0]), y = canvas.height - 1 - Math.round(q[1]);
    if (x < 4 || y < 4 || x > canvas.width - 5 || y > canvas.height - 5) return NaN;
    gl.readPixels(x - 4, y - 4, 9, 9, gl.RGBA, gl.UNSIGNED_BYTE, block);
    let centre = 0, all = 0;
    for (let i = 0; i < 81; i++) {
      const l = 0.2126 * block[i * 4] + 0.7152 * block[i * 4 + 1] + 0.0722 * block[i * 4 + 2];
      all += l;
      if (Math.abs((i % 9) - 4) <= 1 && Math.abs(Math.floor(i / 9) - 4) <= 1) centre += l;
    }
    return centre / 9 - all / 81;
  });
}

setHour(Number(params.get('hour') ?? 17.5));
setView((params.get('view') as View) ?? 'deck');
resize();
addEventListener('resize', resize);
const loop = () => {
  frame();
  requestAnimationFrame(loop);
};
requestAnimationFrame(loop);

Object.assign(window, {
  __style: {
    ready: true,
    stats: () => ({ ...pipeline.stats }),
    view: (name: View) => setView(name),
    hour: (h: number) => setHour(h),
    /** Visible points of the open sea at least minDist from the island, inside the frame's margin. */
    seaPoints(count: number, minDist: number, margin: number): number[][] {
      const out: number[][] = [], ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
      const planet = new THREE.Sphere(new THREE.Vector3(), R), hit = new THREE.Vector3();
      for (let i = 0; out.length < count && i < count * 400; i++) {
        const x = margin + ((i * 0.618034) % 1) * (innerWidth - 2 * margin), y = margin + ((i * 0.7548777) % 1) * (innerHeight - 2 * margin);
        ndc.set((x / innerWidth) * 2 - 1, 1 - (y / innerHeight) * 2);
        ray.setFromCamera(ndc, camera);
        if (!ray.ray.intersectSphere(planet, hit)) continue;
        if (Math.acos(hit.clone().normalize().dot(ISLAND)) * R < minDist) continue;
        out.push(hit.toArray());
      }
      return out;
    },
    probe: (points: number[][]) => probePixels(points.map((p) => project(new THREE.Vector3().fromArray(p)))),
    project: (points: number[][]) => points.map((p) => project(new THREE.Vector3().fromArray(p))),
    probePixels,
    /** Turn the camera where it stands: yaw about its up and pitch about its right, radians. */
    turn(yaw: number, pitch: number): void {
      camera.rotateOnAxis(new THREE.Vector3(0, 1, 0), yaw);
      camera.rotateOnAxis(new THREE.Vector3(1, 0, 0), pitch);
      camera.updateMatrixWorld();
    },
  },
});
