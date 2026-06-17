// ============================================================
// PixelPal — Growth report (成长报告)
// ============================================================
// A data dashboard of your time together plus a line chart of how
// the pet's six attributes have drifted over time.
// ============================================================

import type { PetEntity, Wallet, AttrSnapshot, PetAttributes } from '../shared/types';
import { MILESTONES, BREED_REGISTRY } from '../shared/constants';

const ATTR_KEYS: Array<{ key: keyof PetAttributes; label: string; color: string }> = [
  { key: 'strength', label: '力量', color: '#FF6B6B' },
  { key: 'agility',  label: '敏捷', color: '#4ECDC4' },
  { key: 'appetite', label: '食欲', color: '#FFA94D' },
  { key: 'playful',  label: '贪玩', color: '#FF8FBE' },
  { key: 'hygiene',  label: '洁癖', color: '#74C0FC' },
  { key: 'wisdom',   label: '智慧', color: '#B197FC' },
];

document.addEventListener('DOMContentLoaded', () => {
  init().catch((e) => console.error('[Report] init error:', e));
});

async function init(): Promise<void> {
  const [pet, wallet, collection, history] = await Promise.all([
    window.pixelpal.loadPet().catch(() => null) as Promise<PetEntity | null>,
    window.pixelpal.getWallet().catch(() => null) as Promise<Wallet | null>,
    window.pixelpal.getCollection().catch(() => [] as string[]),
    window.pixelpal.getAttrHistory().catch(() => [] as AttrSnapshot[]),
  ]);

  const el = document.getElementById('report-content');
  if (!el) return;
  if (!pet) {
    el.innerHTML = `<div class="note" style="text-align:center;padding:40px;">还没有宠物呢~</div>`;
    return;
  }

  const days = Math.max(1, Math.floor((Date.now() - pet.bonding.firstMetAt) / 86_400_000));
  const stats: Array<[string, string | number]> = [
    ['相伴天数', `${days} 天`],
    ['等级', `Lv.${pet.level}`],
    ['进化阶段', pet.evolutionStage],
    ['总互动', pet.bonding.totalInteractions],
    ['摸头', pet.bonding.totalPets],
    ['喂食', pet.bonding.totalFeeds],
    ['现有金币', wallet?.coins ?? 0],
    ['累计赚币', wallet?.totalEarned ?? 0],
    ['打工次数', wallet?.jobsDone ?? 0],
    ['已发现品种', `${collection.length}/${BREED_REGISTRY.length}`],
    ['成就', `${pet.bonding.milestones.length}/${MILESTONES.length}`],
    ['回忆点', pet.bonding.memories.length],
  ];

  const legend = ATTR_KEYS
    .map((a) => `<span><i style="background:${a.color}"></i>${a.label}</span>`)
    .join('');

  el.innerHTML = `
    <div class="cat-title">💗 陪伴看板</div>
    <div class="grid">
      ${stats.map(([l, v]) => `<div class="stat"><div class="v">${v}</div><div class="l">${l}</div></div>`).join('')}
    </div>

    <div class="section">
      <div class="section-title">📈 六维属性变化</div>
      <canvas id="chart" width="420" height="200"></canvas>
      <div class="legend">${legend}</div>
      <div class="note" id="chart-note"></div>
    </div>
  `;

  requestAnimationFrame(() => drawChart(history, pet.attributes));
}

function drawChart(history: AttrSnapshot[], current: PetAttributes): void {
  const canvas = document.getElementById('chart') as HTMLCanvasElement | null;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const W = canvas.width, H = canvas.height;
  const padL = 30, padR = 10, padT = 12, padB = 18;
  const plotW = W - padL - padR, plotH = H - padT - padB;

  ctx.clearRect(0, 0, W, H);

  // Always include the live "now" point so a fresh pet still shows a line.
  const points: AttrSnapshot[] = [...history];
  const lastT = points.length ? points[points.length - 1].t : 0;
  if (!points.length || Date.now() - lastT > 1000) {
    points.push({ t: Date.now(), a: { ...current } });
  }

  // Grid + Y axis (0..90)
  ctx.strokeStyle = 'rgba(255,150,190,0.25)';
  ctx.fillStyle = '#C79CB0';
  ctx.font = '9px "Courier New", monospace';
  ctx.lineWidth = 1;
  for (let v = 0; v <= 90; v += 30) {
    const y = padT + plotH - (v / 90) * plotH;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(W - padR, y);
    ctx.stroke();
    ctx.fillText(String(v), 6, y + 3);
  }

  const n = points.length;
  const xAt = (i: number) => padL + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const yAt = (v: number) => padT + plotH - (Math.max(0, Math.min(90, v)) / 90) * plotH;

  for (const a of ATTR_KEYS) {
    ctx.strokeStyle = a.color;
    ctx.fillStyle = a.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    points.forEach((p, i) => {
      const x = xAt(i), y = yAt(p.a[a.key]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    // dots
    points.forEach((p, i) => {
      ctx.beginPath();
      ctx.arc(xAt(i), yAt(p.a[a.key]), 2.5, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  const note = document.getElementById('chart-note');
  if (note) {
    note.textContent = n <= 1
      ? '继续陪伴它，属性会随它的生活方式慢慢变化，这里就会长出曲线~'
      : `已记录 ${n} 个时间点（每只宠物的属性会随发呆/玩耍/吃饭等行为缓慢漂移）。`;
  }
}
