// The tech tree: one screen showing what every age unlocks, so a player can
// decide whether 460 food and 200 gold is worth it *before* spending it.
//
// Everything here is derived from the balance tables — nothing is hand-listed,
// so a new building or unit shows up the moment it is added to config.ts.
import {
  AGES, BUILD_MENU, BUILD_MENU_WIDE, BUILDINGS, FACTIONS, RES_ORDER, TECHS, UNITS,
  type Cost
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
 * Every building the player can end up with, bucketed by the age that unlocks
 * it. In-place upgrade targets (Shrine → Temple) never appear in the build
 * menu, but they are exactly the kind of thing this screen exists to surface.
 * The Wonder is left out — it gets its own Victory section.
 */
function buildingsByAge(): BuildingTypeId[][] {
  const out: BuildingTypeId[][] = [[], [], [], []];
  const seen = new Set<BuildingTypeId>();
  const push = (bt: BuildingTypeId) => {
    if (seen.has(bt) || bt === 'wonder') return;
    seen.add(bt);
    out[BUILDINGS[bt].age].push(bt);
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

/**
 * Units by age, including this civilization's unique unit and the in-place
 * upgrade a Shrine makes into a Temple (which is a building, but reads to the
 * player as a thing an age unlocks).
 */
function unitsByAge(faction: Faction): UnitTypeId[][] {
  const out: UnitTypeId[][] = [[], [], [], []];
  const elite = FACTIONS[faction].elite;
  for (const key of Object.keys(UNITS) as UnitTypeId[]) {
    const d = UNITS[key];
    // wilds creatures are never trained, and the other civs' uniques are not yours
    if (d.cost.food === undefined && d.cost.wood === undefined &&
        d.cost.gold === undefined && d.cost.stone === undefined) continue;
    const isSomeonesElite = Object.values(FACTIONS).some(f => f.elite === key);
    if (isSomeonesElite && key !== elite) continue;
    out[d.age].push(key);
  }
  return out;
}

function techsByAge(): string[][] {
  const out: string[][] = [[], [], [], []];
  for (const id of Object.keys(TECHS)) out[TECHS[id].age].push(id);
  return out;
}

/**
 * Open the tech tree over the running game. Returns a disposer; the caller is
 * responsible for pausing and for calling it when the overlay closes.
 */
export function openTechTree(world: World, onClose: () => void): HTMLElement {
  const p = world.players[0];
  const faction = p.faction;
  const bByAge = buildingsByAge();
  const uByAge = unitsByAge(faction);
  const tByAge = techsByAge();

  const overlay = document.createElement('div');
  overlay.className = 'overlay techtree';

  const row = (art: string, name: string, cost: string, sub: string, done: boolean) =>
    `<div class="tt-row${done ? ' done' : ''}">
       <span class="tt-art">${art}</span>
       <span class="tt-text"><b>${name}</b><i>${sub}</i></span>
       <span class="tt-costs">${done ? icon('check', 13) : cost}</span>
     </div>`;

  let cols = '';
  for (let a = 0; a < AGES.length; a++) {
    const age = AGES[a];
    const reached = p.age >= a;
    const current = p.age === a;
    const state = current ? 'current' : reached ? 'reached' : 'locked';
    const stateLabel = current ? 'You are here' : reached ? 'Reached' : 'Locked';

    let body = '';
    if (bByAge[a].length) {
      body += `<h4>Buildings</h4>`;
      for (const bt of bByAge[a]) {
        const d = BUILDINGS[bt];
        const from = upgradeSource(bt);
        body += row(thumbImg(buildingThumb(bt, faction, Math.max(a, p.age)), 'tt-thumb'),
          d.name, costHtml(world.buildingCost(0, bt)), from ? `${from} — ${d.desc}` : d.desc, false);
      }
    }
    if (uByAge[a].length) {
      body += `<h4>Units</h4>`;
      for (const ut of uByAge[a]) {
        const d = UNITS[ut];
        const from = trainedAt(ut, faction);
        body += row(thumbImg(unitThumb(ut, faction), 'tt-thumb'),
          d.name, costHtml(d.cost), from, false);
      }
    }
    if (tByAge[a].length) {
      body += `<h4>Technologies</h4>`;
      for (const id of tByAge[a]) {
        const t = TECHS[id];
        body += row(icon(t.icon, 26), t.name, costHtml(t.cost),
          `${t.desc} — at the ${BUILDINGS[t.at].name}`, p.techs.has(id));
      }
    }
    if (a === AGES.length - 1) {
      body += `<h4>Victory</h4>` + row(icon('trophy', 26), 'The Wonder',
        costHtml(BUILDINGS.wonder.cost), 'Raise it and hold it for three minutes to win.', false);
    }

    cols += `<section class="tt-col ${state}">
      <header>
        <span class="tt-badge">${age.numeral}</span>
        <span class="tt-head"><b>${age.name}</b>
          <i>${a === 0 ? 'Where every match begins' : costHtml(age.cost) + ` · ${age.time}s`}</i></span>
        <span class="tt-state">${stateLabel}</span>
      </header>
      <div class="tt-body">${body}</div>
    </section>`;
  }

  overlay.innerHTML = `
    <div class="tt-panel">
      <div class="tt-title">
        <h2>The Ages</h2>
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
