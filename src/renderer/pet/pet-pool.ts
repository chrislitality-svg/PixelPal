// ============================================================
// PixelPal -- Pet Selection Pool (Weighted Random System)
// ============================================================
//
// Handles weighted random pet generation:
//   1. Small chance (0.5%) to roll a special hidden variant
//   2. Roll a species based on species-level weights
//   3. Roll a breed within that species using breed-level weights
//
// Also provides utility functions for rarity display.
// ============================================================

import { SPECIES_WEIGHTS, BREED_REGISTRY } from '../../shared/constants';
import type { PetSpecies, PetAttributes, BreedDefinition, Rarity } from '../../shared/types';

// ---- Variant roll chance (0.5%) ----
const VARIANT_ROLL_CHANCE = 0.005;

// ============================================================
// rollRandomPet
// ============================================================
// Main entry point: returns a randomly selected species + breed.
// Has a small chance to produce a hidden variant instead.
// ============================================================

export function rollRandomPet(
  rand: () => number = Math.random,
): { species: PetSpecies; breed: BreedDefinition } {
  // 1. Check for variant roll first (0.5% chance)
  if (rand() < VARIANT_ROLL_CHANCE) {
    const variants = BREED_REGISTRY.filter(b => b.isVariant);
    if (variants.length > 0) {
      const variant = weightedRandom(variants, rand);
      return { species: variant.species, breed: variant };
    }
  }

  // 2. Roll species based on species weights
  const species = rollSpecies(rand);

  // 3. Roll breed within species (exclude variants from normal pool)
  const breeds = BREED_REGISTRY.filter(b => b.species === species && !b.isVariant);
  if (breeds.length === 0) {
    // Fallback: pick any non-variant breed
    const fallback = BREED_REGISTRY.filter(b => !b.isVariant);
    const breed = weightedRandom(fallback, rand);
    return { species: breed.species, breed };
  }

  const breed = weightedRandom(breeds, rand);
  return { species, breed };
}

// ============================================================
// rollSpecies -- weighted random from SPECIES_WEIGHTS
// ============================================================

function rollSpecies(rand: () => number = Math.random): PetSpecies {
  const entries = Object.entries(SPECIES_WEIGHTS) as [PetSpecies, number][];
  const totalWeight = entries.reduce((sum, [, w]) => sum + w, 0);
  let roll = rand() * totalWeight;

  for (const [species, weight] of entries) {
    roll -= weight;
    if (roll <= 0) {
      return species;
    }
  }

  // Fallback (should not happen)
  return entries[0][0];
}

// ============================================================
// weightedRandom -- pick an item from a weighted array
// ============================================================

function weightedRandom<T extends { weight: number }>(
  items: T[],
  rand: () => number = Math.random,
): T {
  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  let roll = rand() * totalWeight;

  for (const item of items) {
    roll -= item.weight;
    if (roll <= 0) {
      return item;
    }
  }

  // Fallback
  return items[0];
}

// ============================================================
// applyBreedModifiers
// ============================================================
// Takes a base attribute set and applies the breed's +/-
// modifiers, clamping each attribute to [10, 90].
// ============================================================

export function applyBreedModifiers(
  attributes: PetAttributes,
  modifiers: Partial<Record<keyof PetAttributes, number>>,
): PetAttributes {
  const result: PetAttributes = { ...attributes };

  for (const [key, modifier] of Object.entries(modifiers) as [keyof PetAttributes, number | undefined][]) {
    if (modifier !== undefined) {
      result[key] = Math.max(10, Math.min(90, result[key] + modifier));
    }
  }

  return result;
}

// ============================================================
// Rarity display utilities
// ============================================================

/** Chinese rarity labels */
export function getRarityLabel(rarity: Rarity): string {
  const labels: Record<Rarity, string> = {
    common: '普通',
    normal: '常见',
    uncommon: '少见',
    rare: '稀有',
    epic: '史诗',
    legendary: '传说',
    mythic: '神话',
  };
  return labels[rarity] || rarity;
}

/** CSS colors for rarity display (used in UI badges/borders) */
export function getRarityColor(rarity: Rarity): string {
  const colors: Record<Rarity, string> = {
    common: '#9E9E9E',      // gray
    normal: '#4CAF50',      // green
    uncommon: '#2196F3',    // blue
    rare: '#9C27B0',        // purple
    epic: '#FF9800',        // orange
    legendary: '#FFD700',   // gold
    mythic: '#FF1744',      // red
  };
  return colors[rarity] || '#9E9E9E';
}

// ============================================================
// Breed lookup utilities
// ============================================================

/** Find a breed definition by its ID. Returns undefined if not found. */
export function getBreedById(breedId: string): BreedDefinition | undefined {
  return BREED_REGISTRY.find(b => b.id === breedId);
}

/** Get all breeds for a given species (excluding variants by default). */
export function getBreedsForSpecies(species: PetSpecies, includeVariants: boolean = false): BreedDefinition[] {
  return BREED_REGISTRY.filter(
    b => b.species === species && (includeVariants || !b.isVariant),
  );
}
