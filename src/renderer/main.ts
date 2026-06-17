// ============================================================
// PixelPal -- Main Renderer Entry Point
// ============================================================
//
// Orchestrates every subsystem in the renderer process:
//   PetRenderer   -- canvas drawing & sprite animation
//   PetManager    -- FSM, behavior tree, needs, movement
//   BubbleSystem  -- speech-bubble display & queue
//   InputHandler  -- mouse interactions & context menu
//   GameLoop      -- RAF-based update/render cycle
//   OnboardingSystem -- first-time pet creation flow
//
// Lifecycle:
//   DOMContentLoaded -> init() -> start game loop -> run forever
//
// Data flow:
//   Main process (DB) --[loadPet]--> PetManager --[serialize]--> save
//   PetManager --[getCurrentAnimation]--> PetRenderer --[render]--> canvas
//   PetManager --[shouldShowBubble]--> BubbleSystem --[show]--> DOM
//   TimeContext --[empathy]--> BubbleSystem
// ============================================================

import type {
  PetEntity,
  PetType,
  AppSettings,
  TimeContext,
  FreqLevel,
} from '../shared/types';
import {
  CANVAS_SIZE,
  SAVE_DEBOUNCE_MS,
  EMPATHY_MESSAGES,
  MILESTONES,
  BREED_REGISTRY,
  COLD_JOKES,
  JOKE,
  JOKE_LEVEL_CHANCE,
  MISCHIEF_LEVEL,
  COIN_REWARDS,
  ROAM_COIN,
  MEMORY,
} from '../shared/constants';
import { SeededRandom } from '../shared/rng';

import { PetRenderer } from './engine/renderer';
import { GameLoop } from './engine/game-loop';
import { sound } from './engine/sound';
import { PetManager } from './pet/pet-entity';
import { generateAttributes } from './pet/attributes';
import { rollRandomPet, applyBreedModifiers, getRarityLabel } from './pet/pet-pool';
import { BubbleSystem } from './interaction/bubble';
import { InputHandler } from './interaction/input-handler';
import { OnboardingSystem } from './interaction/onboarding';
import { GifRecorder } from './interaction/gif-recorder';
import { WorldRoamer } from './world/roamer';

// ============================================================
// Module-level state
// ============================================================

let renderer: PetRenderer;
let petManager: PetManager;
let bubbleSystem: BubbleSystem;
let inputHandler: InputHandler;
let gameLoop: GameLoop;
let gifRecorder: GifRecorder;
let roamer: WorldRoamer;
let focusModeActive: boolean = false;
/** True while the pet is away at a job (behaviour paused, window hidden by main). */
let workingAway: boolean = false;

// Runtime mirror of the behaviour-relevant settings (refreshed on change).
let behaviorSettings: { roam: boolean; mischiefLevel: FreqLevel; jokeLevel: FreqLevel } = {
  roam: true,
  mischiefLevel: 'low',
  jokeLevel: 'medium',
};

// Track the previous FSM state so we can detect poop / wander entries.
let lastFsmState = '';
let jokeTimer: ReturnType<typeof setInterval> | null = null;
let memoryTimer: ReturnType<typeof setInterval> | null = null;

// Coin-award cooldowns (anti-spam, ms).
const coinCooldowns: Record<string, number> = {};
let lastCoinFindTime = 0;

// Save management
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pendingSave: boolean = false;
let lastSavedState: string = '';

// Empathy tracking
let lastEmpathyAction: string = '';
let empathyPollTimer: ReturnType<typeof setInterval> | null = null;
/** Tracks whether the low-battery slowdown is currently applied (Patch 2). */
let lowBatterySlowdownActive: boolean = false;

// Cleanup functions returned by event listeners
const unsubscribers: Array<() => void> = [];

// ============================================================
// Bootstrap
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  init().catch(err => {
    console.error('[PixelPal] Fatal initialization error:', err);
  });
});

// ============================================================
// init -- the master setup sequence
// ============================================================

