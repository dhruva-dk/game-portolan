// The planet's air and light, as GLSL woven into three's own shader chunks so every material shares them.
//
// The planet's centre is the world origin and its radius is uPlanet.x. Everything is worked out per fragment from
// where that fragment sits on the sphere, never from a global "up": that is how one sun leaves half the planet dark,
// how dusk can cross a region while you watch, and how the same shaders hold from 8 m above the sea and from orbit.
//
// - planetShade(wp, L): how much of a light at direction L reaches wp past the planet's own bulk (the terminator).
// - keyAt(k, e): the air's colours by the sun's height e (the sine of its elevation where the fragment is):
//   k = 0 the horizon fog, 1 the sun's colour after the air, 2 the sky's light from above, 3 the light off the ground.
// - planetAmbient(wp, n): the sky light a surface gets, by its local sun height and how it faces.
// - underSea(col, wp): what lies below the water, seen through it: absorbed with depth and tinted by the sea there;
//   land past the horizon seen through a dip of the eye's line through the sea sinks into it.
// - atmosphere(col, wp): the air between the eye and wp, plus the limb from orbit and the Storm's tint.
//
// Any shader that includes <planet> (or three's fog or light chunks) gets these uniforms declared. A shader of its own
// that uses one of them too (uTime, uNight, uSunDir, uNoise...) declares it with sharedUniforms(), so whichever comes
// first declares it, with or without the planet's chunks installed. Give them values with patch() from engine.ts.
import * as THREE from 'three';

/** Declares uniforms a shader shares with the planet's chunk; each is declared by whichever shader text comes first. */
export function sharedUniforms(type: string, ...names: string[]): string {
  return names.map((n) => `#ifndef U_${n}\n#define U_${n}\nuniform ${type} ${n};\n#endif`).join('\n');
}

