// The lighting/camera rig both 3D views use: neutral studio lighting, a soft
// contact-shadow disc and damped orbit controls. Extracted from QuoteClient so
// the setup isn't 80 lines of boilerplate inside a component.

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export interface Studio {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  /** Stops the render loop, disconnects the observer and frees GPU resources. */
  dispose: () => void;
}

/**
 * Builds the scene, starts the render loop and keeps the canvas sized to
 * `wrap`. Returns null when either element isn't mounted yet.
 */
export function createStudio(
  canvas: HTMLCanvasElement | null,
  wrap: HTMLElement | null
): Studio | null {
  if (!canvas || !wrap) return null;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(wrap.clientWidth, wrap.clientHeight, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  const scene = new THREE.Scene();
  scene.background = null;

  const camera = new THREE.PerspectiveCamera(
    40,
    wrap.clientWidth / wrap.clientHeight,
    0.1,
    5000
  );
  camera.position.set(80, 60, 80);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x555566, 0.85);
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(60, 90, 50);
  const fill = new THREE.DirectionalLight(0xffffff, 0.75);
  fill.position.set(-60, 30, -40);
  const rim = new THREE.DirectionalLight(0xffffff, 0.6);
  rim.position.set(0, -20, -80);
  const ambient = new THREE.AmbientLight(0xffffff, 0.18);
  scene.add(hemi, key, fill, rim, ambient);

  const groundMat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.08
  });
  const ground = new THREE.Mesh(new THREE.CircleGeometry(120, 64), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.01;
  ground.name = 'ground';
  scene.add(ground);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 5;
  controls.maxDistance = 800;

  let raf = 0;
  const tick = () => {
    raf = requestAnimationFrame(tick);
    controls.update();
    renderer.render(scene, camera);
  };
  tick();

  const ro = new ResizeObserver(() => {
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    if (w === 0 || h === 0) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  });
  ro.observe(wrap);

  return {
    renderer,
    scene,
    camera,
    controls,
    dispose: () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      groundMat.dispose();
      ground.geometry.dispose();
      renderer.dispose();
    }
  };
}
