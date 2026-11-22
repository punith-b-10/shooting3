import * as THREE from 'three';
import type { MapData, MapDef } from '../maps/MapData';
import { getMaterial } from './Materials';
import { BARREL_HEIGHT, BARREL_RADIUS } from '../maps/MapPhysics';
import { Sky } from './Sky';
import type { BarrelState } from '../game/Combat';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

/** Everything visible about a map: instanced geometry, decor, barrels, sky, lights and dust. Owns and disposes its GPU resources. */
export class MapView {
  readonly group = new THREE.Group();
  readonly sky: Sky;
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  readonly fog: THREE.FogExp2;
  private barrelMesh: THREE.InstancedMesh | null = null;
  private barrelBand: THREE.InstancedMesh | null = null;
  private dust: THREE.Points | null = null;
  private dustSeed: Float32Array | null = null;
  private disposables: { dispose(): void }[] = [];
  private sunOffset: THREE.Vector3;
  private time = 0;

  constructor(readonly def: MapDef, readonly data: MapData, aniso: number) {
    const s = def.sky;
    this.fog = new THREE.FogExp2(s.fogColor, s.fogDensity);
    this.sky = new Sky(s);
    this.group.add(this.sky.mesh);

    this.hemi = new THREE.HemisphereLight(s.hemiSky, s.hemiGround, s.hemiIntensity);
    this.group.add(this.hemi);
    this.sun = new THREE.DirectionalLight(s.sunColor, s.sunIntensity);
    this.sunOffset = new THREE.Vector3(...s.sunDir).normalize().multiplyScalar(90);
    this.sun.position.copy(this.sunOffset);
    this.group.add(this.sun, this.sun.target);

    this.buildBoxes(aniso);
    this.buildDecor();
    this.buildBarrels();
    if (def.dust) this.buildDust(def.dust.color, def.dust.count);
  }

  private buildBoxes(aniso: number) {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    this.disposables.push(geo);
    const groups = new Map<string, typeof this.data.boxes>();
    for (const b of this.data.boxes) {
      const k = `${b.mat}|${b.cast ? 1 : 0}`;
      let a = groups.get(k);
      if (!a) groups.set(k, (a = []));
      a.push(b);
    }
    for (const [k, list] of groups) {
      const [mat, cast] = k.split('|');
      const mesh = new THREE.InstancedMesh(geo, getMaterial(mat as never, aniso), list.length);
      list.forEach((b, i) => {
        _p.set(b.x, b.y, b.z);
        if (b.rot) { _e.set(b.rot[0], b.rot[1], b.rot[2], 'XYZ'); _q.setFromEuler(_e); } else _q.identity();
        _s.set(b.w, b.h, b.d);
        mesh.setMatrixAt(i, _m.compose(_p, _q, _s));
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = cast === '1';
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.computeBoundingSphere();
      this.group.add(mesh);
      this.disposables.push(mesh);
    }
  }

  private buildDecor() {
    const d = this.data.decor;
    if (!d.length) return;
    const by = (kind: string) => d.filter((x) => x.kind === kind);
    const make = (geo: THREE.BufferGeometry, mat: THREE.Material, list: typeof d, place: (x: (typeof d)[number], m: THREE.Matrix4) => void, cast = true) => {
      if (!list.length) return;
      const mesh = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((x, i) => { place(x, _m); mesh.setMatrixAt(i, _m); });
      mesh.castShadow = cast;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.computeBoundingSphere();
      this.group.add(mesh);
      this.disposables.push(mesh, geo);
    };
    const put = (x: (typeof d)[number], m: THREE.Matrix4, dy: number, sx: number, sy: number, sz: number, rx = 0) => {
      _p.set(x.x, x.y + dy * x.s, x.z);
      _q.setFromEuler(_e.set(rx, x.ry, 0));
      _s.set(sx * x.s, sy * x.s, sz * x.s);
      return m.compose(_p, _q, _s);
    };
    const pines = by('pine');
    make(new THREE.CylinderGeometry(0.2, 0.3, 3, 7), getMaterial('bark'), pines, (x, m) => put(x, m, 1.5, 1, 1, 1));
    const cone = (r: number, h: number) => new THREE.ConeGeometry(r, h, 8);
    make(cone(1.9, 2.6), getMaterial('foliageDark'), pines, (x, m) => put(x, m, 2.4, 1, 1, 1));
    make(cone(1.5, 2.3), getMaterial('foliage'), pines, (x, m) => put(x, m, 3.7, 1, 1, 1));
    make(cone(1.0, 2.0), getMaterial('foliageDark'), pines, (x, m) => put(x, m, 5.0, 1, 1, 1));
    const palms = by('palm');
    make(new THREE.CylinderGeometry(0.18, 0.28, 5, 6), getMaterial('woodPlank'), palms, (x, m) => put(x, m, 2.5, 1, 1, 1));
    make(new THREE.ConeGeometry(2.0, 0.8, 7), getMaterial('foliage'), palms, (x, m) => put(x, m, 5.1, 1, 1, 1));
    const rocks = by('rock');
    const rg = new THREE.IcosahedronGeometry(1, 1);
    const pos = rg.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const k = 0.85 + 0.3 * Math.abs(Math.sin(pos.getX(i) * 7.1 + pos.getY(i) * 3.3 + pos.getZ(i) * 5.7));
      pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k, pos.getZ(i) * k);
    }
    rg.computeVertexNormals();
    make(rg, getMaterial('rock'), rocks, (x, m) => put(x, m, 0.7, 0.95, 0.7, 0.95));
    const bushes = by('bush');
    make(new THREE.IcosahedronGeometry(0.8, 1), getMaterial('foliage'), bushes, (x, m) => put(x, m, 0.5, 1, 0.75, 1), false);
  }