async function init(): Promise<void> {
  console.log('[PixelPal] Initializing...');

  // ---- (a) Get canvas element ----
  const canvas = document.getElementById('pet-canvas') as HTMLCanvasElement;
  if (!canvas) {
    throw new Error('Canvas element #pet-canvas not found in DOM');
  }

  // ---- (b) Create PetRenderer ----
  renderer = new PetRenderer(canvas);

  // Attempt to load a spritesheet image.  If unavailable (no asset
  // file present), the renderer automatically falls back to its
  // built-in programmatic pixel-art cat.
  try {
    await renderer.loadSpritesheet('assets/spritesheet.png');
    console.log('[PixelPal] Spritesheet loaded successfully');
  } catch {
    console.log('[PixelPal] No spritesheet found, using fallback pixel art');
  }

  // ---- (c) Check if pet exists, create or load ----
  let petData: PetEntity;

  const exists = await window.pixelpal.petExists();

  if (!exists) {
    // New user: run the onboarding flow to create emotional attachment
    console.log('[PixelPal] No pet found, starting onboarding...');
    petData = await runOnboarding();
  } else {
    // Returning user: load from DB and apply offline compensation
    console.log('[PixelPal] Loading existing pet...');
    petData = await window.pixelpal.loadPet();

    const elapsedSeconds = (Date.now() - petData.lastActiveAt) / 1000;
    if (elapsedSeconds > 60) {
      // Apply gentle offline drift (30% rate) so the pet is not
      // in critical condition after a long absence
      const tempManager = new PetManager(petData);
      tempManager.applyOfflineDrift(elapsedSeconds);
      petData = tempManager.serialize();
      console.log(
        `[PixelPal] Applied offline drift for ${Math.round(elapsedSeconds / 60)} minutes`,
      );
    }
  }

  // ---- (d) Create PetManager (runtime) ----
  petManager = new PetManager(petData);

  // Centre the pet horizontally on the canvas
  petManager.x = CANVAS_SIZE / 2;
  petManager.y = CANVAS_SIZE;

  // ---- Set species & breed colors on renderer ----
  renderer.species = petData.species || 'cat';
  const breedDef = BREED_REGISTRY.find(b => b.id === petData.breed);
  if (breedDef) {
    renderer.breedColors = breedDef.colors;
  }

  // ---- (e) Create BubbleSystem ----
  bubbleSystem = new BubbleSystem();

  // ---- (f) Create InputHandler and wire up event listeners ----
  inputHandler = new InputHandler(canvas, renderer, petManager, bubbleSystem);
  inputHandler.setup();

  // ---- (f2) Create GifRecorder and wire up recording / screenshot ----
  gifRecorder = new GifRecorder(canvas);
  setupRecording(canvas);

  // ---- (f3) Load behaviour settings & create the desktop roamer ----
  try {
    const settings = await window.pixelpal.getSettings();
    behaviorSettings.roam = settings.roam ?? true;
    behaviorSettings.mischiefLevel = settings.mischiefLevel ?? 'low';
    behaviorSettings.jokeLevel = settings.jokeLevel ?? 'medium';
    applySoundSettings(settings);
  } catch { /* keep defaults */ }

  // Browsers need a user gesture to start audio — resume on first interaction.
  const resumeAudio = () => sound.resume();
  document.addEventListener('pointerdown', resumeAudio, { once: true });
  unsubscribers.push(() => document.removeEventListener('pointerdown', resumeAudio));

  // Load the wallet so equipped cosmetics render on the pet.
  try {
    const wallet = await window.pixelpal.getWallet();
    renderer.equipped = wallet.equipped || {};
  } catch { /* no wallet yet */ }

  roamer = new WorldRoamer();
  roamer.setEnabled(behaviorSettings.roam);
  roamer.mischiefChance = MISCHIEF_LEVEL[behaviorSettings.mischiefLevel].chance;
  roamer.onMischief = () => triggerMischief(false);
  roamer.onFindCoins = () => tryFindCoins();
  await roamer.init();

  // Award coins for owner interactions (cooldown-guarded in awardCoins).
  inputHandler.onEarnCoins = (reason: string) => awardCoins(reason);

  // ---- (g) Create GameLoop with update + render callbacks ----
  gameLoop = new GameLoop(
    (dt: number) => update(dt),
    () => render(),
  );

  // ---- (h) Start the game loop ----
  gameLoop.start();
  console.log('[PixelPal] Game loop started');

  // ---- (i) Setup periodic save (debounced every 8s + key events) ----
  setupPeriodicSave();

  // ---- (j) Setup time-context polling (every 30s) for empathy clock ----
  setupEmpathyClock();

  // ---- (k) Listen for shutdown event (峰终告别) ----
  setupShutdownListener();

  // ---- (l) Listen for settings changes from other windows ----
  setupSettingsListener();

  // ---- (m) Handle focus mode toggle ----
  setupFocusModeListener();

  // ---- (m2) Main → renderer pushed bubbles (weather report etc.) ----
  setupPushBubbleListener();

  // ---- (m3) "Pet was killed" → re-hatch a fresh machine-bound pet ----
  setupKilledListener();

  // ---- (m4) Cold-joke scheduler (the pet tells corny jokes) ----
  setupJokeScheduler();

  // ---- (m5) Wallet sync (equipped cosmetics) + consumable use ----
  setupWalletAndItems();

  // ---- (m6) Pet actions pushed from the settings window (record/screenshot) ----
  setupPetActionListener();

  // ---- (m6b) Work state (pet leaves to work / comes back) ----
  setupWorkStateListener();

  // ---- (m7) Memory recall — the pet reminisces about your time together ----
  setupMemoryRecall();

  // ---- (n) Save on window unload ----
  window.addEventListener('beforeunload', () => {
    saveImmediate();
  });

  // ---- (o) Listen for externally-loaded pet data ----
  const unsubPetLoaded = window.pixelpal.onPetLoaded((pet: PetEntity) => {
    console.log('[PixelPal] Pet data refreshed from main process');
    petManager = new PetManager(pet);
    petManager.x = CANVAS_SIZE / 2;
    petManager.y = CANVAS_SIZE;
    // Update renderer species & colors
    renderer.species = pet.species || 'cat';
    const bd = BREED_REGISTRY.find(b => b.id === pet.breed);
    if (bd) renderer.breedColors = bd.colors;
    // Re-wire input handler to the new pet manager
    inputHandler.teardown();
    inputHandler = new InputHandler(canvas, renderer, petManager, bubbleSystem);
    inputHandler.setup();
    // Re-wire context-menu actions on the new input handler
    inputHandler.onExternalAction = handleExternalAction;
    inputHandler.onEarnCoins = (reason: string) => awardCoins(reason);
  });
  unsubscribers.push(unsubPetLoaded);

  // Greet on first load
  bubbleSystem.showGreeting(pickRandom(EMPATHY_MESSAGES.morning));

  console.log(
    `[PixelPal] Ready! Pet "${petData.name}" (Lv.${petData.level}, stage ${petData.evolutionStage})`,
  );
}

// ============================================================
// Onboarding flow
// ============================================================

/**
 * Run the onboarding experience and return a new PetEntity.
 *
 * The creature's species / breed / six attributes are derived from a
 * machine-bound seed, so every blind box opened on THIS computer
 * yields the same pet identity (its "temper, IQ and personality").
 * Only killing the pet — which advances the incarnation counter —
 * produces a different creature.
 */
async function runOnboarding(): Promise<PetEntity> {
  // Fetch the machine-bound seed up-front (deterministic generation).
  let effectiveSeed = 0;
  let incarnation = 0;
  try {
    const seedInfo = await window.pixelpal.getMachineSeed();
    effectiveSeed = seedInfo.effectiveSeed;
    incarnation = seedInfo.incarnation;
  } catch {
    // Fallback: derive a one-off seed from the clock so we still work.
    effectiveSeed = (Date.now() >>> 0);
  }

  return new Promise<PetEntity>((resolve) => {
    const onboarding = new OnboardingSystem((name: string) => {
      // Onboarding complete -- build the pet entity deterministically.
      const now = Date.now();
      const rng = new SeededRandom(effectiveSeed);

      const baseAttributes = generateAttributes(() => rng.random());

      // Roll species + breed from the same seeded stream.
      const { species, breed } = rollRandomPet(() => rng.random());

      // Apply breed-specific attribute modifiers to the seeded base
      const attributes = applyBreedModifiers(baseAttributes, breed.attributeModifiers);

      const pet: PetEntity = {
        // Deterministic, machine-bound id (stable per incarnation).
        id: `pet_${effectiveSeed.toString(36)}_${incarnation}`,
        name: name || breed.name,
        type: species as PetType,  // backward compat
        species: species,
        breed: breed.id,
        attributes,
        level: 1,
        exp: 0,
        expToNext: 100,
        hp: 55,
        maxHp: 55,
        stats: { atk: 6, def: 4, spd: 5, critRate: 0.05 },
        skills: [],
        inventory: [],
        equipment: {},
        needs: {
          hunger: 40,
          energy: 80,
          happiness: 70,
          cleanliness: 80,
        },
        evolutionStage: 1,
        poopLocations: [],
        bonding: {
          firstMetAt: now,
          totalPets: 0,
          totalFeeds: 0,
          daysTogether: 0,
          totalInteractions: 0,
          milestones: [],
          memories: [],
        },
        createdAt: now,
        lastActiveAt: now,
        totalPlayTime: 0,
      };

      // Persist the new pet immediately
      window.pixelpal.savePet(pet).catch(err => {
        console.error('[PixelPal] Failed to save new pet:', err);
      });

      // Set renderer species & breed colors before resolving
      renderer.species = species;
      renderer.breedColors = breed.colors;

      // Clean up the onboarding overlay
      onboarding.teardown();

      // Announce the pet species & rarity
      const rarityLabel = getRarityLabel(breed.rarity);
      console.log(`[PixelPal] Hatched: ${breed.name} (${rarityLabel}) [${species}]`);

      resolve(pet);
    });

    onboarding.start();
  });
}

