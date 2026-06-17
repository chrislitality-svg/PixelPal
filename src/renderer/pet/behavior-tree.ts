// ============================================================
// PixelPal — AI Behavior Tree (attribute-driven)
// ============================================================
//
// The behavior tree is the "brain" of the pet.  It evaluates what
// the pet should do next based on needs, attributes, and time,
// returning a new state for the FSM to transition to (or null
// to stay in the current state).
//
// DECISION PRIORITY (highest → lowest):
//   1. Emergency     — life-threatening needs override everything
//   2. Physiological — body needs (clean, eat, rest)
//   3. Entertainment — fun & social (weighted by personality)
//   4. Random        — ambient behaviours (wander, idle fidgets)
//   5. Default       — remain idle
//
// ATTRIBUTE INFLUENCE:
//   Every probability check is scaled by behavior weights derived
//   from the six attributes.  This means a greedy pet (high
//   appetite) will eat more often, a playful pet (high playful)
//   will self-entertain, and a wise pet (high wisdom) will
//   daydream and fish.  The attributes are the PRODUCT'S KEY
//   DIFFERENTIATOR — they make each pet feel unique.
//
// TIME-GATED EVALUATION:
//   To avoid frame-rate dependent probabilities, random rolls
//   happen on two fixed cadences:
//     - Thought tick (every 2 s): entertainment & social
//     - Random tick  (every 10 s): wander & expressions
//   Emergency and physiological needs are checked every frame.
//
// ============================================================

import type { PetAttributes, PetState, FoodItem } from '../../shared/types';
import { BEHAVIOR_PROBS } from '../../shared/constants';
import type { NeedsSystem } from './needs';
import type { PetFSM } from './fsm';
import type { BehaviorWeights } from './attributes';
import { getBehaviorWeights } from './attributes';

// ============================================================
// BehaviorRateLimiter
// ============================================================
// Prevents degenerate loops where the pet eats 10 times in a
// minute or poos 5 times in a row.  Tracks consecutive action
// counts, enforces cooldowns for eating/pooping, and force-feeds
// the pet when hunger is critically high.
// ============================================================

export class BehaviorRateLimiter {
  private consecutiveCounts: Record<string, number> = {};
  private lastActionTime: Record<string, number> = {};
  private maxConsecutive = 3;

  // Cooldowns for extreme scenarios (ms)
  private EAT_COOLDOWN  = 30000;  // 30 s between meals
  private POOP_COOLDOWN = 60000;  // 60 s between poops
  private MAX_POOPS     = 2;      // max 2 poops allowed on desktop

  // ------------------------------------------------------------------
  // canPerform — gate-check before a state transition is accepted
  // ------------------------------------------------------------------
  // context.poopsOnScreen : current number of uncleaned poops
  // context.hungerLevel   : 0–100 hunger need value
  // ------------------------------------------------------------------

  canPerform(
    action: string,
    context: { poopsOnScreen: number; hungerLevel: number },
  ): boolean {
    const now = performance.now();

    // ---- Force eat when hunger > 70 (suppress SelfPlay/Fish) ----
    if (context.hungerLevel > 70) {
      if (action === 'selfplay' || action === 'fish') {
        return false;
      }
    }

    // ---- Max poops on screen ----
    if (action === 'poop' && context.poopsOnScreen >= this.MAX_POOPS) {
      return false;
    }

    // ---- Eat cooldown (30 s) ----
    if (action === 'eat') {
      const lastEat = this.lastActionTime['eat'] ?? 0;
      if (now - lastEat < this.EAT_COOLDOWN) {
        return false;
      }
    }

    // ---- Poop cooldown (60 s) ----
    if (action === 'poop') {
      const lastPoop = this.lastActionTime['poop'] ?? 0;
      if (now - lastPoop < this.POOP_COOLDOWN) {
        return false;
      }
    }

    // ---- Consecutive limit (same action ≤ 3 times in a row) ----
    const count = this.consecutiveCounts[action] ?? 0;
    if (count >= this.maxConsecutive) {
      return false;
    }

    return true;
  }

