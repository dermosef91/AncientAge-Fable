// Input: touch + mouse. Tap select/command, drag pan, pinch zoom,
// building placement, desktop box-select and right-click commands.
import { BUILDINGS, SELECT_MAX } from '../core/config';
import type { BuildingTypeId, Unit } from '../core/types';
import { clamp } from '../core/utils';
import type { Sound } from '../audio/sound';
import { landPassable } from '../sim/pathfinding';
import type { World } from '../sim/world';
import type { GameView } from '../render/view';

export type InputMode = 'normal' | 'place' | 'attackmove';

interface PointerInfo { x: number; y: number; startX: number; startY: number; t: number; moved: boolean; type: string; button: number }

export class InputController {
  selection: number[] = [];
  mode: InputMode = 'normal';
  placeType: BuildingTypeId | null = null;
  placeRot = 0;
  onChange: () => void = () => { };
  onPlaced: (type: BuildingTypeId) => void = () => { };

  private pointers = new Map<number, PointerInfo>();
  private pinchStart = 0;
  private pinchStartDist = 0;
  private lastTapT = 0;
  private lastTapId = 0;
  /** True once the player has tapped a spot in placement mode; gates confirm-on-second-tap
   *  so the very first tap (which may coincide with a hover-positioned ghost on desktop)
   *  always just positions the ghost instead of instantly building. */
  private placeTapped = false;
  private hoverGround: { x: number; z: number } | null = null;
  private selectRectEl: HTMLDivElement;
  private boxStart: { x: number; y: number } | null = null;
  private disposed = false;
  // desktop edge scrolling
  private mouseX = -1;
  private mouseY = -1;
  private mouseSeen = false;
  edgeScroll = true;
  private idleCycle = 0;
  /** Physical key codes currently held for camera panning (WASD / arrows). */
  private panKeys = new Set<string>();

  constructor(
    private world: World,
    private view: GameView,
    private sound: Sound,
    private canvas: HTMLCanvasElement
  ) {
    this.selectRectEl = document.createElement('div');
    this.selectRectEl.id = 'select-rect';
    document.getElementById('ui')!.appendChild(this.selectRectEl);

    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('pointercancel', this.onUp);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    canvas.addEventListener('contextmenu', this.onCtx);
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('pointermove', this.onWindowMove);
    window.addEventListener('pointerleave', this.onWindowLeave);
    window.addEventListener('blur', this.onWindowLeave);
  }

  dispose() {
    this.disposed = true;
    this.canvas.removeEventListener('pointerdown', this.onDown);
    this.canvas.removeEventListener('pointermove', this.onMove);
    this.canvas.removeEventListener('pointerup', this.onUp);
    this.canvas.removeEventListener('pointercancel', this.onUp);
    this.canvas.removeEventListener('wheel', this.onWheel);
    this.canvas.removeEventListener('contextmenu', this.onCtx);
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('pointermove', this.onWindowMove);
    window.removeEventListener('pointerleave', this.onWindowLeave);
    window.removeEventListener('blur', this.onWindowLeave);
    this.selectRectEl.remove();
  }

