// Turntable preview of your operator for the loadout screens. One small renderer is shared
// and moved between containers; it only draws while its canvas is on screen.
import * as THREE from 'three';
import { Avatar } from './avatar.js';

let P = null;

function init() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.domElement.className = 'lo-canvas';
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(26, 1, 0.1, 30);
  scene.add(new THREE.HemisphereLight('#c9c2e8', '#3d3846', 1.5));
  const key = new THREE.DirectionalLight('#ffd6b8', 2.6);
  key.position.set(-3, 4, -3);
  scene.add(key);
  const rim = new THREE.DirectionalLight('#8fb4ff', 1.8);
  rim.position.set(3, 2, 4);
  scene.add(rim);
  const pad = new THREE.Mesh(new THREE.CircleGeometry(0.75, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#f2b35b', transparent: true, opacity: 0.1 }));
  scene.add(pad);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.73, 0.75, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#f2b35b', transparent: true, opacity: 0.55 }));
  ring.position.y = 0.002;
  scene.add(ring);
  const av = new Avatar('#e0a040', 7);
  scene.add(av.root);
  P = { renderer, scene, cam, av, yaw: 0.6, drag: null, look: null, raf: 0, last: 0, idle: 0 };
  const el = renderer.domElement;
  el.style.touchAction = 'none';
  el.addEventListener('pointerdown', (e) => { P.drag = e.clientX; P.idle = 0; el.setPointerCapture(e.pointerId); });
  el.addEventListener('pointermove', (e) => {
    if (P.drag === null) return;
    P.yaw += (e.clientX - P.drag) * 0.012;
    P.drag = e.clientX;
  });
  const up = () => { P.drag = null; };
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
}

function frame(t) {
  const el = P.renderer.domElement;
  if (!el.isConnected) { P.raf = 0; return; }
  if (!el.offsetParent) { P.raf = 0; P.last = 0; return; } // hidden: stop until shown again
  P.raf = requestAnimationFrame(frame);
  const dt = Math.min(0.05, (t - (P.last || t)) / 1000);
  P.last = t;
  const w = el.clientWidth, h = el.clientHeight;
  if (!w || !h) return;
  if (el.width !== Math.round(w * P.renderer.getPixelRatio()) || el.height !== Math.round(h * P.renderer.getPixelRatio())) {
    P.renderer.setSize(w, h, false);
    P.cam.aspect = w / h;
    P.cam.updateProjectionMatrix();
  }
  if (P.drag === null) {
    P.idle += dt;
    if (P.idle > 1.2) P.yaw += dt * 0.45;
  }
  P.av.update(dt, { p: new THREE.Vector3(0, 0, 0), yaw: 0, pitch: P.low ? -0.75 : 0, st: 0, moving: false, w: !!P.w, lowReady: !!P.low });
  P.av.root.rotation.y = P.yaw;
  // Fit ~2.1 m tall and ~1.7 m wide (the rifle swings round as it turns).
  const tv = Math.tan(THREE.MathUtils.degToRad(P.cam.fov / 2));
  const d = Math.max(1.08 / tv, 0.85 / (tv * P.cam.aspect)) + 0.4;
  P.cam.position.set(0, 1.25, -d);
  P.cam.lookAt(0, 0.92, 0);
  P.renderer.render(P.scene, P.cam);
}

// Put the preview inside `container`, showing `look` ({ outfit, poncho }); w: sidearm drawn.
export function showPreview(container, look, w = false, low = false) {
  try {
    if (!P) init();
  } catch {
    return; // no WebGL here: skip the preview
  }
  const el = P.renderer.domElement;
  if (el.parentNode !== container) container.appendChild(el);
  P.av.setLook(look);
  P.w = w;
  P.low = low;
  if (!P.raf) P.raf = requestAnimationFrame(frame);
}