  // ------------------------------------------------------------------
  // recordAction — called after a state transition is executed
  // ------------------------------------------------------------------

  recordAction(action: string): void {
    const now = performance.now();

    // Increment consecutive count; reset other actions
    for (const key of Object.keys(this.consecutiveCounts)) {
      if (key !== action) {
        this.consecutiveCounts[key] = 0;
      }
    }
    this.consecutiveCounts[action] = (this.consecutiveCounts[action] ?? 0) + 1;

    this.lastActionTime[action] = now;
  }

  // ------------------------------------------------------------------
  // reset — clear all tracking state
  // ------------------------------------------------------------------

  reset(): void {
    this.consecutiveCounts = {};
    this.lastActionTime = {};
  }

  // ------------------------------------------------------------------
  // getMaxSpeed — cap movement speed regardless of agility
  // ------------------------------------------------------------------
  // Returns a speed multiplier clamped so effective speed never
  // exceeds 4 px/frame at 30 FPS (≈120 px/s).
  // ------------------------------------------------------------------

  getMaxSpeed(agility: number): number {
    // Base formula: 0.5 + agility/100  (range 0.6–1.4)
    const raw = 0.5 + agility / 100;
    // 4 px/frame at 30 FPS = 120 px/s; BASE_MOVE_SPEED is 30 px/s
    // so the cap multiplier is 120/30 = 4.0
    return Math.min(raw, 4.0);
  }
}

// ============================================================
// BehaviorTree
// ============================================================

export class BehaviorTree {
  attributes: PetAttributes;
  needs: NeedsSystem;
  fsm: PetFSM;
  weights: BehaviorWeights;

  /** Set by PetManager before each evaluate() call. */
  foods: FoodItem[] = [];

  /** Rate limiter — PetManager sets context before evaluate(). */
  rateLimiter: BehaviorRateLimiter = new BehaviorRateLimiter();

  /** Context for the rate limiter, updated each frame by PetManager. */
  rateLimitContext: { poopsOnScreen: number; hungerLevel: number } = {
    poopsOnScreen: 0,
    hungerLevel: 0,
  };

  // Tick accumulators (milliseconds)
  private thoughtTimer: number = 0;
  private randomTimer: number = 0;

  // Tracks how long the pet has been continuously idle
  private continuousIdleTime: number = 0;

  // Tuning constants
  private static readonly THOUGHT_INTERVAL_MS = 2000;   // entertainment roll every 2 s
  private static readonly RANDOM_INTERVAL_MS  = 10000;  // wander/expression roll every 10 s
  private static readonly DAYDREAM_IDLE_THRESHOLD_MS = 120000; // 2 minutes of idle

  constructor(attributes: PetAttributes, needs: NeedsSystem, fsm: PetFSM) {
    this.attributes = attributes;
    this.needs = needs;
    this.fsm = fsm;
    this.weights = getBehaviorWeights(attributes);
  }

  // ------------------------------------------------------------------
  // evaluate — called every frame from PetManager.update()
  // ------------------------------------------------------------------
  // Returns a PetState to transition to, or null to remain in the
  // current state.  Only evaluates when the pet is in a "thinking"
  // state (idle or wander).
  // ------------------------------------------------------------------

