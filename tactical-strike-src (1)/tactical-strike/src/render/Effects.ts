import * as THREE from 'three';

const MAX_P = 700;
const MAX_TRACERS = 48;
const MAX_DECALS = 90;

const PVERT = /* glsl */ `
attribute vec4 aColor; attribute float aSize;
varying vec4 vColor;
uniform float uScale;
void main() {
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / max(0.1, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const PFRAG = /* glsl */ `
varying vec4 vColor;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  if (d > 1.0) discard;
  float a = vColor.a * (1.0 - d * d);
  gl_FragColor = vec4(vColor.rgb, a);
}`;

/** Pooled particles, tracers, bullet decals and explosions. Nothing allocates after construction. */
export class Effects {
  readonly group = new THREE.Group();
  private pos = new Float32Array(MAX_P * 3);
  private col = new Float32Array(MAX_P * 4);
  private size = new Float32Array(MAX_P);
  private vel = new Float32Array(MAX_P * 3);
  private life = new Float32Array(MAX_P);
  private maxLife = new Float32Array(MAX_P);
  private s0 = new Float32Array(MAX_P);
  private s1 = new Float32Array(MAX_P);
  private grav = new Float32Array(MAX_P);
  private drag = new Float32Array(MAX_P);
  private baseA = new Float32Array(MAX_P);
  private next = 0;
  private geo = new THREE.BufferGeometry();
  private pmat: THREE.ShaderMaterial;
  private points: THREE.Points;

  private tracerGeo = new THREE.BufferGeometry();
  private tracerPos = new Float32Array(MAX_TRACERS * 6);
  private tracerLife = new Float32Array(MAX_TRACERS);
  private tracerCol = new Float32Array(MAX_TRACERS * 6);
  private tn = 0;
  private tracers: THREE.LineSegments;

  private decals: THREE.InstancedMesh;
  private decalI = 0;

  private fire: THREE.Mesh;
  private fireT = 0;
  private fireR = 1;
  readonly flashLight = new THREE.PointLight(0xffb060, 0, 14, 2);
  private flashLightT = 0;
  onShake: (amount: number, pos: THREE.Vector3) => void = () => {};

  constructor() {
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.pmat = new THREE.ShaderMaterial({ vertexShader: PVERT, fragmentShader: PFRAG, transparent: true, depthWrite: false, uniforms: { uScale: { value: 600 } } });
    this.points = new THREE.Points(this.geo, this.pmat);
    this.points.frustumCulled = false;
    this.group.add(this.points);
    for (let i = 0; i < MAX_P; i++) this.pos[i * 3 + 1] = -999;

    this.tracerGeo.setAttribute('position', new THREE.BufferAttribute(this.tracerPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.tracerGeo.setAttribute('color', new THREE.BufferAttribute(this.tracerCol, 3).setUsage(THREE.DynamicDrawUsage));
    this.tracers = new THREE.LineSegments(this.tracerGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.tracers.frustumCulled = false;
    this.group.add(this.tracers);

    const dg = new THREE.CircleGeometry(0.07, 8);
    this.decals = new THREE.InstancedMesh(dg, new THREE.MeshBasicMaterial({ color: 0x0c0c0c, transparent: true, opacity: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }), MAX_DECALS);
    this.decals.frustumCulled = false;
    const z = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < MAX_DECALS; i++) this.decals.setMatrixAt(i, z);
    this.group.add(this.decals);

    this.fire = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), new THREE.MeshBasicMaterial({ color: 0xff9a3a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.fire.visible = false;
    this.group.add(this.fire);
    this.group.add(this.flashLight);
  }

  setViewport(heightPx: number, fovDeg: number) {
    this.pmat.uniforms.uScale.value = heightPx / (2 * Math.tan((fovDeg * Math.PI) / 360));
  }

  private emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, s0: number, s1: number, r: number, g: number, b: number, a: number, grav: number, drag: number) {
    const i = this.next;
    this.next = (this.next + 1) % MAX_P;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = this.maxLife[i] = life;
    this.s0[i] = s0; this.s1[i] = s1;
    this.col[i * 4] = r; this.col[i * 4 + 1] = g; this.col[i * 4 + 2] = b;
    this.baseA[i] = a;
    this.grav[i] = grav; this.drag[i] = drag;
  }

  impact(p: THREE.Vector3, n: THREE.Vector3, flesh: boolean) {
    if (flesh) {
      for (let i = 0; i < 7; i++) {
        this.emit(p.x, p.y, p.z, n.x * 2 + (Math.random() - 0.5) * 2.5, n.y * 2 + Math.random() * 1.5, n.z * 2 + (Math.random() - 0.5) * 2.5, 0.45 + Math.random() * 0.3, 0.1, 0.05, 0.6, 0.04, 0.04, 0.9, 7, 1.5);
      }
      return;
    }
    for (let i = 0; i < 5; i++) {
      this.emit(p.x, p.y, p.z, n.x * 4 + (Math.random() - 0.5) * 4, n.y * 4 + Math.random() * 3, n.z * 4 + (Math.random() - 0.5) * 4, 0.22 + Math.random() * 0.15, 0.06, 0.02, 1, 0.8, 0.4, 1, 9, 0.5);
    }
    for (let i = 0; i < 3; i++) {
      this.emit(p.x + n.x * 0.05, p.y + n.y * 0.05, p.z + n.z * 0.05, n.x * 0.8 + (Math.random() - 0.5) * 0.6, n.y * 0.8 + Math.random() * 0.5, n.z * 0.8 + (Math.random() - 0.5) * 0.6, 0.7 + Math.random() * 0.4, 0.18, 0.5, 0.62, 0.58, 0.5, 0.45, -0.2, 2.5);
    }
    // decal
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(p.x + n.x * 0.012, p.y + n.y * 0.012, p.z + n.z * 0.012), q, new THREE.Vector3(1, 1, 1));
    this.decals.setMatrixAt(this.decalI, m);
    this.decalI = (this.decalI + 1) % MAX_DECALS;
    this.decals.instanceMatrix.needsUpdate = true;
  }

  tracer(a: THREE.Vector3, b: THREE.Vector3) {
    const i = this.tn;
    this.tn = (this.tn + 1) % MAX_TRACERS;
    this.tracerPos.set([a.x, a.y, a.z, b.x, b.y, b.z], i * 6);
    this.tracerLife[i] = 0.07;
  }

  muzzleLight(p: THREE.Vector3) {
    this.flashLight.position.copy(p);
    this.flashLight.intensity = 14;
    this.flashLightT = 0.05;
  }

  explosion(p: THREE.Vector3, radius: number) {
    this.fireT = 0.5;
    this.fireR = radius * 0.55;
    this.fire.position.copy(p);
    this.fire.visible = true;
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * 6.28, up = Math.random() * 0.9, sp = 3 + Math.random() * 8;
      this.emit(p.x, p.y, p.z, Math.cos(a) * sp * (1 - up * 0.4), 2 + up * sp, Math.sin(a) * sp * (1 - up * 0.4), 0.5 + Math.random() * 0.5, 0.5, 0.2, 1, 0.55 + Math.random() * 0.3, 0.1, 1, 9, 1.2);
    }
    for (let i = 0; i < 28; i++) {
      const a = Math.random() * 6.28, sp = 1 + Math.random() * 4;
      this.emit(p.x, p.y, p.z, Math.cos(a) * sp, 1 + Math.random() * 4, Math.sin(a) * sp, 1.6 + Math.random() * 1.2, 1.2, 4.5, 0.13, 0.12, 0.12, 0.6, -0.6, 1.4);
    }
    this.flashLight.position.copy(p).add(new THREE.Vector3(0, 1.5, 0));
    this.flashLight.intensity = 90;
    this.flashLightT = 0.35;
    this.onShake(1, p);
  }

  update(dt: number) {
    for (let i = 0; i < MAX_P; i++) {
      if (this.life[i] <= 0) { if (this.pos[i * 3 + 1] > -900) this.pos[i * 3 + 1] = -999; continue; }
      this.life[i] -= dt;
      const k = Math.max(0, this.life[i] / this.maxLife[i]);
      const dr = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i * 3] *= dr; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * dr - this.grav[i] * dt; this.vel[i * 3 + 2] *= dr;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.pos[i * 3 + 1] < 0.02 && this.grav[i] > 0) { this.pos[i * 3 + 1] = 0.02; this.vel[i * 3 + 1] *= -0.2; }
      this.size[i] = this.s1[i] + (this.s0[i] - this.s1[i]) * k;
      this.col[i * 4 + 3] = this.baseA[i] * Math.min(1, k * 2.2);
    }
    (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.aColor as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;

    for (let i = 0; i < MAX_TRACERS; i++) {
      if (this.tracerLife[i] > 0) {
        this.tracerLife[i] -= dt;
        const f = Math.max(0, this.tracerLife[i] / 0.07);
        const c = 0.9 * f;
        for (let v = 0; v < 2; v++) { this.tracerCol[i * 6 + v * 3] = c; this.tracerCol[i * 6 + v * 3 + 1] = c * 0.8; this.tracerCol[i * 6 + v * 3 + 2] = c * 0.4; }
      } else for (let k = 0; k < 6; k++) this.tracerCol[i * 6 + k] = 0;
    }
    (this.tracerGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    (this.tracerGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;

    if (this.fireT > 0) {
      this.fireT -= dt;
      const k = 1 - this.fireT / 0.5;
      this.fire.scale.setScalar(this.fireR * (0.3 + k * 1.0));
      (this.fire.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.9 * (1 - k));
      if (this.fireT <= 0) this.fire.visible = false;
    }
    if (this.flashLightT > 0) {
      this.flashLightT -= dt;
      this.flashLight.intensity *= Math.max(0, 1 - dt * 9);
      if (this.flashLightT <= 0) this.flashLight.intensity = 0;
    }
  }

  dispose() {
    this.geo.dispose(); this.pmat.dispose(); this.tracerGeo.dispose(); (this.tracers.material as THREE.Material).dispose();
    this.decals.dispose(); (this.decals.material as THREE.Material).dispose(); this.decals.geometry.dispose();
    this.fire.geometry.dispose(); (this.fire.material as THREE.Material).dispose();
  }
}