// ============================================================
// Update loop -- called every game tick (~33ms active, ~100ms idle)
// ============================================================

function update(dt: number): void {
  if (focusModeActive || workingAway) return;

  // 1. Update pet manager (needs decay, FSM, behavior tree, movement)
  petManager.update(dt);

  // 1b. Update mood indicator based on current needs
  renderer.updateMood(petManager.needs.snapshot());

  // 2. Get current animation from pet manager
  const animName = petManager.getCurrentAnimation();

  // 3. Tell renderer to play that animation
  renderer.play(animName);

  // 4. Update renderer (advance sprite frames & particles)
  renderer.update(dt);

  // 5. Check for bubbles from the needs system
  const bubble = petManager.shouldShowBubble();
  if (bubble) {
    bubbleSystem.show(bubble);
  }

  // 6. Check for milestones
  const newMilestones = petManager.checkMilestones();
  for (const msId of newMilestones) {
    const msDef = MILESTONES.find(m => m.id === msId);
    if (msDef) {
      bubbleSystem.showMilestone(msDef.name);
      sound.play('achievement');
      renderer.playAchievementFx();
      // Achievement banner + coin reward
      showLevelBanner(`🏆 ${msDef.icon} ${msDef.name}`, false);
      if (msDef.coin) {
        window.pixelpal.earnCoins(msDef.coin).catch(() => {});
      }
      // Spawn celebration particles
      for (let i = 0; i < 6; i++) {
        renderer.addParticle(
          'star',
          CANVAS_SIZE / 2 + (Math.random() - 0.5) * 40,
          CANVAS_SIZE * 0.3 + (Math.random() - 0.5) * 20,
        );
      }
      // Milestones are save-worthy
      scheduleImmediateSave();
    }
  }

  // 7. Auto-switch game loop between active/idle FPS based on pet state
  const state = petManager.fsm.currentState;
  const isHighActivity = ['wander', 'selfplay', 'eat', 'poop', 'fish', 'approach'].includes(state);
  gameLoop.setFPSMode(isHighActivity ? 'active' : 'idle');

  // 7b. Roam the whole desktop (moves the window while wandering)
  if (roamer) {
    roamer.update(dt, petManager);
  }

  // 7c. When the pet enters the poop state, drop a poop on the desktop
  //     at its current screen position (handled by the world overlay).
  if (state === 'poop' && lastFsmState !== 'poop') {
    dropPoopOnDesktop();
    sound.play('poop');
  }
  lastFsmState = state;

  // 8. Check for pending save events from PetManager (eat, levelup, evolution, poop)
  if (petManager.pendingSaveEvents.length > 0) {
    // Award coins for growth milestones + play the celebration spectacle.
    let didLevelup = false;
    let didEvolution = false;
    for (const ev of petManager.pendingSaveEvents) {
      if (ev === 'levelup') {
        window.pixelpal.earnCoins(COIN_REWARDS.levelupPerLevel * petManager.data.level).catch(() => {});
        didLevelup = true;
      } else if (ev === 'evolution') {
        window.pixelpal.earnCoins(COIN_REWARDS.evolution).catch(() => {});
        didEvolution = true;
      }
    }

    // Evolution is the bigger event and implies a level-up — show one.
    if (didEvolution) {
      renderer.playEvolutionFx();
      sound.play('evolution');
      showLevelBanner(`进化！· 阶段 ${petManager.data.evolutionStage}`, true);
      if (bubbleSystem) {
        bubbleSystem.show({ text: `我进化啦！+${COIN_REWARDS.evolution} 爱心币`, type: 'info', duration: 5000, icon: '✨' });
      }
    } else if (didLevelup) {
      renderer.playLevelUpFx();
      sound.play('levelup');
      showLevelBanner(`LEVEL UP! Lv.${petManager.data.level}`, false);
    }

    scheduleImmediateSave();
    petManager.pendingSaveEvents = [];
  }
}

// ============================================================
// Level-up / evolution banner
// ============================================================

/** Show the celebratory banner above the pet, retriggering its animation. */
function showLevelBanner(text: string, isEvolution: boolean): void {
  const el = document.getElementById('levelup-banner');
  if (!el) return;
  el.textContent = text;
  el.classList.remove('show', 'evo');
  if (isEvolution) el.classList.add('evo');
  // Force reflow so the animation restarts even on rapid repeats.
  void el.offsetWidth;
  el.classList.add('show');
}

// ============================================================
// Desktop poop placement
// ============================================================

/**
 * Compute the pet's current screen position and ask the main process
 * to add a poop to the desktop world overlay there.
 */
async function dropPoopOnDesktop(): Promise<void> {
  try {
    const info = await window.pixelpal.getScreenInfo();
    // The 128×128 canvas sits at the window's bottom-left; the pet's
    // feet are near the bottom around petManager.x.
    const x = info.windowX + Math.max(20, Math.min(petManager.x, CANVAS_SIZE - 20));
    const y = info.windowY + 350 - 12;
    await window.pixelpal.worldAddPoop({ x, y });
  } catch {
    // Overlay unavailable — ignore
  }
}

