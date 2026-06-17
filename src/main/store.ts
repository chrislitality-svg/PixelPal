// ============================================================
// PixelPal — SQLite persistence store with debounced saves
// ============================================================
// Uses better-sqlite3 for synchronous, embedded SQLite storage.
// Falls back gracefully when the native module is unavailable.
// ============================================================

import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

import type {
  PetEntity,
  PetNeeds,
  AppSettings,
  BondingData,
  MachineSeedInfo,
  WorldPoop,
  Wallet,
  BuyResult,
  CosmeticSlot,
  JobState,
  JobCollectResult,
  PetAttributes,
  AttrSnapshot,
} from '../shared/types';

import {
  SAVE_DEBOUNCE_MS,
  NEEDS_DECAY,
  SHOP_ITEMS,
  JOBS,
} from '../shared/constants';
import { hashStringToSeed, combineSeed } from '../shared/rng';

// ---- better-sqlite3 require (native CJS module) ----
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Database = require('better-sqlite3');

// ---- Types ----

interface DatabaseRow {
  [key: string]: unknown;
}

// ---- Default values ----

const DEFAULT_SETTINGS: AppSettings = {
  autoStart: true,        // 用户要求开机自启，默认开启
  powerSave: false,
  soundEnabled: true,
  soundVolume: 70,
  sfxInteraction: true,
  sfxReward: true,
  sfxAmbient: true,
  bubbleFrequency: 5,
  focusMode: false,
  roam: true,             // 默认允许全桌面漫游
  mischiefLevel: 'low',   // 恶作剧默认"低频"（会打断工作，保守）
  weatherEnabled: true,   // 默认每天播报天气
  jokeLevel: 'medium',    // 冷笑话默认"中频"（无害）
  machineSeed: 0,         // 0 = 尚未计算，首次访问时按本机生成
  incarnation: 0,
  lastWeatherDate: '',
  lastCoinDate: '',
};

// Maximum offline compensation window (24 hours)
const MAX_OFFLINE_SECONDS = 24 * 60 * 60;

// ---- Store class ----

export class Store {
  private db: InstanceType<typeof Database> | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private dbPath: string;
  private currentPetId: string | null = null;

  /**
   * Human-readable description of the last error encountered by a
   * critical method (petExists, loadPet, savePetImmediate).
   * Cleared at the start of each call.  IPC handlers can inspect
   * this to distinguish "no data" from "data unavailable".
   */
  lastError: string | null = null;

  /** Captured pet entity for guaranteed flush on close(). */
  private pendingPet: PetEntity | null = null;

  constructor() {
    const userDataPath = app.getPath('userData');
    this.dbPath = path.join(userDataPath, 'pixelpal.db');
  }

  // ---- Lifecycle ----

  /**
   * Open (or create) the SQLite database and ensure default settings exist.
   */
  initialize(): void {
    try {
      this.open();
      this.ensureDefaultSettings();
    } catch (err) {
      this.lastError = `Database initialization failed: ${err}`;
      console.error('[Store] Initialization failed:', err);
      throw err;
    }
  }

  /**
   * Flush any pending debounced save and close the database connection.
   */
  close(): void {
    this.flushPendingSave();
    if (this.db) {
      try {
        this.db.close();
      } catch (err) {
        console.warn('[Store] Error closing database:', err);
      }
      this.db = null;
    }
  }

  // ---- Public API: pets ----

  petExists(): boolean {
    this.lastError = null;
    if (!this.db) { this.lastError = 'Database not initialized'; return false; }
    try {
      const row = this.db
        .prepare('SELECT COUNT(*) as count FROM pets')
        .get() as DatabaseRow;
      return (row?.count as number) > 0;
    } catch (err) {
      this.lastError = `Database query failed: ${err}`;
      return false;
    }
  }

