import * as THREE from 'three';
import { GameView } from '../render/GameView';
import { AudioEngine } from '../audio/AudioEngine';
import { Hud } from '../ui/Hud';
import { Menus } from '../ui/Menus';
import { Minimap } from '../ui/Minimap';
import { scoreTables } from '../ui/Scoreboard';
import { Match } from '../game/Match';
import { PlayerController } from '../player/PlayerController';
import { WeaponSystem } from '../weapons/WeaponSystem';
import { WEAPONS } from '../weapons/weapons';
import { MAPS } from '../maps';
import { store } from './Settings';
import type { Character } from '../entities/Character';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const _eye = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _back = new THREE.Vector3();

type State = 'menu' | 'playing' | 'paused' | 'result';

/** Top-level orchestrator: owns the view, audio, HUD and menus, and runs the frame loop. */
export class Game {
  readonly view: GameView;
  readonly audio = new AudioEngine();
  readonly hud = new Hud();
  readonly minimap = new Minimap($('minimap') as HTMLCanvasElement);
  readonly menus: Menus;
  private match: Match | null = null;
  private ctl: PlayerController | null = null;
  private state: State = 'menu';
  private last = performance.now();
  private deathBy = '';
  private spectate: Character | null = null;
  private maxStreak = 0;
  private sbT = 0;
  private sbOpen = false;

