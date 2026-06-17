// ============================================================
// PixelPal — Pet Entity Manager (PetManager)
// ============================================================
//
// The top-level class that ties every subsystem together into a
// single living entity.  PetManager owns the attribute set, the
// NeedsSystem, the FSM, and the BehaviorTree, and orchestrates
// their interaction every frame.
//
// UPDATE CYCLE (called from the GameLoop every ~33 ms):
//   1. NeedsSystem.update()           — decay needs
//   2. BehaviorTree.evaluate()        — decide next action
//   3. PetFSM.update()                — advance state machine
//   4. updateMovement()               — walk toward target
//   5. resolveBehaviorTransition()    — act on BT decision
//   6. checkInteractionAnimation()    — override anim if needed
//   7. checkBubble()                  — show need bubbles
//
// The class also exposes interaction methods (petHead, poke,
// feed, drag, drop) that the renderer's mouse-handler calls,
// as well as food management, experience/levelling, milestone
// tracking, offline compensation, and serialisation.
//
// NAMING: the shared PetEntity interface is imported as
// PetEntityData to avoid a name collision with this class.
// ============================================================

import type {
  PetEntity as PetEntityData,
  PetAttributes,
  PetNeeds,
  PetState,
  PetType,
  AnimationName,
  FoodItem,
  BubbleData,
  PoopLocation,
  BondingData,
  BondingMemory,
} from '../../shared/types';
import {
  INTERACTION,
  BUBBLE_COOLDOWN,
  BUBBLE_DURATION,
  getExpForLevel,
  EVOLUTION_LEVELS,
  MILESTONES,
  CANVAS_SIZE,
} from '../../shared/constants';

import { NeedsSystem } from './needs';
import { PetFSM, type StateTransitionEvent } from './fsm';
import { BehaviorTree } from './behavior-tree';
import { AttributeDriftSystem } from './attributes';

// ============================================================
// Constants local to this module
// ============================================================

const WANDER_RANGE_PX = 50;        // max pixels the pet wanders from origin
const APPROACH_REACH_PX = 10;      // close enough to food to start eating
const BASE_MOVE_SPEED = 30;        // pixels per second at agility 50
const SURPRISED_ANIM_MS = 1500;    // how long the surprised overlay lasts

// ============================================================
// PetManager
// ============================================================

export class PetManager {
  // ---- Core data ----
  data: PetEntityData;
  attributes: PetAttributes;

  // ---- Subsystems ----
  needs: NeedsSystem;
  fsm: PetFSM;
  behaviorTree: BehaviorTree;
  attributeDrift: AttributeDriftSystem;

  // ---- Position ----
  x: number;
  y: number;
  targetX: number;
  facingRight: boolean;
  moveSpeed: number;    // px/s, derived from agility

  // ---- Food on screen ----
  foods: FoodItem[] = [];

  // ---- Bubble cooldown ----
  lastBubbleTime: number = 0;
  private currentBubble: BubbleData | null = null;

  // ---- Interaction tracking ----
  lastInteractionTime: number = 0;
  private totalInteractions: number = 0;

  // ---- Temporary animation override (surprised, poke, etc.) ----
  private interactionAnim: string | null = null;
  private interactionAnimTimer: number = 0;

  // ---- Save-event tracking ----
  pendingSaveEvents: string[] = [];

  // ---- Wander origin (so the pet doesn't drift off screen) ----
  private wanderOriginX: number;

  // ---- Long absence flag (set by applyOfflineDrift) ----
  isLongAbsence: boolean = false;

  // ---- Session tracking for memory recording ----
  private sessionStartTime: number;