  /**
   * Load the active pet from the database.
   * On first call this also applies offline compensation so that needs
   * drift realistically while the app was closed.
   */
  loadPet(): PetEntity | null {
    this.lastError = null;
    if (!this.db) { this.lastError = 'Database not initialized'; return null; }

    try {
      const row = this.db
        .prepare('SELECT * FROM pets LIMIT 1')
        .get() as DatabaseRow | undefined;
      if (!row) return null;

      const pet = this.rowToPetEntity(row);

      // Track which pet is "active" for debounced saves
      this.currentPetId = pet.id;

      // Apply offline compensation (needs drift while app was closed)
      const compensated = this.applyOfflineCompensation(pet);

      // Persist the compensated state immediately
      this.savePetImmediate(compensated);

      return compensated;
    } catch (err) {
      this.lastError = `Failed to load pet: ${err}`;
      console.error('[Store] Failed to load pet:', err);
      return null;
    }
  }

  /**
   * Queue a pet save with debounce. Repeated calls within SAVE_DEBOUNCE_MS
   * collapse into a single write.
   */
  savePet(pet: PetEntity): void {
    this.currentPetId = pet.id;
    this.pendingPet = pet;
    this.scheduleDebouncedSave(pet);
  }

  /**
   * Write the pet to the database immediately, cancelling any pending
   * debounced save.
   */
  savePetImmediate(pet: PetEntity): void {
    if (!this.db) return;

    // Cancel any pending debounced save — we're writing now
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    this.currentPetId = pet.id;

    try {
      const needsJson = JSON.stringify(pet.needs);
      const attributesJson = JSON.stringify(pet.attributes);
      const bondingJson = JSON.stringify(pet.bonding);
      const inventoryJson = JSON.stringify(pet.inventory);
      const equipmentJson = JSON.stringify(pet.equipment);
      const poopJson = JSON.stringify(pet.poopLocations);
      const llmJson = pet.llmConfig ? JSON.stringify(pet.llmConfig) : null;
      const skillsJson = JSON.stringify(pet.skills);
      const statsJson = JSON.stringify(pet.stats);
      const now = Date.now();

      const existing = this.db
        .prepare('SELECT id FROM pets WHERE id = ?')
        .get(pet.id) as DatabaseRow | undefined;

      if (existing) {
        this.db
          .prepare(
            `UPDATE pets SET
              name = ?, type = ?, species = ?, breed = ?,
              level = ?, exp = ?, exp_to_next = ?,
              hp = ?, max_hp = ?, stats = ?, skills = ?, inventory = ?,
              equipment = ?, needs = ?, evolution_stage = ?, poop_locations = ?,
              llm_config = ?, bonding = ?, last_active_at = ?,
              total_play_time = ?, updated_at = ?
            WHERE id = ?`
          )
          .run(
            pet.name, pet.type, pet.species ?? null, pet.breed ?? null,
            pet.level, pet.exp, pet.expToNext,
            pet.hp, pet.maxHp, statsJson, skillsJson, inventoryJson,
            equipmentJson, needsJson, pet.evolutionStage, poopJson,
            llmJson, bondingJson, now,
            pet.totalPlayTime, now,
            pet.id
          );
      } else {
        this.db
          .prepare(
            `INSERT INTO pets (
              id, name, type, species, breed,
              level, exp, exp_to_next, hp, max_hp,
              stats, skills, inventory, equipment, needs, evolution_stage,
              poop_locations, llm_config, bonding, attributes,
              created_at, last_active_at, total_play_time, updated_at
            ) VALUES (
              ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
            )`
          )
          .run(
            pet.id, pet.name, pet.type, pet.species ?? null, pet.breed ?? null,
            pet.level, pet.exp, pet.expToNext,
            pet.hp, pet.maxHp, statsJson, skillsJson, inventoryJson,
            equipmentJson, needsJson, pet.evolutionStage, poopJson,
            llmJson, bondingJson, attributesJson,
            pet.createdAt, Date.now(), pet.totalPlayTime, Date.now()
          );
      }
    } catch (err) {
      console.error('[Store] Failed to save pet:', err);
    }
  }

