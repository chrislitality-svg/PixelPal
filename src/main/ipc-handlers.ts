// ============================================================
// PixelPal — IPC handler registration
// ============================================================
// Centralises every ipcMain.handle / ipcMain.on call so that the
// main entry-point stays clean.  Each handler delegates to the
// appropriate service (Store, ScreenMonitor, PetManager).
// ============================================================

import { ipcMain, BrowserWindow, app, shell } from 'electron';
import * as path from 'path';

import { IPC_CHANNELS } from '../shared/types';
import type { PetEntity, AppSettings, TimeContext } from '../shared/types';
import { SAVE_KEY_EVENTS, MISCHIEF, MISCHIEF_LEVEL, SHOP_ITEMS, COIN_REWARDS, JOBS, BREED_REGISTRY } from '../shared/constants';
import type { Wallet } from '../shared/types';

import { Store } from './store';
import { ScreenMonitor } from './screen-monitor';
import { PetManager } from './pet-manager';
import { WorldManager } from './world-manager';
import { generateImage } from './grsai';
import { applyAutoStart } from './auto-start';

export interface IpcDeps {
  store: Store;
  screenMonitor: ScreenMonitor;
  petManager: PetManager;
  worldManager: WorldManager;
  isQuitting: () => boolean;
}

// Hard guard so the "open a folder" mischief can't spam the user.
let lastMischiefTime = 0;

// Pets that have been released — saves for these ids are ignored so the
// renderer's beforeunload/periodic save can't resurrect a deleted pet
// (which previously made re-rolls keep producing the old creature).
const releasedPetIds = new Set<string>();

/** Prevent unbounded growth of releasedPetIds after many re-rolls. */
function capReleasedPetIds(): void {
  const iter = releasedPetIds.values();
  for (let i = 0; i < 250; i++) releasedPetIds.delete(iter.next().value);
}

// ---- Job lifecycle (pet leaves to work / returns) ----
let depsRef: IpcDeps | null = null;
let jobFinishTimer: ReturnType<typeof setTimeout> | null = null;
let jobHideTimer: ReturnType<typeof setTimeout> | null = null;

function jobBroadcast(channel: string, payload: unknown): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(channel, payload);
  }
}

