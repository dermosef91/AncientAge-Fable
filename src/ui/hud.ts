// HUD: resource bar, settlement chip, objectives, selection panel with unit stats,
// context actions, the build menu, toasts and the pause menu.
import {
  ARMOR_CLASS_NAME, BOONS, BUILD_MENU, BUILD_MENU_WIDE, BUILDINGS, ENC, MARKET_BUY_GOLD,
  MARKET_LOT, MARKET_SELL_GOLD, MAX_LEVEL, RES_ORDER, SETTLEMENTS, TECHS, trainableAt, UNITS,
  WILDS, type Cost
} from '../core/config';
import type {
  ArmorClass, Building, BuildingTypeId, ResType, SimEvent, UnitTypeId
} from '../core/types';
import { RES_OF_NODE } from '../core/types';
import { fmtNum, fmtTime } from '../core/utils';
import { buildingThumb, thumbImg, unitThumb } from '../render/thumbnails';
import type { Sound } from '../audio/sound';
import type { World } from '../sim/world';
import type { GameView } from '../render/view';
import { bindFullscreenButton, fullscreenSupported } from './fullscreen';
import { icon } from './icons';
import { openTechTree } from './techtree';
import type { InputController } from './input';
import type { Minimap } from './minimap';

interface Objective {
  id: string;
  label: string;
  target: number;
  progress: () => number;
  done: boolean;
}

export interface HudCallbacks {
  onRestart: () => void;
  onQuit: () => void;
  setPaused: (p: boolean) => void;
}

/**
 * "Strong vs" line for the selection panel — the whole counter system is
 * invisible unless the unit tells you what it is for.
 */
function counterHtml(type: UnitTypeId): string {
  const bonus = UNITS[type].bonus;
  if (!bonus) return '';
  const names = (Object.keys(bonus) as ArmorClass[])
    .filter(k => (bonus[k] ?? 0) > 0)
    .sort((a, b) => (bonus[b] ?? 0) - (bonus[a] ?? 0))
    .map(k => ARMOR_CLASS_NAME[k]);
  if (names.length === 0) return '';
  return `<div class="counters" title="Deals bonus damage to these targets">
    <span class="ck">Strong vs</span> ${names.join(' · ')}</div>`;
}

/**
 * A ruined fort's line in the selection panel. Who holds it, and how far along
 * anyone standing in it has got — the capture is invisible without this.
 */
function outpostStatus(w: World, b: Building): string {
  const site = w.sites.find(s => s.buildingId === b.id);
  const held = b.owner === 0 ? 'Yours' : b.owner === 1 ? 'Held by the rival' : 'Unclaimed';
  if (!site) return held;
  if (site.capture > 0) {
    const who = site.claimant === 0 ? 'You are claiming it' : 'The rival is claiming it';
    return `${held} — ${who}, ${Math.floor(site.capture * 100)}%`;
  }
  return `${held} — stand in it with no enemy present to claim it`;
}

/** Cost line: small resource icons followed by their amounts. */
function costHtml(c: Cost, size = 13): string {
  const parts: string[] = [];
  for (const k of RES_ORDER) {
    if (c[k]) parts.push(`<span class="cost-chip">${icon(k, size)}${c[k]}</span>`);
  }
  return parts.join('');
}

export class HUD {
  root: HTMLElement;
  private topbar!: HTMLElement;
  private objectivesEl!: HTMLElement;
  private selpanel!: HTMLElement;
  private actionsEl!: HTMLElement;
  private buildSheet!: HTMLElement;
  private placeHint!: HTMLElement;
  private toastsEl!: HTMLElement;
  private levelChip!: HTMLElement;
  private wonderBanner!: HTMLElement;
  private boonsEl!: HTMLElement;
  private offerEl!: HTMLElement;
  private offerSig = '';
  private idleBtn!: HTMLElement;
  private sideRail!: HTMLElement;
  private menuModal: HTMLElement | null = null;
  private techTree: HTMLElement | null = null;
  private unbindFullscreen: (() => void) | null = null;
  private resEls: Record<string, HTMLElement> = {};
  private objectives: Objective[] = [];
  private panelSig = '';
  private actionsSig = '';
  private buildSig = '';
  private refreshT = 0;
  private lastWarnT = -99;
  private objectivesDone = false;

  constructor(
    private world: World,
    private view: GameView,
    private input: InputController,
    private sound: Sound,
    private minimap: () => Minimap,
    private cb: HudCallbacks
  ) {
    this.root = document.getElementById('ui')!;
    this.buildDom();
    this.defineObjectives();
    input.onChange = () => this.refreshSelectionUI();
    input.onPlaced = () => this.refreshSelectionUI();
  }

  private el(tag: string, id: string, parent: HTMLElement, cls = ''): HTMLElement {
    const e = document.createElement(tag);
    if (id) e.id = id;
    if (cls) e.className = cls;
    parent.appendChild(e);
    return e;
  }