  evaluate(deltaMs: number): PetState | null {
    const state = this.fsm.currentState;

    // Only make decisions when the pet is free to act
    if (state !== 'idle' && state !== 'wander') {
      return null;
    }

    // Track continuous idle time for daydream trigger
    if (state === 'idle') {
      this.continuousIdleTime += deltaMs;
    } else {
      // Wander breaks the idle streak
      this.continuousIdleTime = 0;
    }

    // ---- Priority 1: Emergency (always evaluated) ----
    const emergency = this.evaluateEmergency();
    if (emergency) {
      this.resetTimers();
      return this.applyRateLimit(emergency);
    }

    // ---- Priority 2: Physiological (always evaluated) ----
    const physiological = this.evaluatePhysiological();
    if (physiological) {
      this.resetTimers();
      return this.applyRateLimit(physiological);
    }

    // ---- Priority 3: Entertainment (on thought tick) ----
    this.thoughtTimer += deltaMs;
    if (this.thoughtTimer >= BehaviorTree.THOUGHT_INTERVAL_MS) {
      this.thoughtTimer -= BehaviorTree.THOUGHT_INTERVAL_MS;
      const entertainment = this.evaluateEntertainment();
      if (entertainment) {
        this.continuousIdleTime = 0;
        return this.applyRateLimit(entertainment);
      }
    }

    // ---- Priority 4: Random events (on random tick) ----
    this.randomTimer += deltaMs;
    if (this.randomTimer >= BehaviorTree.RANDOM_INTERVAL_MS) {
      this.randomTimer -= BehaviorTree.RANDOM_INTERVAL_MS;
      const random = this.evaluateRandom();
      if (random) {
        this.continuousIdleTime = 0;
        return this.applyRateLimit(random);
      }
    }

    // ---- Priority 5: Default — stay in current state ----
    return null;
  }

  // ==================================================================
  // Priority 1 — EMERGENCY
  // ==================================================================
  // When survival-level needs are critical, the pet acts immediately
  // with no randomness.  These transitions always fire.
  // ==================================================================

  private evaluateEmergency(): PetState | null {
    const { hunger, energy } = this.needs.needs;

    // Critical exhaustion — must sleep NOW
    if (energy < 10) {
      return 'sleep';
    }

    // Starving — desperately seek food
    if (hunger > 95) {
      if (this.hasFoodOnScreen()) {
        return 'approach';
      }
      // No food available — the pet can only cry for help.
      // (The needs system will generate a hunger bubble.)
      // Force sleep to recover energy if happiness is also tanking.
      if (this.needs.needs.happiness < 20) {
        return 'sleep';
      }
    }

    return null;
  }

  // ==================================================================
  // Priority 2 — PHYSIOLOGICAL
  // ==================================================================
  // Body needs: cleanliness, hunger, energy.  Thresholds are
  // modulated by attributes so each pet has different tolerance.
  // ==================================================================

  private evaluatePhysiological(): PetState | null {
    const { hunger, energy, cleanliness } = this.needs.needs;

    // ---- Cleanliness: pet needs to poop ----
    // High-hygiene pets have a LOWER threshold (they can't stand being dirty)
    // Threshold: 100 - hygiene  (hygiene 80 → threshold 20, hygiene 20 → threshold 80)
    const poopThreshold = 100 - this.attributes.hygiene;
    if (cleanliness < poopThreshold) {
      return 'poop';
    }

    // ---- Hunger: seek food ----
    // High-appetite pets feel hungry sooner
    // Threshold: 30 + appetite * 0.4  (appetite 90 → 66, appetite 20 → 38)
    const hungerThreshold = 30 + this.attributes.appetite * 0.4;
    if (hunger > hungerThreshold) {
      if (this.hasFoodOnScreen()) {
        return 'approach';
      }
      // No food — stay idle.  The needs system will show a bubble.
    }

    // ---- Energy: getting tired ----
    // Stronger pets can push through fatigue longer
    // Threshold: 30 - strength * 0.1  (strength 80 → 22, strength 20 → 28)
    const energyThreshold = 30 - this.attributes.strength * 0.1;
    if (energy < Math.max(15, energyThreshold)) {
      return 'sleep';
    }

    return null;
  }

  // ==================================================================
  // Priority 3 — ENTERTAINMENT & SOCIAL
  // ==================================================================
  // Fun behaviours that give the pet personality.  Evaluated on a
  // 2-second thought tick with attribute-weighted probabilities.
  // ==================================================================

