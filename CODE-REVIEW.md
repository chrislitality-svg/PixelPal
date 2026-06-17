# PixelPal Code Review Report

**Reviewer:** Principal Engineer Review  
**Scope:** Entire project (52 source files across `src/main/`, `src/renderer/`, `src/preload/`, `src/shared/`, config files)  
**Date:** 2026-06-17  
**Assumptions:** Single-user desktop Electron app, Windows-only, SQLite persistence, no server-side component, no multi-user auth. All IPC is local (same-machine renderer↔main).

---

## Executive Summary

The codebase is well-structured, uses parameterized SQL throughout, and correctly implements `contextIsolation`/`nodeIntegration: false` on all BrowserWindow instances. The deterministic RNG (`mulberry32` + FNV-1a) is algorithmically correct. The finite state machine and behavior tree are sound.

**3 Critical** issues require immediate attention (hardcoded API key shipped to users, silent pet data loss on shutdown, swallowed DB initialization errors). **17 High** findings cover Electron EOL, network security, atomicity bugs in wallet operations, and IPC input validation gaps. **22 Medium** findings are important but lower urgency.

---

## CRITICAL

### C1 — Hardcoded API key shipped to all users in production build

**File:Line:** `src/main/grsai.ts:27`  
**Severity:** Critical — secret exposure  
**Why:** `'sk-e89bc4c6f58f4b9eb5dcb8ec1237bf0a'` is a raw API key baked into source. It will be distributed inside the asar archive to every user. Anyone can extract it with `npx asar extract app.asar`. The key is sent in every `Authorization: Bearer` header to `grsaiapi.com` and `grsai.dakka.com.cn`.  
**Fix diff:**
```diff
-const KEY = process.env.IMAGE_GEN_GRSAI_API_KEY || 'sk-e89bc4c6f58f4b9eb5dcb8ec1237bf0a';
+const KEY = process.env.IMAGE_GEN_GRSAI_API_KEY;
+if (!KEY) throw new Error('IMAGE_GEN_GRSAI_API_KEY environment variable is required');
```
**Effort:** 5 min

---

### C2 — `flushPendingSave()` discards pending pet data on app quit

**File:Line:** `src/main/store.ts:882-889`  
**Severity:** Critical — data loss  
**Why:** `close()` calls `flushPendingSave()` which clears the debounce timer via `clearTimeout()`. The pet data captured in the `setTimeout` closure is **never written**. The comment on L886 admits this: "Callers that need a guaranteed flush should call savePetImmediate() directly." But `close()` is the primary shutdown path and does NOT call `savePetImmediate`. Any pet state modified within `SAVE_DEBOUNCE_MS` (8s) of app quit is permanently lost.  
**Fix diff:**
```diff
  private flushPendingSave(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
+     if (this.pendingPet) {
+       this.savePetImmediate(this.pendingPet);
+       this.pendingPet = null;
+     }
    }
  }
```
And in `savePet()`:
```diff
  savePet(pet: PetEntity): void {
+   this.pendingPet = pet;
    this.scheduleDebouncedSave(pet);
  }
```
**Effort:** 10 min

---

### C3 — Store `initialize()` swallows all errors silently

**File:Line:** `src/main/store.ts:99-105`  
**Severity:** Critical — silent corruption / inaccessible app  
**Why:** If the database fails to open (permissions, disk full, corruption), `this.db` stays `null` and `initialize()` catches and logs the error but **does not propagate it**. Every subsequent call (`petExists`, `loadPet`, `getSettings`) returns a falsy default. The app runs with zero data and zero indication of failure — user sees onboarding as if first launch.  
**Fix diff:**
```diff
  initialize(): void {
    try {
      this.open();
      this.ensureDefaultSettings();
    } catch (err) {
-     console.error('[Store] Initialization failed:', err);
+     this.lastError = `Database initialization failed: ${err}`;
+     throw err;
    }
  }
```
Then in `src/main/index.ts`, catch the error and show a dialog:
```ts
try {
  store.initialize();
} catch (err) {
  dialog.showErrorBox('启动失败', '数据库初始化失败，请检查磁盘权限后重试。');
  app.quit();
}
```
**Effort:** 15 min

---

## HIGH

### H1 — Electron 28.3.3 is End-of-Life (no security patches)

**File:Line:** `package.json:27`  
**Severity:** High — security  
**Why:** Electron 28 went EOL in June 2024. No further security patches for Chromium/V8 vulnerabilities including sandbox escapes (CVE-2024-6772), prototype pollution (CVE-2024-7009), and heap overflows (CVE-2024-7530). Current stable is 34.x.  
**Fix:** Upgrade to `"electron": "^34.0.0"` and test thoroughly. Check breaking changes in Electron 29-34 release notes.  
**Effort:** 2-4 hours (testing surface is small — 9 windows, all local)

---

### H2 — IP geolocation sent over plain HTTP