export const PLANET_GLSL = /* glsl */ `
#ifndef PLANET_CHUNK
#define PLANET_CHUNK
${sharedUniforms('vec3', 'uSunDir', 'uMoonDir', 'uFogSun', 'uFogColor')}
${sharedUniforms('float', 'uFogDensity', 'uFogFalloff', 'uTime', 'uNight', 'uStormOn', 'uLiftOn')}
${sharedUniforms('vec4', 'uMist', 'uPlanet', 'uStorm')}
uniform vec3 uKey[20];
uniform vec4 uLiftAt[5], uLiftR[5];
${sharedUniforms('sampler2D', 'uNoise', 'uSeaTint', 'uSeaShare')}

vec3 keyAt(int k, float e) {
  int b = k * 5;
  if (e <= -0.25) return uKey[b];
  if (e < -0.08) return mix(uKey[b], uKey[b + 1], (e + 0.25) / 0.17);
  if (e < 0.0) return mix(uKey[b + 1], uKey[b + 2], (e + 0.08) / 0.08);
  if (e < 0.12) return mix(uKey[b + 2], uKey[b + 3], e / 0.12);
  if (e < 0.45) return mix(uKey[b + 3], uKey[b + 4], (e - 0.12) / 0.33);
  return uKey[b + 4];
}

vec3 viewToWorld(vec3 v) { return transpose(mat3(viewMatrix)) * (v - viewMatrix[3].xyz); }
vec3 viewDirToWorld(vec3 d) { return (vec4(d, 0.0) * viewMatrix).xyz; }

// the planet's own shadow: higher points see the sun a little longer, as the horizon dips beneath them
float planetShade(vec3 wp, vec3 L) {
  if (uPlanet.x < 1.0) return 1.0;
  float r = length(wp);
  float dip = sqrt(2.0 * max(r - uPlanet.x, 0.0) / uPlanet.x);
  return smoothstep(-0.035 - dip, 0.02 - dip, dot(wp / r, L));
}

vec3 planetAmbient(vec3 wp, vec3 n) {
  if (uPlanet.x < 1.0) return vec3(0.3);
  vec3 up = normalize(wp);
  float e = dot(up, uSunDir);
  return mix(keyAt(3, e), keyAt(2, e), 0.5 + 0.5 * dot(n, up));
}

// the sea's body colour and clarity at a direction from the planet's centre
vec4 seaTint(vec3 up) {
  vec2 uv = vec2(atan(-up.z, up.x) * 0.15915494 + 0.5, asin(clamp(up.y, -1.0, 1.0)) * 0.31830989 + 0.5);
  return texture(uSeaTint, uv);
}

// how far the regions' events have raised the sea over a direction from the planet's centre, metres (lift.ts)
float seaLift(vec3 up) {
  if (uLiftOn == 0.0) return 0.0;
  float h = 0.0;
  vec4 share = vec4(-1.0);
  for (int i = 0; i < 5; i++) {
    if (uLiftAt[i].w == 0.0) continue;
    float d = uPlanet.x * sqrt(max(0.0, 2.0 - 2.0 * dot(up, uLiftAt[i].xyz)));
    float f = 1.0 - smoothstep(uLiftR[i].x, uLiftR[i].x + uLiftR[i].y, d);
    if (f <= 0.0) continue;
    if (share.x < 0.0) share = texture(uSeaShare, vec2(atan(-up.z, up.x) * 0.15915494 + 0.5, asin(clamp(up.y, -1.0, 1.0)) * 0.31830989 + 0.5));
    h += uLiftAt[i].w * f * share[int(uLiftR[i].z)];
  }
  return h;
}

// the light the water itself carries at a point: sun through the surface and the sky's
vec3 seaLight(vec3 wp) {
  vec3 up = normalize(wp);
  float e = dot(up, uSunDir);
  return keyAt(1, e) * max(e, 0.0) * 2.2 * planetShade(wp, uSunDir) + keyAt(2, e) * 0.75;
}

vec3 underSea(vec3 col, vec3 wp) {
  if (uPlanet.x < 1.0) return col;
  // the eye's line at its lowest: wp itself for a floor the line runs down to. A line that dips through the sea short
  // of the horizon and out again to land beyond it passes over a floor at least that deep, and that floor is what
  // shows through the water there, as the sky draws it (sky.ts), not the land the planet's curve hides
  vec3 v = wp - cameraPosition;
  vec3 lo = cameraPosition + v * clamp(-dot(cameraPosition, v) / max(dot(v, v), 1e-6), 0.0, 1.0);
  float rw = length(lo);
  vec3 up = lo / rw, dir = normalize(v);
  float depth = uPlanet.y + seaLift(up) - rw;
  if (depth <= 0.0 || length(cameraPosition) < uPlanet.y) return col;
  // the path through the water, bent toward the vertical as it enters
  float c = abs(dot(dir, up));
  float path = depth / max(sqrt(1.0 - (1.0 - c * c) * 0.565), 0.3);
  vec4 tint = seaTint(up);
  vec3 k = mix(vec3(0.45, 0.14, 0.11), vec3(0.2, 0.055, 0.045), tint.a);
  vec3 T = exp(-k * path);
  float s = 1.0 - exp(-path * mix(0.4, 0.12, tint.a));
  return col * T + tint.rgb * seaLight(lo) * s;
}

float airDepth(float a, float b, float h0, float h1, float L) {
  h0 = max(h0, -5.0); h1 = max(h1, -5.0);
  float dh = h1 - h0, e0 = exp(-b * h0);
  return abs(b * dh) > 1e-3 ? a * L * (e0 - exp(-b * h1)) / (b * dh) : a * L * e0;
}

// the share of the light from wp that the air takes on its way to the eye
float airLoss(vec3 wp) {
  if (uPlanet.x < 1.0) return 0.0;
  vec3 d = wp - cameraPosition;
  float dist = length(d);
  float rw = length(wp);
  float h0 = length(cameraPosition) - uPlanet.y, h1 = rw - uPlanet.y;
  float od = airDepth(uFogDensity, uFogFalloff, h0, h1, dist);
  float wisp = texture(uNoise, wp.xz * 0.004 + wp.y * 0.0031 + uTime * vec2(0.004, 0.0015)).r;
  wisp = mix(1.0, smoothstep(0.25, 0.75, wisp) * 1.6, uMist.z);
  od += airDepth(uMist.x * wisp, uMist.y, h0, h1, dist) * smoothstep(0.0, 40.0, dist);
  float f = 1.0 - exp(-od);
  // from orbit, a ray grazing the limb crosses a lot of air
  float space = smoothstep(150.0, 900.0, h0);
  return max(f, space * pow(1.0 - abs(dot(d / max(dist, 1e-3), wp / rw)), 4.0) * 0.85);
}

// where the eye's line to wp enters the sea, seen from above, for a point under it or past the horizon beyond a dip
// through it: the air ends there
vec3 seaEntry(vec3 wp) {
  vec3 o = cameraPosition, v = wp - o;
  float a = dot(v, v), b = dot(o, v), c = dot(o, o) - uPlanet.y * uPlanet.y;
  if (c <= 0.0 || b >= 0.0 || a < 1e-6 || b * b <= a * c) return wp;
  float t = (-b - sqrt(b * b - a * c)) / a;
  return t < 1.0 ? o + v * t : wp;
}

vec3 atmosphere(vec3 col, vec3 wp) {
  if (uPlanet.x < 1.0) return col;
  wp = seaEntry(wp);
  vec3 dir = normalize(wp - cameraPosition), up = normalize(wp);
  float f = airLoss(wp);
  float e = dot(up, uSunDir);
  float s = max(dot(dir, uSunDir), 0.0);
  vec3 fc = keyAt(0, e) + uFogSun * keyAt(1, e) * (pow(s, 6.0) * 0.6 + pow(s, 32.0) * 0.3) * planetShade(wp, uSunDir);
  col = mix(col, fc, f);
  if (uStormOn > 0.0) {
    float outside = smoothstep(uStorm.w + 0.0015, uStorm.w - 0.003, dot(up, uStorm.xyz));
    vec3 storm = col * vec3(0.5, 0.32, 0.78) + vec3(0.035, 0.0, 0.07) * (0.4 + 0.6 * planetShade(wp, uSunDir));
    col = mix(col, storm, outside * uStormOn * 0.75);
  }
  return col;
}
#endif
`;

