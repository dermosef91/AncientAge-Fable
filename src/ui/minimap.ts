// Minimap: terrain base + fog + entity dots + camera frustum, tappable.
import { MAP_H, MAP_W } from '../core/config';
import type { World } from '../sim/world';
import type { GameView } from '../render/view';

export class Minimap {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private pings: { x: number; z: number; color: string; t: number }[] = [];
  private scale: number;
  private dragging = false;

  constructor(
    container: HTMLElement,
    private world: World,
    private view: GameView,
    private base: HTMLCanvasElement
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'minimap';
    const px = 256;
    this.canvas.width = px;
    this.canvas.height = px;
    this.scale = px / MAP_W;
    container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;

    const moveCam = (e: PointerEvent) => {
      const r = this.canvas.getBoundingClientRect();
      const mx = ((e.clientX - r.left) / r.width) * MAP_W;
      const mz = ((e.clientY - r.top) / r.height) * MAP_H;
      this.view.camTarget.set(mx, mz);
    };
    this.canvas.addEventListener('pointerdown', e => {
      e.stopPropagation();
      this.dragging = true;
      this.canvas.setPointerCapture(e.pointerId);
      moveCam(e);
    });
    this.canvas.addEventListener('pointermove', e => {
      if (this.dragging) moveCam(e);
    });
    this.canvas.addEventListener('pointerup', () => { this.dragging = false; });
  }

  ping(x: number, z: number, color: string) {
    this.pings.push({ x, z, color, t: 0 });
  }

