// ============================================================
// GameLoop - RAF-based game loop with power management
// ============================================================
//
// Power modes:
//   active  -> ~30 FPS  (pet is animating / moving)
//   idle    -> ~10 FPS  (pet is stationary, gentle breathing)
//   paused  -> no RAF at all (window hidden / focus mode)
//
// The loop self-throttles by comparing elapsed time against the
// target interval and skipping render/update when too early.
// ============================================================

import { FRAME_MS_ACTIVE, FRAME_MS_IDLE } from '../../shared/constants';

export type FPSMode = 'active' | 'idle' | 'paused';

export class GameLoop {
  private rafId: number | null = null;
  private lastTime: number = 0;
  private accumulator: number = 0;
  private fpsMode: FPSMode = 'active';
  private paused: boolean = false;

  private onUpdate: (dt: number) => void;
  private onRender: () => void;

  constructor(
    onUpdate: (dt: number) => void,
    onRender: () => void,
  ) {
    this.onUpdate = onUpdate;
    this.onRender = onRender;
  }

  // ---- public API ------------------------------------------------

  /** Start the loop from scratch. Safe to call multiple times. */
  start(): void {
    if (this.rafId !== null) return;       // already running
    this.paused = false;
    this.lastTime = performance.now();
    this.accumulator = 0;
    this.rafId = requestAnimationFrame(this.tick);
  }

  /** Stop the loop completely (equivalent to pause but semantic stop). */
  stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  /** Pause: cancel RAF entirely. Use when window is hidden / focus mode. */
  pause(): void {
    this.paused = true;
    this.stop();
  }

  /** Resume after a pause. */
  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.lastTime = performance.now();
    this.accumulator = 0;
    this.start();
  }

  /** Switch between active (30 fps) and idle (10 fps) throttling. */
  setFPSMode(mode: 'active' | 'idle'): void {
    this.fpsMode = mode;
  }

  /** Current mode accessor. */
  getFPSMode(): FPSMode {
    return this.paused ? 'paused' : this.fpsMode;
  }

  // ---- RAF callback ----------------------------------------------

  /** The requestAnimationFrame callback. Self-throttles to target FPS. */
  tick = (timestamp: number): void => {
    // Schedule next frame first so any errors don't kill the loop
    this.rafId = requestAnimationFrame(this.tick);

    const rawDelta = timestamp - this.lastTime;
    this.lastTime = timestamp;

    // Clamp absurdly large deltas (e.g. after a tab switch) to 250ms
    const delta = Math.min(rawDelta, 250);

    // Determine target interval for current mode
    const targetInterval = this.fpsMode === 'idle' ? FRAME_MS_IDLE : FRAME_MS_ACTIVE;

    // Accumulate time and only step when we've passed the interval
    this.accumulator += delta;

    if (this.accumulator < targetInterval) {
      return; // skip this frame - too early
    }

    // Consume the accumulated time (capped to prevent spiral of death)
    const dt = Math.min(this.accumulator, targetInterval * 3);
    this.accumulator = 0;

    // Run update + render
    this.onUpdate(dt);
    this.onRender();
  };
}