  constructor(data: PetEntityData) {
    this.data = data;
    this.attributes = { ...data.attributes };

    // Ensure backward-compatible bonding shape (memories may not exist)
    if (!this.data.bonding.memories) {
      this.data.bonding.memories = [];
    }
    // Temperament starts neutral and drifts with how it's treated.
    if (this.data.bonding.affection == null) this.data.bonding.affection = 50;
    if (this.data.bonding.boldness == null) this.data.bonding.boldness = 50;

    // Initialise subsystems
    this.needs = new NeedsSystem({ ...data.needs }, this.attributes);
    this.fsm = new PetFSM(this.needs, this.attributes);
    this.behaviorTree = new BehaviorTree(this.attributes, this.needs, this.fsm);
    this.attributeDrift = new AttributeDriftSystem();

    // Position (start centred on canvas; caller will set real screen position)
    this.x = 0;
    this.y = 0;
    this.targetX = 0;
    this.wanderOriginX = CANVAS_SIZE / 2;  // anchor wander origin at canvas centre
    this.facingRight = false;

    // Movement speed scales with agility:  0.6× at agi 10, 1.4× at agi 90
    this.moveSpeed = BASE_MOVE_SPEED * (0.5 + this.attributes.agility / 100);

    // Restore bonding counters
    this.totalInteractions = data.bonding.totalInteractions;

    // Session tracking
    this.sessionStartTime = Date.now();

    // Wire up FSM state-change listener for save triggers
    this.fsm.onStateChange((event) => this.onStateChange(event));
  }

  // ==================================================================
  // MAIN UPDATE LOOP
  // ==================================================================

  update(deltaMs: number): void {
    const deltaSeconds = deltaMs / 1000;

    // 1. Decay needs
    this.needs.update(deltaSeconds);

    // 2. Feed current food list and rate-limiter context to the behavior tree
    this.behaviorTree.foods = this.foods;
    this.behaviorTree.rateLimitContext = {
      poopsOnScreen: this.data.poopLocations.length,
      hungerLevel: this.needs.needs.hunger,
    };

    // 3. Evaluate behavior tree (returns a desired state or null)
    const desiredState = this.behaviorTree.evaluate(deltaMs);

    // 4. Update FSM (auto-transitions, sleep recovery, etc.)
    this.fsm.update(deltaMs);

    // 5. Act on the BT's decision (if the FSM is still in a "free" state)
    if (desiredState && (this.fsm.isIn('idle') || this.fsm.isIn('wander'))) {
      this.resolveBehaviorTransition(desiredState);
    }

    // 6. Move the pet if it is wandering or approaching
    this.updateMovement(deltaMs);

    // 7. Handle interaction animation overlay
    this.updateInteractionAnim(deltaMs);

    // 8. Check for need bubbles
    this.checkBubble();

    // 9. Check for longest-session memory (every 5 min to avoid spam)
    this.checkSessionMemory();
  }

  // ==================================================================
  // INTERACTION HANDLERS
  // ==================================================================

  /**
   * Pet the head (摸头).
   * Boosts happiness, triggers the interact-pet animation.
   */
  petHead(): void {
    this.needs.play(INTERACTION.petHappinessGain);
    this.recordInteraction();
    this.shiftTemperament(1.2, 0); // petting → clingier

    // Play the interact-pet animation as an overlay
    this.playInteractionAnim('interact-pet', 1500);

    // Transition FSM if we're idle or wander
    if (this.fsm.isIn('idle') || this.fsm.isIn('wander')) {
      this.fsm.transition('interact', 'pet-head');
    }

    this.gainExp(2);

    // Record "100th pet" memory milestone
    if (this.data.bonding.totalPets + 1 === 100) {
      this.recordMemory('milestone_100_pets', '第100次摸头！');
    }
    this.data.bonding.totalPets++;
  }

