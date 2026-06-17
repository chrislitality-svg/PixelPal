// ============================================================
// Programmatic Pixel-Art Spritesheet Generator
// ============================================================
//
// Generates a complete spritesheet for the pet using offscreen
// canvas drawing.  Each frame is SPRITE_SIZE x SPRITE_SIZE (32x32)
// arranged in a single horizontal strip.
//
// Frame layout (index -> animation):
//   0-5    idle       (6 frames)
//   6-11   walk       (6 frames)
//   12-16  eat        (5 frames)
//   17-20  stuffed    (4 frames)
//   21-26  poop       (6 frames)
//   27-28  (reserved)
//   29-36  selfplay   (8 frames)
//   37-42  daydream   (6 frames)
//   43-45  drag       (3 frames)
//   46-49  sleep      (4 frames)
//   50-68  (reserved)
//   69-74  fish       (6 frames)
//   75-78  chat       (4 frames)
//   79-82  interact   (4 frames)
//   83-85  surprised  (3 frames)
//
// Total strip width: 86 * 32 = 2752 px
// ============================================================

import { SPRITE_SIZE, PET_COLORS } from '../../shared/constants';
import type { PetType } from '../../shared/types';

const S = SPRITE_SIZE; // 32

// ---- Colour helpers ---------------------------------------------------

interface CatPalette {
  body: string;
  bodyDark: string;
  belly: string;
  eye: string;
  nose: string;
  ear: string;
  earInner: string;
}

function getCatPalette(_type: PetType): CatPalette {
  return { ...PET_COLORS.cat };
}

// ---- Primitive drawing ------------------------------------------------

function px(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  w: number, h: number,
  color: string,
): void {
  ctx.fillStyle = color;
  ctx.fillRect(Math.floor(x), Math.floor(y), w, h);
}

// ---- Cat body parts ---------------------------------------------------

/**
 * Draw two triangular ears with inner pink and dark tufts.
 * @param oy  vertical offset (breathing / head-bob)
 */
function drawEars(ctx: CanvasRenderingContext2D, pal: CatPalette, oy: number): void {
  // Left ear
  px(ctx, 9,  3 + oy, 3, 1, pal.body);
  px(ctx, 8,  4 + oy, 5, 1, pal.body);
  px(ctx, 8,  5 + oy, 5, 1, pal.body);
  px(ctx, 8,  6 + oy, 5, 1, pal.body);
  px(ctx, 8,  7 + oy, 5, 1, pal.body);
  // Right ear
  px(ctx, 19, 3 + oy, 3, 1, pal.body);
  px(ctx, 18, 4 + oy, 5, 1, pal.body);
  px(ctx, 18, 5 + oy, 5, 1, pal.body);
  px(ctx, 18, 6 + oy, 5, 1, pal.body);
  px(ctx, 18, 7 + oy, 5, 1, pal.body);
  // Inner pink
  px(ctx, 10, 4 + oy, 2, 1, pal.earInner);
  px(ctx, 9,  5 + oy, 3, 1, pal.earInner);
  px(ctx, 9,  6 + oy, 3, 1, pal.earInner);
  px(ctx, 20, 4 + oy, 2, 1, pal.earInner);
  px(ctx, 19, 5 + oy, 3, 1, pal.earInner);
  px(ctx, 19, 6 + oy, 3, 1, pal.earInner);
  // Dark tufts
  px(ctx, 9,  3 + oy, 1, 1, pal.bodyDark);
  px(ctx, 21, 3 + oy, 1, 1, pal.bodyDark);
  px(ctx, 8,  4 + oy, 1, 1, pal.bodyDark);
  px(ctx, 22, 4 + oy, 1, 1, pal.bodyDark);
}

/**
 * Draw the head (rounded rectangle).
 */
function drawHead(ctx: CanvasRenderingContext2D, pal: CatPalette, oy: number): void {
  px(ctx, 8,  8 + oy, 15, 1, pal.body);
  px(ctx, 7,  9 + oy, 17, 1, pal.body);
  px(ctx, 7, 10 + oy, 17, 1, pal.body);
  px(ctx, 7, 11 + oy, 17, 1, pal.body);
  px(ctx, 7, 12 + oy, 17, 1, pal.body);
  px(ctx, 7, 13 + oy, 17, 1, pal.body);
  px(ctx, 8, 14 + oy, 15, 1, pal.body);
}

/**
 * Draw eyes.
 * @param mode  'normal' | 'closed' | 'squint' | 'wide'
 */
