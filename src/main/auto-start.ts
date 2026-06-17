// ============================================================
// PixelPal — Launch-at-login control
// ============================================================
// Wraps app.setLoginItemSettings so the desktop pet can start with
// Windows.  Settings are the source of truth: the pet syncs the OS
// login item to settings.autoStart on startup and whenever the user
// toggles it.
// ============================================================

import { app } from 'electron';

/**
 * Apply the desired auto-start state to the OS login items.
 * For the packaged portable build we pin the executable path so the
 * registry entry points at the real binary.
 */
export function applyAutoStart(enabled: boolean): void {
  try {
    if (process.platform === 'win32' && app.isPackaged) {
      // For a portable build, process.execPath points at a temporary
      // extraction dir that changes every launch — the login item must
      // instead point at the real .exe, which electron-builder exposes
      // via PORTABLE_EXECUTABLE_FILE.
      const exePath = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
      app.setLoginItemSettings({
        openAtLogin: enabled,
        openAsHidden: false,
        path: exePath,
        args: [],
      });
    } else {
      app.setLoginItemSettings({
        openAtLogin: enabled,
        openAsHidden: false,
      });
    }
  } catch (err) {
    console.error('[AutoStart] Failed to apply login item:', err);
  }
}

/** Whether the OS currently launches the app at login. */
export function isAutoStartEnabled(): boolean {
  try {
    return app.getLoginItemSettings().openAtLogin;
  } catch {
    return false;
  }
}
