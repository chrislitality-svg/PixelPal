// ============================================================
// PixelPal — Six-dimensional Attribute System
// ============================================================
//
// The six attributes define each pet's unique personality and
// drive all behavioral probabilities, needs decay rates, and
// personality descriptions.
//
//   strength  (力量) — physical power, affects drag/push actions
//   agility   (敏捷) — speed, affects wander & energy drain
//   appetite  (食欲) — food desire, affects hunger rate & eat frequency
//   playful   (贪玩) — fun-loving, affects happiness decay & play
//   hygiene   (洁癖) — cleanliness obsession, affects poop & clean
//   wisdom    (智慧) — cleverness, affects daydream, fish, learning
//
// Total sum is always 300 (average 50 per attribute).
// Each attribute ranges from 10 to 90.
// ============================================================

import type { PetAttributes } from '../../shared/types';
import {
  ATTRIBUTES_TOTAL,
  ATTRIBUTE_MIN,
  ATTRIBUTE_MAX,
} from '../../shared/constants';

// ---- Behavior weight map ------------------------------------------------
// Returned by getBehaviorWeights(); used by the behavior tree to scale
// every probability check.  All values roughly in [0.2, 1.8].

export interface BehaviorWeights {
  eatFrequency: number;       // how urgently the pet seeks food
  eatSpeed: number;           // animation speed multiplier while eating
  wanderFrequency: number;    // how often the pet decides to walk around
  selfPlayFrequency: number;  // how often the pet entertains itself
  fishFrequency: number;      // how often the pet tries fishing
  daydreamFrequency: number;  // how often the pet drifts into thought
  sleepRecovery: number;      // how quickly the pet recharges while sleeping
  poopShyness: number;        // how much the pet avoids dirty areas
  interactionResponse: number; // intensity of reactions to owner
  moveSpeed: number;          // base movement speed multiplier
  learningRate: number;       // experience gain multiplier
}

// ---- Attribute keys for iteration ----------------------------------------

const ATTR_KEYS: (keyof PetAttributes)[] = [
  'strength', 'agility', 'appetite', 'playful', 'hygiene', 'wisdom',
];

// ============================================================
// generateAttributes
// ============================================================
// Creates a random attribute set using a balanced redistribution
// algorithm.  Starting from a flat 50 in every stat, the algorithm
// performs 150 small random transfers between attribute pairs,
// producing a natural bell-curve distribution centred on 50 with
// most values in the 30-70 range and rare extremes near 10 or 90.
// The total is always exactly ATTRIBUTES_TOTAL (300).
// ============================================================

export function generateAttributes(rand: () => number = Math.random): PetAttributes {
  const attrs: Record<string, number> = {};
  const base = Math.floor(ATTRIBUTES_TOTAL / ATTR_KEYS.length); // 50
  for (const key of ATTR_KEYS) {
    attrs[key] = base;
  }

  // 150 pairwise transfers of 1-5 points each.
  // Each transfer preserves the total sum.
  // `rand` is injectable so a machine-bound seed produces a stable pet.
  for (let i = 0; i < 150; i++) {
    const a = Math.floor(rand() * ATTR_KEYS.length);
    let b = Math.floor(rand() * (ATTR_KEYS.length - 1));
    if (b >= a) b++;

    const keyA = ATTR_KEYS[a];
    const keyB = ATTR_KEYS[b];
    const maxTransfer = Math.min(
      5,
      attrs[keyA] - ATTRIBUTE_MIN,
      ATTRIBUTE_MAX - attrs[keyB],
    );
    if (maxTransfer > 0) {
      const transfer = Math.floor(rand() * (maxTransfer + 1));
      attrs[keyA] -= transfer;
      attrs[keyB] += transfer;
    }
  }

  return {
    strength: clampAttr(attrs.strength),
    agility:  clampAttr(attrs.agility),
    appetite: clampAttr(attrs.appetite),
    playful:  clampAttr(attrs.playful),
    hygiene:  clampAttr(attrs.hygiene),
    wisdom:   clampAttr(attrs.wisdom),
  };
}

