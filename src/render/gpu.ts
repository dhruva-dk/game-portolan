import {
  AddEquation,
  BufferAttribute,
  ClampToEdgeWrapping,
  CustomBlending,
  HalfFloatType,
  LinearFilter,
  OneFactor,
  OneMinusSrcAlphaFactor,
  StorageTexture,
  type BufferGeometry,
  type Camera,
  type ComputeNode,
  type MagnificationTextureFilter,
  type Material,
  type MinificationTextureFilter,
  type RenderTarget,
  type Scene,
  type Wrapping,
} from 'three/webgpu';

export type Compute = ComputeNode | ComputeNode[];

interface TableReads {
  filter?: MagnificationTextureFilter;
  min?: MinificationTextureFilter;
  wrap?: Wrapping;
  mipmaps?: boolean;
  anisotropy?: number;
}

export function storageTable(
  width: number,
  height: number,
  reads: TableReads = {}
): StorageTexture {
  const {
    filter = LinearFilter,
    min = filter,
    wrap = ClampToEdgeWrapping,
    mipmaps = false,
    anisotropy,
  } = reads;
  const t = new StorageTexture(width, height);
  t.type = HalfFloatType;
  t.magFilter = filter;
  t.minFilter = min;
  t.wrapS = t.wrapT = wrap;
  t.generateMipmaps = mipmaps;
  if (anisotropy !== undefined) t.anisotropy = anisotropy;
  return t;
}

export function additive<M extends Material>(m: M): M {
  m.blending = CustomBlending;
  m.blendEquation = AddEquation;
  m.blendSrc = m.blendDst = OneFactor;
  return m;
}

export function premultiplied<M extends Material>(m: M): M {
  m.blending = CustomBlending;
  m.blendEquation = AddEquation;
  m.blendSrc = OneFactor;
  m.blendDst = OneMinusSrcAlphaFactor;
  return m;
}

export function quad<G extends BufferGeometry>(g: G, bottom = -1): G {
  g.setAttribute(
    'position',
    new BufferAttribute(
      new Float32Array([-1, bottom, 0, 1, bottom, 0, 1, 1, 0, -1, 1, 0]),
      3
    )
  );
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}

export interface Draw {
  scene: Scene;
  camera: Camera;
  target: RenderTarget;
  clear?: { color: number; alpha: number };
}