  constructor(private canvas: HTMLCanvasElement) {
    this.view = new GameView(canvas);
    this.menus = new Menus({
      onDeploy: () => this.deploy(),
      onResume: () => this.resume(),
      onQuit: () => this.quit(),
      onRematch: () => this.deploy(),
      onMapPreview: (id) => this.view.loadMap(id),
      onSettingsChanged: () => this.applySettings(),
      onClick: () => { this.audio.unlock(); this.audio.uiClick(); },
    });
    this.view.setQuality(store.settings.quality);
    this.view.loadMap(store.settings.map);
    this.audio.setVolume(store.settings.volume);
    this.menus.show('main');

    document.addEventListener('pointerlockchange', this.onLockChange);
    document.addEventListener('pointerlockerror', () => { if (this.state === 'playing') this.pause(); });
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Tab' && this.state === 'playing') { e.preventDefault(); this.setScoreboard(true); }
    });
    document.addEventListener('keyup', (e) => { if (e.code === 'Tab') this.setScoreboard(false); });
    window.addEventListener('blur', () => { if (this.state === 'playing') document.exitPointerLock(); });
    requestAnimationFrame(this.frame);
  }

  private applySettings() {
    const s = store.settings;
    this.audio.setVolume(s.volume);
    this.view.setQuality(s.quality);
  }

  private setScoreboard(v: boolean) {
    this.sbOpen = v;
    $('scoreboard').classList.toggle('hidden', !v);
    if (v && this.match) { $('sb-body').innerHTML = scoreTables(this.match); this.sbT = 0.25; }
  }

  // ------------------------------------------------------------------ match lifecycle
  private deploy() {
    this.audio.unlock();
    this.canvas.requestPointerLock();
    this.teardown();
    const s = store.settings;
    this.view.loadMap(s.map);
    const match = (this.match = new Match({ map: s.map, difficulty: s.difficulty, weapon: s.weapon }));
    this.view.attach(match);
    this.ctl = new PlayerController(match, this.canvas);
    this.minimap.setMap(match.data, MAPS[s.map].ambience);
    this.audio.setSurface(MAPS[s.map].ambience);
    this.audio.ambience(MAPS[s.map].ambience);
    this.audio.setAmbienceLevel(0.5);
    this.maxStreak = 0;
    this.spectate = null;
    this.deathBy = '';
    this.wire(match);
    this.view.viewModel.setWeapon(match.player.weapon);
    this.menus.hideAll();
    this.hud.show(true);
    this.hud.hint('GET READY');
    this.state = 'playing';
    // If the lock request is refused (e.g. user pressed Esc right away) the lock handler will pause the game.
    this.ctl.setActive(document.pointerLockElement === this.canvas);
  }

  private wire(m: Match) {
    const ev = m.events;
    const a = this.audio;
    const wpos = (c: Character) => c.isPlayer ? { x: null, z: null } : { x: c.pos.x, z: c.pos.z };
    ev.on('shot', ({ shooter, weapon }) => { const p = wpos(shooter); a.shot(weapon, p.x, p.z); });
    ev.on('dryFire', ({ c }) => { const p = wpos(c); a.dry(p.x, p.z); });
    ev.on('reloadStart', ({ c }) => { const p = wpos(c); a.reload(WEAPONS[c.weapon].reload, p.x, p.z); });
    ev.on('switched', ({ c }) => { const p = wpos(c); a.switchWeapon(p.x, p.z); });
    ev.on('step', ({ c }) => a.step(c.pos.x, c.pos.z, c.speed > 5));
    ev.on('impact', ({ pos, kind }) => { if (kind === 'world') a.impact(pos.x, pos.z); });
    ev.on('explosion', ({ pos }) => a.explosion(pos.x, pos.z));
    ev.on('hit', ({ attacker, victim, head, from }) => {
      if (attacker?.isPlayer) { this.hud.hitMarker(head, false); a.hitMarker(head, false); }
      if (victim.isPlayer) {
        const dx = from.x - victim.pos.x, dz = from.z - victim.pos.z;
        // angle of the attacker relative to where we look (0 = ahead)
        const ang = Math.atan2(-dx, -dz) - victim.yaw;
        this.hud.damageFrom(-ang);
        a.hurt();
      } else a.fleshHit(victim.pos.x, victim.pos.z);
    });
    ev.on('kill', ({ killer, victim, weapon, head }) => {
      this.hud.killEntry(killer, victim, weapon, head, 0);
      if (killer?.isPlayer && killer !== victim) { this.maxStreak = Math.max(this.maxStreak, killer.streak); this.hud.hitMarker(head, true); a.hitMarker(head, true); }
      if (victim.isPlayer) {
        const w = weapon === 'explosion' ? 'an explosion' : WEAPONS[weapon].name;
        this.deathBy = killer && killer !== victim ? `KILLED BY ${killer.name} • ${w}${head ? ' • HEADSHOT' : ''}` : 'YOU DIED';
        this.spectate = killer && killer !== victim && killer.alive ? killer : null;
        a.death();
      }
    });
    ev.on('countdown', ({ n }) => { this.hud.message(String(n), '#f0a030', 900); a.beep(false); });
    ev.on('matchStart', () => { this.hud.message('FIGHT!', '#ffffff', 1000); a.beep(true); this.hud.hint(''); });
    ev.on('respawn', ({ c }) => { if (c.isPlayer && m.state === 'playing') { this.view.viewModel.setWeapon(c.weapon); this.spectate = null; } });
    ev.on('matchEnd', ({ winner }) => this.finish(winner));
  }

  private finish(winner: 'blue' | 'red') {
    const m = this.match!;
    const p = m.player;
    const won = winner === 'blue';
    store.addStats({ matches: 1, wins: won ? 1 : 0, losses: won ? 0 : 1, kills: p.kills, deaths: p.deaths, headshots: p.headshots, bestStreak: this.maxStreak });
    this.state = 'result';
    this.ctl?.setActive(false);
    this.setScoreboard(false);
    if (document.pointerLockElement) document.exitPointerLock();
    this.audio.stinger(won);
    // short pause so the final kill is visible, then the result screen
    setTimeout(() => {
      if (this.state !== 'result' || this.match !== m) return;
      this.hud.show(false);
      const t = $('result-title');
      t.textContent = won ? 'VICTORY' : 'DEFEAT';
      t.className = 'result-title ' + (won ? 'win' : 'lose');
      $('result-score').innerHTML = `<span class="b">BLUE ${m.score.blue}</span> — <span class="r">${m.score.red} RED</span>`;
      $('result-table').innerHTML = scoreTables(m);
      const kd = p.deaths ? (p.kills / p.deaths).toFixed(2) : p.kills.toFixed(2);
      $('result-stats').textContent = `YOUR STATS  •  ${p.kills} KILLS  •  ${p.deaths} DEATHS  •  K/D ${kd}  •  ${p.headshots} HEADSHOTS  •  ${MAPS[m.opts.map].name.toUpperCase()}  •  ${m.opts.difficulty.toUpperCase()}`;
      this.menus.show('result');
    }, 1800);
  }

  private teardown() {
    this.ctl?.dispose();
    this.ctl = null;
    this.view.detach();
    this.match?.dispose();
    this.match = null;
    this.audio.stopAmbience();
  }

  private pause() {
    if (this.state !== 'playing' || !this.match || this.match.state === 'ended') return;
    this.state = 'paused';
    this.ctl?.setActive(false);
    this.setScoreboard(false);
    this.audio.setAmbienceLevel(0.2);
    this.menus.show('pause');
  }

  private resume() {
    this.audio.unlock();
    this.canvas.requestPointerLock();
  }

  private quit() {
    this.teardown();
    this.state = 'menu';
    this.hud.show(false);
    this.setScoreboard(false);
    if (document.pointerLockElement) document.exitPointerLock();
    this.view.loadMap(store.settings.map);
    this.menus.show('main');
  }

  private onLockChange = () => {
    const locked = document.pointerLockElement === this.canvas;
    if (locked) {
      if (this.state === 'paused' || this.state === 'playing') {
        this.state = 'playing';
        this.menus.hideAll();
        this.ctl?.setActive(true);
        this.audio.setAmbienceLevel(0.5);
      }
    } else if (this.state === 'playing') this.pause();
  };

  // ------------------------------------------------------------------ frame loop
  private frame = (t: number) => {
    requestAnimationFrame(this.frame);
    const dt = Math.min(0.05, (t - this.last) / 1000);
    this.last = t;
    const m = this.match;
    if (!m || this.state === 'menu') {
      this.view.renderMenu(dt);
      return;
    }
    const cam = this.view.camera;
    const p = m.player;
    if (this.state === 'playing') {
      this.ctl!.update(dt);
      m.update(Math.min(dt, 1 / 30));
    } else if (this.state === 'result') {
      // let the match breathe after it ends: effects keep animating, characters settle
      m.update(Math.min(dt, 1 / 30));
    }

    let adsT = 0, scoped = false, fov = store.settings.fov;
    if (p.alive) {
      this.ctl!.applyCamera(cam);
      adsT = this.ctl!.adsT;
      scoped = this.ctl!.scoped;
      fov = this.ctl!.fov();
      this.view.hideLocal = true;
    } else {
      this.view.hideLocal = false;
      this.chaseCamera(cam, m);
    }
    this.view.render(dt, adsT, scoped, fov);
    this.audio.setListener(cam.position, p.yaw);

    if (this.state === 'playing' || this.state === 'result') {
      const spread = Math.min(3, WeaponSystem.spreadDeg(p, adsT > 0.6) / 2.5);
      this.hud.update(m, dt, adsT, scoped, spread, this.spectate && this.spectate.alive ? this.spectate : null, this.deathBy);
      this.minimap.draw(m, dt);
      if (this.sbOpen) {
        this.sbT -= dt;
        if (this.sbT <= 0) { $('sb-body').innerHTML = scoreTables(m); this.sbT = 0.25; }
      }
    }
  };

  /** Third-person follow camera used while dead: orbit the killer, else a living teammate, else the corpse. */
  private chaseCamera(cam: THREE.PerspectiveCamera, m: Match) {
    let target = this.spectate && this.spectate.alive ? this.spectate : null;
    if (!target) target = m.chars.find((c) => c.team === 'blue' && c.alive && !c.isPlayer) ?? null;
    this.spectate = target;
    const base = target ?? m.player;
    base.eye(_eye);
    base.forward(_dir);
    if (!target) _dir.set(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), m.player.yaw);
    _back.copy(_eye).addScaledVector(_dir, -3.4);
    _back.y += 0.5;
    const d = _back.clone().sub(_eye);
    const len = d.length();
    d.normalize();
    const hit = m.physics.raycast(_eye.x, _eye.y, _eye.z, d.x, d.y, d.z, len);
    if (hit) _back.copy(_eye).addScaledVector(d, Math.max(0.3, hit.t - 0.25));
    cam.position.lerp(_back, 0.25);
    cam.lookAt(_eye);
  }
}