  /**
   * Poke (戳).
   * Triggers a surprised or angry reaction depending on personality.
   * Slightly reduces happiness.
   */
  poke(): void {
    this.needs.play(INTERACTION.pokeHappinessGain); // negative
    this.recordInteraction();
    this.shiftTemperament(0, -1.5); // poking → more timid

    // High-strength pets get angry, others are surprised
    const isAngry = this.attributes.strength > 60;
    this.playInteractionAnim('surprised', SURPRISED_ANIM_MS);

    // If idle or wander, enter interact state with a surprised animation
    if (this.fsm.isIn('idle') || this.fsm.isIn('wander')) {
      this.fsm.transition('interact', isAngry ? 'poke-angry' : 'poke-surprised');
    }

    this.gainExp(1);
  }

  /**
   * Feed (喂食).
   * Triggers a transition to the eat state.  The actual hunger
   * reduction happens when the eat state completes (via the food
   * item's hungerRestore value).
   */
  feed(): void {
    this.recordInteraction();

    // If there's a food item on screen, approach it
    const nearest = this.findNearestFood();
    if (nearest && (this.fsm.isIn('idle') || this.fsm.isIn('wander'))) {
      this.moveTo(nearest.x);
      this.fsm.transition('approach', 'feed-command');
      return;
    }

    // No food on screen — direct feed (owner gives food by hand)
    if (this.fsm.isIn('idle') || this.fsm.isIn('wander') || this.fsm.isIn('approach')) {
      this.applyFeedEffects();
      this.fsm.transition('eat', 'feed-direct');
    }
  }

  /**
   * Start dragging the pet (user picks it up).
   * Overrides any current state — drag is always allowed.
   */
  drag(): void {
    // If the pet was doing something contemplative, show surprised first
    if (this.fsm.isIn('daydream') || this.fsm.isIn('fish') || this.fsm.isIn('sleep')) {
      this.playInteractionAnim('surprised', SURPRISED_ANIM_MS);
    }

    this.needs.play(INTERACTION.dragHappinessGain); // slightly negative
    this.recordInteraction();
    this.shiftTemperament(0, -1.0); // being hauled around → more timid
    this.fsm.transition('drag', 'user-drag');
  }

  /**
   * Release the pet after dragging.
   */
  drop(): void {
    if (this.fsm.isIn('drag')) {
      this.fsm.transition('idle', 'user-drop');
      // Update the wander origin to the drop position
      this.wanderOriginX = this.x;
    }
  }

  /**
   * Clean a poop at the given index (owner interaction).
   * Removes the poop, applies hygiene drift, records memory,
   * and boosts happiness.
   */
  cleanPoop(index: number): void {
    if (index < 0 || index >= this.data.poopLocations.length) return;

    this.data.poopLocations.splice(index, 1);
    this.needs.play(INTERACTION.poopCleanHappinessGain);
    this.recordInteraction();
    this.shiftTemperament(0.3, 0); // being cared for → attachment

    // Apply hygiene drift (pet learns to be cleaner over time)
    this.attributes = this.attributeDrift.applyDrift('cleanPoop', this.attributes);

    // Record first-poop-cleaned memory
    this.recordMemory('first_poop_cleaned', '第一次帮主人清理便便');
  }

  // ==================================================================
  // FOOD MANAGEMENT
  // ==================================================================

  addFood(food: FoodItem): void {
    this.foods.push(food);
  }

  removeFood(id: string): void {
    const idx = this.foods.findIndex(f => f.id === id);
    if (idx !== -1) this.foods.splice(idx, 1);
  }

  findNearestFood(): FoodItem | null {
    if (this.foods.length === 0) return null;

    let nearest: FoodItem | null = null;
    let minDist = Infinity;

    for (const food of this.foods) {
      const dist = Math.abs(food.x - this.x);
      if (dist < minDist) {
        minDist = dist;
        nearest = food;
      }
    }

    return nearest;
  }

  // ==================================================================
  // MOVEMENT
  // ==================================================================

  moveTo(targetX: number): void {
    this.targetX = targetX;
  }

