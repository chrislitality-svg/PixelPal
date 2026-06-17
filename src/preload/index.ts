// ============================================================
// PixelPal — Preload script (context bridge)
// ============================================================
// Exposes a type-safe `window.pixelpal` API to the renderer
// process.  All communication goes through IPC — the renderer
// never touches Node or Electron directly.
// ============================================================

const { contextBridge, ipcRenderer } = require('electron');

// IPC channel constants — inlined here because Electron's sandboxed
// preload context cannot resolve relative require() paths inside asar.
const IPC_CHANNELS = {
  PET_STATE_CHANGED: 'pet:state-changed',
  PET_NEEDS_UPDATE: 'pet:needs-update',
  PET_SAVE: 'pet:save',
  PET_LOAD: 'pet:load',
  PET_EXISTS: 'pet:exists',
  PET_DELETE: 'pet:delete',
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  OPEN_SETTINGS: 'settings:open',
  OPEN_STATUS: 'status:open',
  GET_SCREEN_INFO: 'screen:info',
  GET_TIME_CONTEXT: 'context:time',
  MOVE_PET: 'pet:move',
  FOCUS_MODE: 'pet:focus-mode',
  GET_MACHINE_SEED: 'seed:get',
  KILL_PET: 'pet:kill',
  RELEASE_AND_QUIT: 'pet:release-quit',
  MISCHIEF_OPEN_FOLDER: 'mischief:open-folder',
  WORLD_ADD_POOP: 'world:add-poop',
  WORLD_REMOVE_POOP: 'world:remove-poop',
  WORLD_CLEAR_POOPS: 'world:clear-poops',
  WORLD_GET_POOPS: 'world:get-poops',
  IMAGE_GENERATE: 'image:generate',
  OPEN_SHOP: 'shop:open',
  WALLET_GET: 'wallet:get',
  WALLET_EARN: 'wallet:earn',
  SHOP_BUY: 'shop:buy',
  OPEN_GALLERY: 'gallery:open',
  GET_COLLECTION: 'collection:get',
  OPEN_REPORT: 'report:open',
  GET_ATTR_HISTORY: 'report:attr-history',
  OPEN_WORK: 'work:open',
  JOB_GET: 'job:get',
  JOB_START: 'job:start',
  JOB_COLLECT: 'job:collect',
  OPEN_VISITOR: 'visitor:open',
  OPEN_PARTY: 'visitor:party',
  MOVE_SELF: 'window:move-self',
  PET_ACTION: 'pet:action',
  ON_PET_LOADED: 'on:pet-loaded',
  ON_SETTINGS_CHANGED: 'on:settings-changed',
  ON_FOCUS_MODE: 'on:focus-mode',
  ON_SHUTDOWN: 'on:shutdown',
  ON_PUSH_BUBBLE: 'on:push-bubble',
  ON_KILLED: 'on:killed',
  ON_WALLET_CHANGED: 'on:wallet-changed',
  ON_USE_ITEM: 'on:use-item',
  ON_PET_ACTION: 'on:pet-action',
  ON_WORK_STATE: 'on:work-state',
  ON_WORLD_POOPS: 'on:world-poops',
};

/**
 * The API object exposed on `window.pixelpal`.
 *
 * Every method returns a Promise because ipcRenderer.invoke is async.
 * The `on*` methods register listeners for events pushed from the main
 * process and return an unsubscribe function.
 */
