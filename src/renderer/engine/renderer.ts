// ============================================================
// PetRenderer - Canvas renderer with sprite animation & fallback
// ============================================================

import { SpriteAnimation, SpriteAnimationConfig } from './sprite-animation';
import {
  CANVAS_SIZE,
  SPRITE_SIZE,
  SPRITE_SCALE,
  PET_COLORS,
  BREED_REGISTRY,
} from '../../shared/constants';
import type { PetSpecies, BreedColors } from '../../shared/types';
import { SPECIES_DRAWERS } from '../sprites/species-drawers';

// ---- Particle system ---------------------------------------------------

export type ParticleType = 'dust' | 'star' | 'heart' | 'stink' | 'zzz' | 'note';

export interface Particle {
  type: ParticleType;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  rotation: number;
  rotationSpeed: number;
}

// ---- Animation definitions ---------------------------------------------

const ANIMATION_DEFS: SpriteAnimationConfig[] = [
  { name: 'idle',         frames: [0, 1, 2, 3, 4, 5],                   fps: 5,  loop: true  },
  { name: 'walk',         frames: [6, 7, 8, 9, 10, 11],                 fps: 8,  loop: true  },
  { name: 'eat',          frames: [12, 13, 14, 15, 16],                 fps: 10, loop: false },
  { name: 'eat-fast',     frames: [12, 13, 14, 15, 16],                 fps: 16, loop: false },
  { name: 'stuffed',      frames: [17, 18, 19, 20],                     fps: 3,  loop: true  },
  { name: 'poop',         frames: [21, 22, 23, 24, 25, 26],             fps: 6,  loop: false },
  { name: 'selfplay',     frames: [29, 30, 31, 32, 33, 34, 35, 36],    fps: 8,  loop: true  },
  { name: 'daydream',     frames: [37, 38, 39, 40, 41, 42],             fps: 2,  loop: true  },
  { name: 'drag',         frames: [43, 44, 45],                         fps: 6,  loop: true  },
  { name: 'sleep',        frames: [46, 47, 48, 49],                     fps: 2,  loop: true  },
  { name: 'fish',         frames: [69, 70, 71, 72, 73, 74],             fps: 6,  loop: true  },
  { name: 'chat',         frames: [75, 76, 77, 78],                     fps: 4,  loop: true  },
  { name: 'interact-pet', frames: [79, 80, 81, 82],                     fps: 6,  loop: false },
  { name: 'surprised',    frames: [83, 84, 85],                         fps: 4,  loop: false },
];

// ---- Cosmetic anchors per species -------------------------------------
// The procedural pet is drawn differently per species, so cosmetics need
// per-species anchor points to actually sit on the head / eyes / neck.
//   headY  — y of the top of the head (where a hat rests)
//   eyeY   — y of the eyes (glasses)
//   neckY  — y of the neck/chest (bow tie)
//   scale  — overall cosmetic size multiplier (small animals → smaller)

interface CosmeticAnchor { headY: number; eyeY: number; neckY: number; scale: number }

const DEFAULT_ANCHOR: CosmeticAnchor = { headY: 30, eyeY: 52, neckY: 88, scale: 1.0 };

const SPECIES_ANCHORS: Record<PetSpecies, CosmeticAnchor> = {
  cat:    { headY: 30, eyeY: 52, neckY: 88, scale: 1.0 },
  dog:    { headY: 30, eyeY: 53, neckY: 90, scale: 1.05 },
  rabbit: { headY: 22, eyeY: 50, neckY: 86, scale: 0.95 }, // tall ears → hat higher
  sheep:  { headY: 32, eyeY: 54, neckY: 90, scale: 1.05 },
  cow:    { headY: 30, eyeY: 52, neckY: 92, scale: 1.1 },
  rodent: { headY: 34, eyeY: 56, neckY: 92, scale: 0.82 }, // small & round
  bird:   { headY: 30, eyeY: 50, neckY: 84, scale: 0.8 },
  fox:    { headY: 28, eyeY: 52, neckY: 88, scale: 1.0 },
  deer:   { headY: 22, eyeY: 50, neckY: 86, scale: 1.0 },  // antlers → hat higher
  panda:  { headY: 30, eyeY: 54, neckY: 92, scale: 1.15 },
  dragon: { headY: 24, eyeY: 50, neckY: 90, scale: 1.05 },
};

// ---- Mood system ------------------------------------------------------

export type MoodType = 'happy' | 'neutral' | 'sad' | 'hungry' | 'sleepy' | 'dirty';

// ============================================================
// PetRenderer
// ============================================================

