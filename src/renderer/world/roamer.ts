// ============================================================
// PixelPal — WorldRoamer (full-desktop walking)
// ============================================================
// Moves the whole pet WINDOW across the desktop so the pet can run
// around freely, instead of being stuck in one spot.  Roaming is
// coupled to the pet's existing FSM "wander" / "approach" states:
// each time the pet decides to wander, the roamer picks a new
// desktop target and slides the window toward it (the pet plays its
// walk animation meanwhile).  It also occasionally triggers a bit of
// mischief — opening one of the user's folders.
//
// Coordinates are all in DIP (logical px), matching getScreenInfo's
// workArea / windowX / windowY and movePet's setPosition.
// ============================================================

import type { PetManager } from '../pet/pet-entity';
import { ROAM, ROAM_COIN } from '../../shared/constants';

const WIN_W = 256;
const WIN_H = 350;

export class WorldRoamer {
  private enabled = true;
  private workArea = { x: 0, y: 0, width: 1280, height: 720 };
  private winX = 0;
  private winY = 0;
  private targetX = 0;
  private targetY = 0;
  private hasTarget = false;
  private prevState = '';
  private ready = false;

  /** Called when a wander roll decides to do mischief (open a folder). */
  onMischief: (() => void) | null = null;

  /** Per-wander probability of auto-mischief (set from the user's level). */
  mischiefChance = 0;

  /** Called when a wander roll decides the pet "found" some coins. */
  onFindCoins: (() => void) | null = null;

  /** Probability that a wander becomes an edge-peek instead. */
  peekChance = 0.14;
  /** True while the pet is hiding/peeking at a screen edge. */
  private peeking = false;

  // ---- Lifecycle ----

  async init(): Promise<void> {
    try {
      const info = await window.pixelpal.getScreenInfo();
      this.workArea = info.workArea;
      this.winX = info.windowX;
      this.winY = info.windowY;
      this.ready = true;
    } catch {
      this.ready = false;
    }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.hasTarget = false;
  }

  // ---- Per-frame update ----

  update(dt: number, pm: PetManager): void {
    if (!this.enabled || !this.ready) {
      this.prevState = pm.fsm.currentState;
      return;
    }

    const state = pm.fsm.currentState;
    const roamingState = state === 'wander' || state === 'approach';

    // On entering a wander/approach state, pick a fresh desktop target.
    if (roamingState && this.prevState !== state) {
      this.beginRoam(pm);
    }

    if (roamingState && this.hasTarget) {
      this.stepToward(dt, pm);
    } else if (!roamingState) {
      this.hasTarget = false;
    }

    this.prevState = state;
  }

  // ---- Current window position (for poop placement etc.) ----

  getWindowPos(): { x: number; y: number } {
    return { x: this.winX, y: this.winY };
  }

  get windowHeight(): number {
    return WIN_H;
  }

  // ---- Internal ----

  /** Re-sync the real window position and choose a new desktop target. */
  private beginRoam(pm: PetManager): void {
    // Re-sync the actual window position in case the user dragged it.
    window.pixelpal
      .getScreenInfo()
      .then((info) => {
        this.workArea = info.workArea;
        this.winX = info.windowX;
        this.winY = info.windowY;
      })
      .catch(() => { /* keep cached */ });

    const wa = this.workArea;

    // If we were peeking, this wander brings the pet back into view.
    if (this.peeking) {
      this.peeking = false;
      this.pickNormalTarget(pm);
      return;
    }

    // Occasionally hide at a screen edge, poking only half-way out.
    if (Math.random() < this.peekChance) {
      this.peeking = true;
      const right = Math.random() < 0.5;
      // Push the window mostly off-screen so only part of the pet shows.
      this.targetX = right ? wa.x + wa.width - 50 : wa.x - 70;
      const maxY = wa.y + Math.max(0, wa.height - WIN_H);
      this.targetY = Math.min(maxY, wa.y + Math.floor(wa.height * 0.55));
      this.hasTarget = true;
      pm.facingRight = !right; // face back toward the screen (peeking in)
      return;
    }

    this.pickNormalTarget(pm);

    // Occasionally play a prank: open one of the user's folders.
    if (this.onMischief && this.mischiefChance > 0 && Math.random() < this.mischiefChance) {
      this.onMischief();
    }
    // Occasionally "find" some coins while roaming (passive income).
    if (this.onFindCoins && Math.random() < ROAM_COIN.chancePerWander) {
      this.onFindCoins();
    }
  }

  /** Pick a normal in-bounds wander target (lower 60% of the work area). */
  private pickNormalTarget(pm: PetManager): void {
    const wa = this.workArea;
    const maxX = wa.x + Math.max(0, wa.width - WIN_W);
    const minX = wa.x;
    const bandTop = wa.y + Math.floor(wa.height * 0.4);
    const maxY = wa.y + Math.max(0, wa.height - WIN_H);
    const minY = Math.min(bandTop, maxY);

    this.targetX = minX + Math.random() * (maxX - minX);
    this.targetY = minY + Math.random() * Math.max(1, maxY - minY);
    this.hasTarget = true;
    pm.facingRight = this.targetX >= this.winX;
  }

  private stepToward(dt: number, pm: PetManager): void {
    const dx = this.targetX - this.winX;
    const dy = this.targetY - this.winY;
    const dist = Math.hypot(dx, dy);

    if (dist <= ROAM.arriveThreshold) {
      this.hasTarget = false;
      return;
    }

    const speed = ROAM.baseSpeed * (0.5 + pm.attributes.agility / 100);
    const step = Math.min(dist, speed * (dt / 1000));
    this.winX += (dx / dist) * step;
    this.winY += (dy / dist) * step;

    pm.facingRight = dx >= 0;

    window.pixelpal.movePet({
      x: Math.round(this.winX),
      y: Math.round(this.winY),
    });
  }
}
