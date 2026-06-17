// ============================================================
// PixelPal — Electron main process entry point
// ============================================================
// Orchestrates app lifecycle: creates the pet window, system tray,
// screen monitor, persistence store, and wires up IPC handlers.
// ============================================================

import { app, BrowserWindow } from 'electron';

import { IPC_CHANNELS } from '../shared/types';
import { EMPATHY_MESSAGES, COIN_REWARDS } from '../shared/constants';

import { PetManager } from './pet-manager';
import { ScreenMonitor } from './screen-monitor';
import { PetTray } from './tray';
import { Store } from './store';
import { WorldManager } from './world-manager';
import { registerIpcHandlers, openSettingsWindow, openStatusWindow, openWorkWindow, resumeActiveJob, clearJobTimers } from './ipc-handlers';
import { applyAutoStart } from './auto-start';
import { fetchDailyWeather, todayStr } from './weather';
import { generateImage } from './grsai';

// ---- Disable hardware acceleration ----
// Required for transparent frameless windows to render correctly,
// especially on systems with virtual display adapters (Todesk, etc.)
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu-compositing');

// ---- Module-level singletons ----

let petManager: PetManager;
let screenMonitor: ScreenMonitor;
let tray: PetTray;
let store: Store;
let worldManager: WorldManager;
let isQuitting = false;

// ---- Initialisation ----

function initialize(): void {
  // --- Persistence ---
  store = new Store();
  store.initialize();

  // --- Sync launch-at-login with the saved preference ---
  // Settings are the source of truth; default is on (user requested
  // auto-start).  This makes the OS match the stored choice each run.
  applyAutoStart(store.getSettings().autoStart);

  // --- Screen ---
  screenMonitor = new ScreenMonitor();
  screenMonitor.initialize((workArea) => {
    // When the work area changes (e.g. display resolution change,
    // taskbar resize), keep the pet within bounds.
    petManager.clampToWorkArea(workArea);
    if (worldManager) worldManager.updateWorkArea(workArea);
  });

  // --- Pet window ---
  petManager = new PetManager();
  const workArea = screenMonitor.getWorkArea();
  const startPos = screenMonitor.getBottomCenterPosition(256, 350);
  petManager.createWindow(startPos);

  // --- World overlay (desktop poop) ---
  worldManager = new WorldManager(store, workArea);
  worldManager.createOverlay();

  // Load pet name from DB so the tray tooltip is accurate
  const existingPet = store.petExists() ? store.loadPet() : null;
  if (existingPet) {
    petManager.setPetName(existingPet.name);
  }

  // --- IPC ---
  registerIpcHandlers({
    store,
    screenMonitor,
    petManager,
    worldManager,
    isQuitting: () => isQuitting,
  });

  // --- Resume an in-flight job (pet may still be "at work") ---
  resumeActiveJob();

  // --- Daily weather report (once per day, on first run) ---
  scheduleDailyWeather();

  // --- Daily login coin bonus (once per day) ---
  grantDailyLoginBonus();

  // --- Auto-generate the cute AI appearance (once, silently) ---
  scheduleAutoAppearance();

  // --- System tray ---
  tray = new PetTray({
    onShow: () => {
      petManager.setVisible(true);
      tray.setVisibility(true);
    },
    onHide: () => {
      petManager.setVisible(false);
      tray.setVisibility(false);
    },
    onSettings: () => {
      // Triggered from tray menu — open the settings window directly.
      openSettingsWindow();
    },
    onQuit: () => {
      app.quit();
    },
    onStatus: () => {
      openStatusWindow();
    },
    onWork: () => {
      openWorkWindow();
    },
    onCleanPoop: () => {
      worldManager.clearPoops();
    },
    getAutoStart: () => store.getSettings().autoStart,
    onSetAutoStart: (enabled: boolean) => {
      store.setSettings({ autoStart: enabled });
      applyAutoStart(enabled);
      // Keep renderer windows in sync
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) {
          win.webContents.send(IPC_CHANNELS.ON_SETTINGS_CHANGED, store.getSettings());
        }
      }
    },
  });
  tray.create();

  if (existingPet) {
    tray.setPetName(existingPet.name);
  }
}

// ---- App lifecycle ----

app.whenReady().then(() => {
  try {
    initialize();
  } catch (err) {
    console.error('[Main] Initialization failed:', err);
    // Even if init fails, try to create tray so user can quit
    try {
      tray = new PetTray({
        onShow: () => {},
        onHide: () => {},
        onSettings: () => {},
        onQuit: () => app.quit(),
      });
      tray.create();
    } catch {}
  }

  // macOS: re-create window when dock icon is clicked (if applicable)
  app.on('activate', () => {
    if (!petManager.isWindowAlive()) {
      const startPos = screenMonitor.getBottomCenterPosition(256, 350);
      petManager.createWindow(startPos);
    }
  });
});

// Prevent the app from quitting when all windows close (the pet might
// be hidden, but the tray is still alive).
app.on('window-all-closed', () => {
  // On macOS apps traditionally stay open until Cmd+Q.
  // On other platforms we also keep the process alive because the
  // tray icon is the primary interaction point.
  // We do NOT call app.quit() here — the user quits via the tray.
});