  // ---------------- desktop edge scrolling ----------------
  private onWindowMove = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') { this.mouseSeen = false; return; }
    this.mouseSeen = true;
    this.mouseX = e.clientX;
    this.mouseY = e.clientY;
  };
  private onWindowLeave = () => { this.mouseSeen = false; this.panKeys.clear(); };

  /** Pan the camera when the mouse rests against a screen edge. */
  updateEdgePan(dt: number) {
    if (!this.edgeScroll || !this.mouseSeen || this.pointers.size > 0) return;
    const w = window.innerWidth, h = window.innerHeight;
    const band = Math.max(18, Math.min(34, w * 0.035));
    let dx = 0, dy = 0;
    if (this.mouseX <= band) dx = -(1 - this.mouseX / band);
    else if (this.mouseX >= w - band) dx = 1 - (w - this.mouseX) / band;
    if (this.mouseY <= band) dy = -(1 - this.mouseY / band);
    else if (this.mouseY >= h - band) dy = 1 - (h - this.mouseY) / band;
    if (dx === 0 && dy === 0) return;
    // Ease in so a grazing cursor doesn't jerk the view
    const ease = (v: number) => Math.sign(v) * v * v;
    const speed = 1250 * dt;
    this.panByScreenDelta(-ease(dx) * speed, -ease(dy) * speed);
  }

  /** Pan the camera from held WASD / arrow keys. */
  updateKeyPan(dt: number) {
    if (this.panKeys.size === 0) return;
    const held = (...codes: string[]) => codes.some(c => this.panKeys.has(c));
    let dx = 0, dy = 0;
    if (held('KeyW', 'ArrowUp')) dy += 1;
    if (held('KeyS', 'ArrowDown')) dy -= 1;
    if (held('KeyA', 'ArrowLeft')) dx += 1;
    if (held('KeyD', 'ArrowRight')) dx -= 1;
    if (dx === 0 && dy === 0) return;
    // normalize so diagonals aren't faster
    const len = Math.hypot(dx, dy);
    const speed = (this.panKeys.has('ShiftLeft') || this.panKeys.has('ShiftRight') ? 2200 : 1100) * dt;
    this.panByScreenDelta((dx / len) * speed, (dy / len) * speed);
  }

  // ---------------- public API ----------------
  enterPlacement(type: BuildingTypeId) {
    this.mode = 'place';
    this.placeType = type;
    this.placeRot = 0;
    this.hoverGround = null;
    this.placeTapped = false;
    this.updateGhost();
    this.onChange();
  }
  cancelPlacement() {
    this.mode = 'normal';
    this.placeType = null;
    this.view.ghost = null;
    this.onChange();
  }

  /** Quarter-turn the pending building (visual only — footprints are square). */
  rotatePlacement() {
    if (this.mode !== 'place') return;
    this.placeRot = (this.placeRot + 1) % 4;
    this.sound.button();
    this.updateGhost();
  }

  /** Raise the building at the ghost's current spot. Returns success. */
  confirmPlacement(): boolean {
    if (this.mode !== 'place' || !this.placeType) return false;
    const g = this.view.ghost;
    if (!g) return false;
    const b = this.world.tryPlaceBuilding(0, this.placeType, g.cx, g.cz, this.placeRot);
    if (!b) {
      this.sound.error();
      return false;
    }
    const vils = this.ownVillagerIds();
    if (vils.length) this.world.cmdBuild(vils, b.id);
    this.sound.command();
    this.onPlaced(this.placeType);
    if (this.placeType === 'wall') this.updateGhost();
    else this.cancelPlacement();
    return true;
  }
  toggleAttackMove() {
    this.mode = this.mode === 'attackmove' ? 'normal' : 'attackmove';
    this.onChange();
  }
  clearSelection() {
    this.selection = [];
    this.syncSelection();
    this.onChange();
  }
  select(ids: number[]) {
    this.selection = ids.slice(0, SELECT_MAX);
    this.syncSelection();
    this.onChange();
  }
  selectAllMilitary() {
    const ids: number[] = [];
    for (const u of this.world.units.values()) {
      if (u.owner === 0 && u.type !== 'villager' && u.type !== 'boat' && u.type !== 'scout') {
        ids.push(u.id);
      }
    }
    if (ids.length) {
      this.sound.select();
      this.select(ids);
      // center camera on the army
      let cx = 0, cz = 0;
      for (const id of ids) { const u = this.world.units.get(id)!; cx += u.x; cz += u.z; }
      this.view.camTarget.set(cx / ids.length, cz / ids.length);
    }
  }
  centerOnTC() {
    const tc = this.world.tcPos[0];
    this.view.camTarget.set(tc.x, tc.z + 2);
  }

  /** Remove dead entities from selection. Called each frame. */
  validateSelection() {
    const w = this.world;
    const before = this.selection.length;
    this.selection = this.selection.filter(id =>
      w.units.has(id) || w.buildings.has(id) || w.nodes.has(id));
    if (this.selection.length !== before) {
      this.syncSelection();
      this.onChange();
    }
  }

  private syncSelection() {
    this.view.selection.clear();
    for (const id of this.selection) this.view.selection.add(id);
  }

  ownUnits(): Unit[] {
    const out: Unit[] = [];
    for (const id of this.selection) {
      const u = this.world.units.get(id);
      if (u && u.owner === 0) out.push(u);
    }
    return out;
  }
  ownMilitaryIds(): number[] {
    return this.ownUnits()
      .filter(u => u.type !== 'villager' && u.type !== 'boat' && u.type !== 'scout')
      .map(u => u.id);
  }
  ownVillagerIds(): number[] {
    return this.ownUnits().filter(u => u.type === 'villager').map(u => u.id);
  }
  ownScoutIds(): number[] {
    return this.ownUnits().filter(u => u.type === 'scout').map(u => u.id);
  }

  /** Send the selected scouts off to walk the frontier on their own. */
  exploreSelected(): boolean {
    const ids = this.ownScoutIds();
    if (ids.length === 0) return false;
    const ok = this.world.cmdExplore(ids);
    if (ok) this.sound.command();
    return ok;
  }

  stopSelected() {
    const w = this.world;
    for (const u of this.ownUnits()) {
      w.releaseTask(u);
      u.exploring = false;
      u.task = { type: 'idle' };
      u.path = null;
      u.resume = null;
      u.post = { x: u.x, z: u.z };
    }
    this.sound.button();
  }

  /** Toggle hold-position for the selection. */
  toggleHold(): boolean {
    const ids = this.ownUnits().filter(u => u.type !== 'boat').map(u => u.id);
    if (ids.length === 0) return false;
    const state = this.world.cmdHold(ids);
    this.sound.button();
    return state;
  }

  holdActive(): boolean {
    const units = this.ownUnits().filter(u => u.type !== 'boat');
    return units.length > 0 && units.every(u => u.hold);
  }

  /** Send selected workers to the nearest sensible resource. */
  gatherSelected() {
    const ids = this.ownUnits()
      .filter(u => u.type === 'villager' || u.type === 'boat')
      .map(u => u.id);
    if (ids.length === 0) return;
    this.world.cmdAutoGather(ids);
    this.sound.command();
    for (const id of ids.slice(0, 4)) {
      const u = this.world.units.get(id);
      if (u && u.task.type === 'gather') {
        const n = this.world.nodes.get(u.task.nodeId);
        if (n) this.view.markers.ping(n.x, 0.08, n.z, 'move');
      }
    }
  }

  /** Jump to (and select) the next villager with nothing to do. */
  selectIdleVillager(): boolean {
    const ids = this.world.idleVillagers(0);
    if (ids.length === 0) return false;
    this.idleCycle = (this.idleCycle + 1) % ids.length;
    const u = this.world.units.get(ids[this.idleCycle]);
    if (!u) return false;
    this.select([u.id]);
    this.view.camTarget.set(u.x, u.z);
    this.sound.select();
    return true;
  }

  // ---------------- events ----------------
  private onDown = (e: PointerEvent) => {
    this.canvas.setPointerCapture(e.pointerId);
    this.sound.unlock();
    this.pointers.set(e.pointerId, {
      x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY,
      t: performance.now(), moved: false, type: e.pointerType, button: e.button
    });
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinchStartDist = Math.hypot(a.x - b.x, a.y - b.y);
      this.pinchStart = this.view.camDist;
    }
    if (e.pointerType === 'mouse' && e.button === 0 && this.mode === 'normal') {
      this.boxStart = { x: e.clientX, y: e.clientY };
    }
  };

  private onMove = (e: PointerEvent) => {
    const p = this.pointers.get(e.pointerId);
    // hover ghost on desktop / while dragging in placement
    if (this.mode === 'place') {
      const g = this.view.screenToGround(e.clientX, e.clientY);
      if (g) { this.hoverGround = g; this.updateGhost(); }
    }
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    if (Math.hypot(e.clientX - p.startX, e.clientY - p.startY) > 9) p.moved = true;

    if (this.pointers.size === 2) {
      // pinch zoom + two-finger pan
      const pts = [...this.pointers.values()];
      const other = pts.find(q => q !== p)!;
      p.x = e.clientX; p.y = e.clientY;
      const d = Math.hypot(p.x - other.x, p.y - other.y);
      if (this.pinchStartDist > 0) {
        this.view.camDist = clamp(this.pinchStart * (this.pinchStartDist / d), 13, 54);
      }
      this.panByScreenDelta(dx / 2, dy / 2);
      return;
    }

    const isPanDrag =
      (p.type === 'touch' && p.moved && this.mode !== 'place') ||
      (p.type === 'mouse' && (p.button === 1 || p.button === 2) && p.moved);

    if (isPanDrag) {
      this.panByScreenDelta(dx, dy);
    }
    // touch drag in place mode: move the ghost
    if (p.type === 'touch' && this.mode === 'place' && p.moved) {
      const g = this.view.screenToGround(e.clientX, e.clientY);
      if (g) { this.hoverGround = g; this.updateGhost(); }
    }
    p.x = e.clientX; p.y = e.clientY;

    // desktop box select rect
    if (this.boxStart && p.type === 'mouse' && p.button === 0 && p.moved && this.mode === 'normal') {
      const r = this.selectRectEl;
      const x0 = Math.min(this.boxStart.x, e.clientX), y0 = Math.min(this.boxStart.y, e.clientY);
      r.style.display = 'block';
      r.style.left = x0 + 'px';
      r.style.top = y0 + 'px';
      r.style.width = Math.abs(e.clientX - this.boxStart.x) + 'px';
      r.style.height = Math.abs(e.clientY - this.boxStart.y) + 'px';
    }
  };

  private onUp = (e: PointerEvent) => {
    const p = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    this.selectRectEl.style.display = 'none';
    if (!p) return;

    // finish box select
    if (this.boxStart && p.type === 'mouse' && p.button === 0) {
      const bw = Math.abs(e.clientX - this.boxStart.x), bh = Math.abs(e.clientY - this.boxStart.y);
      if (bw > 14 && bh > 14 && p.moved) {
        this.boxSelect(this.boxStart.x, this.boxStart.y, e.clientX, e.clientY);
        this.boxStart = null;
        return;
      }
      this.boxStart = null;
    }

    const dt = performance.now() - p.t;
    if (!p.moved && dt < 420 && e.button !== 2) {
      this.handleTap(e.clientX, e.clientY);
    }
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.view.camDist = clamp(this.view.camDist + e.deltaY * 0.03, 13, 54);
  };

  private onCtx = (e: MouseEvent) => {
    e.preventDefault();
    if (this.mode === 'place') { this.cancelPlacement(); return; }
    this.handleCommandAt(e.clientX, e.clientY);
  };

  /** Keys that scroll the view; tracked by physical position so ZQSD layouts work too. */
  private static PAN_CODES = new Set([
    'KeyW', 'KeyA', 'KeyS', 'KeyD',
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
    'ShiftLeft', 'ShiftRight'
  ]);

  private onKey = (e: KeyboardEvent) => {
    const el = document.activeElement;
    const typing = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ||
      (el instanceof HTMLElement && el.isContentEditable);
    if (!typing && !e.ctrlKey && !e.metaKey && !e.altKey && InputController.PAN_CODES.has(e.code)) {
      this.panKeys.add(e.code);
      if (e.code.startsWith('Arrow')) e.preventDefault(); // arrows would scroll the page
    }
    if (e.key === 'Escape') {
      if (this.mode !== 'normal') this.cancelPlacement();
      else this.clearSelection();
    }
    if (this.mode === 'place') {
      if (e.key === 'r' || e.key === 'R') this.rotatePlacement();
      if (e.key === 'Enter') this.confirmPlacement();
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.panKeys.delete(e.code);
  };

  private panByScreenDelta(dx: number, dy: number) {
    // convert two screen points to ground and shift camera by their world delta
    const c = this.canvas.getBoundingClientRect();
    const a = this.view.screenToGround(c.width / 2, c.height / 2);
    const b = this.view.screenToGround(c.width / 2 + dx, c.height / 2 + dy);
    if (a && b) {
      this.view.camTarget.x -= (b.x - a.x);
      this.view.camTarget.y -= (b.z - a.z);
    }
  }

  private updateGhost() {
    if (this.mode !== 'place' || !this.placeType) { this.view.ghost = null; return; }
    const g = this.hoverGround ?? this.centerGround();
    if (!g) return;
    const size = BUILDINGS[this.placeType].size;
    const cx = this.placeType === 'causeway' ? Math.floor(g.x) : Math.round(g.x - size / 2);
    const cz = this.placeType === 'causeway' ? Math.floor(g.z) : Math.round(g.z - size / 2);
    const afford = this.world.canAfford(0, this.world.buildingCost(0, this.placeType));
    // A causeway is scenery, not a building: it only asks for open ground.
    const ok = this.placeType === 'causeway'
      ? afford && landPassable(this.world.grid, cx, cz) && this.world.isExploredWorld(cx + 0.5, cz + 0.5)
      : afford && this.world.canPlace(0, this.placeType, cx, cz).ok;
    this.view.ghost = { type: this.placeType, cx, cz, ok, rot: this.placeRot };
  }

  private centerGround(): { x: number; z: number } | null {
    const r = this.canvas.getBoundingClientRect();
    return this.view.screenToGround(r.width / 2, r.height / 2);
  }

  // ---------------- tap logic ----------------
  private handleTap(x: number, y: number) {
    const w = this.world;

    if (this.mode === 'place' && this.placeType) {
      const g = this.view.screenToGround(x, y);
      if (!g) return;
      this.hoverGround = g;
      if (this.placeType === 'wall') {
        // walls stay rapid-fire: every tap drops a segment
        const cx = Math.round(g.x - 0.5);
        const cz = Math.round(g.z - 0.5);
        const b = w.tryPlaceBuilding(0, 'wall', cx, cz);
        if (b) {
          const vils = this.ownVillagerIds();
          if (vils.length) w.cmdBuild(vils, b.id);
          this.onPlaced('wall');
        } else {
          this.sound.error();
        }
        this.updateGhost();
        return;
      }
      if (this.placeType === 'causeway') {
        // stone goes down under the feet at once — no foundation, no builder
        const cx = Math.floor(g.x), cz = Math.floor(g.z);
        if (w.layCauseway(0, cx, cz)) {
          this.sound.place();
          this.onPlaced('causeway');
        } else {
          this.sound.error();
        }
        this.updateGhost();
        return;
      }
      // other buildings: a tap positions the ghost; tapping that same spot again confirms it
      const size = BUILDINGS[this.placeType].size;
      const cx = Math.round(g.x - size / 2);
      const cz = Math.round(g.z - size / 2);
      const ghost = this.view.ghost;
      if (this.placeTapped && ghost && ghost.cx === cx && ghost.cz === cz) {
        this.confirmPlacement();
        return;
      }
      this.placeTapped = true;
      this.updateGhost();
      this.onChange();
      return;
    }

    if (this.mode === 'attackmove') {
      const g = this.view.screenToGround(x, y);
      if (g) {
        const ids = [...this.ownMilitaryIds(), ...this.ownVillagerIds()];
        const mil = this.ownMilitaryIds();
        w.cmdMove(mil.length ? mil : ids, g.x, g.z, true);
        this.view.markers.ping(g.x, 0.08, g.z, 'attack');
        this.sound.command();
      }
      this.mode = 'normal';
      this.onChange();
      return;
    }

    const hit = this.view.pickEntity(x, y);
    if (hit) {
      this.handleEntityTap(hit);
      return;
    }
    const g = this.view.screenToGround(x, y);
    if (!g) return;
    // ground tap: move selected own units, or set rally for selected building
    const own = this.ownUnits();
    if (own.length > 0) {
      w.cmdMove(own.map(u => u.id), g.x, g.z, false);
      this.view.markers.ping(g.x, 0.08, g.z, 'move');
      this.sound.command();
      return;
    }
    if (this.selection.length === 1) {
      const b = w.buildings.get(this.selection[0]);
      if (b && b.owner === 0 && BUILDINGS[b.type].trains) {
        w.setRally(b.id, g.x, g.z);
        this.view.markers.ping(g.x, 0.08, g.z, 'move');
        this.sound.button();
        return;
      }
    }
  }

  private handleEntityTap(hit: { kind: 'unit' | 'building' | 'node'; id: number }) {
    const w = this.world;
    const now = performance.now();
    const own = this.ownUnits();
    const milIds = this.ownMilitaryIds();
    const vilIds = this.ownVillagerIds();

    if (hit.kind === 'unit') {
      const u = w.units.get(hit.id)!;
      if (u.owner === 0) {
        // double-tap: select all of the same type
        if (this.lastTapId === hit.id && now - this.lastTapT < 380) {
          const ids: number[] = [];
          for (const o of w.units.values()) {
            if (o.owner === 0 && o.type === u.type) ids.push(o.id);
          }
          this.select(ids);
        } else {
          this.select([hit.id]);
        }
        this.sound.select();
      } else {
        // enemy unit
        if (milIds.length || vilIds.length) {
          w.cmdAttack(milIds.length ? milIds : vilIds, hit.id);
          this.view.markers.ping(u.x, 0.1, u.z, 'attack');
          this.sound.command();
        } else {
          this.select([hit.id]);
          this.sound.select();
        }
      }
    } else if (hit.kind === 'building') {
      const b = w.buildings.get(hit.id)!;
      if (b.owner === 0) {
        if (vilIds.length && !b.built) {
          w.cmdBuild(vilIds, b.id);
          this.view.markers.ping(b.x, 0.1, b.z, 'move');
          this.sound.command();
        } else if (vilIds.length && BUILDINGS[b.type].farm && b.built && (!b.workerId || !w.units.has(b.workerId))) {
          w.cmdFarm([vilIds[0]], b.id);
          this.view.markers.ping(b.x, 0.1, b.z, 'move');
          this.sound.command();
        } else if (vilIds.length && b.built && b.hp < b.maxHp - 1) {
          w.cmdBuild(vilIds, b.id);
          this.view.markers.ping(b.x, 0.1, b.z, 'move');
          this.sound.command();
        } else {
          this.select([hit.id]);
          this.sound.select();
        }
      } else {
        if (milIds.length || vilIds.length) {
          w.cmdAttack(milIds.length ? milIds : vilIds, hit.id);
          this.view.markers.ping(b.x, 0.1, b.z, 'attack');
          this.sound.command();
        } else {
          this.select([hit.id]);
          this.sound.select();
        }
      }
    } else {
      const n = w.nodes.get(hit.id)!;
      const boats = own.filter(u => u.type === 'boat').map(u => u.id);
      if (n.kind === 'fish' && boats.length) {
        w.cmdGather(boats, n.id);
        this.view.markers.ping(n.x, 0.1, n.z, 'move');
        this.sound.command();
      } else if (n.kind !== 'fish' && vilIds.length) {
        w.cmdGather(vilIds, n.id);
        this.view.markers.ping(n.x, 0.1, n.z, 'move');
        this.sound.command();
      } else if (own.length) {
        w.cmdMove(own.map(u => u.id), n.x, n.z);
        this.view.markers.ping(n.x, 0.1, n.z, 'move');
        this.sound.command();
      } else {
        this.select([hit.id]);
        this.sound.select();
      }
    }
    this.lastTapT = now;
    this.lastTapId = hit.id;
  }

  /** Desktop right-click: command without changing selection. */
  private handleCommandAt(x: number, y: number) {
    const w = this.world;
    const own = this.ownUnits();
    if (own.length === 0) return;
    const hit = this.view.pickEntity(x, y);
    const milIds = this.ownMilitaryIds();
    const vilIds = this.ownVillagerIds();
    if (hit) {
      if (hit.kind === 'unit' || hit.kind === 'building') {
        const ent = hit.kind === 'unit' ? w.units.get(hit.id) : w.buildings.get(hit.id);
        if (!ent) return;
        const owner = (ent as { owner: number }).owner;
        if (owner !== 0) {
          w.cmdAttack(milIds.length ? milIds : vilIds, hit.id);
          this.sound.command();
          return;
        }
        if (hit.kind === 'building') {
          const b = w.buildings.get(hit.id)!;
          if (vilIds.length && (!b.built || b.hp < b.maxHp - 1)) { w.cmdBuild(vilIds, b.id); this.sound.command(); return; }
          if (vilIds.length && BUILDINGS[b.type].farm && !b.workerId) { w.cmdFarm([vilIds[0]], b.id); this.sound.command(); return; }
        }
      } else {
        const n = w.nodes.get(hit.id)!;
        const boats = own.filter(u => u.type === 'boat').map(u => u.id);
        if (n.kind === 'fish' && boats.length) { w.cmdGather(boats, n.id); this.sound.command(); return; }
        if (n.kind !== 'fish' && vilIds.length) { w.cmdGather(vilIds, n.id); this.sound.command(); return; }
      }
    }
    const g = this.view.screenToGround(x, y);
    if (g) {
      w.cmdMove(own.map(u => u.id), g.x, g.z);
      this.view.markers.ping(g.x, 0.08, g.z, 'move');
      this.sound.command();
    }
  }

  private boxSelect(x0: number, y0: number, x1: number, y1: number) {
    const w = this.world;
    const minX = Math.min(x0, x1), maxX = Math.max(x0, x1);
    const minY = Math.min(y0, y1), maxY = Math.max(y0, y1);
    const mil: number[] = [];
    const all: number[] = [];
    for (const u of w.units.values()) {
      if (u.owner !== 0) continue;
      const s = this.view.worldToScreen(u.x, 0.5, u.z);
      if (s.x >= minX && s.x <= maxX && s.y >= minY && s.y <= maxY) {
        all.push(u.id);
        if (u.type !== 'villager' && u.type !== 'boat' && u.type !== 'scout') mil.push(u.id);
      }
    }
    const pick = mil.length > 0 ? mil : all;
    if (pick.length > 0) {
      this.select(pick);
      this.sound.select();
    }
  }
}
