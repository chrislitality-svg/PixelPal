// ============================================================
// PixelPal — Pet window lifecycle manager
// ============================================================
// Owns the BrowserWindow that renders the pet sprite.
// Handles creation, positioning, mouse-passthrough toggling,
// and window destruction.
// ============================================================

import { BrowserWindow, ipcMain, screen } from 'electron';
import * as path from 'path';

import type { Rectangle } from 'electron';

// Detect dev mode: either ELECTRON_IS_DEV env var or no packaged flag
const IS_DEV =
  process.env.ELECTRON_IS_DEV === 'true' || !require('electron').app.isPackaged;

export class PetManager {
  private window: BrowserWindow | null = null;
  private petName: string = 'PixelPal';
  /** Window bounds saved before onboarding so we can restore them after. */
  private preOnboardBounds: Rectangle | null = null;

  // ---- Lifecycle ----

  /**
   * Create the transparent, frameless, always-on-top pet window and load
   * the renderer content.
   */
  createWindow(startPosition: { x: number; y: number }): BrowserWindow {
    // Clamp start position to ensure it's on screen
    const primaryDisplay = require('electron').screen.getPrimaryDisplay();
    const workArea = primaryDisplay.workArea;
    const safeX = Math.max(workArea.x, Math.min(startPosition.x, workArea.x + workArea.width - 256));
    const safeY = Math.max(workArea.y, Math.min(startPosition.y, workArea.y + workArea.height - 350));

    console.log(`[PetManager] Creating window at (${safeX}, ${safeY}), workArea: ${JSON.stringify(workArea)}`);

    this.window = new BrowserWindow({
      width: 256,
      height: 350,
      x: safeX,
      y: safeY,

      // Visual
      frame: false,
      transparent: true,
      hasShadow: false,

      // Behaviour
      alwaysOnTop: true,
      skipTaskbar: true,
      focusable: true,
      resizable: false,

      webPreferences: {
        preload: path.join(__dirname, '..', 'preload', 'index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        // Ensure rendering happens even when window is initially hidden
        backgroundThrottling: false,
      },
    });

    // ---- Mouse passthrough ----
    // By default the entire window is click-through. The renderer sends
    // IPC messages to toggle this when the cursor enters/leaves pet pixels.
    this.window.setIgnoreMouseEvents(true, { forward: true });

    // ---- Load content ----
    if (IS_DEV) {
      this.window.loadURL('http://localhost:5173');
    } else {
      this.window.loadFile(path.join(__dirname, '..', '..', 'renderer', 'index.html'));
    }

    // Ensure window is visible after content loads
    this.window.once('ready-to-show', () => {
      if (this.window && !this.window.isDestroyed()) {
        this.window.show();
        this.window.setAlwaysOnTop(true, 'screen-saver');
        console.log(`[PetManager] Window shown at (${this.window.getPosition().join(',')})`);
      }
    });

    // ---- Wire up IPC for mouse passthrough ----
    this.setupMouseEvents();

    return this.window;
  }

  /**
   * Register IPC listeners that the renderer uses to toggle mouse
   * passthrough on the pet window.
   */
  private setupMouseEvents(): void {
    // Renderer tells us the cursor is over a visible pet pixel
    ipcMain.on('pet:mouse-enter', () => {
      if (this.window && !this.window.isDestroyed()) {
        this.window.setIgnoreMouseEvents(false);
      }
    });

    // Renderer tells us the cursor left the pet pixels
    ipcMain.on('pet:mouse-leave', () => {
      if (this.window && !this.window.isDestroyed()) {
        this.window.setIgnoreMouseEvents(true, { forward: true });
      }
    });

    // Onboarding starts: make the window interactive + grow & centre it
    // so the hatch card fits fully (the 256px pet window is too narrow).
    ipcMain.on('pet:onboarding-start', () => {
      if (!this.window || this.window.isDestroyed()) return;
      this.window.setIgnoreMouseEvents(false);

      this.preOnboardBounds = this.window.getBounds();
      const wa = require('electron').screen.getPrimaryDisplay().workArea;
      const w = 380, h = 470;
      this.window.setBounds({
        x: Math.round(wa.x + (wa.width - w) / 2),
        y: Math.round(wa.y + (wa.height - h) / 2),
        width: w,
        height: h,
      });
      this.window.show();
      this.window.focus();
    });

    // Onboarding ends: restore size/position + default click-through.
    ipcMain.on('pet:onboarding-end', () => {
      if (!this.window || this.window.isDestroyed()) return;
      this.window.setIgnoreMouseEvents(true, { forward: true });
      if (this.preOnboardBounds) {
        this.window.setBounds(this.preOnboardBounds);
        this.preOnboardBounds = null;
      }
    });
  }

  // ---- Window accessors ----

  getWindow(): BrowserWindow | null {
    return this.window;
  }

  isWindowAlive(): boolean {
    return this.window !== null && !this.window.isDestroyed();
  }

  // ---- Position & bounds ----

  getBounds(): Rectangle | null {
    if (!this.isWindowAlive()) return null;
    return this.window!.getBounds();
  }

  /**
   * Move the window to an absolute position.
   */
  moveTo(x: number, y: number): void {
    if (!this.isWindowAlive()) return;
    this.window!.setPosition(Math.round(x), Math.round(y));
  }

  /**
   * Move the window by a relative delta from its current position.
   */
  moveBy(dx: number, dy: number): void {
    if (!this.isWindowAlive()) return;
    const [cx, cy] = this.window!.getPosition();
    this.window!.setPosition(Math.round(cx + dx), Math.round(cy + dy));
  }

  /**
   * Clamp the window position so it stays within the primary display's
   * work area.
   */
  clampToWorkArea(workArea: Rectangle): void {
    if (!this.isWindowAlive()) return;

    const bounds = this.window!.getBounds();
    let { x, y } = bounds;

    // Horizontal clamp
    if (x < workArea.x) x = workArea.x;
    if (x + bounds.width > workArea.x + workArea.width) {
      x = workArea.x + workArea.width - bounds.width;
    }

    // Vertical clamp
    if (y < workArea.y) y = workArea.y;
    if (y + bounds.height > workArea.y + workArea.height) {
      y = workArea.y + workArea.height - bounds.height;
    }

    if (x !== bounds.x || y !== bounds.y) {
      this.window!.setPosition(Math.round(x), Math.round(y));
    }
  }

  /**
   * Toggle window visibility.
   */
  setVisible(visible: boolean): void {
    if (!this.isWindowAlive()) return;
    if (visible) {
      this.window!.show();
    } else {
      this.window!.hide();
    }
  }

  // ---- Teardown ----

  destroy(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.destroy();
    }
    this.window = null;
  }

  // ---- Metadata ----

  setPetName(name: string): void {
    this.petName = name;
  }

  getPetName(): string {
    return this.petName;
  }
}