function drawEyes(
  ctx: CanvasRenderingContext2D,
  pal: CatPalette,
  oy: number,
  mode: 'normal' | 'closed' | 'squint' | 'wide',
): void {
  const ey = 10 + oy;
  if (mode === 'closed' || mode === 'squint') {
    px(ctx, 9,  ey + 1, 4, 1, pal.eye);
    px(ctx, 18, ey + 1, 4, 1, pal.eye);
    // Squint adds a slight curve
    if (mode === 'squint') {
      px(ctx, 10, ey, 2, 1, pal.eye);
      px(ctx, 19, ey, 2, 1, pal.eye);
    }
  } else if (mode === 'wide') {
    // Bigger eyes for surprise
    px(ctx, 9,  ey - 1, 4, 4, '#FFFFFF');
    px(ctx, 18, ey - 1, 4, 4, '#FFFFFF');
    px(ctx, 10, ey,     3, 3, pal.eye);
    px(ctx, 19, ey,     3, 3, pal.eye);
    // Highlights
    px(ctx, 10, ey,     1, 1, '#FFFFFF');
    px(ctx, 19, ey,     1, 1, '#FFFFFF');
  } else {
    // Normal: white sclera + dark pupil + highlight
    px(ctx, 9,  ey, 4, 3, '#FFFFFF');
    px(ctx, 18, ey, 4, 3, '#FFFFFF');
    px(ctx, 10, ey, 3, 3, pal.eye);
    px(ctx, 19, ey, 3, 3, pal.eye);
    // Pupil
    px(ctx, 11, ey + 1, 1, 1, '#111111');
    px(ctx, 20, ey + 1, 1, 1, '#111111');
    // Highlight
    px(ctx, 10, ey, 1, 1, '#FFFFFF');
    px(ctx, 19, ey, 1, 1, '#FFFFFF');
  }
}

function drawNose(ctx: CanvasRenderingContext2D, pal: CatPalette, oy: number): void {
  px(ctx, 15, 13 + oy, 2, 1, pal.nose);
}

/**
 * Draw mouth.
 * @param open  whether the mouth is open (eating / chatting)
 */
function drawMouth(ctx: CanvasRenderingContext2D, pal: CatPalette, oy: number, open: boolean): void {
  if (open) {
    px(ctx, 14, 14 + oy, 3, 1, pal.nose);
    px(ctx, 15, 15 + oy, 1, 1, pal.nose);
  } else {
    px(ctx, 14, 14 + oy, 1, 1, pal.bodyDark);
    px(ctx, 16, 14 + oy, 1, 1, pal.bodyDark);
  }
}

function drawWhiskers(ctx: CanvasRenderingContext2D, pal: CatPalette, oy: number): void {
  px(ctx, 3,  11 + oy, 4, 1, pal.bodyDark);
  px(ctx, 4,  13 + oy, 3, 1, pal.bodyDark);
  px(ctx, 24, 11 + oy, 4, 1, pal.bodyDark);
  px(ctx, 24, 13 + oy, 3, 1, pal.bodyDark);
}

/**
 * Draw the body.
 * @param oy       vertical offset
 * @param puffed   wider belly (stuffed state)
 */
function drawBody(
  ctx: CanvasRenderingContext2D,
  pal: CatPalette,
  oy: number,
  puffed: boolean,
): void {
  px(ctx, 10, 15 + oy, 11, 1, pal.body);
  px(ctx,  9, 16 + oy, 13, 1, pal.body);
  px(ctx,  8, 17 + oy, 15, 1, pal.body);
  px(ctx,  8, 18 + oy, 15, 1, pal.body);
  px(ctx,  8, 19 + oy, 15, 1, pal.body);
  px(ctx,  8, 20 + oy, 15, 1, pal.body);
  px(ctx,  9, 21 + oy, 13, 1, pal.body);
  px(ctx, 10, 22 + oy, 11, 1, pal.body);

  // Belly
  if (puffed) {
    px(ctx,  9, 17 + oy, 13, 1, pal.belly);
    px(ctx,  8, 18 + oy, 15, 1, pal.belly);
    px(ctx,  8, 19 + oy, 15, 1, pal.belly);
    px(ctx,  8, 20 + oy, 15, 1, pal.belly);
    px(ctx,  9, 21 + oy, 13, 1, pal.belly);
  } else {
    px(ctx, 12, 17 + oy, 7, 1, pal.belly);
    px(ctx, 11, 18 + oy, 9, 1, pal.belly);
    px(ctx, 11, 19 + oy, 9, 1, pal.belly);
    px(ctx, 11, 20 + oy, 9, 1, pal.belly);
    px(ctx, 12, 21 + oy, 7, 1, pal.belly);
  }

  // Tabby stripes
  px(ctx, 10, 16 + oy, 1, 1, pal.bodyDark);
  px(ctx, 20, 16 + oy, 1, 1, pal.bodyDark);
  px(ctx,  9, 18 + oy, 1, 1, pal.bodyDark);
  px(ctx, 21, 18 + oy, 1, 1, pal.bodyDark);
  px(ctx,  9, 20 + oy, 1, 1, pal.bodyDark);
  px(ctx, 21, 20 + oy, 1, 1, pal.bodyDark);
}

