// ============================================================
// PixelPal — Global type declarations for the renderer process
// ============================================================
// This file declares the window.pixelpal API that is exposed by
// the preload script via contextBridge.  All renderer files
// share this single declaration.
// ============================================================

import type {
  PetEntity,
  PetNeeds,
  PetState,
  AppSettings,
  TimeContext,
  MachineSeedInfo,
  WorldPoop,
  PushBubblePayload,
  Wallet,
  BuyResult,
  ShopItemEffect,
  JobState,
  JobCollectResult,
  AttrSnapshot,
} from '../shared/types';

interface UseItemPayload {
  effect: ShopItemEffect;
  name: string;
  icon: string;
  category: string;
}

interface WorldPoopsPayload {
  poops: WorldPoop[];
  origin: { x: number; y: number };
  size: { w: number; h: number };
}

interface GenerateImageResult {
  ok: boolean;
  dataUrl?: string;
  filePath?: string;
  error?: string;
}

export interface PixelPalAPI {
  // ---- Pet CRUD ----
  petExists(): Promise<boolean>;
  loadPet(): Promise<PetEntity>;
  savePet(pet: PetEntity): Promise<void>;
  deletePet(petId: string): Promise<boolean>;
  storeHealth(): Promise<{ ok: boolean; error?: string }>;

  // ---- Needs & state ----
  updateNeeds(needs: Partial<PetNeeds>): Promise<void>;
  stateChanged(state: PetState): Promise<void>;

  // ---- Settings ----
  getSettings(): Promise<AppSettings>;
  setSettings(settings: Partial<AppSettings>): Promise<AppSettings>;
  openSettings(): Promise<void>;
  openStatus(): Promise<void>;

  // ---- Screen & time ----
  getScreenInfo(): Promise<{
    workArea: { x: number; y: number; width: number; height: number };
    scaleFactor: number;
    displaySize: { width: number; height: number };
    windowX: number;
    windowY: number;
  }>;
  getTimeContext(): Promise<TimeContext>;

  // ---- Window control ----
  movePet(position: { x: number; y: number }): Promise<void>;
  setFocusMode(enabled: boolean): Promise<void>;

  // ---- Machine seed / blind box / release ----
  getMachineSeed(): Promise<MachineSeedInfo>;
  killPet(petId: string): Promise<MachineSeedInfo>;
  releaseAndQuit(petId: string): Promise<void>;

  // ---- Mischief ----
  mischiefOpenFolder(manual?: boolean): Promise<{ opened: boolean; name?: string }>;

  // ---- Desktop poop world ----
  worldAddPoop(pos: { x: number; y: number }): Promise<WorldPoop[]>;
  worldRemovePoop(id: string): Promise<WorldPoop[]>;
  worldClearPoops(): Promise<WorldPoop[]>;
  worldGetPoops(): Promise<WorldPoop[]>;
  worldSetInteractive(interactive: boolean): void;
  onWorldPoops(callback: (payload: WorldPoopsPayload) => void): () => void;

  // ---- grsai image generation ----
  generateImage(
    prompt: string,
    opts?: { aspectRatio?: string; model?: string },
  ): Promise<GenerateImageResult>;

  // ---- Wallet / shop ----
  getWallet(): Promise<Wallet>;
  earnCoins(amount: number): Promise<Wallet>;
  buyShopItem(itemId: string): Promise<BuyResult>;
  openShop(): Promise<void>;

  // ---- Achievements / collection ----
  openGallery(): Promise<void>;
  getCollection(): Promise<string[]>;

  // ---- Growth report ----
  openReport(): Promise<void>;
  getAttrHistory(): Promise<AttrSnapshot[]>;

  // ---- Jobs (打工) ----
  openWork(): Promise<void>;
  getJob(): Promise<JobState>;
  startJob(jobId: string): Promise<JobState>;
  collectJob(): Promise<JobCollectResult>;

  // ---- Visitor ----
  openVisitor(): Promise<void>;
  openParty(): Promise<void>;
  moveSelf(pos: { x: number; y: number }): void;

  // ---- Settings → pet actions ----
  triggerPetAction(action: string): Promise<void>;
  onWalletChanged(callback: (wallet: Wallet) => void): () => void;
  onUseItem(callback: (payload: UseItemPayload) => void): () => void;
  onPetAction(callback: (action: string) => void): () => void;
  onWorkState(callback: (working: boolean) => void): () => void;

  // ---- Mouse passthrough (fire-and-forget) ----
  mouseEnter(): void;
  mouseLeave(): void;

  // ---- Onboarding interactive mode (fire-and-forget) ----
  onboardingStart(): void;
  onboardingEnd(): void;

  // ---- Main → Renderer event listeners ----
  onPetLoaded(callback: (pet: PetEntity) => void): () => void;
  onSettingsChanged(callback: (settings: AppSettings) => void): () => void;
  onFocusMode(callback: (enabled: boolean) => void): () => void;
  onShutdown(callback: (msg: string) => void): () => void;
  onPushBubble(callback: (payload: PushBubblePayload) => void): () => void;
  onKilled(callback: () => void): () => void;
}

declare global {
  interface Window {
    pixelpal: PixelPalAPI;
  }
}