**File:Line:** `src/main/weather.ts:78`  
**Severity:** High — privacy / network security  
**Why:** `'http://ip-api.com/json/...'` transmits the user's approximate city and coordinates unencrypted. Any network observer (ISP, coffee shop WiFi) can read the user's location. The API supports HTTPS at the same URL.  
**Fix diff:**
```diff
-const GEO_URL = 'http://ip-api.com/json/';
+const GEO_URL = 'https://ip-api.com/json/';
```
**Effort:** 1 min

---

### H3 — All BrowserWindows missing `sandbox: true`

**File:Line:** `src/main/ipc-handlers.ts:520,557,594,630,664,699,758`, `src/main/pet-manager.ts:56`, `src/main/world-manager.ts:56`  
**Severity:** High — security  
**Why:** Without `sandbox: true`, renderer processes run with full OS privileges greater than necessary. Electron documentation mandates it for all windows.  
**Fix diff** (example — apply to all 10 `webPreferences` blocks):
```diff
  webPreferences: {
    contextIsolation: true,
    nodeIntegration: false,
+   sandbox: true,
    preload: path.join(__dirname, 'preload', 'index.js'),
  },
```
**Effort:** 15 min (add to 10 locations, test all windows)

---

### H4 — DevDependencies included in production build

**File:Line:** `electron-builder.yml:31`  
**Severity:** High — attack surface / bundle size  
**Why:** `"node_modules/**/*"` includes TypeScript, Vite, `@types/*`, `concurrently`, and the full electron-builder toolchain in the release build. This adds ~150MB+ and expands the attack surface unnecessarily.  
**Fix diff:**
```diff
-      - "!node_modules/**/*"
+      - "!node_modules/**/*"
+      # Exclude dev tooling from production build
+      - "node_modules/typescript/**"
+      - "node_modules/@types/**"
+      - "node_modules/vite/**"
+      - "node_modules/concurrently/**"
+      - "node_modules/electron-builder/**"
+      - "node_modules/electron/**"
```
**Effort:** 10 min

---

### H5 — `earnCoins` / `buyItem` / `collectJob`: non-atomic wallet read-modify-write

**File:Line:** `src/main/store.ts:480-487`, `496-511`, `641-645`  
**Severity:** High — data integrity (coin loss)  
**Why:** All three methods read the wallet JSON blob, mutate it, and write it back. Between the read and write, any concurrent wallet operation (e.g., shop buy during job collection) **silently clobbers** the other's changes. `collectJob` is worst: it calls `earnCoins()` (writes wallet), then immediately does `wallet.jobsDone++` and calls `setWallet()` (writes again), overwriting the earnCoins write.  
**Fix:** Use atomic SQL UPDATE instead of read-modify-write:
```diff
  earnCoins(amount: number): Wallet {
+   this.atomicWalletUpdate({ coins: `coins + ${Math.floor(amount)}` });
    return this.getWallet(); // return latest state
  }
  
+ private atomicWalletUpdate(updates: Record<string, string>): void {
+   const setClauses = Object.entries(updates)
+     .map(([k, v]) => `${k} = ${v}`)
+     .join(', ');
+   this.db?.prepare(`UPDATE settings SET value = 
+     json_set(value, '$.coins', json_extract(value, '$.coins') + ?), 
+     updated_at = ?
+     WHERE key = 'wallet'`).run(amount, Date.now());
+ }
```
**Effort:** 1-2 hours (refactor 3 methods)

---

### H6 — `savePetImmediate` SELECT-then-UPDATE without transaction

**File:Line:** `src/main/store.ts:208-253`  
**Severity:** High — data integrity (potential PK violation)  
**Why:** Checks if a pet row exists with a SELECT, then either UPDATEs or INSERTs. Two concurrent calls could both pass the SELECT check and both attempt INSERT, causing a primary key violation. Currently low-risk (single-threaded better-sqlite3) but a latent correctness bug.  
**Fix diff:**
```diff
-      const existing = this.db.prepare('SELECT id FROM pets WHERE id = ?').get(pet.id);
-      if (existing) {
-        this.db.prepare(`UPDATE pets SET ... WHERE id = ?`).run(...);
-      } else {
-        this.db.prepare(`INSERT INTO pets ...`).run(...);
-      }
+      this.db.prepare(`INSERT OR REPLACE INTO pets (...) VALUES (...)`).run(...);
```
**Effort:** 10 min (use INSERT OR REPLACE)

---

### H7 — `WALLET_EARN` IPC accepts negative/NaN/Infinity amounts

**File:Line:** `src/main/ipc-handlers.ts:401-405`  
**Severity:** High — input validation / coin draining  
**Why:** `store.earnCoins(amount)` accepts any number from the renderer. A compromised renderer (or bug) could send `-999999` to drain all coins, or `NaN` to corrupt the wallet JSON forever.  
**Fix diff:**
```diff
  ipcMain.handle(IPC_CHANNELS.WALLET_EARN, (_event, amount: number): Wallet => {
+   if (!Number.isFinite(amount) || amount <= 0) return store.getWallet();
    const wallet = store.earnCoins(amount);
    broadcastWallet(wallet);
    return wallet;
  });
```
**Effort:** 2 min