/**
 * Draw tail.
 * @param oy   vertical offset
 * @param flip alternate curl direction
 */
function drawTail(
  ctx: CanvasRenderingContext2D,
  pal: CatPalette,
  oy: number,
  flip: boolean,
): void {
  if (flip) {
    px(ctx, 22, 21 + oy, 3, 2, pal.body);
    px(ctx, 24, 18 + oy, 2, 4, pal.body);
    px(ctx, 25, 15 + oy, 2, 4, pal.body);
    px(ctx, 24, 13 + oy, 2, 3, pal.body);
    px(ctx, 24, 13 + oy, 2, 1, pal.bodyDark);
  } else {
    px(ctx, 22, 20 + oy, 3, 2, pal.body);
    px(ctx, 24, 17 + oy, 2, 4, pal.body);
    px(ctx, 25, 14 + oy, 2, 4, pal.body);
    px(ctx, 24, 12 + oy, 2, 3, pal.body);
    px(ctx, 24, 12 + oy, 2, 1, pal.bodyDark);
  }
}

/**
 * Draw legs / feet.
 * @param oy     vertical offset
 * @param phase  'A' | 'B' | 'stand' | 'dangle' | 'jump'
 */
function drawLegs(
  ctx: CanvasRenderingContext2D,
  pal: CatPalette,
  oy: number,
  phase: 'A' | 'B' | 'stand' | 'dangle' | 'jump',
): void {
  if (phase === 'stand') {
    // Front legs
    px(ctx, 10, 23 + oy, 3, 2, pal.body);
    px(ctx, 18, 23 + oy, 3, 2, pal.body);
    px(ctx, 10, 25 + oy, 3, 1, pal.bodyDark);
    px(ctx, 18, 25 + oy, 3, 1, pal.bodyDark);
    // Back legs
    px(ctx, 12, 23 + oy, 2, 2, pal.body);
    px(ctx, 16, 23 + oy, 2, 2, pal.body);
    px(ctx, 12, 25 + oy, 2, 1, pal.bodyDark);
    px(ctx, 16, 25 + oy, 2, 1, pal.bodyDark);
  } else if (phase === 'A') {
    // Walk phase 1: left front forward
    px(ctx,  8, 23 + oy, 3, 2, pal.body);
    px(ctx, 18, 24 + oy, 3, 2, pal.body);
    px(ctx,  8, 25 + oy, 3, 1, pal.bodyDark);
    px(ctx, 18, 26 + oy, 3, 1, pal.bodyDark);
    px(ctx, 12, 23 + oy, 3, 2, pal.body);
    px(ctx, 15, 24 + oy, 3, 2, pal.body);
    px(ctx, 12, 25 + oy, 3, 1, pal.bodyDark);
    px(ctx, 15, 26 + oy, 3, 1, pal.bodyDark);
  } else if (phase === 'B') {
    // Walk phase 2: right front forward
    px(ctx, 10, 24 + oy, 3, 2, pal.body);
    px(ctx, 17, 23 + oy, 3, 2, pal.body);
    px(ctx, 10, 26 + oy, 3, 1, pal.bodyDark);
    px(ctx, 17, 25 + oy, 3, 1, pal.bodyDark);
    px(ctx, 13, 24 + oy, 3, 2, pal.body);
    px(ctx, 15, 23 + oy, 3, 2, pal.body);
    px(ctx, 13, 26 + oy, 3, 1, pal.bodyDark);
    px(ctx, 15, 25 + oy, 3, 1, pal.bodyDark);
  } else if (phase === 'dangle') {
    // Dangling legs (drag)
    px(ctx,  9, 23 + oy, 3, 3, pal.body);
    px(ctx, 18, 23 + oy, 3, 3, pal.body);
    px(ctx,  9, 26 + oy, 3, 1, pal.bodyDark);
    px(ctx, 18, 26 + oy, 3, 1, pal.bodyDark);
    // Dangling arms
    px(ctx,  6, 18 + oy, 2, 4, pal.body);
    px(ctx, 23, 18 + oy, 2, 4, pal.body);
    px(ctx,  6, 22 + oy, 2, 1, pal.bodyDark);
    px(ctx, 23, 22 + oy, 2, 1, pal.bodyDark);
  } else if (phase === 'jump') {
    // Legs tucked up (jumping)
    px(ctx, 10, 22 + oy, 3, 2, pal.body);
    px(ctx, 18, 22 + oy, 3, 2, pal.body);
    px(ctx, 10, 24 + oy, 3, 1, pal.bodyDark);
    px(ctx, 18, 24 + oy, 3, 1, pal.bodyDark);
  }
}

/**
 * Draw blush marks on cheeks.
 */
function drawBlush(ctx: CanvasRenderingContext2D, oy: number): void {
  px(ctx,  7, 12 + oy, 2, 1, '#FFB8C6');
  px(ctx, 22, 12 + oy, 2, 1, '#FFB8C6');
}

