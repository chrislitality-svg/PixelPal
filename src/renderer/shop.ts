// ============================================================
// PixelPal — Shop window
// ============================================================
// Runs inside shop.html.  Spend 爱心币 (love coins) on food, toys,
// cosmetics and special items for your pet.  The wallet is owned by
// the main process (single writer), so this window just reads it and
// requests purchases; cosmetics equip live on the pet, consumables
// take effect on the live pet immediately.
// ============================================================

import type { Wallet, ShopItem, ShopCategory, Season } from '../shared/types';
import { SHOP_ITEMS } from '../shared/constants';
import { getRarityColor, getRarityLabel } from './pet/pet-pool';

let wallet: Wallet = { coins: 0, cosmetics: [], equipped: {} };

const SEASON_LABEL: Record<Season, string> = {
  spring: '🌸 春日限定', summer: '🌊 夏日限定', autumn: '🍂 秋日限定', winter: '❄️ 冬日限定',
};

function currentSeason(): Season {
  const m = new Date().getMonth() + 1;
  if (m >= 3 && m <= 5) return 'spring';
  if (m >= 6 && m <= 8) return 'summer';
  if (m >= 9 && m <= 11) return 'autumn';
  return 'winter';
}

const CATEGORY_LABEL: Record<ShopCategory, string> = {
  food: '🍖 食物',
  toy: '🧸 玩具',
  cosmetic: '🎀 装扮',
  special: '✨ 特殊',
};
const CATEGORY_ORDER: ShopCategory[] = ['food', 'toy', 'cosmetic', 'special'];

document.addEventListener('DOMContentLoaded', () => {
  init().catch((e) => console.error('[Shop] init error:', e));
});

async function init(): Promise<void> {
  try {
    wallet = await window.pixelpal.getWallet();
  } catch { /* keep default */ }

  render();

  // Keep coins / equipped state fresh if they change elsewhere.
  window.pixelpal.onWalletChanged((w: Wallet) => {
    wallet = w;
    render();
  });
}

function render(): void {
  const coinEl = document.getElementById('coin-count');
  if (coinEl) coinEl.textContent = String(wallet.coins);

  const container = document.getElementById('shop-content');
  if (!container) return;

  let html = '';
  for (const cat of CATEGORY_ORDER) {
    const items = SHOP_ITEMS.filter((i) => i.category === cat);
    if (items.length === 0) continue;
    html += `<div class="cat-title">${CATEGORY_LABEL[cat]}</div><div class="grid">`;
    for (const item of items) html += itemCard(item);
    html += `</div>`;
  }
  container.innerHTML = html;

  // Wire buttons
  container.querySelectorAll<HTMLButtonElement>('.buy-btn').forEach((btn) => {
    btn.addEventListener('click', () => onBuy(btn.dataset.id || ''));
  });
}

function itemCard(item: ShopItem): string {
  const owned = item.category === 'cosmetic' && wallet.cosmetics.includes(item.id);
  const equipped = !!item.slot && wallet.equipped[item.slot] === item.id;
  const affordable = wallet.coins >= item.price;
  // Seasonal items can only be bought in-season (already-owned ones stay usable).
  const outOfSeason = !!item.season && item.season !== currentSeason() && !owned;

  let btnLabel: string;
  let btnClass = 'buy-btn';
  let disabled = '';
  if (outOfSeason) {
    btnLabel = '未到季节';
    btnClass += ' owned';
    disabled = 'disabled';
  } else if (item.category === 'cosmetic' && owned) {
    btnLabel = equipped ? '卸下' : '穿戴';
    btnClass += equipped ? ' equipped' : ' owned';
  } else {
    btnLabel = `🪙 ${item.price}`;
    if (!affordable) disabled = 'disabled';
  }

  const rarity = item.rarity
    ? `<span style="font-size:10px;font-weight:700;color:${getRarityColor(item.rarity)}">◆ ${getRarityLabel(item.rarity)}</span>`
    : '';
  const seasonBadge = item.season
    ? `<div style="font-size:9.5px;color:#9B7FB0;margin-top:1px">${SEASON_LABEL[item.season]}</div>`
    : '';

  return `
    <div class="item ${equipped ? 'equipped' : ''}" style="${outOfSeason ? 'opacity:0.6' : ''}">
      <div class="icon">${item.icon}</div>
      <div class="name">${escapeHtml(item.name)} ${rarity}</div>
      <div class="desc">${escapeHtml(item.desc)}</div>
      ${seasonBadge}
      <div class="row">
        ${item.category === 'cosmetic' && owned ? '<span class="price">已拥有</span>' : `<span class="price">🪙 ${item.price}</span>`}
        <button class="${btnClass}" data-id="${item.id}" ${disabled}>${btnLabel}</button>
      </div>
    </div>
  `;
}

async function onBuy(itemId: string): Promise<void> {
  const item = SHOP_ITEMS.find((i) => i.id === itemId);
  if (!item) return;

  try {
    const res = await window.pixelpal.buyShopItem(itemId);
    if (res.ok) {
      wallet = res.wallet;
      if (item.category === 'cosmetic') {
        const equipped = !!item.slot && wallet.equipped[item.slot] === item.id;
        toast(equipped ? `给宝贝戴上${item.name}啦~` : `已卸下${item.name}`);
      } else {
        toast(`买了${item.icon}${item.name}，宝贝超开心！`);
      }
      render();
    } else if (res.error === 'coins') {
      toast('爱心币不够啦，多陪陪我攒一点吧~');
    } else {
      toast('买不了这个…');
    }
  } catch {
    toast('出了点小问题…');
  }
}

let toastTimer: ReturnType<typeof setTimeout> | null = null;
function toast(msg: string): void {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
}

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
