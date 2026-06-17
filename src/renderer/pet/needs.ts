// ============================================================
// PixelPal — Four-dimensional Needs System
// ============================================================
//
// The pet has four continuously-decaying needs that create the
// core tension driving all behaviour:
//
//   hunger      (0–100, higher = more hungry)
//   energy      (0–100, lower = more tired)
//   happiness   (0–100, higher = happier)
//   cleanliness (0–100, lower = dirtier)
//
// Decay rates are modulated by the six attributes so each pet
// decays at a different pace:
//   - A high-appetite pet gets hungry faster
//   - A high-agility pet burns energy faster
//   - A low-playful pet gets bored faster
//   - A low-hygiene pet gets dirty faster
//
// The needs system creates interesting tension: the pet wants
// to eat but also wants to play; it is tired but its curiosity
// pulls it to explore.
// ============================================================

import type { PetAttributes, PetNeeds, BubbleData } from '../../shared/types';
import { NEEDS_DECAY, BUBBLE_DURATION } from '../../shared/constants';

// Rate applied when applyOfflineDrift() is used (gentler than real-time).
export const OFFLINE_DRIFT_MULTIPLIER = 0.3;

// ============================================================
// NeedsSystem
// ============================================================

export class NeedsSystem {
  needs: PetNeeds;
  attributes: PetAttributes;

  constructor(initial: PetNeeds, attributes: PetAttributes) {
    this.needs = { ...initial };
    this.attributes = attributes;
  }

  // ------------------------------------------------------------------
  // update — called every frame with elapsed seconds (not ms!)
  // ------------------------------------------------------------------
  // Decay formulae (all rates are per-second):
  //   hunger  += hungerBase       * (appetite      / 50)
  //   energy  -= energyDrainBase  * (agility        / 50)
  //   happiness   -= happinessDecayBase * ((100 - playful) / 50)
  //   cleanliness -= cleanlinessDecayBase * ((100 - hygiene) / 50)
  //
  // A pet with all attributes at 50 decays at exactly the base rate.
  // ------------------------------------------------------------------

  update(deltaSeconds: number): void {
    const { hungerBase, energyDrainBase, happinessDecayBase, cleanlinessDecayBase } = NEEDS_DECAY;
    const { appetite, agility, playful, hygiene } = this.attributes;

    // Hunger rises — high-appetite pets get hungry faster
    this.needs.hunger += hungerBase * (appetite / 50) * deltaSeconds;

    // Energy falls — high-agility pets burn energy faster
    this.needs.energy -= energyDrainBase * (agility / 50) * deltaSeconds;

    // Happiness falls — low-playful pets get bored faster
    // (they lack the internal drive to entertain themselves)
    this.needs.happiness -= happinessDecayBase * ((100 - playful) / 50) * deltaSeconds;

    // Cleanliness falls — low-hygiene pets get dirty faster
    this.needs.cleanliness -= cleanlinessDecayBase * ((100 - hygiene) / 50) * deltaSeconds;

    this.clampAll();
  }

  // ------------------------------------------------------------------
  // Actions — called by PetManager / interactions
  // ------------------------------------------------------------------

  /** Reduce hunger (food restores). Amount is in hunger-points. */
  feed(amount: number): void {
    this.needs.hunger = Math.max(0, this.needs.hunger - amount);
  }

  /** Restore energy (sleep restores). Amount is in energy-points. */
  rest(amount: number): void {
    this.needs.energy = Math.min(100, this.needs.energy + amount);
  }

  /** Boost happiness (play / interaction). Amount is in happiness-points. */
  play(amount: number): void {
    this.needs.happiness = Math.min(100, this.needs.happiness + amount);
  }

  /** Boost cleanliness (owner cleans). Amount is in cleanliness-points. */
  clean(amount: number): void {
    this.needs.cleanliness = Math.min(100, this.needs.cleanliness + amount);
  }

  // ------------------------------------------------------------------
  // getNeedBubble — return a bubble if any need is critical
  // ------------------------------------------------------------------
  // Priority order: hunger > energy > cleanliness > happiness
  // (the pet complains about the most urgent unmet need first)
  // ------------------------------------------------------------------