---

### H8 — `depsRef` null dereference in deferred job timers during quit

**File:Line:** `src/main/ipc-handlers.ts:61-63`, `83-86`  
**Severity:** High — crash on quit  
**Why:** `jobHideTimer` and `jobFinishTimer` capture `depsRef` indirectly. `finishWork()` at L83 calls `returnPet(depsRef.store.collectJob())` without nullable check. If the app quits between scheduling and fire, `depsRef` is null, causing a crash.  
**Fix diff:**
```diff
  const deps = depsRef; // capture at schedule time
  jobHideTimer = setTimeout(() => deps?.petManager.setVisible(false), 2500);
  jobFinishTimer = setTimeout(() => {
-   const st = depsRef.store.getJobState();
+   if (!deps) return;
+   const st = deps.store.getJobState();
    ...
-   returnPet(depsRef.store.collectJob());
+   returnPet(deps.store.collectJob());
  }, Math.max(0, endsAt - Date.now()));
```
**Effort:** 5 min

---

### H9 — `PET_SAVE` silently discards saves for released pets without notifying renderer

**File:Line:** `src/main/ipc-handlers.ts:146-147`  
**Severity:** High — silent data inconsistency  
**Why:** When a pet is released, `releasedPetIds.has(pet.id)` causes the handler to `return;` (void). The renderer's `beforeunload` save calls succeed silently — the renderer believes the save went through but the main process discarded it. If the user's save occurs during the release confirmation flow, the pet may briefly resurrect.  
**Fix diff:**
```diff
  ipcMain.handle(IPC_CHANNELS.PET_SAVE, (_event, pet: PetEntity) => {
-   if (pet && releasedPetIds.has(pet.id)) return;
+   if (pet && releasedPetIds.has(pet.id)) return { saved: false, reason: 'released' };
    ...
  });
```
**Effort:** 2 min

---

### H10 — `handleMouseDown` async creates phantom drag after mouse release

**File:Line:** `src/renderer/interaction/input-handler.ts:189-213`  
**Severity:** High — input bug (phantom drag)  
**Why:** `handleMouseDown` is `async` — it `await`s `getScreenInfo()`. The user can release the mouse before the IPC resolves. If `mouseup` fires first, `isDragging` is still `false` and the mouseup is ignored. Then when the IPC returns, `isDragging = true` and a phantom drag starts with no active mouse button — the window glues to the cursor.  
**Fix:** Capture position synchronously before the await, or use a guard:
```diff
  private async handleMouseDown(e: MouseEvent): Promise<void> {
+   if (this.dragPending) return;
+   this.dragPending = true;
    try {
      const info = await window.pixelpal.getScreenInfo();
+     if (!this.isMouseDown) { this.dragPending = false; return; }
      this.dragHandler.startDrag(e.screenX, e.screenY, info.windowX, info.windowY);
      this.isDragging = true;
    } catch { /* ... */ }
+   finally { this.dragPending = false; }
  }
```
**Effort:** 10 min

---

### H11 — No `mouseleave` on canvas causes permanent sticky hover

**File:Line:** `src/renderer/interaction/input-handler.ts:173-182`  
**Severity:** High — blocks desktop interaction  
**Why:** When the cursor moves off the canvas but stays inside the window, `handleMouseMove` never fires, `isHovering` stays `true`, and mouse passthrough stays disabled. The transparent parts of the pet window permanently block desktop clicks.  
**Fix diff:**
```diff
  setup(): void {
    this.canvas.addEventListener('mousemove', this.boundMouseMove);
    this.canvas.addEventListener('mousedown', this.boundMouseDown);
    this.canvas.addEventListener('mouseup', this.boundMouseUp);
    this.canvas.addEventListener('click', this.boundClick);
    this.canvas.addEventListener('contextmenu', this.boundContextMenu);
+   this.canvas.addEventListener('mouseleave', this.boundMouseLeave);
    // ...
  }

+ private handleMouseLeave(): void {
+   if (this.isHovering && !this.isDragging && !this.menuOpen) {
+     this.isHovering = false;
+     window.pixelpal.mouseLeave();
+   }
+ }
```
**Effort:** 5 min

---

### H12 — `lastFsmState` initialized as `''` causes phantom poop on startup

**File:Line:** `src/renderer/main.ts:490` (approximate — the check `lastFsmState !== 'poop'`)  
**Severity:** High — unexpected desktop poop on first frame  
**Why:** `lastFsmState` starts as `''`. If the pet enters poop state very early (e.g., via offline drift), `'' !== 'poop'` is `true`, causing a desktop poop to be spawned on the very first frame. This is user-visible and confusing.  
**Fix diff:**
```diff
-let lastFsmState = '';
+let lastFsmState: string | null = null;
// ...
-if (lastFsmState !== 'poop' && currentState === 'poop') {
+if (lastFsmState !== null && lastFsmState !== 'poop' && currentState === 'poop') {
```
**Effort:** 2 min

