// ============================================================
// PixelPal — Visitor (a friend pet drops by to say hi)
// ============================================================
// A lightweight guest window: a random-breed friend walks in from a
// screen edge toward the resident pet, waves & greets, then leaves.
// No FSM / needs / persistence — just a scripted little visit. It
// moves its own window via the window:move-self IPC.
// ============================================================

import { PetRenderer } from './engine/renderer';
import { BREED_REGISTRY } from '../shared/constants';
import type { PetSpecies } from '../shared/types';

const WIN_H = 350;
const GREETINGS = [
  '你好呀~',
  '来找你的小宝贝玩啦！',
  '嗨，最近过得好吗？',
  '听说这儿住着只可爱的小家伙~',
  '路过来打个招呼！',
  '一起玩会儿嘛~',
];

const params = new URLSearchParams(location.search);
const bx = Number(params.get('bx') || 0);          // meeting window x
const by = Number(params.get('by') || 0);          // meeting window y
const sx = Number(params.get('sx') || 0);          // start window x
const species = (params.get('species') || 'cat') as PetSpecies;
const breedId = params.get('breed') || '';
const facingRightDefault = params.get('right') === '1'; // entering from right → face left

let renderer: PetRenderer;
let winX = sx;
let phase: 'enter' | 'greet' | 'leave' = 'enter';
let greetUntil = 0;
let last = 0;
let raf = 0;

document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('visitor-canvas') as HTMLCanvasElement;
  if (!canvas) return;
  renderer = new PetRenderer(canvas);
  renderer.species = species;
  const breed = BREED_REGISTRY.find((b) => b.id === breedId);
  if (breed) renderer.breedColors = breed.colors;
  renderer.play('walk');

  last = performance.now();
  raf = requestAnimationFrame(loop);
});

function loop(now: number): void {
  const dt = Math.min(64, now - last);
  last = now;

  // Face the direction of travel.
  let facingRight = facingRightDefault;

  if (phase === 'enter') {
    const dx = bx - winX;
    facingRight = dx >= 0;
    const step = 90 * (dt / 1000); // ~90 px/s walk
    if (Math.abs(dx) <= step) {
      winX = bx;
      phase = 'greet';
      greetUntil = now + 3600;
      renderer.play('interact-pet'); // a little wave
      showBubble(GREETINGS[Math.floor(Math.random() * GREETINGS.length)]);
    } else {
      winX += Math.sign(dx) * step;
    }
    moveSelf();
  } else if (phase === 'greet') {
    if (now >= greetUntil) {
      phase = 'leave';
      hideBubble();
      renderer.play('walk');
    }
  } else { // leave
    const dx = sx - winX;
    facingRight = dx >= 0;
    const step = 110 * (dt / 1000); // hustle off a touch faster
    winX += Math.sign(dx) * step;
    moveSelf();
    if (Math.abs(sx - winX) <= step) {
      cancelAnimationFrame(raf);
      window.close();
      return;
    }
  }

  renderer.update(dt);
  renderer.render(facingRight);
  raf = requestAnimationFrame(loop);
}

function moveSelf(): void {
  window.pixelpal.moveSelf({ x: Math.round(winX), y: Math.round(by) });
}

function showBubble(text: string): void {
  const el = document.getElementById('v-bubble');
  if (!el) return;
  el.textContent = text;
  el.classList.add('show');
}
function hideBubble(): void {
  document.getElementById('v-bubble')?.classList.remove('show');
}

// Safety: never linger more than ~20s even if something stalls.
setTimeout(() => { try { window.close(); } catch { /* ignore */ } }, 20000);

// Keep WIN_H referenced (layout constant, used by main when sizing).
void WIN_H;