  getNeedBubble(): BubbleData | null {
    // Starving — most urgent
    if (this.needs.hunger > 70) {
      return {
        text: pickBubbleText('hunger', this.needs.hunger),
        type: 'hunger',
        duration: BUBBLE_DURATION,
        icon: '🍖',
      };
    }

    // Exhausted
    if (this.needs.energy < 20) {
      return {
        text: pickBubbleText('energy', this.needs.energy),
        type: 'energy',
        duration: BUBBLE_DURATION,
        icon: '💤',
      };
    }

    // Filthy
    if (this.needs.cleanliness < 25) {
      return {
        text: pickBubbleText('cleanliness', this.needs.cleanliness),
        type: 'cleanliness',
        duration: BUBBLE_DURATION,
        icon: '🧼',
      };
    }

    // Bored / unhappy
    if (this.needs.happiness < 30) {
      return {
        text: pickBubbleText('happiness', this.needs.happiness),
        type: 'happiness',
        duration: BUBBLE_DURATION,
        icon: '😢',
      };
    }

    return null;
  }

  // ------------------------------------------------------------------
  // getOverallMood — single-word summary of how the pet feels
  // ------------------------------------------------------------------

  getOverallMood(): 'happy' | 'neutral' | 'unhappy' | 'critical' {
    const { hunger, energy, happiness, cleanliness } = this.needs;

    // Critical: any need is in the danger zone
    if (hunger > 90 || energy < 10 || happiness < 10 || cleanliness < 10) {
      return 'critical';
    }

    // Unhappy: multiple needs are bad
    let badCount = 0;
    if (hunger > 65) badCount++;
    if (energy < 25) badCount++;
    if (happiness < 35) badCount++;
    if (cleanliness < 30) badCount++;
    if (badCount >= 2) return 'unhappy';

    // Happy: most needs are well-met
    if (happiness > 60 && hunger < 45 && energy > 40 && cleanliness > 45) {
      return 'happy';
    }

    return 'neutral';
  }

  // ------------------------------------------------------------------
  // applyOfflineDrift — three-tier smoothing for time spent offline
  // ------------------------------------------------------------------
  // Tier 1 (Short, ≤ 4 h):  Linear calculation at normal offline rate.
  // Tier 2 (Medium, 4–48 h): First 4 h linear, then logarithmic decay.
  // Tier 3 (Long, > 48 h):   All needs settle to a middle state and
  //                           the method returns { isLongAbsence: true }
  //                           so the renderer can show a special
  //                           "好久不见" greeting.
  // ------------------------------------------------------------------

  applyOfflineDrift(elapsedSeconds: number): { isLongAbsence: boolean } {
    const offlineHours = elapsedSeconds / 3600;

    // ---- Tier 3: Long absence (> 48 h) ----
    // All needs return to a fixed middle state.
    if (offlineHours > 48) {
      this.needs.hunger      = 50;  // half full
      this.needs.energy      = 80;  // well rested
      this.needs.happiness   = 40;  // missed you
      this.needs.cleanliness = 50;
      this.clampAll();
      return { isLongAbsence: true };
    }

    const { hungerBase, energyDrainBase, happinessDecayBase, cleanlinessDecayBase } = NEEDS_DECAY;
    const { appetite, agility, playful, hygiene } = this.attributes;

    if (offlineHours <= 4) {
      // ---- Tier 1: Short offline (≤ 4 h) — linear ----
      const scaled = elapsedSeconds * OFFLINE_DRIFT_MULTIPLIER;
      this.needs.hunger      += hungerBase * (appetite / 50) * scaled;
      this.needs.energy      -= energyDrainBase * (agility / 50) * scaled * 0.5;
      this.needs.happiness   -= happinessDecayBase * ((100 - playful) / 50) * scaled;
      this.needs.cleanliness -= cleanlinessDecayBase * ((100 - hygiene) / 50) * scaled;
    } else {
      // ---- Tier 2: Medium offline (4–48 h) ----
      // First 4 h linear
      const linearSeconds = 4 * 3600;
      const scaledLinear = linearSeconds * OFFLINE_DRIFT_MULTIPLIER;
      this.needs.hunger      += hungerBase * (appetite / 50) * scaledLinear;
      this.needs.energy      -= energyDrainBase * (agility / 50) * scaledLinear * 0.5;
      this.needs.happiness   -= happinessDecayBase * ((100 - playful) / 50) * scaledLinear;
      this.needs.cleanliness -= cleanlinessDecayBase * ((100 - hygiene) / 50) * scaledLinear;

      // Remaining hours: logarithmic decay
      const extraHours = offlineHours - 4;
      const logFactor = Math.log(1 + extraHours) * 10; // log-scaled hours
      const scaledLog = logFactor * 3600 * OFFLINE_DRIFT_MULTIPLIER;
      this.needs.hunger      += hungerBase * (appetite / 50) * scaledLog;
      // Energy naturally recovers toward 70 % during medium absences
      const energyTarget = 70;
      if (this.needs.energy < energyTarget) {
        this.needs.energy = Math.min(
          energyTarget,
          this.needs.energy + (energyTarget - this.needs.energy) * 0.5,
        );
      }
      this.needs.happiness   -= happinessDecayBase * ((100 - playful) / 50) * scaledLog * 0.5;
      this.needs.cleanliness -= cleanlinessDecayBase * ((100 - hygiene) / 50) * scaledLog * 0.5;
    }

    // Offline floor: never let any need go fully critical while away
    this.needs.hunger      = Math.min(this.needs.hunger, 85);
    this.needs.energy      = Math.max(this.needs.energy, 15);
    this.needs.happiness   = Math.max(this.needs.happiness, 20);
    this.needs.cleanliness = Math.max(this.needs.cleanliness, 15);
    this.clampAll();

    return { isLongAbsence: false };
  }

