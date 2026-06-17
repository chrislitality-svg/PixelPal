// ============================================================
// PixelPal — Finite State Machine
// ============================================================
//
// The FSM is the HEART of the pet.  Every observable behaviour
// (eating, sleeping, wandering, playing, fishing…) corresponds
// to a state in this machine.  Transitions between states are
// driven externally by the BehaviorTree and internally by
// auto-transition rules (e.g. eat → poop, sleep → wake).
//
// Design principles:
//   1. Clean transitions — onExit for old state, onEnter for new
//   2. Every state has a target duration range
//   3. Auto-transitions fire when the timer exceeds the duration
//      or when a one-shot animation finishes
//   4. canTransition() enforces the valid-transition graph
//   5. A stateChangeCallback lets the PetManager react to
//      transitions (e.g. trigger saves, record poop locations)
//
// Valid transition graph:
//
//   idle ──→ wander, sleep, eat, selfplay, daydream, fish,
//            interact, drag, approach
//   wander ──→ idle, eat, approach, selfplay, fish, drag
//   eat ──→ idle, poop, stuffed, drag
//   stuffed ──→ idle, drag
//   poop ──→ idle, drag
//   selfplay ──→ idle, drag
//   daydream ──→ idle, drag
//   sleep ──→ idle
//   fish ──→ idle, drag
//   approach ──→ eat, idle, drag
//   drag ──→ idle
//   interact ──→ idle
//   chat ──→ idle
//
// ============================================================

import type {
  PetState,
  PetAttributes,
  AnimationName,
} from '../../shared/types';
import {
  STATE_DURATIONS,
  BEHAVIOR_PROBS,
  INTERACTION,
} from '../../shared/constants';
import type { NeedsSystem } from './needs';

// ============================================================
// State transition event — delivered to the callback
// ============================================================

export interface StateTransitionEvent {
  from: PetState;
  to: PetState;
  reason: string;
}

// ============================================================
// Animation duration table (one-shot animations only)
// These are the real durations derived from the sprite-animation
// definitions in renderer.ts:  frames.length / fps * 1000
// ============================================================

const ONE_SHOT_ANIM_MS: Partial<Record<PetState, number>> = {
  eat:        5  / 10 * 1000,   // 500 ms
  stuffed:    4  / 3  * 1000,   // 1333 ms (one cycle of looping anim)
  poop:       6  / 6  * 1000,   // 1000 ms
  interact:   4  / 6  * 1000,   // 667 ms
  approach:   5000,              // walk toward food — timer-driven
};

// ============================================================
// PetFSM
// ============================================================

export class PetFSM {
  currentState: PetState = 'idle';
  previousState: PetState | null = null;
  stateTimer: number = 0;         // ms elapsed in current state
  stateDuration: number = 0;      // target duration for current state

  private needs: NeedsSystem;
  private attributes: PetAttributes;
  private transitionLog: string[] = [];
  private _stateChangeCallback: ((event: StateTransitionEvent) => void) | null = null;

  constructor(needs: NeedsSystem, attributes: PetAttributes) {
    this.needs = needs;
    this.attributes = attributes;
    // Set initial duration for idle
    this.stateDuration = this.computeDuration('idle');
  }

  // ------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------

  /** Register a callback that fires on every state transition. */
  onStateChange(cb: (event: StateTransitionEvent) => void): void {
    this._stateChangeCallback = cb;
  }

  /**
   * Transition to a new state.  Fires onStateExit for the old
   * state and onStateEnter for the new state, then invokes the
   * state-change callback.
   *
   * @param newState  Target state
   * @param reason    Human-readable reason (for debug logging)
   * @returns true if the transition was accepted
   */
  transition(newState: PetState, reason: string = ''): boolean {
    if (newState === this.currentState) return false;

    // drag is always allowed (user grabs the pet at any time)
    if (newState !== 'drag' && !this.canTransition(this.currentState, newState)) {
      this.log(`BLOCKED transition ${this.currentState} → ${newState} (${reason})`);
      return false;
    }

    const from = this.currentState;

    // Exit old state
    this.onStateExit(from);

    // Swap
    this.previousState = from;
    this.currentState = newState;
    this.stateTimer = 0;
    this.stateDuration = this.computeDuration(newState);

    // Enter new state
    this.onStateEnter(newState);

    // Notify
    const event: StateTransitionEvent = { from, to: newState, reason };
    this.log(`${from} → ${newState}  [${reason}]`);
    this._stateChangeCallback?.(event);

    return true;
  }

