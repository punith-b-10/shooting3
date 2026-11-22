import { MAPS, MAP_ORDER, buildMapData } from '../maps';
import { WEAPONS, WEAPON_ORDER } from '../weapons/weapons';
import { store } from '../core/Settings';
import type { Difficulty, MapId, Quality, WeaponId } from '../core/types';
import { renderMapImage } from './Minimap';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
export type ScreenId = 'main' | 'controls' | 'play' | 'settings' | 'pause' | 'result';

const DIFFS: { id: Difficulty; name: string; desc: string; level: number }[] = [
  { id: 'easy', name: 'EASY', desc: 'Slow reactions, sloppy aim. Learn the maps.', level: 1 },
  { id: 'normal', name: 'NORMAL', desc: 'Competent enemies who use cover.', level: 2 },
  { id: 'hard', name: 'HARD', desc: 'Fast reactions, accurate fire, flanks and coordination. Recommended.', level: 3 },
  { id: 'extreme', name: 'EXTREME', desc: 'Near-perfect aim and tight teamwork. Brutal but fair — no wallhacks.', level: 4 },
];

export interface MenuHandlers {
  onDeploy(): void;
  onResume(): void;
  onQuit(): void;
  onRematch(): void;
  onMapPreview(id: MapId): void;
  onSettingsChanged(): void;
  onClick(): void;
}

/** Screen routing and all menu logic (main, play wizard, settings, pause, result). */
export class Menus {
  private current: ScreenId | null = null;
  private returnTo: ScreenId = 'main';
  private step = 0;
  private ids: ScreenId[] = ['main', 'controls', 'play', 'settings', 'pause', 'result'];

  constructor(private h: MenuHandlers) {
    document.querySelectorAll<HTMLElement>('[data-act]').forEach((b) =>
      b.addEventListener('click', () => {
        h.onClick();
        this.act(b.dataset.act!);
      }),
    );
    document.querySelectorAll<HTMLElement>('#stepper button').forEach((b) =>
      b.addEventListener('click', () => { h.onClick(); this.setStep(Number(b.dataset.step)); }),
    );
    this.buildMaps();
    this.buildDiffs();
    this.buildWeapons();
    this.bindSettings();
    this.refreshStats();
  }

  hideAll() {
    for (const id of this.ids) $('screen-' + id).classList.add('hidden');
    this.current = null;
  }

  show(id: ScreenId) {
    for (const s of this.ids) $('screen-' + s).classList.toggle('hidden', s !== id);
    this.current = id;
    if (id === 'main') this.refreshStats();
    if (id === 'settings') this.syncSettings();
    if (id === 'play') this.setStep(0);
  }
  get screen() {
    return this.current;
  }

  private act(a: string) {
    switch (a) {
      case 'play': this.show('play'); break;
      case 'settings': this.returnTo = (this.current === 'pause' ? 'pause' : 'main'); this.show('settings'); break;
      case 'controls': this.returnTo = (this.current === 'pause' ? 'pause' : 'main'); this.show('controls'); break;
      case 'back': this.show(this.returnTo); break;
      case 'reset-stats': if (confirm('Reset all saved statistics?')) { store.resetStats(); this.refreshStats(); } break;
      case 'play-back': this.step === 0 ? this.show('main') : this.setStep(this.step - 1); break;
      case 'play-next': this.step < 2 ? this.setStep(this.step + 1) : this.h.onDeploy(); break;
      case 'resume': this.h.onResume(); break;
      case 'quit': this.h.onQuit(); break;
      case 'rematch': this.h.onRematch(); break;
      case 'change-map': this.show('play'); break;
    }
  }

  private setStep(n: number) {
    this.step = n;
    document.querySelectorAll<HTMLElement>('#stepper button').forEach((b) => b.classList.toggle('active', Number(b.dataset.step) === n));
    for (let i = 0; i < 3; i++) $('step-' + i).classList.toggle('hidden', i !== n);
    $('btn-next').textContent = n === 2 ? 'DEPLOY ▶' : 'NEXT';
    $('btn-back').textContent = n === 0 ? 'MAIN MENU' : 'BACK';
    this.updateSummary();
  }

  private updateSummary() {
    const s = store.settings;
    $('summary').textContent = `${MAPS[s.map].name.toUpperCase()}  •  ${s.difficulty.toUpperCase()}  •  ${WEAPONS[s.weapon].name.toUpperCase()}`;
  }

  private buildMaps() {
    const host = $('map-cards');
    host.innerHTML = '';
    for (const id of MAP_ORDER) {
      const def = MAPS[id];
      const card = document.createElement('button');
      card.className = 'card';
      card.dataset.id = id;
      const cv = renderMapImage(buildMapData(id), def.ambience, 320);
      cv.style.aspectRatio = '1';
      card.append(cv);
      card.insertAdjacentHTML('beforeend', `<h3>${def.name.toUpperCase()}</h3><p class="tagline">${def.tagline}</p><p>${def.description}</p><div class="note">${def.difficultyNote}</div>`);
      card.addEventListener('click', () => {
        this.h.onClick();
        store.update({ map: id });
        this.markSel(host, id);
        this.updateSummary();
        this.h.onMapPreview(id);
      });
      host.appendChild(card);
    }
    this.markSel(host, store.settings.map);
  }

