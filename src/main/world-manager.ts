// ============================================================
// PixelPal — World overlay manager (desktop poop)
// ============================================================
// Owns a single full-work-area, transparent, click-through,
// always-on-top window that renders the pet's poop at ABSOLUTE
// desktop coordinates.  The overlay only repaints when the poop
// set changes (event-driven), so it costs essentially nothing
// while idle — important because hardware acceleration is off.
//
// Poop is persisted by the Store; the pet window adds poop, and the
// overlay (or the tray) removes it.
// ============================================================

import { BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';

import type { Rectangle } from 'electron';

import { IPC_CHANNELS } from '../shared/types';
import type { WorldPoop } from '../shared/types';
import { POOP } from '../shared/constants';
import type { Store } from './store';

const IS_DEV =
  process.env.ELECTRON_IS_DEV === 'true' ||
  !require('electron').app.isPackaged;

export class WorldManager {
  private window: BrowserWindow | null = null;
  private store: Store;
  private workArea: Rectangle;

  constructor(store: Store, workArea: Rectangle) {
    this.store = store;
    this.workArea = workArea;
  }

  // ---- Lifecycle ----

  createOverlay(): void {
    const wa = this.workArea;
    this.window = new BrowserWindow({
      x: wa.x,
      y: wa.y,
      width: wa.width,
      height: wa.height,
      frame: false,
      transparent: true,
      hasShadow: false,
      alwaysOnTop: true,       // sits above normal windows, BELOW the pet
      skipTaskbar: true,
      focusable: false,
      resizable: false,
      movable: false,
      fullscreenable: false,
      webPreferences: {
        preload: path.join(__dirname, '..', 'preload', 'index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: false,
      },
    });

    // Click-through by default; the renderer flips this on when the
    // cursor is over a poop pixel (so it can be clicked to clean).
    this.window.setIgnoreMouseEvents(true, { forward: true });

    if (IS_DEV) {
      this.window.loadURL('http://localhost:5173/world.html');
    } else {
      this.window.loadFile(path.join(__dirname, '..', '..', 'renderer', 'world.html'));
    }

    this.window.once('ready-to-show', () => {
      if (this.window && !this.window.isDestroyed()) {
        this.window.showInactive();           // never steal focus
        this.window.setAlwaysOnTop(true, 'floating');
        this.syncOverlay();
      }
    });

    // Overlay tells us when the cursor is / isn't over a poop pixel.
    ipcMain.on('world:set-interactive', (_e, interactive: boolean) => {
      if (this.window && !this.window.isDestroyed()) {
        if (interactive) {
          this.window.setIgnoreMouseEvents(false);
        } else {
          this.window.setIgnoreMouseEvents(true, { forward: true });
        }
      }
    });
  }

  /** Reposition / resize the overlay when the work area changes. */
  updateWorkArea(workArea: Rectangle): void {
    this.workArea = workArea;
    if (this.window && !this.window.isDestroyed()) {
      this.window.setBounds({
        x: workArea.x,
        y: workArea.y,
        width: workArea.width,
        height: workArea.height,
      });
      this.syncOverlay();
    }
  }

  // ---- Poop API ----

  addPoop(x: number, y: number): WorldPoop[] {
    const poops = this.getFreshPoops();
    poops.push({
      id: `poop_${Date.now()}_${Math.floor(Math.random() * 1e6).toString(36)}`,
      x,
      y,
      createdAt: Date.now(),
    });
    // Cap the count — drop the oldest.
    while (poops.length > POOP.maxOnScreen) poops.shift();
    this.store.setPoops(poops);
    this.syncOverlay();
    return poops;
  }

  removePoop(id: string): WorldPoop[] {
    const poops = this.getFreshPoops().filter((p) => p.id !== id);
    this.store.setPoops(poops);
    this.syncOverlay();
    return poops;
  }

  clearPoops(): WorldPoop[] {
    this.store.setPoops([]);
    this.syncOverlay();
    return [];
  }

  getPoops(): WorldPoop[] {
    return this.getFreshPoops();
  }

  // ---- Internal ----

  /** Read poop, dropping any that have expired. */
  private getFreshPoops(): WorldPoop[] {
    const now = Date.now();
    const all = this.store.getPoops();
    const fresh = all.filter((p) => now - p.createdAt < POOP.expireMs);
    if (fresh.length !== all.length) {
      this.store.setPoops(fresh);
    }
    return fresh;
  }

  /** Push the full poop list + overlay origin to the overlay renderer. */
  private syncOverlay(): void {
    if (!this.window || this.window.isDestroyed()) return;
    const poops = this.getFreshPoops();
    this.window.webContents.send(IPC_CHANNELS.ON_WORLD_POOPS, {
      poops,
      origin: { x: this.workArea.x, y: this.workArea.y },
      size: { w: this.workArea.width, h: this.workArea.height },
    });
  }

  destroy(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.destroy();
    }
    this.window = null;
  }
}
