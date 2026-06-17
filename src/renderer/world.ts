// ============================================================
// PixelPal — World overlay renderer (desktop poop)
// ============================================================
// Runs inside world.html — a full-work-area transparent overlay.
// It draws the pet's poop at absolute desktop positions and lets the
// user click a poop to clean it.  Repaints ONLY when the poop list
// changes (driven by the main process), so it is idle-cheap.
// ============================================================

import type { WorldPoop } from '../shared/types';

interface WorldPayload {
  poops: WorldPoop[];
  origin: { x: number; y: number };
  size: { w: number; h: number };
}

let canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;
let origin = { x: 0, y: 0 };
let poops: WorldPoop[] = [];
/** Screen-local bounding boxes for hit-testing, parallel to `poops`. */
let boxes: Array<{ id: string; cx: number; cy: number; r: number }> = [];

const POOP_W = 30;
const POOP_H = 26;

document.addEventListener('DOMContentLoaded', () => {
  canvas = document.getElementById('world-canvas') as HTMLCanvasElement;
  const c = canvas.getContext('2d');
  if (!c) return;
  ctx = c;

  // Receive poop updates from the main process.
  window.pixelpal.onWorldPoops((payload: WorldPayload) => {
    origin = payload.origin;
    poops = payload.poops || [];
    resize(payload.size.w, payload.size.h);
    render();
  });

  // Hover → toggle interactivity so a poop can be clicked.
  let lastInteractive = false;
  canvas.addEventListener('mousemove', (e) => {
    const hit = hitTest(e.clientX, e.clientY);
    const interactive = hit !== null;
    if (interactive !== lastInteractive) {
      lastInteractive = interactive;
      window.pixelpal.worldSetInteractive(interactive);
      canvas.style.cursor = interactive ? 'pointer' : 'default';
    }
  });

  // Click a poop → clean it.
  canvas.addEventListener('click', (e) => {
    const hit = hitTest(e.clientX, e.clientY);
    if (hit) {
      spawnSparkle(e.clientX, e.clientY);
      window.pixelpal.worldRemovePoop(hit);
      window.pixelpal.worldSetInteractive(false);
    }
  });
});

function resize(w: number, h: number): void {
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
  }
}

function hitTest(px: number, py: number): string | null {
  for (const b of boxes) {
    const dx = px - b.cx;
    const dy = py - b.cy;
    if (dx * dx + dy * dy <= b.r * b.r) return b.id;
  }
  return null;
}

function render(): void {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  boxes = [];

  for (const p of poops) {
    const lx = Math.round(p.x - origin.x);
    const ly = Math.round(p.y - origin.y);
    drawPoop(lx, ly);
    boxes.push({ id: p.id, cx: lx, cy: ly - POOP_H / 2, r: POOP_W / 2 + 4 });
  }
}

/**
 * Draw a cute pixel-art poop pile centred horizontally on (x) with
 * its base at (y).  Three brown swirl tiers + two dot eyes + smile.
 */
function drawPoop(x: number, y: number): void {
  const dark = '#6B4423';
  const mid = '#8B5A2B';
  const light = '#A06A35';
  const px = (xx: number, yy: number, w: number, h: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(xx), Math.round(yy), w, h);
  };

  // soft shadow on the desktop
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.beginPath();
  ctx.ellipse(x, y - 1, POOP_W / 2 + 2, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  const left = x - POOP_W / 2;
  // Bottom tier (widest)
  px(left, y - 9, POOP_W, 8, mid);
  px(left + 2, y - 10, POOP_W - 4, 2, light);
  // Middle tier
  px(left + 5, y - 16, POOP_W - 10, 8, mid);
  px(left + 7, y - 17, POOP_W - 14, 2, light);
  // Top swirl
  px(x - 6, y - 22, 12, 7, mid);
  px(x - 4, y - 23, 8, 2, light);
  px(x - 2, y - 26, 5, 4, mid);
  // outline shading on the right/bottom
  px(left, y - 2, POOP_W, 1, dark);
  px(left + POOP_W - 1, y - 9, 1, 8, dark);

  // cute face
  ctx.fillStyle = '#3A2414';
  ctx.fillRect(x - 5, y - 13, 2, 2); // left eye
  ctx.fillRect(x + 3, y - 13, 2, 2); // right eye
  // smile
  ctx.fillRect(x - 3, y - 9, 1, 1);
  ctx.fillRect(x - 2, y - 8, 4, 1);
  ctx.fillRect(x + 2, y - 9, 1, 1);
}

/** A quick fading sparkle when a poop is cleaned. */
function spawnSparkle(x: number, y: number): void {
  let frame = 0;
  const tick = () => {
    frame++;
    ctx.clearRect(x - 20, y - 20, 40, 40);
    if (frame > 8) {
      render();
      return;
    }
    ctx.fillStyle = `rgba(255,220,120,${1 - frame / 8})`;
    for (let i = 0; i < 4; i++) {
      const a = (Math.PI / 2) * i + frame * 0.3;
      const r = frame * 2.5;
      ctx.fillRect(x + Math.cos(a) * r - 1, y + Math.sin(a) * r - 1, 3, 3);
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
