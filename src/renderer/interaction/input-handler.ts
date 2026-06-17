// ============================================================
// PixelPal -- InputHandler
// ============================================================
//
// Wires every mouse interaction on the pet canvas to the
// appropriate subsystem:
//
//   mousemove   -> alpha hit-test -> toggle mouse passthrough
//   mousedown   -> begin drag gesture
//   mouseup     -> end drag, clear state
//   click       -> single (petHead) / double (chat) / triple (poke)
//   contextmenu -> right-click action menu
//
// The handler relies on three collaborators:
//   PetRenderer  -- alpha hit-testing and particle effects
//   PetManager   -- game-state mutations (petHead, poke, feed, ...)
//   DragHandler  -- pure geometry of window dragging
//   BubbleSystem -- speech bubbles for interaction feedback
//
// Lifecycle:  construct -> setup() -> ... -> teardown()
// ============================================================

import type { PetManager } from '../pet/pet-entity';
import type { PetRenderer } from '../engine/renderer';
import { DragHandler } from './drag-handler';
import type { BubbleSystem } from './bubble';
import { sound } from '../engine/sound';

// ----------------------------------------------------------------
// Constants
// ----------------------------------------------------------------

/** Maximum interval (ms) between clicks to count as a multi-click. */
const CLICK_THRESHOLD_MS = 400;

/** Minimum alpha value (0-255) to treat a pixel as "opaque". */
const ALPHA_HIT_THRESHOLD = 10;

// ----------------------------------------------------------------
// InputHandler
// ----------------------------------------------------------------

export class InputHandler {
  private canvas: HTMLCanvasElement;
  private renderer: PetRenderer;
  private petManager: PetManager;
  private bubbleSystem: BubbleSystem;
  private dragHandler: DragHandler;

  /** Optional callback for menu actions not handled internally (e.g. record, screenshot). */
  onExternalAction: ((action: string) => void) | null = null;

  /** Optional callback to award coins for an owner interaction. */
  onEarnCoins: ((reason: string) => void) | null = null;

  // Hover state
  private isHovering: boolean = false;

  // Drag state
  private isDragging: boolean = false;
  private wasDragged: boolean = false;   // true if the last drag actually moved
  private dragPending: boolean = false;  // true while async IPC for drag start is in-flight

  // Click detection
  private clickCount: number = 0;
  private lastClickTime: number = 0;
  private singleClickTimer: ReturnType<typeof setTimeout> | null = null;

  // Context menu reference (for cleanup)
  private contextMenu: HTMLElement | null;
  private menuItemClickHandlers: Array<{ el: HTMLElement; handler: () => void }> = [];
  /** True while the right-click menu is open (suspends passthrough toggling). */
  private menuOpen: boolean = false;

  // Bound event handlers (arrow functions, stored for removal)
  private boundMouseMove: (e: MouseEvent) => void;
  private boundMouseDown: (e: MouseEvent) => void;
  private boundMouseUp: (e: MouseEvent) => void;
  private boundDragMove: (e: MouseEvent) => void;
  private boundClick: (e: MouseEvent) => void;
  private boundContextMenu: (e: MouseEvent) => void;
  private boundMouseLeave: () => void;
  private boundDocumentClick: (e: MouseEvent) => void;
  private boundKeyDown: (e: KeyboardEvent) => void;
  private boundWindowBlur: () => void;

