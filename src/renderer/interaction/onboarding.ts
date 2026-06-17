// ============================================================
// PixelPal -- OnboardingSystem
// ============================================================
//
// The first 60 seconds of the user's experience.  This is the
// most important part of the product -- it creates the emotional
// anchor between the user and their new pet.
//
// Steps:
//   1. hatch    -- A pixel egg appears and hatches (2 s)
//   2. name     -- The user names their new companion
//   3. feed     -- First feeding interaction (auto-advance)
//   4. pet      -- First head-pet interaction (auto-advance)
//   5. complete -- "Your story begins!" (auto-close)
//
// Visual polish:
//   - Typewriter effect for all narrative text
//   - Smooth CSS progress-bar transitions
//   - Egg wobble / crack / burst animation
//   - Fade transitions between steps
//   - Celebration sparkles at completion
//
// DOM elements (from index.html):
//   #onboarding-overlay   full-screen backdrop
//   #onboarding-card      centred card with all content
//   #onb-progress         progress-bar fill element
//   #onb-title            h2 heading
//   #onb-desc             paragraph description
//   #onb-input            text input (name step)
//   #onb-btn              action button
// ============================================================

import type { OnboardingStep } from '../../shared/types';

// ----------------------------------------------------------------
// Constants
// ----------------------------------------------------------------

/** Progress-bar percentage for each step. */
const STEP_PROGRESS: Record<OnboardingStep, number> = {
  hatch:    15,
  name:     35,
  feed:     55,
  pet:      80,
  complete: 100,
};

/** Typewriter speed: milliseconds per character. */
const TYPE_SPEED_MS = 55;

/** Duration the egg is visible before the hatch animation starts. */
const EGG_APPEAR_MS = 1800;

/** Duration of the shake / crack animation before the egg "bursts". */
const EGG_HATCH_MS = 1500;

/** Pause between hatch animation ending and the name step starting. */
const HATCH_TO_NAME_MS = 800;

/** Auto-advance delay after feed / pet animations complete. */
const AUTO_ADVANCE_MS = 2200;

/** Delay before the overlay closes after the complete step. */
const COMPLETE_CLOSE_MS = 2500;

// ----------------------------------------------------------------
// CSS injected once for egg + typewriter animations
// ----------------------------------------------------------------

const ONBOARDING_CSS = `
/* -- Egg ---------------------------------------------------- */
@keyframes pixelpal-egg-wobble {
  0%, 100% { transform: rotate(0deg); }
  20%      { transform: rotate(-8deg); }
  40%      { transform: rotate(8deg); }
  60%      { transform: rotate(-12deg); }
  80%      { transform: rotate(12deg); }
}
@keyframes pixelpal-egg-burst {
  0%   { transform: scale(1);    opacity: 1; filter: brightness(1); }
  40%  { transform: scale(1.25); opacity: 1; filter: brightness(1.6); }
  100% { transform: scale(1.6);  opacity: 0; filter: brightness(2); }
}
@keyframes pixelpal-card-enter {
  0%   { transform: scale(0.88) translateY(24px); opacity: 0; }
  100% { transform: scale(1)    translateY(0);    opacity: 1; }
}
@keyframes pixelpal-step-fade {
  0%   { opacity: 0; transform: translateY(8px); }
  100% { opacity: 1; transform: translateY(0); }
}
@keyframes pixelpal-cursor-blink {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0; }
}

.onb-egg {
  width: 64px;
  height: 82px;
  background: linear-gradient(170deg, #FFF8FC 0%, #FFE0EE 100%);
  border-radius: 50% 50% 50% 50% / 60% 60% 40% 40%;
  border: 3px solid #FFAFCF;
  margin: 20px auto 8px;
  position: relative;
  box-shadow:
    inset -6px -6px 12px rgba(0,0,0,0.08),
    2px 3px 0 rgba(0,0,0,0.15);
}
.onb-egg::before {
  content: '';
  position: absolute;
  top: 28%; left: 18%;
  width: 28%; height: 22%;
  background: rgba(255,255,255,0.55);
  border-radius: 50%;
  transform: rotate(-20deg);
}
.onb-egg::after {
  content: '';
  position: absolute;
  top: 12%; right: 22%;
  width: 12%; height: 12%;
  background: rgba(255,255,255,0.4);
  border-radius: 50%;
}

.onb-egg.wobble {
  animation: pixelpal-egg-wobble 0.55s ease-in-out infinite;
}

.onb-egg-cracks {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  pointer-events: none;
}
.onb-egg-cracks .crack {
  position: absolute;
  background: #D98AAE;
}
.onb-egg-cracks .crack-1 {
  width: 2px; height: 22px;
  top: 32%; left: 48%;
  transform: rotate(22deg);
}
.onb-egg-cracks .crack-2 {
  width: 2px; height: 16px;
  top: 48%; left: 44%;
  transform: rotate(-18deg);
}
.onb-egg-cracks .crack-3 {
  width: 2px; height: 13px;
  top: 56%; left: 53%;
  transform: rotate(35deg);
}

.onb-egg.burst {
  animation: pixelpal-egg-burst 0.6s ease-out forwards;
}

/* -- Card transitions --------------------------------------- */
#onboarding-card.step-enter {
  animation: pixelpal-card-enter 0.4s ease-out;
}
.onb-step-content {
  animation: pixelpal-step-fade 0.35s ease-out;
}

/* -- Typewriter cursor -------------------------------------- */
.typewriter-cursor {
  display: inline-block;
  width: 2px;
  height: 1em;
  background: #FF6FA8;
  margin-left: 2px;
  vertical-align: text-bottom;
  animation: pixelpal-cursor-blink 0.75s step-end infinite;
}

/* -- Celebration particles (pure CSS) ----------------------- */
@keyframes pixelpal-confetti {
  0%   { transform: translateY(0) rotate(0deg); opacity: 1; }
  100% { transform: translateY(-60px) rotate(360deg); opacity: 0; }
}
.onb-confetti {
  position: absolute;
  width: 6px; height: 6px;
  border-radius: 1px;
  animation: pixelpal-confetti 1.2s ease-out forwards;
  pointer-events: none;
}
`;

