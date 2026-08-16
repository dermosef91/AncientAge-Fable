// Ancient Age — entry point. Boots the faction select screen and runs matches.
import './styles.css';
import { DIFFICULTY, TICK } from './core/config';
import type { Difficulty, Faction } from './core/types';
import { pick, makeRng } from './core/utils';
import { AIController } from './sim/ai';
import { Encounters } from './sim/encounters';
import { genMap } from './sim/map';
import { simTick } from './sim/sim';
import { World } from './sim/world';
import { loadAssets } from './render/assets';
import { GameView } from './render/view';
import { Sound } from './audio/sound';
import { HUD } from './ui/hud';
import { InputController } from './ui/input';
import { Minimap } from './ui/minimap';
import { showEndScreen, showFactionSelect } from './ui/screens';

const app = document.getElementById('app')!;
const sound = new Sound();

let lastFaction: Faction = 'egypt';
let lastDifficulty: Difficulty = 'normal';

class Game {
  world: World;
  view: GameView;
  input: InputController;
  hud: HUD;
  minimap: Minimap;
  ai: AIController;
  encounters: Encounters;
  paused = false;
  timescale = 1;
  private raf = 0;
  private lastT = 0;
  private acc = 0;
  private minimapT = 0;
  private fogT = 0;
  private ended = false;
  private disposed = false;
  enemyFaction: Faction;

  constructor(public faction: Faction, public difficulty: Difficulty) {
    app.innerHTML = '';
    const canvas = document.createElement('canvas');
    canvas.id = 'game-canvas';
    app.appendChild(canvas);
    const ui = document.createElement('div');
    ui.id = 'ui';
    app.appendChild(ui);

    const rng = makeRng(Date.now() % 100000);
    this.enemyFaction = pick(rng, (['egypt', 'greece', 'rome'] as Faction[]).filter(f => f !== faction));
    this.world = new World(faction, this.enemyFaction, DIFFICULTY[difficulty].aiGatherMul);
    genMap(this.world, 1 + Math.floor(rng() * 0x7fffffff), faction, this.enemyFaction);
    this.ai = new AIController(this.world, difficulty);
    this.encounters = new Encounters(this.world);

    this.view = new GameView(this.world, canvas);
    this.input = new InputController(this.world, this.view, sound, canvas);

    const mmWrap = document.createElement('div');
    mmWrap.id = 'minimap-wrap';
    ui.appendChild(mmWrap);
    this.minimap = new Minimap(mmWrap, this.world, this.view, this.view.terrain.minimapCanvas);

    this.hud = new HUD(this.world, this.view, this.input, sound, () => this.minimap, {
      onRestart: () => restart(this.faction, this.difficulty),
      onQuit: () => quitToMenu(),
      setPaused: p => { this.paused = p; }
    });

    window.addEventListener('resize', this.onResize);
    document.addEventListener('visibilitychange', this.onVis);

    // opening toasts
    setTimeout(() => {
      if (this.disposed) return;
      this.hud.toast(`Scouts report ${this.enemyFaction.charAt(0).toUpperCase() + this.enemyFaction.slice(1)} nearby — prepare your defenses!`, 'warn');
    }, 2500);

    this.lastT = performance.now();
    this.loop(this.lastT);
  }

  private onResize = () => this.view.onResize();
  private onVis = () => {
    // drop accumulated time so returning to the tab doesn't fast-forward
    this.acc = 0;
    this.lastT = performance.now();
  };

  /** Advance the simulation by whole ticks and fan out events. */
  stepSim(seconds: number) {
    const n = Math.max(1, Math.round(seconds / TICK));
    for (let i = 0; i < n; i++) {
      simTick(this.world, TICK);
      this.ai.step(TICK);
      this.encounters.step(TICK);
    }
    this.fanOutEvents();
  }

