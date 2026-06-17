// ============================================================
// PixelPal — Sound effects (Web Audio, fully synthesised)
// ============================================================
// Cute blips/chimes generated with oscillators — NO audio files,
// so nothing to bundle and nothing to break in packaging.  Every
// sound respects the global "音效" (soundEnabled) setting.
//
// Browsers start an AudioContext suspended until a user gesture, so
// resume() is called on the first interaction and lazily before any
// sound; action-triggered sounds (click/feed) always work, and after
// the first gesture passive sounds (coins/level-up) work too.
// ============================================================

type SoundName =
  | 'pet' | 'click' | 'poke' | 'feed' | 'coin'
  | 'levelup' | 'evolution' | 'achievement' | 'poop'
  | 'work-start' | 'work-return' | 'sneaky' | 'joke' | 'weather';

type OscType = 'sine' | 'square' | 'triangle' | 'sawtooth';
type SoundCategory = 'interaction' | 'reward' | 'ambient';

// Which category each sound belongs to (for per-category toggles).
const SOUND_CATEGORY: Record<SoundName, SoundCategory> = {
  pet: 'interaction', click: 'interaction', poke: 'interaction', feed: 'interaction',
  coin: 'reward', levelup: 'reward', evolution: 'reward', achievement: 'reward',
  'work-start': 'reward', 'work-return': 'reward',
  poop: 'ambient', sneaky: 'ambient', joke: 'ambient', weather: 'ambient',
};

class SoundManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private enabled = true;
  private volume = 0.7; // 0..1 (user master volume)
  private categories: Record<SoundCategory, boolean> = {
    interaction: true, reward: true, ambient: true,
  };

  setEnabled(on: boolean): void {
    this.enabled = on;
  }

  /** Set master volume from a 0..100 slider value. */
  setVolume(pct: number): void {
    this.volume = Math.max(0, Math.min(1, pct / 100));
    if (this.master) this.master.gain.value = 0.22 * this.volume;
  }

  setCategory(cat: SoundCategory, on: boolean): void {
    this.categories[cat] = on;
  }

  /** Resume the audio context (call on a user gesture). */
  resume(): void {
    this.ensure();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => { /* ignore */ });
    }
  }

  private ensure(): void {
    if (this.ctx) return;
    try {
      const AC: typeof AudioContext =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.22 * this.volume;
      this.master.connect(this.ctx.destination);
    } catch {
      this.ctx = null;
    }
  }

  /** Schedule one enveloped tone. `start`/`dur` in seconds (relative). */
  private tone(freq: number, start: number, dur: number, type: OscType = 'sine', peak = 1): void {
    if (!this.ctx || !this.master) return;
    const t0 = this.ctx.currentTime + start;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.01, peak), t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  play(name: SoundName): void {
    if (!this.enabled) return;
    if (!this.categories[SOUND_CATEGORY[name]]) return;
    this.ensure();
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});

    switch (name) {
      case 'pet':
        this.tone(880, 0, 0.12, 'sine', 0.8);
        this.tone(1320, 0.06, 0.12, 'sine', 0.5);
        break;
      case 'click':
        this.tone(660, 0, 0.07, 'square', 0.4);
        break;
      case 'poke':
        this.tone(220, 0, 0.12, 'sawtooth', 0.5);
        break;
      case 'feed': // nom nom
        this.tone(330, 0, 0.08, 'square', 0.5);
        this.tone(392, 0.09, 0.08, 'square', 0.5);
        break;
      case 'coin': // classic two-note coin ding (B5 → E6)
        this.tone(988, 0, 0.08, 'square', 0.6);
        this.tone(1319, 0.07, 0.18, 'square', 0.6);
        break;
      case 'levelup': // ascending C-E-G-C
        [523, 659, 784, 1047].forEach((f, i) => this.tone(f, i * 0.09, 0.16, 'square', 0.6));
        break;
      case 'evolution': // big fanfare + sparkle
        [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, i * 0.1, 0.22, 'triangle', 0.6));
        this.tone(1568, 0.55, 0.5, 'sine', 0.5);
        break;
      case 'achievement': // triumphant fanfare
        [523, 659, 784, 1047].forEach((f, i) => this.tone(f, i * 0.1, 0.2, 'triangle', 0.6));
        this.tone(1319, 0.42, 0.5, 'triangle', 0.7); // big final note
        this.tone(1047, 0.42, 0.5, 'sine', 0.3);     // harmony under it
        break;
      case 'poop': // silly low plop
        this.tone(170, 0, 0.16, 'sawtooth', 0.5);
        this.tone(110, 0.12, 0.18, 'sawtooth', 0.4);
        break;
      case 'work-start': // cheerful off-to-work
        [392, 523, 659].forEach((f, i) => this.tone(f, i * 0.08, 0.14, 'sine', 0.5));
        break;
      case 'work-return': // welcome-home jingle
        [659, 523, 659, 880].forEach((f, i) => this.tone(f, i * 0.09, 0.16, 'triangle', 0.6));
        break;
      case 'sneaky': // mischievous
        this.tone(440, 0, 0.1, 'sine', 0.4);
        this.tone(370, 0.1, 0.14, 'sine', 0.4);
        break;
      case 'joke': // little "ba-dum" wah-wah
        this.tone(330, 0, 0.12, 'triangle', 0.5);
        this.tone(294, 0.13, 0.2, 'triangle', 0.5);
        break;
      case 'weather':
        this.tone(659, 0, 0.12, 'sine', 0.4);
        this.tone(880, 0.1, 0.18, 'sine', 0.4);
        break;
    }
  }
}

export const sound = new SoundManager();
