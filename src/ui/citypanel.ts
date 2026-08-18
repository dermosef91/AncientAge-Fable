// The city panel: what your settlement is actually doing.
//
// The game gives four running totals and a population count, which is not
// enough to know whether you are ahead. This screen answers three questions —
// what is coming in, where everyone is, and what the rival has — and the third
// answer is deliberately only as good as your scouting.
import { ADJ, isTownCenter, MAP_H, MAP_W, RES_NAME, RES_ORDER, SETTLEMENTS } from '../core/config';
import type { ResType, Unit } from '../core/types';
import { RES_OF_NODE } from '../core/types';
import { fmtNum } from '../core/utils';
import type { World } from '../sim/world';
import { icon } from './icons';

/** Jobs a villager can be doing, in the order the panel lists them. */
const JOBS = ['food', 'wood', 'stone', 'gold', 'build', 'idle'] as const;
type Job = (typeof JOBS)[number];

const JOB_LABEL: Record<Job, string> = {
  food: 'Foraging and farming', wood: 'At the trees', stone: 'In the quarry',
  gold: 'In the gold', build: 'On the scaffolds', idle: 'Idle'
};

/**
 * Income per minute for one player, from the simulation's own sampling. The
 * sim keeps cumulative gathered totals every few seconds; two samples far
 * enough apart give an honest rate without the interface keeping books of
 * its own.
 */
function income(world: World, owner: number): { rate: Record<ResType, number>; series: Record<ResType, number[]> } {
  const rate = { food: 0, wood: 0, stone: 0, gold: 0 } as Record<ResType, number>;
  const series = { food: [], wood: [], stone: [], gold: [] } as Record<ResType, number[]>;
  const log = world.econ;
  if (log.length >= 2) {
    for (let i = 1; i < log.length; i++) {
      const dt = log[i].t - log[i - 1].t;
      if (dt <= 0) continue;
      for (const r of RES_ORDER) {
        const d = (log[i].totals[owner][r] - log[i - 1].totals[owner][r]) / dt * 60;
        series[r].push(d);
      }
    }
    // the headline rate is the last minute or so, not the whole match
    const window = Math.min(20, series.food.length);
    for (const r of RES_ORDER) {
      const tail = series[r].slice(-window);
      rate[r] = tail.reduce((a, b) => a + b, 0) / Math.max(1, tail.length);
    }
  }
  return { rate, series };
}

/** A bare sparkline. No axes: this is a shape, not a chart. */
function spark(values: number[], color: string): string {
  const pts = values.slice(-24);
  if (pts.length < 2) return '<svg class="cp-spark" viewBox="0 0 100 24" preserveAspectRatio="none"></svg>';
  const max = Math.max(1, ...pts);
  const step = 100 / (pts.length - 1);
  const line = pts.map((v, i) => `${(i * step).toFixed(1)},${(23 - (v / max) * 21).toFixed(1)}`).join(' ');
  return `<svg class="cp-spark" viewBox="0 0 100 24" preserveAspectRatio="none">
    <polyline points="${line}" fill="none" stroke="${color}" stroke-width="1.6"
      stroke-linejoin="round" stroke-linecap="round"/>
  </svg>`;
}

/** Which job a villager is currently doing, or null if it is not a villager. */
function jobOf(world: World, u: Unit): Job | null {
  if (u.type !== 'villager') return null;
  switch (u.task.type) {
    case 'gather': {
      const n = world.nodes.get(u.task.nodeId);
      return n ? (RES_OF_NODE[n.kind] as Job) : 'idle';
    }
    case 'farm': return 'food';
    case 'deposit': return u.carryKind ? (RES_OF_NODE[u.carryKind] as Job) : 'idle';
    case 'build': return 'build';
    case 'idle': return 'idle';
    default: return 'build';
  }
}

/** What the quarters of the city are earning, in plain sentences. */
function districtLines(world: World): string[] {
  let streets = 0, drill = 0, exchange = 0, fields = 0, depots = 0, sacred = 0, extraPop = 0;
  for (const b of world.buildings.values()) {
    if (b.owner !== 0 || !b.built) continue;
    if (b.adjPop > 0) { streets++; extraPop += b.adjPop; }
    if (b.adjTrain < 1) drill++;
    if (b.adjTrade > 1) exchange++;
    if (b.adjFarm > 1) fields++;
    if (b.adjDepot) depots++;
    if (b.adjHeal > 1) sacred++;
  }
  const out: string[] = [];
  if (streets) out.push(`${streets} house${streets > 1 ? 's' : ''} stand on a street — <b>+${extraPop} population</b>`);
  if (drill) out.push(`${drill} workshops share a drill yard — <b>${Math.round((1 - ADJ.drillMul) * 100)}% faster training</b>`);
  if (exchange) out.push(`Market and Forum together — <b>+${Math.round((ADJ.exchangeMul - 1) * 100)}% trade gold</b>`);
  if (fields) out.push(`${fields} farms worked as one field system — <b>+${Math.round((ADJ.farmMul - 1) * 100)}% yield</b>`);
  if (depots) out.push(`${depots} storehouse${depots > 1 ? 's' : ''} standing in a rich seam — <b>+${Math.round((ADJ.depotMul - 1) * 100)}% gathering nearby</b>`);
  if (sacred) out.push(`A sanctuary beside the games — <b>half again the healing reach</b>`);
  if (out.length === 0) {
    out.push('Nothing yet. Build houses together, put your workshops in one quarter, and a storehouse where the seams are.');
  }
  return out;
}

/**
 * What we can honestly say about the rival. Only what stands on ground the
 * player has walked counts, so a player who has not scouted is told exactly
 * that rather than given free intelligence.
 */
