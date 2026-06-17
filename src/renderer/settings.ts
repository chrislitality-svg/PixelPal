// ============================================================
// PixelPal -- Settings Page Entry Point
// ============================================================
//
// Runs inside settings.html.  Pure configuration interface:
//   1. General settings (auto-start, power-save, sound, bubble)
//   2. Optional LLM configuration
//   3. Save and Reset buttons
//
// Pet status (radar chart, needs bars, profile) lives in its
// own dedicated status card — see status.ts / status.html.
//
// All data flows through the window.pixelpal preload API.
// ============================================================

import type {
  PetEntity,
  AppSettings,
  LLMConfig,
} from '../shared/types';

// ============================================================
// Module state
// ============================================================

let currentPet: PetEntity | null = null;
let currentSettings: AppSettings | null = null;

// ============================================================
// Bootstrap
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  initSettings().catch(err => {
    console.error('[PixelPal Settings] Init error:', err);
  });
});

// ============================================================
// Initialisation
// ============================================================

async function initSettings(): Promise<void> {
  const [settings, pet] = await Promise.all([
    window.pixelpal.getSettings().catch(() => null),
    window.pixelpal.loadPet().catch(() => null),
  ]);

  currentSettings = settings as AppSettings | null;
  currentPet = pet as PetEntity | null;

  populateSettingsForm();
  wireProviderChangeHandler();
  wireSaveButton();
  wireResetButton();
  wireToolsSection();
}

// ============================================================
// Settings form population
// ============================================================

function populateSettingsForm(): void {
  if (!currentSettings) return;

  setCheckbox('auto-start',    currentSettings.autoStart);
  setCheckbox('power-save',    currentSettings.powerSave);
  setCheckbox('sound-enabled', currentSettings.soundEnabled);
  setRange('bubble-freq',      currentSettings.bubbleFrequency);
  setRange('sound-volume',     currentSettings.soundVolume ?? 70);
  setCheckbox('sfx-interaction', currentSettings.sfxInteraction ?? true);
  setCheckbox('sfx-reward',      currentSettings.sfxReward ?? true);
  setCheckbox('sfx-ambient',     currentSettings.sfxAmbient ?? true);

  // Behaviour controls
  setCheckbox('roam',            currentSettings.roam ?? true);
  setSelect('mischief-level',    currentSettings.mischiefLevel ?? 'low');
  setSelect('joke-level',        currentSettings.jokeLevel ?? 'medium');
  setCheckbox('weather-enabled', currentSettings.weatherEnabled ?? true);
  setCheckbox('focus-mode',      currentSettings.focusMode ?? false);

  if (currentPet?.llmConfig) {
    setCheckbox('llm-enabled', currentPet.llmConfig.enabled);
    setSelect('llm-provider',  currentPet.llmConfig.provider);
    setInput('llm-url',        currentPet.llmConfig.baseUrl);
    setInput('llm-key',        currentPet.llmConfig.apiKeyEncrypted);
    setInput('llm-model',      currentPet.llmConfig.model);
    setRange('monologue-freq', currentPet.llmConfig.monologueFrequency);
  }

  updateLLMStatusDisplay();
}

// ============================================================
// LLM provider change handler & status display
// ============================================================

function wireProviderChangeHandler(): void {
  const providerEl = document.getElementById('llm-provider') as HTMLSelectElement | null;
  if (!providerEl) return;

  providerEl.addEventListener('change', () => {
    updateLLMStatusDisplay();
  });
}

function updateLLMStatusDisplay(): void {
  const provider = getSelectValue('llm-provider');
  const statusBox = document.getElementById('llm-status');
  const statusText = document.getElementById('llm-status-text');
  const progressWrap = document.getElementById('llm-download-progress');
  if (!statusBox || !statusText) return;

  if (provider === 'builtin') {
    statusBox.style.display = '';
    const downloaded = currentPet?.llmConfig?.modelDownloaded ?? false;
    statusText.textContent = downloaded
      ? '模型状态：已下载'
      : '模型状态：尚未下载，首次启用时将自动下载';
    if (progressWrap) {
      progressWrap.style.display = downloaded ? 'none' : '';
    }
  } else if (provider === 'ollama') {
    statusBox.style.display = '';
    statusText.textContent = '将自动检测 localhost:11434 的 ollama 服务';
    if (progressWrap) progressWrap.style.display = 'none';
  } else {
    statusBox.style.display = 'none';
  }
}

// ============================================================
// Save button
// ============================================================

