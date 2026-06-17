// ============================================================
// PixelPal -- BubbleSystem
// ============================================================
//
// Manages the speech-bubble that floats above the pet.  Bubbles
// can express needs, greetings, monologues, milestones, or plain
// emoji.  A cooldown prevents spam, and excess requests are
// silently queued so the most recent intent is shown once the
// cooldown elapses.
//
// DOM elements (defined in index.html):
//   #bubble-container   outer wrapper, toggles `.visible` class
//   #bubble-text        inner element that holds the text/icon
// ============================================================

import type { BubbleData, BubbleType } from '../../shared/types';
import { BUBBLE_COOLDOWN } from '../../shared/constants';

// ----------------------------------------------------------------
// Default icon per bubble type
// ----------------------------------------------------------------

const BUBBLE_ICONS: Record<BubbleType, string> = {
  hunger:      '\u{1F356}',   // 🍖
  energy:      '\u{1F4A4}',   // 💤
  happiness:   '\u{2764}\u{FE0F}',  // ❤️
  cleanliness: '\u{1F9F9}',   // 🧹
  monologue:   '\u{1F4AD}',   // 💭
  greeting:    '\u{1F44B}',   // 👋
  info:        '\u{1F4E2}',   // 📢
  emoji:       '',             // just the text itself
};

// ----------------------------------------------------------------
// BubbleSystem
// ----------------------------------------------------------------

export class BubbleSystem {
  private container: HTMLElement | null;
  private textEl: HTMLElement | null;
  private isVisible: boolean = false;
  private hideTimeout: ReturnType<typeof setTimeout> | null = null;
  private cooldown: number = 0;          // timestamp (ms) of last shown bubble
  private cooldownMs: number = BUBBLE_COOLDOWN;
  private queue: BubbleData[] = [];

  constructor() {
    this.container = document.getElementById('bubble-container');
    this.textEl    = document.getElementById('bubble-text');
  }

  // ------------------------------------------------------------------
  // Core show / hide
  // ------------------------------------------------------------------

  /**
   * Show a bubble.  If a bubble is already visible or the cooldown
   * has not yet elapsed, the bubble is placed in a single-slot queue
   * (the most recent request wins).
   */
  show(bubble: BubbleData): void {
    if (!this.container || !this.textEl) return;

    // If currently showing a bubble, replace the queue entry
    if (this.isVisible) {
      this.queue = [bubble];
      return;
    }

    // Respect cooldown
    if (!this.canShow()) {
      this.queue = [bubble];
      return;
    }

    // -- Show the bubble --
    this.isVisible = true;
    this.cooldown  = Date.now();

    const icon = bubble.icon ?? BUBBLE_ICONS[bubble.type];
    this.textEl.textContent = icon ? `${icon} ${bubble.text}` : bubble.text;
    this.container.classList.add('visible');

    // Auto-hide after the bubble's declared duration
    this.hideTimeout = setTimeout(() => {
      this.hide();
    }, bubble.duration);
  }

  /**
   * Hide the bubble and show the next queued one (if any) after a
   * short delay so the transition feels natural.
   */
  hide(): void {
    if (!this.container) return;

    this.container.classList.remove('visible');
    this.isVisible = false;

    if (this.hideTimeout !== null) {
      clearTimeout(this.hideTimeout);
      this.hideTimeout = null;
    }

    // Dequeue next bubble after a brief gap
    if (this.queue.length > 0) {
      const next = this.queue.shift()!;
      this.queue = [];  // discard stale entries
      setTimeout(() => this.show(next), 500);
    }
  }

  // ------------------------------------------------------------------
  // Convenience helpers
  // ------------------------------------------------------------------

  /** Show a need-based bubble (hunger, energy, happiness, cleanliness). */
  showNeedBubble(need: string): void {
    const type = need as BubbleType;
    const icon = BUBBLE_ICONS[type] || '';

    const textMap: Record<string, string> = {
      hunger:      '好饿...',
      energy:      '好困...',
      happiness:   '好无聊...',
      cleanliness: '好脏...',
    };

    this.show({
      text: textMap[need] || '...',
      type,
      duration: 4000,
      icon,
    });
  }

  /** Show a greeting bubble (e.g. time-of-day message). */
  showGreeting(text: string): void {
    this.show({
      text,
      type: 'greeting',
      duration: 4000,
      icon: BUBBLE_ICONS.greeting,
    });
  }

  /** Show a monologue bubble (the pet talking to itself). */
  showMonologue(text: string): void {
    this.show({
      text,
      type: 'monologue',
      duration: 5000,
      icon: BUBBLE_ICONS.monologue,
    });
  }

  /** Show a milestone celebration bubble. */
  showMilestone(name: string): void {
    this.show({
      text: `\u{1F389} ${name}!`,
      type: 'info',
      duration: 5000,
      icon: '',
    });
  }

  // ------------------------------------------------------------------
  // Cooldown
  // ------------------------------------------------------------------

  /** Whether the cooldown period has elapsed since the last bubble. */
  canShow(): boolean {
    return Date.now() - this.cooldown >= this.cooldownMs;
  }

  /** Override the default cooldown duration (ms). */
  setCooldownMs(ms: number): void {
    this.cooldownMs = ms;
  }
}