  // ------------------------------------------------------------------
  // Serialisation helpers
  // ------------------------------------------------------------------

  snapshot(): PetNeeds {
    return { ...this.needs };
  }

  // ------------------------------------------------------------------
  // Internal
  // ------------------------------------------------------------------

  private clampAll(): void {
    this.needs.hunger      = clamp0100(this.needs.hunger);
    this.needs.energy      = clamp0100(this.needs.energy);
    this.needs.happiness   = clamp0100(this.needs.happiness);
    this.needs.cleanliness = clamp0100(this.needs.cleanliness);
  }
}

// ============================================================
// Helpers
// ============================================================

function clamp0100(v: number): number {
  return Math.max(0, Math.min(100, v));
}

/**
 * Pick a bubble text from a pool based on the severity of the need.
 * More extreme values unlock more dramatic messages.
 */
function pickBubbleText(
  needType: 'hunger' | 'energy' | 'cleanliness' | 'happiness',
  value: number,
): string {
  const pool = BUBBLE_TEXT_POOL[needType];
  // Pick from "mild" if value is borderline, "severe" if extreme
  const isSevere =
    needType === 'hunger' ? value > 85 :
    needType === 'energy' ? value < 10 :
    needType === 'cleanliness' ? value < 15 :
    value < 15;

  const list = isSevere ? pool.severe : pool.mild;
  return list[Math.floor(Math.random() * list.length)];
}

// Bubble message pools — mild (borderline) and severe (critical) variants.
// The variety makes the pet feel more alive and less repetitive.
const BUBBLE_TEXT_POOL: Record<
  'hunger' | 'energy' | 'cleanliness' | 'happiness',
  { mild: string[]; severe: string[] }
> = {
  hunger: {
    mild: ['好饿...', '想吃东西...', '肚子咕咕叫...', '有点饿了...'],
    severe: ['饿死了！', '快饿扁了...', '什么都想吃！', '救命，好饿！'],
  },
  energy: {
    mild: ['好困...', '有点累了...', '想休息一下...', '眼皮好重...'],
    severe: ['困得不行了...', '快要睡着了...', '撑不住了...zzZ'],
  },
  cleanliness: {
    mild: ['好脏...', '身上好黏...', '想洗个澡...', '有点难受...'],
    severe: ['脏死了！', '受不了了...', '需要清洁！', '臭臭的...'],
  },
  happiness: {
    mild: ['好无聊...', '有点闷...', '想做点什么...', '无聊啊...'],
    severe: ['好寂寞...', '没人理我...', '好想玩...', '心情好差...'],
  },
};