  private buildDom() {
    // ---- top-left resources
    this.topbar = this.el('div', 'topbar', this.root);
    for (const r of RES_ORDER) {
      const chip = this.el('div', '', this.topbar, 'res-chip');
      chip.innerHTML = `${icon(r, 18)}<span class="val">0</span>`;
      this.resEls[r] = chip.querySelector('.val')!;
    }
    const pop = this.el('div', '', this.topbar, 'res-chip pop');
    pop.innerHTML = `${icon('pop', 18)}<span class="val">0/0</span>`;
    this.resEls.pop = pop.querySelector('.val')!;
    this.resEls.popChip = pop;

    // ---- top-right settlement status + menu
    const tr = this.el('div', 'top-right', this.root);
    this.levelChip = this.el('div', 'settlement-chip', tr);
    this.levelChip.innerHTML =
      `<span class="lvl-badge">I</span>
       <span class="lvl-text"><b class="lvl-name">Camp</b><i class="lvl-clock">00:00</i></span>`;
    // The settlement levels *are* the tech tree, so the chip is where it lives.
    this.levelChip.title = 'What each settlement level unlocks';
    this.levelChip.onclick = () => { this.sound.button(); this.openTechTree(); };
    if (fullscreenSupported()) {
      const fsBtn = this.el('button', '', tr, 'fullscreen-btn') as HTMLButtonElement;
      this.unbindFullscreen = bindFullscreenButton(
        fsBtn, fs => icon(fs ? 'fullscreenExit' : 'fullscreen', 20), () => this.sound.button()
      );
    }
    const menuBtn = this.el('button', 'menu-btn', tr);
    menuBtn.innerHTML = icon('menu', 22);
    menuBtn.title = 'Menu';
    menuBtn.onclick = () => { this.sound.button(); this.openMenu(); };

    // ---- objectives
    this.objectivesEl = this.el('div', 'objectives', this.root);

    // ---- wonder countdown banner
    this.wonderBanner = this.el('div', 'wonder-banner', this.root);

    // ---- encounter UI: active boons + the deserters' offer
    this.boonsEl = this.el('div', 'boons', this.root);
    this.offerEl = this.el('div', 'offer-banner', this.root);

    // ---- right rail
    const side = this.el('div', 'side-right', this.root);
    this.sideRail = side;
    const armyBtn = this.el('button', '', side);
    armyBtn.innerHTML = icon('army', 24);
    armyBtn.title = 'Select army';
    armyBtn.onclick = () => this.input.selectAllMilitary();

    this.idleBtn = this.el('button', '', side);
    this.idleBtn.innerHTML = `${icon('villagers', 24)}<span class="badge" hidden>0</span>`;
    this.idleBtn.title = 'Next idle villager';
    this.idleBtn.onclick = () => {
      if (!this.input.selectIdleVillager()) this.toast('No idle villagers', '');
    };

    const homeBtn = this.el('button', '', side);
    homeBtn.innerHTML = icon('home', 24);
    homeBtn.title = 'Go to Town Center';
    homeBtn.onclick = () => { this.sound.button(); this.input.centerOnTC(); };

    // ---- panels
    this.selpanel = this.el('div', 'selpanel', this.root);
    this.actionsEl = this.el('div', 'actions', this.root);
    this.buildSheet = this.el('div', 'build-sheet', this.root);
    this.placeHint = this.el('div', 'place-hint', this.root);
    this.toastsEl = this.el('div', 'toasts', this.root);
  }

  // ---------------- objectives ----------------
  private defineObjectives() {
    const w = this.world;
    const p = w.players[0];
    const count = (pred: (b: Building) => boolean) => {
      let n = 0;
      for (const b of w.buildings.values()) if (b.owner === 0 && pred(b)) n++;
      return n;
    };
    const unitCount = (pred: (t: UnitTypeId) => boolean) => {
      let n = 0;
      for (const u of w.units.values()) if (u.owner === 0 && pred(u.type)) n++;
      return n;
    };
    this.objectives = [
      { id: 'food', label: 'Gather food', target: 60, done: false, progress: () => p.stats.gathered.food },
      { id: 'house', label: 'Build a House', target: 1, done: false, progress: () => count(b => b.type === 'house' && b.built) },
      { id: 'vils', label: 'Train villagers', target: 6, done: false, progress: () => unitCount(t => t === 'villager') },
      { id: 'hamlet', label: 'Grow into a Hamlet', target: 1, done: false, progress: () => (p.level >= 1 ? 1 : 0) },
      { id: 'barracks', label: 'Build a Barracks', target: 1, done: false, progress: () => count(b => (b.type === 'barracks' || b.type === 'range') && b.built) },
      { id: 'army', label: 'Train soldiers', target: 6, done: false, progress: () => unitCount(t => t !== 'villager' && t !== 'boat') },
      { id: 'town', label: 'Grow into a Town', target: 1, done: false, progress: () => (p.level >= 3 ? 1 : 0) },
      { id: 'win', label: 'Raze their town — or raise a Wonder', target: 1, done: false, progress: () => 0 }
    ];
    this.renderObjectives();
  }

  private renderObjectives() {
    const active = this.objectives.filter(o => !o.done);
    const doneRecent = this.objectives.filter(o => o.done).slice(-1);
    const show = [...doneRecent, ...active.slice(0, 3)];
    let html = '<div class="obj-title">Objectives</div>';
    for (const o of show) {
      const prog = Math.min(o.target, Math.floor(o.progress()));
      const countTxt = o.target > 1 ? `<span class="count">${prog}/${o.target}</span>` : '';
      const cls = o.done ? 'done' : (o === active[0] ? 'active' : '');
      const mark = o.done ? icon('check', 13) : icon('bullet', 13);
      html += `<div class="obj ${cls}"><span class="tick">${mark}</span><span class="olabel">${o.label}</span>${countTxt}</div>`;
    }
    this.objectivesEl.innerHTML = html;
  }

