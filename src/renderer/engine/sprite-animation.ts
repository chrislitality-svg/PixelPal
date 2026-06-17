// ============================================================
// SpriteAnimation - Single animation sequence from a spritesheet
// ============================================================

export interface SpriteAnimationConfig {
  name: string;
  frames: number[];
  fps: number;
  loop: boolean;
}

export class SpriteAnimation {
  name: string;
  frames: number[];
  fps: number;
  loop: boolean;
  currentFrame: number;
  elapsed: number;
  finished: boolean;

  constructor(config: SpriteAnimationConfig) {
    this.name = config.name;
    this.frames = config.frames;
    this.fps = config.fps;
    this.loop = config.loop;
    this.currentFrame = 0;
    this.elapsed = 0;
    this.finished = false;
  }

  /**
   * Advance frames based on elapsed time and target FPS.
   * For non-looping animations, sets `finished = true` when the last frame is reached.
   */
  update(deltaTime: number): void {
    if (this.finished) return;

    this.elapsed += deltaTime;
    const frameDuration = 1000 / this.fps;

    while (this.elapsed >= frameDuration) {
      this.elapsed -= frameDuration;
      this.currentFrame++;

      if (this.currentFrame >= this.frames.length) {
        if (this.loop) {
          this.currentFrame = 0;
        } else {
          this.currentFrame = this.frames.length - 1;
          this.finished = true;
          break;
        }
      }
    }
  }

  /** Reset animation to the first frame. */
  reset(): void {
    this.currentFrame = 0;
    this.elapsed = 0;
    this.finished = false;
  }

  /** Get the actual spritesheet frame index for the current animation position. */
  getCurrentFrame(): number {
    return this.frames[this.currentFrame];
  }
}
