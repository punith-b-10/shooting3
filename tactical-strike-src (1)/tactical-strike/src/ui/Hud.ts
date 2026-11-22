import type { Match } from '../game/Match';
import { WEAPONS, WEAPON_ORDER } from '../weapons/weapons';
import type { Character } from '../entities/Character';
import { TIME_LIMIT } from '../game/modes/TeamDeathmatch';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/** DOM-based HUD. Only touches the DOM when a value actually changed. */
export class Hud {
  private root = $('hud');
  private cache = new Map<string, string>();
  private killfeed = $('killfeed');
  private msgT = 0;
  private hitT = 0;
  private dmgT = 0;
  private slots = $('slots');
  private slotEls: HTMLElement[] = [];

  constructor() {
    for (const id of WEAPON_ORDER) {
      const d = document.createElement('div');
      d.innerHTML = `<b>${WEAPONS[id].key}</b>${WEAPONS[id].role.split(' ')[0].toUpperCase()}`;
      this.slots.appendChild(d);
      this.slotEls.push(d);
    }
  }

  private set(id: string, text: string) {
    if (this.cache.get(id) === text) return;
    this.cache.set(id, text);
    $(id).textContent = text;
  }
  private style(id: string, prop: 'width', v: string) {
    const k = `${id}:${prop}`;
    if (this.cache.get(k) === v) return;
    this.cache.set(k, v);
    $(id).style[prop] = v;
  }

  show(v: boolean) {
    this.root.classList.toggle('hidden', !v);
    if (v) { this.killfeed.innerHTML = ''; this.cache.clear(); }
  }

  message(text: string, color = '#fff', ms = 1200) {
    const el = $('center-msg');
    el.textContent = text;
    el.style.color = color;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    this.msgT = ms / 1000;
  }

  hint(text: string) {
    this.set('hint', text);
  }

  killEntry(killer: Character | null, victim: Character, weapon: string, head: boolean, playerId: number) {
    const el = document.createElement('div');
    el.className = 'kf' + (killer?.isPlayer || victim.isPlayer ? ' me' : '');
    const nm = (c: Character) => `<span class="${c.team === 'blue' ? 'b' : 'r'}">${c.name}</span>`;
    const w = weapon === 'explosion' ? 'EXPLOSION' : WEAPONS[weapon as keyof typeof WEAPONS].name.split(' ')[0];
    el.innerHTML = `${killer && killer !== victim ? nm(killer) : ''}<span class="w">${killer === victim || !killer ? 'ACCIDENT' : w}${head ? ' <span class="hs">✦ HEADSHOT</span>' : ''}</span>${nm(victim)}`;
    this.killfeed.appendChild(el);
    while (this.killfeed.children.length > 5) this.killfeed.firstChild!.remove();
    setTimeout(() => el.remove(), 6000);
    void playerId;
  }

  hitMarker(head: boolean, kill: boolean) {
    const el = $('hitmarker');
    el.className = 'on' + (kill ? ' kill' : head ? ' head' : '');
    this.hitT = 0.12;
  }

  damageFrom(angle: number) {
    const ind = $('dmg-ind').firstElementChild as HTMLElement;
    ind.style.transform = `rotate(${angle}rad)`;
    ind.style.transformOrigin = '90px 190px';
    ind.style.transition = 'none';
    ind.style.opacity = '1';
    void ind.offsetWidth;
    ind.style.transition = 'opacity .8s';
    ind.style.opacity = '0';
    const v = $('vignette');
    v.style.transition = 'none';
    v.style.opacity = '0.8';
    void v.offsetWidth;
    v.style.transition = 'opacity .7s';
    v.style.opacity = '0';
  }

  update(m: Match, dt: number, adsT: number, scoped: boolean, spread: number, spectating: Character | null, deathBy: string) {
    const p = m.player;
    const t = Math.min(m.time, TIME_LIMIT * 2);
    this.set('timer', `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`);
    this.set('sc-blue', String(m.score.blue));
    this.set('sc-red', String(m.score.red));
    const allies = m.chars.filter((c) => c.team === 'blue' && c.alive && c !== p).length;
    this.set('alive-blue', `TEAMMATES ${allies}`);
    this.set('alive-red', `ENEMIES ${m.aliveCount('red')}`);
    this.set('hp-num', String(Math.ceil(p.health)));
    this.style('hp-fill', 'width', `${Math.max(0, (p.health / p.maxHealth) * 100)}%`);
    $('hp-fill').classList.toggle('low', p.health < 30);
    this.set('ar-num', String(Math.ceil(p.armor)));
    this.style('ar-fill', 'width', `${Math.max(0, p.armor)}%`);
    const d = WEAPONS[p.weapon];
    this.set('weapon-name', d.name.toUpperCase());
    this.set('ammo-mag', String(p.ammo.mag));
    this.set('ammo-res', String(p.ammo.reserve));
    $('ammo').classList.toggle('low', p.ammo.mag <= Math.ceil(d.mag * 0.25));
    this.slotEls.forEach((el, i) => el.classList.toggle('cur', WEAPON_ORDER[i] === p.weapon));
    const rb = $('reload-bar');
    rb.classList.toggle('on', p.reloadLeft > 0);
    if (p.reloadLeft > 0) $('reload-fill').style.width = `${(1 - p.reloadLeft / d.reload) * 100}%`;

    // crosshair: gap widens with movement, bloom and hip spread
    const ch = $('crosshair');
    ch.classList.toggle('ads', adsT > 0.5);
    ch.classList.toggle('hide', scoped || !p.alive);
    ch.style.setProperty('--g', `${Math.round(5 + spread * 5)}px`);
    $('scope').classList.toggle('on', scoped && p.alive);

    if (this.hitT > 0) { this.hitT -= dt; if (this.hitT <= 0) $('hitmarker').className = ''; }
    if (this.msgT > 0) { this.msgT -= dt; if (this.msgT <= 0) $('center-msg').classList.remove('show'); }

    const dead = !p.alive && m.state !== 'ended';
    $('death-overlay').classList.toggle('on', dead);
    if (dead) {
      this.set('death-by', deathBy);
      const left = Math.max(0, p.respawnAt - m.time);
      this.set('respawn-in', `RESPAWN IN ${left.toFixed(1)}s${spectating ? ' — SPECTATING ' + spectating.name : ''}`);
    }
  }
}
