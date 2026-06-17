# PixelPal · 可爱小宠物 🐾

> 像素桌面宠物 —— 你的环境陪伴小生物，在桌面上养一只属于自己的像素小动物。

基于 **Electron + TypeScript + Vite** 构建的桌面宠物应用，支持多种动物品种、六维属性、四维需求、FSM 状态机 + 行为树驱动的自主行为，以及世界漫游、工作派遣、访客互动等丰富玩法。

---

## ✨ 功能

- 🐱 **11 种动物大类**：猫、狗、兔、羊、牛、鼠、鸟、狐狸、鹿、熊猫、龙
- 🎨 **丰富品种系统**：每个物种下多种配色品种，稀有度从普通到神话
- 🧬 **六维属性**：力量 / 敏捷 / 食欲 / 贪玩 / 洁癖 / 智慧（10~90）
- 🍖 **四维需求**：饥饿 / 精力 / 快乐 / 清洁，随时间衰减，影响行为
- 🧠 **智能行为**：FSM 状态机 + 行为树，自主走动、觅食、睡觉、玩耍
- 🌍 **世界漫游**：宠物可以离开屏幕去"世界"里探索、遇到其他漫游宠物
- 💼 **工作派遣**：派宠物外出工作赚金币
- 🛒 **商店系统**：用金币购买食物、饰品、道具
- 💬 **气泡对话**：宠物会用气泡表达需求、心情
- 📊 **状态面板**：查看宠物完整属性、需求、经验等级
- 🖱️ **交互**：拖拽移动、摸头、戳一戳、投喂
- 📷 **GIF 录制**：录制宠物动态分享
- 📋 **图鉴收集**：收集遇到过的品种
- 🌦️ **天气感知**：根据真实天气影响宠物行为
- 📺 **屏幕感知**：检测用户活动，调整宠物互动频率
- 🔔 **系统托盘**：最小化到托盘，后台持续运行
- 🚀 **开机自启**：可选随系统启动
- 🎯 **成就里程碑**：成长记录与里程碑

---

## 🛠️ 技术栈

| 层 | 技术 |
|---|------|
| 框架 | Electron 28 |
| 前端 | TypeScript + Vite 6 |
| 渲染 | Canvas 2D 像素绘制（自研 sprite 生成器） |
| 状态管理 | FSM 状态机 + 行为树 |
| 数据持久化 | better-sqlite3 |
| 构建 | electron-builder（Windows 免安装版） |
| CI/CD | GitHub Actions（CI 检查 + Release 自动构建） |

---

## 🚀 快速开始

### 环境要求

- Node.js 20+
- npm 9+
- Windows 10/11（当前仅支持 Windows）

### 安装与运行

```bash
# 克隆仓库
git clone https://github.com/pixelpal/PixelPal.git
cd PixelPal

# 安装依赖
npm install

# 开发模式（Vite HMR + Electron）
npm run dev

# 仅构建
npm run build

# 打包 Windows 免安装版
npm run build:win
```

构建产物在 `dist/` 目录，文件名为 `可爱小宠物.exe`。

---

## 📁 项目结构

```
PixelPal/
├── src/
│   ├── main/            # Electron 主进程
│   │   ├── index.ts         # 应用入口 & 生命周期
│   │   ├── pet-manager.ts   # 宠物管理器
│   │   ├── ipc-handlers.ts  # IPC 通信处理
│   │   ├── store.ts         # SQLite 持久化
│   │   ├── tray.ts          # 系统托盘
│   │   ├── screen-monitor.ts# 屏幕活动监测
│   │   ├── weather.ts       # 天气获取
│   │   ├── world-manager.ts # 世界漫游管理
│   │   ├── auto-start.ts    # 开机自启
│   │   └── grsai.ts         # AI 图像生成
│   ├── preload/         # Preload 脚本
│   ├── renderer/        # 渲染进程
│   │   ├── pet/             # 宠物实体/属性/需求/FSM/行为树
│   │   ├── sprites/         # 像素精灵生成 & 品种绘制
│   │   ├── engine/          # 游戏循环/渲染器/音效/动画
│   │   ├── interaction/     # 拖拽/气泡/GIF录制/新手引导
│   │   ├── world/           # 世界漫游
│   │   └── *.ts             # 各页面逻辑（商店/状态/图鉴等）
│   └── shared/          # 共享类型 & 常量
├── assets/              # 静态资源（图标等）
├── build/               # 构建资源（应用图标）
├── .github/workflows/   # CI/CD 流水线
├── *.html               # 各窗口页面入口
├── electron-builder.yml # 打包配置
└── vite.config.ts       # Vite 配置
```

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

---

## 📄 协议

本项目基于 [MIT License](LICENSE) 开源。