// ----------------------------------------------------------------
// OnboardingSystem
// ----------------------------------------------------------------

export class OnboardingSystem {
  // DOM references
  private overlay: HTMLElement;
  private card: HTMLElement;
  private progressBar: HTMLElement;
  private titleEl: HTMLElement;
  private descEl: HTMLElement;
  private inputEl: HTMLInputElement;
  private btnEl: HTMLElement;
  private skipBtn: HTMLElement;

  // State
  private step: OnboardingStep = 'hatch';
  private petName: string = '';
  private onComplete: (name: string) => void;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private typewriterTimer: ReturnType<typeof setTimeout> | null = null;
  private cssInjected: boolean = false;

  // Bound handlers (for removal)
  private boundBtnClick: () => void;
  private boundInputKeydown: (e: KeyboardEvent) => void;
  private boundSkipClick: () => void;

  constructor(onComplete: (name: string) => void) {
    this.overlay     = document.getElementById('onboarding-overlay')!;
    this.card        = document.getElementById('onboarding-card')!;
    this.progressBar = document.getElementById('onb-progress')!;
    this.titleEl     = document.getElementById('onb-title')!;
    this.descEl      = document.getElementById('onb-desc')!;
    this.inputEl     = document.getElementById('onb-input') as HTMLInputElement;
    this.btnEl       = document.getElementById('onb-btn')!;
    this.skipBtn     = document.getElementById('onb-skip')!;
    this.onComplete  = onComplete;

    this.boundBtnClick     = () => this.handleButtonClick();
    this.boundInputKeydown = (e: KeyboardEvent) => this.handleInputKeydown(e);
    this.boundSkipClick    = () => this.complete();
  }

  // ------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------

  /** Show the overlay and begin the onboarding flow. */
  start(): void {
    this.injectCSS();
    this.overlay.classList.add('active');
    this.card.classList.add('step-enter');

    // Make the window interactive so input fields and buttons work
    try { window.pixelpal.onboardingStart(); } catch {}

    this.btnEl.addEventListener('click', this.boundBtnClick);
    this.inputEl.addEventListener('keydown', this.boundInputKeydown);
    this.skipBtn.addEventListener('click', this.boundSkipClick);

    this.stepTo('hatch');
  }

  /** Clean up all DOM modifications, timers, and listeners. */
  teardown(): void {
    this.clearAllTimers();
    this.overlay.classList.remove('active');
    this.card.classList.remove('step-enter');
    this.removeEgg();
    this.removeConfetti();

    // Restore default click-through passthrough
    try { window.pixelpal.onboardingEnd(); } catch {}

    this.btnEl.removeEventListener('click', this.boundBtnClick);
    this.inputEl.removeEventListener('keydown', this.boundInputKeydown);
    this.skipBtn.removeEventListener('click', this.boundSkipClick);
  }