/**
 * Draw a small star / sparkle at (x,y).
 */
function drawSparkle(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
  px(ctx, x, y, 1, 1, color);
  px(ctx, x - 1, y, 1, 1, color);
  px(ctx, x + 1, y, 1, 1, color);
  px(ctx, x, y - 1, 1, 1, color);
  px(ctx, x, y + 1, 1, 1, color);
}

/**
 * Draw a tiny "Z" letter for sleeping.
 */
function drawZ(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
  px(ctx, x,     y, 2, 1, color);
  px(ctx, x + 1, y + 1, 1, 1, color);
  px(ctx, x,     y + 2, 2, 1, color);
}

/**
 * Draw a tiny exclamation mark.
 */
function drawExclaim(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
  px(ctx, x, y, 2, 3, color);
  px(ctx, x, y + 4, 2, 1, color);
}

/**
 * Draw a small speech bubble.
 */
function drawBubble(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  px(ctx, x, y, 6, 4, 'rgba(255,255,255,0.85)');
  px(ctx, x + 1, y + 4, 2, 1, 'rgba(255,255,255,0.85)');
  px(ctx, x + 1, y + 1, 4, 1, '#666666');
  px(ctx, x + 1, y + 2, 3, 1, '#666666');
}

/**
 * Draw a fishing rod with line and bobber.
 * @param bobberY  vertical offset for the bobber animation
 */
function drawFishingRod(ctx: CanvasRenderingContext2D, bobberY: number): void {
  // Rod
  px(ctx, 4, 5, 1, 18, '#8B6914');
  px(ctx, 3, 4, 1, 1, '#8B6914');
  px(ctx, 2, 3, 1, 1, '#8B6914');
  px(ctx, 1, 2, 1, 1, '#A07818');
  // Line
  for (let ly = 3; ly <= 7 + bobberY; ly++) {
    px(ctx, 1, ly, 1, 1, '#AAAAAA');
  }
  // Bobber
  px(ctx, 0, 8 + bobberY, 2, 1, '#FF4444');
  px(ctx, 0, 9 + bobberY, 2, 1, '#FFFFFF');
}

// ============================================================
// Per-animation frame drawing functions
// ============================================================

/**
 * Draw a complete standing cat with configurable pose params.
 */
interface PoseParams {
  oy: number;
  headOy: number;
  eyeMode: 'normal' | 'closed' | 'squint' | 'wide';
  mouthOpen: boolean;
  legPhase: 'A' | 'B' | 'stand' | 'dangle' | 'jump';
  tailFlip: boolean;
  puffed: boolean;
  blush?: boolean;
}

function drawStandingCat(
  ctx: CanvasRenderingContext2D,
  pal: CatPalette,
  pose: PoseParams,
): void {
  const hOy = pose.oy + pose.headOy;
  drawTail(ctx, pal, pose.oy, pose.tailFlip);
  drawEars(ctx, pal, hOy);
  drawHead(ctx, pal, hOy);
  drawEyes(ctx, pal, hOy, pose.eyeMode);
  drawNose(ctx, pal, hOy);
  drawMouth(ctx, pal, hOy, pose.mouthOpen);
  drawWhiskers(ctx, pal, hOy);
  drawBody(ctx, pal, pose.oy, pose.puffed);
  drawLegs(ctx, pal, pose.oy, pose.legPhase);
  if (pose.blush) drawBlush(ctx, hOy);
}

// ---- Idle: gentle breathing bounce -----------------------------------

function drawIdleFrame(ctx: CanvasRenderingContext2D, pal: CatPalette, f: number): void {
  const oyCycle = [0, -1, -1, 0, 1, 1];
  const oy = oyCycle[f % 6];
  drawStandingCat(ctx, pal, {
    oy,
    headOy: 0,
    eyeMode: 'normal',
    mouthOpen: false,
    legPhase: 'stand',
    tailFlip: f % 4 === 0,
    puffed: false,
  });
}

// ---- Walk: legs alternating, body bob --------------------------------

function drawWalkFrame(ctx: CanvasRenderingContext2D, pal: CatPalette, f: number): void {
  const oyCycle = [0, -1, 0, 0, -1, 0];
  const oy = oyCycle[f % 6];
  const legPhase: ('A' | 'B') = f % 2 === 0 ? 'A' : 'B';
  drawStandingCat(ctx, pal, {
    oy,
    headOy: 0,
    eyeMode: 'normal',
    mouthOpen: false,
    legPhase,
    tailFlip: f % 3 === 0,
    puffed: false,
  });
}

// ---- Eat: head dips down, mouth opens --------------------------------