export class PetRenderer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  spritesheet: HTMLImageElement | null = null;
  animations: Map<string, SpriteAnimation> = new Map();
  currentAnimation: SpriteAnimation | null = null;

  particles: Particle[] = [];

  // Multi-species support
  species: PetSpecies = 'cat';
  breedColors: BreedColors = PET_COLORS.cat;

  // Equipped cosmetics (purchased in the shop). Keyed by slot → item id.
  equipped: { hat?: string; glasses?: string; accessory?: string } = {};

  // The pet's current vertical body bob (in sprite units) — used so
  // equipped cosmetics bob together with the pet instead of floating.
  private lastBodyOffset = 0;

  // ---- Celebration FX (level-up / evolution / achievement) ----
  private fxType: 'none' | 'levelup' | 'evolution' | 'achievement' = 'none';
  private fxTime = 0;        // elapsed ms within the current fx
  private fxDuration = 0;
  private fxWaveTimer = 0;   // staggered sparkle waves during evolution

  // Mood expression system
  currentMood: MoodType = 'neutral';

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { willReadFrequently: true })!;

    // Crisp pixel art scaling
    this.ctx.imageSmoothingEnabled = false;

    // Register all animations
    for (const def of ANIMATION_DEFS) {
      this.animations.set(def.name, new SpriteAnimation(def));
    }

    this.currentAnimation = this.animations.get('idle') ?? null;
  }

  // ---- Spritesheet loading -------------------------------------------

  loadSpritesheet(src: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        this.spritesheet = img;
        resolve();
      };
      img.onerror = (e) => reject(new Error(`Failed to load spritesheet: ${src}`));
      img.src = src;
    });
  }

  // ---- Animation playback --------------------------------------------

  play(name: string): void {
    const anim = this.animations.get(name);
    if (!anim) return;
    if (this.currentAnimation === anim && !anim.finished) return;

    // Stop previous
    if (this.currentAnimation) {
      this.currentAnimation.reset();
    }

    anim.reset();
    this.currentAnimation = anim;
  }

  // ---- Update --------------------------------------------------------

  update(deltaTime: number): void {
    if (this.currentAnimation) {
      this.currentAnimation.update(deltaTime);
    }
    this.updateParticles(deltaTime);
    this.updateFx(deltaTime);
  }

  // ---- Celebration FX --------------------------------------------------

  /** Trigger a short, punchy level-up celebration. */
  playLevelUpFx(): void {
    this.fxType = 'levelup';
    this.fxTime = 0;
    this.fxDuration = 1200;
    this.burst('star', 16, 64, 78, 60);
    this.burst('note', 4, 64, 78, 50);
  }

  /** Trigger a longer, dramatic evolution ceremony. */
  playEvolutionFx(): void {
    this.fxType = 'evolution';
    this.fxTime = 0;
    this.fxDuration = 2600;
    this.fxWaveTimer = 0;
    this.burst('star', 22, 64, 78, 72);
    this.burst('heart', 8, 64, 78, 52);
  }

  /** Trigger a golden achievement-unlocked celebration. */
  playAchievementFx(): void {
    this.fxType = 'achievement';
    this.fxTime = 0;
    this.fxDuration = 1900;
    this.fxWaveTimer = 0;
    this.burst('star', 18, 64, 78, 72);
    this.burst('note', 5, 64, 78, 56);
  }

  private updateFx(deltaTime: number): void {
    if (this.fxType === 'none') return;
    this.fxTime += deltaTime;

    // Evolution keeps emitting sparkle waves until near the end.
    if (this.fxType === 'evolution') {
      this.fxWaveTimer += deltaTime;
      if (this.fxWaveTimer >= 240 && this.fxTime < this.fxDuration - 400) {
        this.fxWaveTimer = 0;
        this.burst('star', 6, 64, 70 - Math.random() * 18, 84);
      }
    }

    if (this.fxTime >= this.fxDuration) {
      this.fxType = 'none';
      this.fxTime = 0;
    }
  }

  /** Spawn `n` particles scattered around (x, y) within ±spread. */
  private burst(type: ParticleType, n: number, x: number, y: number, spread: number): void {
    for (let i = 0; i < n; i++) {
      this.addParticle(
        type,
        x + (Math.random() - 0.5) * spread,
        y + (Math.random() - 0.5) * spread,
      );
    }
  }

  /** Current sprite scale multiplier driven by the active fx. */
  private fxScale(): number {
    if (this.fxType === 'none') return 1;
    const p = this.fxTime / this.fxDuration;
    if (this.fxType === 'levelup') return 1 + 0.22 * Math.sin(p * Math.PI);
    if (this.fxType === 'achievement') return 1 + 0.24 * Math.sin(p * Math.PI);
    // evolution: bigger pop + a little wobble that settles
    return 1 + 0.3 * Math.sin(p * Math.PI) + 0.04 * Math.sin(p * 30) * (1 - p);
  }

  /** Radial glow drawn BEHIND the pet during fx. */
  private renderFxGlow(ctx: CanvasRenderingContext2D): void {
    if (this.fxType === 'none') return;
    const p = this.fxTime / this.fxDuration;
    const cx = 64, cy = 78;
    const isEvo = this.fxType === 'evolution';
    const isAch = this.fxType === 'achievement';
    const rgb = isEvo ? '255,250,230' : (isAch ? '255,225,140' : '255,215,0');
    const peakA = isEvo ? 0.85 : (isAch ? 0.7 : 0.5);
    const maxR = isEvo ? 96 : (isAch ? 82 : 64);

    const a = Math.sin(p * Math.PI) * peakA;
    const r = maxR * (0.35 + 0.65 * p);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, `rgba(${rgb},${a})`);
    g.addColorStop(1, `rgba(${rgb},0)`);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    ctx.restore();
  }

  /** Expanding rings drawn ON TOP of the pet during fx. */
  private renderFxRings(ctx: CanvasRenderingContext2D): void {
    if (this.fxType === 'none') return;
    const cx = 64, cy = 78;
    const p = this.fxTime / this.fxDuration;

    const drawRing = (rp: number, color: string): void => {
      if (rp <= 0 || rp >= 1) return;
      ctx.globalAlpha = (1 - rp) * 0.9;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, 8 + rp * 70, 0, Math.PI * 2);
      ctx.stroke();
    };

    ctx.save();
    if (this.fxType === 'levelup') {
      drawRing(p, '#FFD700');
    } else if (this.fxType === 'achievement') {
      drawRing(p, '#FFD700');
      drawRing((p - 0.22) / 0.78, '#FFE9A0');
    } else {
      drawRing(p, '#FFFFFF');
      drawRing((p - 0.25) / 0.75, '#FFB7D5');
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // ---- Render --------------------------------------------------------

  render(facingRight: boolean): void {
    const { ctx, canvas } = this;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;

    // Celebration glow sits BEHIND the pet.
    this.renderFxGlow(ctx);

    // During a celebration the pet pops/scales around its centre.
    const scale = this.fxScale();
    const scaling = scale !== 1;
    if (scaling) {
      ctx.save();
      ctx.translate(64, 78);
      ctx.scale(scale, scale);
      ctx.translate(-64, -78);
    }

    if (this.spritesheet && this.currentAnimation) {
      this.renderFromSpritesheet(facingRight);
    } else {
      // Fallback: draw programmatic pixel cat
      const state = this.currentAnimation?.name ?? 'idle';
      const frame = this.currentAnimation?.currentFrame ?? 0;
      this.drawFallbackPet(state, frame, facingRight);
    }

    // Equipped cosmetics (hat / glasses / bowtie) sit on the pet
    this.renderEquipment(ctx, facingRight);

    if (scaling) ctx.restore();

    // Expanding celebration rings sit ON TOP of the pet.
    this.renderFxRings(ctx);

    // Particles on top
    this.renderParticles(ctx);

    // Mood indicator overlay (top-right corner, above everything)
    this.renderMoodIndicator(ctx);
  }

  /**
   * Draw equipped cosmetics over the pet, fitted to the current
   * species (head/eye/neck anchors + size) and nudged toward the
   * facing direction so they sit naturally rather than floating.
   */
  private renderEquipment(ctx: CanvasRenderingContext2D, facingRight: boolean): void {
    const base = SPECIES_ANCHORS[this.species] || DEFAULT_ANCHOR;
    const s = base.scale;
    // Ride the pet's vertical bob (sprite units → canvas px) so cosmetics
    // stay glued to the head instead of floating above it.
    const bob = this.lastBodyOffset * SPRITE_SCALE;
    const a = { headY: base.headY + bob, eyeY: base.eyeY + bob, neckY: base.neckY + bob };
    // Nudge head-worn items slightly toward where the pet is looking.
    const cx = CANVAS_SIZE / 2 + (facingRight ? 2 : -2);
    const R = Math.round;
    // Scaled-rect helper.
    const rect = (x: number, y: number, w: number, h: number): void => {
      ctx.fillRect(R(cx + x * s), R(y), R(w * s), R(h * s));
    };

    // ---- Hats ----
    if (this.equipped.hat === 'red-hat') {
      const top = a.headY;
      ctx.fillStyle = '#CC2222';
      rect(-14, R(top + 8 * s), 28, 4);   // brim
      rect(-9, R(top - 6 * s), 18, 14);   // crown
      ctx.fillStyle = '#8B1A1A';
      rect(-9, R(top + 4 * s), 18, 3);    // band
    } else if (this.equipped.hat === 'crown') {
      const top = a.headY;
      ctx.fillStyle = '#FFD700';
      rect(-12, R(top + 4 * s), 24, 6);   // base
      for (let i = -1; i <= 1; i++) {
        rect(i * 9 - 2, R(top - 4 * s), 4, 8); // spikes
      }
      ctx.fillStyle = '#FF5577';
      rect(-1, R(top + 5 * s), 2, 2);     // jewel
    } else if (this.equipped.hat === 'santa-hat') {
      const top = a.headY;
      ctx.fillStyle = '#CC2222';
      rect(-9, R(top - 2 * s), 18, 6);    // cone tiers
      rect(-6, R(top - 8 * s), 12, 6);
      rect(-3, R(top - 14 * s), 6, 6);
      ctx.fillStyle = '#FFFFFF';
      rect(-11, R(top + 3 * s), 22, 4);   // fur trim
      rect(-2, R(top - 18 * s), 4, 4);    // pompom
    } else if (this.equipped.hat === 'straw-hat') {
      const top = a.headY;
      ctx.fillStyle = '#E8C87A';
      rect(-15, R(top + 6 * s), 30, 4);   // wide brim
      rect(-8, R(top - 2 * s), 16, 9);    // dome
      ctx.fillStyle = '#B5894A';
      rect(-8, R(top + 3 * s), 16, 2);    // band
    } else if (this.equipped.hat === 'flower-crown') {
      const top = a.headY;
      ctx.fillStyle = '#7CC47C';
      rect(-13, R(top + 3 * s), 26, 2);   // green base
      const flowers = ['#FF8FBE', '#FFD36B', '#A0E0A0', '#B79CFF', '#FF9A9A'];
      for (let i = 0; i < 5; i++) {
        ctx.fillStyle = flowers[i];
        rect(-12 + i * 5, R(top), 4, 4);  // flowers
      }
    }

    // ---- Glasses ----
    if (this.equipped.glasses === 'sunglasses') {
      const ey = a.eyeY;
      ctx.fillStyle = '#1A1A1A';
      rect(-13, ey, 11, 7);               // left lens
      rect(2, ey, 11, 7);                 // right lens
      rect(-2, R(ey + 1), 4, 2);          // bridge
    } else if (this.equipped.glasses === 'round-glasses') {
      const ey = a.eyeY;
      ctx.fillStyle = '#5A4A55';
      rect(-12, ey, 9, 7);                // left frame
      rect(3, ey, 9, 7);                  // right frame
      rect(-3, R(ey + 2), 6, 1);          // bridge
      ctx.fillStyle = '#CFEAFF';
      rect(-11, R(ey + 1), 7, 5);         // left glass
      rect(4, R(ey + 1), 7, 5);           // right glass
    } else if (this.equipped.glasses === 'heart-glasses') {
      const ey = a.eyeY;
      ctx.fillStyle = '#FF5FA0';
      rect(-13, ey, 11, 7);
      rect(2, ey, 11, 7);
      rect(-2, R(ey + 1), 4, 2);          // bridge
      ctx.fillStyle = '#FFC0DC';
      rect(-11, R(ey + 1), 4, 2);         // shine
      rect(4, R(ey + 1), 4, 2);
    }

    // ---- Accessory ----
    if (this.equipped.accessory === 'bowtie') {
      const ny = a.neckY;
      ctx.fillStyle = '#FF6FA8';
      rect(-9, ny, 7, 7);                 // left wing
      rect(2, ny, 7, 7);                  // right wing
      ctx.fillStyle = '#E0407E';
      rect(-2, R(ny + 1), 4, 5);          // knot
    } else if (this.equipped.accessory === 'bell') {
      const ny = a.neckY;
      ctx.fillStyle = '#C0392B';
      rect(-10, ny, 20, 2);               // red collar
      ctx.fillStyle = '#FFD700';
      rect(-2, R(ny + 1), 4, 4);          // gold bell
      ctx.fillStyle = '#9C7A00';
      rect(-1, R(ny + 4), 2, 1);          // clapper
    } else if (this.equipped.accessory === 'scarf') {
      const ny = a.neckY;
      ctx.fillStyle = '#E0723C';
      rect(-10, R(ny - 1), 20, 5);        // wrap
      rect(4, R(ny + 3), 5, 9);           // hanging end
      ctx.fillStyle = '#C85A2C';
      rect(4, R(ny + 3), 5, 1);           // stripe
    }
  }

  // ---- Mood system ---------------------------------------------------

  /**
   * Update the current mood based on the pet's live needs values.
   * Called each frame from the main update loop.
   */
  updateMood(needs: { hunger: number; energy: number; happiness: number; cleanliness: number }): void {
    if (needs.happiness > 70 && needs.hunger < 50) {
      this.currentMood = 'happy';
    } else if (needs.hunger > 70) {
      this.currentMood = 'hungry';
    } else if (needs.energy < 30) {
      this.currentMood = 'sleepy';
    } else if (needs.cleanliness < 30) {
      this.currentMood = 'dirty';
    } else if (needs.happiness < 30) {
      this.currentMood = 'sad';
    } else {
      this.currentMood = 'neutral';
    }
  }

  /**
   * Draw a 12x12 pixel-art mood emoji in the top-right corner of the canvas.
   * Rendered after the pet and particles so it always appears on top.
   */
  renderMoodIndicator(ctx: CanvasRenderingContext2D): void {
    // Fixed position: top-right corner with 2px padding from edges
    const ox = CANVAS_SIZE - 14; // 128 - 14 = 114
    const oy = 2;

    ctx.save();

    // Translate to the indicator origin; all drawing below is in 0-11 space
    ctx.translate(ox, oy);

    // Helper: draw a single pixel in the 12x12 mood icon
    const px = (x: number, y: number, color: string): void => {
      ctx.fillStyle = color;
      ctx.fillRect(Math.floor(x), Math.floor(y), 1, 1);
    };

    // Shared face outline (12x12 circle) — rows 0-11:
    //   Row  0: cols 4-7   (4 px)
    //   Row  1: cols 2-9   (8 px)
    //   Row 2-9: cols 0-11 (12 px each)
    //   Row 10: cols 2-9   (8 px)
    //   Row 11: cols 4-7   (4 px)
    const drawFace = (color: string): void => {
      ctx.fillStyle = color;
      ctx.fillRect(4, 0, 4, 1);
      ctx.fillRect(2, 1, 8, 1);
      for (let row = 2; row <= 9; row++) {
        ctx.fillRect(0, row, 12, 1);
      }
      ctx.fillRect(2, 10, 8, 1);
      ctx.fillRect(4, 11, 4, 1);
    };

    switch (this.currentMood) {
      // ---- Happy: yellow smiley face ----
      case 'happy': {
        drawFace('#FFD700');
        // Eyes (dark)
        ctx.fillStyle = '#333333';
        ctx.fillRect(3, 4, 2, 2);
        ctx.fillRect(7, 4, 2, 2);
        // Smile (upturned corners)
        px(3, 7, '#333333');
        ctx.fillRect(4, 8, 4, 1);
        px(8, 7, '#333333');
        break;
      }

      // ---- Neutral: plain gray circle ----
      case 'neutral': {
        drawFace('#AAAAAA');
        break;
      }

      // ---- Sad: blue face with downturned mouth ----
      case 'sad': {
        drawFace('#6699FF');
        // Eyes (dark)
        ctx.fillStyle = '#222244';
        ctx.fillRect(3, 4, 2, 2);
        ctx.fillRect(7, 4, 2, 2);
        // Frown (downturned corners)
        px(3, 8, '#222244');
        ctx.fillRect(4, 7, 4, 1);
        px(8, 8, '#222244');
        break;
      }

      // ---- Hungry: orange face with open mouth ----
      case 'hungry': {
        drawFace('#FF9944');
        // Eyes (dark)
        ctx.fillStyle = '#332200';
        ctx.fillRect(3, 3, 2, 2);
        ctx.fillRect(7, 3, 2, 2);
        // Open mouth (dark oval area)
        ctx.fillStyle = '#CC6622';
        ctx.fillRect(4, 6, 4, 1);
        ctx.fillRect(3, 7, 6, 2);
        ctx.fillRect(4, 9, 4, 1);
        break;
      }

      // ---- Sleepy: purple face with closed eyes + zzz ----
      case 'sleepy': {
        drawFace('#AA77CC');
        // Closed eyes (horizontal lines)
        ctx.fillStyle = '#442255';
        ctx.fillRect(2, 5, 3, 1);
        ctx.fillRect(7, 5, 3, 1);
        // Small neutral mouth
        ctx.fillRect(4, 8, 4, 1);
        // ZZZ floating up and to the right
        ctx.fillStyle = '#DDBBEE';
        ctx.fillRect(11, 0, 3, 1);
        ctx.fillRect(11, 1, 3, 1);
        ctx.fillStyle = '#CCAAEE';
        ctx.fillRect(11, 3, 2, 1);
        ctx.fillRect(11, 4, 2, 1);
        ctx.fillStyle = '#BB99DD';
        px(11, 6, '#BB99DD');
        px(12, 6, '#BB99DD');
        break;
      }

      // ---- Dirty: green face with stink lines ----
      case 'dirty': {
        drawFace('#88AA44');
        // Squinting eyes
        ctx.fillStyle = '#445522';
        ctx.fillRect(3, 4, 2, 1);
        ctx.fillRect(7, 4, 2, 1);
        // Slightly open mouth
        ctx.fillRect(4, 7, 4, 1);
        // Wavy stink lines rising above the face
        ctx.fillStyle = '#AACC66';
        px(2, 0, '#AACC66');
        px(3, 1, '#AACC66');
        px(2, 2, '#AACC66');
        px(5, 0, '#AACC66');
        px(6, 1, '#AACC66');
        px(5, 2, '#AACC66');
        px(9, 0, '#AACC66');
        px(10, 1, '#AACC66');
        px(9, 2, '#AACC66');
        break;
      }
    }

    ctx.restore();
  }

  private renderFromSpritesheet(facingRight: boolean): void {
    const { ctx, canvas, spritesheet, currentAnimation } = this;
    if (!spritesheet || !currentAnimation) return;

    const frameIndex = currentAnimation.getCurrentFrame();
    const sx = frameIndex * SPRITE_SIZE;
    const sy = 0;

    // Center the scaled sprite on the canvas
    const renderSize = SPRITE_SIZE * SPRITE_SCALE;
    const dx = Math.floor((canvas.width - renderSize) / 2);
    const dy = Math.floor(canvas.height - renderSize);

    if (facingRight) {
      // Flip horizontally
      ctx.save();
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(
        spritesheet,
        sx, sy, SPRITE_SIZE, SPRITE_SIZE,
        dx, dy, renderSize, renderSize,
      );
      ctx.restore();
    } else {
      ctx.drawImage(
        spritesheet,
        sx, sy, SPRITE_SIZE, SPRITE_SIZE,
        dx, dy, renderSize, renderSize,
      );
    }
  }

  // ---- Alpha hit-testing ---------------------------------------------

  getPixelAlpha(x: number, y: number): number {
    const { ctx } = this;
    const px = Math.floor(x);
    const py = Math.floor(y);
    if (px < 0 || py < 0 || px >= this.canvas.width || py >= this.canvas.height) return 0;
    const data = ctx.getImageData(px, py, 1, 1).data;
    return data[3];
  }

  // ---- Particle system -----------------------------------------------

  addParticle(
    type: ParticleType,
    x: number,
    y: number,
  ): void {
    const base: Particle = {
      type, x, y,
      vx: 0, vy: 0,
      life: 1000, maxLife: 1000,
      size: 3,
      rotation: 0,
      rotationSpeed: 0,
    };

    switch (type) {
      case 'dust':
        base.vx = (Math.random() - 0.5) * 30;
        base.vy = -Math.random() * 20 - 10;
        base.life = base.maxLife = 600;
        base.size = 2 + Math.random() * 2;
        break;
      case 'star':
        base.vx = (Math.random() - 0.5) * 40;
        base.vy = -Math.random() * 50 - 20;
        base.life = base.maxLife = 800;
        base.size = 3;
        base.rotationSpeed = (Math.random() - 0.5) * 6;
        break;
      case 'heart':
        base.vx = (Math.random() - 0.5) * 15;
        base.vy = -Math.random() * 30 - 15;
        base.life = base.maxLife = 1200;
        base.size = 4;
        break;
      case 'stink':
        base.vx = (Math.random() - 0.5) * 8;
        base.vy = -Math.random() * 15 - 5;
        base.life = base.maxLife = 1500;
        base.size = 3;
        break;
      case 'zzz':
        base.vx = Math.random() * 10 + 5;
        base.vy = -Math.random() * 15 - 8;
        base.life = base.maxLife = 2000;
        base.size = 5;
        break;
      case 'note':
        base.vx = (Math.random() - 0.5) * 20;
        base.vy = -Math.random() * 25 - 10;
        base.life = base.maxLife = 1000;
        base.size = 3;
        base.rotationSpeed = (Math.random() - 0.5) * 4;
        break;
    }

    this.particles.push(base);
  }

  updateParticles(deltaTime: number): void {
    const dt = deltaTime / 1000;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= deltaTime;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rotation += p.rotationSpeed * dt;

      // Gentle gravity for dust
      if (p.type === 'dust') {
        p.vy += 30 * dt;
      }
    }
  }

  renderParticles(ctx: CanvasRenderingContext2D): void {
    for (const p of this.particles) {
      const alpha = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = alpha;

      switch (p.type) {
        case 'dust':
          ctx.fillStyle = '#C8B89A';
          ctx.fillRect(
            Math.round(p.x), Math.round(p.y),
            Math.ceil(p.size), Math.ceil(p.size),
          );
          break;

        case 'star':
          this.drawPixelStar(ctx, Math.round(p.x), Math.round(p.y), p.size);
          break;

        case 'heart':
          this.drawPixelHeart(ctx, Math.round(p.x), Math.round(p.y), p.size);
          break;

        case 'stink':
          ctx.fillStyle = '#8B9A6B';
          ctx.beginPath();
          ctx.arc(Math.round(p.x), Math.round(p.y), p.size, 0, Math.PI * 2);
          ctx.fill();
          break;

        case 'zzz':
          ctx.fillStyle = '#AABBDD';
          ctx.font = `bold ${Math.round(p.size * 2)}px monospace`;
          ctx.fillText('z', Math.round(p.x), Math.round(p.y));
          break;

        case 'note':
          this.drawPixelNote(ctx, Math.round(p.x), Math.round(p.y), p.size);
          break;
      }
    }
    ctx.globalAlpha = 1;
  }

  // ---- Pixel-art particle shapes ------------------------------------

  private drawPixelStar(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
    ctx.fillStyle = '#FFD700';
    const r = Math.max(1, Math.round(s / 2));
    ctx.fillRect(x - 1, y - r, 2, r * 2 + 1);
    ctx.fillRect(x - r, y - 1, r * 2 + 1, 2);
    ctx.fillStyle = '#FFEE88';
    ctx.fillRect(x, y, 1, 1);
  }

  private drawPixelHeart(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
    ctx.fillStyle = '#FF6B8A';
    const u = Math.max(1, Math.round(s / 3));
    // Two bumps + triangle bottom
    ctx.fillRect(x - u * 2, y - u, u * 2, u);
    ctx.fillRect(x + 1, y - u, u * 2, u);
    ctx.fillRect(x - u * 2, y, u * 4 + 1, u);
    ctx.fillRect(x - u, y + u, u * 2 + 1, u);
    ctx.fillRect(x, y + u * 2, 1, u);
  }

  private drawPixelNote(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
    ctx.fillStyle = '#6B8AFF';
    const u = Math.max(1, Math.round(s / 2));
    // Note head
    ctx.fillRect(x - u, y, u * 2, u);
    // Stem
    ctx.fillRect(x + u - 1, y - u * 3, 1, u * 3);
    // Flag
    ctx.fillRect(x + u, y - u * 3, u, 1);
    ctx.fillRect(x + u + 1, y - u * 2, u - 1, 1);
  }

  // ================================================================
  // FALLBACK PIXEL CAT
  // ================================================================
  //
  // Draws a charming 32x32 pixel-art cat using canvas fillRect.
  // The cat is rendered in SPRITE_SIZE space, then the canvas
  // transform scales it up by SPRITE_SCALE onto the CANVAS_SIZE.
  //
  // Design: chibi orange tabby with big eyes, pointy ears, and
  // a fluffy tail. Different poses for each pet state.
  // ================================================================

  drawFallbackPet(state: string, frame: number, facingRight: boolean): void {
    const ctx = this.ctx;

    ctx.save();

    // Set up coordinate space: 32x32 scaled to fill the canvas area
    const renderSize = SPRITE_SIZE * SPRITE_SCALE;
    const offsetX = Math.floor((CANVAS_SIZE - renderSize) / 2);
    const offsetY = CANVAS_SIZE - renderSize;

    ctx.translate(offsetX, offsetY);
    ctx.scale(SPRITE_SCALE, SPRITE_SCALE);

    // Flip for facing direction
    if (facingRight) {
      ctx.translate(SPRITE_SIZE, 0);
      ctx.scale(-1, 1);
    }

    // ---- Multi-species dispatch ----
    if (this.species !== 'cat' && SPECIES_DRAWERS[this.species]) {
      ctx.beginPath();
      ctx.rect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
      ctx.clip();
      const drawer = SPECIES_DRAWERS[this.species];
      drawer(ctx, this.breedColors, frame, state);
      ctx.restore();
      // Approximate idle bob so cosmetics ride along with the body.
      this.lastBodyOffset = [0, -1, -1, 0, 1, 1][frame % 6];
      return;
    }

    // ---- Cat fallback (original implementation) ----
    const c = this.breedColors || PET_COLORS.cat;

    // Pixel helper (1x1 unit in sprite space)
    const px = (x: number, y: number, color: string) => {
      ctx.fillStyle = color;
      ctx.fillRect(Math.floor(x), Math.floor(y), 1, 1);
    };

    // ---- Compute per-state pose parameters -------------------------

    let bodyOff = 0;         // vertical offset for whole body
    let headExtra = 0;       // additional head offset
    let eyesClosed = false;
    let eyesSquint = false;
    let eyesWide = false;
    let mouthOpen = false;
    let walkLegs = false;
    let tailFlip = false;
    let showBellyBig = false;
    let showZzz = false;
    let showSparkle = false;
    let showExclaim = false;
    let showBlush = false;
    let showSweat = false;
    let curlUp = false;
    let showRod = false;
    let bobberY = 0;
    let dangleLegs = false;
    let showBubbles = false;

    switch (state) {
      case 'idle': {
        // Gentle breathing: body bobs up/down by 1 pixel
        bodyOff = [0, -1, 0, 0, 1, 0][frame % 6];
        break;
      }
      case 'walk': {
        walkLegs = (frame % 2) === 0;
        bodyOff = [0, -1, 0, 0, -1, 0][frame % 6];
        tailFlip = (frame % 3) === 0;
        break;
      }
      case 'eat':
      case 'eat-fast': {
        headExtra = [1, 2, 3, 2, 1][frame % 5];
        mouthOpen = frame % 2 === 0;
        break;
      }
      case 'stuffed': {
        showBellyBig = true;
        bodyOff = [0, 0, 1, 0][frame % 4];
        break;
      }
      case 'poop': {
        bodyOff = [0, 1, 2, 1, 0, 0][frame % 6];
        eyesSquint = frame >= 1 && frame <= 4;
        break;
      }
      case 'selfplay': {
        bodyOff = [0, -2, -4, -5, -4, -2, 0, 1][frame % 8];
        tailFlip = frame % 2 === 0;
        break;
      }
      case 'daydream': {
        bodyOff = [0, 0, -1, -1, 0, 0][frame % 6];
        showSparkle = true;
        break;
      }
      case 'drag': {
        dangleLegs = true;
        bodyOff = [0, 1, 0][frame % 3];
        showSweat = true;
        break;
      }
      case 'sleep': {
        curlUp = true;
        showZzz = true;
        break;
      }
      case 'fish': {
        showRod = true;
        bobberY = [0, -1, -2, -1, 0, 1][frame % 6];
        bodyOff = [0, 0, 0, -1, 0, 0][frame % 6];
        break;
      }
      case 'chat': {
        mouthOpen = frame % 2 === 0;
        showBubbles = true;
        bodyOff = [0, -1, 0, 0][frame % 4];
        break;
      }
      case 'interact-pet':
      case 'interact': {
        eyesSquint = true;
        showBlush = true;
        bodyOff = [0, -1, -1, 0][frame % 4];
        break;
      }
      case 'surprised': {
        eyesWide = true;
        mouthOpen = true;
        bodyOff = [0, -2, -1][frame % 3];
        showExclaim = true;
        break;
      }
      default: {
        bodyOff = [0, -1, 0, 0, 1, 0][frame % 6];
      }
    }

    // ================================================================
    // DRAW THE CAT
    // ================================================================
    //
    // Anatomy layout in 32x32 sprite space (facing left):
    //
    //   Row  2-6   : Ears (triangles)
    //   Row  7-14  : Head (14 wide, centred)
    //   Row 10-11  : Eyes (inside head)
    //   Row  9-13  : Ear tufts (dark tips)
    //   Row 13     : Nose + whiskers
    //   Row 15-22  : Body
    //   Row 17-21  : Belly (inside body)
    //   Row 23-25  : Legs/feet
    //   Row 15-21  : Tail (right side, curling up)
    //
    // ================================================================

    if (curlUp) {
      this.drawSleepingCat(ctx, px, c, frame);
      ctx.restore();
      return;
    }

    const O = bodyOff; // shorthand vertical offset
    this.lastBodyOffset = bodyOff; // so cosmetics bob with the cat

    // ---- Tail (drawn first, behind body) ----------------------------
    ctx.fillStyle = c.body;
    if (tailFlip) {
      ctx.fillRect(22, 21 + O, 3, 2);
      ctx.fillRect(24, 18 + O, 2, 4);
      ctx.fillRect(25, 15 + O, 2, 4);
      ctx.fillRect(24, 13 + O, 2, 3);
      ctx.fillStyle = c.bodyDark;
      px(25, 13 + O, c.bodyDark);
      px(24, 13 + O, c.bodyDark);
    } else {
      ctx.fillRect(22, 20 + O, 3, 2);
      ctx.fillRect(24, 17 + O, 2, 4);
      ctx.fillRect(25, 14 + O, 2, 4);
      ctx.fillRect(24, 12 + O, 2, 3);
      ctx.fillStyle = c.bodyDark;
      px(25, 12 + O, c.bodyDark);
      px(24, 12 + O, c.bodyDark);
    }

    // ---- Ears (behind head) -----------------------------------------
    // Left ear
    ctx.fillStyle = c.body;
    ctx.fillRect(9,  3 + O, 3, 1);
    ctx.fillRect(8,  4 + O, 5, 1);
    ctx.fillRect(8,  5 + O, 5, 1);
    ctx.fillRect(8,  6 + O, 5, 1);
    ctx.fillRect(8,  7 + O, 5, 1);
    // Right ear
    ctx.fillRect(19, 3 + O, 3, 1);
    ctx.fillRect(18, 4 + O, 5, 1);
    ctx.fillRect(18, 5 + O, 5, 1);
    ctx.fillRect(18, 6 + O, 5, 1);
    ctx.fillRect(18, 7 + O, 5, 1);

    // Ear inner (pink)
    ctx.fillStyle = c.earInner;
    ctx.fillRect(10, 4 + O, 2, 1);
    ctx.fillRect(9,  5 + O, 3, 1);
    ctx.fillRect(9,  6 + O, 3, 1);
    ctx.fillRect(20, 4 + O, 2, 1);
    ctx.fillRect(19, 5 + O, 3, 1);
    ctx.fillRect(19, 6 + O, 3, 1);

    // Ear tufts (dark tips)
    px(9,  3 + O, c.bodyDark);
    px(21, 3 + O, c.bodyDark);
    px(8,  4 + O, c.bodyDark);
    px(22, 4 + O, c.bodyDark);

    // ---- Head -------------------------------------------------------
    ctx.fillStyle = c.body;
    ctx.fillRect(8,  8 + O, 15, 1);
    ctx.fillRect(7,  9 + O, 17, 1);
    ctx.fillRect(7, 10 + O, 17, 1);
    ctx.fillRect(7, 11 + O, 17, 1);
    ctx.fillRect(7, 12 + O, 17, 1);
    ctx.fillRect(7, 13 + O, 17, 1);
    ctx.fillRect(8, 14 + O, 15, 1);

    // ---- Eyes -------------------------------------------------------
    const eyeY = 10 + O + headExtra;
    if (eyesClosed || eyesSquint) {
      // Closed / happy squint: horizontal line
      ctx.fillStyle = c.eye;
      ctx.fillRect(9,  eyeY + 1, 4, 1);
      ctx.fillRect(18, eyeY + 1, 4, 1);
    } else if (eyesWide) {
      // Surprised: bigger eyes
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(9,  eyeY - 1, 4, 4);
      ctx.fillRect(18, eyeY - 1, 4, 4);
      ctx.fillStyle = c.eye;
      ctx.fillRect(10, eyeY,     3, 3);
      ctx.fillRect(19, eyeY,     3, 3);
      ctx.fillStyle = '#FFFFFF';
      px(10, eyeY,     '#FFFFFF');
      px(19, eyeY,     '#FFFFFF');
    } else {
      // Normal eyes: white sclera + dark pupil + highlight
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(9,  eyeY, 4, 3);
      ctx.fillRect(18, eyeY, 4, 3);
      ctx.fillStyle = c.eye;
      ctx.fillRect(10, eyeY,     3, 3);
      ctx.fillRect(19, eyeY,     3, 3);
      // Pupil center
      ctx.fillRect(11, eyeY + 1, 1, 1);
      ctx.fillRect(20, eyeY + 1, 1, 1);
      // Highlight
      ctx.fillStyle = '#FFFFFF';
      px(10, eyeY,     '#FFFFFF');
      px(19, eyeY,     '#FFFFFF');
    }

    // ---- Blush marks ------------------------------------------------
    if (showBlush) {
      ctx.fillStyle = '#FFB8C6';
      ctx.fillRect(7,  12 + O + headExtra, 2, 1);
      ctx.fillRect(22, 12 + O + headExtra, 2, 1);
    }

    // ---- Nose -------------------------------------------------------
    ctx.fillStyle = c.nose;
    ctx.fillRect(15, 13 + O + headExtra, 2, 1);

    // ---- Mouth ------------------------------------------------------
    if (mouthOpen) {
      ctx.fillStyle = c.nose;
      px(14, 14 + O + headExtra, c.nose);
      px(15, 14 + O + headExtra, c.nose);
      px(16, 14 + O + headExtra, c.nose);
      px(15, 15 + O + headExtra, c.nose);
    } else {
      px(14, 14 + O + headExtra, c.bodyDark);
      px(16, 14 + O + headExtra, c.bodyDark);
    }

    // ---- Whiskers ---------------------------------------------------
    ctx.fillStyle = c.bodyDark;
    ctx.fillRect(3,  11 + O + headExtra, 4, 1);
    ctx.fillRect(4,  13 + O + headExtra, 3, 1);
    ctx.fillRect(24, 11 + O + headExtra, 4, 1);
    ctx.fillRect(24, 13 + O + headExtra, 3, 1);

    // ---- Body -------------------------------------------------------
    ctx.fillStyle = c.body;
    ctx.fillRect(10, 15 + O, 11, 1);
    ctx.fillRect(9,  16 + O, 13, 1);
    ctx.fillRect(8,  17 + O, 15, 1);
    ctx.fillRect(8,  18 + O, 15, 1);
    ctx.fillRect(8,  19 + O, 15, 1);
    ctx.fillRect(8,  20 + O, 15, 1);
    ctx.fillRect(9,  21 + O, 13, 1);
    ctx.fillRect(10, 22 + O, 11, 1);

    // Belly
    ctx.fillStyle = c.belly;
    if (showBellyBig) {
      // Wider belly for stuffed state
      ctx.fillRect(9,  17 + O, 13, 1);
      ctx.fillRect(8,  18 + O, 15, 1);
      ctx.fillRect(8,  19 + O, 15, 1);
      ctx.fillRect(8,  20 + O, 15, 1);
      ctx.fillRect(9,  21 + O, 13, 1);
    } else {
      ctx.fillRect(12, 17 + O, 7, 1);
      ctx.fillRect(11, 18 + O, 9, 1);
      ctx.fillRect(11, 19 + O, 9, 1);
      ctx.fillRect(11, 20 + O, 9, 1);
      ctx.fillRect(12, 21 + O, 7, 1);
    }

    // Body stripe markings (tabby pattern)
    ctx.fillStyle = c.bodyDark;
    ctx.fillRect(10, 16 + O, 1, 1);
    ctx.fillRect(20, 16 + O, 1, 1);
    ctx.fillRect(9,  18 + O, 1, 1);
    ctx.fillRect(21, 18 + O, 1, 1);
    ctx.fillRect(9,  20 + O, 1, 1);
    ctx.fillRect(21, 20 + O, 1, 1);

    // ---- Legs -------------------------------------------------------
    if (dangleLegs) {
      // Dangling legs (drag state): spread apart, hanging
      ctx.fillStyle = c.body;
      ctx.fillRect(9,  23 + O, 3, 3);
      ctx.fillRect(18, 23 + O, 3, 3);
      ctx.fillStyle = c.bodyDark;
      ctx.fillRect(9,  26 + O, 3, 1);
      ctx.fillRect(18, 26 + O, 3, 1);
      // Arms dangling
      ctx.fillStyle = c.body;
      ctx.fillRect(6,  18 + O, 2, 4);
      ctx.fillRect(23, 18 + O, 2, 4);
      ctx.fillStyle = c.bodyDark;
      px(6,  22 + O, c.bodyDark);
      px(7,  22 + O, c.bodyDark);
      px(23, 22 + O, c.bodyDark);
      px(24, 22 + O, c.bodyDark);
    } else if (walkLegs) {
      // Walk phase A: left forward, right back
      ctx.fillStyle = c.body;
      ctx.fillRect(8,  23 + O, 3, 2);
      ctx.fillRect(18, 24 + O, 3, 2);
      ctx.fillStyle = c.bodyDark;
      ctx.fillRect(8,  25 + O, 3, 1);
      ctx.fillRect(18, 26 + O, 3, 1);
      // Back legs
      ctx.fillStyle = c.body;
      ctx.fillRect(12, 23 + O, 3, 2);
      ctx.fillRect(15, 24 + O, 3, 2);
      ctx.fillStyle = c.bodyDark;
      ctx.fillRect(12, 25 + O, 3, 1);
      ctx.fillRect(15, 26 + O, 3, 1);
    } else {
      // Normal standing legs
      ctx.fillStyle = c.body;
      ctx.fillRect(10, 23 + O, 3, 2);
      ctx.fillRect(18, 23 + O, 3, 2);
      ctx.fillStyle = c.bodyDark;
      ctx.fillRect(10, 25 + O, 3, 1);
      ctx.fillRect(18, 25 + O, 3, 1);
      // Back legs (slightly behind)
      ctx.fillStyle = c.body;
      ctx.fillRect(12, 23 + O, 2, 2);
      ctx.fillRect(16, 23 + O, 2, 2);
      ctx.fillStyle = c.bodyDark;
      ctx.fillRect(12, 25 + O, 2, 1);
      ctx.fillRect(16, 25 + O, 2, 1);
    }

    // ---- State-specific overlays ------------------------------------

    // Sleep ZZZ
    if (showZzz) {
      const zf = frame % 4;
      ctx.fillStyle = '#AABBDD';
      px(24, 4 + (zf > 0 ? -1 : 0), '#AABBDD');
      px(25, 4 + (zf > 0 ? -1 : 0), '#AABBDD');
      px(24, 5 + (zf > 0 ? -1 : 0), '#AABBDD');
      if (zf >= 1) {
        px(26, 2, '#8899BB');
        px(27, 2, '#8899BB');
        px(26, 3, '#8899BB');
      }
      if (zf >= 2) {
        px(28, 0, '#667799');
        px(29, 0, '#667799');
        px(28, 1, '#667799');
      }
    }

    // Daydream sparkles
    if (showSparkle) {
      const sf = frame % 6;
      const positions = [
        [3, 2], [27, 4], [5, 1], [25, 1], [2, 5], [28, 3],
      ];
      for (let i = 0; i < 3; i++) {
        const idx = (sf + i * 2) % positions.length;
        const [sx, sy] = positions[idx];
        ctx.fillStyle = i % 2 === 0 ? '#FFD700' : '#FFEE88';
        px(sx, sy, ctx.fillStyle);
        px(sx + 1, sy, ctx.fillStyle);
        px(sx, sy + 1, ctx.fillStyle);
      }
    }

    // Surprised exclamation
    if (showExclaim) {
      ctx.fillStyle = '#FF4444';
      ctx.fillRect(15, 1, 2, 3);
      px(15, 5, '#FF4444');
      px(16, 5, '#FF4444');
    }

    // Sweat drop (drag)
    if (showSweat) {
      ctx.fillStyle = '#88CCFF';
      px(24, 8 + O, '#88CCFF');
      px(24, 9 + O, '#88CCFF');
      px(24, 10 + O, '#88CCFF');
    }

    // Chat bubbles
    if (showBubbles) {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillRect(24, 3, 6, 4);
      ctx.fillRect(25, 7, 2, 1);
      ctx.fillStyle = '#666666';
      ctx.fillRect(25, 4, 4, 1);
      ctx.fillRect(25, 5, 3, 1);
    }

    // Fishing rod
    if (showRod) {
      // Rod
      ctx.fillStyle = '#8B6914';
      ctx.fillRect(4, 5, 1, 18);
      ctx.fillRect(3, 4, 1, 1);
      ctx.fillRect(2, 3, 1, 1);
      ctx.fillRect(1, 2, 1, 1);
      // Line
      ctx.fillStyle = '#AAAAAA';
      px(1, 3, '#AAAAAA');
      px(1, 4, '#AAAAAA');
      px(1, 5, '#AAAAAA');
      px(1, 6 + bobberY, '#AAAAAA');
      px(1, 7 + bobberY, '#AAAAAA');
      // Bobber
      ctx.fillStyle = '#FF4444';
      px(0, 8 + bobberY, '#FF4444');
      px(1, 8 + bobberY, '#FF4444');
      px(0, 9 + bobberY, '#FFFFFF');
      px(1, 9 + bobberY, '#FFFFFF');
    }

    ctx.restore();
  }

  // ---- Sleeping (curled up) cat variant ----------------------------

  private drawSleepingCat(
    ctx: CanvasRenderingContext2D,
    px: (x: number, y: number, color: string) => void,
    c: typeof PET_COLORS.cat,
    frame: number,
  ): void {
    // Cat curled up: round body, tucked head, closed eyes
    const breathe = [0, 0, 1, 0][frame % 4];

    // Body (round mound)
    ctx.fillStyle = c.body;
    ctx.fillRect(7,  18 + breathe, 18, 1);
    ctx.fillRect(6,  19 + breathe, 20, 1);
    ctx.fillRect(5,  20 + breathe, 22, 1);
    ctx.fillRect(5,  21 + breathe, 22, 1);
    ctx.fillRect(5,  22 + breathe, 22, 1);
    ctx.fillRect(6,  23 + breathe, 20, 1);
    ctx.fillRect(7,  24 + breathe, 18, 1);
    ctx.fillRect(9,  25 + breathe, 14, 1);

    // Belly stripe
    ctx.fillStyle = c.belly;
    ctx.fillRect(10, 21 + breathe, 12, 1);
    ctx.fillRect(9,  22 + breathe, 14, 1);
    ctx.fillRect(10, 23 + breathe, 12, 1);

    // Body stripes
    ctx.fillStyle = c.bodyDark;
    px(7,  19 + breathe, c.bodyDark);
    px(24, 19 + breathe, c.bodyDark);
    px(6,  21 + breathe, c.bodyDark);
    px(25, 21 + breathe, c.bodyDark);

    // Head (tucked in, resting on paws)
    ctx.fillStyle = c.body;
    ctx.fillRect(7,  13 + breathe, 11, 1);
    ctx.fillRect(6,  14 + breathe, 13, 1);
    ctx.fillRect(6,  15 + breathe, 13, 1);
    ctx.fillRect(6,  16 + breathe, 13, 1);
    ctx.fillRect(6,  17 + breathe, 13, 1);
    ctx.fillRect(7,  18 + breathe, 11, 1);

    // Ears (folded/flat)
    ctx.fillRect(7,  11 + breathe, 3, 2);
    ctx.fillRect(14, 11 + breathe, 3, 2);
    ctx.fillStyle = c.earInner;
    px(8,  12 + breathe, c.earInner);
    px(15, 12 + breathe, c.earInner);

    // Closed eyes (peaceful line)
    ctx.fillStyle = c.eye;
    ctx.fillRect(8,  15 + breathe, 3, 1);
    ctx.fillRect(13, 15 + breathe, 3, 1);

    // Nose
    ctx.fillStyle = c.nose;
    px(11, 17 + breathe, c.nose);

    // Front paws tucked under chin
    ctx.fillStyle = c.body;
    ctx.fillRect(7, 18 + breathe, 3, 2);
    ctx.fillRect(14, 18 + breathe, 3, 2);
    ctx.fillStyle = c.bodyDark;
    ctx.fillRect(7, 20 + breathe, 3, 1);
    ctx.fillRect(14, 20 + breathe, 3, 1);

    // Tail (curled around body)
    ctx.fillStyle = c.body;
    ctx.fillRect(24, 22 + breathe, 3, 2);
    ctx.fillRect(26, 20 + breathe, 2, 3);
    ctx.fillRect(25, 18 + breathe, 2, 3);
    ctx.fillRect(23, 17 + breathe, 3, 2);
    ctx.fillStyle = c.bodyDark;
    px(23, 17 + breathe, c.bodyDark);
    px(24, 17 + breathe, c.bodyDark);

    // ZZZ floating up
    const zf = frame % 4;
    ctx.fillStyle = '#AABBDD';
    px(21, 10 + (zf > 0 ? -1 : 0), '#AABBDD');
    px(22, 10 + (zf > 0 ? -1 : 0), '#AABBDD');
    px(21, 11 + (zf > 0 ? -1 : 0), '#AABBDD');
    if (zf >= 1) {
      px(23, 7, '#8899BB');
      px(24, 7, '#8899BB');
      px(23, 8, '#8899BB');
    }
    if (zf >= 2) {
      px(25, 4, '#667799');
      px(26, 4, '#667799');
      px(25, 5, '#667799');
    }
    if (zf >= 3) {
      px(27, 2, '#556688');
      px(28, 2, '#556688');
    }
  }
}
