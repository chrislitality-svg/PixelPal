# PixelPal · 可爱小宠物 🐾

> A pixel-art desktop virtual pet that lives on your Windows desktop — always on top, always by your side.
> 一只生活在 Windows 桌面的像素虚拟宠物 —— 永远置顶，永远陪伴你。

[![Electron](https://img.shields.io/badge/Electron-28-47848F?logo=electron)](https://www.electronjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite)](https://vitejs.dev/)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%2010%2F11-blue?logo=windows)](https://github.com/chrislitality-svg/PixelPal)

**English** · [中文](#chinese)

PixelPal is a **transparent, always-on-top, pixel-art companion** that lives on your Windows desktop. It has autonomous behaviors driven by a finite state machine + behavior tree, reacts to your mouse interactions, and even responds to your computer's battery level, idle time, and the real-world weather. Each pet is a one-of-a-kind "blind box" — its species, breed, and personality are deterministically derived from your computer's fingerprint.

---

## ✨ Features

### Core Gameplay
- 🐱 **11 Animal Species** — Cat, Dog, Rabbit, Sheep, Cow, Rodent, Bird, Fox, Deer, Panda, Dragon
- 🎨 **60+ Breeds** — Each species has multiple color variants, from common to mythic rarity
- 📦 **Machine-Bound Blind Box** — Your pet's species, breed, and six personality attributes are deterministically derived from your computer's fingerprint. Same machine, same pet soul.
- 🧬 **Six-Dimension Attributes** (10~90) — Strength / Agility / Appetite / Playful / Hygiene / Wisdom — determine behavior weights and state durations
- 🍖 **Four-Dimension Needs** (0~100) — Hunger / Energy / Happiness / Cleanliness — decay over time, trigger autonomous behaviors, and drift offline while the app is closed

### Smart AI
- 🧠 **FSM State Machine** — 14 states (idle, wander, eat, poop, selfplay, daydream, sleep, fish, chat, interact, drag, stuffed, approach) with valid transition graph
- 🌳 **Behavior Tree** — 5-tier priority evaluation: Emergency → Physiological → Entertainment → Random → Default. BehaviorRateLimiter prevents loops.
- 🌍 **Desktop Roamer** — The pet window moves across your entire desktop. Screen-edge peeking, mischief triggers, and coin finds during roaming.
- ⏰ **Empathy Clock** — Context-aware of real-world time: late-night sleep, morning greetings, Friday playfulness, system idle loneliness, low-battery tiredness, lock/unlock greetings
- ☁️ **Attribute Drift** — Over time, your pet's attributes slowly shift based on how it spends its days. Daydreaming increases wisdom; playing increases playfulness. Daily caps and sum conservation.

### Economy & Progression
- 💼 **Work Dispatch** — Send your pet to 90+ themed jobs across 12 categories (tech, errands, food, outdoor, creative, home, performance, office, fantasy, space, weird). Real-time countdown with progress bar.
- 🛒 **Pet Shop** — Spend love coins on food, toys, cosmetics (hats/glasses/accessories with per-species anchor points), and special items. Seasonal gating.
- 🏆 **Achievement System** — Milestones with coin rewards. Unlocked/locked states with grayscale styling.
- 📖 **Breed Collection (图鉴)** — Discover breeds across incarnations. Undiscovered breeds shown as silhouettes with "???".
- 📈 **Growth Report** — Stats dashboard + Canvas line chart of six-attribute drift over time (hourly snapshots, capped at 90 points).

### Interaction & Social
- 🖱️ **Mouse Interaction** — Left-click to pet the head, double-click to chat, triple-click to poke, drag to move, right-click for full action menu
- 💬 **Speech Bubbles** — Contextual bubbles expressing needs, mood, weather reports, cold jokes, coin finds, memory recalls
- 🧑‍🤝‍🧑 **Visitor System** — Friend pets walk in from screen edges to greet your pet. Party mode spawns 3-4 guests with staggered arrivals. Up to 5 simultaneous visitors.
- 🎉 **Level-Up Celebration** — Animated banner + particle effects on level-up and evolution
- 📷 **GIF Recorder & Screenshot** — Capture 3-second GIFs or PNG screenshots of your pet. Auto-saves to your Downloads folder.

### Immersion & Polish
- 🌦️ **Weather Awareness** — IP geolocation + Open-Meteo weather API. Pet reports weather with clothing advice (fully best-effort, no data stored).
- 🔔 **System Tray** — Minimize to tray, right-click menu for quick actions (feed, status, work, settings, quit)
- 🚀 **Auto-Start** — Optional launch-at-login via Windows registry (portable build compatible)
- 🎵 **Web Audio Sound Effects** — 14 fully synthesized sounds (zero audio files). Categorized into interaction, reward, and ambient groups, each independently toggleable.
- 🖌️ **Programmatic Pixel Art** — No spritesheet required. Fallback chibi cat + 11 per-species pixel drawing functions. Equipped cosmetics (hats/glasses/accessories) with species-specific anchor points.
- 🤖 **Optional LLM Chat** — Configurable provider (built-in / Ollama / OpenAI-compatible). Timeout fallback to template replies.

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Framework | Electron 28 |
| Language | TypeScript 5.7 (strict mode) |
| Bundler | Vite 6 (multi-page app) |
| Rendering | Canvas 2D — programmatic pixel art |
| State Machine | Custom FSM (14 states, validated transitions) |
| AI | Behavior Tree (5-tier priority evaluation) |
| Persistence | better-sqlite3 (single-file SQLite with WAL mode) |
| Audio | Web Audio API — fully synthesized, zero audio files |
| Packaging | electron-builder → portable `.exe` (no installer) |
| CI/CD | GitHub Actions — CI check + Release auto-build |

---

## 🚀 Quick Start

### Prerequisites
- Node.js 20+
- npm 9+
- Windows 10/11

### Development

```bash
git clone https://github.com/chrislitality-svg/PixelPal.git
cd PixelPal

npm install
npm run dev          # Concurrent Vite HMR + Electron
```

### Production Build

```bash
npm run build        # Vite build + TypeScript compile
npm run build:win    # Package as portable .exe
```

Output: `dist/可爱小宠物.exe`

### Environment Variables (optional)

| Variable | Purpose |
|---|---|
| `IMAGE_GEN_GRSAI_API_KEY` | API key for pet avatar/background generation |
| `IMAGE_GEN_GRSAI_NODES` | Comma-separated custom API node URLs |

---

## 📁 Project Structure

```
PixelPal/
├── src/
│   ├── main/                 # Electron main process
│   │   ├── index.ts          # App lifecycle & orchestration
│   │   ├── pet-manager.ts    # Pet window creation & management
│   │   ├── ipc-handlers.ts   # All IPC handlers (30+ channels)
│   │   ├── store.ts          # SQLite persistence (~900 lines)
│   │   ├── tray.ts           # System tray with context menu
│   │   ├── screen-monitor.ts # Work area, battery, idle tracking
│   │   ├── weather.ts        # IP geolocation + Open-Meteo
│   │   ├── world-manager.ts  # Full-work-area poop overlay
│   │   ├── auto-start.ts     # Windows registry login item
│   │   └── grsai.ts          # AI image generation client
│   ├── preload/
│   │   └── index.ts          # Context bridge (60+ IPC methods)
│   ├── renderer/
│   │   ├── main.ts           # ★ Master orchestrator (~1550 lines)
│   │   ├── settings.ts       # Settings page logic
│   │   ├── status.ts         # Status card (radar chart, needs bars)
│   │   ├── shop.ts           # Shop page (wallet, buy, equip)
│   │   ├── gallery.ts        # Achievements & breed collection
│   │   ├── report.ts         # Growth report & attribute chart
│   │   ├── work.ts           # Job dispatch page
│   │   ├── visitor.ts        # Guest pet walk-in animation
│   │   ├── world.ts          # Desktop poop overlay renderer
│   │   ├── pet/
│   │   │   ├── pet-entity.ts # PetManager (attributes, needs, milestones)
│   │   │   ├── fsm.ts        # Finite State Machine (14 states)
│   │   │   ├── behavior-tree.ts # AI brain (5-tier priority)
│   │   │   ├── needs.ts      # 4D needs system + offline drift
│   │   │   └── attributes.ts # 6D attribute system + drift
│   │   ├── engine/
│   │   │   ├── renderer.ts   # Canvas 2D pet rendering (~1400 lines)
│   │   │   ├── game-loop.ts  # RAF-based loop (30/10fps)
│   │   │   ├── sound.ts      # Web Audio synthesized SFX (14 sounds)
│   │   │   └── sprite-animation.ts
│   │   ├── interaction/
│   │   │   ├── input-handler.ts  # Click, drag, context menu
│   │   │   ├── bubble.ts     # Speech bubble management
│   │   │   ├── drag-handler.ts   # Window drag geometry
│   │   │   ├── onboarding.ts # 5-step first-time experience
│   │   │   └── gif-recorder.ts   # Canvas → GIF
│   │   ├── sprites/
│   │   │   ├── sprite-generator.ts  # Programmatic pixel art
│   │   │   └── species-drawers.ts   # Per-species drawing functions
│   │   └── world/
│   │       └── roamer.ts     # Full-desktop window movement
│   └── shared/
│       ├── types.ts          # Interfaces, IPC channels, types
│       ├── constants.ts      # Breeds, items, jobs, milestones (~980 lines)
│       └── rng.ts            # Deterministic PRNG (mulberry32 + FNV-1a)
├── index.html                # Main pet window (256×350px, transparent)
├── settings.html
├── status.html
├── shop.html
├── gallery.html
├── report.html
├── work.html
├── visitor.html
├── world.html                # Full-screen poop overlay
├── electron-builder.yml      # Packaging config
├── vite.config.ts
└── tsconfig.json
```

---

## 🖥️ Architecture

### Data Flow

```
Main Process (Node.js)
  ├── Store (better-sqlite3)  ← Single source of truth
  ├── PetManager              ← Window lifecycle
  ├── ScreenMonitor           ← System events (lock, idle, battery)
  └── IPC Handlers            ← 30+ channels
        ↕ contextBridge
Renderer Process (Chromium)
  ├── PetManager (runtime)    ← Live pet state & AI
  ├── GameLoop (RAF)          ← 30fps active / 10fps idle
  ├── PetRenderer (Canvas 2D) ← Pixel art + particles + cosmetics
  └── InputHandler            ← Mouse → actions
```

### Pet Generation

1. Machine fingerprint = `hashStringToSeed(hostname + MAC)` → FNV-1a
2. Species = weighted random from fingerprinted seed
3. Breed = weighted random within species distribution (0.5% hidden variant chance)
4. Six attributes = balanced redistribution (total always sums to 300 ± 20)
5. Deterministic = same machine always gets the same pet (different incarnation index shifts the seed)

### Autonomous Behavior

```
Game Loop (every ~33ms at 30fps)
  → updateNeeds(dt)          // Hunger/energy/happiness/cleanliness decay
  → attributeDrift.update()  // Slow attribute shift from behaviors
  → BehaviorTree.evaluate()  // Priority: Emergency > Physiological > Entertainment > Random > Default
  → FSM.update(dt)           // State transitions & duration checks
  → resolveBehaviorTransition()
  → Renderer.draw()          // Canvas pixel art + particles + mood
```

---

## 📸 Screenshots

*(Add your own screenshots here — pet on desktop, status card, shop, work dispatch, gallery, onboarding)*

| Onboarding | Status Card | Shop | Work |
|---|---|---|---|
| ![onboarding](screenshots/onboarding.png) | ![status](screenshots/status.png) | ![shop](screenshots/shop.png) | ![work](screenshots/work.png) |

---

## 🤝 Contributing

Issues and Pull Requests are welcome!

Before submitting, please:
1. Run `npm run typecheck` and `npm run lint` to ensure no errors
2. Follow existing code conventions (TypeScript strict mode, canvas-based rendering, vanilla CSS)
3. Test on Windows 10/11

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

<br>

---

# <a id="chinese">中文文档</a>

## 可爱小宠物 🐾

> 一只生活在 Windows 桌面的像素虚拟宠物 —— 永远置顶，永远陪伴你。

PixelPal 是一个**透明、置顶、像素风格的桌面伙伴**，生活在你的 Windows 桌面上。它由有限状态机和行为树驱动，拥有自主行为，会响应你的鼠标交互，甚至能感知你电脑的电量、闲置时间和真实的天气。每一只宠物都是独一无二的"盲盒"——它的物种、品种和性格由你的电脑指纹通过确定性算法生成。

---

## ✨ 功能特性

### 核心玩法
- 🐱 **11 种动物大类** — 猫、狗、兔、羊、牛、鼠、鸟、狐狸、鹿、熊猫、龙
- 🎨 **60+ 品种** — 每个物种下多种配色品种，从普通到神话稀有度
- 📦 **设备绑定盲盒** — 宠物的物种、品种和六个性格属性的分配值由你电脑的指纹（主机名 + MAC 地址）通过 FNV-1a 哈希生成确定。同一台电脑开出的永远是同一只宠物的"灵魂"，转生次数会改变种子
- 🧬 **六维属性** (10~90) — 力量 / 敏捷 / 食欲 / 贪玩 / 洁癖 / 智慧 — 属性影响行为权重和状态持续时间
- 🍖 **四维需求** (0~100) — 饥饿 / 精力 / 快乐 / 清洁 — 随时间衰减，触发自主行为，关掉程序期间也会离线漂移

### 智能 AI
- 🧠 **FSM 状态机** — 14 个状态（idle/wander/eat/poop/selfplay/daydream/sleep/fish/chat/interact/drag/stuffed/approach），包含合法的状态转换图
- 🌳 **行为树** — 5 层优先级判定：紧急 → 生理 → 娱乐 → 随机 → 默认。内置行为限流器防止循环
- 🌍 **桌面漫游** — 宠物窗口可以在整个桌面上移动，含屏幕边缘探出效果、恶作剧触发和漫游找币
- ⏰ **共情时钟** — 感知真实世界时间：深夜自动睡觉、早晨热情问候、周五下午游戏心情、系统 30 分钟闲置触发寂寞、电量低于 20% 表现疲惫、锁屏/解锁触发一次性问候
- ☁️ **属性漂移** — 宠物长期的行为会缓慢改变六维属性：白日梦增加智慧、玩耍增加贪玩值、进食增加食欲、漫游增加敏捷、清理便便增加洁癖。每天按属性 ±5 上限，六维和维持在 280~320 之间

### 经济与成长
- 💼 **打工赚钱** — 可派遣宠物从事 90+ 种主题工作，涵盖 12 个类别（科技/跑腿/宠物/美食/户外/创意/家居/表演/办公/奇幻/太空/奇葩）。实时倒计时 + 进度条的活跃工作横幅显示
- 🛒 **宠物商店** — 用爱心币购买食物、玩具、装扮（帽子/眼镜/饰品，每种宠物有自己的锚点位置）和特殊物品。冬季有季节限定
- 🏆 **成就里程碑** — 有金币奖励的里程碑。已解锁/未锁定状态以灰度展示，已达成显示 ✓
- 📖 **图鉴收藏** — 跨转生发现品种（图鉴）。未发现的品种显示为"????"剪影。稀有度分级
- 📈 **成长报告** — 统计面板 + 六维属性随时间变化的曲线图（Canvas 绘制，每小时一条快照，最多 90 条）

### 互动与社交
- 🖱️ **鼠标交互** — 左键单击摸头、双击对话、三击戳一戳、拖拽移动、右键弹出完整菜单
- 💬 **气泡对话** — 上下文气泡表达需求、心情、天气播报、冷笑话、捡币提示、回忆语录
- 🧑‍🤝‍🧑 **访客系统** — 朋友宠物从屏幕边缘走进来打招呼。派对模式一次召唤 3-4 位客人错时登场。最多 5 位同时访问
- 🎉 **升级庆祝** — 升级/进化时有动画横幅 + 粒子特效
- 📷 **GIF 录制/截图** — 录制 3 秒动图或截图保存到"下载"文件夹

### 沉浸与打磨
- 🌦️ **天气感知** — IP 定位 + Open-Meteo 天气 API。宠物每天早上播报天气和穿搭建议（纯尽力而为，不存储数据）
- 🔔 **系统托盘** — 最小化到托盘，托盘右键菜单快速操作（显示/隐藏、喂食、状态、打工、清理便便、设置、退出）
- 🚀 **开机自启** — 通过 Windows 注册表支持便携版适配
- 🎵 **Web Audio 音效** — 14 种完全合成的音效（零音频文件）。分为互动/奖励/环境三类，各自可独立开关，含总音量滑条
- 🖌️ **程序化像素绘制** — 无需精灵图文件。含默认 Q 版橘猫回退逻辑 + 11 种动物各自独立的像素绘制函数。可装备饰品含每种动物的锚点系统
- 🤖 **可选 LLM 聊天** — 配置服务商（内置/本地 Ollama/OpenAI 兼容接口）。超时 (>10s) 自动降级为模板回复

---

## 🛠️ 技术栈

| 层 | 技术 |
|---|---|
| 框架 | Electron 28 |
| 语言 | TypeScript 5.7 (strict mode) |
| 构建 | Vite 6 (多页面应用) |
| 渲染 | Canvas 2D — 程序化像素绘制 |
| 状态机 | 自定义 FSM (14 状态, 合法转换) |
| AI | 行为树 (5 层优先级判定) |
| 持久化 | better-sqlite3 (单文件 SQLite, WAL 模式) |
| 音频 | Web Audio API — 全合成, 零音频文件 |
| 打包 | electron-builder → 便携 .exe (免安装) |
| CI/CD | GitHub Actions — CI 检查 + Release 自动构建 |

---

## 🚀 快速开始

### 环境要求
- Node.js 20+
- npm 9+
- Windows 10/11

### 开发

```bash
git clone https://github.com/chrislitality-svg/PixelPal.git
cd PixelPal

npm install
npm run dev          # 同时启动 Vite HMR 和 Electron
```

### 构建

```bash
npm run build        # Vite 构建 + TypeScript 编译
npm run build:win    # 打包为便携 .exe 文件
```

产物：`dist/可爱小宠物.exe`

### 可选环境变量

| 变量 | 用途 |
|---|---|
| `IMAGE_GEN_GRSAI_API_KEY` | 宠物头像/背景生成的 API 密钥 |
| `IMAGE_GEN_GRSAI_NODES` | 自定义 API 节点地址（逗号分隔） |

---

## 📁 项目结构

```
PixelPal/
├── src/
│   ├── main/                 # Electron 主进程
│   │   ├── index.ts          # 应用生命周期与调度
│   │   ├── pet-manager.ts    # 宠物窗口创建与管理
│   │   ├── ipc-handlers.ts   # 全部 IPC 处理 (30+ 通道)
│   │   ├── store.ts          # SQLite 持久化 (~900 行)
│   │   ├── tray.ts           # 系统托盘及右键菜单
│   │   ├── screen-monitor.ts # 工作区/电池/闲置检测
│   │   ├── weather.ts        # IP 定位 + Open-Meteo 免费天气
│   │   ├── world-manager.ts  # 全桌面大小透明便便图层
│   │   ├── auto-start.ts     # Windows 注册表开机启动
│   │   └── grsai.ts          # AI 图像生成客户端
│   ├── preload/
│   │   └── index.ts          # Context Bridge (60+ IPC 方法)
│   ├── renderer/
│   │   ├── main.ts           # ★ 渲染进程主控 (~1550 行)
│   │   ├── settings.ts       # 设置页面
│   │   ├── status.ts         # 状态卡 (雷达图/需求条)
│   │   ├── shop.ts           # 商店页面 (钱包/购买/装备)
│   │   ├── gallery.ts        # 成就与图鉴
│   │   ├── report.ts         # 成长报告与属性曲线
│   │   ├── work.ts           # 打工派遣页面
│   │   ├── visitor.ts        # 访客宠物走入动画
│   │   ├── world.ts          # 桌面便便图层渲染
│   │   ├── pet/
│   │   │   ├── pet-entity.ts # PetManager (属性/需求/里程碑)
│   │   │   ├── fsm.ts        # 有限状态机 (14 状态)
│   │   │   ├── behavior-tree.ts # AI 大脑 (5 层优先级)
│   │   │   ├── needs.ts      # 四维需求系统 + 离线漂移
│   │   │   └── attributes.ts # 六维属性系统 + 属性漂移
│   │   ├── engine/
│   │   │   ├── renderer.ts   # Canvas 2D 宠物渲染 (~1400 行)
│   │   │   ├── game-loop.ts  # RAF 循环 (30/10fps)
│   │   │   ├── sound.ts      # Web Audio 合成音效 (14 种)
│   │   │   └── sprite-animation.ts
│   │   ├── interaction/
│   │   │   ├── input-handler.ts  # 点击/拖拽/右键菜单
│   │   │   ├── bubble.ts     # 气泡管理
│   │   │   ├── drag-handler.ts   # 窗口拖拽几何
│   │   │   ├── onboarding.ts # 5 步首次体验引导
│   │   │   └── gif-recorder.ts   # Canvas → GIF
│   │   ├── sprites/
│   │   │   ├── sprite-generator.ts  # 程序化像素生成
│   │   │   └── species-drawers.ts   # 分物种像素绘制
│   │   └── world/
│   │       └── roamer.ts     # 桌面全屏移动
│   └── shared/
│       ├── types.ts          # 接口/IPC 通道/类型定义
│       ├── constants.ts      # 品种/物品/工作/里程碑数据 (~980 行)
│       └── rng.ts            # 确定性随机数 (mulberry32 + FNV-1a)
├── index.html                # 主宠物窗 (256×350px, 透明)
├── settings.html             # 设置页
├── status.html               # 状态卡
├── shop.html                 # 商店
├── gallery.html              # 成就图鉴
├── report.html               # 成长报告
├── work.html                 # 打工
├── visitor.html              # 访客
├── world.html                # 全屏便便图层
├── electron-builder.yml      # 打包配置
├── vite.config.ts
└── tsconfig.json
```

---

## 🖥️ 架构说明

### 数据流

```
主进程 (Node.js)
  ├── Store (better-sqlite3)  ← 唯一数据源
  ├── PetManager              ← 窗口生命周期
  ├── ScreenMonitor           ← 系统事件 (锁屏/闲置/电池)
  └── IPC 处理器              ← 30+ 通道
        ↕ contextBridge
渲染进程 (Chromium)
  ├── PetManager (运行时)     ← 活动宠物状态与 AI
  ├── GameLoop (RAF)          ← 30fps 活跃 / 10fps 闲置
  ├── PetRenderer (Canvas 2D) ← 像素绘制 + 粒子特效 + 饰品
  └── InputHandler            ← 鼠标交互 → 动作
```

### 宠物生成流程

1. 设备指纹 = `hashStringToSeed(主机名 + MAC)` → FNV-1a 哈希
2. 物种 = 加权随机从指纹种子中选取
3. 品种 = 物种分布内加权随机（0.5% 隐藏异色概率）
4. 六维属性 = 平衡重分配（总和始终维持在 300 ± 20）
5. 确定性 = 同一台电脑永远生成同一只宠物（不同转生次数会偏移种子）

### 自主行为循环

```
游戏循环（30fps 时每 ~33ms 一次）
  → updateNeeds(dt)          // 饥饿/精力/快乐/清洁衰减
  → attributeDrift.update()  // 行为引起的缓慢属性漂移
  → BehaviorTree.evaluate()  // 优先级：紧急 > 生理 > 娱乐 > 随机 > 默认
  → FSM.update(dt)           // 状态转换与持续时间检查
  → resolveBehaviorTransition()
  → Renderer.draw()          // Canvas 像素绘制 + 粒子 + 心情
```

---

## 📸 截图

*(在此处添加你自己的截图——宠物桌面展示、状态卡、商店、打工、图鉴、引导流程)*

| 引导流程 | 状态卡 | 商店 | 打工 |
|---|---|---|---|
| ![引导](screenshots/onboarding.png) | ![状态](screenshots/status.png) | ![商店](screenshots/shop.png) | ![打工](screenshots/work.png) |

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

提交前请注意：
1. 运行 `npm run typecheck` 和 `npm run lint` 确保无错误
2. 遵循现有代码规范（TypeScript strict mode、Canvas 渲染、原生 CSS）
3. 在 Windows 10/11 上测试

---

## 📄 协议

MIT License — 详见 [LICENSE](LICENSE)。
