// ============================================================
// PixelPal — Multi-species pixel art drawers
// ============================================================
// Each function draws a single 32×32 frame for a given species.
// All drawing uses ctx.fillRect for crisp pixel art.
// ============================================================

import type { BreedColors, PetSpecies } from '../../shared/types';

type SpeciesDrawFn = (
  ctx: CanvasRenderingContext2D,
  c: BreedColors,
  frame: number,
  state: string,
) => void;

// Helper: draw a filled rect
function r(ctx: CanvasRenderingContext2D, color: string, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

// Helper: draw a single pixel
function p(ctx: CanvasRenderingContext2D, color: string, x: number, y: number) {
  r(ctx, color, x, y, 1, 1);
}

// Helper: draw eyes (2 pixels)
function eyes(ctx: CanvasRenderingContext2D, c: BreedColors, lx: number, ly: number, rx: number, ry: number, open = true) {
  if (open) {
    p(ctx, c.eye, lx, ly); p(ctx, c.eye, rx, ry);
  } else {
    r(ctx, c.eye, lx, ly, 2, 1); r(ctx, c.eye, rx, ry, 2, 1);
  }
}

// ============================================================
// DOG (狗)
// ============================================================
const drawDog: SpeciesDrawFn = (ctx, c, frame, state) => {
  const bounce = state === 'walk' ? (frame % 2 === 0 ? 0 : -1) : 0;
  const tailWag = state === 'walk' || state === 'idle' ? (frame % 3 === 0 ? 1 : -1) : 0;
  const bx = 8, by = 12 + bounce; // body top-left

  // Body (wider than cat)
  r(ctx, c.body, bx, by + 2, 14, 8);
  r(ctx, c.belly, bx + 3, by + 4, 8, 5);

  // Legs
  const legOff = state === 'walk' ? (frame % 2 === 0 ? [0, 1, 1, 0] : [1, 0, 0, 1]) : [0, 0, 0, 0];
  r(ctx, c.body, bx + 1, by + 10 + legOff[0], 3, 5);
  r(ctx, c.body, bx + 4, by + 10 + legOff[1], 3, 5);
  r(ctx, c.body, bx + 9, by + 10 + legOff[2], 3, 5);
  r(ctx, c.body, bx + 12, by + 10 + legOff[3], 3, 5);
  // Paws
  r(ctx, c.bodyDark, bx + 1, by + 14 + legOff[0], 3, 1);
  r(ctx, c.bodyDark, bx + 4, by + 14 + legOff[1], 3, 1);
  r(ctx, c.bodyDark, bx + 9, by + 14 + legOff[2], 3, 1);
  r(ctx, c.bodyDark, bx + 12, by + 14 + legOff[3], 3, 1);

  // Tail (wags)
  r(ctx, c.body, bx + 13, by + 2 + tailWag, 3, 2);
  r(ctx, c.body, bx + 15, by + 1 + tailWag, 2, 2);

  // Head
  const hx = 5, hy = by - 3;
  r(ctx, c.body, hx, hy, 10, 8);
  // Snout
  r(ctx, c.body, hx - 1, hy + 4, 4, 3);
  p(ctx, c.nose, hx - 1, hy + 5);
  // Floppy ears
  r(ctx, c.ear, hx - 1, hy + 1, 3, 5);
  r(ctx, c.earInner, hx, hy + 2, 2, 3);
  r(ctx, c.ear, hx + 8, hy + 1, 3, 5);
  r(ctx, c.earInner, hx + 8, hy + 2, 2, 3);

  // Eyes
  const sleepy = state === 'sleep' || state === 'daydream';
  eyes(ctx, c, hx + 2, hy + 3, hx + 6, hy + 3, !sleepy);

  // Sleep overlay
  if (state === 'sleep') {
    r(ctx, c.body, hx + 1, hy + 2, 8, 1); // close eyes line
    p(ctx, c.bodyDark, hx + 9, hy - 1); p(ctx, c.bodyDark, hx + 11, hy - 2);
    p(ctx, c.bodyDark, hx + 10, hy - 3); // Zzz
  }
};

// ============================================================
// RABBIT (兔)
// ============================================================
const drawRabbit: SpeciesDrawFn = (ctx, c, frame, state) => {
  const hop = state === 'walk' ? Math.abs(Math.sin(frame * 0.8)) * -3 : 0;
  const earTwitch = state === 'idle' ? (frame % 4 === 0 ? 1 : 0) : 0;
  const bx = 9, by = 10 + hop;

  // Body (round)
  r(ctx, c.body, bx, by + 4, 12, 10);
  r(ctx, c.body, bx + 1, by + 3, 10, 12);
  r(ctx, c.belly, bx + 3, by + 6, 6, 7);

  // Tail (puffball)
  r(ctx, c.belly, bx + 12, by + 8, 3, 3);

  // Legs
  if (state !== 'sleep') {
    r(ctx, c.body, bx + 1, by + 14, 3, 4);
    r(ctx, c.body, bx + 4, by + 14, 3, 3);
    r(ctx, c.body, bx + 7, by + 14, 4, 4); // big back leg
    r(ctx, c.bodyDark, bx + 1, by + 17, 3, 1);
    r(ctx, c.bodyDark, bx + 7, by + 17, 4, 1);
  }

  // Head
  const hx = bx + 1, hy = by - 2;
  r(ctx, c.body, hx, hy, 9, 7);
  // Cheeks
  r(ctx, c.belly, hx + 1, hy + 4, 3, 2);
  r(ctx, c.belly, hx + 5, hy + 4, 3, 2);
  // Nose
  p(ctx, c.nose, hx + 4, hy + 4);

  // TALL EARS (defining feature!)
  r(ctx, c.body, hx + 1, hy - 10 + earTwitch, 3, 10);
  r(ctx, c.earInner, hx + 2, hy - 9 + earTwitch, 1, 8);
  r(ctx, c.body, hx + 5, hy - 10 + earTwitch, 3, 10);
  r(ctx, c.earInner, hx + 6, hy - 9 + earTwitch, 1, 8);

  // Eyes
  eyes(ctx, c, hx + 2, hy + 2, hx + 6, hy + 2, state !== 'sleep');

  if (state === 'sleep') {
    r(ctx, c.body, bx, by + 4, 12, 8); // curled body
    r(ctx, c.body, bx + 2, by + 3, 8, 10);
  }
};

// ============================================================
// SHEEP (羊)
// ============================================================
const drawSheep: SpeciesDrawFn = (ctx, c, frame, state) => {
  const jiggle = state === 'walk' ? (frame % 2 === 0 ? 1 : 0) : 0;
  const bx = 5, by = 8;

  // Wool body (cloud shape)
  r(ctx, c.body, bx + 1, by + 3 + jiggle, 18, 10);
  r(ctx, c.body, bx, by + 5 + jiggle, 20, 6);
  r(ctx, c.body, bx + 2, by + 2 + jiggle, 4, 2); // wool bump
  r(ctx, c.body, bx + 8, by + 1 + jiggle, 4, 3); // wool bump
  r(ctx, c.body, bx + 14, by + 2 + jiggle, 4, 2); // wool bump
  r(ctx, c.body, bx + 3, by + 13 + jiggle, 3, 2); // bottom bump
  r(ctx, c.body, bx + 10, by + 13 + jiggle, 4, 2); // bottom bump

  // Thin legs below wool
  r(ctx, c.bodyDark, bx + 3, by + 14, 2, 5);
  r(ctx, c.bodyDark, bx + 7, by + 14, 2, 5);
  r(ctx, c.bodyDark, bx + 12, by + 14, 2, 5);
  r(ctx, c.bodyDark, bx + 16, by + 14, 2, 5);
  // Hooves
  r(ctx, c.nose, bx + 3, by + 18, 2, 1);
  r(ctx, c.nose, bx + 7, by + 18, 2, 1);
  r(ctx, c.nose, bx + 12, by + 18, 2, 1);
  r(ctx, c.nose, bx + 16, by + 18, 2, 1);

  // Small head poking out front
  const hx = bx - 2, hy = by + 4;
  r(ctx, c.bodyDark, hx, hy, 6, 6);
  r(ctx, c.ear, hx - 1, hy + 1, 2, 3); // left ear
  r(ctx, c.ear, hx + 5, hy + 1, 2, 3); // right ear
  eyes(ctx, c, hx + 1, hy + 2, hx + 4, hy + 2, state !== 'sleep');
  p(ctx, c.nose, hx + 2, hy + 4);

  if (state === 'sleep') {
    // Wool cloud curled up
    r(ctx, c.body, bx + 2, by + 6, 16, 8);
    r(ctx, c.body, bx + 4, by + 5, 12, 10);
  }
};

// ============================================================
// COW (牛)
// ============================================================
const drawCow: SpeciesDrawFn = (ctx, c, frame, state) => {
  const bx = 4, by = 8;
  const sway = state === 'walk' ? (frame % 2 === 0 ? 0 : 1) : 0;

  // Large body
  r(ctx, c.body, bx, by + 3 + sway, 20, 10);
  r(ctx, c.belly, bx + 4, by + 6 + sway, 12, 5);
  // Spots (accent color)
  if (c.accent) {
    r(ctx, c.accent, bx + 3, by + 4 + sway, 4, 3);
    r(ctx, c.accent, bx + 10, by + 5 + sway, 5, 4);
    r(ctx, c.accent, bx + 15, by + 3 + sway, 3, 3);
  }

  // Legs (sturdy)
  r(ctx, c.body, bx + 2, by + 13, 3, 6);
  r(ctx, c.body, bx + 6, by + 13, 3, 6);
  r(ctx, c.body, bx + 13, by + 13, 3, 6);
  r(ctx, c.body, bx + 17, by + 13, 3, 6);
  r(ctx, c.bodyDark, bx + 2, by + 18, 3, 1);
  r(ctx, c.bodyDark, bx + 6, by + 18, 3, 1);
  r(ctx, c.bodyDark, bx + 13, by + 18, 3, 1);
  r(ctx, c.bodyDark, bx + 17, by + 18, 3, 1);

  // Tail with tuft
  r(ctx, c.body, bx + 19, by + 4, 2, 1);
  r(ctx, c.body, bx + 20, by + 5, 1, 4);
  r(ctx, c.bodyDark, bx + 20, by + 8, 2, 2);

  // Head (wide, with horns)
  const hx = bx - 2, hy = by;
  r(ctx, c.body, hx, hy + 2, 9, 7);
  // Horns
  r(ctx, c.accent || '#D4A373', hx, hy, 2, 3);
  r(ctx, c.accent || '#D4A373', hx + 7, hy, 2, 3);
  // Ears
  r(ctx, c.ear, hx - 1, hy + 3, 2, 2);
  r(ctx, c.ear, hx + 8, hy + 3, 2, 2);
  // Snout
  r(ctx, c.belly, hx + 2, hy + 6, 5, 3);
  p(ctx, c.nose, hx + 3, hy + 7); p(ctx, c.nose, hx + 5, hy + 7);
  eyes(ctx, c, hx + 2, hy + 4, hx + 6, hy + 4, state !== 'sleep');
};

// ============================================================
// RODENT (鼠类)
// ============================================================
const drawRodent: SpeciesDrawFn = (ctx, c, frame, state) => {
  const jitter = state === 'walk' ? (frame % 3 - 1) : 0;
  const bx = 10, by = 14 + (state === 'walk' ? (frame % 2 === 0 ? -1 : 0) : 0);

  // Small round body
  r(ctx, c.body, bx, by + 2, 10, 8);
  r(ctx, c.body, bx + 1, by + 1, 8, 10);
  r(ctx, c.belly, bx + 2, by + 4, 6, 5);

  // Big cheeks (defining feature!)
  const puff = state === 'idle' ? (frame % 3 === 0 ? 1 : 0) : 0;
  r(ctx, c.body, bx - 1 - puff, by + 3, 3, 4);
  r(ctx, c.body, bx + 8 + puff, by + 3, 3, 4);

  // Tiny legs
  r(ctx, c.body, bx + 1, by + 10, 2, 3);
  r(ctx, c.body, bx + 7, by + 10, 2, 3);

  // Head
  const hx = bx + 1, hy = by - 3;
  r(ctx, c.body, hx, hy, 8, 6);
  // Big round ears
  r(ctx, c.ear, hx - 1, hy - 2, 3, 3);
  r(ctx, c.earInner, hx, hy - 1, 2, 2);
  r(ctx, c.ear, hx + 6, hy - 2, 3, 3);
  r(ctx, c.earInner, hx + 6, hy - 1, 2, 2);
  p(ctx, c.nose, hx + 4, hy + 3);
  eyes(ctx, c, hx + 2, hy + 2, hx + 5, hy + 2, state !== 'sleep');

  // Long tail
  r(ctx, c.accent || c.bodyDark, bx + 10, by + 6, 1, 1);
  r(ctx, c.accent || c.bodyDark, bx + 11, by + 5, 1, 1);
  r(ctx, c.accent || c.bodyDark, bx + 12, by + 4, 1, 1);
  r(ctx, c.accent || c.bodyDark, bx + 13, by + 4 + jitter, 1, 1);
};

// ============================================================
// BIRD (鸟)
// ============================================================
const drawBird: SpeciesDrawFn = (ctx, c, frame, state) => {
  const hop = state === 'walk' ? (frame % 2 === 0 ? 0 : -2) : 0;
  const wingFlap = state === 'idle' ? (frame % 3 === 0 ? -1 : 0) : (frame % 2 === 0 ? -2 : 0);
  const bx = 10, by = 10 + hop;

  // Body (round)
  r(ctx, c.body, bx, by + 4, 10, 8);
  r(ctx, c.body, bx + 1, by + 3, 8, 10);
  r(ctx, c.belly, bx + 2, by + 6, 6, 5);

  // Wings
  r(ctx, c.accent || c.body, bx - 2, by + 4 + wingFlap, 3, 5);
  r(ctx, c.accent || c.body, bx + 9, by + 4 + wingFlap, 3, 5);

  // Tail feathers
  r(ctx, c.accent || c.body, bx + 9, by + 10, 4, 2);
  r(ctx, c.accent2 || c.bodyDark, bx + 10, by + 11, 3, 2);

  // Thin legs
  r(ctx, c.bodyDark, bx + 3, by + 13, 1, 4);
  r(ctx, c.bodyDark, bx + 6, by + 13, 1, 4);
  // Claws
  r(ctx, c.bodyDark, bx + 2, by + 16, 3, 1);
  r(ctx, c.bodyDark, bx + 5, by + 16, 3, 1);

  // Head
  const hx = bx + 1, hy = by - 2;
  r(ctx, c.body, hx, hy, 8, 6);
  // Beak
  r(ctx, c.accent || '#FF9900', hx - 2, hy + 3, 3, 2);
  r(ctx, c.accent || '#FF9900', hx - 1, hy + 4, 2, 1);
  // Crest (for cockatiel etc.)
  if (c.accent2) {
    r(ctx, c.accent2, hx + 3, hy - 2, 2, 3);
  }
  eyes(ctx, c, hx + 2, hy + 2, hx + 5, hy + 2, state !== 'sleep');
};

// ============================================================
// FOX (狐狸)
// ============================================================
const drawFox: SpeciesDrawFn = (ctx, c, frame, state) => {
  const sway = state === 'walk' ? (frame % 2 === 0 ? 0 : -1) : 0;
  const tailSway = (frame % 4 < 2) ? 1 : -1;
  const bx = 8, by = 11 + sway;

  // Sleek body
  r(ctx, c.body, bx, by + 2, 12, 8);
  r(ctx, c.belly, bx + 2, by + 4, 8, 5);

  // Legs
  const legOff = state === 'walk' ? (frame % 2 === 0 ? [0, 1, 1, 0] : [1, 0, 0, 1]) : [0, 0, 0, 0];
  r(ctx, c.bodyDark, bx + 1, by + 10 + legOff[0], 2, 5);
  r(ctx, c.bodyDark, bx + 4, by + 10 + legOff[1], 2, 5);
  r(ctx, c.bodyDark, bx + 8, by + 10 + legOff[2], 2, 5);
  r(ctx, c.bodyDark, bx + 11, by + 10 + legOff[3], 2, 5);

  // HUGE BUSHY TAIL (defining feature!)
  r(ctx, c.body, bx + 11, by + 1 + tailSway, 4, 5);
  r(ctx, c.body, bx + 14, by + tailSway, 4, 4);
  r(ctx, c.body, bx + 17, by + 1 + tailSway, 3, 3);
  r(ctx, c.belly, bx + 18, by + 2 + tailSway, 2, 2); // white tip

  // Head (pointed snout)
  const hx = bx - 3, hy = by - 3;
  r(ctx, c.body, hx, hy, 9, 7);
  // Pointed snout
  r(ctx, c.body, hx - 3, hy + 3, 4, 3);
  p(ctx, c.nose, hx - 3, hy + 4);
  // Big pointed ears
  r(ctx, c.body, hx, hy - 3, 3, 4);
  r(ctx, c.earInner, hx + 1, hy - 2, 1, 2);
  r(ctx, c.body, hx + 6, hy - 3, 3, 4);
  r(ctx, c.earInner, hx + 7, hy - 2, 1, 2);
  eyes(ctx, c, hx + 2, hy + 2, hx + 5, hy + 2, state !== 'sleep');
};

// ============================================================
// DEER (鹿)
// ============================================================
const drawDeer: SpeciesDrawFn = (ctx, c, frame, state) => {
  const sway = state === 'walk' ? (frame % 2 === 0 ? 0 : -1) : 0;
  const bx = 8, by = 8 + sway;

  // Slender body
  r(ctx, c.body, bx, by + 4, 12, 8);
  r(ctx, c.belly, bx + 2, by + 6, 8, 4);
  // Spots (accent color)
  if (c.accent) {
    p(ctx, c.accent, bx + 3, by + 5); p(ctx, c.accent, bx + 6, by + 6);
    p(ctx, c.accent, bx + 9, by + 5); p(ctx, c.accent, bx + 5, by + 8);
  }

  // LONG legs (defining feature!)
  const legOff = state === 'walk' ? (frame % 2 === 0 ? [0, 1, 1, 0] : [1, 0, 0, 1]) : [0, 0, 0, 0];
  r(ctx, c.body, bx + 1, by + 12 + legOff[0], 2, 8);
  r(ctx, c.body, bx + 4, by + 12 + legOff[1], 2, 8);
  r(ctx, c.body, bx + 8, by + 12 + legOff[2], 2, 8);
  r(ctx, c.body, bx + 11, by + 12 + legOff[3], 2, 8);
  r(ctx, c.bodyDark, bx + 1, by + 19 + legOff[0], 2, 1);
  r(ctx, c.bodyDark, bx + 4, by + 19 + legOff[1], 2, 1);
  r(ctx, c.bodyDark, bx + 8, by + 19 + legOff[2], 2, 1);
  r(ctx, c.bodyDark, bx + 11, by + 19 + legOff[3], 2, 1);

  // Head (narrow)
  const hx = bx - 2, hy = by;
  r(ctx, c.body, hx, hy + 1, 7, 6);
  r(ctx, c.body, hx - 1, hy + 4, 3, 2); // snout
  p(ctx, c.nose, hx - 1, hy + 5);
  // Ears
  r(ctx, c.ear, hx - 1, hy, 2, 2);
  r(ctx, c.ear, hx + 5, hy, 2, 2);

  // ANTLERS (accent color, defining feature!)
  const antlerColor = c.accent || '#D4A373';
  r(ctx, antlerColor, hx + 1, hy - 3, 1, 4);
  r(ctx, antlerColor, hx, hy - 4, 1, 2);
  r(ctx, antlerColor, hx + 2, hy - 4, 1, 2);
  r(ctx, antlerColor, hx + 4, hy - 3, 1, 4);
  r(ctx, antlerColor, hx + 3, hy - 4, 1, 2);
  r(ctx, antlerColor, hx + 5, hy - 4, 1, 2);

  eyes(ctx, c, hx + 1, hy + 3, hx + 4, hy + 3, state !== 'sleep');

  // Short tail
  r(ctx, c.body, bx + 12, by + 4, 2, 2);
};

// ============================================================
// PANDA (熊猫)
// ============================================================
const drawPanda: SpeciesDrawFn = (ctx, c, frame, state) => {
  const waddle = state === 'walk' ? (frame % 2 === 0 ? -1 : 1) : 0;
  const bx = 6 + waddle, by = 8;

  // Very round body
  r(ctx, c.body, bx, by + 3, 16, 12);
  r(ctx, c.body, bx + 1, by + 2, 14, 14);
  r(ctx, c.belly, bx + 4, by + 6, 8, 7);

  // Short thick legs (dark)
  r(ctx, c.bodyDark, bx + 2, by + 15, 4, 4);
  r(ctx, c.bodyDark, bx + 10, by + 15, 4, 4);
  r(ctx, c.bodyDark, bx + 2, by + 18, 4, 1);
  r(ctx, c.bodyDark, bx + 10, by + 18, 4, 1);

  // Dark arms
  r(ctx, c.bodyDark, bx, by + 6, 3, 5);
  r(ctx, c.bodyDark, bx + 13, by + 6, 3, 5);

  // Head
  const hx = bx + 3, hy = by - 3;
  r(ctx, c.body, hx, hy, 10, 8);

  // ALWAYS black eye patches (defining feature!)
  r(ctx, c.bodyDark, hx + 1, hy + 2, 3, 3);
  r(ctx, c.bodyDark, hx + 6, hy + 2, 3, 3);

  // Eyes inside patches
  if (state !== 'sleep') {
    p(ctx, c.eye, hx + 2, hy + 3);
    p(ctx, c.eye, hx + 7, hy + 3);
  } else {
    r(ctx, c.eye, hx + 1, hy + 3, 2, 1);
    r(ctx, c.eye, hx + 6, hy + 3, 2, 1);
  }

  // Dark round ears
  r(ctx, c.bodyDark, hx - 1, hy - 1, 3, 3);
  r(ctx, c.bodyDark, hx + 8, hy - 1, 3, 3);

  // Nose and mouth
  p(ctx, c.nose, hx + 5, hy + 5);
  r(ctx, c.bodyDark, hx + 4, hy + 6, 3, 1);
};

// ============================================================
// DRAGON (龙)
// ============================================================
const drawDragon: SpeciesDrawFn = (ctx, c, frame, state) => {
  const hover = Math.sin(frame * 0.5) * 2;
  const bx = 4, by = 10 + (state === 'idle' ? hover : 0);

  // Serpentine body (longer)
  r(ctx, c.body, bx, by + 3, 20, 7);
  r(ctx, c.body, bx + 1, by + 2, 18, 9);
  r(ctx, c.belly, bx + 3, by + 5, 14, 4);

  // Scale pattern
  for (let sx = 0; sx < 6; sx++) {
    p(ctx, c.bodyDark, bx + 3 + sx * 3, by + 3);
  }

  // Wings (accent color, defining feature!)
  const wingUp = state === 'selfplay' ? -3 : (state === 'idle' ? (frame % 3 === 0 ? -1 : 0) : 0);
  r(ctx, c.accent || c.body, bx + 5, by - 2 + wingUp, 5, 4);
  r(ctx, c.accent || c.body, bx + 4, by - 1 + wingUp, 2, 2);
  r(ctx, c.accent || c.body, bx + 12, by - 2 + wingUp, 5, 4);
  r(ctx, c.accent || c.body, bx + 16, by - 1 + wingUp, 2, 2);

  // Tail (serpentine)
  r(ctx, c.body, bx + 19, by + 5, 3, 3);
  r(ctx, c.body, bx + 21, by + 4, 2, 2);
  r(ctx, c.accent || c.bodyDark, bx + 22, by + 3, 2, 2);

  // Short legs with claws
  r(ctx, c.body, bx + 3, by + 11, 3, 4);
  r(ctx, c.body, bx + 8, by + 11, 3, 4);
  r(ctx, c.body, bx + 13, by + 11, 3, 4);
  r(ctx, c.body, bx + 18, by + 11, 3, 3);
  r(ctx, c.bodyDark, bx + 3, by + 14, 3, 1);
  r(ctx, c.bodyDark, bx + 8, by + 14, 3, 1);
  r(ctx, c.bodyDark, bx + 13, by + 14, 3, 1);

  // Head
  const hx = bx - 3, hy = by - 1;
  r(ctx, c.body, hx, hy + 2, 8, 7);
  r(ctx, c.body, hx - 2, hy + 5, 3, 3); // snout
  p(ctx, c.nose, hx - 2, hy + 6);

  // Horns
  r(ctx, c.accent || c.bodyDark, hx + 1, hy, 2, 3);
  r(ctx, c.accent || c.bodyDark, hx + 5, hy, 2, 3);

  // Whiskers
  r(ctx, c.bodyDark, hx - 3, hy + 5, 2, 1);
  r(ctx, c.bodyDark, hx - 3, hy + 7, 2, 1);

  // Eyes (fierce)
  if (state !== 'sleep') {
    p(ctx, c.eye, hx + 2, hy + 4);
    p(ctx, c.eye, hx + 5, hy + 4);
  }

  // Spikes along back
  for (let i = 0; i < 4; i++) {
    r(ctx, c.accent || c.bodyDark, bx + 4 + i * 4, by + 1, 2, 2);
  }
};

// ============================================================
// Export species drawer registry
// ============================================================
export const SPECIES_DRAWERS: Record<string, SpeciesDrawFn> = {
  dog: drawDog,
  rabbit: drawRabbit,
  sheep: drawSheep,
  cow: drawCow,
  rodent: drawRodent,
  bird: drawBird,
  fox: drawFox,
  deer: drawDeer,
  panda: drawPanda,
  dragon: drawDragon,
};

// Cat is handled by the existing sprite-generator.ts
// These are the 10 additional species