  // ------------------------------------------------------------------
  // Step orchestration
  // ------------------------------------------------------------------

  /** Transition to a new step, updating progress and content. */
  private stepTo(step: OnboardingStep): void {
    this.step = step;

    // Progress bar
    this.progressBar.style.width = `${STEP_PROGRESS[step]}%`;

    // Remove previous dynamic content
    this.removeEgg();
    this.removeConfetti();

    // Fade-in class on card content
    const contentWrapper = this.card;
    contentWrapper.classList.remove('step-enter');
    // Force reflow to restart animation
    void contentWrapper.offsetWidth;
    contentWrapper.classList.add('step-enter');

    switch (step) {
      case 'hatch':    this.runHatchStep();    break;
      case 'name':     this.runNameStep();     break;
      case 'feed':     this.runFeedStep();     break;
      case 'pet':      this.runPetStep();      break;
      case 'complete': this.runCompleteStep(); break;
    }
  }

  /** Advance to the next step in sequence. */
  private advanceStep(): void {
    const order: OnboardingStep[] = ['hatch', 'name', 'feed', 'pet', 'complete'];
    const idx = order.indexOf(this.step);
    if (idx < order.length - 1) {
      this.stepTo(order[idx + 1]);
    }
  }

  // ------------------------------------------------------------------
  // Step implementations
  // ------------------------------------------------------------------

  /** Step 1: A pixel egg appears and hatches. */
  private runHatchStep(): void {
    this.setInputVisible(false);
    this.setBtnVisible(false);

    this.titleEl.textContent = '';
    this.descEl.textContent  = '';

    // Create the egg element
    const egg = document.createElement('div');
    egg.className = 'onb-egg';
    egg.id = 'onb-egg';
    this.card.insertBefore(egg, this.inputEl);

    // Typewriter title
    this.addTimer(() => {
      this.typewrite(this.titleEl, '\u4E00\u9897\u50CF\u7D20\u86CB\u51FA\u73B0\u4E86\u2026', 70);
    }, 300);

    // Start wobbling
    this.addTimer(() => {
      egg.classList.add('wobble');
    }, EGG_APPEAR_MS);

    // Show cracks
    this.addTimer(() => {
      const cracks = document.createElement('div');
      cracks.className = 'onb-egg-cracks';
      cracks.innerHTML =
        '<div class="crack crack-1"></div>' +
        '<div class="crack crack-2"></div>' +
        '<div class="crack crack-3"></div>';
      egg.appendChild(cracks);
    }, EGG_APPEAR_MS + 700);

    // Burst + advance
    this.addTimer(() => {
      egg.classList.remove('wobble');
      egg.classList.add('burst');
      this.addTimer(() => this.advanceStep(), HATCH_TO_NAME_MS);
    }, EGG_APPEAR_MS + EGG_HATCH_MS);
  }

  /** Step 2: Name the pet. */
  private runNameStep(): void {
    this.setInputVisible(true);
    this.setBtnVisible(true);
    this.setBtnText('\u786E\u5B9A');    // 确定
    this.inputEl.value = '';
    this.inputEl.placeholder = '\u8F93\u5165\u540D\u5B57\u2026';  // 输入名字...

    this.typewrite(
      this.titleEl,
      '\u4E00\u53EA\u5C0F\u751F\u7269\u7834\u58F3\u800C\u51FA\uFF01',  // 一只小生物破壳而出！
      TYPE_SPEED_MS,
    );

    this.addTimer(() => {
      this.typewrite(
        this.descEl,
        '\u5B83\u7741\u5927\u773C\u775B\u770B\u7740\u4F60\u3002\u7ED9\u5B83\u8D77\u4E2A\u540D\u5B57\u5427\uFF1F',
        // 它睁大眼睛看着你。给它起个名字吧？
        TYPE_SPEED_MS,
      );
    }, 600);

    this.addTimer(() => this.inputEl.focus(), 1200);
  }