// Graceful shutdown: send the farewell event to all renderers so they
// can play a goodbye animation, then persist data and exit.
app.on('before-quit', () => {
  isQuitting = true;

  // Send shutdown event to every renderer (峰终告别)
  const shutdownPayload = pickFarewellMessage();
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      try {
        win.webContents.send(IPC_CHANNELS.ON_SHUTDOWN, shutdownPayload);
      } catch {
        // Window may have already been destroyed mid-iteration
      }
    }
  }

  // Force-save the current pet state immediately
  if (store) {
    const pet = store.loadPet();
    if (pet) {
      store.savePetImmediate(pet);
    }
    store.close();
  }

  // Stop battery polling timer in ScreenMonitor
  if (screenMonitor) {
    screenMonitor.destroy();
  }

  // Tear down the world overlay
  if (worldManager) {
    worldManager.destroy();
  }

  // Cancel any pending job timers
  clearJobTimers();
});

// Handle uncaught exceptions gracefully
process.on('uncaughtException', (err) => {
  console.error('[Main] Uncaught exception:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[Main] Unhandled rejection:', reason);
});

// ---- Helpers ----

function pickFarewellMessage(): string {
  const messages = EMPATHY_MESSAGES.shutdown;
  return messages[Math.floor(Math.random() * messages.length)];
}

/** Push a bubble payload to the pet window (weather, notifications…). */
function pushBubbleToPet(payload: {
  text: string;
  type: string;
  duration: number;
  icon?: string;
}): void {
  const win = petManager?.getWindow();
  if (win && !win.isDestroyed()) {
    win.webContents.send(IPC_CHANNELS.ON_PUSH_BUBBLE, payload);
  }
}

/**
 * Once per day, on the first run, fetch the local weather (by IP) and
 * have the pet report it with a clothing tip.  Fully best-effort:
 * any failure is silent and simply skips the report.
 */
function scheduleDailyWeather(): void {
  // Wait for the renderer to be ready and the empathy greeting to pass.
  setTimeout(async () => {
    try {
      const settings = store.getSettings();
      if (!settings.weatherEnabled) return;

      const today = todayStr();
      if (settings.lastWeatherDate === today) return; // already reported today

      const weather = await fetchDailyWeather();
      if (!weather) return;

      store.setSettings({ lastWeatherDate: today });
      pushBubbleToPet({
        text: weather.message,
        type: 'info',
        duration: 14000,
        icon: weather.icon,
      });
    } catch (err) {
      console.error('[Weather] daily report failed:', err);
    }
  }, 9000);
}

/**
 * Auto-generate the cute card background + a portrait that matches this
 * machine's pet, once, silently (we do it for the user — no buttons).
 * Best-effort: any failure is ignored and simply leaves the default look.
 */
function scheduleAutoAppearance(): void {
  setTimeout(async () => {
    try {
      const s = store.getSettings();
      if (!s.generatedBg) {
        const r = await generateImage(
          'Kawaii pastel pixel-art background card, soft pink and cream gradient, ' +
            'fluffy clouds, sparkles and hearts, cozy dreamy aesthetic, no text, vertical card',
          { aspectRatio: '3:4' },
        );
        if (r.ok && r.dataUrl) store.setSettings({ generatedBg: r.dataUrl });
      }

      if (!store.getSettings().generatedAvatar) {
        const pet = store.loadPet();
        if (pet) {
          const animalMap: Record<string, string> = {
            cat: 'kitten', dog: 'puppy', rabbit: 'bunny', sheep: 'lamb', cow: 'calf',
            rodent: 'hamster', bird: 'little bird', fox: 'fox', deer: 'fawn',
            panda: 'panda', dragon: 'baby dragon',
          };
          const animal = animalMap[pet.species] || 'pet';
          const r2 = await generateImage(
            `Adorable kawaii chibi pixel-art portrait of a ${animal}, big sparkly eyes, ` +
              'soft pastel pink background, round cute face, centered, sticker style, no text',
            { aspectRatio: '1:1' },
          );
          if (r2.ok && r2.dataUrl) store.setSettings({ generatedAvatar: r2.dataUrl });
        }
      }
    } catch (err) {
      console.error('[Appearance] auto-gen failed:', err);
    }
  }, 15000);
}

/**
 * Grant a once-per-day login coin bonus and let the pet announce it.
 */
function grantDailyLoginBonus(): void {
  try {
    const settings = store.getSettings();
    const today = todayStr();
    if (settings.lastCoinDate === today) return;

    store.setSettings({ lastCoinDate: today });
    const wallet = store.earnCoins(COIN_REWARDS.dailyLogin);

    setTimeout(() => {
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) {
          win.webContents.send(IPC_CHANNELS.ON_WALLET_CHANGED, wallet);
        }
      }
      pushBubbleToPet({
        text: `每日见面礼 +${COIN_REWARDS.dailyLogin} 爱心币，拿去商店给我买点啥吧~`,
        type: 'info',
        duration: 9000,
        icon: '\u{1FA99}', // 🪙
      });
    }, 12000);
  } catch (err) {
    console.error('[Coins] daily bonus failed:', err);
  }
}