function clampAttr(v: number): number {
  return Math.max(ATTRIBUTE_MIN, Math.min(ATTRIBUTE_MAX, Math.round(v)));
}

// ============================================================
// getPersonalityDescription
// ============================================================
// Builds a short, natural-language Chinese description from the
// attribute values.  The output reads like a personality profile
// the player can relate to, e.g.
//   "贪吃又好动的小家伙，有点邋遢但很聪明"
//
// Strategy:
//   1. For each attribute above/below a threshold, push a trait
//      phrase into a high[] or low[] list.
//   2. Pick a flavour sentence based on which attribute pair is
//      most extreme, giving the description a narrative hook.
//   3. Combine into a final two-clause sentence.
// ============================================================

export function getPersonalityDescription(attrs: PetAttributes): string {
  const high: string[] = [];
  const low: string[] = [];

  // ---- Appetite ----
  if (attrs.appetite >= 70) high.push('贪吃');
  else if (attrs.appetite >= 55) high.push('胃口不错');
  else if (attrs.appetite <= 25) low.push('挑食');
  else if (attrs.appetite <= 40) low.push('吃的不多');

  // ---- Agility ----
  if (attrs.agility >= 70) high.push('好动');
  else if (attrs.agility >= 55) high.push('挺活泼');
  else if (attrs.agility <= 25) low.push('懒洋洋');
  else if (attrs.agility <= 40) low.push('不太爱动');

  // ---- Playful ----
  if (attrs.playful >= 70) high.push('爱玩');
  else if (attrs.playful >= 55) high.push('挺活泼');
  else if (attrs.playful <= 25) low.push('安静');
  else if (attrs.playful <= 40) low.push('比较乖巧');

  // ---- Hygiene ----
  if (attrs.hygiene >= 70) high.push('爱干净');
  else if (attrs.hygiene >= 55) high.push('挺整洁');
  else if (attrs.hygiene <= 25) low.push('邋遢');
  else if (attrs.hygiene <= 40) low.push('有点邋遢');

  // ---- Wisdom ----
  if (attrs.wisdom >= 70) high.push('聪明');
  else if (attrs.wisdom >= 55) high.push('挺机灵');
  else if (attrs.wisdom <= 25) low.push('呆萌');
  else if (attrs.wisdom <= 40) low.push('有点迷糊');

  // ---- Strength ----
  if (attrs.strength >= 70) high.push('壮实');
  else if (attrs.strength <= 25) low.push('瘦弱');

  // Pick a flavour sentence based on the most extreme attribute pair.
  // These give the description a narrative feel rather than a plain list.
  const flavour = pickFlavour(attrs);

  const positive = high.slice(0, 3).join('又');
  const negative = low.slice(0, 2).join('又');

  if (positive && negative) {
    return `${flavour}${positive}的小家伙，有点${negative}`;
  }
  if (positive) {
    return `${flavour}${positive}的小家伙`;
  }
  if (negative) {
    return `${flavour}有点${negative}的小家伙`;
  }
  return `${flavour}普普通通的小家伙`;
}

/** Pick a narrative hook based on the most striking attribute combination. */
function pickFlavour(attrs: PetAttributes): string {
  const { appetite, playful, hygiene, wisdom, agility, strength } = attrs;

  // Two-attribute combos (most specific first)
  if (appetite >= 70 && playful >= 70) return '能吃又能玩，';
  if (wisdom >= 70 && agility >= 70) return '又聪明又灵活，';
  if (strength >= 70 && agility >= 70) return '身强体壮，';
  if (appetite >= 70 && hygiene <= 30) return '贪吃又好动的小家伙，有点邋遢但很';
  if (wisdom >= 70 && playful <= 30) return '安静又聪明的';
  if (playful >= 70 && hygiene <= 30) return '贪玩又不太讲究的';
  if (appetite <= 25 && wisdom >= 60) return '挑食但聪明的';
  if (agility <= 25 && appetite >= 60) return '好吃懒做的';
  if (wisdom <= 30 && strength >= 60) return '四肢发达头脑简单的';

  // Single-attribute hooks
  if (wisdom >= 75) return '特别聪明的';
  if (appetite >= 75) return '超级贪吃的';
  if (playful >= 75) return '特别爱玩的';
  if (agility >= 75) return '灵活好动的';
  if (hygiene >= 75) return '特别爱干净的';
  if (strength >= 75) return '力气很大的';
  if (wisdom <= 20) return '呆头呆脑的';
  if (agility <= 20) return '慢吞吞的';
  if (playful <= 20) return '特别文静的';

  return '';
}

