import { WebGPURenderer, Scene, PerspectiveCamera, Color } from 'three/webgpu';

const fps = document.getElementById('fps')!;

if (!navigator.gpu) {
  fps.textContent = 'no WebGPU';
  throw new Error('WebGPU unavailable');
}

const renderer = new WebGPURenderer({ antialias: false });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
await renderer.init();

const scene = new Scene();
scene.background = new Color(0x1d4f73);
const camera = new PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 1000);

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

let frames = 0;
let last = performance.now();
renderer.setAnimationLoop(() => {
  renderer.render(scene, camera);
  frames++;
  const now = performance.now();
  if (now - last >= 1000) {
    fps.textContent = String(Math.round((frames * 1000) / (now - last)));
    frames = 0;
    last = now;
  }
});