  private buildDiffs() {
    const host = $('diff-cards');
    host.innerHTML = '';
    for (const d of DIFFS) {
      const card = document.createElement('button');
      card.className = 'card';
      card.dataset.id = d.id;
      const meter = Array.from({ length: 4 }, (_, i) => `<i class="${i < d.level ? 'on' : ''}"></i>`).join('');
      card.innerHTML = `${d.id === 'hard' ? '<span class="badge">DEFAULT</span>' : ''}<h3>${d.name}</h3><div class="diff-meter">${meter}</div><p>${d.desc}</p>`;
      card.addEventListener('click', () => { this.h.onClick(); store.update({ difficulty: d.id }); this.markSel(host, d.id); this.updateSummary(); });
      host.appendChild(card);
    }
    this.markSel(host, store.settings.difficulty);
  }

  private buildWeapons() {
    const host = $('weapon-cards');
    host.innerHTML = '';
    const mx = {
      dmg: Math.max(...WEAPON_ORDER.map((w) => WEAPONS[w].damage * WEAPONS[w].pellets)),
      rpm: Math.max(...WEAPON_ORDER.map((w) => WEAPONS[w].rpm)),
      range: Math.max(...WEAPON_ORDER.map((w) => WEAPONS[w].range)),
    };
    for (const id of WEAPON_ORDER) {
      const w = WEAPONS[id];
      const bar = (label: string, v: number) => `<div class="statbar">${label}<i style="--v:${Math.round(Math.min(1, v) * 100)}%"></i></div>`;
      const card = document.createElement('button');
      card.className = 'card';
      card.dataset.id = id;
      card.innerHTML = `<h3>${w.key}. ${w.name.toUpperCase()}</h3><p>${w.blurb}</p>${bar('DAMAGE', (w.damage * Math.min(w.pellets, 4)) / (mx.dmg > 100 ? 110 : mx.dmg))}${bar('RATE', w.rpm / mx.rpm)}${bar('RANGE', w.range / mx.range)}${bar('RECOIL', w.recoil / 6)}<div class="note">MAG ${w.mag} • RELOAD ${w.reload}s</div>`;
      card.addEventListener('click', () => { this.h.onClick(); store.update({ weapon: id }); this.markSel(host, id); this.updateSummary(); });
      host.appendChild(card);
    }
    this.markSel(host, store.settings.weapon);
  }

  private markSel(host: HTMLElement, id: string) {
    host.querySelectorAll<HTMLElement>('.card').forEach((c) => c.classList.toggle('sel', c.dataset.id === id));
  }

  // ---------------------------------------------------------------- settings
  private bindSettings() {
    const sens = $<HTMLInputElement>('set-sens'), fov = $<HTMLInputElement>('set-fov'), vol = $<HTMLInputElement>('set-vol');
    const bind = (el: HTMLInputElement, key: 'sensitivity' | 'fov' | 'volume') => {
      el.addEventListener('input', () => { store.update({ [key]: Number(el.value) }); this.syncSettings(); this.h.onSettingsChanged(); });
    };
    bind(sens, 'sensitivity'); bind(fov, 'fov'); bind(vol, 'volume');
    document.querySelectorAll<HTMLElement>('#set-quality button').forEach((b) =>
      b.addEventListener('click', () => { this.h.onClick(); store.update({ quality: b.dataset.q as Quality }); this.syncSettings(); this.h.onSettingsChanged(); }),
    );
  }

  private syncSettings() {
    const s = store.settings;
    $<HTMLInputElement>('set-sens').value = String(s.sensitivity);
    $<HTMLInputElement>('set-fov').value = String(s.fov);
    $<HTMLInputElement>('set-vol').value = String(s.volume);
    $('v-sens').textContent = s.sensitivity.toFixed(2);
    $('v-fov').textContent = String(s.fov) + '°';
    $('v-vol').textContent = Math.round(s.volume * 100) + '%';
    document.querySelectorAll<HTMLElement>('#set-quality button').forEach((b) => b.classList.toggle('on', b.dataset.q === s.quality));
  }

  refreshStats() {
    const st = store.stats;
    const kd = st.deaths ? (st.kills / st.deaths).toFixed(2) : st.kills.toFixed(2);
    const cell = (v: string | number, l: string) => `<div><b>${v}</b><small>${l}</small></div>`;
    $('stats-card').innerHTML = cell(st.matches, 'MATCHES') + cell(`${st.wins}–${st.losses}`, 'W–L') + cell(kd, 'K/D') + cell(st.kills, 'KILLS') + cell(st.headshots, 'HEADSHOTS') + cell(st.bestStreak, 'BEST STREAK');
  }
}