  constructor(
    canvas: HTMLCanvasElement,
    renderer: PetRenderer,
    petManager: PetManager,
    bubbleSystem: BubbleSystem,
  ) {
    this.canvas       = canvas;
    this.renderer     = renderer;
    this.petManager   = petManager;
    this.bubbleSystem = bubbleSystem;
    this.dragHandler  = new DragHandler();
    this.contextMenu  = document.getElementById('context-menu');

    // Pre-bind handlers so we can remove them later
    this.boundMouseMove    = (e: MouseEvent) => this.handleMouseMove(e);
    this.boundMouseDown   = (e: MouseEvent) => this.handleMouseDown(e);
    this.boundMouseUp     = (e: MouseEvent) => this.handleMouseUp(e);
    this.boundDragMove    = (e: MouseEvent) => this.handleDragMove(e);
    this.boundClick       = (e: MouseEvent) => this.handleClick(e);
    this.boundContextMenu = (e: MouseEvent) => this.handleContextMenu(e);
    this.boundMouseLeave  = () => this.handleMouseLeave();
    this.boundDocumentClick = () => this.hideContextMenu();
    this.boundKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && this.menuOpen) this.hideContextMenu();
    };
    this.boundWindowBlur = () => {
      if (this.menuOpen) this.hideContextMenu();
    };
  }

  // ------------------------------------------------------------------
  // Setup / teardown
  // ------------------------------------------------------------------

  /** Attach all event listeners.  Call once after construction. */
  setup(): void {
    this.canvas.addEventListener('mousemove',     this.boundMouseMove);
    this.canvas.addEventListener('mousedown',     this.boundMouseDown);
    this.canvas.addEventListener('click',         this.boundClick);
    this.canvas.addEventListener('contextmenu',   this.boundContextMenu);
    this.canvas.addEventListener('mouseleave',    this.boundMouseLeave);
    document.addEventListener('click',            this.boundDocumentClick, true);
    document.addEventListener('keydown',          this.boundKeyDown);
    window.addEventListener('blur',               this.boundWindowBlur);

    this.setupContextMenuItems();
  }

  /** Remove all event listeners and clear timers. */
  teardown(): void {
    this.canvas.removeEventListener('mousemove',   this.boundMouseMove);
    this.canvas.removeEventListener('mousedown',   this.boundMouseDown);
    this.canvas.removeEventListener('click',       this.boundClick);
    this.canvas.removeEventListener('contextmenu', this.boundContextMenu);
    this.canvas.removeEventListener('mouseleave',  this.boundMouseLeave);
    document.removeEventListener('mouseup',   this.boundMouseUp);
    document.removeEventListener('mousemove', this.boundDragMove);
    document.removeEventListener('click',     this.boundDocumentClick, true);
    document.removeEventListener('keydown',   this.boundKeyDown);
    window.removeEventListener('blur',        this.boundWindowBlur);

    // Detach context-menu item handlers
    for (const { el, handler } of this.menuItemClickHandlers) {
      el.removeEventListener('click', handler);
    }
    this.menuItemClickHandlers = [];

    if (this.singleClickTimer !== null) {
      clearTimeout(this.singleClickTimer);
      this.singleClickTimer = null;
    }

    this.hideContextMenu();
  }

  // ------------------------------------------------------------------
  // Mouse-move: alpha hit detection + drag tracking
  // ------------------------------------------------------------------

  private handleMouseMove(e: MouseEvent): void {
    // Skip hover detection while dragging -- the pet is "in hand"
    if (this.isDragging) return;
    // While the context menu is open, keep the whole window interactive
    // so the menu can be clicked / dismissed (otherwise moving onto a
    // transparent area flips the window click-through and the menu
    // becomes impossible to close).
    if (this.menuOpen) return;

    // Alpha hit-test: is the cursor over an opaque pixel of the pet?
    const alpha = this.renderer.getPixelAlpha(e.offsetX, e.offsetY);
    const isOverPet = alpha > ALPHA_HIT_THRESHOLD;

    if (isOverPet && !this.isHovering) {
      this.isHovering = true;
      window.pixelpal.mouseEnter();
      this.canvas.style.cursor = 'pointer';
    } else if (!isOverPet && this.isHovering) {
      this.isHovering = false;
      window.pixelpal.mouseLeave();
      this.canvas.style.cursor = 'default';
    }
  }

  /** Reset hover state when the cursor leaves the canvas entirely. */
  private handleMouseLeave(): void {
    if (this.isHovering && !this.isDragging && !this.menuOpen) {
      this.isHovering = false;
      window.pixelpal.mouseLeave();
      this.canvas.style.cursor = 'default';
    }
  }

  // ------------------------------------------------------------------
  // Mouse-down: start drag
  // ------------------------------------------------------------------

  private async handleMouseDown(e: MouseEvent): Promise<void> {
    if (e.button !== 0) return;   // left click only
    if (this.dragPending) return; // prevent overlapping drag starts

    const alpha = this.renderer.getPixelAlpha(e.offsetX, e.offsetY);
    if (alpha <= ALPHA_HIT_THRESHOLD) return;  // not over the pet

    this.dragPending = true;

    // Fetch current window position (async IPC) then start the drag
    try {
      const info = await window.pixelpal.getScreenInfo();
      // If mouse was released during async gap, abort
      if (!this.dragPending) return;
      this.isDragging  = true;
      this.wasDragged  = false;
      this.dragHandler.startDrag(
        e.screenX, e.screenY,
        info.windowX, info.windowY,
        info.scaleFactor,
      );
      this.petManager.drag();

      // Listen on document so we catch mouseup even outside the canvas
      document.addEventListener('mouseup',   this.boundMouseUp, { once: true });
      document.addEventListener('mousemove', this.boundDragMove);
    } catch {
      // IPC unavailable (e.g. during tests) -- silently skip
    } finally {
      this.dragPending = false;
    }
  }

  // ------------------------------------------------------------------
  // Mouse-up: end drag
  // ------------------------------------------------------------------

  private handleMouseUp(_e: MouseEvent): void {
    if (this.isDragging) {
      this.dragHandler.endDrag();
      this.petManager.drop();
      this.isDragging = false;

      document.removeEventListener('mousemove', this.boundDragMove);
    }
  }

  // ------------------------------------------------------------------
  // Click: single / double / triple detection
  // ------------------------------------------------------------------

  private handleClick(e: MouseEvent): void {
    // Always close context menu on left-click
    if (e.button === 0) this.hideContextMenu();

    // Suppress click after a drag gesture
    if (this.wasDragged) {
      this.wasDragged = false;
      this.resetClickDetection();
      return;
    }

    if (e.button !== 0) return;

    const alpha = this.renderer.getPixelAlpha(e.offsetX, e.offsetY);
    if (alpha <= ALPHA_HIT_THRESHOLD) return;

    const now = Date.now();

    // If the gap between clicks exceeds the threshold, treat as a new
    // sequence and fire the pending single-click action immediately.
    if (this.clickCount > 0 && now - this.lastClickTime > CLICK_THRESHOLD_MS) {
      if (this.singleClickTimer !== null) {
        clearTimeout(this.singleClickTimer);
        this.singleClickTimer = null;
      }
      this.fireInteraction();
      this.clickCount = 0;
    }

    this.clickCount++;
    this.lastClickTime = now;

    // Cancel any pending single-click timer
    if (this.singleClickTimer !== null) {
      clearTimeout(this.singleClickTimer);
      this.singleClickTimer = null;
    }

    // Triple click fires immediately -- no need to wait
    if (this.clickCount >= 3) {
      this.pokePet();
      this.resetClickDetection();
      return;
    }

    // Set timer to fire the appropriate action if no further click arrives
    const count = this.clickCount;
    this.singleClickTimer = setTimeout(() => {
      if (this.clickCount === count) {
        if (count === 1) this.petTheHead();
        else if (count === 2) this.openChat();
      }
      this.resetClickDetection();
    }, CLICK_THRESHOLD_MS);
  }

  // -- Interaction actions -------------------------------------------

  /** Single click: pet the head (摸头). */
  private petTheHead(): void {
    this.petManager.petHead();
    sound.play('pet');
    this.onEarnCoins?.('pet');

    // Spawn heart particles above the pet
    for (let i = 0; i < 3; i++) {
      this.renderer.addParticle(
        'heart',
        this.canvas.width / 2 + (Math.random() - 0.5) * 30,
        this.canvas.height * 0.35,
      );
    }

    this.bubbleSystem.show({
      text: '\u2665',
      type: 'emoji',
      duration: 1500,
    });
  }

  /** Double click: open chat. */
  private openChat(): void {
    const fsm = this.petManager.fsm;
    if (fsm.isIn('idle') || fsm.isIn('wander')) {
      fsm.transition('chat', 'user-doubleclick');
    }
    this.bubbleSystem.show({
      text: '...',
      type: 'monologue',
      duration: 2000,
    });
  }

  /** Triple click: rapid poke (戳). */
  private pokePet(): void {
    this.petManager.poke();
    sound.play('poke');

    // Spawn star particles
    for (let i = 0; i < 2; i++) {
      this.renderer.addParticle(
        'star',
        this.canvas.width / 2 + (Math.random() - 0.5) * 20,
        this.canvas.height * 0.4,
      );
    }
  }

  /** Fire whatever interaction the current clickCount maps to. */
  private fireInteraction(): void {
    if (this.clickCount === 1) this.petTheHead();
    else if (this.clickCount === 2) this.openChat();
    // 3+ is handled synchronously in handleClick
  }

  private resetClickDetection(): void {
    this.clickCount    = 0;
    this.lastClickTime = 0;
  }

  // ------------------------------------------------------------------
  // Context menu (right-click)
  // ------------------------------------------------------------------

  private handleContextMenu(e: MouseEvent): void {
    e.preventDefault();
    if (!this.contextMenu) return;

    // Position the menu at the cursor, clamped to the (small) window.
    // The menu is scroll-capped to the window height in CSS, so use the
    // window height as the effective menu height when clamping.
    const menuWidth  = 160;
    const menuHeight = Math.min(400, window.innerHeight - 12);
    let x = e.clientX;
    let y = e.clientY;

    if (x + menuWidth > window.innerWidth)  x = window.innerWidth  - menuWidth;
    if (y + menuHeight > window.innerHeight) y = window.innerHeight - menuHeight;
    if (x < 4) x = 4;
    if (y < 4) y = 4;

    this.contextMenu.style.left    = `${x}px`;
    this.contextMenu.style.top     = `${y}px`;
    this.contextMenu.style.display = 'block';

    // Lock the window interactive for the whole lifetime of the menu.
    this.menuOpen = true;
    this.isHovering = true;
    window.pixelpal.mouseEnter();
  }

  private hideContextMenu(): void {
    if (this.contextMenu) {
      this.contextMenu.style.display = 'none';
    }
    if (this.menuOpen) {
      this.menuOpen = false;
      // Restore click-through so the window stops blocking the desktop;
      // the next mousemove over the pet re-enables interactivity.
      this.isHovering = false;
      window.pixelpal.mouseLeave();
    }
  }

  /** Wire up click handlers on each context-menu item. */
  private setupContextMenuItems(): void {
    if (!this.contextMenu) return;

    const items = this.contextMenu.querySelectorAll<HTMLElement>('.menu-item');
    items.forEach(item => {
      const action  = item.dataset.action;
      const handler = () => {
        this.executeMenuAction(action || '');
        this.hideContextMenu();
      };
      item.addEventListener('click', handler);
      this.menuItemClickHandlers.push({ el: item, handler });
    });
  }

  private executeMenuAction(action: string): void {
    const pm = this.petManager;
    const fsm = pm.fsm;
    const bubble = this.bubbleSystem;

    switch (action) {
      case 'feed':
        pm.feed();
        sound.play('feed');
        this.onEarnCoins?.('feed');
        bubble.show({ text: '好吃!', type: 'hunger', duration: 2000, icon: '\u{1F356}' });
        break;

      case 'pet':
        pm.petHead();
        sound.play('pet');
        this.onEarnCoins?.('pet');
        for (let i = 0; i < 2; i++) {
          this.renderer.addParticle('heart', this.canvas.width / 2, this.canvas.height * 0.35);
        }
        bubble.show({ text: '\u2665', type: 'emoji', duration: 1500 });
        break;

      case 'status': {
        window.pixelpal.openStatus();
        break;
      }

      case 'shop': {
        window.pixelpal.openShop();
        break;
      }

      case 'gallery': {
        window.pixelpal.openGallery();
        break;
      }

      case 'work': {
        window.pixelpal.openWork();
        break;
      }

      case 'report': {
        window.pixelpal.openReport();
        break;
      }

      case 'visit': {
        window.pixelpal.openVisitor();
        break;
      }

      case 'party': {
        window.pixelpal.openParty();
        break;
      }

      case 'focus':
        window.pixelpal.setFocusMode(true);
        break;

      case 'settings':
        window.pixelpal.openSettings();
        break;

      case 'rest':
        if (fsm.isIn('idle') || fsm.isIn('wander') || fsm.isIn('daydream')) {
          fsm.transition('sleep', 'user-rest');
          bubble.show({ text: '\u{1F4A4} \u665A\u5B89...', type: 'energy', duration: 3000 });
        }
        break;

      case 'record':
      case 'screenshot':
      case 'joke':
      case 'mischief':
      case 'cleanpoop':
      case 'killpet':
        // Delegate to the external handler wired up in main.ts
        if (this.onExternalAction) {
          this.onExternalAction(action);
        }
        break;

      default:
        break;
    }
  }

  // ------------------------------------------------------------------
  // Drag movement
  // ------------------------------------------------------------------

  /** Compute the new window position and send it to the main process. */
  private handleDragMove(e: MouseEvent): void {
    const newPos = this.dragHandler.updateDrag(e.screenX, e.screenY);
    if (newPos) {
      this.wasDragged = true;
      window.pixelpal.movePet(newPos);
    }
  }
}