function drawEatFrame(ctx: CanvasRenderingContext2D, pal: CatPalette, f: number): void {
  const headDips = [1, 2, 3, 2, 1];
  const headOy = headDips[f % 5];
  drawStandingCat(ctx, pal, {
    oy: 0,
    headOy,
    eyeMode: f === 2 ? 'squint' : 'normal',
    mouthOpen: f % 2 === 0,
    legPhase: 'stand',
    tailFlip: false,
    puffed: false,
  });
}

// ---- Stuffed: puffed belly, slow breathing ---------------------------

function drawStuffedFrame(ctx: CanvasRenderingContext2D, pal: CatPalette, f: number): void {
  const oyCycle = [0, 0, 1, 0];
  const oy = oyCycle[f % 4];
  drawStandingCat(ctx, pal, {
    oy,
    headOy: 0,
    eyeMode: 'squint',
    mouthOpen: false,
    legPhase: 'stand',
    tailFlip: false,
    puffed: true,
  });
}

// ---- Poop: straining, eyes squinting ---------------------------------

function drawPoopFrame(ctx: CanvasRenderingContext2D, pal: CatPalette, f: number): void {
  const oyCycle = [0, 1, 2, 2, 1, 0];
  const oy = oyCycle[f % 6];
  drawStandingCat(ctx, pal, {
    oy,
    headOy: f >= 2 && f <= 4 ? 1 : 0,
    eyeMode: f >= 1 && f <= 4 ? 'squint' : 'normal',
    mouthOpen: f >= 2 && f <= 4,
    legPhase: 'stand',
    tailFlip: false,
    puffed: false,
  });
  // Small poop pile appearing
  if (f >= 3) {
    px(ctx, 25, 27, 3, 1, '#8B6B3D');
    px(ctx, 26, 26, 2, 1, '#8B6B3D');
  }
  if (f >= 4) {
    px(ctx, 25, 28, 4, 1, '#8B6B3D');
    px(ctx, 26, 27, 3, 1, '#6B4D2D');
  }
  if (f >= 5) {
    px(ctx, 25, 29, 5, 1, '#8B6B3D');
  }
}

// ---- Self-play: jumping and spinning ---------------------------------

function drawSelfplayFrame(ctx: CanvasRenderingContext2D, pal: CatPalette, f: number): void {
  const jumpHeights = [0, -2, -4, -6, -6, -4, -2, 1];
  const oy = jumpHeights[f % 8];

  drawStandingCat(ctx, pal, {
    oy,
    headOy: 0,
    eyeMode: f >= 3 && f <= 5 ? 'squint' : 'normal',
    mouthOpen: f === 3 || f === 4,
    legPhase: oy < -2 ? 'jump' : 'stand',
    tailFlip: f % 2 === 0,
    puffed: false,
  });

  // Dust when landing
  if (f === 7) {
    px(ctx, 7,  28, 2, 1, '#C8B89A');
    px(ctx, 22, 28, 2, 1, '#C8B89A');
    px(ctx, 6,  29, 1, 1, '#C8B89A');
    px(ctx, 24, 29, 1, 1, '#C8B89A');
  }

  // Stars at peak jump
  if (f === 3 || f === 4) {
    drawSparkle(ctx, 3, 5, '#FFD700');
    drawSparkle(ctx, 27, 3, '#FFEE88');
  }
}

// ---- Daydream: sitting, looking up, sparkles -------------------------

function drawDaydreamFrame(ctx: CanvasRenderingContext2D, pal: CatPalette, f: number): void {
  const oyCycle = [0, 0, -1, -1, 0, 0];
  const oy = oyCycle[f % 6];

  // Draw cat sitting (body lower, head tilted up slightly)
  drawTail(ctx, pal, oy + 2, f % 3 === 0);
  drawEars(ctx, pal, oy - 1);
  drawHead(ctx, pal, oy - 1);
  // Eyes looking up: shift eye whites up by 1
  const ey = 10 + oy - 1;
  px(ctx, 9,  ey - 1, 4, 3, '#FFFFFF');
  px(ctx, 18, ey - 1, 4, 3, '#FFFFFF');
  px(ctx, 10, ey - 1, 3, 2, pal.eye);
  px(ctx, 19, ey - 1, 3, 2, pal.eye);
  px(ctx, 10, ey - 1, 1, 1, '#FFFFFF');
  px(ctx, 19, ey - 1, 1, 1, '#FFFFFF');

  drawNose(ctx, pal, oy - 1);
  drawMouth(ctx, pal, oy - 1, false);
  drawWhiskers(ctx, pal, oy - 1);

  // Sitting body (shifted down, wider)
  px(ctx, 10, 16 + oy, 11, 1, pal.body);
  px(ctx,  9, 17 + oy, 13, 1, pal.body);
  px(ctx,  8, 18 + oy, 15, 1, pal.body);
  px(ctx,  8, 19 + oy, 15, 1, pal.body);
  px(ctx,  8, 20 + oy, 15, 1, pal.body);
  px(ctx,  9, 21 + oy, 13, 1, pal.body);
  px(ctx, 10, 22 + oy, 11, 1, pal.body);
  // Belly
  px(ctx, 12, 18 + oy, 7, 1, pal.belly);
  px(ctx, 11, 19 + oy, 9, 1, pal.belly);
  px(ctx, 11, 20 + oy, 9, 1, pal.belly);
  px(ctx, 12, 21 + oy, 7, 1, pal.belly);
  // Stripes
  px(ctx, 10, 17 + oy, 1, 1, pal.bodyDark);
  px(ctx, 20, 17 + oy, 1, 1, pal.bodyDark);

  // Front paws visible
  px(ctx, 10, 22 + oy, 3, 2, pal.body);
  px(ctx, 18, 22 + oy, 3, 2, pal.body);
  px(ctx, 10, 24 + oy, 3, 1, pal.bodyDark);
  px(ctx, 18, 24 + oy, 3, 1, pal.bodyDark);

  // Sparkles floating around
  const sparklePositions = [
    [3, 2], [27, 4], [5, 6], [25, 1], [2, 8], [28, 7],
  ];
  for (let i = 0; i < 3; i++) {
    const idx = (f + i * 2) % sparklePositions.length;
    const [sx, sy] = sparklePositions[idx];
    drawSparkle(ctx, sx, sy, i % 2 === 0 ? '#FFD700' : '#FFEE88');
  }
}