  updateMovement(deltaMs: number): void {
    const state = this.fsm.currentState;

    // Only move during wander and approach
    if (state !== 'wander' && state !== 'approach') return;

    const dx = this.targetX - this.x;
    const threshold = state === 'approach' ? APPROACH_REACH_PX : 5;

    if (Math.abs(dx) <= threshold) {
      // Arrived
      if (state === 'approach') {
        this.onApproachArrived();
      }
      return;
    }

    // Direction
    const dir = Math.sign(dx);
    this.facingRight = dir > 0;

    // Move
    const step = this.moveSpeed * (deltaMs / 1000);
    const move = Math.min(Math.abs(dx), step) * dir;
    this.x += move;
  }

  // ==================================================================
  // STATE QUERIES
  // ==================================================================

  /**
   * Return the animation name the renderer should play.
   * If an interaction animation (surprised) is active, it takes
   * priority over the FSM state animation.
   */
  getCurrentAnimation(): string {
    // Interaction overlay
    if (this.interactionAnim) {
      return this.interactionAnim;
    }

    // Special case: eat-fast when very hungry
    if (this.fsm.isIn('eat') && this.needs.needs.hunger > 80) {
      return 'eat-fast';
    }

    return this.fsm.getStateAnimation(this.fsm.currentState);
  }

  /**
   * Return a bubble to display, or null if no bubble is warranted.
   * Respects the bubble cooldown to avoid spam.
   */
  shouldShowBubble(): BubbleData | null {
    return this.currentBubble;
  }

  // ==================================================================
  // EXPERIENCE & LEVELLING
  // ==================================================================

  /**
   * Award experience points.  Returns whether the pet levelled
   * up or evolved as a result.
   */
  gainExp(amount: number): { leveledUp: boolean; evolved: boolean } {
    // Apply wisdom-based learning rate bonus
    const learningRate = 0.5 + this.attributes.wisdom / 100;
    const effectiveAmount = Math.round(amount * learningRate);

    this.data.exp += effectiveAmount;

    let leveledUp = false;
    let evolved = false;

    // Check for level-up (can chain multiple levels in one call)
    while (true) {
      const needed = getExpForLevel(this.data.level);
      if (this.data.exp < needed) break;

      this.data.exp -= needed;
      this.data.level++;
      leveledUp = true;

      // Check for evolution
      if (EVOLUTION_LEVELS.includes(this.data.level)) {
        this.data.evolutionStage++;
        evolved = true;
        this.pendingSaveEvents.push('evolution');

        // Record first-evolution memory
        this.recordMemory(
          'first_evolution',
          `第一次进化成${this.data.name}`,
        );
      }

      this.pendingSaveEvents.push('levelup');
    }

    // Record first-levelup memory
    if (leveledUp) {
      this.recordMemory('first_levelup', '第一次升级！');
      this.updateDerivedStats();
    }

    return { leveledUp, evolved };
  }

  // ==================================================================
  // MILESTONES
  // ==================================================================

  /**
   * Check all milestone definitions against current bonding data.
   * Returns an array of newly-achieved milestone IDs.
   */
  checkMilestones(): string[] {
    const newlyAchieved: string[] = [];
    const achieved = new Set(this.data.bonding.milestones);

    for (const ms of MILESTONES) {
      if (achieved.has(ms.id)) continue;

      let reached = false;

      switch (ms.id) {
        case 'first-interaction':
          reached = this.data.bonding.totalInteractions >= ms.threshold;
          break;
        case 'interact-10':
          reached = this.data.bonding.totalInteractions >= ms.threshold;
          break;
        case 'interact-100':
          reached = this.data.bonding.totalInteractions >= ms.threshold;
          break;
        case 'days-7':
          reached = this.data.bonding.daysTogether >= ms.threshold;
          break;
        case 'days-30':
          reached = this.data.bonding.daysTogether >= ms.threshold;
          break;
        case 'days-100':
          reached = this.data.bonding.daysTogether >= ms.threshold;
          break;
        case 'first-evolution':
          reached = this.data.evolutionStage > 1;
          break;
        case 'first-feed':
          reached = this.data.bonding.totalFeeds >= ms.threshold;
          break;
        case 'feed-50':
          reached = this.data.bonding.totalFeeds >= ms.threshold;
          break;
        default:
          break;
      }

      if (reached) {
        this.data.bonding.milestones.push(ms.id);
        newlyAchieved.push(ms.id);
      }
    }

    return newlyAchieved;
  }

