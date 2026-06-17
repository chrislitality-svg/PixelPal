// ============================================================
// PixelPal -- DragHandler
// ============================================================
//
// Manages the geometry of a window-drag gesture.  When the user
// presses the mouse button over the pet, the InputHandler starts
// a drag session.  On every subsequent mousemove, updateDrag()
// computes the new window position (in logical / DIP pixels)
// based on the mouse delta and the display scale factor.
//
// All coordinates are in logical pixels (the same coordinate
// space that Electron's BrowserWindow.setBounds uses).
// ============================================================

export class DragHandler {
  private isDragging: boolean = false;

  // Screen-space position where the mouse was pressed
  private startScreenX: number = 0;
  private startScreenY: number = 0;

  // Window position (logical px) at the moment the drag began
  private windowStartX: number = 0;
  private windowStartY: number = 0;

  // Display scale factor (physical / logical).  On most systems
  // this is 1; on HiDPI / Retina it may be 1.5 or 2.
  private scaleFactor: number = 1;

  // ------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------

  /**
   * Begin a drag gesture.
   *
   * @param screenX       MouseEvent.screenX at mousedown
   * @param screenY       MouseEvent.screenY at mousedown
   * @param windowX       Current window X (logical px) -- from getScreenInfo()
   * @param windowY       Current window Y (logical px)
   * @param scaleFactor   Display scale factor (default 1)
   */
  startDrag(
    screenX: number,
    screenY: number,
    windowX: number,
    windowY: number,
    scaleFactor: number = 1,
  ): void {
    this.isDragging = true;
    this.startScreenX = screenX;
    this.startScreenY = screenY;
    this.windowStartX = windowX;
    this.windowStartY = windowY;
    this.scaleFactor = scaleFactor;
  }

  /**
   * Compute the new window position from the current mouse position.
   *
   * Returns `null` when:
   *  - not currently dragging, or
   *  - the delta is sub-pixel (avoids unnecessary IPC round-trips)
   */
  updateDrag(screenX: number, screenY: number): { x: number; y: number } | null {
    if (!this.isDragging) return null;

    // screenX/Y is in physical pixels; divide by scaleFactor to
    // obtain the logical-pixel delta that matches window coordinates.
    const deltaX = (screenX - this.startScreenX) / this.scaleFactor;
    const deltaY = (screenY - this.startScreenY) / this.scaleFactor;

    // Skip sub-pixel movement to avoid redundant IPC calls
    if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) {
      return null;
    }

    return {
      x: Math.round(this.windowStartX + deltaX),
      y: Math.round(this.windowStartY + deltaY),
    };
  }

  /** End the current drag gesture and reset internal state. */
  endDrag(): void {
    this.isDragging = false;
  }

  /** Whether a drag gesture is currently in progress. */
  getIsDragging(): boolean {
    return this.isDragging;
  }
}