function rivalReport(world: World): string {
  let seenBuildings = 0, seenMilitary = 0, seenVillagers = 0, tcs = 0;
  for (const b of world.buildings.values()) {
    if (b.owner !== 1 || !world.isExploredWorld(b.x, b.z)) continue;
    seenBuildings++;
    if (isTownCenter(b.type)) tcs++;
  }
  for (const u of world.units.values()) {
    if (u.owner !== 1 || !world.isExploredWorld(u.x, u.z)) continue;
    if (u.type === 'villager') seenVillagers++;
    else if (u.type !== 'boat' && u.type !== 'tradecart' && u.type !== 'scout') seenMilitary++;
  }
  let explored = 0;
  for (let i = 0; i < MAP_W * MAP_H; i++) if (world.explored[i]) explored++;
  const pct = Math.round((explored / (MAP_W * MAP_H)) * 100);
  const about = (n: number) => (n === 0 ? 'none' : `about ${Math.max(1, Math.round(n / 2) * 2)}`);
  if (seenBuildings === 0) {
    return `<p class="cp-warn">You have walked <b>${pct}%</b> of the map and seen nothing of their town.
      Everything below is guesswork until you send a scout.</p>`;
  }
  return `<p>On the ground you have walked (<b>${pct}%</b> of the map): <b>${seenBuildings}</b> of their
    buildings, ${tcs > 0 ? `<b>${tcs}</b> town centre${tcs > 1 ? 's' : ''}, ` : ''}
    <b>${about(seenMilitary)}</b> soldiers and <b>${about(seenVillagers)}</b> villagers.</p>
    <p class="cp-note">What you cannot see is not counted. This is the map you have walked, not the map that is there.</p>`;
}

/**
 * Open the city panel. Selecting a job group closes it and hands the player
 * those villagers, which is the whole reason the breakdown is tappable.
 */
export function openCityPanel(
  world: World, onSelect: (ids: number[]) => void, onClose: () => void
): HTMLElement {
  const p = world.players[0];
  const overlay = document.createElement('div');
  overlay.className = 'overlay citypanel';

  const { rate, series } = income(world, 0);
  const colors: Record<ResType, string> = {
    food: '#e8c15a', wood: '#a8845c', stone: '#b9b2a4', gold: '#e8c15a'
  };

  let incomeHtml = '';
  for (const r of RES_ORDER) {
    incomeHtml += `<div class="cp-inc">
      <span class="cp-inc-head">${icon(r, 16)}<b>${RES_NAME[r]}</b></span>
      <span class="cp-rate">${rate[r] > 0 ? '+' : ''}${rate[r].toFixed(0)}<i>/min</i></span>
      ${spark(series[r], colors[r])}
      <span class="cp-have">${fmtNum(p.res[r])} in store</span>
    </div>`;
  }

  // where everyone is
  const groups = new Map<Job, number[]>();
  for (const j of JOBS) groups.set(j, []);
  const scouts: number[] = [];
  const soldiers: number[] = [];
  for (const u of world.units.values()) {
    if (u.owner !== 0) continue;
    if (u.type === 'scout') { scouts.push(u.id); continue; }
    const job = jobOf(world, u);
    if (job) groups.get(job)!.push(u.id);
    else if (u.type !== 'boat' && u.type !== 'tradecart') soldiers.push(u.id);
  }
  let jobsHtml = '';
  for (const j of JOBS) {
    const ids = groups.get(j)!;
    jobsHtml += `<button class="cp-job${ids.length === 0 ? ' empty' : ''}${j === 'idle' && ids.length ? ' idle' : ''}"
      data-job="${j}" ${ids.length === 0 ? 'disabled' : ''}>
      <span class="cp-job-n">${ids.length}</span>
      <span class="cp-job-l">${JOB_LABEL[j]}</span>
    </button>`;
  }
  if (scouts.length) {
    jobsHtml += `<button class="cp-job" data-job="scout">
      <span class="cp-job-n">${scouts.length}</span>
      <span class="cp-job-l">Out in the country</span></button>`;
  }

  const districts = districtLines(world).map(l => `<li>${l}</li>`).join('');

  overlay.innerHTML = `
    <div class="cp-panel">
      <div class="cp-title">
        <h2>Your City</h2>
        <p>${SETTLEMENTS[p.level].name} · ${p.popUsed}/${p.popCap} people · ${soldiers.length} under arms</p>
        <button class="cp-close" title="Close">${icon('close', 16)}</button>
      </div>
      <div class="cp-cols">
        <section class="cp-col">
          <h3>Coming in</h3>
          <div class="cp-incomes">${incomeHtml}</div>
        </section>
        <section class="cp-col">
          <h3>Where everyone is</h3>
          <div class="cp-jobs">${jobsHtml}</div>
          <p class="cp-note">Tap a line to take those villagers in hand.</p>
        </section>
        <section class="cp-col">
          <h3>What the quarters earn</h3>
          <ul class="cp-districts">${districts}</ul>
          <h3>The rival</h3>
          <div class="cp-rival">${rivalReport(world)}</div>
        </section>
      </div>
    </div>`;

  const close = () => { overlay.remove(); onClose(); };
  overlay.querySelector('.cp-close')!.addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  overlay.querySelectorAll<HTMLElement>('.cp-job').forEach(el => {
    el.addEventListener('click', () => {
      const job = el.dataset.job as Job | 'scout';
      const ids = job === 'scout' ? scouts : (groups.get(job) ?? []);
      if (ids.length === 0) return;
      onSelect(ids);
      close();
    });
  });
  return overlay;
}