// ============================================================
// Mischief — open one of the user's folders
// ============================================================

/**
 * Trigger the "open a folder" prank.  Auto calls (from the roamer)
 * respect the user's frequency level + cooldown; manual calls (from the
 * right-click menu) always work.  Both are rate-limited in the main process.
 */
async function triggerMischief(manual: boolean): Promise<void> {
  if (!manual && (behaviorSettings.mischiefLevel === 'off' || focusModeActive)) return;
  try {
    const res = await window.pixelpal.mischiefOpenFolder(manual);
    if (res.opened) sound.play('sneaky');
    if (res.opened && bubbleSystem) {
      bubbleSystem.show({
        text: `嘿嘿，去翻翻你的「${res.name}」文件夹~`,
        type: 'monologue',
        duration: 5000,
        icon: '\u{1F4C2}',
      });
    }
  } catch {
    /* ignore */
  }
}

// ============================================================
// Render callback -- called every game tick after update
// ============================================================

function render(): void {
  // The renderer.render() method handles:
  //   1. Clearing the canvas
  //   2. Drawing the pet sprite/fallback (with facing direction)
  //   3. Drawing particles on top
  renderer.render(petManager.facingRight);
}

// ============================================================
// Save management
// ============================================================

/**
 * Setup the periodic debounced save.  Every SAVE_DEBOUNCE_MS (8s),
 * if the pet state has meaningfully changed, serialize and persist.
 */
function setupPeriodicSave(): void {
  saveTimer = setInterval(() => {
    if (!petManager || focusModeActive) return;
    debouncedSave();
  }, SAVE_DEBOUNCE_MS);
}

/**
 * Perform a debounced save -- only writes if the state has actually
 * changed since the last successful save.
 */
function debouncedSave(): void {
  if (!petManager) return;

  const serialized = petManager.serialize();
  const stateKey = buildStateKey(serialized);

  // Skip save if nothing meaningful changed
  if (stateKey === lastSavedState) {
    pendingSave = false;
    return;
  }

  window.pixelpal.savePet(serialized).catch(err => {
    console.error('[PixelPal] Periodic save failed:', err);
  });

  lastSavedState = stateKey;
  pendingSave = false;
}

/**
 * Force an immediate save (used for key events and beforeunload).
 */
function saveImmediate(): void {
  if (!petManager) return;

  const serialized = petManager.serialize();
  // Fire-and-forget for beforeunload; await otherwise
  window.pixelpal.savePet(serialized).catch(err => {
    console.error('[PixelPal] Immediate save failed:', err);
  });
  lastSavedState = buildStateKey(serialized);
}

/**
 * Schedule an immediate save on the next microtask, bypassing
 * the debounce timer.  Used for key events (eat, levelup, etc.).
 */
function scheduleImmediateSave(): void {
  pendingSave = true;
  // Use setTimeout(0) to batch multiple triggers in the same tick
  setTimeout(() => {
    if (pendingSave) {
      debouncedSave();
    }
  }, 0);
}

/**
 * Build a compact string key representing the "save-worthy" parts
 * of the pet state.  Used to skip no-op saves.
 */
function buildStateKey(pet: PetEntity): string {
  return [
    pet.level,
    pet.evolutionStage,
    Math.round(pet.needs.hunger),
    Math.round(pet.needs.energy),
    Math.round(pet.needs.happiness),
    Math.round(pet.needs.cleanliness),
    pet.bonding.totalInteractions,
    pet.bonding.totalFeeds,
    pet.bonding.milestones.length,
    pet.poopLocations.length,
  ].join('|');
}

// ============================================================
// Empathy clock -- time-context polling every 30 seconds
// ============================================================

/**
 * Poll the main process for the current TimeContext every 30s.
 * Based on the time of day and idle duration, show contextual
 * empathy bubbles and influence pet behaviour.
 */
function setupEmpathyClock(): void {
  // Initial poll after a short delay to let things settle
  setTimeout(() => pollTimeContext(), 3000);

  // Then poll every 30 seconds
  empathyPollTimer = setInterval(() => {
    pollTimeContext();
  }, 30_000);
}

