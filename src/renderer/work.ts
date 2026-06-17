// ============================================================
// PixelPal — Work window (打工)
// ============================================================
// Send the pet off to one of 90+ little jobs to earn 爱心币.
// Only one job at a time; it runs on a real-time timer, then you
// collect the reward. Coins feed the shop (food / toys / cosmetics).
// ============================================================

import type { Wallet, JobState, Job } from '../shared/types';
import { JOBS, JOB_CATEGORIES } from '../shared/constants';

let wallet: Wallet = { coins: 0, cosmetics: [], equipped: {} };
let job: JobState = { current: null, now: Date.now() };
let ticker: ReturnType<typeof setInterval> | null = null;

document.addEventListener('DOMContentLoaded', () => {
  init().catch((e) => console.error('[Work] init error:', e));
});

async function init(): Promise<void> {
  [wallet, job] = await Promise.all([
    window.pixelpal.getWallet().catch(() => wallet),
    window.pixelpal.getJob().catch(() => job),
  ]);

  renderCoins();
  renderJobList();
  renderActive();

  // Coins change when a job auto-completes (pet returns) — also refresh
  // the job state so a finished job clears back to the job grid.
  window.pixelpal.onWalletChanged(async (w: Wallet) => {
    wallet = w;
    renderCoins();
    try { job = await window.pixelpal.getJob(); } catch { /* keep */ }
    renderActive();
    if (!job.current) setStartButtonsEnabled(true);
  });

  // Live countdown.
  ticker = setInterval(() => {
    if (job.current) renderActive();
  }, 1000);
  window.addEventListener('unload', () => { if (ticker) clearInterval(ticker); });
}

function renderCoins(): void {
  const el = document.getElementById('coin-count');
  if (el) el.textContent = String(wallet.coins);
}

// ---- Active job banner ----

function renderActive(): void {
  const el = document.getElementById('active-area');
  if (!el) return;

  if (!job.current) {
    el.innerHTML = '';
    return;
  }
  const j = JOBS.find((x) => x.id === job.current!.id);
  if (!j) { el.innerHTML = ''; return; }

  const total = job.current.endsAt - job.current.startedAt;
  const remaining = Math.max(0, job.current.endsAt - Date.now());
  const pct = Math.min(100, Math.round((1 - remaining / total) * 100));
  const done = remaining <= 0;

  el.innerHTML = `
    <div class="active">
      <div class="row">
        <span class="ai">${j.icon}</span>
        <div>
          <div class="an">${escapeHtml(j.name)} ${done ? '✅ 完成！' : '工作中…'}</div>
          <div class="as">${escapeHtml(j.desc)}</div>
        </div>
      </div>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
      <div class="ctrl">
        <span class="countdown">${done ? '可以收取啦' : '剩余 ' + fmt(remaining)}</span>
        <button class="collect-btn" id="collect-btn" ${done ? '' : 'disabled'}>🪙 收取 ${j.reward}</button>
      </div>
    </div>`;

  const btn = document.getElementById('collect-btn') as HTMLButtonElement | null;
  btn?.addEventListener('click', onCollect);

  // Keep the start buttons disabled while working.
  setStartButtonsEnabled(false);
}

// ---- Job list ----

function renderJobList(): void {
  const el = document.getElementById('job-list');
  if (!el) return;

  let html = `<div class="hint">一次只能打一份工，完成后回来收金币（金币可以去商店买食物和玩具哦）。</div>`;
  for (const cat of JOB_CATEGORIES) {
    const list = JOBS.filter((j) => j.category === cat.key);
    if (list.length === 0) continue;
    html += `<div class="cat-title">${cat.label}（${list.length}）</div><div class="grid">`;
    for (const j of list) html += jobCard(j);
    html += `</div>`;
  }
  el.innerHTML = html;

  el.querySelectorAll<HTMLButtonElement>('.work-btn').forEach((b) => {
    b.addEventListener('click', () => onStart(b.dataset.id || ''));
  });
  setStartButtonsEnabled(!job.current);
}

function jobCard(j: Job): string {
  return `
    <div class="job">
      <div class="ji">${j.icon}</div>
      <div class="jn">${escapeHtml(j.name)}</div>
      <div class="jd">${escapeHtml(j.desc)}</div>
      <div class="jmeta"><span class="jtime">⏱ ${fmtMin(j.durationSec)}</span><span class="jrew">🪙 ${j.reward}</span></div>
      <button class="work-btn" data-id="${j.id}">去打工</button>
    </div>`;
}

function setStartButtonsEnabled(enabled: boolean): void {
  document.querySelectorAll<HTMLButtonElement>('.work-btn').forEach((b) => {
    b.disabled = !enabled;
    b.textContent = enabled ? '去打工' : '打工中…';
  });
}

// ---- Actions ----

async function onStart(id: string): Promise<void> {
  if (job.current) { toast('宝贝正在打工呢，等它回来~'); return; }
  const j = JOBS.find((x) => x.id === id);
  try {
    job = await window.pixelpal.startJob(id);
    if (job.current) {
      toast(`出发去${j?.name ?? '打工'}啦！`);
      renderActive();
      setStartButtonsEnabled(false);
    }
  } catch { toast('出了点小问题…'); }
}

async function onCollect(): Promise<void> {
  try {
    const res = await window.pixelpal.collectJob();
    if (res.ok) {
      if (res.wallet) { wallet = res.wallet; renderCoins(); }
      const evt = res.event ? `${res.event}！` : '';
      toast(`${evt}${res.jobName} 完成，赚到 ${res.reward} 爱心币 🎉`);
      job = { current: null, now: Date.now() };
      renderActive();
      setStartButtonsEnabled(true);
    } else if (res.error === 'working') {
      toast('还没干完呢~');
    } else {
      // Already auto-collected when the pet came home — just refresh.
      job = await window.pixelpal.getJob();
      renderActive();
      setStartButtonsEnabled(!job.current);
    }
  } catch { toast('出了点小问题…'); }
}

// ---- Helpers ----

function fmt(ms: number): string {
  const s = Math.ceil(ms / 1000);
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${m}:${String(ss).padStart(2, '0')}`;
}

function fmtMin(sec: number): string {
  if (sec < 60) return `${sec}秒`;
  const m = Math.round(sec / 60);
  return `${m}分钟`;
}

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
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
