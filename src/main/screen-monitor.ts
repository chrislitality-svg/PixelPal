// PRIVACY RED LINE: This module only uses OS-level public events.
// It does NOT: log keyboard input, capture screen content, read other app window titles.
// All signals come from Electron powerMonitor and WMI battery queries.
// ============================================================
// PixelPal — Screen awareness & time-context provider
// ============================================================
// Tracks the primary display's work area, listens for display
// metric changes, and computes the empathy-clock TimeContext.
// Also collects OS-level signals: lock/unlock, suspend/resume,
// system idle time, and battery percentage.
// ============================================================

import { screen, powerMonitor } from 'electron';
import { execSync } from 'child_process';
import type { Rectangle, Display } from 'electron';

import type { TimeContext } from '../shared/types';

export class ScreenMonitor {
  private workArea: Rectangle;
  private scaleFactor: number;
  private displaySize: { width: number; height: number };

  // ---- OS signal state (Patch 2: Empathy Clock Signal Sources) ----
  private isLocked: boolean = false;
  private isSuspended: boolean = false;
  /** One-shot flag: set on lock-screen event, cleared when getTimeContext() is called. */
  private wasLocked: boolean = false;
  /** One-shot flag: set on suspend event, cleared when getTimeContext() is called. */
  private wasSuspended: boolean = false;
  /** Battery percentage 0-100, or -1 if desktop / no battery available. */
  private batteryPercent: number = -1;
  /** Periodic timer for battery polling (every 5 minutes). */
  private batteryQueryTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    const primary = screen.getPrimaryDisplay();
    this.workArea = primary.workArea;
    this.scaleFactor = primary.scaleFactor;
    this.displaySize = primary.size;
  }

  // ---- Lifecycle ----

  /**
   * Start listening for display metric changes (resolution, scale, etc.).
   * The callback fires whenever the OS reports a display change.
   * Also wires up OS signal listeners (lock/unlock, suspend/resume, battery).
   */
  initialize(onChange?: (workArea: Rectangle) => void): void {
    screen.on('display-metrics-changed', (_event, _display, changedMetrics) => {
      const primary = screen.getPrimaryDisplay();

      // Refresh cached values
      this.workArea = primary.workArea;
      this.scaleFactor = primary.scaleFactor;
      this.displaySize = primary.size;

      if (onChange && changedMetrics.includes('workArea')) {
        onChange(this.workArea);
      }
    });

    // Wire up OS-level signal listeners (Patch 2)
    this.initializeSignalListeners();
  }

  // ---- OS signal listeners (Patch 2: Empathy Clock Signal Sources) ----

  /**
   * Subscribe to powerMonitor events for lock/unlock, suspend/resume,
   * and start periodic battery polling.  Called once from initialize().
   */
  private initializeSignalListeners(): void {
    // Lock screen: user walks away
    powerMonitor.on('lock-screen', () => {
      console.log('[ScreenMonitor] Screen locked');
      this.isLocked = true;
      this.wasLocked = true; // one-shot; cleared by getTimeContext()
    });

    // Unlock screen: user returns
    powerMonitor.on('unlock-screen', () => {
      console.log('[ScreenMonitor] Screen unlocked');
      this.isLocked = false;
      // wasLocked remains true until getTimeContext() consumes it
    });

    // System suspend: lid closed / hibernate
    powerMonitor.on('suspend', () => {
      console.log('[ScreenMonitor] System suspending');
      this.isSuspended = true;
      this.wasSuspended = true; // one-shot; cleared by getTimeContext()
    });

    // System resume: lid opened / wake from hibernate
    powerMonitor.on('resume', () => {
      console.log('[ScreenMonitor] System resumed');
      this.isSuspended = false;
      // wasSuspended remains true until getTimeContext() consumes it
    });

    // Battery: poll every 5 minutes via WMI (Windows only; harmless on others)
    this.queryBatteryPercent();
    this.batteryQueryTimer = setInterval(() => {
      this.queryBatteryPercent();
    }, 5 * 60 * 1000);
  }

  /**
   * Query the current battery percentage via WMI on Windows.
   * Returns -1 on desktop machines, non-Windows platforms, or on error.
   * Uses execSync wrapped in try/catch — the call is fast (< 200ms)
   * and runs only every 5 minutes.
   */
  private queryBatteryPercent(): void {
    try {
      const raw = execSync(
        'wmic Path Win32_Battery get EstimatedChargeRemaining /value',
        { encoding: 'utf8', timeout: 3000, windowsHide: true },
      );
      // Output looks like: "\r\r\nEstimatedChargeRemaining=87\r\r\n\r\r\n"
      const match = raw.match(/EstimatedChargeRemaining\s*=\s*(\d+)/);
      this.batteryPercent = match ? parseInt(match[1], 10) : -1;
    } catch {
      // No battery present (desktop) or WMI unavailable — keep -1
      this.batteryPercent = -1;
    }
  }

  /**
   * Stop the battery polling timer.  Call during graceful shutdown.
   */
  destroy(): void {
    if (this.batteryQueryTimer !== null) {
      clearInterval(this.batteryQueryTimer);
      this.batteryQueryTimer = null;
    }
  }

  // ---- Display info ----

  /**
   * The usable work area of the primary display (excludes taskbar).
   */
  getWorkArea(): Rectangle {
    // Return a fresh copy to avoid external mutation
    return { ...this.workArea };
  }

  /**
   * The full pixel dimensions of the primary display.
   */
  getDisplaySize(): { width: number; height: number } {
    return { ...this.displaySize };
  }

  /**
   * The device-pixel scale factor of the primary display.
   */
  getScaleFactor(): number {
    return this.scaleFactor;
  }

  /**
   * A serialisable snapshot of everything the renderer might need.
   */
  getScreenInfo(): {
    workArea: Rectangle;
    scaleFactor: number;
    displaySize: { width: number; height: number };
  } {
    return {
      workArea: this.getWorkArea(),
      scaleFactor: this.scaleFactor,
      displaySize: this.getDisplaySize(),
    };
  }

  // ---- Time context (empathy clock) ----

  /**
   * Compute the current TimeContext used by the renderer's empathy clock
   * and behavior engine.  Includes OS signals: lock/unlock, suspend/resume,
   * battery level.  One-shot flags (wasLocked, wasSuspended) are consumed
   * and cleared on each call so the renderer sees them exactly once.
   */
  getTimeContext(): TimeContext {
    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();
    const dayOfWeek = now.getDay(); // 0 = Sunday

    // Snapshot one-shot flags before clearing them
    const wasLocked = this.wasLocked;
    const wasSuspended = this.wasSuspended;
    // Clear one-shot flags — renderer has now been notified
    this.wasLocked = false;
    this.wasSuspended = false;

    return {
      hour,
      minute,
      dayOfWeek,
      isNight: hour >= 22 || hour < 6,
      isLateNight: hour >= 0 && hour < 5,
      isMorning: hour >= 6 && hour < 9,
      isFridayAfternoon: dayOfWeek === 5 && hour >= 14,
      idleMinutes: this.getIdleMinutes(),
      isLocked: this.isLocked,
      isSuspended: this.isSuspended,
      batteryPercent: this.batteryPercent,
      isLowBattery: this.batteryPercent >= 0 && this.batteryPercent < 20,
      wasLocked,
      wasSuspended,
    };
  }

  // ---- Idle tracking ----

  /**
   * System-wide idle time in minutes (rounded down).
   * Uses Electron's powerMonitor API which queries the OS.
   */
  getIdleMinutes(): number {
    try {
      // powerMonitor.getSystemIdleTime() returns seconds since last
      // user input (keyboard / mouse). Available on all desktop platforms.
      const idleSeconds = powerMonitor.getSystemIdleTime();
      return Math.floor(idleSeconds / 60);
    } catch {
      return 0;
    }
  }

  // ---- Utility ----

  /**
   * Compute an initial window position: horizontally centred, sitting on
   * the bottom edge of the work area.
   */
  getBottomCenterPosition(windowWidth: number, windowHeight: number): { x: number; y: number } {
    const wa = this.workArea;
    return {
      x: Math.round(wa.x + (wa.width - windowWidth) / 2),
      y: Math.round(wa.y + wa.height - windowHeight),
    };
  }
}