async function pollTimeContext(): Promise<void> {
  if (!petManager || !bubbleSystem || focusModeActive) return;

  let ctx: TimeContext;
  try {
    ctx = await window.pixelpal.getTimeContext();
  } catch {
    return; // IPC unavailable
  }

  // ------------------------------------------------------------------
  // Patch 2: One-shot event signals take priority over periodic states.
  // wasLocked / wasSuspended are true exactly once per lock/suspend cycle.
  // ------------------------------------------------------------------

  // ---- Unlock greeting (user returns from lock) ----
  if (ctx.wasLocked && lastEmpathyAction !== 'unlockGreeting') {
    lastEmpathyAction = 'unlockGreeting';
    bubbleSystem.show({
      text: pickRandom(EMPATHY_MESSAGES.unlockGreeting),
      type: 'greeting',
      duration: 4000,
    });
    // Pet jumps up to greet: sleep/daydream → idle
    if (petManager.fsm.isIn('sleep') || petManager.fsm.isIn('daydream')) {
      petManager.fsm.transition('idle', 'empathy-unlock-greet');
    }
    // Restore a little energy from the break
    petManager.needs.rest(3);
    return; // one-shot event wins this poll cycle
  }

  // ---- Resume greeting (system wakes from suspend) ----
  if (ctx.wasSuspended && lastEmpathyAction !== 'resumeGreeting') {
    lastEmpathyAction = 'resumeGreeting';
    bubbleSystem.show({
      text: pickRandom(EMPATHY_MESSAGES.resumeGreeting),
      type: 'greeting',
      duration: 4000,
    });
    // Pet peeks out: sleep → idle (peek animation handled by renderer idle)
    if (petManager.fsm.isIn('sleep')) {
      petManager.fsm.transition('idle', 'empathy-resume-peek');
    }
    petManager.needs.rest(5);
    return; // one-shot event wins this poll cycle
  }

  // ------------------------------------------------------------------
  // Periodic / ongoing signals — only one fires per poll (first match).
  // ------------------------------------------------------------------

  // ---- Late night (00:00--05:00): pet gets sleepy, urges rest ----
  if (ctx.isLateNight && lastEmpathyAction !== 'lateNight') {
    lastEmpathyAction = 'lateNight';
    bubbleSystem.show({
      text: pickRandom(EMPATHY_MESSAGES.lateNight),
      type: 'energy',
      duration: 5000,
    });
    // Nudge the pet toward sleep
    if (petManager.fsm.isIn('idle') || petManager.fsm.isIn('wander')) {
      petManager.fsm.transition('sleep', 'empathy-late-night');
    }
    // Drain energy slightly faster to encourage sleep
    petManager.needs.needs.energy = Math.max(
      10,
      petManager.needs.needs.energy - 5,
    );
  }

  // ---- Morning (06:00--09:00): cheerful greeting + stretch ----
  else if (ctx.isMorning && lastEmpathyAction !== 'morning') {
    lastEmpathyAction = 'morning';
    bubbleSystem.showGreeting(pickRandom(EMPATHY_MESSAGES.morning));
    // Restore some energy from a good night's rest
    petManager.needs.rest(10);
    // Morning stretch: transition to idle if sleeping
    if (petManager.fsm.isIn('sleep')) {
      petManager.fsm.transition('idle', 'empathy-morning-stretch');
    }
  }

  // ---- Friday afternoon: playful mood (fish ×3 chance) ----
  else if (ctx.isFridayAfternoon && lastEmpathyAction !== 'fridayAfternoon') {
    lastEmpathyAction = 'fridayAfternoon';
    bubbleSystem.show({
      text: pickRandom(EMPATHY_MESSAGES.fridayAfternoon),
      type: 'monologue',
      duration: 5000,
    });
    // Boost happiness -- it's almost the weekend!
    petManager.needs.play(5);
    // Friday fish mode: transition to fish if idle/wander
    if (petManager.fsm.isIn('idle') || petManager.fsm.isIn('wander')) {
      petManager.fsm.transition('fish', 'empathy-friday-fish');
    }
  }

  // ---- Low battery (<20%): pet looks tired, animations slow down ----
  // Note: bubble is gated by lastEmpathyAction but slowdown is always applied.
  else if (ctx.isLowBattery) {
    if (lastEmpathyAction !== 'lowBattery') {
      lastEmpathyAction = 'lowBattery';
      bubbleSystem.show({
        text: pickRandom(EMPATHY_MESSAGES.lowBattery),
        type: 'energy',
        duration: 5000,
      });
    }
    // Apply slowdown: drop to idle FPS and nudge pet toward sleep
    if (!lowBatterySlowdownActive) {
      lowBatterySlowdownActive = true;
      if (gameLoop) gameLoop.setFPSMode('idle');
    }
    if (petManager.fsm.isIn('idle') || petManager.fsm.isIn('wander')) {
      petManager.fsm.transition('sleep', 'empathy-low-battery');
    }
    // Drain energy to reflect tiredness
    petManager.needs.needs.energy = Math.max(
      10,
      petManager.needs.needs.energy - 2,
    );
  }

  // Restore normal speed when battery is no longer low
  else if (lowBatterySlowdownActive && !ctx.isLowBattery) {
    lowBatterySlowdownActive = false;
    if (gameLoop) gameLoop.setFPSMode('active');
  }

  // ---- Idle >30min (long idle): loneliness bubble + sleep ----
  else if (ctx.idleMinutes > 30 && lastEmpathyAction !== 'longIdle') {
    lastEmpathyAction = 'longIdle';
    bubbleSystem.show({
      text: pickRandom(EMPATHY_MESSAGES.longIdle),
      type: 'happiness',
      duration: 5000,
    });
    // Happiness decays a bit more from loneliness
    petManager.needs.needs.happiness = Math.max(
      15,
      petManager.needs.needs.happiness - 3,
    );
    // Long idle → sleep
    if (petManager.fsm.isIn('idle') || petManager.fsm.isIn('wander') || petManager.fsm.isIn('daydream')) {
      petManager.fsm.transition('sleep', 'empathy-long-idle-sleep');
    }
  }

  // ---- Idle >5min: self-play or daydream ----
  else if (ctx.idleMinutes > 5 && lastEmpathyAction !== 'idleDaydream') {
    lastEmpathyAction = 'idleDaydream';
    bubbleSystem.show({
      text: pickRandom(EMPATHY_MESSAGES.idleDaydream),
      type: 'monologue',
      duration: 4000,
    });
    // Medium idle → daydream or selfplay
    if (petManager.fsm.isIn('idle') || petManager.fsm.isIn('wander')) {
      const target = Math.random() < 0.5 ? 'daydream' : 'selfplay';
      petManager.fsm.transition(target, 'empathy-idle-daydream');
    }
  }

  // Reset the empathy action tracker at the start of each "normal" period
  // so the messages can fire again next cycle.
  if (
    !ctx.isLateNight &&
    !ctx.isMorning &&
    !ctx.isFridayAfternoon &&
    !ctx.isLowBattery &&
    ctx.idleMinutes <= 5
  ) {
    lastEmpathyAction = '';
  }
}

// ============================================================
// Shutdown farewell (峰终告别)
// ============================================================

/**
 * Listen for the shutdown IPC event.  When the app is about to
 * close, show a farewell bubble and force-save the pet state.
 */
function setupShutdownListener(): void {
  const unsub = window.pixelpal.onShutdown(() => {
    console.log('[PixelPal] Shutdown detected, saying goodbye...');

    // Show farewell bubble
    if (bubbleSystem) {
      bubbleSystem.show({
        text: pickRandom(EMPATHY_MESSAGES.shutdown),
        type: 'greeting',
        duration: 3000,
      });
    }

    // Force save immediately
    saveImmediate();

    // Brief pause so the farewell bubble is visible before the
    // window closes.  The main process typically allows ~1.5s.
    // We do not block the event loop; the window will close
    // when the main process destroys it.
  });

  unsubscribers.push(unsub);
}

// ============================================================
// Settings listener
// ============================================================

/**
 * Listen for settings changes from the settings window or tray
 * menu.  Apply relevant changes at runtime (e.g. bubble frequency,
 * power-save mode).
 */