// the sun's colour after the air, the planet's shadow on every directional light (the moon's too)
const SHADE_DIRECT = /* glsl */ `getDirectionalLightInfo( directionalLight, directLight );
		{
			vec3 lw = viewDirToWorld( directLight.direction ), gw = viewToWorld( geometryPosition );
			directLight.color *= planetShade( gw, lw );
			if ( dot( lw, uSunDir ) > 0.9999 ) directLight.color *= keyAt( 1, dot( normalize( gw ), uSunDir ) );
		}`;

const AMBIENT = /* glsl */ `
#if defined( RE_IndirectDiffuse )
	irradiance += planetAmbient( viewToWorld( geometryPosition ), viewDirToWorld( geometryNormal ) );
#endif
`;

let installed = false;

/** Rewrites three's fog and light chunks to use the planet's air and light. Runs once, when engine.ts loads. */
export function installPlanetChunks(): void {
  if (installed) return;
  installed = true;
  const C = THREE.ShaderChunk as unknown as Record<string, string>;
  C.planet = PLANET_GLSL;
  C.fog_pars_vertex = /* glsl */ `
#ifdef USE_FOG
varying vec3 vFogWorld;
#endif`;
  // every material's world position, from the view-space one three already has
  C.fog_vertex = /* glsl */ `
#ifdef USE_FOG
vFogWorld = transpose( mat3( viewMatrix ) ) * ( mvPosition.xyz - viewMatrix[ 3 ].xyz );
#endif`;
  C.fog_pars_fragment = /* glsl */ `
#include <planet>
#ifdef USE_FOG
varying vec3 vFogWorld;
#endif`;
  C.fog_fragment = /* glsl */ `
#ifdef USE_FOG
gl_FragColor.rgb = atmosphere( underSea( gl_FragColor.rgb, vFogWorld ), vFogWorld );
#endif`;
  C.lights_pars_begin = '#include <planet>\n' + C.lights_pars_begin;
  const begin = C.lights_fragment_begin;
  if (!begin.includes('getDirectionalLightInfo( directionalLight, directLight );')) throw new Error('planet: three changed lights_fragment_begin');
  C.lights_fragment_begin = begin.replace('getDirectionalLightInfo( directionalLight, directLight );', SHADE_DIRECT);
  C.lights_fragment_maps = C.lights_fragment_maps + AMBIENT;
}