const pixelpalApi = {
  // ---- Pet CRUD ----

  /** Check whether a pet already exists in the database. */
  petExists: (): Promise<boolean> =>
    ipcRenderer.invoke(IPC_CHANNELS.PET_EXISTS),

  /** Load the active pet (with offline compensation applied). */
  loadPet: (): Promise<any> =>
    ipcRenderer.invoke(IPC_CHANNELS.PET_LOAD),

  /** Save (or update) the pet entity. Debounced on the main side. */
  savePet: (pet: any): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.PET_SAVE, pet),

  /** Delete a pet by ID. */
  deletePet: (petId: string): Promise<boolean> =>
    ipcRenderer.invoke(IPC_CHANNELS.PET_DELETE, petId),

  // ---- Needs & state ----

  /** Send a lightweight needs-only update (called every tick). */
  updateNeeds: (needs: any): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.PET_NEEDS_UPDATE, needs),

  /** Notify the main process of an FSM state transition. */
  stateChanged: (state: string): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.PET_STATE_CHANGED, state),

  // ---- Settings ----

  getSettings: (): Promise<any> =>
    ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET),

  setSettings: (settings: any): Promise<any> =>
    ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET, settings),

  openSettings: (): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.OPEN_SETTINGS),

  openStatus: (): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.OPEN_STATUS),

  // ---- Screen & time ----

  getScreenInfo: (): Promise<{
    workArea: { x: number; y: number; width: number; height: number };
    scaleFactor: number;
    displaySize: { width: number; height: number };
  }> => ipcRenderer.invoke(IPC_CHANNELS.GET_SCREEN_INFO),

  getTimeContext: (): Promise<{
    hour: number;
    minute: number;
    dayOfWeek: number;
    isNight: boolean;
    isLateNight: boolean;
    isMorning: boolean;
    isFridayAfternoon: boolean;
    idleMinutes: number;
  }> => ipcRenderer.invoke(IPC_CHANNELS.GET_TIME_CONTEXT),

  // ---- Window control ----

  /** Move the pet window to an absolute screen position. */
  movePet: (position: { x: number; y: number }): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.MOVE_PET, position),

  /** Toggle focus mode (dim + fully click-through). */
  setFocusMode: (enabled: boolean): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.FOCUS_MODE, enabled),

  // ---- Machine-bound seed / blind box / kill ----

  /** Get the machine-bound seed info used to generate this machine's pet. */
  getMachineSeed: (): Promise<any> =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_MACHINE_SEED),

  /** Kill the current pet (delete + advance incarnation). Returns new seed info. */
  killPet: (petId: string): Promise<any> =>
    ipcRenderer.invoke(IPC_CHANNELS.KILL_PET, petId),

  /** Release the pet and quit the app (user picks a new one next launch). */
  releaseAndQuit: (petId: string): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.RELEASE_AND_QUIT, petId),

  // ---- Mischief ----

  /** Ask the pet to playfully open one of the user's folders. */
  mischiefOpenFolder: (manual?: boolean): Promise<{ opened: boolean; name?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.MISCHIEF_OPEN_FOLDER, manual),

  // ---- Desktop poop world ----

  worldAddPoop: (pos: { x: number; y: number }): Promise<any> =>
    ipcRenderer.invoke(IPC_CHANNELS.WORLD_ADD_POOP, pos),
  worldRemovePoop: (id: string): Promise<any> =>
    ipcRenderer.invoke(IPC_CHANNELS.WORLD_REMOVE_POOP, id),
  worldClearPoops: (): Promise<any> =>
    ipcRenderer.invoke(IPC_CHANNELS.WORLD_CLEAR_POOPS),
  worldGetPoops: (): Promise<any> =>
    ipcRenderer.invoke(IPC_CHANNELS.WORLD_GET_POOPS),
  /** (World overlay only) toggle whether the overlay captures the mouse. */
  worldSetInteractive: (interactive: boolean): void => {
    ipcRenderer.send('world:set-interactive', interactive);
  },
  /** (World overlay only) subscribe to the full poop list. */
  onWorldPoops: (callback: (payload: any) => void): (() => void) => {
    const handler = (_e: any, payload: any) => callback(payload);
    ipcRenderer.on(IPC_CHANNELS.ON_WORLD_POOPS, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.ON_WORLD_POOPS, handler);
  },

  // ---- grsai image generation ----

  /** Generate a cute image via grsai. Returns { ok, dataUrl, filePath, error }. */
  generateImage: (prompt: string, opts?: { aspectRatio?: string; model?: string }): Promise<any> =>
    ipcRenderer.invoke(IPC_CHANNELS.IMAGE_GENERATE, prompt, opts),

  // ---- Wallet / shop ----

  getWallet: (): Promise<any> =>
    ipcRenderer.invoke(IPC_CHANNELS.WALLET_GET),
  earnCoins: (amount: number): Promise<any> =>
    ipcRenderer.invoke(IPC_CHANNELS.WALLET_EARN, amount),
  buyShopItem: (itemId: string): Promise<any> =>
    ipcRenderer.invoke(IPC_CHANNELS.SHOP_BUY, itemId),
  openShop: (): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.OPEN_SHOP),

  // ---- Achievements / collection ----
  openGallery: (): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.OPEN_GALLERY),
  getCollection: (): Promise<string[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_COLLECTION),

  // ---- Growth report ----
  openReport: (): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.OPEN_REPORT),
  getAttrHistory: (): Promise<any> =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_ATTR_HISTORY),

  // ---- Jobs (打工) ----
  openWork: (): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.OPEN_WORK),
  getJob: (): Promise<any> =>
    ipcRenderer.invoke(IPC_CHANNELS.JOB_GET),
  startJob: (jobId: string): Promise<any> =>
    ipcRenderer.invoke(IPC_CHANNELS.JOB_START, jobId),
  collectJob: (): Promise<any> =>
    ipcRenderer.invoke(IPC_CHANNELS.JOB_COLLECT),

  // ---- Visitor ----
  openVisitor: (): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.OPEN_VISITOR),
  openParty: (): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.OPEN_PARTY),
  /** (Visitor window) move its own window — used while walking in/out. */
  moveSelf: (pos: { x: number; y: number }): void => {
    ipcRenderer.send(IPC_CHANNELS.MOVE_SELF, pos);
  },

  // ---- Settings → pet actions (screenshot / record) ----

  triggerPetAction: (action: string): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.PET_ACTION, action),

  onWalletChanged: (callback: (wallet: any) => void): (() => void) => {
    const handler = (_e: any, wallet: any) => callback(wallet);
    ipcRenderer.on(IPC_CHANNELS.ON_WALLET_CHANGED, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.ON_WALLET_CHANGED, handler);
  },
  onUseItem: (callback: (payload: any) => void): (() => void) => {
    const handler = (_e: any, payload: any) => callback(payload);
    ipcRenderer.on(IPC_CHANNELS.ON_USE_ITEM, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.ON_USE_ITEM, handler);
  },
  onPetAction: (callback: (action: string) => void): (() => void) => {
    const handler = (_e: any, action: string) => callback(action);
    ipcRenderer.on(IPC_CHANNELS.ON_PET_ACTION, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.ON_PET_ACTION, handler);
  },
  onWorkState: (callback: (working: boolean) => void): (() => void) => {
    const handler = (_e: any, working: boolean) => callback(working);
    ipcRenderer.on(IPC_CHANNELS.ON_WORK_STATE, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.ON_WORK_STATE, handler);
  },

  // ---- Mouse passthrough (fire-and-forget, not invoke) ----

  /** Tell the main process the cursor entered a pet pixel. */
  mouseEnter: (): void => {
    ipcRenderer.send('pet:mouse-enter');
  },

  /** Tell the main process the cursor left the pet pixels. */
  mouseLeave: (): void => {
    ipcRenderer.send('pet:mouse-leave');
  },

  // ---- Onboarding interactive mode ----

  /** Tell the main process to make the window fully interactive (for onboarding). */
  onboardingStart: (): void => {
    ipcRenderer.send('pet:onboarding-start');
  },

  /** Tell the main process the onboarding is done, restore click-through. */
  onboardingEnd: (): void => {
    ipcRenderer.send('pet:onboarding-end');
  },

  // ---- Main → Renderer event listeners ----

  /**
   * Called when the main process pushes a freshly-loaded pet
   * (e.g. after onboarding or data migration).
   * Returns an unsubscribe function.
   */
  onPetLoaded: (callback: (pet: any) => void): (() => void) => {
    const handler = (_event: any, pet: any) => callback(pet);
    ipcRenderer.on(IPC_CHANNELS.ON_PET_LOADED, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.ON_PET_LOADED, handler);
  },

  /**
   * Called when settings are changed from another window or the tray.
   * Returns an unsubscribe function.
   */
  onSettingsChanged: (callback: (settings: any) => void): (() => void) => {
    const handler = (_event: any, settings: any) => callback(settings);
    ipcRenderer.on(IPC_CHANNELS.ON_SETTINGS_CHANGED, handler);
    return () =>
      ipcRenderer.removeListener(IPC_CHANNELS.ON_SETTINGS_CHANGED, handler);
  },

  /**
   * Called when focus mode is toggled externally.
   * Returns an unsubscribe function.
   */
  onFocusMode: (callback: (enabled: boolean) => void): (() => void) => {
    const handler = (_event: any, enabled: boolean) => callback(enabled);
    ipcRenderer.on(IPC_CHANNELS.ON_FOCUS_MODE, handler);
    return () =>
      ipcRenderer.removeListener(IPC_CHANNELS.ON_FOCUS_MODE, handler);
  },

  /**
   * Called when the app is about to shut down.
   * The renderer can use this to play a farewell animation.
   * Returns an unsubscribe function.
   */
  onShutdown: (callback: () => void): (() => void) => {
    const handler = () => callback();
    ipcRenderer.on(IPC_CHANNELS.ON_SHUTDOWN, handler);
    return () =>
      ipcRenderer.removeListener(IPC_CHANNELS.ON_SHUTDOWN, handler);
  },

  /**
   * The main process pushes a bubble (weather report, notification…).
   * Returns an unsubscribe function.
   */
  onPushBubble: (callback: (payload: any) => void): (() => void) => {
    const handler = (_e: any, payload: any) => callback(payload);
    ipcRenderer.on(IPC_CHANNELS.ON_PUSH_BUBBLE, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.ON_PUSH_BUBBLE, handler);
  },

  /**
   * The pet was killed elsewhere (tray / settings); the renderer should
   * re-hatch a fresh machine-bound creature.  Returns an unsubscribe fn.
   */
  onKilled: (callback: () => void): (() => void) => {
    const handler = () => callback();
    ipcRenderer.on(IPC_CHANNELS.ON_KILLED, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.ON_KILLED, handler);
  },
};

// Expose on window.pixelpal
try {
  contextBridge.exposeInMainWorld('pixelpal', pixelpalApi);
  console.log('[PixelPal Preload] API exposed successfully on window.pixelpal');
} catch (err) {
  console.error('[PixelPal Preload] Failed to expose API:', err);
}