function setupSettingsListener(): void {
  const unsub = window.pixelpal.onSettingsChanged((settings: AppSettings) => {
    console.log('[PixelPal] Settings updated:', settings);

    // Adjust bubble cooldown based on bubbleFrequency (1=quiet, 10=chatty)
    if (bubbleSystem) {
      const cooldownMs = Math.round(16000 - settings.bubbleFrequency * 1200);
      bubbleSystem.setCooldownMs(Math.max(3000, cooldownMs));
    }

    // Apply behaviour settings (roam / mischief level / joke level) live.
    behaviorSettings.roam = settings.roam ?? true;
    behaviorSettings.mischiefLevel = settings.mischiefLevel ?? 'low';
    behaviorSettings.jokeLevel = settings.jokeLevel ?? 'medium';
    applySoundSettings(settings);
    if (roamer) {
      roamer.setEnabled(behaviorSettings.roam);
      roamer.mischiefChance = MISCHIEF_LEVEL[behaviorSettings.mischiefLevel].chance;
    }

    // Power-save mode: drop to idle FPS when active
    if (settings.powerSave && gameLoop) {
      gameLoop.setFPSMode('idle');
    }

    // Focus mode from settings
    if (settings.focusMode !== focusModeActive) {
      applyFocusMode(settings.focusMode);
    }
  });

  unsubscribers.push(unsub);
}

// ============================================================
// Focus mode
// ============================================================

/**
 * Listen for focus mode IPC events.  When enabled, the pet
 * transitions to a quiet state (sleep/idle), bubbles are
 * suppressed, and a subtle "专注中" indicator is shown.
 */
function setupFocusModeListener(): void {
  const unsub = window.pixelpal.onFocusMode((enabled: boolean) => {
    applyFocusMode(enabled);
  });

  unsubscribers.push(unsub);

  // Also load initial focus mode state from settings
  window.pixelpal.getSettings().then(settings => {
    if (settings.focusMode) {
      applyFocusMode(true);
    }
  }).catch(() => { /* ignore */ });
}

/**
 * Apply or remove focus mode.
 */
function applyFocusMode(enabled: boolean): void {
  focusModeActive = enabled;
  const focusIndicator = document.getElementById('focus-indicator');
  const bubbleContainer = document.getElementById('bubble-container');

  if (enabled) {
    console.log('[PixelPal] Focus mode enabled');

    // Show the focus indicator
    if (focusIndicator) {
      focusIndicator.classList.add('visible');
    }

    // Hide bubble container
    if (bubbleContainer) {
      bubbleContainer.style.display = 'none';
    }

    // Transition pet to sleep if it's in a quiet state
    if (petManager) {
      const state = petManager.fsm.currentState;
      if (['idle', 'wander', 'daydream', 'fish', 'selfplay'].includes(state)) {
        petManager.fsm.transition('sleep', 'focus-mode');
      }
    }

    // Throttle to idle FPS to save resources
    if (gameLoop) {
      gameLoop.setFPSMode('idle');
    }
  } else {
    console.log('[PixelPal] Focus mode disabled');

    // Hide the focus indicator
    if (focusIndicator) {
      focusIndicator.classList.remove('visible');
    }

    // Restore bubble container
    if (bubbleContainer) {
      bubbleContainer.style.display = '';
    }

    // Wake the pet up from focus-mode sleep
    if (petManager && petManager.fsm.isIn('sleep')) {
      petManager.fsm.transition('idle', 'focus-mode-end');
      // Show a waking bubble
      if (bubbleSystem) {
        bubbleSystem.show({
          text: '专注结束啦~',
          type: 'greeting',
          duration: 3000,
        });
      }
    }

    // Resume active FPS
    if (gameLoop) {
      gameLoop.setFPSMode('active');
    }
  }
}

// ============================================================
// Main → renderer pushed bubbles (weather report, notifications)
// ============================================================

function setupPushBubbleListener(): void {
  const unsub = window.pixelpal.onPushBubble((payload) => {
    if (!bubbleSystem || focusModeActive) return;
    // Soft chime for informational pushes (weather report / daily coins).
    if (payload.type === 'info') sound.play('weather');
    bubbleSystem.show({
      text: payload.text,
      type: payload.type,
      duration: payload.duration,
      icon: payload.icon,
    });
    // A pushed message is worth waking up for.
    if (petManager && petManager.fsm.isIn('sleep')) {
      petManager.fsm.transition('idle', 'push-bubble-wake');
    }
  });
  unsubscribers.push(unsub);
}

// ============================================================
// "Pet was killed" → re-hatch a fresh machine-bound creature
// ============================================================

function setupKilledListener(): void {
  const unsub = window.pixelpal.onKilled(() => {
    console.log('[PixelPal] Pet killed — re-hatching a new creature...');
    // Persist nothing for the old pet; reload so onboarding runs again
    // with the advanced incarnation seed.
    saveTimer && clearInterval(saveTimer);
    setTimeout(() => window.location.reload(), 300);
  });
  unsubscribers.push(unsub);
}

// ============================================================
// Cold-joke scheduler — the pet randomly tells corny jokes
// ============================================================

function setupJokeScheduler(): void {
  jokeTimer = setInterval(() => {
    if (focusModeActive || !petManager || !bubbleSystem) return;

    // Per-check probability comes from the user-chosen frequency level.
    const chance = JOKE_LEVEL_CHANCE[behaviorSettings.jokeLevel] ?? 0;
    if (chance <= 0) return;

    // Don't interrupt sleep / drag / eat — only chat when free-ish.
    const state = petManager.fsm.currentState;
    if (!['idle', 'wander', 'daydream', 'selfplay'].includes(state)) return;

    if (Math.random() > chance) return;

    const joke = pickRandom(COLD_JOKES);
    sound.play('joke');
    bubbleSystem.show({
      text: joke,
      type: 'monologue',
      duration: 7000,
      icon: '\u{1F61C}', // 😜
    });
  }, JOKE.checkIntervalMs);
}

/** Tell a cold joke right now (used by the context menu). */
function tellJokeNow(): void {
  if (!bubbleSystem) return;
  sound.play('joke');
  bubbleSystem.show({
    text: pickRandom(COLD_JOKES),
    type: 'monologue',
    duration: 7000,
    icon: '\u{1F61C}',
  });
}

// ============================================================
// Currency — earning coins
// ============================================================

const COIN_COOLDOWN: Record<string, number> = { pet: 2500, feed: 1500, cleanPoop: 0 };