function wireSaveButton(): void {
  const btn = document.getElementById('save-btn');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    const settings: Partial<AppSettings> & { llmConfig?: Partial<LLMConfig> } = {
      autoStart:       getCheckbox('auto-start'),
      powerSave:       getCheckbox('power-save'),
      soundEnabled:    getCheckbox('sound-enabled'),
      soundVolume:     getRange('sound-volume'),
      sfxInteraction:  getCheckbox('sfx-interaction'),
      sfxReward:       getCheckbox('sfx-reward'),
      sfxAmbient:      getCheckbox('sfx-ambient'),
      bubbleFrequency: getRange('bubble-freq'),
      focusMode:       currentSettings?.focusMode ?? false,
      roam:            getCheckbox('roam'),
      mischiefLevel:   (getSelectValue('mischief-level') || 'low') as AppSettings['mischiefLevel'],
      jokeLevel:       (getSelectValue('joke-level') || 'medium') as AppSettings['jokeLevel'],
      weatherEnabled:  getCheckbox('weather-enabled'),
    };

    const llmConfig: Partial<LLMConfig> = {
      enabled:            getCheckbox('llm-enabled'),
      provider:           (getSelectValue('llm-provider') || 'builtin') as LLMConfig['provider'],
      baseUrl:            getInput('llm-url'),
      apiKeyEncrypted:    getInput('llm-key'),
      model:              getInput('llm-model'),
      monologueFrequency: getRange('monologue-freq'),
      replyStyle:         currentPet?.llmConfig?.replyStyle ?? '',
    };
    settings.llmConfig = llmConfig;

    try {
      const updated = await window.pixelpal.setSettings(settings);
      currentSettings = updated;

      const originalText = btn.textContent;
      btn.textContent = '已保存';
      (btn as HTMLButtonElement).disabled = true;

      setTimeout(() => {
        btn.textContent = originalText;
        (btn as HTMLButtonElement).disabled = false;
      }, 1500);
    } catch (err) {
      console.error('[PixelPal Settings] Save failed:', err);
      btn.textContent = '保存失败';
      setTimeout(() => {
        btn.textContent = '保存';
      }, 2000);
    }
  });
}

// ============================================================
// Reset button
// ============================================================

function wireResetButton(): void {
  const btn = document.getElementById('reset-btn');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    const confirmed = window.confirm(
      '要把它放归大自然吗？🍃\n它会带着和你的回忆，去追寻属于自己的梦想~\n（这一只是和本机绑定的，放归后就不会再回来咯）',
    );
    if (!confirmed) return;
    if (!currentPet) return;

    const adopt = window.confirm(
      '要再领养一只新的小伙伴吗？\n\n点「确定」：现在就挑选一颗新的蛋\n点「取消」：先退出程序，下次打开再挑~',
    );

    try {
      if (adopt) {
        // killPet deletes the pet AND advances the incarnation so the
        // next blind box yields a new (still machine-bound) creature.
        await window.pixelpal.killPet(currentPet.id);
        btn.textContent = '已送它去追梦 🍃';
        (btn as HTMLButtonElement).disabled = true;
        setTimeout(() => window.close(), 800);
      } else {
        // Release and quit; next launch shows a fresh egg.
        await window.pixelpal.releaseAndQuit(currentPet.id);
      }
    } catch (err) {
      console.error('[PixelPal Settings] Release failed:', err);
      btn.textContent = '操作失败';
      setTimeout(() => {
        btn.textContent = '🍃 放归大自然';
      }, 2000);
    }
  });
}

// ============================================================
// Tools section (focus mode + record/screenshot)
// ============================================================

function wireToolsSection(): void {
  const focus = document.getElementById('focus-mode') as HTMLInputElement | null;
  if (focus) {
    focus.addEventListener('change', () => {
      const on = focus.checked;
      window.pixelpal.setFocusMode(on).catch(() => {});
      if (currentSettings) currentSettings.focusMode = on;
    });
  }

  const recordBtn = document.getElementById('record-btn');
  recordBtn?.addEventListener('click', () => {
    window.pixelpal.triggerPetAction('record').catch(() => {});
    flashButton(recordBtn as HTMLButtonElement, '录制中…');
  });

  const shotBtn = document.getElementById('shot-btn');
  shotBtn?.addEventListener('click', () => {
    window.pixelpal.triggerPetAction('screenshot').catch(() => {});
    flashButton(shotBtn as HTMLButtonElement, '已截图!');
  });
}

function flashButton(btn: HTMLButtonElement, text: string): void {
  const original = btn.textContent;
  btn.textContent = text;
  btn.disabled = true;
  setTimeout(() => {
    btn.textContent = original;
    btn.disabled = false;
  }, 1800);
}

// ============================================================
// DOM helpers
// ============================================================

function setCheckbox(id: string, checked: boolean): void {
  const el = document.getElementById(id) as HTMLInputElement | null;
  if (el) el.checked = checked;
}

function getCheckbox(id: string): boolean {
  const el = document.getElementById(id) as HTMLInputElement | null;
  return el ? el.checked : false;
}

function setRange(id: string, value: number): void {
  const el = document.getElementById(id) as HTMLInputElement | null;
  if (el) el.value = String(value);
}

function getRange(id: string): number {
  const el = document.getElementById(id) as HTMLInputElement | null;
  return el ? Number(el.value) : 5;
}

function setSelect(id: string, value: string): void {
  const el = document.getElementById(id) as HTMLSelectElement | null;
  if (el) el.value = value;
}

function getSelectValue(id: string): string {
  const el = document.getElementById(id) as HTMLSelectElement | null;
  return el ? el.value : '';
}

function setInput(id: string, value: string): void {
  const el = document.getElementById(id) as HTMLInputElement | null;
  if (el) el.value = value;
}

function getInput(id: string): string {
  const el = document.getElementById(id) as HTMLInputElement | null;
  return el ? el.value : '';
}
