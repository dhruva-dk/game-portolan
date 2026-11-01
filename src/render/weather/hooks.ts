// Material hooks, so the weather can reach things it doesn't own. Icing frosts the upward faces of any standard
// material (rigging, spars, rock) as an amount builds from 0 to 1, with glassy, sparkling ice; wetness darkens
// and polishes a surface in rain, with drips running down its steep faces. Both patch the material's shader in
// place and keep whatever patch it already had.
import * as THREE from 'three';

export interface Amount { value: number }

const NOISE = /* glsl */ `
float wxHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float wxNoise(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(wxHash(i), wxHash(i + vec3(1, 0, 0)), f.x), mix(wxHash(i + vec3(0, 1, 0)), wxHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(wxHash(i + vec3(0, 0, 1)), wxHash(i + vec3(1, 0, 1)), f.x), mix(wxHash(i + vec3(0, 1, 1)), wxHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}`;

// World position and normal, with instancing, for the fragment shader.
const VERT_DECL = /* glsl */ `
varying vec3 vWxWorld;
varying vec3 vWxNormal;`;
const VERT_BODY = /* glsl */ `
{
  vec4 wxP = vec4(transformed, 1.0);
  vec3 wxN = objectNormal;
  #ifdef USE_INSTANCING
  wxP = instanceMatrix * wxP;
  wxN = mat3(instanceMatrix) * wxN;
  #endif
  vWxWorld = (modelMatrix * wxP).xyz;
  vWxNormal = normalize(mat3(modelMatrix) * wxN);
}`;

type Patch = { decl: string; color: string; rough: string; uniforms: Record<string, THREE.IUniform> };

function hook(material: THREE.Material, key: string, patch: Patch): void {
  const prev = material.onBeforeCompile, prevKey = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    prev.call(material, shader, renderer);
    Object.assign(shader.uniforms, patch.uniforms);
    if (!shader.vertexShader.includes('vWxWorld')) {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${VERT_DECL}`)
        .replace('#include <project_vertex>', `#include <project_vertex>\n${VERT_BODY}`);
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\n${VERT_DECL}\n${NOISE}`);
    }
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${patch.decl}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${patch.color}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${patch.rough}`);
  };
  material.customProgramCacheKey = () => `${prevKey()}|${key}`;
  material.needsUpdate = true;
}

/**
 * Frosts the material's upward faces (up is away from the planet's centre) as ice.value goes from 0 to 1.
 * Works on MeshStandardMaterial and MeshPhysicalMaterial.
 */
export function addIcing(material: THREE.Material, ice: Amount): void {
  hook(material, 'wx-ice', {
    uniforms: { uWxIce: ice },
    decl: 'uniform float uWxIce;',
    color: /* glsl */ `
float wxUp = dot(normalize(vWxNormal), normalize(vWxWorld));
float wxN = wxNoise(vWxWorld * 3.0) * 0.6 + wxNoise(vWxWorld * 11.0) * 0.4;
float wxFrost = smoothstep(1.0 - uWxIce * 1.3, 1.25 - uWxIce * 1.3, wxUp * 0.45 + 0.55 + (wxN - 0.5) * 0.55) * smoothstep(0.0, 0.12, uWxIce);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.8, 0.88, 0.96), wxFrost);`,
    rough: 'roughnessFactor = mix(roughnessFactor, 0.28 + 0.3 * wxNoise(vWxWorld * 40.0), wxFrost);',
  });
}

/** Darkens and polishes the material as wet.value goes from 0 to 1, with drips running down its steep faces. */
export function addWetness(material: THREE.Material, wet: Amount, time: Amount): void {
  hook(material, 'wx-wet', {
    uniforms: { uWxWet: wet, uWxTime: time },
    decl: 'uniform float uWxWet, uWxTime;',
    color: /* glsl */ `
vec3 wxUpW = normalize(vWxWorld);
float wxSteep = 1.0 - abs(dot(normalize(vWxNormal), wxUpW));
float wxCol = wxHash(floor(vWxWorld * vec3(7.0, 7.0, 7.0) - wxUpW * dot(vWxWorld * 7.0, wxUpW)));
float wxDrip = smoothstep(0.82, 1.0, fract(length(vWxWorld) * 1.3 + uWxTime * (0.4 + wxCol) + wxCol * 9.0)) * wxSteep;
float wxWet = uWxWet * (0.75 + 0.25 * wxNoise(vWxWorld * 2.0));
diffuseColor.rgb *= mix(1.0, 0.58, wxWet);`,
    rough: 'roughnessFactor = mix(roughnessFactor, 0.1, wxWet * (0.8 + 0.2 * wxDrip));',
  });
}