  update(dt: number) {
    const ctx = this.ctx;
    const s = this.scale;
    const w = this.world;
    ctx.drawImage(this.base, 0, 0, this.canvas.width, this.canvas.height);

    // fog
    ctx.fillStyle = 'rgba(8,8,14,0.82)';
    const exp = w.explored;
    const cell = s;
    for (let z = 0; z < MAP_H; z += 2) {
      for (let x = 0; x < MAP_W; x += 2) {
        if (!exp[z * MAP_W + x] && !exp[z * MAP_W + Math.min(MAP_W - 1, x + 1)] &&
            !exp[Math.min(MAP_H - 1, z + 1) * MAP_W + x]) {
          ctx.fillRect(x * cell, z * cell, cell * 2, cell * 2);
        }
      }
    }

    // resource dots (explored only)
    for (const n of w.nodes.values()) {
      if (!exp[Math.floor(n.z) * MAP_W + Math.floor(n.x)]) continue;
      ctx.fillStyle = n.kind === 'tree' ? '#3e6b2e' :
        n.kind === 'gold' ? '#e8c15a' :
        n.kind === 'stone' ? '#a8a8a0' :
        n.kind === 'berries' ? '#b04a3a' : '#7fd4dc';
      ctx.fillRect(n.x * s - 1.4, n.z * s - 1.4, 2.8, 2.8);
    }
    // buildings
    for (const b of w.buildings.values()) {
      if (b.owner !== 0 && !exp[Math.floor(b.z) * MAP_W + Math.floor(b.x)]) continue;
      ctx.fillStyle = b.owner === 0 ? '#7fe89a' : '#f06a55';
      const sz = Math.max(3, b.size * s);
      ctx.fillRect(b.x * s - sz / 2, b.z * s - sz / 2, sz, sz);
    }
    // trading post: a gold diamond once scouted
    const tp = w.tradePost;
    const diamond = (x: number, z: number, r: number, fill: string) => {
      ctx.save();
      ctx.translate(x * s, z * s);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = fill;
      ctx.fillRect(-r, -r, r * 2, r * 2);
      ctx.strokeStyle = 'rgba(42,31,12,0.9)';
      ctx.lineWidth = 1;
      ctx.strokeRect(-r, -r, r * 2, r * 2);
      ctx.restore();
    };
    if (tp && exp[Math.floor(tp.z) * MAP_W + Math.floor(tp.x)]) {
      diamond(tp.x, tp.z, 2.6, '#f0c05a');
    }
    // encounter sites still worth a march: smaller gold diamonds.
    // Egypt's cartographers have the lot of them down before anyone walks there.
    const charted = w.players[0].techs.has('cartography');
    for (const site of w.sites) {
      // Egypt's Cartography charts the wilds without walking them.
      if ((!site.discovered && !charted) || site.state === 'cleared') continue;
      if (site.kind === 'village') {
        // a free people: a small ring, filled by whoever they pay
        const fill = site.holder === 0 ? '#7fe89a'
          : site.holder === 1 ? '#f06a55'
          : site.taxedBy === 0 ? '#bfe6c6'
          : site.taxedBy === 1 ? '#e6a99c'
          : '#e8dcbc';
        ctx.beginPath();
        ctx.arc(site.x * s, site.z * s, 3, 0, Math.PI * 2);
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.strokeStyle = 'rgba(42,31,12,0.9)';
        ctx.lineWidth = 1.1;
        ctx.stroke();
        continue;
      }
      if (site.kind === 'landmark') {
        // the one landmark, and it is drawn like nothing else on the map
        const held = site.holder === 0 ? '#9dffc0' : site.holder === 1 ? '#ff9a86' : '#ffe08a';
        ctx.save();
        ctx.translate(site.x * s, site.z * s);
        ctx.fillStyle = held;
        ctx.strokeStyle = 'rgba(42,31,12,0.9)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
          const a = -Math.PI / 2 + (i / 5) * Math.PI * 2;
          const a2 = a + Math.PI / 5;
          ctx.lineTo(Math.cos(a) * 4.2, Math.sin(a) * 4.2);
          ctx.lineTo(Math.cos(a2) * 1.9, Math.sin(a2) * 1.9);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        continue;
      }
      if (site.kind === 'outpost') {
        // a fort is a hold, not an errand: square, and coloured by who has it
        const fill = site.holder === 0 ? '#7fe89a' : site.holder === 1 ? '#f06a55' : '#cfc3a4';
        ctx.fillStyle = fill;
        ctx.fillRect(site.x * s - 2.6, site.z * s - 2.6, 5.2, 5.2);
        ctx.strokeStyle = 'rgba(42,31,12,0.9)';
        ctx.lineWidth = 1.2;
        ctx.strokeRect(site.x * s - 2.6, site.z * s - 2.6, 5.2, 5.2);
        if (site.capture > 0) {
          ctx.fillStyle = site.claimant === 0 ? '#eafff0' : '#ff8872';
          ctx.fillRect(site.x * s - 2.6, site.z * s + 2.6, 5.2 * site.capture, 1.4);
        }
        continue;
      }
      diamond(site.x, site.z, 1.9, site.kind === 'relic' ? '#ffe08a' : '#d8a94e');
    }
    // units
    for (const u of w.units.values()) {
      if (u.owner !== 0 && !exp[Math.floor(u.z) * MAP_W + Math.floor(u.x)]) continue;
      ctx.fillStyle = u.owner === 0 ? '#eafff0' : u.owner === 1 ? '#ff8872' : '#d9c493';
      ctx.fillRect(u.x * s - 1.2, u.z * s - 1.2, 2.4, 2.4);
    }

    // pings
    for (let i = this.pings.length - 1; i >= 0; i--) {
      const p = this.pings[i];
      p.t += dt;
      if (p.t > 2.4) { this.pings.splice(i, 1); continue; }
      const k = (p.t % 0.8) / 0.8;
      ctx.strokeStyle = p.color;
      ctx.globalAlpha = 1 - k;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x * s, p.z * s, 3 + k * 9, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // camera frustum
    const r = this.view.canvas.getBoundingClientRect();
    const corners = [
      this.view.screenToGround(r.left, r.top),
      this.view.screenToGround(r.right, r.top),
      this.view.screenToGround(r.right, r.bottom),
      this.view.screenToGround(r.left, r.bottom)
    ];
    if (corners.every(c => c)) {
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      corners.forEach((c, i) => {
        const px = c!.x * s, pz = c!.z * s;
        if (i === 0) ctx.moveTo(px, pz); else ctx.lineTo(px, pz);
      });
      ctx.closePath();
      ctx.stroke();
    }
  }
}