  private updateObjectives() {
    let changed = false;
    for (const o of this.objectives) {
      if (!o.done && o.progress() >= o.target) {
        o.done = true;
        changed = true;
        this.sound.deposit();
      }
    }
    const allButWin = this.objectives.filter(o => o.id !== 'win');
    if (!this.objectivesDone && allButWin.every(o => o.done)) {
      this.objectivesDone = true;
      setTimeout(() => this.objectivesEl.classList.add('fading'), 9000);
    }
    if (changed || !this.objectivesDone) this.renderObjectives();
  }

  // ---------------- build menu ----------------
  /** Show/hide the build sheet; the side rail steps aside while it is open. */
  private setBuildSheet(open: boolean) {
    this.buildSheet.classList.toggle('visible', open);
    this.sideRail.classList.toggle('tucked', open);
    if (open) {
      this.buildSig = '';
      this.renderBuildSheet();
    }
  }

  private renderBuildSheet() {
    const w = this.world;
    const p = w.players[0];
    const faction = p.faction;
    const sig = `${p.level}|${faction}|${RES_ORDER.map(r => Math.floor(p.res[r] / 5)).join(',')}`;
    if (sig === this.buildSig) return;
    this.buildSig = sig;

    const card = (bt: BuildingTypeId, wide: boolean) => {
      const def = BUILDINGS[bt];
      const locked = p.level < def.level;
      const cost = w.buildingCost(0, bt);
      const afford = w.canAfford(0, cost);
      const cls = ['build-card'];
      if (wide) cls.push('wide');
      if (locked) cls.push('locked');
      else if (!afford) cls.push('unaffordable');
      const meta = locked
        ? `<span class="breq">${icon('lock', 12)}${SETTLEMENTS[def.level].name}</span>`
        : `<span class="bcost">${costHtml(cost)}</span>`;
      return `<button class="${cls.join(' ')}" data-bt="${bt}" title="${def.desc}">
          <span class="bthumb-wrap">${thumbImg(buildingThumb(bt, faction, p.level), 'bthumb')}</span>
          <span class="bmeta"><span class="bname">${def.name}</span>${meta}</span>
        </button>`;
    };

    let html = '';
    for (const bt of BUILD_MENU) html += card(bt, false);
    for (const bt of BUILD_MENU_WIDE) html += card(bt, true);
    this.buildSheet.innerHTML = html;

    this.buildSheet.querySelectorAll<HTMLElement>('.build-card').forEach(el => {
      el.onclick = () => {
        const bt = el.dataset.bt as BuildingTypeId;
        const def = BUILDINGS[bt];
        if (p.level < def.level) {
          this.sound.error();
          this.toast(`${def.name} requires a ${SETTLEMENTS[def.level].name}`, 'warn');
          return;
        }
        this.sound.button();
        this.setBuildSheet(false);
        this.input.enterPlacement(bt);
      };
    });
  }

  // ---------------- selection panel + actions ----------------
  refreshSelectionUI() {
    this.panelSig = '';
    this.actionsSig = '';
    this.renderPanel();
    this.renderActions();
    if (this.input.mode === 'place' && this.input.placeType) {
      const bt = this.input.placeType;
      const name = BUILDINGS[bt].name;
      this.placeHint.classList.add('visible');
      if (bt === 'wall') {
        this.placeHint.innerHTML = `<span>Raising <b>${name}s</b> — tap ground for each segment</span>`;
      } else {
        this.placeHint.innerHTML = `<span>Placing <b>${name}</b> — tap to move it</span>`;
        const rotate = document.createElement('button');
        rotate.innerHTML = `${icon('rotate', 13)}Rotate`;
        rotate.onclick = () => this.input.rotatePlacement();
        this.placeHint.appendChild(rotate);
        const build = document.createElement('button');
        build.className = 'confirm';
        build.innerHTML = `${icon('build', 13)}Build`;
        build.onclick = () => { this.input.confirmPlacement(); };
        this.placeHint.appendChild(build);
      }
      const cancel = document.createElement('button');
      cancel.innerHTML = `${icon('close', 13)}Cancel`;
      cancel.onclick = () => { this.sound.button(); this.input.cancelPlacement(); };
      this.placeHint.appendChild(cancel);
      this.setBuildSheet(false);
    } else {
      this.placeHint.classList.remove('visible');
    }
  }