  deletePet(petId: string): boolean {
    if (!this.db) return false;
    try {
      this.db.prepare('DELETE FROM pets WHERE id = ?').run(petId);
      if (this.currentPetId === petId) {
        this.currentPetId = null;
      }
      return true;
    } catch (err) {
      console.error('[Store] Failed to delete pet:', err);
      return false;
    }
  }

  // ---- Public API: settings ----

  getSettings(): AppSettings {
    if (!this.db) return { ...DEFAULT_SETTINGS };

    try {
      const rows = this.db
        .prepare('SELECT key, value FROM settings')
        .all() as DatabaseRow[];

      const settings: Record<string, unknown> = {};
      for (const row of rows) {
        settings[row.key as string] = JSON.parse(row.value as string);
      }

      return {
        autoStart: (settings.autoStart as boolean) ?? DEFAULT_SETTINGS.autoStart,
        powerSave: (settings.powerSave as boolean) ?? DEFAULT_SETTINGS.powerSave,
        soundEnabled: (settings.soundEnabled as boolean) ?? DEFAULT_SETTINGS.soundEnabled,
        soundVolume: (settings.soundVolume as number) ?? DEFAULT_SETTINGS.soundVolume,
        sfxInteraction: (settings.sfxInteraction as boolean) ?? DEFAULT_SETTINGS.sfxInteraction,
        sfxReward: (settings.sfxReward as boolean) ?? DEFAULT_SETTINGS.sfxReward,
        sfxAmbient: (settings.sfxAmbient as boolean) ?? DEFAULT_SETTINGS.sfxAmbient,
        bubbleFrequency: (settings.bubbleFrequency as number) ?? DEFAULT_SETTINGS.bubbleFrequency,
        focusMode: (settings.focusMode as boolean) ?? DEFAULT_SETTINGS.focusMode,
        roam: (settings.roam as boolean) ?? DEFAULT_SETTINGS.roam,
        mischiefLevel: (settings.mischiefLevel as AppSettings['mischiefLevel']) ?? DEFAULT_SETTINGS.mischiefLevel,
        weatherEnabled: (settings.weatherEnabled as boolean) ?? DEFAULT_SETTINGS.weatherEnabled,
        jokeLevel: (settings.jokeLevel as AppSettings['jokeLevel']) ?? DEFAULT_SETTINGS.jokeLevel,
        machineSeed: (settings.machineSeed as number) ?? DEFAULT_SETTINGS.machineSeed,
        incarnation: (settings.incarnation as number) ?? DEFAULT_SETTINGS.incarnation,
        lastWeatherDate: (settings.lastWeatherDate as string) ?? DEFAULT_SETTINGS.lastWeatherDate,
        lastCoinDate: (settings.lastCoinDate as string) ?? DEFAULT_SETTINGS.lastCoinDate,
        generatedAvatar: settings.generatedAvatar as string | undefined,
        generatedBg: settings.generatedBg as string | undefined,
      };
    } catch (err) {
      console.error('[Store] Failed to load settings:', err);
      return { ...DEFAULT_SETTINGS };
    }
  }

  setSettings(settings: Partial<AppSettings>): AppSettings {
    if (!this.db) return { ...DEFAULT_SETTINGS };

    const current = this.getSettings();
    const merged: AppSettings = { ...current, ...settings };

    try {
      const stmt = this.db.prepare(
        `INSERT OR REPLACE INTO settings (key, value, updated_at)
         VALUES (?, ?, ?)`
      );
      const now = Date.now();

      this.db.transaction(() => {
        for (const [key, value] of Object.entries(merged)) {
          stmt.run(key, JSON.stringify(value), now);
        }
      })();

      return merged;
    } catch (err) {
      console.error('[Store] Failed to save settings:', err);
      return merged;
    }
  }

  // ---- Public API: machine-bound seed (盲盒) ----

