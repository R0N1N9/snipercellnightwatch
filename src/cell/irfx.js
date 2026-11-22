// Sniper Cell — things only night vision / IR can see (render layer 1), and the ghosts of
// where SENTINEL last saw you.
//   strobes  blinking IR strobes on each operator's helmet and shoulders
//   lasers   IR aiming lasers from both operators' weapons
//   ghosts   white silhouettes at your last known position while they hunt you
import * as THREE from 'three';
import { glowTexture } from '../textures.js';
import { Avatar } from '../avatar.js';

export const IR_LAYER = 1;
let stroMat;
function strobeMat() {
  // Over-bright (HDR) white, so the flash blooms in the night-vision and IR pictures.
  if (!stroMat) stroMat = new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color(1.6, 1.6, 1.6), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true });
  return stroMat;
}

// A real IR strobe is a point of light you pick out from a long way off, so each strobe is drawn
// at least STROBE_MIN_PX tall on screen (scaled per camera, so the ISR picture-in-picture and the
// quad feed get it too), and at its real size up close.
const STROBE_MIN_PX = 9;
const _v4 = new THREE.Vector4(), _wp = new THREE.Vector3();
function strobeSize(renderer, scene, camera) {
  const base = this.userData.size;
  let s = base;
  if (camera.isPerspectiveCamera) {
    renderer.getCurrentViewport(_v4);
    const d = camera.position.distanceTo(this.getWorldPosition(_wp));
    const perPx = (2 * d * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / Math.max(1, _v4.w);
    s = Math.max(base, perPx * STROBE_MIN_PX);
  }
  // Cancel the parent's scale so the size above is the size on screen.
  const ps = this.parent ? this.parent.getWorldScale(_wp) : null;
  const k = ps ? 1 / Math.max(1e-4, ps.x) : 1;
  this.scale.setScalar(s * k);
  this.updateMatrixWorld();
}

// Strobes on an operator model: one on the helmet, one on each shoulder. They live on the IR
// layer, so only night vision (goggles, NV scope, the quad) and the ISR in IR mode see them.
export function addStrobes(av) {
  const list = [];
  const put = (parent, x, y, z, size) => {
    const sp = new THREE.Sprite(strobeMat());
    sp.position.set(x, y, z);
    sp.userData.size = size;
    sp.scale.setScalar(size);
    sp.onBeforeRender = strobeSize;
    sp.layers.set(IR_LAYER);
    sp.frustumCulled = false;
    parent.add(sp);
    list.push(sp);
  };
  if (av.head) put(av.head, 0, 0.2, 0.04, 0.3);
  if (av.spine) { put(av.spine, -0.2, 0.5, 0.06, 0.24); put(av.spine, 0.2, 0.5, 0.06, 0.24); }
  return list;
}
// About once a second, a short flash (the helmet a beat ahead of the shoulders, as two units would).
export function blinkStrobes(list, t, phase = 0) {
  list.forEach((s, i) => { s.visible = ((t + phase + (i ? 0.06 : 0)) * 1.1) % 1 < 0.12; });
}

// An IR laser: a thin bright line plus a dot where it lands.
// color / ir: a visible laser sight uses the same line on the normal layer, in red.
export class IRLaser {
  constructor(scene, color = '#ffffff', ir = true) {
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]);
    this.line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: ir ? 0.55 : 0.4, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.line.frustumCulled = false;
    this.dot = ir ? new THREE.Sprite(strobeMat()) : new THREE.Sprite(new THREE.SpriteMaterial({ color, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.dot.scale.setScalar(ir ? 0.18 : 0.07);
    if (ir) { this.line.layers.set(IR_LAYER); this.dot.layers.set(IR_LAYER); }
    scene.add(this.line, this.dot);
  }
  set(a, b, on = true) {
    this.line.visible = this.dot.visible = on;
    if (!on) return;
    const arr = this.line.geometry.attributes.position.array;
    arr[0] = a.x; arr[1] = a.y; arr[2] = a.z; arr[3] = b.x; arr[4] = b.y; arr[5] = b.z;
    this.line.geometry.attributes.position.needsUpdate = true;
    this.dot.position.copy(b);
  }
}

// A white, see-through silhouette of an operator (last known position).
let ghostMat;
export function ghostAvatar(look, scene) {
  if (!ghostMat) ghostMat = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 } },
    vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform float uT; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(max(0.0, 1.0 - abs(dot(normalize(vN), normalize(vV)))), 1.6); float p = 0.75 + 0.25 * sin(uT * 4.0); gl_FragColor = vec4(vec3(0.95, 0.97, 1.0) * (0.06 + f * 0.75) * p, 1.0); }',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const av = new Avatar('#ffffff', 31);
  av.setLook(look);
  av.root.traverse((o) => { if (o.isMesh) o.material = ghostMat; });
  av.setVisible(false);
  scene.add(av.root);
  return av;
}
export function tickGhosts(t) {
  if (ghostMat) ghostMat.uniforms.uT.value = t;
}