  private buildBarrels() {
    const bs = this.data.barrels;
    if (!bs.length) return;
    const geo = new THREE.CylinderGeometry(BARREL_RADIUS, BARREL_RADIUS, BARREL_HEIGHT, 12);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.5 });
    this.barrelMesh = new THREE.InstancedMesh(geo, mat, bs.length);
    const colors = ['#3c5f8a', '#4a6b4a', '#7a7d82', '#8a6a3a'];
    const c = new THREE.Color();
    bs.forEach((b, i) => {
      this.barrelMesh!.setMatrixAt(i, _m.makeTranslation(b.x, b.y + BARREL_HEIGHT / 2, b.z));
      this.barrelMesh!.setColorAt(i, c.set(b.explosive ? '#b3261e' : colors[i % colors.length]));
    });
    this.barrelMesh.castShadow = true;
    this.barrelMesh.receiveShadow = true;
    this.group.add(this.barrelMesh);
    // Yellow warning band on explosive barrels
    const ex = bs.filter((b) => b.explosive);
    if (ex.length) {
      const bg = new THREE.CylinderGeometry(BARREL_RADIUS + 0.01, BARREL_RADIUS + 0.01, 0.16, 12);
      this.barrelBand = new THREE.InstancedMesh(bg, new THREE.MeshStandardMaterial({ color: '#e8c020', roughness: 0.6 }), ex.length);
      ex.forEach((b, i) => this.barrelBand!.setMatrixAt(i, _m.makeTranslation(b.x, b.y + BARREL_HEIGHT * 0.55, b.z)));
      this.group.add(this.barrelBand);
      this.disposables.push(bg, this.barrelBand.material as THREE.Material, this.barrelBand);
    }
    this.disposables.push(geo, mat, this.barrelMesh);
  }

  /** Hide barrels that have exploded. */
  syncBarrels(states: BarrelState[]) {
    if (!this.barrelMesh) return;
    let changed = false;
    states.forEach((s, i) => {
      if (!s.alive) {
        this.barrelMesh!.getMatrixAt(i, _m);
        if (_m.elements[0] !== 0) { this.barrelMesh!.setMatrixAt(i, _m.makeScale(0, 0, 0)); changed = true; }
      }
    });
    if (changed) {
      this.barrelMesh.instanceMatrix.needsUpdate = true;
      this.barrelMesh.instanceColor!.needsUpdate = true;
    }
    if (this.barrelBand) {
      // Explosive subset follows the same order as the explosive entries
      let k = 0;
      let ch = false;
      states.forEach((s) => {
        if (!s.explosive) return;
        if (!s.alive) { this.barrelBand!.setMatrixAt(k, _m.makeScale(0, 0, 0)); ch = true; }
        k++;
      });
      if (ch) this.barrelBand.instanceMatrix.needsUpdate = true;
    }
  }

  private buildDust(color: number, count: number) {
    const g = new THREE.BufferGeometry();
    const arr = new Float32Array(count * 3);
    this.dustSeed = new Float32Array(count * 3);
    for (let i = 0; i < count * 3; i++) this.dustSeed[i] = Math.random();
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const mat = new THREE.PointsMaterial({ color, size: 0.09, transparent: true, opacity: 0.55, depthWrite: false, sizeAttenuation: true, fog: false });
    this.dust = new THREE.Points(g, mat);
    this.dust.frustumCulled = false;
    this.group.add(this.dust);
    this.disposables.push(g, mat);
  }

  /** Per-frame: move the sky with the camera, keep the sun's shadow box on the player, drift dust around the camera. */
  update(dt: number, cam: THREE.Vector3, shadowSnap: boolean) {
    this.time += dt;
    this.sky.update(cam, this.time);
    const sx = shadowSnap ? Math.round(cam.x / 2) * 2 : cam.x;
    const sz = shadowSnap ? Math.round(cam.z / 2) * 2 : cam.z;
    this.sun.target.position.set(sx, 0, sz);
    this.sun.position.set(sx + this.sunOffset.x, this.sunOffset.y, sz + this.sunOffset.z);
    this.sun.target.updateMatrixWorld();
    if (this.dust && this.dustSeed) {
      const pos = this.dust.geometry.attributes.position as THREE.BufferAttribute;
      const R = 22;
      for (let i = 0; i < pos.count; i++) {
        const sd = this.dustSeed;
        const t = this.time;
        pos.setXYZ(
          i,
          cam.x + ((((sd[i * 3] * 2 * R + t * (0.6 + sd[i * 3 + 2])) % (2 * R)) + 2 * R) % (2 * R)) - R,
          cam.y - 3 + ((sd[i * 3 + 1] * 9 + Math.sin(t * 0.5 + i) * 0.4) % 9),
          cam.z + ((((sd[i * 3 + 2] * 2 * R + t * 0.25) % (2 * R)) + 2 * R) % (2 * R)) - R,
        );
      }
      pos.needsUpdate = true;
    }
  }

  setShadows(on: boolean, mapSize: number) {
    this.sun.castShadow = on;
    if (on) {
      const cam = this.sun.shadow.camera;
      const r = 48;
      cam.left = -r; cam.right = r; cam.top = r; cam.bottom = -r; cam.near = 10; cam.far = 220;
      cam.updateProjectionMatrix();
      this.sun.shadow.mapSize.set(mapSize, mapSize);
      this.sun.shadow.bias = -0.0004;
      this.sun.shadow.normalBias = 0.04;
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
  }

  dispose() {
    this.sky.dispose();
    this.sun.shadow.map?.dispose();
    for (const d of this.disposables) d.dispose();
    this.disposables.length = 0;
    this.group.clear();
  }
}
