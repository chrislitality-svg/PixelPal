// ============================================================
// PixelPal -- Pet Status Card Entry Point
// ============================================================
//
// Runs inside status.html.  A warm, immersive page that shows
// everything about the pet — and nothing about settings/config.
//
// This page is opened from the pet's context menu "📊 状态" item.
// It provides:
//   1. Pet profile (name, breed, level, personality, bonding)
//   2. Six-attribute radar chart (六维雷达图)
//   3. Four-dimensional needs bars
//   4. Current mood indicator
//
// All data flows through the window.pixelpal preload API.
// ============================================================

import type {
  PetEntity,
  PetAttributes,
  PetNeeds,
  AppSettings,
  MachineSeedInfo,
  Wallet,
} from '../shared/types';
import { ATTRIBUTE_MAX, SPECIES_LABELS, BREED_REGISTRY } from '../shared/constants';
import { getPersonalityDescription } from './pet/attributes';

// Module state shared across render + generation handlers.
let statusSettings: AppSettings | null = null;
let statusSeed: MachineSeedInfo | null = null;
let statusPet: PetEntity | null = null;
let statusWallet: Wallet | null = null;

const SPECIES_EMOJI: Record<string, string> = {
  cat: '🐱', dog: '🐶', rabbit: '🐰', sheep: '🐑', cow: '🐮',
  rodent: '🐹', bird: '🐤', fox: '🦊', deer: '🦌', panda: '🐼', dragon: '🐲',
};

// ============================================================
// Constants for the radar chart
// ============================================================

const RADAR_CANVAS_SIZE = 220;
const RADAR_CENTER = RADAR_CANVAS_SIZE / 2;
const RADAR_RADIUS = 78;
const RADAR_AXIS_COUNT = 6;

const ATTR_LABELS: Array<{ key: keyof PetAttributes; label: string }> = [
  { key: 'strength',  label: '力量' },
  { key: 'agility',   label: '敏捷' },
  { key: 'appetite',  label: '食欲' },
  { key: 'playful',   label: '贪玩' },
  { key: 'hygiene',   label: '洁癖' },
  { key: 'wisdom',    label: '智慧' },
];

// ============================================================
// Mood helpers
// ============================================================

const MOOD_MAP: Record<string, { icon: string; label: string }> = {
  happy:   { icon: '\u{1F60A}', label: '心情很好' },
  neutral: { icon: '\u{1F610}', label: '平静' },
  sad:     { icon: '\u{1F622}', label: '有点难过' },
  hungry:  { icon: '\u{1F60B}', label: '肚子饿了' },
  sleepy:  { icon: '\u{1F634}', label: '昏昏欲睡' },
  dirty:   { icon: '\u{1F625}', label: '需要洗澡' },
};

/**
 * A short personality tag derived from the pet's evolving temperament
 * (affection / boldness) plus its most prominent attribute.
 */
function temperamentTag(pet: PetEntity): string {
  const aff = pet.bonding.affection ?? 50;
  const bold = pet.bonding.boldness ?? 50;
  const a = pet.attributes;
  const parts: string[] = [];

  if (aff >= 75) parts.push('🥰 黏人精');
  else if (aff <= 30) parts.push('😌 高冷独立');

  if (bold <= 30) parts.push('😣 胆小怕生');
  else if (bold >= 78) parts.push('😎 天不怕地不怕');

  if (a.playful >= 70) parts.push('活泼好动');
  else if (a.wisdom >= 70) parts.push('聪明伶俐');
  else if (a.appetite >= 70) parts.push('小吃货');
  else if (a.hygiene >= 70) parts.push('爱干净');

  if (parts.length === 0) parts.push('🙂 温和好相处');
  return parts.join(' · ');
}

function computeMood(needs: PetNeeds): string {
  if (needs.happiness > 70 && needs.hunger < 50) return 'happy';
  if (needs.hunger > 70) return 'hungry';
  if (needs.energy < 30) return 'sleepy';
  if (needs.cleanliness < 30) return 'dirty';
  if (needs.happiness < 30) return 'sad';
  return 'neutral';
}

// ============================================================
// Bootstrap
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  initStatusCard().catch(err => {
    console.error('[PixelPal Status] Init error:', err);
  });
});