// ============================================================
// getBehaviorWeights
// ============================================================
// Converts raw attributes into a weight map consumed by the
// behavior tree.  Each weight is a multiplier (roughly 0.2–1.8)
// applied to base probabilities from constants.ts.
//
// The mapping is designed so that:
//   - Every attribute matters for at least two behaviours
//   - Extreme values (10 or 90) produce noticeably different pets
//   - The "average" pet (all 50s) has all weights at 1.0
// ============================================================

export function getBehaviorWeights(attrs: PetAttributes): BehaviorWeights {
  return {
    // appetite drives hunger urgency and eating speed
    eatFrequency:       scaleAttr(attrs.appetite),        // 0.2 – 1.8
    eatSpeed:           0.7 + attrs.appetite / 100 * 0.8, // 0.78 – 1.42

    // agility drives wanderlust and movement
    wanderFrequency:    scaleAttr(attrs.agility),
    moveSpeed:          0.5 + attrs.agility / 100,        // 0.6 – 1.4

    // playful drives self-entertainment and fishing
    selfPlayFrequency:  scaleAttr(attrs.playful),
    fishFrequency:      0.4 + attrs.playful / 100 * 1.2,  // 0.52 – 1.48

    // wisdom drives contemplative behaviours
    daydreamFrequency:  scaleAttr(attrs.wisdom),
    learningRate:       0.5 + attrs.wisdom / 100,         // 0.6 – 1.4

    // hygiene drives cleanliness awareness
    poopShyness:        scaleAttr(attrs.hygiene),

    // strength + agility affect sleep quality
    sleepRecovery:      0.6 + (attrs.strength + attrs.agility) / 400, // 0.65 – 1.05

    // overall responsiveness to owner interactions
    interactionResponse: 0.5
      + attrs.playful / 300
      + attrs.wisdom / 300
      + attrs.agility / 300,                               // ~0.6 – 1.4
  };
}

/** Map an attribute value (10-90) to a multiplier centred at 1.0 for value 50. */
function scaleAttr(attr: number): number {
  return 0.2 + (attr / 50) * 0.8;
}

// ============================================================
// AttributeDriftSystem
// ============================================================
// Certain behaviours cause small permanent shifts to the pet's
// six-dimensional attributes over time, making the pet evolve
// based on how it spends its days.
//
// Constraints:
//   - Hard bounds: [15, 85] (5-point buffer from [10, 90])
//   - Sum conservation: total stays in [280, 320]; when one
//     attribute rises, the least-active attribute is deducted.
//   - Daily cap: +/-5 per attribute per 24-hour window.
// ============================================================

// Drift configuration — one rule per triggering event type.
interface DriftRule {
  attribute: keyof PetAttributes;
  amount: number;
  minInterval: number; // ms — minimum gap between two drifts of the same type
}

const DRIFT_RULES: Record<string, DriftRule> = {
  daydream:   { attribute: 'wisdom',   amount: 1,   minInterval: 5  * 60 * 1000 },
  selfplay:   { attribute: 'playful',  amount: 1,   minInterval: 5  * 60 * 1000 },
  eat:        { attribute: 'appetite', amount: 0.5, minInterval: 10 * 60 * 1000 },
  cleanPoop:  { attribute: 'hygiene',  amount: 1,   minInterval: 0 },
  wanderLong: { attribute: 'agility',  amount: 0.5, minInterval: 10 * 60 * 1000 },
};

// Hard drift bounds (tighter than the absolute attribute limits)
const DRIFT_HARD_MIN = 15;
const DRIFT_HARD_MAX = 85;
const DRIFT_SUM_MIN  = 280;
const DRIFT_SUM_MAX  = 320;
const DRIFT_DAILY_CAP = 5;   // max |drift| per attribute per day