  /** Step 3: First feeding (auto-narrative). */
  private runFeedStep(): void {
    this.setInputVisible(false);
    this.setBtnVisible(false);

    this.typewrite(
      this.titleEl,
      '\u5B83\u770B\u8D77\u6765\u597D\u997F\u2026',   // 它看起来好饿...
      TYPE_SPEED_MS,
    );

    this.addTimer(() => {
      this.typewrite(
        this.descEl,
        '\u7B2C\u4E00\u6B21\u5582\u98DF\u5B83\u5427\uFF01',  // 第一次喂食它吧！
        TYPE_SPEED_MS,
      );
    }, 400);

    // Auto-play feeding animation
    this.addTimer(() => {
      this.descEl.textContent =
        '\u{1F356} \u554A\u5475\u554A\u5475\u2026 \u597D\u5403\uFF01';
      // 🍖 啊呜啊呜... 好吃！
    }, 2800);

    // Auto-advance
    this.addTimer(() => this.advanceStep(), 5000);
  }

  /** Step 4: First head-pet (auto-narrative). */
  private runPetStep(): void {
    this.setInputVisible(false);
    this.setBtnVisible(false);

    this.typewrite(
      this.titleEl,
      '\u8BD5\u8BD5\u6478\u6478\u5B83\u7684\u5934\uFF1F',  // 试试摸摸它的头？
      TYPE_SPEED_MS,
    );

    this.addTimer(() => {
      this.typewrite(
        this.descEl,
        '\u8F7B\u8F7B\u70B9\u54E6\uFF0C\u5B83\u4F1A\u5F88\u5F00\u5FC3\u7684\uFF01',  // 轻轻的，它会很开心的！
        TYPE_SPEED_MS,
      );
    }, 400);

    // Auto-play petting animation
    this.addTimer(() => {
      this.descEl.textContent =
        '\u2764\uFE0F \u563F\u563F\uFF0C\u597D\u8212\u670D\u2026';
      // ❤️ 嘻嘻，好舒服...
    }, 2800);

    // Auto-advance
    this.addTimer(() => this.advanceStep(), 5000);
  }

  /** Step 5: Celebration and close. */
  private runCompleteStep(): void {
    this.setInputVisible(false);
    this.setBtnVisible(false);

    const displayName = this.petName || '\u5C0F\u6A58';  // 小橘

    this.typewrite(
      this.titleEl,
      '\u4F60\u4EEC\u7684\u6545\u4E8B\u5F00\u59CB\u4E86\uFF01',  // 你们的故事开始了！
      TYPE_SPEED_MS,
    );

    this.addTimer(() => {
      this.typewrite(
        this.descEl,
        `\u597D\u597D\u7167\u987E${displayName}\u5427\uFF01`,  // 好好照顾{name}吧！
        TYPE_SPEED_MS,
      );
    }, 500);

    // Spawn CSS confetti
    this.addTimer(() => this.spawnConfetti(), 300);

    // Auto-close
    this.addTimer(() => this.complete(), COMPLETE_CLOSE_MS);
  }

  // ------------------------------------------------------------------
  // Event handlers
  // ------------------------------------------------------------------

  private handleButtonClick(): void {
    if (this.step === 'name') {
      this.handleNameSubmit();
    }
  }