  /**
   * Called every frame.  Increments the state timer and checks
   * for auto-transitions (animation completion, timer expiry,
   * sleep recovery, etc.).
   */
  update(deltaMs: number): void {
    this.stateTimer += deltaMs;

    switch (this.currentState) {
      // ---- One-shot animation states: transition when anim finishes ----

      case 'eat':
        if (this.stateTimer >= (ONE_SHOT_ANIM_MS.eat ?? 500)) {
          this.resolveEatTransition();
        }
        break;

      case 'poop':
        if (this.stateTimer >= (ONE_SHOT_ANIM_MS.poop ?? 1000)) {
          this.transition('idle', 'poop-finished');
        }
        break;

      case 'interact':
        if (this.stateTimer >= (ONE_SHOT_ANIM_MS.interact ?? 667)) {
          this.transition('idle', 'interact-finished');
        }
        break;

      case 'stuffed':
        if (this.stateTimer >= this.stateDuration) {
          this.transition('idle', 'stuffed-recovered');
        }
        break;

      // ---- Timer-driven states: transition when duration expires ----

      case 'idle':
        // Idle has no hard exit — the behavior tree decides when to leave.
        // But if idle runs for more than the max duration without the BT
        // acting (e.g. the pet was forgotten), auto-wander.
        if (this.stateTimer >= this.stateDuration) {
          this.transition('wander', 'idle-timeout');
        }
        break;

      case 'wander':
        if (this.stateTimer >= this.stateDuration) {
          this.transition('idle', 'wander-complete');
        }
        break;

      case 'selfplay':
        if (this.stateTimer >= this.stateDuration) {
          this.transition('idle', 'selfplay-done');
        }
        break;

      case 'daydream':
        if (this.stateTimer >= this.stateDuration) {
          this.transition('idle', 'daydream-ended');
        }
        break;

      case 'fish':
        if (this.stateTimer >= this.stateDuration) {
          this.transition('idle', 'fish-session-ended');
        }
        break;

      // ---- Sleep: auto-wake when energy is restored ----

      case 'sleep': {
        // Continuous energy recovery while sleeping
        const recoveryPerSec = 0.05
          * (0.6 + (this.attributes.strength + this.attributes.agility) / 400);
        this.needs.rest(recoveryPerSec * (deltaMs / 1000) * 100);

        // Wake condition
        if (this.needs.needs.energy >= 80 || this.stateTimer >= this.stateDuration) {
          this.transition('idle', 'woke-up');
        }
        break;
      }

      // ---- Approach: timer expiry means food not reached ----

      case 'approach':
        if (this.stateTimer >= this.stateDuration) {
          this.transition('idle', 'approach-timeout');
        }
        break;

      // ---- User-controlled states: external code triggers exit ----

      case 'drag':
        // Exits when the user drops the pet (PetManager.drop())
        break;

      case 'chat':
        // Exits when the chat interaction ends
        if (this.stateTimer >= this.stateDuration) {
          this.transition('idle', 'chat-ended');
        }
        break;
    }
  }

  /** Check if the FSM is currently in the given state. */
  isIn(state: PetState): boolean {
    return this.currentState === state;
  }

  /** Map a state to the animation name the renderer should play. */
  getStateAnimation(state: PetState): AnimationName {
    return STATE_ANIMATION_MAP[state];
  }

  /** Return the current animation name. */
  getCurrentAnimation(): AnimationName {
    return STATE_ANIMATION_MAP[this.currentState];
  }

  /**
   * Determine whether a transition from `from` to `to` is valid.
   * drag is always allowed from any state (user grabs the pet).
   */
  canTransition(from: PetState, to: PetState): boolean {
    const allowed = VALID_TRANSITIONS[from];
    if (!allowed) return false;
    return allowed.includes(to);
  }

  /** Recent transition log (for debugging / dev overlay). */
  getLog(): string[] {
    return [...this.transitionLog];
  }

  /** Return the remaining time in the current state (ms), or 0 if past due. */
  getRemainingTime(): number {
    return Math.max(0, this.stateDuration - this.stateTimer);
  }

  /** Manually finish the current one-shot animation state. */
  finishCurrentState(reason: string = 'manual-finish'): void {
    if (this.currentState === 'eat') {
      this.resolveEatTransition();
    } else if (this.currentState === 'poop') {
      this.transition('idle', reason);
    } else if (this.currentState === 'interact') {
      this.transition('idle', reason);
    }
  }

  // ------------------------------------------------------------------
  // State enter / exit hooks
  // ------------------------------------------------------------------

  private onStateEnter(state: PetState): void {
    switch (state) {
      case 'eat':
        // Eating boosts happiness slightly (food is enjoyable)
        this.needs.play(INTERACTION.feedHappinessGain);
        break;

      case 'selfplay':
        // Playing burns a tiny bit of energy
        this.needs.needs.energy -= 2;
        break;

      case 'sleep':
        // Nothing special on enter — recovery happens in update()
        break;

      case 'fish':
        // Fishing is relaxing — slight happiness boost
        this.needs.play(1);
        break;

      default:
        break;
    }
  }

  private onStateExit(state: PetState): void {
    switch (state) {
      case 'poop':
        // Poop makes the pet dirtier (lower cleanliness)
        this.needs.needs.cleanliness -= 5;
        this.needs.play(INTERACTION.poopCleanHappinessGain);
        break;

      default:
        break;
    }
  }

  // ------------------------------------------------------------------
  // Eat resolution: stuffed, poop, or back to idle
  // ------------------------------------------------------------------