function jobSendToPet(channel: string, payload: unknown): void {
  const win = depsRef?.petManager.getWindow();
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

/** Pet heads off to work: pause behaviour, hide after a short wave, auto-finish at endsAt. */
function beginWorkSequence(endsAt: number): void {
  if (!depsRef) return;
  jobSendToPet(IPC_CHANNELS.ON_WORK_STATE, true);
  const deps = depsRef;
  if (jobHideTimer) clearTimeout(jobHideTimer);
  jobHideTimer = setTimeout(() => deps?.petManager.setVisible(false), 2500);
  if (jobFinishTimer) clearTimeout(jobFinishTimer);
  jobFinishTimer = setTimeout(() => {
    if (!depsRef) return;
    finishWork();
  }, Math.max(0, endsAt - Date.now()));
}

/** Bring the pet back into view (+ reward bubble on success). */
function returnPet(res: { ok: boolean; reward?: number; wallet?: unknown; event?: string } | null): void {
  if (!depsRef) return;
  if (jobHideTimer) { clearTimeout(jobHideTimer); jobHideTimer = null; }
  if (jobFinishTimer) { clearTimeout(jobFinishTimer); jobFinishTimer = null; }
  depsRef.petManager.setVisible(true);
  jobSendToPet(IPC_CHANNELS.ON_WORK_STATE, false);
  if (res && res.ok && res.wallet) {
    jobBroadcast(IPC_CHANNELS.ON_WALLET_CHANGED, res.wallet);
    const prefix = res.event ? `${res.event}！` : '打工回来啦！';
    jobSendToPet(IPC_CHANNELS.ON_PUSH_BUBBLE, {
      text: `${prefix}赚到 ${res.reward} 爱心币💰`,
      type: 'monologue', duration: 5000, icon: '\u{1FA99}',
    });
  }
}

function finishWork(): void {
  if (!depsRef) return;
  returnPet(depsRef.store.collectJob());
}

/** On startup, resume an in-flight job (or auto-collect one finished while away). */
export function resumeActiveJob(): void {
  if (!depsRef) return;
  const st = depsRef.store.getJobState();
  if (!st.current) return;
  if (Date.now() >= st.current.endsAt) {
    // Finished while the app was closed → make sure the pet is back.
    setTimeout(() => finishWork(), 1500);
  } else {
    beginWorkSequence(st.current.endsAt);
  }
}

export function clearJobTimers(): void {
  if (jobFinishTimer) { clearTimeout(jobFinishTimer); jobFinishTimer = null; }
  if (jobHideTimer) { clearTimeout(jobHideTimer); jobHideTimer = null; }
}

const MISCHIEF_FOLDERS: Array<{ path: () => string; name: string }> = [
  { path: () => app.getPath('documents'), name: '文档' },
  { path: () => app.getPath('downloads'), name: '下载' },
  { path: () => app.getPath('desktop'), name: '桌面' },
  { path: () => app.getPath('pictures'), name: '图片' },
  { path: () => app.getPath('music'), name: '音乐' },
  { path: () => app.getPath('videos'), name: '视频' },
];

/**
 * Register all IPC handlers.  Call once after app 'ready'.
 */
export function registerIpcHandlers(deps: IpcDeps): void {
  const { store, screenMonitor, petManager, worldManager } = deps;
  depsRef = deps; // used by the job lifecycle (resume / auto-finish)

  // ---- Pet persistence ----

  ipcMain.handle(IPC_CHANNELS.PET_EXISTS, (): { exists: boolean; error?: string } => {
    const exists = store.petExists();
    if (store.lastError) return { exists, error: store.lastError };
    return { exists };
  });

  ipcMain.handle(IPC_CHANNELS.PET_LOAD, (): { pet: PetEntity | null; error?: string } => {
    const pet = store.loadPet();
    if (pet && petManager.isWindowAlive()) {
      petManager.setPetName(pet.name);
    }
    // Discovering a pet adds its breed to the 图鉴 collection.
    if (pet?.breed) store.addToCollection(pet.breed);
    // Record an attribute snapshot for the growth report (throttled).
    if (pet?.attributes) store.recordAttrSnapshot(pet.attributes);
    if (store.lastError) return { pet, error: store.lastError };
    return { pet };
  });

  ipcMain.handle(
    IPC_CHANNELS.PET_SAVE,
    (_event, pet: PetEntity): { saved: boolean; reason?: string } => {
      // Never resurrect a released pet (its old id was deleted on kill).
      if (pet && releasedPetIds.has(pet.id)) return { saved: false, reason: 'released' };
      // If the save is triggered by a "key event" (eat, levelup, etc.)
      // we bypass the debounce and write immediately.
      const state = (pet as PetEntity & { _triggerState?: string });
      if (
        state._triggerState &&
        SAVE_KEY_EVENTS.includes(state._triggerState as typeof SAVE_KEY_EVENTS[number])
      ) {
        store.savePetImmediate(pet);
      } else {
        store.savePet(pet);
      }
      return { saved: true };
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.PET_DELETE,
    (_event, petId: string): boolean => {
      return store.deletePet(petId);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.PET_NEEDS_UPDATE,
    (_event, needs: PetEntity['needs']): void => {
      // Lightweight needs-only update (debounced).  The renderer sends
      // this on every tick instead of the full pet entity.
      const pet = store.loadPet();
      if (pet) {
        pet.needs = needs;
        store.savePet(pet);
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.PET_STATE_CHANGED,
    (_event, state: string): void => {
      // The renderer notifies the current FSM state so the main process
      // can decide whether to trigger an immediate save.
      if (SAVE_KEY_EVENTS.includes(state as typeof SAVE_KEY_EVENTS[number])) {
        const pet = store.loadPet();
        if (pet) {
          store.savePetImmediate(pet);
        }
      }
    }
  );

  // ---- Settings ----

  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, (): AppSettings => {
    return store.getSettings();
  });

  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_SET,
    (_event, settings: Partial<AppSettings>): AppSettings => {
      const updated = store.setSettings(settings);

      // Keep the OS launch-at-login state in sync when it changes.
      if (typeof settings.autoStart === 'boolean') {
        applyAutoStart(settings.autoStart);
      }

      // Notify every renderer window about the change
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) {
          win.webContents.send(IPC_CHANNELS.ON_SETTINGS_CHANGED, updated);
        }
      }

      return updated;
    }
  );

  ipcMain.handle(IPC_CHANNELS.OPEN_SETTINGS, (): void => {
    openSettingsWindow();
  });

  ipcMain.handle(IPC_CHANNELS.OPEN_STATUS, (): void => {
    openStatusWindow();
  });

  // ---- Screen & time ----

  ipcMain.handle(IPC_CHANNELS.GET_SCREEN_INFO, () => {
    const screenInfo = screenMonitor.getScreenInfo();
    const bounds = petManager.getBounds();
    return {
      ...screenInfo,
      windowX: bounds ? bounds.x : 0,
      windowY: bounds ? bounds.y : 0,
    };
  });

  ipcMain.handle(IPC_CHANNELS.GET_TIME_CONTEXT, (): TimeContext => {
    return screenMonitor.getTimeContext();
  });

  // ---- Pet window control ----

  ipcMain.handle(
    IPC_CHANNELS.MOVE_PET,
    (_event, position: { x: number; y: number }): void => {
      if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) return;
      petManager.moveTo(position.x, position.y);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.FOCUS_MODE,
    (_event, enabled: boolean): void => {
      // In focus mode we make the window fully click-through and dim.
      const win = petManager.getWindow();
      if (!win || win.isDestroyed()) return;

      if (enabled) {
        win.setIgnoreMouseEvents(true, { forward: true });
        win.setOpacity(0.3);
      } else {
        win.setIgnoreMouseEvents(true, { forward: true }); // default passthrough
        win.setOpacity(1.0);
      }

      // Notify all renderers
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) {
          w.webContents.send(IPC_CHANNELS.ON_FOCUS_MODE, enabled);
        }
      }
    }
  );

  // ---- Machine-bound seed (blind box) ----

  ipcMain.handle(IPC_CHANNELS.GET_MACHINE_SEED, () => {
    return store.getMachineSeedInfo();
  });

  // ---- Kill the pet (delete + advance incarnation) ----

  ipcMain.handle(IPC_CHANNELS.KILL_PET, (_event, petId: string) => {
    releasedPetIds.add(petId);              // block resurrection saves
    if (releasedPetIds.size > 500) capReleasedPetIds();
    const seedInfo = store.killPet(petId);  // also resets the wallet
    worldManager.clearPoops();
    // Cancel any in-flight job and make sure the (new) pet is visible.
    clearJobTimers();
    petManager.setVisible(true);
    // Tell every renderer to re-hatch a fresh machine-bound pet + reset coins UI.
    const freshWallet = store.getWallet();
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed()) {
        w.webContents.send(IPC_CHANNELS.ON_KILLED);
        w.webContents.send(IPC_CHANNELS.ON_WALLET_CHANGED, freshWallet);
      }
    }
    return seedInfo;
  });

  // ---- Release the pet and quit (user doesn't want a new one now) ----

  ipcMain.handle(IPC_CHANNELS.RELEASE_AND_QUIT, (_event, petId: string) => {
    releasedPetIds.add(petId); // block the beforeunload resurrection save on quit
    if (releasedPetIds.size > 500) capReleasedPetIds();
    store.killPet(petId);      // delete + advance incarnation (next launch = new egg)
    clearJobTimers();
    worldManager.clearPoops();
    app.quit();
  });

  // ---- Mischief: open one of the user's folders ----

  ipcMain.handle(IPC_CHANNELS.MISCHIEF_OPEN_FOLDER, async (_event, manual?: boolean) => {
    const settings = store.getSettings();
    const now = Date.now();

    if (manual) {
      // Manual menu trigger always works (even when auto is "off"),
      // only guarded against rapid double-clicks.
      if (now - lastMischiefTime < MISCHIEF.manualMinGapMs) {
        return { opened: false };
      }
    } else {
      // Automatic trigger respects the user-chosen frequency level.
      if (settings.mischiefLevel === 'off') return { opened: false };
      const lvl = MISCHIEF_LEVEL[settings.mischiefLevel] ?? MISCHIEF_LEVEL.off;
      if (now - lastMischiefTime < lvl.cooldownMs) {
        return { opened: false };
      }
    }

    const choice = MISCHIEF_FOLDERS[Math.floor(Math.random() * MISCHIEF_FOLDERS.length)];
    let folderPath = '';
    try {
      folderPath = choice.path();
    } catch {
      return { opened: false };
    }
    if (!folderPath) return { opened: false };

    try {
      await shell.openPath(folderPath);
      lastMischiefTime = now;
      return { opened: true, name: choice.name };
    } catch {
      return { opened: false };
    }
  });

  // ---- Desktop poop world ----

  ipcMain.handle(IPC_CHANNELS.WORLD_ADD_POOP, (_event, pos: { x: number; y: number }) => {
    if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y)) return [];
    return worldManager.addPoop(pos.x, pos.y);
  });

  ipcMain.handle(IPC_CHANNELS.WORLD_REMOVE_POOP, (_event, id: string) => {
    const poops = worldManager.removePoop(id);
    // Cleaning a poop earns coins (per-poop, so it can't be farmed by
    // the bulk "clear all" path).
    const wallet = store.earnCoins(COIN_REWARDS.cleanPoop);
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed()) w.webContents.send(IPC_CHANNELS.ON_WALLET_CHANGED, wallet);
    }
    return poops;
  });

  ipcMain.handle(IPC_CHANNELS.WORLD_CLEAR_POOPS, () => {
    return worldManager.clearPoops();
  });

  ipcMain.handle(IPC_CHANNELS.WORLD_GET_POOPS, () => {
    return worldManager.getPoops();
  });

  // ---- grsai image generation ----

  ipcMain.handle(
    IPC_CHANNELS.IMAGE_GENERATE,
    (_event, prompt: string, opts?: { aspectRatio?: string; model?: string }) => {
      const safe = String(prompt).slice(0, 2000).trim();
      if (!safe) return { ok: false, error: 'empty_prompt' };
      return generateImage(safe, opts || {});
    }
  );

  // ---- Wallet / shop ----

  const broadcastWallet = (wallet: Wallet): void => {
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed()) {
        w.webContents.send(IPC_CHANNELS.ON_WALLET_CHANGED, wallet);
      }
    }
  };

  ipcMain.handle(IPC_CHANNELS.WALLET_GET, () => store.getWallet());

  ipcMain.handle(IPC_CHANNELS.WALLET_EARN, (_event, amount: number) => {
    if (!Number.isFinite(amount) || amount <= 0) return store.getWallet();
    const wallet = store.earnCoins(amount);
    broadcastWallet(wallet);
    return wallet;
  });

  ipcMain.handle(IPC_CHANNELS.OPEN_SHOP, () => openShopWindow());

  ipcMain.handle(IPC_CHANNELS.SHOP_BUY, (_event, itemId: string) => {
    const item = SHOP_ITEMS.find((i) => i.id === itemId);
    if (!item) return { ok: false, wallet: store.getWallet(), error: 'unknown' as const };

    // Owned cosmetic → toggle equip/unequip (free), no re-purchase.
    const current = store.getWallet();
    if (item.category === 'cosmetic' && current.cosmetics.includes(item.id)) {
      const wallet = store.toggleCosmetic(item.id);
      broadcastWallet(wallet);
      return { ok: true, wallet, itemId };
    }

    const result = store.buyItem(itemId);
    if (result.ok) {
      // Consumables take effect on the LIVE pet immediately.
      if (item.effect) {
        const win = petManager.getWindow();
        if (win && !win.isDestroyed()) {
          win.webContents.send(IPC_CHANNELS.ON_USE_ITEM, {
            effect: item.effect,
            name: item.name,
            icon: item.icon,
            category: item.category,
          });
        }
      }
      broadcastWallet(result.wallet);
    }
    return result;
  });

  // ---- Achievements / collection (图鉴) ----

  ipcMain.handle(IPC_CHANNELS.GET_COLLECTION, () => store.getCollection());
  ipcMain.handle(IPC_CHANNELS.OPEN_GALLERY, () => openGalleryWindow());

  // ---- Growth report ----
  ipcMain.handle(IPC_CHANNELS.GET_ATTR_HISTORY, () => store.getAttrHistory());
  ipcMain.handle(IPC_CHANNELS.OPEN_REPORT, () => openReportWindow());

  // ---- Jobs (打工) ----

  const pushPetBubble = (text: string, icon: string): void => {
    const win = petManager.getWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.ON_PUSH_BUBBLE, {
        text, type: 'monologue', duration: 5000, icon,
      });
    }
  };

  ipcMain.handle(IPC_CHANNELS.OPEN_WORK, () => openWorkWindow());

  // ---- Visitor (friend drops by) ----
  ipcMain.handle(IPC_CHANNELS.OPEN_VISITOR, () => openVisitorWindow());
  ipcMain.handle(IPC_CHANNELS.OPEN_PARTY, () => openPartyWindow());
  // Let any window move itself (used by the walking visitor).
  ipcMain.on(IPC_CHANNELS.MOVE_SELF, (event, pos: { x: number; y: number }) => {
    const w = BrowserWindow.fromWebContents(event.sender);
    if (w && !w.isDestroyed()) w.setPosition(Math.round(pos.x), Math.round(pos.y));
  });
  ipcMain.handle(IPC_CHANNELS.JOB_GET, () => store.getJobState());

  ipcMain.handle(IPC_CHANNELS.JOB_START, (_event, jobId: string) => {
    const job = JOBS.find((j) => j.id === jobId);
    if (!job) return store.getJobState();
    const state = store.startJob(jobId);
    if (job && state.current?.id === jobId) {
      pushPetBubble(`我去${job.name}啦，等我回来~`, job.icon);
      // Pet heads off the desktop to work; returns automatically at endsAt.
      beginWorkSequence(state.current.endsAt);
    }
    return state;
  });

  ipcMain.handle(IPC_CHANNELS.JOB_COLLECT, () => {
    const res = store.collectJob();
    if (res.ok) returnPet(res); // shows the pet + reward bubble + wallet broadcast
    return res;
  });

  // ---- Settings window → pet window actions (screenshot / record) ----

  ipcMain.handle(IPC_CHANNELS.PET_ACTION, (_event, action: string) => {
    const ALLOWED = new Set(['screenshot', 'record', 'record-start', 'record-stop']);
    if (!ALLOWED.has(action)) return;
    const win = petManager.getWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.ON_PET_ACTION, action);
    }
  });
}