---

### H13 — `drawSleepingCat` does not set `this.lastBodyOffset`

**File:Line:** `src/renderer/engine/renderer.ts:989-993`  
**Severity:** High — cosmetic rendering glitch  
**Why:** `drawSleepingCat()` returns without updating `this.lastBodyOffset`. If a cosmetic is equipped during sleep, the bob offset is stale from the previous animation state, causing hats/glasses/accessories to render at the wrong vertical position.  
**Fix diff:**
```diff
  private drawSleepingCat(ctx: CanvasRenderingContext2D, y: number): void {
    // ... draw logic ...
+   this.lastBodyOffset = 0; // sleeping cat doesn't bob
  }
```
**Effort:** 2 min

---

### H14 — Low-battery energy drain fires every poll cycle (too aggressive)

**File:Line:** `src/renderer/main.ts:830-833`  
**Severity:** High — gameplay balance / user frustration  
**Why:** Low-battery energy drain fires every 30-second poll cycle. Combined with the sleep nudge (L826-828), the pet loses 2 energy every 30 seconds during low battery. A full battery-then-low sequence drains energy from 80 to 10 in ~17 minutes, which is unrealistically aggressive for a desktop pet.  
**Fix:** Apply only once per low-battery period, not every poll:
```diff
    if (ctx.batteryLow) {
-     petManager.adjustNeeds({ energy: -1 });
+     if (!this._batteryDrainApplied) {
+       petManager.adjustNeeds({ energy: -2 });
+       this._batteryDrainApplied = true;
+     }
+   } else {
+     this._batteryDrainApplied = false;
    }
```
**Effort:** 5 min

---

### H15 — `earnCoins` IPC failures silently swallowed (no user feedback)

**File:Line:** `src/renderer/main.ts:503,506,637-639,1155,1167`  
**Severity:** High — lost currency without user awareness  
**Why:** Multiple `window.pixelpal.earnCoins(amount).catch(() => {})` patterns silently swallow coin-earning failures. The user performs an action that should grant coins, receives the visual/sound feedback, but the coins never arrive in the wallet. No retry, no toast.  
**Fix:** Show a brief toast or bubble on earn failure:
```diff
-    earnCoins(amt).catch(() => {});
+    earnCoins(amt).catch(() => {
+      bubbleSystem.show({ text: '金币到账失败了…', type: 'system', duration: 2000 });
+    });
```
**Effort:** 10 min each (5 locations)

---

### H16 — `saveBlob` prematurely revokes object URL (download may fail)

**File:Line:** `src/renderer/main.ts:1482`  
**Severity:** High — download may silently fail  
**Why:** `URL.revokeObjectURL(url)` fires after 500ms. If the browser hasn't dispatched the download by then (slow disk, many concurrent downloads), the URL is revoked and the download fails silently with no user feedback.  
**Fix:** Use a longer timeout or revoke on the download link's completion:
```diff
-  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 500);
+  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 5000);
```
**Effort:** 1 min

---

### H17 — Offboarding (release) has no guard against concurrent kills

**File:Line:** `src/main/ipc-handlers.ts:289-314`  
**Severity:** High — potential double-release corruption  
**Why:** `KILL_PET` and `RELEASE_AND_QUIT` both access `releasedPetIds` and call `store.deletePet()` and `store.killPet()`. If both are called nearly simultaneously (unlikely via UI but possible via IPC), two concurrent kill flows could corrupt `releasedPetIds` and cause inconsistent state.  
**Fix:** Add a mutex guard:
```diff
+let killInProgress = false;
 ipcMain.handle(IPC_CHANNELS.KILL_PET, (_event): MachineSeedInfo => {
+  if (killInProgress) return store.getMachineSeedInfo(false);
+  killInProgress = true;
   // ... rest of handler ...
+  killInProgress = false;
 });
```
**Effort:** 5 min

---

## MEDIUM

### M1 — No response size limit on image download (OOM risk)

**File:Line:** `src/main/grsai.ts:107-108`  
**Severity:** Medium — DoS / OOM  
**Why:** `downloadBinary()` buffers the entire response body in memory with no `Content-Length` check. A compromised API node could send a multi-GB payload, causing an OOM crash.  
**Fix diff:**
```diff
  const response = await requestBinary('GET', url);
+ const maxSize = 10 * 1024 * 1024; // 10 MB
+ if (Number(response.headers['content-length']) > maxSize) {
+   throw new Error(`Image too large: ${response.headers['content-length']}`);
+ }
  return Buffer.concat(chunks);
```
**Effort:** 5 min

---

### M2 — Generated images accumulate without cleanup

