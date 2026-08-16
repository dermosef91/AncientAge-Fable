// Full-screen overlays: faction selection and the end-of-match screen.
import { DIFFICULTY, FACTIONS, UNITS } from '../core/config';
import type { Difficulty, Faction, PlayerStats } from '../core/types';
import { fmtTime } from '../core/utils';
import { unitThumb } from '../render/thumbnails';
import type { Sound } from '../audio/sound';
import { bindFullscreenButton, fullscreenSupported } from './fullscreen';
import { icon } from './icons';

export function showFactionSelect(
  root: HTMLElement,
  sound: Sound,
  defaults: { faction: Faction; difficulty: Difficulty },
  onStart: (faction: Faction, difficulty: Difficulty) => void,
  assetsReady?: Promise<unknown>
): HTMLElement {
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.id = 'faction-screen';

  let faction: Faction = defaults.faction;
  let difficulty: Difficulty = defaults.difficulty;

  const inner = document.createElement('div');
  inner.className = 'fs-inner';
  overlay.appendChild(inner);

  let unbindFullscreen: (() => void) | null = null;
  if (fullscreenSupported()) {
    const fsBtn = document.createElement('button');
    fsBtn.className = 'fullscreen-btn fs-corner';
    unbindFullscreen = bindFullscreenButton(
      fsBtn, fs => icon(fs ? 'fullscreenExit' : 'fullscreen', 20), () => sound.button()
    );
    overlay.appendChild(fsBtn);
  }

  const title = document.createElement('div');
  title.className = 'fs-title';
  title.textContent = 'Ancient Age';
  const sub = document.createElement('div');
  sub.className = 'fs-subtitle';
  sub.innerHTML = `<i></i><span>Choose your civilization</span><i></i>`;
  inner.append(title, sub);

  const row = document.createElement('div');
  row.className = 'faction-row';
  const cards = new Map<Faction, HTMLElement>();
  for (const f of Object.values(FACTIONS)) {
    const card = document.createElement('div');
    card.className = 'faction-card' + (f.id === faction ? ' selected' : '');
    card.style.setProperty('--fc', f.uiColor);
    const elite = UNITS[f.elite];
    const thumb = unitThumb(f.elite, f.id);
    const [line1, line2] = splitTwo(f.passiveShort);
    card.innerHTML = `
      <span class="spark top"></span>
      <div class="emblem"><span class="emblem-ring"></span>${icon(f.id, 38)}</div>
      <div class="fname">${f.name}</div>
      <div class="ftitle">${f.title}</div>
      <div class="frule"><i></i><b></b><i></i></div>
      <div class="fdesc">${line1}<br>${line2}</div>
      <div class="felite">${thumb ? `<img src="${thumb}" alt="" class="elite-thumb">` : ''}<span>${elite.name}</span></div>
      <span class="spark bottom"></span>`;
    card.onclick = () => {
      sound.unlock();
      sound.button();
      faction = f.id;
      cards.forEach((c, id) => c.classList.toggle('selected', id === faction));
      desc.textContent = FACTIONS[faction].passive;
    };
    cards.set(f.id, card);
    row.appendChild(card);
  }
  inner.appendChild(row);

  const desc = document.createElement('div');
  desc.className = 'faction-blurb';
  desc.textContent = FACTIONS[faction].passive;
  inner.appendChild(desc);

  const diffRow = document.createElement('div');
  diffRow.className = 'diff-row';
  const diffBtns = new Map<Difficulty, HTMLElement>();
  for (const d of ['easy', 'normal', 'hard'] as Difficulty[]) {
    const def = DIFFICULTY[d];
    const btn = document.createElement('button');
    btn.className = 'diff-btn' + (d === difficulty ? ' selected' : '');
    btn.innerHTML = `${icon(def.icon, 18)}<span>${def.name}</span>`;
    btn.title = def.desc;
    btn.onclick = () => {
      sound.unlock();
      sound.button();
      difficulty = d;
      diffBtns.forEach((b, id) => b.classList.toggle('selected', id === difficulty));
    };
    diffBtns.set(d, btn);
    diffRow.appendChild(btn);
  }
  inner.appendChild(diffRow);

  const start = document.createElement('button');
  start.id = 'start-btn';
  start.innerHTML = `<b class="orn">◆</b><span class="lbl">To Battle</span><b class="orn">◆</b>`;
  let starting = false;
  const label = start.querySelector('.lbl') as HTMLElement;
  start.onclick = () => {
    if (starting) return;
    sound.unlock();
    sound.built();
    starting = true;
    const go = () => {
      unbindFullscreen?.();
      overlay.remove();
      onStart(faction, difficulty);
    };
    if (!assetsReady) { go(); return; }
    // Models may still be streaming in — hold the curtain briefly.
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) { start.classList.add('waiting'); label.textContent = 'Preparing…'; }
    }, 120);
    assetsReady.then(() => { settled = true; clearTimeout(timer); go(); })
      .catch(() => { settled = true; clearTimeout(timer); go(); });
  };
  inner.appendChild(start);

  root.appendChild(overlay);
  return overlay;
}