  private resolveEatTransition(): void {
    const stuffedChance = BEHAVIOR_PROBS.stuffedFromEat
      * (this.attributes.appetite / 50);
    const poopChance = BEHAVIOR_PROBS.poopAfterEat
      * ((100 - this.attributes.hygiene) / 50);

    const roll = Math.random();
    if (roll < stuffedChance) {
      this.transition('stuffed', 'ate-too-much');
    } else if (roll < stuffedChance + poopChance) {
      this.transition('poop', 'digestion');
    } else {
      this.transition('idle', 'eat-finished');
    }
  }

  // ------------------------------------------------------------------
  // Duration computation
  // ------------------------------------------------------------------

  private computeDuration(state: PetState): number {
    switch (state) {
      case 'idle':
        return randomRange(STATE_DURATIONS.idleMin, STATE_DURATIONS.idleMax);

      case 'wander': {
        // High-agility pets cover ground faster → shorter wander
        const agilityFactor = 0.7 + (100 - this.attributes.agility) / 100 * 0.6;
        return randomRange(STATE_DURATIONS.wanderMin, STATE_DURATIONS.wanderMax) * agilityFactor;
      }

      case 'selfplay': {
        // Playful pets play longer
        const playFactor = 0.6 + this.attributes.playful / 100 * 0.8;
        return randomRange(STATE_DURATIONS.selfPlayMin, STATE_DURATIONS.selfPlayMax) * playFactor;
      }

      case 'daydream': {
        // Wise pets daydream longer
        const wisdomFactor = 0.5 + this.attributes.wisdom / 100 * 1.0;
        return randomRange(STATE_DURATIONS.daydreamMin, STATE_DURATIONS.daydreamMax) * wisdomFactor;
      }

      case 'fish': {
        // Patient (wise) pets fish longer
        const patienceFactor = 0.6 + this.attributes.wisdom / 100 * 0.8;
        return randomRange(STATE_DURATIONS.fishMin, STATE_DURATIONS.fishMax) * patienceFactor;
      }

      case 'sleep': {
        // Tired pets sleep longer; strong pets recover faster
        const tiredness = 100 - this.needs.needs.energy;
        const tiredFactor = 0.5 + tiredness / 100;
        const strengthFactor = 1.2 - this.attributes.strength / 200;
        return randomRange(STATE_DURATIONS.sleepMin, STATE_DURATIONS.sleepMax)
          * tiredFactor * strengthFactor;
      }

      case 'eat':
        return randomRange(STATE_DURATIONS.eatMin, STATE_DURATIONS.eatMax);

      case 'stuffed':
        return randomRange(STATE_DURATIONS.stuffedMin, STATE_DURATIONS.stuffedMax);

      case 'poop':
        return randomRange(STATE_DURATIONS.poopMin, STATE_DURATIONS.poopMax);

      case 'approach':
        return randomRange(3000, 8000);

      case 'drag':
        return Infinity;  // exits only on drop

      case 'interact':
        return randomRange(2000, 5000);

      case 'chat':
        return randomRange(5000, 30000);

      default:
        return 3000;
    }
  }

  // ------------------------------------------------------------------
  // Logging
  // ------------------------------------------------------------------

  private log(message: string): void {
    const ts = new Date().toISOString().slice(11, 23);
    this.transitionLog.push(`[${ts}] ${message}`);
    if (this.transitionLog.length > 50) {
      this.transitionLog.shift();
    }
  }
}

// ============================================================
// Static tables
// ============================================================

/** Map each PetState to the AnimationName the renderer should play. */
const STATE_ANIMATION_MAP: Record<PetState, AnimationName> = {
  idle:       'idle',
  wander:     'walk',
  eat:        'eat',
  stuffed:    'stuffed',
  poop:       'poop',
  selfplay:   'selfplay',
  daydream:   'daydream',
  sleep:      'sleep',
  fish:       'fish',
  chat:       'chat',
  interact:   'interact-pet',
  drag:       'drag',
  approach:   'walk',
};

/**
 * Valid transition graph.
 *
 * Every state can also be interrupted by 'drag' (user picks up the pet),
 * but that is checked dynamically in canTransition() rather than being
 * listed here to keep the table readable.
 */
const VALID_TRANSITIONS: Record<PetState, PetState[]> = {
  idle:       ['wander', 'sleep', 'eat', 'selfplay', 'daydream', 'fish',
               'interact', 'drag', 'approach', 'chat'],
  wander:     ['idle', 'eat', 'approach', 'selfplay', 'fish', 'drag'],
  eat:        ['idle', 'poop', 'stuffed', 'drag'],
  stuffed:    ['idle', 'drag'],
  poop:       ['idle', 'drag'],
  selfplay:   ['idle', 'drag'],
  daydream:   ['idle', 'drag'],
  sleep:      ['idle'],
  fish:       ['idle', 'drag'],
  approach:   ['eat', 'idle', 'drag'],
  drag:       ['idle'],
  interact:   ['idle'],
  chat:       ['idle'],
};

// ============================================================
// Helpers
// ============================================================

function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}
