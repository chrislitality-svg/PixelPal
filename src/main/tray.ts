// ============================================================
// PixelPal — System tray manager
// ============================================================
// Creates and manages the system-tray icon with a context menu
// for Show/Hide, Settings, Auto-start toggle, and Quit.
// ============================================================

import {
  Tray,
  Menu,
  nativeImage,
  app,
  BrowserWindow,
} from 'electron';
import * as path from 'path';
import * as fs from 'fs';

export interface TrayCallbacks {
  onShow: () => void;
  onHide: () => void;
  onSettings: () => void;
  onQuit: () => void;
  onStatus?: () => void;
  onWork?: () => void;
  onCleanPoop?: () => void;
  onSetAutoStart?: (enabled: boolean) => void;
  getAutoStart?: () => boolean;
}

export class PetTray {
  private tray: Tray | null = null;
  private petName: string = 'PixelPal';
  private isVisible: boolean = true;
  private callbacks: TrayCallbacks;

  constructor(callbacks: TrayCallbacks) {
    this.callbacks = callbacks;
  }

  // ---- Lifecycle ----

  create(): void {
    const iconPath = this.resolveIconPath();
    let icon: Electron.NativeImage;

    if (iconPath && fs.existsSync(iconPath)) {
      icon = nativeImage.createFromPath(iconPath);
      // Resize to 16x16 for tray if the source is larger
      if (icon.getSize().width > 16) {
        icon = icon.resize({ width: 16, height: 16 });
      }
    } else {
      // Fallback: a tiny 1x1 transparent image so Tray doesn't crash
      icon = nativeImage.createEmpty();
      console.warn(
        `[Tray] Icon not found at ${iconPath}, using empty fallback. ` +
        'Place tray-icon.png in assets/icons/ for a proper icon.'
      );
    }

    this.tray = new Tray(icon);
    this.tray.setToolTip(this.petName);

    this.rebuildMenu();

    // Double-click tray icon to toggle visibility
    this.tray.on('double-click', () => {
      if (this.isVisible) {
        this.callbacks.onHide();
      } else {
        this.callbacks.onShow();
      }
    });
  }

  destroy(): void {
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
  }

  // ---- Menu ----

  /**
   * Rebuild the context menu. Call this whenever a menu-relevant state
   * changes (e.g. visibility toggle label, auto-start toggle).
   */
  rebuildMenu(): void {
    if (!this.tray) return;

    const autoStart = this.callbacks.getAutoStart
      ? this.callbacks.getAutoStart()
      : this.getAutoStart();

    const contextMenu = Menu.buildFromTemplate([
      {
        label: this.isVisible ? '隐藏宠物' : '显示宠物',
        click: () => {
          if (this.isVisible) {
            this.callbacks.onHide();
          } else {
            this.callbacks.onShow();
          }
        },
      },
      {
        label: '状态卡',
        click: () => this.callbacks.onStatus?.(),
      },
      {
        label: '🛠️ 打工',
        click: () => this.callbacks.onWork?.(),
      },
      {
        label: '🧹 清理便便',
        click: () => this.callbacks.onCleanPoop?.(),
      },
      { type: 'separator' },
      {
        label: '设置',
        click: () => {
          this.callbacks.onSettings();
        },
      },
      {
        label: '开机自启',
        type: 'checkbox',
        checked: autoStart,
        click: (menuItem) => {
          if (this.callbacks.onSetAutoStart) {
            this.callbacks.onSetAutoStart(menuItem.checked);
          } else {
            this.setAutoStart(menuItem.checked);
          }
          this.rebuildMenu();
        },
      },
      { type: 'separator' },
      {
        label: '退出',
        click: () => {
          this.callbacks.onQuit();
        },
      },
    ]);

    this.tray.setContextMenu(contextMenu);
  }

  // ---- State updates ----

  setPetName(name: string): void {
    this.petName = name;
    if (this.tray) {
      this.tray.setToolTip(this.petName);
    }
  }

  setVisibility(visible: boolean): void {
    this.isVisible = visible;
    this.rebuildMenu();
  }

  // ---- Auto-start ----

  private getAutoStart(): boolean {
    try {
      const settings = app.getLoginItemSettings();
      return settings.openAtLogin;
    } catch {
      return false;
    }
  }

  private setAutoStart(enabled: boolean): void {
    try {
      app.setLoginItemSettings({
        openAtLogin: enabled,
        // Don't open as hidden — we want the pet visible on start
        openAsHidden: false,
      });
    } catch (err) {
      console.error('[Tray] Failed to set auto-start:', err);
    }
  }

  // ---- Icon path resolution ----

  private resolveIconPath(): string | null {
    const candidates: string[] = [];

    if (app.isPackaged) {
      // In production builds extraResources copies assets/ into the
      // resources directory.
      candidates.push(
        path.join(process.resourcesPath, 'assets', 'icons', 'tray-icon.png'),
        path.join(process.resourcesPath, 'assets', 'tray-icon.png'),
      );
    } else {
      // Development — relative to the project root
      const projectRoot = path.resolve(__dirname, '..', '..');
      candidates.push(
        path.join(projectRoot, 'assets', 'icons', 'tray-icon.png'),
        path.join(projectRoot, 'build', 'tray-icon.png'),
        path.join(projectRoot, 'assets', 'tray-icon.png'),
      );
    }

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }

    // Return the first candidate even if it doesn't exist — the caller
    // will handle the missing file gracefully.
    return candidates[0] ?? null;
  }
}