/** Break a short phrase into two balanced lines, as the mock does. */
function splitTwo(text: string): [string, string] {
  const words = text.split(' ');
  if (words.length < 3) return [text, ''];
  let best = 1, bestDiff = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' ').length;
    const b = words.slice(i).join(' ').length;
    const diff = Math.abs(a - b);
    if (diff < bestDiff) { bestDiff = diff; best = i; }
  }
  return [words.slice(0, best).join(' '), words.slice(best).join(' ')];
}

export function showEndScreen(
  root: HTMLElement,
  sound: Sound,
  won: boolean,
  time: number,
  stats: PlayerStats,
  enemyName: string,
  onRestart: () => void,
  onChangeFaction: () => void,
  reason: 'conquest' | 'wonder' = 'conquest'
): HTMLElement {
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.id = 'end-screen';
  const modal = document.createElement('div');
  modal.className = 'modal';

  const demonym: Record<string, string> = { Egypt: 'Egyptians', Greece: 'Greeks', Rome: 'Romans' };
  const foe = demonym[enemyName] ?? enemyName;
  const flavor = won
    ? (reason === 'wonder'
      ? `Your Wonder stands eternal while the ${foe} look on in awe. Your name echoes through history.`
      : `The ${foe} lie defeated, their town center in ruins. Your name echoes through history.`)
    : (reason === 'wonder'
      ? `The ${foe} completed their Wonder, and the world now marches to their drum.`
      : `Your town center has fallen to the ${foe}. The age of your people ends here.`);

  const gathered = Math.floor(
    stats.gathered.food + stats.gathered.wood + stats.gathered.stone + stats.gathered.gold);
  modal.innerHTML = `
    <div class="result ${won ? 'win' : 'lose'}">${icon(won ? 'trophy' : 'skull', 38)}<span>${won ? 'Victory' : 'Defeat'}</span></div>
    <div class="flavor">${flavor}</div>
    <div class="stat-grid">
      <div class="stat-cell"><div class="v">${fmtTime(time)}</div><div class="k">Match time</div></div>
      <div class="stat-cell"><div class="v">${stats.trained}</div><div class="k">Units trained</div></div>
      <div class="stat-cell"><div class="v">${gathered}</div><div class="k">Res. gathered</div></div>
      <div class="stat-cell"><div class="v">${stats.kills}</div><div class="k">Enemies slain</div></div>
      <div class="stat-cell"><div class="v">${stats.lost}</div><div class="k">Units lost</div></div>
      <div class="stat-cell"><div class="v">${stats.razed}</div><div class="k">Buildings razed</div></div>
    </div>`;

  const btnRow = document.createElement('div');
  btnRow.className = 'btn-row';
  const again = document.createElement('button');
  again.className = 'primary';
  again.innerHTML = `${icon('restart', 18)}<span>Play Again</span>`;
  again.onclick = () => { sound.button(); overlay.remove(); onRestart(); };
  const change = document.createElement('button');
  change.innerHTML = `${icon('home', 18)}<span>Change Civilization</span>`;
  change.onclick = () => { sound.button(); overlay.remove(); onChangeFaction(); };
  btnRow.append(again, change);
  modal.appendChild(btnRow);
  overlay.appendChild(modal);
  root.appendChild(overlay);
  return overlay;
}

function hexCss(n: number): string {
  return '#' + n.toString(16).padStart(6, '0');
}