  /**
   * Return the machine-bound seed info used to deterministically
   * generate the pet during onboarding.  The seed is derived once
   * from this computer's fingerprint (hostname + MAC) and persisted,
   * so every blind box opened on this machine yields the same pet
   * identity — unless the pet is "killed", which bumps `incarnation`.
   */
  getMachineSeedInfo(): MachineSeedInfo {
    const settings = this.getSettings();
    let machineSeed = settings.machineSeed;

    if (!machineSeed) {
      machineSeed = this.computeMachineFingerprint();
      this.setSettings({ machineSeed });
    }

    const incarnation = settings.incarnation ?? 0;
    return {
      machineSeed,
      incarnation,
      effectiveSeed: combineSeed(machineSeed, incarnation),
    };
  }

  /**
   * "Kill" the current pet: delete it and advance the incarnation
   * counter so the next blind box deterministically produces a NEW
   * (but still machine-bound) creature.
   */
  killPet(petId: string): MachineSeedInfo {
    this.deletePet(petId);
    const settings = this.getSettings();
    const nextIncarnation = (settings.incarnation ?? 0) + 1;
    this.setSettings({ incarnation: nextIncarnation });
    // A new pet starts fresh: wipe poop, active job, wallet (coins +
    // cosmetics) and the attribute-history curve.  The breed 图鉴
    // collection is kept (it's lifetime meta-progression).
    this.setPoops([]);
    this.setWallet({ coins: 0, cosmetics: [], equipped: {}, totalEarned: 0, jobsDone: 0 });
    if (this.db) {
      try { this.db.prepare('DELETE FROM settings WHERE key = ?').run('job'); } catch { /* ignore */ }
      try { this.db.prepare('DELETE FROM settings WHERE key = ?').run('attrHistory'); } catch { /* ignore */ }
    }
    return this.getMachineSeedInfo();
  }

  /** FNV-1a fingerprint of stable machine identifiers → 32-bit seed. */
  private computeMachineFingerprint(): number {
    let parts = `${os.hostname()}|${os.platform()}|${os.arch()}`;
    try {
      const nets = os.networkInterfaces();
      for (const name of Object.keys(nets).sort()) {
        const addrs = nets[name];
        if (!addrs) continue;
        for (const ni of addrs) {
          if (!ni.internal && ni.mac && ni.mac !== '00:00:00:00:00:00') {
            parts += `|${ni.mac}`;
            break;
          }
        }
      }
    } catch {
      // networkInterfaces unavailable — hostname alone is still stable
    }
    return hashStringToSeed(parts);
  }

  // ---- Public API: desktop poop (world objects) ----

  /** Read all persisted desktop poop locations (absolute screen coords). */
  getPoops(): WorldPoop[] {
    if (!this.db) return [];
    try {
      const row = this.db
        .prepare('SELECT value FROM settings WHERE key = ?')
        .get('worldPoops') as DatabaseRow | undefined;
      if (!row) return [];
      return safeJsonParse<WorldPoop[]>(row.value as string, []);
    } catch {
      return [];
    }
  }

  /** Overwrite the persisted desktop poop list. */
  setPoops(poops: WorldPoop[]): void {
    if (!this.db) return;
    try {
      this.db
        .prepare(
          `INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)`,
        )
        .run('worldPoops', JSON.stringify(poops), Date.now());
    } catch (err) {
      console.error('[Store] Failed to save poops:', err);
    }
  }

  // ---- Public API: wallet (coins / cosmetics) ----
  //
  // The wallet is owned exclusively by the main process and stored
  // separately from the renderer-owned pet snapshot, so the pet's
  // periodic save can never clobber coins or purchased cosmetics.