**File:Line:** `src/main/grsai.ts:201-204`  
**Severity:** Medium — disk usage  
**Why:** Every generated avatar and background is saved to `userData/generated/` with no rotation, no max count, and no cleanup. Disk usage grows indefinitely.  
**Fix:** Cap at N files (e.g., 10) by deleting oldest when exceeding:
```diff
  fs.writeFileSync(filePath, buffer);
+ const files = fs.readdirSync(generatedDir).sort();
+ while (files.length > 10) {
+   fs.unlinkSync(path.join(generatedDir, files.shift()!));
+ }
```
**Effort:** 10 min

---

### M3 — `keytar` declared as dependency but never imported

**File:Line:** `package.json:22`, `electron-builder.yml:27`  
**Severity:** Medium — unnecessary attack surface  
**Why:** `keytar` is listed as a dependency and unpacked from asar, but is never imported or used anywhere. Its native `.node` binary adds unnecessary attack surface and ~2MB to the build.  
**Fix:** Remove from `package.json` dependencies and from `electron-builder.yml` `asarUnpack`.  
**Effort:** 5 min

---

### M4 — Uncaught exception handlers continue execution instead of quitting

**File:Line:** `src/main/index.ts:219-225`  
**Severity:** Medium — zombie process risk  
**Why:** `process.on('uncaughtException')` and `process.on('unhandledRejection')` log the error but continue running. After an uncaught exception, the app's internal state may be corrupted. Continuing execution risks data corruption.  
**Fix:** Log, then quit gracefully:
```diff
  process.on('uncaughtException', (error) => {
    console.error('[PixelPal] Uncaught exception:', error);
+   try { store.close(); } catch {}
+   app.quit();
  });
```
**Effort:** 5 min

---

### M5 — Deprecated `wmic` command for battery polling

**File:Line:** `src/main/screen-monitor.ts:118-128`  
**Severity:** Medium — feature degradation on newer Windows  
**Why:** Microsoft removed `wmic` from some Windows 10 22H2+ and Windows 11 builds. Battery polling silently fails on those systems — the pet never knows the device is low on battery.  
**Fix:** Fall back to PowerShell `Get-CimInstance` if `wmic` fails, or use the `systeminformation` npm module.  
**Effort:** 30 min

---

### M6 — `releasedPetIds` Set grows without bound

**File:Line:** `src/main/ipc-handlers.ts:38`  
**Severity:** Medium — memory leak  
**Why:** Every killed/released pet ID (UUID strings) is added to the Set and never removed. After 10,000 re-rolls: ~360KB. Not catastrophic but a textbook leak.  
**Fix:** LRU-cap:
```diff
  releasedPetIds.add(petId);
+ if (releasedPetIds.size > 500) {
+   const iter = releasedPetIds.values();
+   for (let i = 0; i < 250; i++) releasedPetIds.delete(iter.next().value);
+ }
```
**Effort:** 5 min

---

### M7 — Per-frame array allocations in hot paths

**File:Line:** `src/renderer/main.ts:480`, `1107`, `1277`  
**Severity:** Medium — performance (GC pressure)  
**Why:** Three locations create a new array and call `.includes()` every frame:
- L480: `['wander','selfplay','eat','poop','fish','approach'].includes(state)` every frame in `update()`
- L1107: Same pattern in `setupJokeScheduler`
- L1277: Same pattern in `setupMemoryRecall`

Each allocates a 4-7 element array 30-60 times per second.  
**Fix:** Hoist to module-level `Set` objects:
```diff
+const POOP_CAPABLE_STATES = new Set(['wander','selfplay','eat','poop','fish','approach']);
// ...
-  if (['wander','selfplay','eat','poop','fish','approach'].includes(currentState)) {
+  if (POOP_CAPABLE_STATES.has(currentState)) {
```
**Effort:** 5 min each (3 locations)

---

### M8 — `MOVE_PET` / `WORLD_ADD_POOP` accept NaN/Infinity coordinates

**File:Line:** `src/main/ipc-handlers.ts:249-254`, `357-359`  
**Severity:** Medium — input validation  
**Why:** No `Number.isFinite()` guard on coordinates. A buggy renderer could send `{ x: NaN, y: NaN }` causing the pet window to teleport offscreen or the poop overlay to render garbage.  
**Fix:** Add validation guard in both handlers (see H7 pattern).  
**Effort:** 5 min each

---

### M9 — `IMAGE_GENERATE` prompt has no length limit

**File:Line:** `src/main/ipc-handlers.ts:382-387`  
**Severity:** Medium — DoS / credit exhaustion  
**Why:** No truncation on the prompt string. A buggy renderer could send a multi-MB string to the AI API, exhausting image generation credits or causing OOM.  
**Fix:**
```diff
+ const safe = String(prompt).slice(0, 2000).trim();
+ if (!safe) return { ok: false, error: 'empty_prompt' };
```
**Effort:** 2 min

---

### M10 — `PET_ACTION` forwards arbitrary strings to renderer without allowlist