// ---- Settings window (secondary BrowserWindow) ----

let settingsWindow: BrowserWindow | null = null;

const IS_DEV =
  process.env.ELECTRON_IS_DEV === 'true' ||
  !require('electron').app.isPackaged;

export function openSettingsWindow(): void {
  // If already open, just focus it
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 480,
    height: 640,
    title: 'PixelPal Settings',
    resizable: false,
    parent: undefined, // not modal — let user keep seeing the pet
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (IS_DEV) {
    settingsWindow.loadURL('http://localhost:5173/settings.html');
  } else {
    settingsWindow.loadFile(
      path.join(__dirname, '..', '..', 'renderer', 'settings.html')
    );
  }

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

// ---- Status window (secondary BrowserWindow) ----

let statusWindow: BrowserWindow | null = null;

export function openStatusWindow(): void {
  if (statusWindow && !statusWindow.isDestroyed()) {
    statusWindow.focus();
    return;
  }

  statusWindow = new BrowserWindow({
    width: 440,
    height: 680,
    title: 'PixelPal',
    resizable: false,
    parent: undefined,
    backgroundColor: '#FDF6EC',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (IS_DEV) {
    statusWindow.loadURL('http://localhost:5173/status.html');
  } else {
    statusWindow.loadFile(
      path.join(__dirname, '..', '..', 'renderer', 'status.html')
    );
  }

  statusWindow.on('closed', () => {
    statusWindow = null;
  });
}

// ---- Shop window (secondary BrowserWindow) ----

let shopWindow: BrowserWindow | null = null;

export function openShopWindow(): void {
  if (shopWindow && !shopWindow.isDestroyed()) {
    shopWindow.focus();
    return;
  }

  shopWindow = new BrowserWindow({
    width: 460,
    height: 680,
    title: '可爱小宠物 · 商店',
    resizable: false,
    parent: undefined,
    backgroundColor: '#FFF0F6',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (IS_DEV) {
    shopWindow.loadURL('http://localhost:5173/shop.html');
  } else {
    shopWindow.loadFile(path.join(__dirname, '..', '..', 'renderer', 'shop.html'));
  }

  shopWindow.on('closed', () => {
    shopWindow = null;
  });
}

// ---- Gallery window (achievements + 图鉴) ----

let galleryWindow: BrowserWindow | null = null;

export function openGalleryWindow(): void {
  if (galleryWindow && !galleryWindow.isDestroyed()) {
    galleryWindow.focus();
    return;
  }

  galleryWindow = new BrowserWindow({
    width: 480,
    height: 700,
    title: '可爱小宠物 · 成就图鉴',
    resizable: false,
    parent: undefined,
    backgroundColor: '#FFF0F6',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (IS_DEV) {
    galleryWindow.loadURL('http://localhost:5173/gallery.html');
  } else {
    galleryWindow.loadFile(path.join(__dirname, '..', '..', 'renderer', 'gallery.html'));
  }

  galleryWindow.on('closed', () => {
    galleryWindow = null;
  });
}

// ---- Work window (打工) ----

let workWindow: BrowserWindow | null = null;

export function openWorkWindow(): void {
  if (workWindow && !workWindow.isDestroyed()) {
    workWindow.focus();
    return;
  }

  workWindow = new BrowserWindow({
    width: 480,
    height: 720,
    title: '可爱小宠物 · 打工',
    resizable: false,
    parent: undefined,
    backgroundColor: '#FFF0F6',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (IS_DEV) {
    workWindow.loadURL('http://localhost:5173/work.html');
  } else {
    workWindow.loadFile(path.join(__dirname, '..', '..', 'renderer', 'work.html'));
  }

  workWindow.on('closed', () => {
    workWindow = null;
  });
}

// ---- Growth report window ----

let reportWindow: BrowserWindow | null = null;

export function openReportWindow(): void {
  if (reportWindow && !reportWindow.isDestroyed()) {
    reportWindow.focus();
    return;
  }

  reportWindow = new BrowserWindow({
    width: 480,
    height: 720,
    title: '可爱小宠物 · 成长报告',
    resizable: false,
    parent: undefined,
    backgroundColor: '#FFF0F6',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (IS_DEV) {
    reportWindow.loadURL('http://localhost:5173/report.html');
  } else {
    reportWindow.loadFile(path.join(__dirname, '..', '..', 'renderer', 'report.html'));
  }

  reportWindow.on('closed', () => {
    reportWindow = null;
  });
}

// ---- Visitor windows (friends walk in to say hi / party) ----

let visitorWindows: BrowserWindow[] = [];
const MAX_VISITORS = 5;

/** Compute a meeting spot beside the resident pet for the i-th guest. */
function visitorMeetingSpot(i: number): { fromRight: boolean; meetingX: number; meetingY: number } {
  const wa = depsRef!.screenMonitor.getWorkArea();
  const petB = depsRef!.petManager.getBounds();
  const winW = 256, winH = 350;
  const baseX = petB ? petB.x : wa.x + (wa.width - winW) / 2;
  const by = petB ? petB.y : wa.y + wa.height - winH;
  const fromRight = i % 2 === 0;
  const dist = 110 + Math.floor(i / 2) * 95;       // spread guests out
  let mx = baseX + (fromRight ? dist : -dist);
  mx = Math.max(wa.x, Math.min(mx, wa.x + wa.width - winW));
  return { fromRight, meetingX: mx, meetingY: by };
}

/** Spawn one visitor window walking in to its meeting spot. */
function createVisitor(spot: { fromRight: boolean; meetingX: number; meetingY: number }): void {
  if (!depsRef) return;
  const wa = depsRef.screenMonitor.getWorkArea();
  const winW = 256, winH = 350;

  const breeds = BREED_REGISTRY.filter((b) => !b.isVariant);
  const breed = breeds[Math.floor(Math.random() * breeds.length)];
  const sx = spot.fromRight ? wa.x + wa.width + 10 : wa.x - winW - 10;

  const win = new BrowserWindow({
    x: Math.round(sx),
    y: Math.round(spot.meetingY),
    width: winW,
    height: winH,
    frame: false,
    transparent: true,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  win.setIgnoreMouseEvents(true, { forward: true });

  const query = {
    bx: String(Math.round(spot.meetingX)),
    by: String(Math.round(spot.meetingY)),
    sx: String(Math.round(sx)),
    species: breed.species,
    breed: breed.id,
    right: spot.fromRight ? '1' : '0',
  };

  if (IS_DEV) {
    const qs = new URLSearchParams(query).toString();
    win.loadURL(`http://localhost:5173/visitor.html?${qs}`);
  } else {
    win.loadFile(path.join(__dirname, '..', '..', 'renderer', 'visitor.html'), { query });
  }

  win.once('ready-to-show', () => {
    win.showInactive();
    win.setAlwaysOnTop(true, 'screen-saver');
  });
  win.on('closed', () => { visitorWindows = visitorWindows.filter((w) => w !== win); });
  visitorWindows.push(win);
}

/** A single friend drops by. */
export function openVisitorWindow(): void {
  if (!depsRef || visitorWindows.length >= MAX_VISITORS) return;
  createVisitor(visitorMeetingSpot(visitorWindows.length));
  jobSendToPet(IPC_CHANNELS.ON_PUSH_BUBBLE, {
    text: '有朋友来串门啦~',
    type: 'greeting',
    duration: 4000,
    icon: '\u{1F465}',
  });
}

/** Throw a little party — several friends arrive one after another. */
export function openPartyWindow(): void {
  if (!depsRef) return;
  const startIdx = visitorWindows.length;
  const want = 3 + Math.floor(Math.random() * 2); // 3–4 guests
  let spawned = 0;
  for (let i = 0; i < want; i++) {
    const idx = startIdx + i;
    if (idx >= MAX_VISITORS) break;
    setTimeout(() => createVisitor(visitorMeetingSpot(idx)), i * 700);
    spawned++;
  }
  if (spawned > 0) {
    jobSendToPet(IPC_CHANNELS.ON_PUSH_BUBBLE, {
      text: '开派对啦！好多朋友来玩~🎉',
      type: 'greeting',
      duration: 5000,
      icon: '\u{1F389}',
    });
  }
}

// ---- Health check (registered after main handlers) ----
ipcMain.handle(IPC_CHANNELS.STORE_HEALTH, (): { ok: boolean; error?: string } => {
  if (!depsRef) return { ok: false, error: 'Store not initialized yet' };
  const { store } = depsRef;
  store.lastError = null;
  const exists = store.petExists();
  if (store.lastError) return { ok: false, error: store.lastError };
  return { ok: true };
});