export class AttributeDriftSystem {
  /** Timestamp of the last drift applied per event type. */
  private lastDriftTime: Record<string, number> = {};

  /** Net drift applied per attribute in the current 24-hour window. */
  private dailyDrift: Record<string, number> = {};

  /** Epoch ms when the daily window was last reset. */
  private dailyResetTime: number;

  constructor() {
    this.dailyResetTime = Date.now();
  }

  // ------------------------------------------------------------------
  // applyDrift — called when a qualifying behaviour completes
  // ------------------------------------------------------------------
  // Returns a new PetAttributes object with the drift applied, or
  // the original object unchanged if the drift was rejected.
  // ------------------------------------------------------------------

  applyDrift(eventType: string, attributes: PetAttributes): PetAttributes {
    const rule = DRIFT_RULES[eventType];
    if (!rule) return attributes;

    const now = Date.now();

    // ---- Reset daily window every 24 hours ----
    if (now - this.dailyResetTime >= 24 * 60 * 60 * 1000) {
      this.dailyDrift = {};
      this.dailyResetTime = now;
    }

    // ---- Respect minimum interval between same-type drifts ----
    const lastTime = this.lastDriftTime[eventType] ?? 0;
    if (rule.minInterval > 0 && (now - lastTime) < rule.minInterval) {
      return attributes;
    }

    // ---- Check daily cap for the target attribute ----
    const attrKey = rule.attribute;
    const currentDaily = this.dailyDrift[attrKey] ?? 0;
    const absAmount = Math.abs(rule.amount);
    if (Math.abs(currentDaily) + absAmount > DRIFT_DAILY_CAP) {
      return attributes;
    }

    // ---- Build the candidate attribute set ----
    const next: PetAttributes = { ...attributes };
    const gain = rule.amount;

    // Apply gain to the target attribute
    let newVal = next[attrKey] + gain;

    // Enforce hard bounds
    newVal = Math.max(DRIFT_HARD_MIN, Math.min(DRIFT_HARD_MAX, newVal));
    const actualGain = newVal - next[attrKey];

    if (Math.abs(actualGain) < 0.001) {
      // Already at bound — nothing to do
      return attributes;
    }

    next[attrKey] = newVal;

    // ---- Sum conservation: deduct from least-active attribute ----
    const sum = ATTR_KEYS.reduce((s, k) => s + next[k], 0);
    if (sum > DRIFT_SUM_MAX) {
      const excess = sum - DRIFT_SUM_MAX;
      const donor = this.findLeastActiveAttribute(next, attrKey);
      if (donor) {
        const donorVal = next[donor] - excess;
        next[donor] = Math.max(DRIFT_HARD_MIN, donorVal);
      }
    } else if (sum < DRIFT_SUM_MIN) {
      const deficit = DRIFT_SUM_MIN - sum;
      const donor = this.findLeastActiveAttribute(next, attrKey);
      if (donor) {
        const donorVal = next[donor] + deficit;
        next[donor] = Math.min(DRIFT_HARD_MAX, donorVal);
      }
    }

    // ---- Record the drift ----
    this.lastDriftTime[eventType] = now;
    this.dailyDrift[attrKey] = currentDaily + actualGain;

    return next;
  }

  // ------------------------------------------------------------------
  // getDailyDriftReport — for debugging / dev overlay
  // ------------------------------------------------------------------

  getDailyDriftReport(): Record<string, number> {
    return { ...this.dailyDrift };
  }

  // ------------------------------------------------------------------
  // Internal — find the attribute with the lowest value, excluding
  // the one that just gained (so we don't undo the drift).
  // ------------------------------------------------------------------

  private findLeastActiveAttribute(
    attrs: PetAttributes,
    exclude: keyof PetAttributes,
  ): keyof PetAttributes | null {
    let minKey: keyof PetAttributes | null = null;
    let minVal = Infinity;
    for (const key of ATTR_KEYS) {
      if (key === exclude) continue;
      if (attrs[key] < minVal) {
        minVal = attrs[key];
        minKey = key;
      }
    }
    return minKey;
  }
}