// ---- Drag: limbs dangling, sweat drop --------------------------------

function drawDragFrame(ctx: CanvasRenderingContext2D, pal: CatPalette, f: number): void {
  const oyCycle = [0, 1, 0];
  const oy = oyCycle[f % 3];

  drawStandingCat(ctx, pal, {
    oy,
    headOy: 1, // head droops
    eyeMode: 'wide',
    mouthOpen: true,
    legPhase: 'dangle',
    tailFlip: false,
    puffed: false,
  });

  // Sweat drop
  px(ctx, 24, 8 + oy, 1, 1, '#88CCFF');
  px(ctx, 24, 9 + oy, 1, 2, '#88CCFF');
}

// ---- Sleep: curled up with zzz ---------------------------------------

function drawSleepFrame(ctx: CanvasRenderingContext2D, pal: CatPalette, f: number): void {
  const breathe = [0, 0, 1, 0][f % 4];

  // Round body mound
  px(ctx,  7, 18 + breathe, 18, 1, pal.body);
  px(ctx,  6, 19 + breathe, 20, 1, pal.body);
  px(ctx,  5, 20 + breathe, 22, 1, pal.body);
  px(ctx,  5, 21 + breathe, 22, 1, pal.body);
  px(ctx,  5, 22 + breathe, 22, 1, pal.body);
  px(ctx,  6, 23 + breathe, 20, 1, pal.body);
  px(ctx,  7, 24 + breathe, 18, 1, pal.body);
  px(ctx,  9, 25 + breathe, 14, 1, pal.body);
  // Belly
  px(ctx, 10, 21 + breathe, 12, 1, pal.belly);
  px(ctx,  9, 22 + breathe, 14, 1, pal.belly);
  px(ctx, 10, 23 + breathe, 12, 1, pal.belly);
  // Stripes
  px(ctx,  7, 19 + breathe, 1, 1, pal.bodyDark);
  px(ctx, 24, 19 + breathe, 1, 1, pal.bodyDark);
  px(ctx,  6, 21 + breathe, 1, 1, pal.bodyDark);
  px(ctx, 25, 21 + breathe, 1, 1, pal.bodyDark);

  // Head (tucked)
  px(ctx,  7, 13 + breathe, 11, 1, pal.body);
  px(ctx,  6, 14 + breathe, 13, 1, pal.body);
  px(ctx,  6, 15 + breathe, 13, 1, pal.body);
  px(ctx,  6, 16 + breathe, 13, 1, pal.body);
  px(ctx,  6, 17 + breathe, 13, 1, pal.body);
  px(ctx,  7, 18 + breathe, 11, 1, pal.body);
  // Ears (flat)
  px(ctx,  7, 11 + breathe, 3, 2, pal.body);
  px(ctx, 14, 11 + breathe, 3, 2, pal.body);
  px(ctx,  8, 12 + breathe, 2, 1, pal.earInner);
  px(ctx, 15, 12 + breathe, 2, 1, pal.earInner);
  // Closed eyes
  px(ctx,  8, 15 + breathe, 3, 1, pal.eye);
  px(ctx, 13, 15 + breathe, 3, 1, pal.eye);
  // Nose
  px(ctx, 11, 17 + breathe, 1, 1, pal.nose);
  // Paws
  px(ctx,  7, 18 + breathe, 3, 2, pal.body);
  px(ctx, 14, 18 + breathe, 3, 2, pal.body);
  px(ctx,  7, 20 + breathe, 3, 1, pal.bodyDark);
  px(ctx, 14, 20 + breathe, 3, 1, pal.bodyDark);

  // Tail curled
  px(ctx, 24, 22 + breathe, 3, 2, pal.body);
  px(ctx, 26, 20 + breathe, 2, 3, pal.body);
  px(ctx, 25, 18 + breathe, 2, 3, pal.body);
  px(ctx, 23, 17 + breathe, 3, 2, pal.body);
  px(ctx, 23, 17 + breathe, 2, 1, pal.bodyDark);

  // ZZZ
  const zf = f % 4;
  drawZ(ctx, 21, 10 + (zf > 0 ? -1 : 0), '#AABBDD');
  if (zf >= 1) drawZ(ctx, 24, 7, '#8899BB');
  if (zf >= 2) drawZ(ctx, 27, 4, '#667799');
  if (zf >= 3) drawZ(ctx, 29, 2, '#556688');
}