// ============================================================
// Initialisation
// ============================================================

async function initStatusCard(): Promise<void> {
  const [pet, settings, seed, wallet] = await Promise.all([
    window.pixelpal.loadPet().catch(() => null) as Promise<PetEntity | null>,
    window.pixelpal.getSettings().catch(() => null) as Promise<AppSettings | null>,
    window.pixelpal.getMachineSeed().catch(() => null) as Promise<MachineSeedInfo | null>,
    window.pixelpal.getWallet().catch(() => null) as Promise<Wallet | null>,
  ]);

  statusSettings = settings;
  statusSeed = seed;
  statusPet = pet;
  statusWallet = wallet;

  // Keep the coin balance live if it changes while the card is open.
  window.pixelpal.onWalletChanged((w: Wallet) => {
    statusWallet = w;
    const el = document.getElementById('coin-value');
    if (el) el.textContent = `${w.coins} 爱心币`;
  });

  // Apply a generated background, if the user made one.
  if (settings?.generatedBg) {
    document.body.style.backgroundImage = `url("${settings.generatedBg}")`;
    document.body.classList.add('has-bg');
  }

  const container = document.getElementById('status-content');
  if (!container) return;

  if (!pet) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">\u{1F423}</div>
        <div>还没有宠物呢...</div>
        <div>回到桌面和它打个招呼吧</div>
      </div>
    `;
    return;
  }

  renderStatusCard(container, pet);
}

// ============================================================
// Render the full status card
// ============================================================

function renderStatusCard(container: HTMLElement, pet: PetEntity): void {
  const personality = getPersonalityDescription(pet.attributes);
  const daysSinceFirstMet = Math.max(
    1,
    Math.floor((Date.now() - pet.bonding.firstMetAt) / 86_400_000),
  );
  const breedStr = breedLabel(pet);
  const mood = computeMood(pet.needs);
  const moodInfo = MOOD_MAP[mood] || MOOD_MAP.neutral;

  const avatarSrc = statusSettings?.generatedAvatar || '';
  const speciesEmoji = SPECIES_EMOJI[pet.species] || '🐾';
  const avatarStyle = avatarSrc ? `background-image:url("${avatarSrc}")` : '';
  const avatarInner = avatarSrc ? '' : speciesEmoji;

  container.innerHTML = `
    <!-- Header -->
    <div class="pet-header">
      <div class="pet-avatar" id="pet-avatar" style="${avatarStyle}">${avatarInner}</div>
      <div class="pet-name">${escapeHtml(pet.name)}</div>
      <div class="pet-subtitle">${escapeHtml(breedStr)}</div>
      <div class="temperament-chip">${escapeHtml(temperamentTag(pet))}</div>
    </div>

    <!-- Profile Section -->
    <div class="section">
      <div class="section-title"><span class="dot"></span>\u8EAB\u4EFD\u5361</div>
      <div class="profile-grid">
        <div class="profile-item">
          <span class="label">\u7B49\u7EA7</span>
          <span class="value">Lv.${pet.level} \u00B7 \u9636\u6BB5 ${pet.evolutionStage}</span>
        </div>
        <div class="profile-item">
          <span class="label">\u76F8\u4F34\u5929\u6570</span>
          <span class="value">${daysSinceFirstMet} \u5929</span>
        </div>
        <div class="profile-item">
          <span class="label">\u603B\u4E92\u52A8</span>
          <span class="value">${pet.bonding.totalInteractions} \u6B21</span>
        </div>
        <div class="profile-item">
          <span class="label">\u7231\u5FC3\u5E01</span>
          <span class="value" id="coin-value">\u{1FA99} ${statusWallet?.coins ?? 0}</span>
        </div>
        <div class="profile-item">
          <span class="label">\u5F53\u524D\u5FC3\u60C5</span>
          <span class="value">
            <span class="mood-badge">
              <span class="mood-icon">${moodInfo.icon}</span>
              ${moodInfo.label}
            </span>
          </span>
        </div>
        <div class="personality-row">\u201C${escapeHtml(personality)}\u201D</div>
        ${renderSeedBadge()}
      </div>
    </div>

    <!-- Radar Chart Section -->
    <div class="section">
      <div class="section-title"><span class="dot"></span>\u516D\u7EF4\u5C5E\u6027</div>
      <div class="radar-wrap">
        <canvas id="radar-canvas" width="${RADAR_CANVAS_SIZE}" height="${RADAR_CANVAS_SIZE}"></canvas>
      </div>
    </div>

    <!-- Needs Section -->
    <div class="section">
      <div class="section-title"><span class="dot"></span>\u72B6\u6001</div>
      ${renderNeedRow('hunger', '\u{1F356}', '\u9971\u98DF\u5EA6', pet.needs)}
      ${renderNeedRow('energy', '\u{26A1}', '\u7CBE\u529B', pet.needs)}
      ${renderNeedRow('happiness', '\u{1F497}', '\u5FC3\u60C5', pet.needs)}
      ${renderNeedRow('cleanliness', '\u{1F9FC}', '\u6E05\u6D01\u5EA6', pet.needs)}
    </div>

    ${renderMemoriesSection(pet)}

    <div class="card-footer">\u53EF\u7231\u5C0F\u5BA0\u7269 \u00B7 \u548C\u4F60\u4E00\u8D77\u7684\u70B9\u70B9\u6EF4\u6EF4</div>
  `;

  // Draw the radar chart after DOM is ready
  requestAnimationFrame(() => {
    drawRadarChart(pet.attributes);
  });
}

// ============================================================
// Memories (回忆录)
// ============================================================

function renderMemoriesSection(pet: PetEntity): string {
  const mems = [...(pet.bonding.memories || [])].reverse().slice(0, 8);
  const body = mems.length === 0
    ? `<div class="memory-empty">还没有特别的回忆…多陪陪我，一起创造美好瞬间吧~</div>`
    : mems.map((m) => `
        <div class="memory-row">
          <span class="memory-dot">🌸</span>
          <div>
            <div class="memory-desc">${escapeHtml(m.description)}</div>
            <div class="memory-time">${relTime(m.timestamp)}</div>
          </div>
        </div>`).join('');

  return `
    <div class="section">
      <div class="section-title"><span class="dot"></span>回忆录</div>
      ${body}
    </div>`;
}

/** Human-friendly relative time in Chinese. */
function relTime(ts: number): string {
  const diff = Date.now() - ts;
  const day = 86_400_000;
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < day) return `${Math.floor(diff / 3_600_000)} 小时前`;
  if (diff < 30 * day) return `${Math.floor(diff / day)} 天前`;
  const d = new Date(ts);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

// ============================================================
// Seed badge (machine-bound blind box)
// ============================================================

function renderSeedBadge(): string {
  if (!statusSeed) return '';
  const seedHex = (statusSeed.machineSeed >>> 0).toString(16).toUpperCase().padStart(8, '0');
  const nth = (statusSeed.incarnation ?? 0) + 1;
  return `
    <div class="seed-badge">
      🔒 本机专属 · 第 ${nth} 只<br>
      机器种子 <code>#${seedHex}</code>（决定它的性格、智商与脾气，永久绑定本机）
    </div>
  `;
}

// ============================================================
// Needs bar HTML
// ============================================================

function renderNeedRow(
  type: string,
  icon: string,
  label: string,
  needs: PetNeeds,
): string {
  let pct: number;
  let displayText: string;

  switch (type) {
    case 'hunger':
      pct = Math.round(100 - needs.hunger);
      displayText = `${Math.round(100 - needs.hunger)}%`;
      break;
    case 'energy':
      pct = Math.round(needs.energy);
      displayText = `${Math.round(needs.energy)}%`;
      break;
    case 'happiness':
      pct = Math.round(needs.happiness);
      displayText = `${Math.round(needs.happiness)}%`;
      break;
    case 'cleanliness':
      pct = Math.round(needs.cleanliness);
      displayText = `${Math.round(needs.cleanliness)}%`;
      break;
    default:
      pct = 0;
      displayText = '0%';
  }

  return `
    <div class="need-row need-${type}">
      <div class="need-label-row">
        <span class="need-name"><span class="icon">${icon}</span>${label}</span>
        <span class="need-val">${displayText}</span>
      </div>
      <div class="need-track">
        <div class="need-fill" style="width:${clamp(pct, 0, 100)}%"></div>
      </div>
    </div>
  `;
}

// ============================================================
// Six-attribute radar chart
// ============================================================

function drawRadarChart(attrs: PetAttributes): void {
  const canvas = document.getElementById('radar-canvas') as HTMLCanvasElement;
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const size = RADAR_CANVAS_SIZE;
  const cx = RADAR_CENTER;
  const cy = RADAR_CENTER;
  const R = RADAR_RADIUS;

  ctx.clearRect(0, 0, size, size);

  const axes = computeAxisEndpoints();

  // ---- 1. Grid hexagons ----
  const gridLevels = [0.25, 0.50, 0.75, 1.00];
  for (const pct of gridLevels) {
    ctx.beginPath();
    for (let i = 0; i < RADAR_AXIS_COUNT; i++) {
      const x = cx + axes[i].dx * R * pct;
      const y = cy + axes[i].dy * R * pct;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = pct === 1.0
      ? 'rgba(255,150,190,0.4)'
      : 'rgba(255,150,190,0.16)';
    ctx.lineWidth = pct === 1.0 ? 1.2 : 0.8;
    ctx.stroke();
  }

  // ---- 2. Spokes ----
  for (let i = 0; i < RADAR_AXIS_COUNT; i++) {
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + axes[i].dx * R, cy + axes[i].dy * R);
    ctx.strokeStyle = 'rgba(255,150,190,0.16)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }

  // ---- 3. Data polygon ----
  ctx.beginPath();
  for (let i = 0; i < RADAR_AXIS_COUNT; i++) {
    const key = ATTR_LABELS[i].key;
    const ratio = attrs[key] / ATTRIBUTE_MAX;
    const x = cx + axes[i].dx * R * ratio;
    const y = cy + axes[i].dy * R * ratio;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();

  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
  gradient.addColorStop(0, 'rgba(255,160,200,0.15)');
  gradient.addColorStop(1, 'rgba(255,110,168,0.4)');
  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.strokeStyle = 'rgba(255,110,168,0.85)';
  ctx.lineWidth = 1.8;
  ctx.stroke();

  // ---- 4. Data points ----
  for (let i = 0; i < RADAR_AXIS_COUNT; i++) {
    const key = ATTR_LABELS[i].key;
    const ratio = attrs[key] / ATTRIBUTE_MAX;
    const x = cx + axes[i].dx * R * ratio;
    const y = cy + axes[i].dy * R * ratio;

    ctx.beginPath();
    ctx.arc(x, y, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = '#FF6FA8';
    ctx.fill();
    ctx.strokeStyle = '#FFF6FB';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // ---- 5. Axis labels ----
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (let i = 0; i < RADAR_AXIS_COUNT; i++) {
    const key = ATTR_LABELS[i].key;
    const label = ATTR_LABELS[i].label;
    const value = attrs[key];

    const labelDist = R + 20;
    const lx = cx + axes[i].dx * labelDist;
    const ly = cy + axes[i].dy * labelDist;

    ctx.font = '700 11px "Comic Sans MS", "Microsoft YaHei", sans-serif';
    ctx.fillStyle = '#7A5468';
    ctx.fillText(label, lx, ly - 7);

    ctx.font = '10px "Courier New", monospace';
    ctx.fillStyle = '#D087A6';
    ctx.fillText(String(value), lx, ly + 7);
  }
}

function computeAxisEndpoints(): Array<{ dx: number; dy: number }> {
  const result: Array<{ dx: number; dy: number }> = [];
  const startAngle = -Math.PI / 2;
  const step = (2 * Math.PI) / RADAR_AXIS_COUNT;
  for (let i = 0; i < RADAR_AXIS_COUNT; i++) {
    const angle = startAngle + step * i;
    result.push({ dx: Math.cos(angle), dy: Math.sin(angle) });
  }
  return result;
}

// ============================================================
// Helpers
// ============================================================

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function breedLabel(pet: PetEntity): string {
  if (pet.breed) {
    const breedDef = BREED_REGISTRY.find(b => b.id === pet.breed);
    if (breedDef) {
      const speciesName = SPECIES_LABELS[breedDef.species] || breedDef.species;
      return `${breedDef.name} (${speciesName})`;
    }
  }
  return SPECIES_LABELS[pet.type as keyof typeof SPECIES_LABELS] || pet.type;
}