  // ==================================================================
  // OFFLINE COMPENSATION
  // ==================================================================

  /**
   * Apply needs changes that occurred while the app was closed.
   * Uses a three-tier smoothing strategy: linear for short absences,
   * logarithmic decay for medium absences, and a fixed middle-state
   * reset for long absences (> 48 h).
   */
  applyOfflineDrift(elapsedSeconds: number): void {
    const result = this.needs.applyOfflineDrift(elapsedSeconds);

    // Set the long-absence flag so the renderer can show "好久不见"
    this.isLongAbsence = result.isLongAbsence;

    // Update days-together
    const elapsedDays = Math.floor(elapsedSeconds / 86400);
    if (elapsedDays > 0) {
      this.data.bonding.daysTogether += elapsedDays;
    }

    // Update total play time
    this.data.totalPlayTime += elapsedSeconds;
  }

  // ==================================================================
  // SERIALISATION
  // ==================================================================

  /**
   * Convert the runtime PetManager state back to a plain data
   * object suitable for JSON serialisation and persistence.
   */
  serialize(): PetEntityData {
    return {
      ...this.data,
      attributes: { ...this.attributes },
      needs: this.needs.snapshot(),
      bonding: {
        ...this.data.bonding,
        totalInteractions: this.totalInteractions,
        memories: [...this.data.bonding.memories],
      },
      lastActiveAt: Date.now(),
    };
  }

  // ==================================================================
  // INTERNAL — Behaviour transition resolver
  // ==================================================================

  /**
   * Given a desired state from the BehaviorTree, perform any
   * setup (picking a wander target, finding food) and then
   * request the FSM transition.
   */
  private resolveBehaviorTransition(desired: PetState): void {
    switch (desired) {
      case 'wander': {
        // Pick a random target within WANDER_RANGE_PX of the origin,
        // clamped to the visible canvas area so the pet stays on screen
        const offset = (Math.random() - 0.5) * 2 * WANDER_RANGE_PX;
        const raw = this.wanderOriginX + offset;
        const target = Math.max(16, Math.min(raw, CANVAS_SIZE - 16));
        this.moveTo(target);
        this.fsm.transition('wander', 'bt-wander');
        break;
      }

      case 'approach': {
        const food = this.findNearestFood();
        if (food) {
          this.moveTo(food.x);
          this.fsm.transition('approach', 'bt-hungry-approach');
        }
        // If no food, the BT's physiological check will show a bubble
        break;
      }

      case 'sleep':
        this.fsm.transition('sleep', 'bt-tired');
        break;

      case 'selfplay':
        this.fsm.transition('selfplay', 'bt-bored');
        break;

      case 'daydream':
        this.fsm.transition('daydream', 'bt-contemplating');
        break;

      case 'fish':
        this.fsm.transition('fish', 'bt-fishing');
        break;

      case 'poop':
        this.fsm.transition('poop', 'bt-dirty');
        break;

      case 'eat': {
        // Direct eat without approach (rare — BT usually goes through approach)
        this.applyFeedEffects();
        this.fsm.transition('eat', 'bt-eat');
        break;
      }

      case 'chat':
        this.fsm.transition('chat', 'bt-social');
        break;

      default:
        this.fsm.transition(desired, 'bt-decision');
        break;
    }
  }

  // ==================================================================
  // INTERNAL — Approach arrival
  // ==================================================================

