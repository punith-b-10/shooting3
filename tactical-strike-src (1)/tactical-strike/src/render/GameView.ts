import * as THREE from 'three';
import type { MapId, Quality } from '../core/types';
import { MAPS, buildMapData } from '../maps';
import { MapView } from './MapView';
import { CharacterModel } from './CharacterModel';
import { Effects } from './Effects';
import { ViewModel } from './ViewModel';
import type { Match } from '../game/Match';
import type { Character } from '../entities/Character';
import { disposeMaterials } from './Materials';

const _v = new THREE.Vector3();

const QUALITY = {
  low: { pr: 0.7, shadows: false, map: 0, aniso: 1, modelShadows: false },
  medium: { pr: 1, shadows: true, map: 1024, aniso: 4, modelShadows: true },
  high: { pr: 1.5, shadows: true, map: 2048, aniso: 8, modelShadows: true },
};

/** Owns the WebGL renderer and everything drawn: map, characters, effects, first-person weapon. */
export class GameView {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(78, 1, 0.05, 600);
  readonly viewModel = new ViewModel();
  readonly effects = new Effects();
  private map: MapView | null = null;
  private mapId: MapId | null = null;
  private models = new Map<number, CharacterModel>();
  private match: Match | null = null;
  private unsub: (() => void)[] = [];
  private quality: Quality = 'medium';
  private orbit = 0;
  private shake = 0;
  private shakeOff = new THREE.Vector3();
  hideLocal = true;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.autoClear = false;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scene.add(this.effects.group);
    this.effects.onShake = (a, p) => {
      const d = p.distanceTo(this.camera.position);
      this.shake = Math.max(this.shake, a * Math.max(0, 1 - d / 40));
    };
    this.resize();
    window.addEventListener('resize', this.resize);
  }

  private resize = () => {
    const q = QUALITY[this.quality];
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, q.pr));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  };

  setQuality(q: Quality) {
    this.quality = q;
    this.resize();
    this.map?.setShadows(QUALITY[q].shadows, QUALITY[q].map);
    for (const m of this.models.values()) m.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = QUALITY[q].modelShadows && !(o as THREE.Mesh).userData.noShadow; });
  }

  get currentMap() {
    return this.mapId;
  }

  loadMap(id: MapId) {
    if (this.mapId === id && this.map) return;
    if (this.map) {
      this.scene.remove(this.map.group);
      this.map.dispose();
      disposeMaterials();
    }
    const def = MAPS[id];
    this.map = new MapView(def, buildMapData(id), QUALITY[this.quality].aniso);
    this.mapId = id;
    this.scene.add(this.map.group);
    this.scene.fog = this.map.fog;
    this.scene.background = null;
    this.renderer.toneMappingExposure = def.sky.exposure;
    this.map.setShadows(QUALITY[this.quality].shadows, QUALITY[this.quality].map);
  }

  attach(match: Match) {
    this.detach();
    this.match = match;
    for (const c of match.chars) {
      const mdl = new CharacterModel(c, c.team === 'blue');
      this.models.set(c.id, mdl);
      this.scene.add(mdl.root);
    }
    this.setQuality(this.quality);
    const ev = match.events;
    this.unsub.push(
      ev.on('shot', ({ shooter, muzzle }) => {
        if (shooter.isPlayer) {
          this.viewModel.onShot();
          this.effects.muzzleLight(muzzle);
        } else {
          const mdl = this.models.get(shooter.id);
          mdl?.fireFlash();
        }
      }),
      ev.on('tracer', ({ from, to, shooter }) => {
        if (shooter.isPlayer) {
          this.viewModel.muzzleWorld(_v);
          this.camera.updateMatrixWorld();
          _v.applyMatrix4(this.camera.matrixWorld);
          this.effects.tracer(_v.clone(), to);
        } else {
          this.models.get(shooter.id)?.muzzleWorld(_v);
          this.effects.tracer(_v.clone(), to);
        }
        void from;
      }),
      ev.on('impact', ({ pos, normal, kind }) => this.effects.impact(pos, normal, kind === 'flesh')),
      ev.on('explosion', ({ pos, radius }) => this.effects.explosion(pos, radius)),
      ev.on('reloadStart', ({ c }) => { if (c.isPlayer) this.viewModel.onReload(match.player.reloadLeft); }),
      ev.on('switched', ({ c }) => { if (c.isPlayer) this.viewModel.onSwitch(c.weapon); }),
    );
    this.viewModel.setWeapon(match.player.weapon);
  }

  detach() {
    this.unsub.forEach((u) => u());
    this.unsub = [];
    for (const m of this.models.values()) m.dispose();
    this.models.clear();
    this.match = null;
  }

  private shakeCam(dt: number) {
    this.shake = Math.max(0, this.shake - dt * 2.5);
    if (this.shake > 0.001) this.shakeOff.set((Math.random() - 0.5) * this.shake * 0.12, (Math.random() - 0.5) * this.shake * 0.12, 0);
    else this.shakeOff.set(0, 0, 0);
  }

  /** In-game frame. The caller has already positioned `camera`. */
  render(dt: number, adsT: number, scoped: boolean, fov: number) {
    const m = this.match!;
    this.shakeCam(dt);
    this.camera.position.add(this.shakeOff);
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
    for (const c of m.chars) {
      const mdl = this.models.get(c.id)!;
      mdl.update(dt);
      mdl.setVisible(!(c.isPlayer && this.hideLocal));
    }
    this.map!.syncBarrels(m.combat.barrels);
    this.map!.update(dt, this.camera.position, true);
    this.effects.setViewport(this.renderer.domElement.height, fov);
    this.effects.update(dt);
    this.viewModel.update(dt, m.player, adsT, m.player.weapon === 'sniper', this.camera, { aspect: this.camera.aspect, fov: 58 });
    this.draw(true);
  }

  /** Slow flyover behind the menus. */
  renderMenu(dt: number) {
    if (!this.map) return;
    this.orbit += dt * 0.06;
    const h = this.map.data.half;
    const r = h * 0.55;
    this.camera.position.set(Math.cos(this.orbit) * r, 9 + Math.sin(this.orbit * 0.7) * 2, Math.sin(this.orbit) * r);
    this.camera.lookAt(Math.cos(this.orbit + 0.9) * r * 0.25, 2.5, Math.sin(this.orbit + 0.9) * r * 0.25);
    this.camera.fov = 62;
    this.camera.updateProjectionMatrix();
    this.map.update(dt, this.camera.position, false);
    this.effects.update(dt);
    this.draw(false);
  }

  private draw(withViewModel: boolean) {
    const r = this.renderer;
    r.clear();
    r.render(this.scene, this.camera);
    if (withViewModel && this.viewModel.visible) {
      r.clearDepth();
      r.render(this.viewModel.scene, this.viewModel.camera);
    }
  }

  dispose() {
    window.removeEventListener('resize', this.resize);
    this.detach();
    this.effects.dispose();
    this.map?.dispose();
    this.renderer.dispose();
  }

  characterModel(c: Character) {
    return this.models.get(c.id);
  }
}
