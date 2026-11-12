// The textures in public/tex (Ambient CG, Poly Haven), loaded the one way every material uses them: tiling, and
// filtered steeply for the grazing views of sand, rock and deck.

import { NoColorSpace, RepeatWrapping, SRGBColorSpace, TextureLoader } from 'three/webgpu';

const loader = new TextureLoader();

/** public/tex/<file>: colour if it holds sRGB colour (else data: normals, roughness, a mask), anisotropy its filtering's. */
export function loadTexture(file: string, colour: boolean, anisotropy = 8) {
  const t = loader.load(`${import.meta.env.BASE_URL}tex/${file}`);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.anisotropy = anisotropy;
  t.colorSpace = colour ? SRGBColorSpace : NoColorSpace;
  return t;
}
