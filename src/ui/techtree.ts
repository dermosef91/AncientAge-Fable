// The tech tree: one screen showing what every settlement level unlocks, so a
// player can decide whether the next step up is worth it *before* paying for it.
//
// Everything here is derived from the balance tables — nothing is hand-listed,
// so a new building or unit shows up the moment it is added to config.ts.
import {
  availableTo, BUILD_MENU, BUILD_MENU_WIDE, BUILDINGS, FACTIONS, RES_ORDER, SETTLEMENTS, TECHS,
  UNITS, uniqueTo, type Cost
} from '../core/config';
import type { BuildingTypeId, Faction, UnitTypeId } from '../core/types';
import { buildingThumb, thumbImg, unitThumb } from '../render/thumbnails';
import type { World } from '../sim/world';
import { icon } from './icons';

function costHtml(c: Cost): string {
  const parts: string[] = [];
  for (const k of RES_ORDER) {
    if (c[k]) parts.push(`<span class="tt-cost">${icon(k, 11)}${c[k]}</span>`);
  }
  return parts.join('') || '<span class="tt-cost free">free</span>';
}

/**
 * Every building this civilization can end up with, bucketed by the settlement
 * level that unlocks it. In-place upgrade targets (Shrine → Temple) never
 * appear in the build menu, but they are exactly the kind of thing this screen
 * exists to surface — as are the civilization uniques, which is why the other
 * civs' are filtered out. The Wonder gets its own Victory section.
 */
function buildingsByLevel(faction: Faction): BuildingTypeId[][] {
  const out: BuildingTypeId[][] = SETTLEMENTS.map(() => []);
  const seen = new Set<BuildingTypeId>();
  const push = (bt: BuildingTypeId) => {
    if (seen.has(bt) || bt === 'wonder' || !availableTo(BUILDINGS[bt], faction)) return;
    seen.add(bt);
    out[BUILDINGS[bt].level].push(bt);
  };
  for (const bt of [...BUILD_MENU, ...BUILD_MENU_WIDE]) {
    push(bt);
    const up = BUILDINGS[bt].upgradesTo;
    if (up) push(up);
  }
  return out;
}

/** Buildings that exist only as an upgrade get a line saying so. */
function upgradeSource(bt: BuildingTypeId): string | null {
  for (const key of Object.keys(BUILDINGS) as BuildingTypeId[]) {
    if (BUILDINGS[key].upgradesTo === bt) return `Upgraded in place from the ${BUILDINGS[key].name}`;
  }
  return null;
}

/** Units by settlement level, including this civilization's unique unit. */
function unitsByLevel(faction: Faction): UnitTypeId[][] {
  const out: UnitTypeId[][] = SETTLEMENTS.map(() => []);
  const elite = FACTIONS[faction].elite;
  for (const key of Object.keys(UNITS) as UnitTypeId[]) {
    const d = UNITS[key];
    // wilds creatures are never trained, and the other civs' uniques are not yours
    if (d.cost.food === undefined && d.cost.wood === undefined &&
        d.cost.gold === undefined && d.cost.stone === undefined) continue;
    const isSomeonesElite = Object.values(FACTIONS).some(f => f.elite === key);
    if (isSomeonesElite && key !== elite) continue;
    out[d.level].push(key);
  }
  return out;
}

function techsByLevel(faction: Faction): string[][] {
  const out: string[][] = SETTLEMENTS.map(() => []);
  for (const id of Object.keys(TECHS)) {
    if (availableTo(TECHS[id], faction)) out[TECHS[id].level].push(id);
  }
  return out;
}

/**
 * Open the tech tree over the running game. Returns a disposer; the caller is
 * responsible for pausing and for calling it when the overlay closes.
 */