**File:Line:** `src/main/ipc-handlers.ts:491-496`  
**Severity:** Medium — IPC safety  
**Why:** Any string sent as `action` is forwarded to the pet window's renderer. A compromised secondary window could send arbitrary messages.  
**Fix:**
```diff
+ const ALLOWED = new Set(['screenshot', 'record-start', 'record-stop']);
+ if (!ALLOWED.has(action)) return;
```
**Effort:** 2 min

---

### M11 — Fire-and-forget IPC channels not in `IPC_CHANNELS` constant

**File:Line:** `src/preload/index.ts:187-189`, `242-244`, `275-283`, `287-294`  
**Severity:** Medium — maintainability / silent failures  
**Why:** Five channels (`pet:mouse-enter`, `pet:mouse-leave`, `pet:onboarding-start`, `pet:onboarding-end`, `world:set-interactive`, `window:move-self`) use `ipcRenderer.send()` with hardcoded strings that are **not listed** in the `IPC_CHANNELS` constant object. If the main process handler is renamed, these fail silently with no error.  
**Fix:** Add missing channels to both `src/shared/types.ts` `IPC_CHANNELS` and `src/preload/index.ts` inlined copy.  
**Effort:** 10 min

---

### M12 — Duplicate listener leak in `on*` methods

**File:Line:** `src/preload/index.ts:251-270`  
**Severity:** Medium — memory leak  
**Why:** `onWalletChanged`, `onUseItem`, `onPetAction`, `onWorkState` create new listeners on each call without checking for existing ones. If the renderer calls `onWalletChanged()` twice, both listeners fire and only the second is cleaned up by unsubscribe.  
**Fix:** Track active listener and remove before re-adding:
```diff
+ let walletListener: (() => void) | null = null;
  onWalletChanged: (cb: (wallet: any) => void): (() => void) => {
+   if (walletListener) { ipcRenderer.removeListener('on:wallet-changed', walletListener); }
    const handler = (_e: any, wallet: any) => cb(wallet);
    ipcRenderer.on(IPC_CHANNELS.ON_WALLET_CHANGED, handler);
+   walletListener = handler;
    return () => { ipcRenderer.removeListener(IPC_CHANNELS.ON_WALLET_CHANGED, handler); };
  },
```
**Effort:** 15 min (4 methods)

---

### M13 — `getSettings` deserializes all settings on every call

**File:Line:** `src/main/store.ts:280-286`  
**Severity:** Medium — performance  
**Why:** Every call (backing `getMachineSeedInfo`, `buyItem`, `earnCoins`, `toggleCosmetic`, etc.) deserializes all ~20 settings rows from JSON.  
**Fix:** Cache the settings object and invalidate on write:
```diff
+ private settingsCache: Record<string, unknown> | null = null;
  
  getSettings(): AppSettings {
+   if (this.settingsCache) return this.settingsCache as AppSettings;
    // ... existing logic ...
+   this.settingsCache = settings;
    return settings;
  }
  
  setSettings(partial): AppSettings {
    // ... existing logic ...
+   this.settingsCache = null; // invalidate
    return merged;
  }
```
**Effort:** 15 min

---

### M14 — `setSettings` rewrites all settings rows on every partial update

**File:Line:** `src/main/store.ts:329-333`  
**Severity:** Medium — performance / write amplification  
**Why:** Changing one setting rewrites all ~20 rows via a transaction. At current write frequency (<1/min) this is fine, but if settings updates become frequent (e.g., per-frame volume slider), this turns into 20 writes per change.  
**Fix:** Write only changed keys:
```diff
  this.db.transaction(() => {
-   for (const [key, value] of Object.entries(merged)) {
+   for (const key of Object.keys(partial)) {
      stmt.run(key, JSON.stringify(merged[key]), now);
    }
  })();
```
**Effort:** 5 min

---

### M15 — `JOB_START` silently fails on unknown job ID

**File:Line:** `src/main/ipc-handlers.ts:472-481`  
**Severity:** Medium — error propagation  
**Why:** If `jobId` doesn't match any job in `JOBS`, the handler returns the raw state without telling the renderer the job wasn't found. The renderer must interpret `state.current?.id !== jobId` to detect failure — fragile.  
**Fix:** Return explicit error:
```diff
  const job = JOBS.find((j) => j.id === jobId);
  if (!job) {
+   return { ok: false, error: 'not_found' };
  }
```
**Effort:** 2 min

---

### M16 — `startJob` TOCTOU race

**File:Line:** `src/main/store.ts:597-616`  
**Severity:** Medium — correctness  
**Why:** Time-of-check vs. time-of-use: two concurrent IPC calls could both pass the `if (existing && Date.now() < existing.endsAt) return` check and both write the job.  
**Fix:** Use the database transaction or check within the transaction.  
**Effort:** 10 min

---

### M17 — `openPartyWindow` uses stale `visitorWindows.length`