/** Award coins for an owner interaction (cooldown-guarded). */
function awardCoins(reason: string): void {
  const amountMap: Record<string, number> = {
    pet: COIN_REWARDS.pet,
    feed: COIN_REWARDS.feed,
    cleanPoop: COIN_REWARDS.cleanPoop,
  };
  const amount = amountMap[reason];
  if (!amount) return;

  const now = performance.now();
  const cd = COIN_COOLDOWN[reason] ?? 1000;
  if (now - (coinCooldowns[reason] ?? 0) < cd) return;
  coinCooldowns[reason] = now;

  window.pixelpal.earnCoins(amount).catch(() => {});
  sound.play('coin');
  if (renderer) renderer.addParticle('star', CANVAS_SIZE / 2, CANVAS_SIZE * 0.4);
}

/** The pet "finds" some coins while roaming (passive income). */
function tryFindCoins(): void {
  const now = performance.now();
  if (now - lastCoinFindTime < ROAM_COIN.cooldownMs) return;
  lastCoinFindTime = now;

  const amt = ROAM_COIN.min + Math.floor(Math.random() * (ROAM_COIN.max - ROAM_COIN.min + 1));
  window.pixelpal.earnCoins(amt).catch(() => {});
  sound.play('coin');
  if (bubbleSystem) {
    bubbleSystem.show({ text: `咦，捡到 ${amt} 个爱心币！`, type: 'info', duration: 4000, icon: '\u{1FA99}' });
  }
  if (renderer) {
    for (let i = 0; i < 3; i++) {
      renderer.addParticle('star', CANVAS_SIZE / 2 + (Math.random() - 0.5) * 30, CANVAS_SIZE * 0.4);
    }
  }
}

// ============================================================
// Wallet sync + consumable use (shop)
// ============================================================

function setupWalletAndItems(): void {
  unsubscribers.push(
    window.pixelpal.onWalletChanged((wallet) => {
      if (renderer) renderer.equipped = wallet.equipped || {};
    }),
  );
  unsubscribers.push(
    window.pixelpal.onUseItem((payload) => applyItemToPet(payload)),
  );
}

/** Apply a purchased consumable's effect to the LIVE pet. */
function applyItemToPet(payload: { effect: any; name: string; icon: string; category: string }): void {
  if (!petManager) return;
  const e = payload.effect || {};
  const n = petManager.needs.needs;
  const cl = (v: number) => Math.max(0, Math.min(100, v));

  if (e.hunger) n.hunger = cl(n.hunger + e.hunger);
  if (e.energy) n.energy = cl(n.energy + e.energy);
  if (e.happiness) n.happiness = cl(n.happiness + e.happiness);
  if (e.cleanliness) n.cleanliness = cl(n.cleanliness + e.cleanliness);
  if (e.exp) petManager.gainExp(e.exp);

  sound.play('feed');

  const fsm = petManager.fsm;
  if (fsm.isIn('idle') || fsm.isIn('wander')) {
    fsm.transition(e.hunger && e.hunger < 0 ? 'eat' : 'selfplay', 'shop-item');
  }

  if (bubbleSystem) {
    bubbleSystem.show({
      text: `谢谢主人的${payload.name}！`,
      type: 'happiness',
      duration: 4000,
      icon: payload.icon,
    });
  }
  if (renderer) {
    for (let i = 0; i < 4; i++) {
      renderer.addParticle('heart', CANVAS_SIZE / 2 + (Math.random() - 0.5) * 30, CANVAS_SIZE * 0.35);
    }
  }
  // Record a keepsake memory for meaningful gifts.
  if (payload.category === 'special') {
    petManager.recordMemory('custom', `主人给我买了${payload.name}，好开心！`);
  }
  saveImmediate();
}

// ============================================================
// Pet actions pushed from the settings window (record / screenshot)
// ============================================================

function setupPetActionListener(): void {
  unsubscribers.push(
    window.pixelpal.onPetAction((action: string) => handleExternalAction(action)),
  );
}

// ============================================================
// Work state — the pet leaves to work and bounces back
// ============================================================

function setupWorkStateListener(): void {
  unsubscribers.push(
    window.pixelpal.onWorkState((working: boolean) => {
      workingAway = working;
      sound.play(working ? 'work-start' : 'work-return');
      if (!working) {
        // Just got back from work — bounce + sparkle a welcome.
        if (gameLoop) gameLoop.setFPSMode('active');
        if (petManager && (petManager.fsm.isIn('idle') || petManager.fsm.isIn('sleep'))) {
          petManager.fsm.transition('interact', 'back-from-work');
        }
        if (renderer) {
          for (let i = 0; i < 5; i++) {
            renderer.addParticle('heart', CANVAS_SIZE / 2 + (Math.random() - 0.5) * 30, CANVAS_SIZE * 0.35);
          }
        }
      }
    }),
  );
}

// ============================================================
// Memory recall — the pet reminisces about your time together
// ============================================================

function setupMemoryRecall(): void {
  memoryTimer = setInterval(() => {
    if (focusModeActive || !petManager || !bubbleSystem) return;
    const state = petManager.fsm.currentState;
    if (!['idle', 'wander', 'daydream'].includes(state)) return;
    if (Math.random() > MEMORY.chance) return;

    const line = composeMemoryLine();
    if (line) {
      bubbleSystem.show({ text: line, type: 'monologue', duration: 6000, icon: '\u{1F4AD}' });
    }
  }, MEMORY.checkIntervalMs);
}

/** Build a reminiscence line from real bonding stats + logged memories. */
function composeMemoryLine(): string | null {
  if (!petManager) return null;
  const b = petManager.data.bonding;
  const candidates: string[] = [];

  if (b.daysTogether > 0) candidates.push(`我们已经在一起 ${b.daysTogether} 天啦，时间过得真快~`);
  if (b.totalPets > 5) candidates.push(`你一共摸了我 ${b.totalPets} 次呢，最喜欢被你摸头了`);
  if (b.totalFeeds > 3) candidates.push(`谢谢你喂了我 ${b.totalFeeds} 次好吃的`);
  if (b.totalInteractions > 10) candidates.push(`我们一起玩了 ${b.totalInteractions} 回，每次都好开心`);
  for (const m of b.memories.slice(-5)) candidates.push(`还记得吗…${m.description}`);
  if (candidates.length === 0) candidates.push('能遇到你，真好呀~');

  return pickRandom(candidates);
}

// ============================================================
// GIF Recording & Screenshot (Patch 3)
// ============================================================

/**
 * Wire up the GifRecorder: keyboard shortcut (Ctrl+Shift+G)
 * and context menu delegation for recording / screenshot.
 */
