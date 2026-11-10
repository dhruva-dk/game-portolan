// Cloud allocations and real Three node graphs, without a GPU.
//   node --test tests/clouds.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NodeBuilder, Vector3, type ComputeNode, type Mesh, type MeshBasicNodeMaterial, type WebGPURenderer } from 'three/webgpu';
import { screenUV } from 'three/tsl';
import { Clouds } from '../src/render/atmosphere/clouds.ts';

// The TSL graph's runtime fields include internal ShaderCallNode/VarNode types absent from @types/three.
type Graph = any;
function expand(node: Graph): Graph {
  while (node.isVarNode) node = node.node;
  return node.getOutputNode(new NodeBuilder(null, null, null));
}
function graphNodes(graph: Graph): Graph[] {
  const nodes = new Set<Graph>();
  graph.traverse((node: Graph) => nodes.add(node));
  return [...nodes];
}
function setup() {
  const clouds = new Clouds();
  const calls: ComputeNode[] = [];
  const renderer = { compute: (node: ComputeNode) => calls.push(node) } as unknown as WebGPURenderer;
  clouds.update(renderer, [], new Vector3(0, 2000, 0), new Vector3(0, 1, 0), new Vector3(0, -1, 0), 0, 1);
  calls.length = 0;
  const quad = clouds.group.children[0] as Mesh;
  const trace = (w: number, h: number) => {
    clouds.trace(renderer, w, h);
    return calls.at(-1)!;
  };
  const kernel = trace(1024, 768);
  const material = quad.material as MeshBasicNodeMaterial;
  const nodes = graphNodes(expand(material.outputNode));
  const textures = nodes.filter((n) => n.isTextureNode && n.value.isStorageTexture);
  assert.equal(textures.length, 2);
  const uv = textures[0].uvNode;
  assert.equal(textures[1].uvNode, uv, 'light and depth sample identical coordinates');
  const uniforms = graphNodes(uv).filter((n) => n.isUniformNode);
  const size = uniforms.find((n) => n.value.x === 256 && n.value.y === 192);
  const capacity = uniforms.find((n) => n.value.x === 256 && n.value.y === 256);
  assert.ok(size && capacity);
  return { clouds, quad, trace, kernel, material, textures, uv, size, capacity };
}

// Evaluate the actual texture-coordinate node graph. This exercises the clamp and uniforms used by the shader,
// including boundary samples where an unused or previously rendered texel would otherwise bleed into the view.
function coordinate(node: Graph, screen: number[]): number[] {
  if (node === screenUV) return screen;
  if (node.isVarNode) return coordinate(node.node, screen);
  if (node.isUniformNode || node.isConstNode) return node.value.isVector2 ? node.value.toArray() : [node.value, node.value];
  const a = coordinate(node.aNode, screen), b = coordinate(node.bNode, screen);
  if (node.isOperatorNode) return a.map((v, i) => {
    if (node.op === '*') return v * b[i];
    if (node.op === '-') return v - b[i];
    if (node.op === '/') return v / b[i];
    throw new Error(`Unhandled coordinate operator ${node.op}`);
  });
  assert.equal(node.method, 'clamp');
  const c = coordinate(node.cNode, screen);
  return a.map((v, i) => Math.min(c[i], Math.max(b[i], v)));
}

test('cloud graph identities and allocations survive shrinking and orientation changes', () => {
  const { quad, trace, kernel, material, textures, size, capacity } = setup();
  let disposals = 0;
  for (const n of textures) n.value.addEventListener('dispose', () => disposals++);
  material.addEventListener('dispose', () => disposals++);
  const kernelGraph = expand(kernel.computeNode);
  assert.ok(graphNodes(kernelGraph).includes(size), 'compute bounds and composite share the active-size uniform');
  const version = kernel.version, materialVersion = material.version;
  for (const [w, h, active] of [[768, 1024, [192, 256]], [512, 384, [128, 96]], [1001, 755, [250, 189]], [1024, 768, [256, 192]]] as const) {
    assert.equal(trace(w, h), kernel);
    assert.equal(quad.material, material);
    assert.deepEqual(size.value.toArray(), active);
    assert.deepEqual(kernel.dispatchSize, [Math.ceil(active[0] / 8), Math.ceil(active[1] / 8), 1]);
    assert.deepEqual(capacity.value.toArray(), [256, 256]);
  }
  assert.equal(disposals, 0);
  assert.equal(kernel.version, version);
  assert.equal(material.version, materialVersion);
});

test('cloud capacity growth retains texture bindings and graph identities', () => {
  const { quad, trace, kernel, material, textures, capacity } = setup();
  let disposals = 0;
  for (const n of textures) n.value.addEventListener('dispose', () => disposals++);
  assert.equal(trace(1600, 900), kernel);
  assert.equal(quad.material, material);
  assert.deepEqual(capacity.value.toArray(), [448, 448]);
  assert.equal(disposals, 2, 'only the two GPU texture allocations are invalidated on capacity growth');
  const after = graphNodes(expand(material.outputNode)).filter((n) => n.isTextureNode && n.value.isStorageTexture);
  assert.deepEqual(after.map((n) => n.value), textures.map((n) => n.value));
  for (const n of textures) assert.deepEqual(n.value.image, { width: 448, height: 448 });
  trace(900, 1600);
  trace(1024, 768);
  assert.equal(disposals, 2);
});

test('filtered cloud samples stay within freshly written texels after shrink, growth and rotation', () => {
  const { trace, uv, size, capacity } = setup();
  for (const [w, h] of [[511, 333], [1600, 900], [900, 1600], [3, 1], [1024, 768]]) {
    trace(w, h);
    for (const screen of [[0, 0], [1, 1], [0, 1], [1, 0], [0.5, 0.5], [0.001, 0.999]]) {
      const sampled = coordinate(uv, screen).map((v, i) => v * capacity.value.getComponent(i) - 0.5);
      for (let i = 0; i < 2; i++) {
        assert.ok(sampled[i] >= 0);
        assert.ok(sampled[i] <= size.value.getComponent(i) - 1);
      }
    }
    assert.deepEqual(coordinate(uv, [0, 0]), [0.5 / capacity.value.x, 0.5 / capacity.value.y]);
    assert.deepEqual(coordinate(uv, [1, 1]), [(size.value.x - 0.5) / capacity.value.x, (size.value.y - 0.5) / capacity.value.y]);
  }
});