  private evaluateEntertainment(): PetState | null {
    const { happiness } = this.needs.needs;

    // ---- SelfPlay: bored pets with playful personality ----
    // Triggers when happiness < 40 AND a weighted random roll passes
    if (happiness < 40) {
      const selfPlayChance = BEHAVIOR_PROBS.selfPlayFromIdle
        * this.weights.selfPlayFrequency;
      if (this.roll(selfPlayChance)) {
        return 'selfplay';
      }
    }

    // ---- Fish: the pet wants to go fishing ----
    // Driven by playful (fishing is fun) with a dash of wisdom (patience)
    const fishChance = BEHAVIOR_PROBS.fishFromIdle
      * this.weights.fishFrequency;
    if (this.roll(fishChance)) {
      return 'fish';
    }

    // ---- Daydream: idle pets drift into thought ----
    // Requires the pet to have been idle for 2+ minutes.
    // Wise pets daydream more (contemplative), playful pets less.
    if (this.continuousIdleTime >= BehaviorTree.DAYDREAM_IDLE_THRESHOLD_MS) {
      const daydreamChance = BEHAVIOR_PROBS.daydreamFromIdle
        * this.weights.daydreamFrequency;
      if (this.roll(daydreamChance)) {
        return 'daydream';
      }
    }

    // ---- Chat: social pets might "talk" to the owner ----
    // Requires high wisdom (the pet has something to say) and
    // reasonable happiness (it's in a good mood).
    if (happiness > 50 && this.attributes.wisdom >= 55) {
      const chatChance = 0.003 * (this.attributes.wisdom / 50);
      if (this.roll(chatChance)) {
        return 'chat';
      }
    }

    return null;
  }

  // ==================================================================
  // Priority 4 — RANDOM EVENTS
  // ==================================================================
  // Ambient behaviours that make the pet feel alive even when all
  // needs are met.  Evaluated on a 10-second random tick.
  // ==================================================================

  private evaluateRandom(): PetState | null {
    // ---- Wander: the pet decides to walk around ----
    const wanderChance = BEHAVIOR_PROBS.wanderFromIdle
      * this.weights.wanderFrequency;
    if (this.roll(wanderChance)) {
      return 'wander';
    }

    // ---- SelfPlay (random burst): even happy pets play sometimes ----
    if (this.needs.needs.happiness > 50) {
      const randomPlayChance = BEHAVIOR_PROBS.selfPlayFromIdle
        * this.weights.selfPlayFrequency * 0.3;
      if (this.roll(randomPlayChance)) {
        return 'selfplay';
      }
    }

    // ---- Fish (random impulse): sometimes pets just feel like it ----
    {
      const randomFishChance = BEHAVIOR_PROBS.fishFromIdle
        * this.weights.fishFrequency * 0.3;
      if (this.roll(randomFishChance)) {
        return 'fish';
      }
    }

    return null;
  }

  // ==================================================================
  // Dice-roll helpers
  // ==================================================================

  /** Simple probability roll.  @param chance 0.0–1.0+ (values > 1 always pass) */
  private roll(chance: number): boolean {
    return Math.random() < chance;
  }

  /**
   * Attribute-weighted roll.
   * @param attrValue   The relevant attribute (0–100)
   * @param baseChance  The base probability at attribute = 50
   *
   * Scales linearly: attr 10 → 0.2× base, attr 50 → 1.0× base, attr 90 → 1.8× base
   */
  private rollAttribute(attrValue: number, baseChance: number): boolean {
    const scaled = baseChance * (0.2 + attrValue / 50 * 0.8);
    return this.roll(scaled);
  }

  // ==================================================================
  // Rate limiter integration
  // ==================================================================

  /**
   * Gate a candidate state through the rate limiter.  If the limiter
   * rejects the state, returns null (pet stays in its current state).
   * If accepted, records the action and returns the state.
   */
  private applyRateLimit(candidate: PetState): PetState | null {
    if (this.rateLimiter.canPerform(candidate, this.rateLimitContext)) {
      this.rateLimiter.recordAction(candidate);
      return candidate;
    }
    return null;
  }

  // ==================================================================
  // Utility
  // ==================================================================

  private hasFoodOnScreen(): boolean {
    return this.foods.length > 0;
  }

  private resetTimers(): void {
    this.thoughtTimer = 0;
    this.randomTimer = 0;
  }

  /** Reset the continuous idle counter (e.g. when the pet was interrupted). */
  resetIdleTimer(): void {
    this.continuousIdleTime = 0;
  }
}