  getWallet(): Wallet {
    const fallback: Wallet = { coins: 0, cosmetics: [], equipped: {}, totalEarned: 0, jobsDone: 0 };
    if (!this.db) return fallback;
    try {
      const row = this.db
        .prepare('SELECT value FROM settings WHERE key = ?')
        .get('wallet') as DatabaseRow | undefined;
      if (!row) return fallback;
      const w = safeJsonParse<Wallet>(row.value as string, fallback);
      return {
        coins: Math.max(0, Math.floor(w.coins ?? 0)),
        cosmetics: Array.isArray(w.cosmetics) ? w.cosmetics : [],
        equipped: w.equipped ?? {},
        totalEarned: Math.max(0, Math.floor(w.totalEarned ?? 0)),
        jobsDone: Math.max(0, Math.floor(w.jobsDone ?? 0)),
      };
    } catch {
      return fallback;
    }
  }

  setWallet(wallet: Wallet): void {
    if (!this.db) return;
    try {
      this.db
        .prepare(`INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)`)
        .run('wallet', JSON.stringify(wallet), Date.now());
    } catch (err) {
      console.error('[Store] Failed to save wallet:', err);
    }
  }

  /** Add (or remove, if negative) coins. Returns the updated wallet. */
  earnCoins(amount: number): Wallet {
    return this.atomicWalletOp((wallet) => {
      const delta = Math.floor(amount);
      wallet.coins = Math.max(0, wallet.coins + delta);
      if (delta > 0) wallet.totalEarned = (wallet.totalEarned ?? 0) + delta;
    });
  }

  /**
   * Execute a wallet mutation inside a synchronous transaction so that
   * concurrent read-modify-write sequences don't clobber each other.
   */
  private atomicWalletOp(mutate: (wallet: Wallet) => void): Wallet {
    if (!this.db) return this.getWalletFallback();
    const db = this.db;
    let wallet: Wallet;
    db.transaction(() => {
      wallet = this.getWallet();
      mutate(wallet);
      this.setWalletUnsafe(wallet);
    })();
    return wallet!;
  }

  private setWalletUnsafe(wallet: Wallet): void {
    this.db!.prepare(
      `INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)`
    ).run('wallet', JSON.stringify(wallet), Date.now());
  }

  private getWalletFallback(): Wallet {
    return { coins: 0, cosmetics: [], equipped: {}, totalEarned: 0, jobsDone: 0 };
  }

  /**
   * Attempt to buy a shop item.  Validates coins, deducts the price,
   * and for cosmetics records ownership + equips it.  Consumable
   * effects are applied to the LIVE pet by the renderer (the caller
   * forwards an on:use-item event) — the store only handles coins
   * and cosmetic ownership.
   */
  buyItem(itemId: string): BuyResult {
    if (!this.db) return { ok: false, wallet: this.getWalletFallback(), error: 'unknown' };
    const item = SHOP_ITEMS.find((i) => i.id === itemId);
    if (!item) return { ok: false, wallet: this.getWallet(), error: 'unknown' };

    let result: BuyResult;
    this.db.transaction(() => {
      const wallet = this.getWallet();
      if (wallet.coins < item.price) {
        result = { ok: false, wallet, error: 'coins' };
        return;
      }
      wallet.coins -= item.price;
      if (item.category === 'cosmetic' && item.slot) {
        if (!wallet.cosmetics.includes(item.id)) wallet.cosmetics.push(item.id);
        wallet.equipped[item.slot] = item.id;
      }
      this.setWalletUnsafe(wallet);
      result = { ok: true, wallet, itemId };
    })();
    return result!;
  }

  // ---- Public API: attribute history (成长报告) ----

