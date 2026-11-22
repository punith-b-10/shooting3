import type { Match } from '../game/Match';
import { WEAPONS } from '../weapons/weapons';
import type { TeamId } from '../core/types';

/** HTML for both team tables: name, weapon, kills, deaths, health. Shared by the Tab scoreboard and the result screen. */
export function scoreTables(m: Match): string {
  const team = (t: TeamId) => {
    const rows = m.team(t).sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
    const body = rows.map((c) => {
      const hp = c.alive ? `<span class="hpmini"><i style="width:${(c.health / c.maxHealth) * 100}%"></i></span> ${Math.ceil(c.health)}` : 'DEAD';
      return `<tr class="${c.isPlayer ? 'me' : ''} ${c.alive ? '' : 'dead'}"><td>${c.name}${c.isPlayer ? ' (YOU)' : ''}</td><td>${WEAPONS[c.weapon].name}</td><td class="num">${c.kills}</td><td class="num">${c.deaths}</td><td>${hp}</td></tr>`;
    }).join('');
    return `<table class="sb"><thead class="${t}"><tr><th>${t.toUpperCase()} TEAM — ${m.score[t]}</th><th>WEAPON</th><th class="num">K</th><th class="num">D</th><th>HEALTH</th></tr></thead><tbody>${body}</tbody></table>`;
  };
  return team('blue') + team('red');
}