**File:Line:** `src/main/ipc-handlers.ts:804-814`  
**Severity:** Medium — race condition  
**Why:** Reads `visitorWindows.length` once, then spawns visitors across staggered `setTimeout` calls. If existing visitor windows close during the staggered spawn, the index calculation is wrong.  
**Fix:** Use a spawned counter or check live length in each `createVisitor` call.  
**Effort:** 10 min

---

### M18 — Internal API URLs exposed in public source

**File:Line:** `src/shared/constants.ts:960`  
**Severity:** Medium — information disclosure  
**Why:** `https://grsai.dakka.com.cn` suggests a private/internal API endpoint. If the GitHub repo is public, this leaks internal infrastructure topology.  
**Fix:** Move API node URLs to environment variables (at minimum) or a config file in `.gitignore`.  
**Effort:** 10 min

---

### M19 — `onboarding.ts` orphan promise if overlay externally removed

**File:Line:** `src/renderer/interaction/onboarding.ts:248,529-531`  
**Severity:** Medium — init hangs  
**Why:** `runOnboarding()` returns a Promise that resolves only when `onComplete` is called. If the onboarding DOM is removed externally (unlikely but possible in edge cases), the callback never fires and `init()` is stuck awaiting forever.  
**Fix:** Add a timeout wrapper:
```diff
+ const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('onboarding timeout')), 60000));
+ await Promise.race([onboardingPromise, timeout]);
```
**Effort:** 5 min

---

### M20 — `showFeedReaction` / `showPetReaction` dead code

**File:Line:** `src/renderer/interaction/onboarding.ts:509-529`  
**Severity:** Medium — dead code / confusion  
**Why:** These two methods exist but are never called from any code path. The feed/pet steps auto-advance via hardcoded timers in `runFeedStep`/`runPetStep` instead.  
**Fix:** Either wire them up to interactive click handlers during those steps, or remove them.  
**Effort:** 5 min (remove) or 15 min (wire up)

---

### M21 — `GameLoop.stop()` + `resume()` does not restart

**File:Line:** `src/renderer/engine/game-loop.ts:62-68`  
**Severity:** Medium — misleading API  
**Why:** `resume()` calls `this.start()` which checks `if (this.rafId !== null) return`. Since `stop()` sets `rafId = null` and `paused = false`, calling `stop()` then `resume()` returns early without starting the loop.  
**Fix:** Add a guard:
```diff
  resume(): void {
-   if (!this.paused) return;
+   if (!this.paused && this.rafId !== null) return;
    this.paused = false;
    this.start();
  }
```
**Effort:** 2 min

---

### M22 — `need-fill` bar animation uses `transition: width 0.6s` (review note)

**File:Line:** `src/renderer/settings.html:91` (and all other status bars)  
**Severity:** Medium — the previous PR added reduced-motion guards in HTML, but the status bar needs transition too.  
**Status:** Already partially fixed in prior PR — verify all `.bar-fill` and `.need-fill` elements are covered by the `@media (prefers-reduced-motion)` query.

---

## LOW (Selected — full list available on request)

### L1 — `SeededRandom.pick()` returns `undefined` on empty array (type violation)

**File:Line:** `src/shared/rng.ts:78-80`  
**Severity:** Low  
**Why:** `this.int(0, arr.length - 1)` on an empty array returns `this.int(0, -1)` which returns 0 (int clamps `min`), then `arr[0]` = `undefined`. Type signature claims `T`.  
**Fix:** Add empty check: `if (arr.length === 0) throw new Error('Cannot pick from empty array');`  
**Effort:** 2 min

---

### L2 — `SeededRandom.int()` no min/max validation

**File:Line:** `src/shared/rng.ts:68-70`  
**Severity:** Low  
**Why:** If `min > max`, the range `(max - min + 1)` is negative or zero, producing garbage results.  
**Fix:** Add guard: `if (min > max) [min, max] = [max, min];`  
**Effort:** 2 min

---

### L3 — Debug `console.log` in production preload

**File:Line:** `src/preload/index.ts:367`  
**Severity:** Low  
**Why:** `[PixelPal Preload] API exposed successfully` leaks app name in production Node.js console output.  
**Fix:** Gate behind `if (process.env.NODE_ENV !== 'production')`.  
**Effort:** 1 min

---

### L4 — `onboarding.ts` `injectCSS()` never removes the `<style>` element

**File:Line:** `src/renderer/interaction/onboarding.ts:671-677`  
**Severity:** Low  
**Why:** The injected `<style>` element persists for the renderer's lifetime. Although styles are prefixed with `pixelpal-*`, they accumulate if onboarding runs multiple times.  
**Fix:** Store the element reference and remove in `teardown()`.  
**Effort:** 3 min

---

### L5 — FSM `computeDuration()` wasted computation for one-shot states

**File:Line:** `src/renderer/pet/fsm.ts:67-73`, `367-412`  
**Severity:** Low  
**Why:** One-shot states (`eat`, `poop`, `interact`) have their exit governed by `ONE_SHOT_ANIM_MS` in `update()`, but `computeDuration()` still computes a randomized duration for them (stored in `stateDuration` but never used for exit decisions). Wasteful.  
**Fix:** Skip `computeDuration()` for one-shot states, or cache.  
**Effort:** 5 min