  private handleInputKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter' && this.step === 'name') {
      this.handleNameSubmit();
    }
  }

  // ------------------------------------------------------------------
  // Step-specific logic
  // ------------------------------------------------------------------

  /** Validate and save the chosen name, then advance. */
  private handleNameSubmit(): void {
    const raw = this.inputEl.value.trim();

    if (raw.length === 0) {
      this.petName = '\u5C0F\u6A58';  // default: 小橘
    } else if (raw.length > 12) {
      this.petName = raw.substring(0, 12);
    } else {
      this.petName = raw;
    }

    this.advanceStep();
  }

  /** Show a brief feeding animation in the card, then auto-advance. */
  private showFeedReaction(): void {
    this.setBtnEnabled(false);

    this.descEl.textContent =
      '\u{1F356} \u554A\u5475\u554A\u5475\u2026 \u597D\u5403\uFF01';
    // 🍖 啊呜啊呜... 好吃！

    this.addTimer(() => this.advanceStep(), AUTO_ADVANCE_MS);
  }

  /** Show a brief petting reaction in the card, then auto-advance. */
  private showPetReaction(): void {
    this.setBtnEnabled(false);

    this.descEl.textContent =
      '\u2764\uFE0F \u563F\u563F\uFF0C\u597D\u8212\u670D\u2026';
    // ❤️ 嘻嘻，好舒服...

    this.addTimer(() => this.advanceStep(), AUTO_ADVANCE_MS);
  }

  /** Close the overlay and invoke the completion callback. */
  private complete(): void {
    this.overlay.classList.remove('active');
    // Restore default click-through passthrough
    try { window.pixelpal.onboardingEnd(); } catch {}
    this.onComplete(this.petName || '\u5C0F\u6A58');
  }

  // ------------------------------------------------------------------
  // Typewriter effect
  // ------------------------------------------------------------------

  /**
   * Reveal `text` one character at a time inside `element`.
   * A blinking cursor is appended during typing and removed when done.
   */
  private typewrite(
    element: HTMLElement,
    text: string,
    speed: number = TYPE_SPEED_MS,
    onDone?: () => void,
  ): void {
    // Cancel any in-progress typewriter
    if (this.typewriterTimer !== null) {
      clearTimeout(this.typewriterTimer);
      this.typewriterTimer = null;
    }

    element.textContent = '';

    // Create cursor
    const cursor = document.createElement('span');
    cursor.className = 'typewriter-cursor';
    element.appendChild(cursor);

    let i = 0;

    const tick = () => {
      if (i < text.length) {
        // Insert character before the cursor
        element.insertBefore(
          document.createTextNode(text.charAt(i)),
          cursor,
        );
        i++;
        this.typewriterTimer = setTimeout(tick, speed);
      } else {
        // Remove cursor after a short pause
        this.addTimer(() => {
          if (cursor.parentNode) cursor.remove();
        }, 600);
        this.typewriterTimer = null;
        onDone?.();
      }
    };

    tick();
  }

  // ------------------------------------------------------------------
  // Visual helpers
  // ------------------------------------------------------------------

  /** Show / hide the name input field. */
  private setInputVisible(visible: boolean): void {
    this.inputEl.style.display = visible ? 'block' : 'none';
  }

  /** Show / hide the action button. */
  private setBtnVisible(visible: boolean): void {
    this.btnEl.style.display = visible ? 'inline-block' : 'none';
  }

  /** Update the button label. */
  private setBtnText(text: string): void {
    this.btnEl.textContent = text;
  }

  /** Enable / disable the action button. */
  private setBtnEnabled(enabled: boolean): void {
    (this.btnEl as HTMLButtonElement).disabled = !enabled;
    this.btnEl.style.opacity = enabled ? '1' : '0.5';
    this.btnEl.style.pointerEvents = enabled ? 'auto' : 'none';
  }

  /** Remove the dynamically-created egg element if present. */
  private removeEgg(): void {
    const egg = this.card.querySelector('.onb-egg');
    if (egg) egg.remove();
  }

  /** Spawn CSS-only confetti inside the card for the completion step. */
  private spawnConfetti(): void {
    const colors = ['#FFD700', '#FF6B8A', '#5BBCDE', '#6BCB77', '#F5A623', '#FF9999'];
    for (let i = 0; i < 18; i++) {
      const dot = document.createElement('div');
      dot.className = 'onb-confetti';
      dot.style.background = colors[i % colors.length];
      dot.style.left = `${10 + Math.random() * 80}%`;
      dot.style.bottom = '10%';
      dot.style.animationDelay = `${Math.random() * 0.5}s`;
      dot.style.animationDuration = `${0.8 + Math.random() * 0.8}s`;
      this.card.appendChild(dot);
    }
  }

  /** Remove all confetti elements. */
  private removeConfetti(): void {
    this.card.querySelectorAll('.onb-confetti').forEach(el => el.remove());
  }

  // ------------------------------------------------------------------
  // Timer management
  // ------------------------------------------------------------------

  /** Register a timer so it can be cleaned up on teardown. */
  private addTimer(fn: () => void, delayMs: number): void {
    const id = setTimeout(() => {
      // Remove from tracking array
      const idx = this.timers.indexOf(id);
      if (idx !== -1) this.timers.splice(idx, 1);
      fn();
    }, delayMs);
    this.timers.push(id);
  }

  /** Cancel every outstanding timer. */
  private clearAllTimers(): void {
    for (const id of this.timers) clearTimeout(id);
    this.timers = [];
    if (this.typewriterTimer !== null) {
      clearTimeout(this.typewriterTimer);
      this.typewriterTimer = null;
    }
  }

  // ------------------------------------------------------------------
  // CSS injection (once)
  // ------------------------------------------------------------------

  private injectCSS(): void {
    if (this.cssInjected) return;
    const style = document.createElement('style');
    style.textContent = ONBOARDING_CSS;
    document.head.appendChild(style);
    this.cssInjected = true;
  }
}