  getAttrHistory(): AttrSnapshot[] {
    if (!this.db) return [];
    try {
      const row = this.db
        .prepare('SELECT value FROM settings WHERE key = ?')
        .get('attrHistory') as DatabaseRow | undefined;
      if (!row) return [];
      const arr = safeJsonParse<AttrSnapshot[]>(row.value as string, []);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  /** Append an attribute snapshot, throttled to ~1/hour, capped at 90. */
  recordAttrSnapshot(attrs: PetAttributes): void {
    if (!this.db) return;
    const hist = this.getAttrHistory();
    const now = Date.now();
    const last = hist[hist.length - 1];
    if (last && now - last.t < 60 * 60 * 1000) return; // ≤1/hour
    hist.push({ t: now, a: { ...attrs } });
    while (hist.length > 90) hist.shift();
    try {
      this.db
        .prepare(`INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)`)
        .run('attrHistory', JSON.stringify(hist), now);
    } catch { /* ignore */ }
  }

  // ---- Public API: breed collection (图鉴) ----

  /** Breed ids the player has discovered across all incarnations. */
  getCollection(): string[] {
    if (!this.db) return [];
    try {
      const row = this.db
        .prepare('SELECT value FROM settings WHERE key = ?')
        .get('collection') as DatabaseRow | undefined;
      if (!row) return [];
      const arr = safeJsonParse<string[]>(row.value as string, []);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  /** Record a newly-discovered breed. Returns true if it was new. */
  addToCollection(breedId: string): boolean {
    if (!this.db || !breedId) return false;
    const all = this.getCollection();
    if (all.includes(breedId)) return false;
    all.push(breedId);
    try {
      this.db
        .prepare(`INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)`)
        .run('collection', JSON.stringify(all), Date.now());
      return true;
    } catch {
      return false;
    }
  }

  // ---- Public API: jobs (打工) ----

  /** Current job state + the main-process clock (for countdown sync). */
  getJobState(): JobState {
    let current: JobState['current'] = null;
    if (this.db) {
      try {
        const row = this.db
          .prepare('SELECT value FROM settings WHERE key = ?')
          .get('job') as DatabaseRow | undefined;
        if (row) current = safeJsonParse<JobState['current']>(row.value as string, null);
      } catch {
        current = null;
      }
    }
    return { current, now: Date.now() };
  }

  /** Dispatch the pet to a job. No-op if already working. */
  startJob(jobId: string): JobState {
    const job = JOBS.find((j) => j.id === jobId);
    if (!job || !this.db) return this.getJobState();

    const existing = this.getJobState().current;
    if (existing && Date.now() < existing.endsAt) {
      return this.getJobState(); // already working
    }

    const now = Date.now();
    const next = { id: job.id, startedAt: now, endsAt: now + job.durationSec * 1000 };
    try {
      this.db
        .prepare(`INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)`)
        .run('job', JSON.stringify(next), now);
    } catch (err) {
      console.error('[Store] Failed to start job:', err);
    }
    return this.getJobState();
  }

  /** Collect a finished job's reward. */
  collectJob(): JobCollectResult {
    const state = this.getJobState();
    if (!state.current) return { ok: false, error: 'none' };
    if (Date.now() < state.current.endsAt) {
      return { ok: false, error: 'working' };
    }

    const job = JOBS.find((j) => j.id === state.current!.id);
    if (!job) return { ok: false, error: 'none' };

    // Random payout event: 暴击 ×2 (15%) / 幸运 ×1.5 (15%) / 普通.
    const roll = Math.random();
    let mult = 1;
    let event: string | undefined;
    if (roll < 0.15) { mult = 2; event = '💥 暴击'; }
    else if (roll < 0.30) { mult = 1.5; event = '🍀 幸运'; }
    const reward = Math.round(job.reward * mult);

    // Clear the active job and update wallet atomically.
    let wallet: Wallet;
    if (this.db) {
      this.db.transaction(() => {
        try { this.db!.prepare('DELETE FROM settings WHERE key = ?').run('job'); } catch {}
        wallet = this.getWallet();
        const delta = Math.floor(reward);
        wallet.coins = Math.max(0, wallet.coins + delta);
        wallet.totalEarned = (wallet.totalEarned ?? 0) + delta;
        wallet.jobsDone = (wallet.jobsDone ?? 0) + 1;
        this.setWalletUnsafe(wallet);
      })();
      return { ok: true, reward, baseReward: job.reward, jobName: job.name, wallet: wallet!, event };
    }
    return { ok: false, error: 'none' };
  }

  /** Equip / unequip an already-owned cosmetic. Returns updated wallet. */
  toggleCosmetic(itemId: string): Wallet {
    const wallet = this.getWallet();
    const item = SHOP_ITEMS.find((i) => i.id === itemId);
    if (!item || item.category !== 'cosmetic' || !item.slot) return wallet;
    const slot = item.slot as CosmeticSlot;
    if (wallet.equipped[slot] === item.id) {
      delete wallet.equipped[slot];           // unequip
    } else if (wallet.cosmetics.includes(item.id)) {
      wallet.equipped[slot] = item.id;        // equip owned
    }
    this.setWallet(wallet);
    return wallet;
  }

  // ---- Internal helpers ----

  private open(): void {
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.createTables();
  }

  private createTables(): void {
    if (!this.db) return;

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS pets (
        id              TEXT PRIMARY KEY,
        name            TEXT NOT NULL,
        type            TEXT NOT NULL,
        species         TEXT DEFAULT NULL,
        breed           TEXT DEFAULT NULL,
        level           INTEGER DEFAULT 1,
        exp             INTEGER DEFAULT 0,
        exp_to_next     INTEGER DEFAULT 100,
        hp              INTEGER DEFAULT 100,
        max_hp          INTEGER DEFAULT 100,
        stats           TEXT,
        skills          TEXT,
        inventory       TEXT,
        equipment       TEXT,
        needs           TEXT,
        attributes      TEXT,
        evolution_stage INTEGER DEFAULT 1,
        poop_locations  TEXT,
        llm_config      TEXT,
        bonding         TEXT,
        created_at      INTEGER,
        last_active_at  INTEGER,
        total_play_time INTEGER DEFAULT 0,
        updated_at      INTEGER
      );

      CREATE TABLE IF NOT EXISTS settings (
        key        TEXT PRIMARY KEY,
        value      TEXT,
        updated_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS bonding (
        pet_id           TEXT PRIMARY KEY,
        first_met_at     INTEGER,
        total_pets       INTEGER DEFAULT 0,
        total_feeds      INTEGER DEFAULT 0,
        days_together    INTEGER DEFAULT 0,
        total_interactions INTEGER DEFAULT 0,
        milestones       TEXT,
        FOREIGN KEY (pet_id) REFERENCES pets(id) ON DELETE CASCADE
      );
    `);

    // Migration: add species and breed columns to existing databases
    try {
      this.db.exec(`ALTER TABLE pets ADD COLUMN species TEXT DEFAULT NULL`);
    } catch {
      // Column already exists — ignore
    }
    try {
      this.db.exec(`ALTER TABLE pets ADD COLUMN breed TEXT DEFAULT NULL`);
    } catch {
      // Column already exists — ignore
    }
  }

  private ensureDefaultSettings(): void {
    if (!this.db) return;

    try {
      const row = this.db
        .prepare('SELECT COUNT(*) as count FROM settings')
        .get() as DatabaseRow;

      if ((row.count as number) === 0) {
        this.setSettings(DEFAULT_SETTINGS);
      }
    } catch (err) {
      console.error('[Store] Failed to initialize default settings:', err);
    }
  }

  /**
   * Convert a raw SQLite row into a fully-typed PetEntity.
   * Applies backward compatibility defaults for older pets
   * that lack species/breed fields.
   */
  private rowToPetEntity(row: DatabaseRow): PetEntity {
    const type = row.type as string;

    return {
      id: row.id as string,
      name: row.name as string,
      type: type as PetEntity['type'],
      // Backward compat: old pets have no species/breed — default to type
      species: ((row.species as string) || type || 'cat') as PetEntity['species'],
      breed: (row.breed as string) || '',
      attributes: safeJsonParse(row.attributes as string, {
        strength: 50, agility: 50, appetite: 50,
        playful: 50, hygiene: 50, wisdom: 50,
      }),
      level: (row.level as number) ?? 1,
      exp: (row.exp as number) ?? 0,
      expToNext: (row.exp_to_next as number) ?? 100,
      hp: (row.hp as number) ?? 100,
      maxHp: (row.max_hp as number) ?? 100,
      stats: safeJsonParse(row.stats as string, {
        atk: 10, def: 10, spd: 10, critRate: 5,
      }),
      skills: safeJsonParse(row.skills as string, []),
      inventory: safeJsonParse(row.inventory as string, []),
      equipment: safeJsonParse(row.equipment as string, {}),
      needs: safeJsonParse(row.needs as string, {
        hunger: 50, energy: 80, happiness: 70, cleanliness: 90,
      }),
      evolutionStage: (row.evolution_stage as number) ?? 1,
      poopLocations: safeJsonParse(row.poop_locations as string, []),
      llmConfig: row.llm_config
        ? safeJsonParse(row.llm_config as string, undefined)
        : undefined,
      bonding: safeJsonParse(row.bonding as string, {
        firstMetAt: Date.now(),
        totalPets: 0,
        totalFeeds: 0,
        daysTogether: 0,
        totalInteractions: 0,
        milestones: [],
        memories: [],
      } as BondingData),
      createdAt: (row.created_at as number) ?? Date.now(),
      lastActiveAt: (row.last_active_at as number) ?? Date.now(),
      totalPlayTime: (row.total_play_time as number) ?? 0,
    };
  }

  /**
   * Apply realistic needs drift for the time the app was not running.
   *
   * The rates are scaled from the per-second constants in NEEDS_DECAY
   * (those are designed for real-time simulation).  For offline
   * compensation we use a gentler multiplier so the pet does not
   * catastrophically decay during a normal night's sleep.
   */
  private applyOfflineCompensation(pet: PetEntity): PetEntity {
    const now = Date.now();
    const elapsedMs = Math.max(0, now - pet.lastActiveAt);
    const elapsedSec = Math.min(elapsedMs / 1000, MAX_OFFLINE_SECONDS);

    if (elapsedSec < 60) {
      // Less than a minute — no meaningful drift
      return { ...pet, lastActiveAt: now };
    }

    const needs: PetNeeds = { ...pet.needs };

    // Use a 10x slower rate than real-time for offline drift
    const offlineScale = 0.1;

    needs.hunger = clamp(
      needs.hunger + NEEDS_DECAY.hungerBase * elapsedSec * offlineScale,
      0, 100
    );
    needs.energy = clamp(
      needs.energy - NEEDS_DECAY.energyDrainBase * elapsedSec * offlineScale,
      0, 100
    );
    needs.happiness = clamp(
      needs.happiness - NEEDS_DECAY.happinessDecayBase * elapsedSec * offlineScale,
      0, 100
    );
    needs.cleanliness = clamp(
      needs.cleanliness - NEEDS_DECAY.cleanlinessDecayBase * elapsedSec * offlineScale,
      0, 100
    );

    // Update bonding days-together
    const bonding: BondingData = { ...pet.bonding };
    if (bonding.firstMetAt > 0) {
      bonding.daysTogether = Math.floor(
        (now - bonding.firstMetAt) / (1000 * 60 * 60 * 24)
      );
    }

    return {
      ...pet,
      needs,
      bonding,
      lastActiveAt: now,
    };
  }

  /**
   * Schedule a debounced save. Resets the timer on every call.
   */
  private scheduleDebouncedSave(pet: PetEntity): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.savePetImmediate(pet);
    }, SAVE_DEBOUNCE_MS);
  }

  /**
   * If a debounced save is pending, execute it right now.
   */
  private flushPendingSave(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.pendingPet) {
      this.savePetImmediate(this.pendingPet);
      this.pendingPet = null;
    }
  }
}

// ---- Utility ----

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
  if (raw == null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
