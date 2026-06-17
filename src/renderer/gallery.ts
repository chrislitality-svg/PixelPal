// ============================================================
// PixelPal — Gallery window (achievements + 图鉴 collection)
// ============================================================
// Two tabs:
//   🏆 成就 — milestone achievements, locked/unlocked + reward.
//   📖 图鉴 — every breed; discovered ones are revealed, the rest
//             are silhouettes you unlock by hatching new pets.
// ============================================================

import type { PetEntity, PetSpecies } from '../shared/types';
import {
  MILESTONES,
  BREED_REGISTRY,
  SPECIES_LABELS,
  SPECIES_WEIGHTS,
} from '../shared/constants';
import { getRarityLabel, getRarityColor } from './pet/pet-pool';

let unlocked: Set<string> = new Set();
let discovered: Set<string> = new Set();

document.addEventListener('DOMContentLoaded', () => {
  init().catch((e) => console.error('[Gallery] init error:', e));
});

async function init(): Promise<void> {
  const [pet, collection] = await Promise.all([
    window.pixelpal.loadPet().catch(() => null) as Promise<PetEntity | null>,
    window.pixelpal.getCollection().catch(() => [] as string[]),
  ]);

  unlocked = new Set(pet?.bonding?.milestones || []);
  discovered = new Set(collection || []);

  renderAchievements();
  renderCollection();
  wireTabs();
}

function wireTabs(): void {
  const tabAch = document.getElementById('tab-ach')!;
  const tabDex = document.getElementById('tab-dex')!;
  const viewAch = document.getElementById('view-ach')!;
  const viewDex = document.getElementById('view-dex')!;

  tabAch.addEventListener('click', () => {
    tabAch.classList.add('active'); tabDex.classList.remove('active');
    viewAch.classList.remove('hidden'); viewDex.classList.add('hidden');
  });
  tabDex.addEventListener('click', () => {
    tabDex.classList.add('active'); tabAch.classList.remove('active');
    viewDex.classList.remove('hidden'); viewAch.classList.add('hidden');
  });
}

// ---- Achievements ----

function renderAchievements(): void {
  const el = document.getElementById('view-ach');
  if (!el) return;

  const total = MILESTONES.length;
  const got = MILESTONES.filter((m) => unlocked.has(m.id)).length;

  let html = `<div class="progress">已达成 ${got} / ${total}</div>`;
  for (const m of MILESTONES) {
    const done = unlocked.has(m.id);
    html += `
      <div class="ach ${done ? '' : 'locked'}">
        <div class="ai">${m.icon}</div>
        <div class="at">
          <div class="an">${escapeHtml(m.name)}</div>
          <div class="ad">${escapeHtml(m.description)}</div>
        </div>
        <div class="ar ${done ? 'done' : ''}">${done ? '✓ 已达成' : `🪙 ${m.coin}`}</div>
      </div>`;
  }
  el.innerHTML = html;
}

// ---- Collection (图鉴) ----

function renderCollection(): void {
  const el = document.getElementById('view-dex');
  if (!el) return;

  const total = BREED_REGISTRY.length;
  const got = BREED_REGISTRY.filter((b) => discovered.has(b.id)).length;

  let html = `<div class="progress">已发现 ${got} / ${total} 种（送走宠物可遇见新品种）</div>`;

  // Group by species, in spawn-weight order.
  const speciesList = (Object.keys(SPECIES_WEIGHTS) as PetSpecies[]);
  for (const sp of speciesList) {
    const breeds = BREED_REGISTRY.filter((b) => b.species === sp);
    if (breeds.length === 0) continue;
    html += `<div class="cat-title">${SPECIES_LABELS[sp]}</div><div class="grid">`;
    for (const b of breeds) {
      const seen = discovered.has(b.id);
      if (seen) {
        const rc = getRarityColor(b.rarity);
        html += `
          <div class="breed">
            <div class="swatch" style="background:${b.colors.body};border-color:${b.colors.bodyDark}"></div>
            <div>
              <div class="bn">${escapeHtml(b.name)}</div>
              <div class="brarity" style="color:${rc}">${getRarityLabel(b.rarity)}</div>
              <div class="bd">${escapeHtml(b.description)}</div>
            </div>
          </div>`;
      } else {
        html += `
          <div class="breed locked">
            <div class="swatch" style="background:#E8C8D8;border-color:#D8B0C4">?</div>
            <div>
              <div class="bn">？？？</div>
              <div class="brarity" style="color:#C79CB0">未发现</div>
              <div class="bd">还没有遇见这只小家伙…</div>
            </div>
          </div>`;
      }
    }
    html += `</div>`;
  }
  el.innerHTML = html;
}

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