  private renderPanel() {
    const w = this.world;
    const sel = this.input.selection;
    const sig = sel.join(',') + '|' + this.input.mode;
    if (sig === this.panelSig) { this.updatePanelDynamic(); return; }
    this.panelSig = sig;

    if (sel.length === 0) {
      this.selpanel.classList.remove('visible');
      return;
    }
    this.selpanel.classList.add('visible');

    const units = sel.map(id => w.units.get(id)).filter(u => u);
    const bld = sel.length === 1 ? w.buildings.get(sel[0]) : undefined;
    const node = sel.length === 1 ? w.nodes.get(sel[0]) : undefined;
    const faction = w.players[0].faction;

    let html = '';
    if (units.length > 1) {
      const byType = new Map<UnitTypeId, number>();
      for (const u of units) byType.set(u!.type, (byType.get(u!.type) ?? 0) + 1);
      html += `<div class="type-chips">`;
      for (const [t, n] of byType) {
        const owner = units.find(u => u!.type === t)!.owner;
        html += `<button class="type-chip" data-t="${t}" title="${UNITS[t].name}">
          ${thumbImg(unitThumb(t, w.players[owner].faction), 'chip-thumb')}<span class="n">${n}</span></button>`;
      }
      html += `</div>`;
      html += `<div class="info"><div class="name">${units.length} units</div>
        <div class="sub">Tap a group to filter</div></div>`;
    } else if (units.length === 1) {
      const u = units[0]!;
      const def = UNITS[u.type];
      const s = w.unitStats(u.owner, u.type);
      const tag = u.owner === WILDS ? ' <span class="foe wild">wilds</span>'
        : u.owner !== 0 ? ' <span class="foe">enemy</span>' : '';
      const carryTxt = u.carryAmt > 0.5 && u.carryKind
        ? `<span class="carry">${icon(RES_OF_NODE[u.carryKind], 12)}${Math.floor(u.carryAmt)}</span>` : '';
      const status = u.relic ? 'Carrying the Idol' : u.hold ? 'Holding' : taskLabel(u.task.type);
      html += `<div class="portrait">${thumbImg(unitThumb(u.type, w.players[u.owner].faction), 'pthumb')}</div>
        <div class="info">
          <div class="name">${def.name}${tag}
            <span class="status">${status}</span></div>
          <div class="statrow">
            <span title="Attack">${icon('statAtk', 12)}<b>${s.atk.toFixed(0)}</b></span>
            <span title="Melee armor / pierce armor">${icon('statArm', 12)}<b>${s.meleeArmor}/${s.pierceArmor}</b></span>
            <span title="Range">${icon('statRng', 12)}<b>${def.range > 0 ? def.range.toFixed(1) : '1'}</b></span>
            <span title="Speed">${icon('statSpd', 12)}<b>${s.speed.toFixed(1)}</b></span>
            ${carryTxt}
          </div>
          ${counterHtml(u.type)}
          <div class="hpbar"><div data-hp style="width:${(u.hp / u.maxHp) * 100}%"></div>
            <span class="hptext" data-hptext>${Math.ceil(u.hp)}/${u.maxHp}</span></div>
        </div>`;
    } else if (bld) {
      const def = BUILDINGS[bld.type];
      const enemy = bld.owner !== 0;
      const tag = bld.owner === WILDS ? ' <span class="foe wild">wilds</span>'
        : enemy ? ' <span class="foe">enemy</span>' : '';
      let sub = def.desc;
      if (!bld.built) sub = `Under construction — <span data-prog>${Math.floor(bld.progress * 100)}%</span>`;
      else if (def.farm) sub = bld.withered ? 'Withered — needs wood to reseed' : `${Math.floor(bld.farmFood)} food remaining`;
      else if (bld.type === 'outpost') sub = outpostStatus(w, bld);
      else if (def.trains && !enemy) sub = 'Tap the ground to set a rally point';
      html += `<div class="portrait">${thumbImg(buildingThumb(bld.type, w.players[bld.owner].faction, w.players[bld.owner].level), 'pthumb')}</div>
        <div class="info">
          <div class="name">${def.name}${tag}</div>
          <div class="sub">${sub}</div>
          <div class="hpbar"><div data-hp style="width:${(bld.hp / bld.maxHp) * 100}%"></div>
            <span class="hptext" data-hptext>${Math.ceil(bld.hp)}/${bld.maxHp}</span></div>
        </div>`;
      if (!enemy && bld.queue.length > 0) html += `<div class="queue" data-queue></div>`;
    } else if (node) {
      const names: Record<string, string> = {
        tree: 'Woodland', berries: 'Berry Bush', stone: 'Stone Deposit',
        gold: 'Gold Deposit', fish: 'Fish Shoal', carcass: 'Fresh Kill'
      };
      const res = RES_OF_NODE[node.kind];
      html += `<div class="portrait res">${icon(res, 30)}</div>
        <div class="info">
          <div class="name">${names[node.kind]}</div>
          <div class="sub"><span data-amt>${Math.ceil(node.amount)}</span> ${res} remaining</div>
          <div class="hpbar node"><div data-hp style="width:${(node.amount / node.max) * 100}%"></div></div>
        </div>`;
    }
    html += `<button class="closex" data-close>${icon('close', 13)}</button>`;
    this.selpanel.innerHTML = html;

    this.selpanel.querySelector('[data-close]')?.addEventListener('click', () => {
      this.sound.button();
      this.input.clearSelection();
    });
    this.selpanel.querySelectorAll('.type-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const t = (chip as HTMLElement).dataset.t as UnitTypeId;
        const ids = this.input.selection.filter(id => w.units.get(id)?.type === t);
        this.sound.button();
        this.input.select(ids);
      });
    });
    this.updatePanelDynamic();
  }

  private updatePanelDynamic() {
    const w = this.world;
    const sel = this.input.selection;
    if (sel.length !== 1) return;
    const u = w.units.get(sel[0]);
    const b = w.buildings.get(sel[0]);
    const n = w.nodes.get(sel[0]);
    const hpEl = this.selpanel.querySelector('[data-hp]') as HTMLElement | null;
    const hpText = this.selpanel.querySelector('[data-hptext]') as HTMLElement | null;
    if (u && hpEl) {
      const pct = (u.hp / u.maxHp) * 100;
      hpEl.style.width = pct + '%';
      hpEl.parentElement!.classList.toggle('low', pct < 30);
      if (hpText) hpText.textContent = `${Math.ceil(u.hp)}/${u.maxHp}`;
      const st = this.selpanel.querySelector('.status');
      if (st) st.textContent = u.relic ? 'Carrying the Idol' : u.hold ? 'Holding' : taskLabel(u.task.type);
    }
    if (b && hpEl) {
      hpEl.style.width = (b.hp / b.maxHp) * 100 + '%';
      if (hpText) hpText.textContent = `${Math.ceil(b.hp)}/${b.maxHp}`;
      const prog = this.selpanel.querySelector('[data-prog]');
      if (prog) prog.textContent = Math.floor(b.progress * 100) + '%';
      const qEl = this.selpanel.querySelector('[data-queue]') as HTMLElement | null;
      if (b.queue.length > 0 && !qEl) { this.panelSig = ''; this.renderPanel(); return; }
      if (qEl) {
        if (b.queue.length === 0) { this.panelSig = ''; this.renderPanel(); return; }
        const faction = w.players[b.owner].faction;
        let html = '';
        b.queue.forEach((q, i) => {
          const art = q.kind === 'unit'
            ? thumbImg(unitThumb(q.unit!, faction), 'qthumb')
            : q.kind === 'level' ? `<span class="qlvl">${SETTLEMENTS[q.level!].numeral}</span>`
            : icon(TECHS[q.tech!].icon, 20);
          const pct = i === 0 ? (q.t / q.total) * 100 : 0;
          html += `<button class="qslot" data-qi="${i}" title="Cancel">${art}<span class="prog" style="width:${pct}%"></span></button>`;
        });
        qEl.innerHTML = html;
        qEl.querySelectorAll('.qslot').forEach(slot => {
          slot.addEventListener('click', () => {
            const i = parseInt((slot as HTMLElement).dataset.qi!);
            this.sound.button();
            w.cancelQueueItem(b.id, i);
            this.panelSig = '';
            this.renderPanel();
          });
        });
      }
    }
    if (n) {
      const amt = this.selpanel.querySelector('[data-amt]');
      if (amt) amt.textContent = String(Math.ceil(n.amount));
      if (hpEl) hpEl.style.width = (n.amount / n.max) * 100 + '%';
    }
  }

  private renderActions() {
    const w = this.world;
    const p = w.players[0];
    const sel = this.input.selection;
    const vils = this.input.ownVillagerIds();
    const mil = this.input.ownMilitaryIds();
    const workers = this.input.ownUnits().filter(u => u.type === 'villager' || u.type === 'boat');
    const carts = this.input.ownUnits().filter(u => u.type === 'tradecart');
    const bld = sel.length === 1 ? w.buildings.get(sel[0]) : undefined;
    const ownBld = bld && bld.owner === 0 ? bld : undefined;
    const holdOn = this.input.holdActive();

    const sig = [
      vils.length > 0, mil.length > 0, workers.length > 0, carts.length > 0, holdOn,
      ownBld ? ownBld.id + ownBld.type + (ownBld.built ? 'b' : 'c') : '',
      this.input.mode, p.techs.size, p.level, p.laborOn
    ].join('|');
    if (sig === this.actionsSig) { this.updateActionAfford(); return; }
    this.actionsSig = sig;
    this.actionsEl.innerHTML = '';

    const addBtn = (art: string, label: string, opts: {
      cost?: string; cls?: string; onClick: () => void; key?: string;
    }) => {
      const btn = document.createElement('button');
      btn.className = 'act-btn ' + (opts.cls ?? '');
      btn.innerHTML = `${art}<span class="lbl">${label}</span>${opts.cost ? `<span class="cost">${opts.cost}</span>` : ''}`;
      if (opts.key) btn.dataset.key = opts.key;
      btn.onclick = opts.onClick;
      this.actionsEl.appendChild(btn);
      return btn;
    };

    if (vils.length > 0) {
      addBtn(icon('build', 22), 'Build', {
        cls: 'primary',
        onClick: () => {
          this.sound.button();
          this.setBuildSheet(!this.buildSheet.classList.contains('visible'));
        }
      });
    }
    if (workers.length > 0) {
      addBtn(icon('gather', 22), 'Gather', { onClick: () => this.input.gatherSelected() });
    }
    if (mil.length > 0) {
      addBtn(icon('attack', 22), 'Attack', {
        cls: this.input.mode === 'attackmove' ? 'toggled' : 'primary',
        onClick: () => { this.sound.button(); this.input.toggleAttackMove(); this.refreshSelectionUI(); }
      });
    }
    if (vils.length > 0 || mil.length > 0) {
      addBtn(icon('stop', 22), 'Stop', { onClick: () => { this.input.stopSelected(); this.refreshSelectionUI(); } });
    }
    if (mil.length > 0) {
      addBtn(icon('hold', 22), 'Hold', {
        cls: holdOn ? 'toggled' : '',
        onClick: () => { this.input.toggleHold(); this.refreshSelectionUI(); }
      });
    }
    if (carts.length > 0) {
      addBtn(icon('coinage', 22), 'Trade', {
        cls: 'primary',
        onClick: () => {
          // send the carts back to work via the nearest standing market
          let best: Building | undefined; let bestD = Infinity;
          const c = carts[0];
          for (const b of w.buildings.values()) {
            if (b.owner !== 0 || b.type !== 'market' || !b.built) continue;
            const d = (b.x - c.x) ** 2 + (b.z - c.z) ** 2;
            if (d < bestD) { bestD = d; best = b; }
          }
          if (best) {
            w.cmdTrade(carts.map(u => u.id), best.id);
            this.sound.command();
          } else {
            this.toast('Build a Market first', 'warn');
            this.sound.error();
          }
        }
      });
    }

    if (ownBld) {
      const b = ownBld;
      if (b.built) {
        for (const ut of trainableAt(p.faction, b.type, p.level)) {
          const def = UNITS[ut];
          addBtn(thumbImg(unitThumb(ut, p.faction), 'act-thumb'), def.short, {
            cost: costHtml(def.cost, 11),
            key: 'train:' + ut,
            onClick: () => {
              if (w.startTrain(b.id, ut)) this.sound.button(); else this.sound.error();
              this.updatePanelDynamic();
              this.updateActionAfford();
            }
          });
        }
        // Settlement growth lives at the town center
        if (b.type === 'towncenter' && p.level < MAX_LEVEL) {
          const next = SETTLEMENTS[p.level + 1];
          const queued = b.queue.some(q => q.kind === 'level');
          if (!queued) {
            addBtn(icon('age', 22), next.name, {
              cost: costHtml(next.cost, 11),
              cls: 'primary',
              key: 'level',
              onClick: () => {
                if (w.startLevelUp(b.id)) {
                  this.sound.research();
                  this.toast(`Growing into a ${next.name}`, 'good');
                } else this.sound.error();
                this.refreshSelectionUI();
              }
            });
          }
        }
        for (const tid in TECHS) {
          const tech = TECHS[tid];
          if (tech.at !== b.type) continue;
          if (p.techs.has(tid)) continue;
          if (p.level < tech.level) continue;
          if (b.queue.some(q => q.tech === tid)) continue;
          addBtn(icon(tech.icon, 22), tech.name.split(' ')[0], {
            cost: costHtml(tech.cost, 11),
            key: 'tech:' + tid,
            onClick: () => {
              if (w.startResearch(b.id, tid)) this.sound.button(); else this.sound.error();
              this.refreshSelectionUI();
            }
          });
        }
        // In-place upgrade (shrine -> temple)
        const upTo = BUILDINGS[b.type].upgradesTo;
        if (upTo && !b.queue.some(q => q.kind === 'upgrade') && p.level >= BUILDINGS[upTo].level) {
          addBtn(icon('upgrade', 22), BUILDINGS[upTo].name, {
            cost: costHtml(BUILDINGS[upTo].cost, 11),
            cls: 'primary',
            key: 'upg:' + upTo,
            onClick: () => {
              if (w.startUpgrade(b.id)) this.sound.research(); else this.sound.error();
              this.refreshSelectionUI();
            }
          });
        }
        // Market exchange
        if (b.type === 'market') {
          for (const r of ['wood', 'food', 'stone'] as ResType[]) {
            addBtn(icon(r, 20), 'Sell 100', {
              cost: `${icon('gold', 11)}+${MARKET_SELL_GOLD}`,
              key: 'sell:' + r,
              onClick: () => {
                if (w.marketTrade(0, r, 'sell')) this.sound.deposit(); else this.sound.error();
                this.updateActionAfford();
              }
            });
          }
          for (const r of ['wood', 'food'] as ResType[]) {
            addBtn(icon(r, 20), 'Buy 100', {
              cost: `${icon('gold', 11)}−${MARKET_BUY_GOLD}`,
              key: 'buy:' + r,
              onClick: () => {
                if (w.marketTrade(0, r, 'buy')) this.sound.deposit(); else this.sound.error();
                this.updateActionAfford();
              }
            });
          }
        }
        // Forum labor pool
        if (b.type === 'forum') {
          addBtn(icon('labor', 22), p.laborOn ? 'Labor: On' : 'Labor: Off', {
            cls: p.laborOn ? 'toggled' : 'primary',
            onClick: () => {
              p.laborOn = !p.laborOn;
              this.toast(
                p.laborOn ? 'Labor pool active — idle villagers find work' : 'Labor pool paused',
                p.laborOn ? 'good' : ''
              );
              this.sound.button();
              this.refreshSelectionUI();
            }
          });
          const presets: [string, Record<ResType, number>][] = [
            ['Balanced', { food: 0.4, wood: 0.3, gold: 0.2, stone: 0.1 }],
            ['Growth', { food: 0.5, wood: 0.4, gold: 0.05, stone: 0.05 }],
            ['Treasury', { food: 0.3, wood: 0.2, gold: 0.35, stone: 0.15 }]
          ];
          for (const [name, weights] of presets) {
            addBtn(icon('gather', 20), name, {
              onClick: () => {
                p.laborWeights = { ...weights };
                this.toast(`Labor focus: ${name}`, 'good');
                this.sound.button();
              }
            });
          }
        }
      }
      addBtn(icon('demolish', 22), b.built ? 'Demolish' : 'Cancel', {
        cls: 'danger',
        onClick: () => {
          this.sound.button();
          w.demolish(b.id);
          this.input.clearSelection();
        }
      });
    }
    if (vils.length === 0) this.setBuildSheet(false);
    this.updateActionAfford();
  }

  private updateActionAfford() {
    const w = this.world;
    const p = w.players[0];
    this.actionsEl.querySelectorAll('button[data-key]').forEach(btn => {
      const key = (btn as HTMLElement).dataset.key!;
      let ok = true;
      if (key.startsWith('train:')) {
        const def = UNITS[key.slice(6) as UnitTypeId];
        ok = w.canAfford(0, def.cost) && p.popUsed + def.pop <= p.popCap;
      } else if (key.startsWith('tech:')) {
        ok = w.canAfford(0, TECHS[key.slice(5)].cost);
      } else if (key === 'level') {
        ok = p.level < MAX_LEVEL && w.canAfford(0, SETTLEMENTS[p.level + 1].cost);
      } else if (key.startsWith('upg:')) {
        ok = w.canAfford(0, BUILDINGS[key.slice(4) as BuildingTypeId].cost);
      } else if (key.startsWith('sell:')) {
        ok = p.res[key.slice(5) as ResType] >= MARKET_LOT;
      } else if (key.startsWith('buy:')) {
        ok = p.res.gold >= MARKET_BUY_GOLD;
      }
      (btn as HTMLButtonElement).disabled = !ok;
    });
  }

  // ---------------- encounters ----------------
  /** Chips for active boons under the resource bar, with countdowns. */
  private updateBoons() {
    const w = this.world;
    const boons = w.players[0].boons;
    let html = '';
    for (const id in boons) {
      if (boons[id] <= w.time) continue;
      const def = BOONS[id];
      const left = boons[id] === Infinity ? '' : `<i>${fmtTime(boons[id] - w.time)}</i>`;
      html += `<span class="boon-chip" title="${def.desc}">${icon('check', 12)}${def.name}${left}</span>`;
    }
    if (this.boonsEl.innerHTML !== html) this.boonsEl.innerHTML = html;
  }

  /** The deserters' offer: shown while your units stand at an unprovoked camp. */
  private updateOffer() {
    const w = this.world;
    let offer: { siteId: number; count: number } | null = null;
    for (const site of w.sites) {
      if (site.kind !== 'camp' || site.state === 'cleared' || site.provokedBy === 0) continue;
      if (site.unitIds.length === 0) continue;
      let near = false;
      for (const u of w.units.values()) {
        if (u.owner === 0 && !u.water &&
            (u.x - site.x) ** 2 + (u.z - site.z) ** 2 < (ENC.offerR + 1) ** 2) { near = true; break; }
      }
      if (near) { offer = { siteId: site.id, count: site.unitIds.length }; break; }
    }
    const afford = w.players[0].res.gold >= ENC.mercPrice;
    const sig = offer ? `${offer.siteId}|${offer.count}|${afford}` : '';
    if (sig === this.offerSig) return;
    this.offerSig = sig;
    if (!offer) {
      this.offerEl.classList.remove('visible');
      return;
    }
    this.offerEl.classList.add('visible');
    this.offerEl.innerHTML =
      `<span>${icon('gold', 15)} Deserters offer their spears</span>
       <button class="hire" ${afford ? '' : 'disabled'}>
         Hire ${offer.count} — ${ENC.mercPrice} gold</button>`;
    const siteId = offer.siteId;
    (this.offerEl.querySelector('.hire') as HTMLButtonElement).onclick = () => {
      if (this.world.hireMercs(siteId)) {
        this.sound.research();
      } else {
        this.sound.error();
      }
      this.offerSig = '';
    };
  }

  // ---------------- toasts + events ----------------
  toast(msg: string, kind: 'warn' | 'good' | '' = '') {
    const t = document.createElement('div');
    t.className = 'toast ' + kind;
    const mark = kind === 'warn' ? icon('warn', 15) : kind === 'good' ? icon('check', 15) : '';
    t.innerHTML = `${mark}<span>${msg}</span>`;
    this.toastsEl.appendChild(t);
    while (this.toastsEl.children.length > 3) this.toastsEl.firstChild!.remove();
    setTimeout(() => t.classList.add('fadeout'), 2200);
    setTimeout(() => t.remove(), 2700);
  }

  handleEvents(events: SimEvent[]) {
    const w = this.world;
    for (const e of events) {
      switch (e.t) {
        case 'toast':
          if (e.owner === 0) {
            this.toast(e.msg, e.kind ?? 'warn');
            if (e.kind === 'warn') this.sound.error();
          }
          break;
        case 'underattack':
          if (w.time - this.lastWarnT > 14) {
            this.lastWarnT = w.time;
            this.toast('Your settlement is under attack!', 'warn');
          }
          this.minimap().ping(e.x, e.z, '#ff5544');
          break;
        case 'research':
          if (e.owner === 0) this.toast(`${TECHS[e.tech].name} researched`, 'good');
          break;
        case 'levelup':
          this.buildSig = '';
          this.actionsSig = '';
          if (e.owner === 1) this.toast(`The enemy settlement grows into a ${SETTLEMENTS[e.level].name}`, 'warn');
          break;
        case 'built':
          if (e.owner === 0) this.toast(`${BUILDINGS[e.bType].name} complete`, 'good');
          break;
        case 'upgrade':
          this.panelSig = '';
          this.actionsSig = '';
          break;
        case 'wonderStart':
          if (e.owner === 0) {
            this.toast('Your Wonder is complete — defend it!', 'good');
            this.sound.research();
          } else {
            this.toast('The enemy has raised a Wonder. Destroy it!', 'warn');
            this.sound.error();
          }
          break;
        case 'wonderEnd':
          if (e.destroyed) {
            this.toast(e.owner === 0 ? 'Your Wonder has fallen' : 'The enemy Wonder is rubble', e.owner === 0 ? 'warn' : 'good');
          }
          break;
        case 'ping':
          this.minimap().ping(e.x, e.z, e.color);
          break;
        case 'siteDiscovered': {
          const msg: Record<string, string> = {
            herd: e.variant === 1 ? 'Wild boar root in the thickets' : 'A herd of gazelle grazes nearby',
            den: 'A wolf den — its pack hunts these lands',
            camp: 'Deserters are camped here — swords for hire',
            cache: 'An old cairn — a villager could dig beneath it',
            refugees: 'Refugees hide here — lead them to your Town Center',
            relic: 'The Golden Idol! Carry it home to your Town Center'
          };
          this.toast(msg[e.kind], e.kind === 'den' ? 'warn' : 'good');
          this.minimap().ping(e.x, e.z, '#f0c05a');
          break;
        }
        case 'relic':
          if (e.phase === 'dropped') this.minimap().ping(e.x, e.z, '#f0c05a');
          break;
      }
    }
  }

  // ---------------- menu ----------------
  private openMenu() {
    this.cb.setPaused(true);
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.id = 'menu-modal';
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `<h2>Paused</h2>`;
    const mk = (art: string, label: string, fn: () => void, cls = '') => {
      const b = document.createElement('button');
      b.className = cls;
      b.innerHTML = `${art}<span>${label}</span>`;
      b.onclick = fn;
      modal.appendChild(b);
      return b;
    };
    mk(icon('play', 18), 'Resume', () => { this.sound.button(); this.closeMenu(); }, 'primary');
    const sndBtn = mk(icon(this.sound.muted ? 'mute' : 'sound', 18),
      this.sound.muted ? 'Sound: Off' : 'Sound: On', () => {
        this.sound.setMuted(!this.sound.muted);
        sndBtn.innerHTML = `${icon(this.sound.muted ? 'mute' : 'sound', 18)}<span>${this.sound.muted ? 'Sound: Off' : 'Sound: On'}</span>`;
        this.sound.button();
      });
    const edgeBtn = mk(icon('rally', 18), `Edge scroll: ${this.input.edgeScroll ? 'On' : 'Off'}`, () => {
      this.input.edgeScroll = !this.input.edgeScroll;
      edgeBtn.innerHTML = `${icon('rally', 18)}<span>Edge scroll: ${this.input.edgeScroll ? 'On' : 'Off'}</span>`;
      this.sound.button();
    });
    mk(icon('restart', 18), 'Restart Match', () => { this.closeMenu(); this.cb.onRestart(); });
    mk(icon('home', 18), 'Change Civilization', () => { this.closeMenu(); this.cb.onQuit(); });
    const tip = document.createElement('div');
    tip.className = 'menu-tip';
    tip.textContent = 'Tap units to select, tap ground to move, tap enemies to attack. Drag to pan, pinch to zoom. WASD or arrow keys scroll the camera (hold Shift to hurry).';
    modal.appendChild(tip);
    overlay.appendChild(modal);
    overlay.addEventListener('click', e => { if (e.target === overlay) this.closeMenu(); });
    this.root.appendChild(overlay);
    this.menuModal = overlay;
  }

  /** The tech tree screen, opened from the settlement chip. Pauses while it is up. */
  private openTechTree() {
    if (this.techTree) return;
    this.cb.setPaused(true);
    this.techTree = openTechTree(this.world, () => {
      this.techTree = null;
      this.cb.setPaused(false);
    });
    this.root.appendChild(this.techTree);
  }

  private closeMenu() {
    this.menuModal?.remove();
    this.menuModal = null;
    this.cb.setPaused(false);
  }

  // ---------------- per-frame ----------------
  update(dt: number) {
    this.refreshT -= dt;
    if (this.refreshT > 0) return;
    this.refreshT = 0.2;

    const w = this.world;
    const p = w.players[0];
    for (const r of RES_ORDER) this.resEls[r].textContent = fmtNum(p.res[r]);
    this.resEls.pop.textContent = `${p.popUsed}/${p.popCap}`;
    this.resEls.popChip.classList.toggle('full', p.popUsed >= p.popCap);

    const lvl = SETTLEMENTS[p.level];
    this.levelChip.querySelector('.lvl-badge')!.textContent = lvl.numeral;
    this.levelChip.querySelector('.lvl-name')!.textContent = lvl.name;
    this.levelChip.querySelector('.lvl-clock')!.textContent = fmtTime(w.time);

    const idle = w.idleVillagers(0).length;
    const badge = this.idleBtn.querySelector('.badge') as HTMLElement;
    badge.hidden = idle === 0;
    badge.textContent = String(idle);

    // wonder countdowns
    let wb = '';
    if (w.wonderT[0] >= 0) {
      wb += `<span class="ours">${icon('age', 15)} Wonder victory in <b>${fmtTime(w.wonderT[0])}</b></span>`;
    }
    if (w.wonderT[1] >= 0) {
      wb += `<span class="theirs">${icon('warn', 15)} Enemy Wonder — <b>${fmtTime(w.wonderT[1])}</b> to stop it</span>`;
    }
    this.wonderBanner.innerHTML = wb;
    this.wonderBanner.classList.toggle('visible', wb !== '');

    this.updateBoons();
    this.updateOffer();
    this.updateObjectives();
    this.renderPanel();
    this.renderActions();
    if (this.buildSheet.classList.contains('visible')) this.renderBuildSheet();
  }

  dispose() {
    this.menuModal?.remove();
    this.unbindFullscreen?.();
    this.root.innerHTML = '';
  }
}

function taskLabel(t: string): string {
  switch (t) {
    case 'gather': return 'Gathering';
    case 'farm': return 'Farming';
    case 'build': return 'Building';
    case 'attack': return 'Fighting';
    case 'move': return 'Moving';
    case 'deposit': return 'Hauling';
    default: return 'Idle';
  }
}