// ---- Fish: sitting with fishing rod ----------------------------------

function drawFishFrame(ctx: CanvasRenderingContext2D, pal: CatPalette, f: number): void {
  const oyCycle = [0, 0, 0, -1, 0, 0];
  const oy = oyCycle[f % 6];
  const bobberY = [0, -1, -2, -1, 0, 1][f % 6];

  // Tail
  drawTail(ctx, pal, oy + 1, f % 3 === 0);

  // Ears
  drawEars(ctx, pal, oy);
  drawHead(ctx, pal, oy);
  drawEyes(ctx, pal, oy, 'normal');
  drawNose(ctx, pal, oy);
  drawMouth(ctx, pal, oy, false);
  drawWhiskers(ctx, pal, oy);

  // Sitting body
  px(ctx, 10, 16 + oy, 11, 1, pal.body);
  px(ctx,  9, 17 + oy, 13, 1, pal.body);
  px(ctx,  8, 18 + oy, 15, 1, pal.body);
  px(ctx,  8, 19 + oy, 15, 1, pal.body);
  px(ctx,  8, 20 + oy, 15, 1, pal.body);
  px(ctx,  9, 21 + oy, 13, 1, pal.body);
  px(ctx, 10, 22 + oy, 11, 1, pal.body);
  px(ctx, 12, 18 + oy, 7, 1, pal.belly);
  px(ctx, 11, 19 + oy, 9, 1, pal.belly);
  px(ctx, 11, 20 + oy, 9, 1, pal.belly);
  px(ctx, 12, 21 + oy, 7, 1, pal.belly);
  // Stripes
  px(ctx, 10, 17 + oy, 1, 1, pal.bodyDark);
  px(ctx, 20, 17 + oy, 1, 1, pal.bodyDark);

  // Paws holding rod
  px(ctx,  8, 17 + oy, 2, 2, pal.body);
  px(ctx,  8, 19 + oy, 2, 1, pal.bodyDark);

  // Front feet
  px(ctx, 10, 23 + oy, 3, 2, pal.body);
  px(ctx, 18, 23 + oy, 3, 2, pal.body);
  px(ctx, 10, 25 + oy, 3, 1, pal.bodyDark);
  px(ctx, 18, 25 + oy, 3, 1, pal.bodyDark);

  // Fishing rod
  drawFishingRod(ctx, bobberY);
}

// ---- Chat: mouth moving, speech bubble -------------------------------

function drawChatFrame(ctx: CanvasRenderingContext2D, pal: CatPalette, f: number): void {
  const oyCycle = [0, -1, 0, 0];
  const oy = oyCycle[f % 4];
  drawStandingCat(ctx, pal, {
    oy,
    headOy: 0,
    eyeMode: 'normal',
    mouthOpen: f % 2 === 0,
    legPhase: 'stand',
    tailFlip: f % 3 === 0,
    puffed: false,
  });
  // Speech bubble
  drawBubble(ctx, 24, 3);
}

// ---- Interact-pet: happy squint, blush -------------------------------

function drawInteractFrame(ctx: CanvasRenderingContext2D, pal: CatPalette, f: number): void {
  const oyCycle = [0, -1, -1, 0];
  const oy = oyCycle[f % 4];
  drawStandingCat(ctx, pal, {
    oy,
    headOy: 0,
    eyeMode: 'squint',
    mouthOpen: false,
    legPhase: 'stand',
    tailFlip: f % 2 === 0,
    puffed: false,
    blush: true,
  });

  // Happy sparkles
  if (f === 1 || f === 2) {
    drawSparkle(ctx, 4, 6, '#FFB8C6');
    drawSparkle(ctx, 26, 5, '#FFB8C6');
  }
}

// ---- Surprised: wide eyes, exclamation -------------------------------