function setupRecording(canvas: HTMLCanvasElement): void {
  // ---- Keyboard shortcut: Ctrl+Shift+G triggers GIF recording ----
  const keyHandler = (e: KeyboardEvent) => {
    if (e.ctrlKey && e.shiftKey && (e.key === 'G' || e.key === 'g')) {
      e.preventDefault();
      startGifRecording();
    }
  };
  document.addEventListener('keydown', keyHandler);
  unsubscribers.push(() => document.removeEventListener('keydown', keyHandler));

  // ---- Context menu external actions ----
  inputHandler.onExternalAction = handleExternalAction;
}

/**
 * Handle context-menu actions delegated from the InputHandler.
 * Shared between initial setup and the post-reload re-wiring.
 */
function handleExternalAction(action: string): void {
  switch (action) {
    case 'record':
      startGifRecording();
      break;
    case 'screenshot':
      takeScreenshot();
      break;
    case 'joke':
      tellJokeNow();
      break;
    case 'mischief':
      triggerMischief(true);
      break;
    case 'cleanpoop':
      window.pixelpal.worldClearPoops().catch(() => { /* ignore */ });
      if (bubbleSystem) {
        bubbleSystem.show({ text: '便便清干净啦~', type: 'cleanliness', duration: 3000 });
      }
      break;
    case 'killpet': {
      if (!petManager) break;
      const ok = window.confirm(
        '要把它放归大自然吗？🍃\n它会带着和你的回忆，去追寻属于自己的梦想~\n（这一只是和本机绑定的，放归后就不会再回来咯）',
      );
      if (!ok) break;
      const adopt = window.confirm(
        '要再领养一只新的小伙伴吗？\n\n点「确定」：现在就挑选一颗新的蛋\n点「取消」：先退出程序，下次打开再挑~',
      );
      const id = petManager.data.id;
      if (adopt) {
        window.pixelpal.killPet(id).catch(() => { /* ignore */ });
      } else {
        window.pixelpal.releaseAndQuit(id).catch(() => { /* ignore */ });
      }
      break;
    }
  }
}

/**
 * Start a 3-second GIF recording.
 * Shows the recording indicator and a bubble, then auto-saves
 * the resulting GIF file when recording completes.
 */
async function startGifRecording(): Promise<void> {
  if (!gifRecorder || gifRecorder.isRecording) {
    if (bubbleSystem) {
      bubbleSystem.show({ text: '正在录制中...', type: 'info', duration: 2000 });
    }
    return;
  }

  console.log('[PixelPal] Starting GIF recording...');

  // Show the recording indicator overlay
  const indicator = document.getElementById('recording-indicator');
  if (indicator) indicator.classList.add('visible');

  // Show "recording" bubble
  if (bubbleSystem) {
    bubbleSystem.show({ text: '录制中... (3s)', type: 'info', duration: 3000 });
  }

  try {
    const gifBlob = await gifRecorder.recordGif(3000);

    // Generate a timestamped filename
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
      .slice(0, 19);
    const filename = `pixelpal_${timestamp}.gif`;

    // Save the GIF
    saveBlob(gifBlob, filename);

    // Show success bubble
    if (bubbleSystem) {
      const sizeKb = Math.round(gifBlob.size / 1024);
      bubbleSystem.show({
        text: `已保存 GIF! (${sizeKb}KB)`,
        type: 'info',
        duration: 4000,
      });
    }

    console.log(`[PixelPal] GIF saved: ${filename} (${Math.round(gifBlob.size / 1024)}KB)`);
  } catch (err) {
    console.error('[PixelPal] GIF recording failed:', err);
    if (bubbleSystem) {
      bubbleSystem.show({ text: '录制失败了...', type: 'info', duration: 3000 });
    }
  } finally {
    // Hide the recording indicator
    if (indicator) indicator.classList.remove('visible');
  }
}

/**
 * Take a single-frame PNG screenshot of the pet canvas
 * and auto-save it.
 */
function takeScreenshot(): void {
  if (!gifRecorder) return;

  const dataUrl = gifRecorder.takeScreenshot();

  // Convert data URL to Blob
  const byteString = atob(dataUrl.split(',')[1]);
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  const pngBlob = new Blob([ab], { type: 'image/png' });

  // Generate a timestamped filename
  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, '-')
    .slice(0, 19);
  const filename = `pixelpal_${timestamp}.png`;

  // Save the PNG
  saveBlob(pngBlob, filename);

  // Show confirmation bubble
  if (bubbleSystem) {
    bubbleSystem.show({ text: '已截图!', type: 'info', duration: 3000 });
  }

  console.log(`[PixelPal] Screenshot saved: ${filename}`);
}

/**
 * Save a Blob to disk via a temporary anchor element.
 * In Electron this triggers a download to the user's downloads folder.
 */
function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();

  // Clean up after a brief delay
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 500);
}

// ============================================================
// Utility helpers
// ============================================================

/** Pick a random element from an array. */
function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Apply all sound-related settings to the SoundManager. */
function applySoundSettings(s: AppSettings): void {
  sound.setEnabled(s.soundEnabled ?? true);
  sound.setVolume(s.soundVolume ?? 70);
  sound.setCategory('interaction', s.sfxInteraction ?? true);
  sound.setCategory('reward', s.sfxReward ?? true);
  sound.setCategory('ambient', s.sfxAmbient ?? true);
}

// ============================================================
// Cleanup on page unload
// ============================================================

window.addEventListener('unload', () => {
  // Teardown input handler
  if (inputHandler) {
    inputHandler.teardown();
  }

  // Stop the game loop
  if (gameLoop) {
    gameLoop.stop();
  }

  // Clear timers
  if (saveTimer !== null) {
    clearInterval(saveTimer);
    saveTimer = null;
  }
  if (empathyPollTimer !== null) {
    clearInterval(empathyPollTimer);
    empathyPollTimer = null;
  }
  if (jokeTimer !== null) {
    clearInterval(jokeTimer);
    jokeTimer = null;
  }
  if (memoryTimer !== null) {
    clearInterval(memoryTimer);
    memoryTimer = null;
  }

  // Unsubscribe from all IPC listeners
  for (const unsub of unsubscribers) {
    try { unsub(); } catch { /* ignore */ }
  }
  unsubscribers.length = 0;

  console.log('[PixelPal] Cleanup complete');
});