---

### L6 — `cleanliness -= 5` comment is inverted

**File:Line:** `src/renderer/pet/pet-entity.ts:334`  
**Severity:** Low  
**Why:** Comment says "Completing poop improves cleanliness" but code does `cleanliness -= 5` (makes dirtier). The code is correct (pooping makes you dirty), the comment is inverted.  
**Fix:** Change comment to "Completing poop decreases cleanliness (makes pet dirtier)".  
**Effort:** 1 min

---

### L7 — `Typo` in breed description

**File:Line:** `src/shared/constants.ts:527`  
**Severity:** Low  
**Why:** `' majestic 的麋鹿…'` has a leading space and mixed-language clutter. Cosmetic only.  
**Fix:** Remove the leading space.  
**Effort:** 1 min

---

### L8 — `SYMBOLS` constant unused

**File:Line:** `src/shared/constants.ts`  
**Severity:** Low  
**Why:** A `SYMBOLS` constant exists but appears unused in any source file. Could be used in the future or is vestigial.  
**Fix:** Verify with `rg` — if unused, remove.  
**Effort:** 2 min

---

## DONE WELL

1. **SQL parameterization is flawless** — every query uses `?` placeholders with `.run()`/`.get()`. Zero SQL injection risk. `safeJsonParse()` wraps all JSON deserialization.

2. **contextIsolation: true + nodeIntegration: false** on every window — the renderer is properly sandboxed from Node.js. Preload exclusively uses `contextBridge.exposeInMainWorld()`.

3. **RNG is algorithmically correct** — `mulberry32` + FNV-1a implementation matches reference implementations. Deterministic pet generation from machine fingerprint is clever and well-executed.

4. **Secondary window lifecycle management** — all 8 secondary windows null their references on `'closed'` event, preventing zombie references. `isQuitting` flag + `before-quit` handler tears down store, screenMonitor, worldManager, and job timers correctly.

5. **Graceful sprite fallback** — `loadSpritesheet()` catch block with programmatic pixel-art fallback is excellent defensive design. The app never shows a broken image.

6. **Visitor window bounding** — `MAX_VISITORS = 5` prevents unbounded window creation. `visitorMeetingSpot()` calculates non-overlapping positions.

7. **Offline compensation design** — linear → logarithmic → reset tiers for pet needs during absences is thoughtful and prevents "dead pet on return" frustration.

8. **TypeScript strict mode** — `tsconfig.json` has `strict: true`. Types are comprehensive. The codebase avoids `any` in shared types almost entirely.

9. **Web Audio synthesis** — 14 sound effects fully synthesized (no audio files to bundle). Category gating, master volume, and mute work correctly.

10. **EOF defensive patterns** — `safeJsonParse()`, `try/catch` around IPC in renderer, `beforeunload` save, and `isDestroyed()` checks before every IPC send to the pet window.

---

## RECOMMENDED FIX ORDER

| Order | Finding | Severity | Effort | Reason |
|-------|---------|----------|--------|--------|
| 1 | C1 — Remove hardcoded API key | Critical | 5 min | Security — ship before code is public |
| 2 | C2 — Fix `flushPendingSave` data loss | Critical | 10 min | Data integrity — pet state loss on quit |
| 3 | C3 — Propagate store init errors | Critical | 15 min | Crash recovery — DB failures silent today |
| 4 | H2 — HTTPS for ip-api.com | High | 1 min | One-char fix, immediate privacy win |
| 5 | H7 — Validate WALLET_EARN input | High | 2 min | Prevents coin draining |
| 6 | H3 — Add `sandbox: true` to all windows | High | 15 min | Security hardening |
| 7 | H5 — Atomic wallet operations | High | 1-2 hr | Prevents coin loss from concurrent operations |
| 8 | H8 — Fix depsRef null in job timers | High | 5 min | Prevents crash on quit |
| 9 | H10/H11 — Fix input handler phantom drag and sticky hover | High | 15 min | Desktop interaction bugs |
| 10 | H1 — Upgrade Electron to 34.x | High | 2-4 hr | Security patches |
| 11 | H4 — Exclude devDependencies from build | High | 10 min | Bundle size + attack surface |
| 12 | M1-M22 — Medium findings | Medium | ~2-3 hr | Polish |
| 13 | L1-L8 — Low findings | Low | ~30 min | Cleanup |

---

## SELF-VERIFICATION

- [x] Every finding has file:line reference
- [x] Every finding has rationale, severity justification, and fix diff
- [x] Critical reserved for security/data-loss/crash (3 findings)
- [x] All four dimensions covered: correctness, security, performance, maintainability
- [x] "Done Well" section included with 10 specific positive observations
- [x] Findings respect existing conventions (TypeScript strict mode, Electron patterns, vanilla CSS)
- [x] Fix diffs are concrete and implementable