export function openTechTree(world: World, onClose: () => void): HTMLElement {
  const p = world.players[0];
  const faction = p.faction;
  const byLevel = buildingsByLevel(faction);
  const unitsAt = unitsByLevel(faction);
  const techsAt = techsByLevel(faction);

  const overlay = document.createElement('div');
  overlay.className = 'overlay techtree';

  const row = (art: string, name: string, cost: string, sub: string, done: boolean) =>
    `<div class="tt-row${done ? ' done' : ''}">
       <span class="tt-art">${art}</span>
       <span class="tt-text"><b>${name}</b><i>${sub}</i></span>
       <span class="tt-costs">${done ? icon('check', 13) : cost}</span>
     </div>`;

  let cols = '';
  for (let a = 0; a < SETTLEMENTS.length; a++) {
    const lvl = SETTLEMENTS[a];
    const reached = p.level >= a;
    const current = p.level === a;
    const state = current ? 'current' : reached ? 'reached' : 'locked';
    const stateLabel = current ? 'You are here' : reached ? 'Reached' : 'Locked';

    let body = '';
    if (byLevel[a].length) {
      body += `<h4>Buildings</h4>`;
      for (const bt of byLevel[a]) {
        const d = BUILDINGS[bt];
        const notes: string[] = [];
        const only = uniqueTo(d);
        if (only) notes.push(`Unique to ${FACTIONS[only].name}`);
        const from = upgradeSource(bt);
        if (from) notes.push(from);
        notes.push(d.desc);
        body += row(thumbImg(buildingThumb(bt, faction, Math.max(a, p.level)), 'tt-thumb'),
          d.name, costHtml(world.buildingCost(0, bt)), notes.join(' — '), false);
      }
    }
    if (unitsAt[a].length) {
      body += `<h4>Units</h4>`;
      for (const ut of unitsAt[a]) {
        const d = UNITS[ut];
        const from = trainedAt(ut, faction);
        body += row(thumbImg(unitThumb(ut, faction), 'tt-thumb'),
          d.name, costHtml(d.cost), from, false);
      }
    }
    if (techsAt[a].length) {
      body += `<h4>Technologies</h4>`;
      for (const id of techsAt[a]) {
        const t = TECHS[id];
        const only = uniqueTo(t);
        const where = only
          ? `known only to ${FACTIONS[only].name}, at the ${BUILDINGS[t.at].name}`
          : `at the ${BUILDINGS[t.at].name}`;
        body += row(icon(t.icon, 26), t.name, costHtml(t.cost),
          `${t.desc} — ${where}`, p.techs.has(id));
      }
    }
    if (a === SETTLEMENTS.length - 1) {
      body += `<h4>Victory</h4>` + row(icon('trophy', 26), 'The Wonder',
        costHtml(BUILDINGS.wonder.cost), 'Raise it and hold it for three minutes to win.', false);
    }

    cols += `<section class="tt-col ${state}">
      <header>
        <span class="tt-badge">${lvl.numeral}</span>
        <span class="tt-head"><b>${lvl.name}</b>
          <i>${a === 0 ? 'Where every match begins' : costHtml(lvl.cost) + ` · ${lvl.time}s`}</i></span>
        <span class="tt-state">${stateLabel}</span>
      </header>
      <div class="tt-body">${body}</div>
    </section>`;
  }

  overlay.innerHTML = `
    <div class="tt-panel">
      <div class="tt-title">
        <h2>The Settlement</h2>
        <p>${FACTIONS[faction].name} — ${FACTIONS[faction].passive}</p>
        <button class="tt-close" title="Close">${icon('close', 16)}</button>
      </div>
      <div class="tt-cols">${cols}</div>
    </div>`;

  const close = () => { overlay.remove(); onClose(); };
  overlay.querySelector('.tt-close')!.addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  return overlay;
}

/** Which building trains this unit, phrased for the panel's subtitle. */
function trainedAt(ut: UnitTypeId, faction: Faction): string {
  if (FACTIONS[faction].elite === ut) {
    return `Unique to ${FACTIONS[faction].name} — from the ${BUILDINGS[FACTIONS[faction].eliteAt].name}`;
  }
  for (const key of Object.keys(BUILDINGS) as BuildingTypeId[]) {
    if (BUILDINGS[key].trains?.includes(ut)) return `From the ${BUILDINGS[key].name}`;
  }
  return UNITS[ut].desc;
}