  private fanOutEvents() {
    const events = this.world.drainEvents();
    if (events.length) {
      this.view.handleEvents(events);
      this.hud.handleEvents(events);
      sound.handleEvents(events, (x, z) => this.world.isExploredWorld(x, z));
      for (const e of events) {
        if (e.t === 'victory' && !this.ended) this.endMatch(e.winner === 0);
      }
    }
  }

  private loop = (t: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const rdt = Math.min(0.1, (t - this.lastT) / 1000);
    this.lastT = t;

    if (!this.paused && !this.ended) {
      this.acc += rdt * this.timescale;
      let ticks = 0;
      while (this.acc >= TICK && ticks < 8 * this.timescale) {
        simTick(this.world, TICK);
        this.ai.step(TICK);
        this.encounters.step(TICK);
        this.acc -= TICK;
        ticks++;
      }
      if (this.acc > TICK) this.acc = 0; // dropped frames: don't spiral
    }
    this.fanOutEvents();

    this.input.validateSelection();
    if (!this.paused) {
      this.input.updateEdgePan(rdt);
      this.input.updateKeyPan(rdt);
    }
    const alpha = Math.max(0, Math.min(1, this.acc / TICK));
    this.view.update(alpha, rdt, t / 1000);
    this.hud.update(rdt);

    this.minimapT -= rdt;
    if (this.minimapT <= 0) {
      this.minimapT = 0.25;
      this.minimap.update(0.25);
    }
    this.fogT -= rdt;
    if (this.fogT <= 0) {
      this.fogT = 0.6;
      this.view.terrain.updateFog();
    }
  };

  private endMatch(won: boolean) {
    this.ended = true;
    if (won) sound.victory(); else sound.defeat();
    const enemyName = this.enemyFaction.charAt(0).toUpperCase() + this.enemyFaction.slice(1);
    setTimeout(() => {
      if (this.disposed) return;
      showEndScreen(
        document.getElementById('ui')!, sound, won, this.world.time,
        this.world.players[0].stats, enemyName,
        () => restart(this.faction, this.difficulty),
        () => quitToMenu(),
        this.world.victoryReason
      );
    }, 1600);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('visibilitychange', this.onVis);
    this.input.dispose();
    this.hud.dispose();
    this.view.dispose();
    app.innerHTML = '';
  }
}

let game: Game | null = null;

function restart(faction: Faction, difficulty: Difficulty) {
  game?.dispose();
  game = new Game(faction, difficulty);
  exposeDebug();
}

function quitToMenu() {
  game?.dispose();
  game = null;
  boot();
}

function boot() {
  app.innerHTML = '';
  const ui = document.createElement('div');
  ui.id = 'ui';
  app.appendChild(ui);
  showFactionSelect(
    ui, sound,
    { faction: lastFaction, difficulty: lastDifficulty },
    (f, d) => {
      lastFaction = f;
      lastDifficulty = d;
      restart(f, d);
    },
    assetLoad
  );
}

// Models stream in while the player is choosing a civilization.
const assetLoad = loadAssets();
assetLoad.catch(() => { /* the game falls back to procedural art */ });

// Debug hooks for automated testing (not exposed in UI)
function exposeDebug() {
  (window as unknown as Record<string, unknown>).__aa = {
    get game() { return game; },
    get world() { return game?.world; },
    setTimescale(x: number) { if (game) game.timescale = x; },
    step(seconds: number) { game?.stepSim(seconds); },
    give(this: void) {
      if (!game) return;
      const r = game.world.players[0].res;
      r.food += 1000; r.wood += 1000; r.stone += 1000; r.gold += 1000;
    },
    reveal() {
      if (!game) return;
      game.world.explored.fill(1);
      game.view.terrain.updateFog();
    },
    win() {
      if (!game) return;
      for (const b of game.world.buildings.values()) {
        if (b.owner === 1 && b.type === 'towncenter') game.world.destroyBuilding(b, 0);
      }
    },
    lose() {
      if (!game) return;
      for (const b of game.world.buildings.values()) {
        if (b.owner === 0 && b.type === 'towncenter') game.world.destroyBuilding(b, 1);
      }
    }
  };
}

boot();