  /**
   * Called when the pet reaches its food target during the
   * approach state.  Consumes the food and transitions to eat.
   */
  private onApproachArrived(): void {
    const food = this.findNearestFood();

    if (food) {
      // Apply food effects
      this.needs.feed(food.hungerRestore);
      this.needs.play(food.happinessBonus);
      this.data.bonding.totalFeeds++;

      // Remove consumed food
      this.removeFood(food.id);

      // Transition to eat
      this.fsm.transition('eat', 'reached-food');
      this.gainExp(5);
    } else {
      // Food disappeared while approaching
      this.fsm.transition('idle', 'food-gone');
    }
  }

  // ==================================================================
  // INTERNAL — Feed effects (for direct feed without a food item)
  // ==================================================================

  private applyFeedEffects(): void {
    // Default feed values when no specific food item is involved
    this.needs.feed(30);
    this.needs.play(INTERACTION.feedHappinessGain);
    this.data.bonding.totalFeeds++;
    this.shiftTemperament(0.6, 0); // feeding → builds attachment
    this.gainExp(3);
  }

  /**
   * Nudge the pet's temperament (affection / boldness), clamped to
   * [15, 95].  Driven by how the owner treats it over time.
   */
  private shiftTemperament(affDelta: number, boldDelta: number): void {
    const b = this.data.bonding;
    b.affection = Math.max(15, Math.min(95, (b.affection ?? 50) + affDelta));
    b.boldness = Math.max(15, Math.min(95, (b.boldness ?? 50) + boldDelta));
  }

  // ==================================================================
  // INTERNAL — Interaction animation overlay
  // ==================================================================

  private playInteractionAnim(animName: string, durationMs: number): void {
    this.interactionAnim = animName;
    this.interactionAnimTimer = durationMs;
  }

  private updateInteractionAnim(deltaMs: number): void {
    if (this.interactionAnim) {
      this.interactionAnimTimer -= deltaMs;
      if (this.interactionAnimTimer <= 0) {
        this.interactionAnim = null;
        this.interactionAnimTimer = 0;
      }
    }
  }

  // ==================================================================
  // INTERNAL — Bubble management
  // ==================================================================

  private checkBubble(): void {
    const now = performance.now();

    // Respect cooldown
    if (now - this.lastBubbleTime < BUBBLE_COOLDOWN) {
      // Keep showing current bubble if still within its duration
      if (this.currentBubble && now - this.lastBubbleTime < this.currentBubble.duration) {
        return;
      }
      this.currentBubble = null;
      return;
    }

    // Ask the needs system for a bubble
    const bubble = this.needs.getNeedBubble();
    if (bubble) {
      this.currentBubble = bubble;
      this.lastBubbleTime = now;
    } else {
      this.currentBubble = null;
    }
  }

  // ==================================================================
  // INTERNAL — FSM state-change handler
  // ==================================================================

  private onStateChange(event: StateTransitionEvent): void {
    const { from, to } = event;

    // Record save-worthy transitions
    if (['eat', 'poop', 'sleep'].includes(to)) {
      this.pendingSaveEvents.push(to);
    }

    // Record poop location when entering poop state
    if (to === 'poop') {
      const poopLoc: PoopLocation = {
        x: this.x,
        y: this.y,
        createdAt: Date.now(),
      };
      this.data.poopLocations.push(poopLoc);
    }

    // Reset idle timer when leaving idle
    if (from === 'idle') {
      this.behaviorTree.resetIdleTimer();
    }

    // Wander origin is anchored to init/drop position; do NOT
    // update on every wander to prevent cumulative drift.

    // When exiting drag, recentre the origin
    if (from === 'drag') {
      this.wanderOriginX = this.x;
    }

    // ---- Attribute drift: apply when certain states complete ----
    // Drift fires on EXIT of the behaviour state (the pet "learned" from it).
    if (to === 'idle' || to === 'wander') {
      switch (from) {
        case 'daydream':
          this.attributes = this.attributeDrift.applyDrift('daydream', this.attributes);
          break;
        case 'selfplay':
          this.attributes = this.attributeDrift.applyDrift('selfplay', this.attributes);
          break;
        case 'eat':
          this.attributes = this.attributeDrift.applyDrift('eat', this.attributes);
          break;
        default:
          break;
      }
    }

    // Wander-long drift: when a wander completes and lasted a while
    if (from === 'wander' && to === 'idle') {
      this.attributes = this.attributeDrift.applyDrift('wanderLong', this.attributes);
    }
  }