function drawSurprisedFrame(ctx: CanvasRenderingContext2D, pal: CatPalette, f: number): void {
  const oyCycle = [0, -2, -1];
  const oy = oyCycle[f % 3];
  drawStandingCat(ctx, pal, {
    oy,
    headOy: f === 1 ? -1 : 0,
    eyeMode: 'wide',
    mouthOpen: true,
    legPhase: 'stand',
    tailFlip: false,
    puffed: false,
  });
  // Exclamation mark
  drawExclaim(ctx, 15, 1, '#FF4444');
}

// ============================================================
// Main generator function
// ============================================================

/**
 * Generate a complete spritesheet for the given pet type.
 * Returns an offscreen canvas with all animation frames arranged
 * in a single horizontal strip (each frame is SPRITE_SIZE x SPRITE_SIZE).
 *
 * The canvas can be converted to a data URL via `.toDataURL()` or
 * used directly as an image source for the PetRenderer.
 */
export function generateCatSpritesheet(petType: PetType): HTMLCanvasElement {
  // Total frames including reserved gaps
  const TOTAL_FRAMES = 86;
  const canvas = document.createElement('canvas');
  canvas.width = TOTAL_FRAMES * S;   // 2752
  canvas.height = S;                  // 32

  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;

  const pal = getCatPalette(petType);

  // ---- Frame mapping -----------------------------------------------

  // Animation ranges: [start, count, drawFunction]
  const animations: Array<{
    start: number;
    count: number;
    draw: (ctx: CanvasRenderingContext2D, pal: CatPalette, f: number) => void;
  }> = [
    { start: 0,  count: 6,  draw: drawIdleFrame },
    { start: 6,  count: 6,  draw: drawWalkFrame },
    { start: 12, count: 5,  draw: drawEatFrame },
    { start: 17, count: 4,  draw: drawStuffedFrame },
    { start: 21, count: 6,  draw: drawPoopFrame },
    { start: 29, count: 8,  draw: drawSelfplayFrame },
    { start: 37, count: 6,  draw: drawDaydreamFrame },
    { start: 43, count: 3,  draw: drawDragFrame },
    { start: 46, count: 4,  draw: drawSleepFrame },
    { start: 69, count: 6,  draw: drawFishFrame },
    { start: 75, count: 4,  draw: drawChatFrame },
    { start: 79, count: 4,  draw: drawInteractFrame },
    { start: 83, count: 3,  draw: drawSurprisedFrame },
  ];

  // Draw each animation's frames
  for (const anim of animations) {
    for (let f = 0; f < anim.count; f++) {
      const frameIndex = anim.start + f;
      ctx.save();
      ctx.translate(frameIndex * S, 0);

      // Clip to this frame's cell
      ctx.beginPath();
      ctx.rect(0, 0, S, S);
      ctx.clip();

      anim.draw(ctx, pal, f);

      ctx.restore();
    }
  }

  return canvas;
}

// ============================================================
// Multi-species spritesheet generator
// ============================================================
// Generates a complete spritesheet for any non-cat species
// using the species-specific drawing functions.
// Same frame layout: 86 frames × 32px = 2752px strip.
// ============================================================

import { SPECIES_DRAWERS } from './species-drawers';
import type { PetSpecies, BreedColors } from '../../shared/types';

// Animation frame layout (same as cat)
const ANIM_LAYOUT = [
  { name: 'idle',         start: 0,  count: 6  },
  { name: 'walk',         start: 6,  count: 6  },
  { name: 'eat',          start: 12, count: 5  },
  { name: 'stuffed',      start: 17, count: 4  },
  { name: 'poop',         start: 21, count: 6  },
  { name: 'selfplay',     start: 29, count: 8  },
  { name: 'daydream',     start: 37, count: 6  },
  { name: 'drag',         start: 43, count: 3  },
  { name: 'sleep',        start: 46, count: 4  },
  { name: 'fish',         start: 69, count: 6  },
  { name: 'chat',         start: 75, count: 4  },
  { name: 'interact-pet', start: 79, count: 4  },
  { name: 'surprised',    start: 83, count: 3  },
];

export function generateSpeciesSpritesheet(
  species: PetSpecies,
  colors: BreedColors,
): HTMLCanvasElement {
  const S = SPRITE_SIZE; // 32
  const totalFrames = 86;
  const canvas = document.createElement('canvas');
  canvas.width = totalFrames * S;
  canvas.height = S;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;

  const drawer = SPECIES_DRAWERS[species];
  if (!drawer) {
    // Fallback: just draw empty frames
    console.warn(`[SpriteGen] No drawer for species: ${species}`);
    return canvas;
  }

  for (const anim of ANIM_LAYOUT) {
    for (let f = 0; f < anim.count; f++) {
      const frameIndex = anim.start + f;
      ctx.save();
      ctx.translate(frameIndex * S, 0);

      // Clip to this frame's cell
      ctx.beginPath();
      ctx.rect(0, 0, S, S);
      ctx.clip();

      drawer(ctx, colors, f, anim.name);

      ctx.restore();
    }
  }

  return canvas;
}
