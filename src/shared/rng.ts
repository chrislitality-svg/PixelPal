// ============================================================
// PixelPal — Seeded deterministic RNG
// ============================================================
// A tiny, dependency-free pseudo-random generator used to make a
// pet's identity (species / breed / six attributes) a pure function
// of a machine-bound seed.  The same seed always reproduces the same
// pet, so every "blind box" opened on this machine yields a creature
// that belongs to THIS computer — not a throwaway random roll.
//
// Shared by both the main process (seed derivation) and the renderer
// (deterministic generation during onboarding).
// ============================================================

/**
 * mulberry32 — a fast 32-bit seeded PRNG.
 * Returns a function producing floats in [0, 1).
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a 32-bit string hash → unsigned 32-bit seed. */
export function hashStringToSeed(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Deterministically mix two 32-bit numbers into a new 32-bit seed. */
export function combineSeed(a: number, b: number): number {
  let h = (a ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (b >>> 0), 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * A small stateful RNG wrapper offering the helpers the pet-generation
 * code needs (float, int, pick, chance).  Deterministic given a seed.
 */
export class SeededRandom {
  private next: () => number;
  readonly seed: number;

  constructor(seed: number) {
    this.seed = seed >>> 0;
    this.next = mulberry32(this.seed);
  }

  /** Float in [0, 1). */
  random(): number {
    return this.next();
  }

  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  /** True with probability p (0..1). */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Pick a uniformly-random element of an array. */
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
}