  // ==================================================================
  // INTERNAL — Interaction tracking
  // ==================================================================

  private recordInteraction(): void {
    this.lastInteractionTime = performance.now();
    this.totalInteractions++;
    this.data.bonding.totalInteractions = this.totalInteractions;
  }

  // ==================================================================
  // MEMORY RECORDING (PATCH 6 — Bonding Qualitative Memory Points)
  // ==================================================================

  /**
   * Create a BondingMemory and push it to bonding.memories.
   * Deduplicates: the same memory type is only recorded once
   * (except for 'custom' memories which are always allowed).
   * Caps the memory list at 50 entries (oldest dropped first).
   */
  recordMemory(
    type: BondingMemory['type'],
    description: string,
    snapshot?: string,
  ): void {
    // Deduplicate: skip if this type already exists (except 'custom')
    if (type !== 'custom') {
      const exists = this.data.bonding.memories.some(m => m.type === type);
      if (exists) return;
    }

    const memory: BondingMemory = {
      id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      description,
      timestamp: Date.now(),
      snapshot,
    };

    this.data.bonding.memories.push(memory);

    // Enforce 50-memory cap (drop oldest)
    while (this.data.bonding.memories.length > 50) {
      this.data.bonding.memories.shift();
    }
  }

  // ==================================================================
  // SESSION MEMORY CHECK
  // ==================================================================

  /** Track whether we've already recorded the longest-session memory. */
  private longestSessionRecorded: boolean = false;
  /** Last time we checked session length (to avoid per-frame checks). */
  private lastSessionCheck: number = 0;

  /**
   * Check if the current session has exceeded 4 hours and record the
   * "longest session" memory.  Runs every 5 minutes to avoid spam.
   */
  private checkSessionMemory(): void {
    const now = Date.now();
    if (now - this.lastSessionCheck < 5 * 60 * 1000) return;
    this.lastSessionCheck = now;

    const sessionHours = (now - this.sessionStartTime) / 3600000;
    if (sessionHours >= 4 && !this.longestSessionRecorded) {
      const hoursRounded = Math.floor(sessionHours);
      this.recordMemory(
        'longest_session',
        `最长的一次陪伴，整整${hoursRounded}小时`,
      );
      this.longestSessionRecorded = true;
    }
  }

  // ==================================================================
  // INTERNAL — Derived stats recalculation
  // ==================================================================

  /**
   * Recalculate combat/RPG stats from attributes and level.
   * Called after levelling up.
   */
  private updateDerivedStats(): void {
    const lvl = this.data.level;
    this.data.maxHp = 50 + lvl * 5 + Math.floor(this.attributes.strength * 0.5);
    this.data.hp = Math.min(this.data.hp, this.data.maxHp);
    this.data.stats = {
      atk: 5 + Math.floor(lvl * 1.5) + Math.floor(this.attributes.strength * 0.3),
      def: 3 + lvl + Math.floor(this.attributes.hygiene * 0.2),
      spd: 5 + Math.floor(lvl * 0.8) + Math.floor(this.attributes.agility * 0.4),
      critRate: 0.05 + this.attributes.wisdom * 0.002 + lvl * 0.001,
    };

    // Recalculate move speed (in case agility changed via evolution)
    this.moveSpeed = BASE_MOVE_SPEED * (0.5 + this.attributes.agility / 100);
  }
}
