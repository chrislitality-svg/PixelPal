// ============================================================
// PixelPal 全局类型定义
// ============================================================

// ---- 六维属性 ----
export interface PetAttributes {
  strength: number;   // 力量 10~90
  agility: number;    // 敏捷 10~90
  appetite: number;   // 食欲 10~90
  playful: number;    // 贪玩 10~90
  hygiene: number;    // 洁癖 10~90
  wisdom: number;     // 智慧 10~90
}

// ---- 四维需求 ----
export interface PetNeeds {
  hunger: number;      // 0~100，越高越饿
  energy: number;      // 0~100，越低越累
  happiness: number;   // 0~100，越高越开心
  cleanliness: number; // 0~100，越低越脏
}

// ---- 动物大类 ----
export type PetSpecies =
  | 'cat' | 'dog' | 'rabbit' | 'sheep' | 'cow'
  | 'rodent' | 'bird' | 'fox' | 'deer' | 'panda' | 'dragon';

// ---- 宠物类型 (backward compat alias) ----
export type PetType = PetSpecies;

// ---- 稀有度 ----
export type Rarity = 'common' | 'normal' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic';

// ---- 品种配色 ----
export interface BreedColors {
  body: string;
  bodyDark: string;
  belly: string;
  eye: string;
  nose: string;
  ear: string;
  earInner: string;
  accent?: string;      // breed-specific accent (spots, stripes, etc.)
  accent2?: string;     // secondary accent
}

// ---- 品种定义 ----
export interface BreedDefinition {
  id: string;           // unique breed ID
  name: string;         // Chinese display name
  species: PetSpecies;
  rarity: Rarity;
  weight: number;       // selection weight within species
  colors: BreedColors;  // pixel art color palette
  attributeModifiers: Partial<Record<keyof PetAttributes, number>>; // +/- modifier
  description: string;  // short Chinese description
  isVariant?: boolean;  // true for special hidden variants
}

// ---- FSM 状态 ----
export type PetState =
  | 'idle'
  | 'wander'
  | 'eat'
  | 'poop'
  | 'selfplay'
  | 'daydream'
  | 'sleep'
  | 'fish'
  | 'drag'
  | 'chat'
  | 'interact'
  | 'stuffed'
  | 'approach';

// ---- 动画名称 ----
export type AnimationName =
  | 'idle'
  | 'walk'
  | 'eat'
  | 'eat-fast'
  | 'stuffed'
  | 'poop'
  | 'poop-drop'
  | 'selfplay'
  | 'daydream'
  | 'drag'
  | 'sleep'
  | 'levelup'
  | 'fish'
  | 'chat'
  | 'interact-pet'
  | 'interact-poke'
  | 'surprised';

// ---- 便便位置 ----
export interface PoopLocation {
  x: number;
  y: number;
  createdAt: number;
}

// ---- 食物 ----
export interface FoodItem {
  id: string;
  name: string;
  type: 'normal' | 'premium' | 'rare' | 'spoiled';
  hungerRestore: number;
  happinessBonus: number;
  x: number;
  y: number;
  spawnedAt: number;
}

// ---- 物品 ----
export interface InventoryItem {
  id: string;
  name: string;
  type: 'food' | 'toy' | 'accessory' | 'collectible';
  quantity: number;
  description: string;
}

// ---- 装备 ----
export interface PetEquipment {
  hat?: string;
  accessory?: string;
  weapon?: string;
}

// ---- LLM 配置 ----
export interface LLMConfig {
  enabled: boolean;
  provider: 'builtin' | 'ollama' | 'openai' | 'anthropic' | 'custom' | 'off';
  baseUrl: string;
  apiKeyEncrypted: string;
  model: string;
  monologueFrequency: number; // 1~10
  replyStyle: string;
  modelDownloaded?: boolean;     // whether local model is cached
  inferenceTimeout?: number;      // ms, default 10000
}

// ---- 羁绊记忆 ----
export interface BondingMemory {
  id: string;
  type: 'first_evolution' | 'first_levelup' | 'funniest_llm'
      | 'longest_session' | 'first_poop_cleaned'
      | 'milestone_100_pets' | 'custom';
  description: string;
  timestamp: number;
  snapshot?: string;
}

// ---- 羁绊数据 ----
export interface BondingData {
  firstMetAt: number;
  totalPets: number;
  totalFeeds: number;
  daysTogether: number;
  totalInteractions: number;
  milestones: string[];
  memories: BondingMemory[];  // qualitative memory points
  // ---- 性格随互动演变（0~100，初始 50）----
  affection?: number;         // 粘人度：摸头/喂食 ↑
  boldness?: number;          // 胆量：拖拽/戳 ↓（越低越胆小）
}

// ---- 宠物实体 ----
export interface PetEntity {
  id: string;
  name: string;
  type: PetType;          // = species, kept for backward compat
  species: PetSpecies;    // animal category
  breed: string;          // breed ID
  attributes: PetAttributes;
  level: number;
  exp: number;
  expToNext: number;
  hp: number;
  maxHp: number;
  stats: { atk: number; def: number; spd: number; critRate: number };
  skills: string[];
  inventory: InventoryItem[];
  equipment: PetEquipment;
  needs: PetNeeds;
  evolutionStage: number;
  poopLocations: PoopLocation[];
  llmConfig?: LLMConfig;
  bonding: BondingData;
  createdAt: number;
  lastActiveAt: number;
  totalPlayTime: number;
}

// ---- 行为频率档位（用户可控）----
export type FreqLevel = 'off' | 'low' | 'medium' | 'high';

// ---- 应用设置 ----
export interface AppSettings {
  autoStart: boolean;
  powerSave: boolean;
  soundEnabled: boolean;
  soundVolume: number;       // 0~100 主音量
  sfxInteraction: boolean;   // 互动音（摸头/喂食/戳）
  sfxReward: boolean;        // 奖励音（金币/升级/进化/成就/打工）
  sfxAmbient: boolean;       // 环境音（拉屎/恶作剧/冷笑话/天气）
  bubbleFrequency: number;   // 1~10
  focusMode: boolean;
  // ---- 新增行为开关 ----
  roam: boolean;             // 是否允许宠物在整个桌面漫游
  mischiefLevel: FreqLevel;  // 调皮打开文件夹的自动频率（手动菜单始终可用）
  weatherEnabled: boolean;   // 是否每天播报天气
  jokeLevel: FreqLevel;      // 讲冷笑话的自动频率（手动菜单始终可用）
  // ---- 机器绑定种子（盲盒） ----
  machineSeed: number;       // 与本机绑定的稳定种子
  incarnation: number;       // 第几只（杀死宠物后 +1，决定下一只盲盒）
  // ---- 每日去重 ----
  lastWeatherDate: string;   // YYYY-MM-DD，最近一次天气播报日期
  lastCoinDate: string;      // YYYY-MM-DD，最近一次每日登录金币日期
  // ---- grsai 生成的可爱素材 ----
  generatedAvatar?: string;  // 宠物头像图片（file:// 路径或 data url）
  generatedBg?: string;      // 卡片背景图片
}

// ---- 机器种子信息（盲盒用） ----
export interface MachineSeedInfo {
  machineSeed: number;
  incarnation: number;
  /** combineSeed(machineSeed, incarnation) — 直接喂给 SeededRandom */
  effectiveSeed: number;
}

// ---- 桌面便便（绝对桌面坐标） ----
export interface WorldPoop {
  id: string;
  x: number;          // 桌面绝对坐标 (DIP)
  y: number;
  createdAt: number;
}

// ---- 天气信息 ----
export interface WeatherInfo {
  city: string;
  description: string;   // 天气中文描述
  tempMin: number;
  tempMax: number;
  tempNow: number;
  advice: string;        // 穿衣建议
  message: string;       // 组合好的整句播报
  icon: string;          // emoji 天气图标
}

// ---- 推送气泡（主进程 → 渲染进程） ----
export interface PushBubblePayload {
  text: string;
  type: BubbleType;
  duration: number;
  icon?: string;
}

// ---- 商店 / 货币 ----
export type ShopCategory = 'food' | 'toy' | 'cosmetic' | 'special';
export type CosmeticSlot = 'hat' | 'glasses' | 'accessory';
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

/** 消耗品作用：对需求的增量 + 经验。 */
export interface ShopItemEffect {
  hunger?: number;       // 对饥饿值的增量（负=喂饱）
  energy?: number;
  happiness?: number;
  cleanliness?: number;
  exp?: number;
}

export interface ShopItem {
  id: string;
  name: string;
  icon: string;          // emoji
  price: number;         // 金币价格
  category: ShopCategory;
  desc: string;
  effect?: ShopItemEffect;   // 消耗品用
  slot?: CosmeticSlot;       // 装扮用
  rarity?: Rarity;           // 稀有度（装扮）
  season?: Season;           // 季节限定（仅当季可买）
}

/** 钱包：金币 + 已拥有装扮 + 已穿戴装扮（主进程为唯一写入方）。 */
export interface Wallet {
  coins: number;
  cosmetics: string[];                      // 已拥有的装扮 item id
  equipped: Partial<Record<CosmeticSlot, string>>;
  totalEarned?: number;                     // 累计赚取的金币（统计用）
  jobsDone?: number;                        // 累计完成的打工次数
}

/** 属性历史快照（成长报告折线图用）。 */
export interface AttrSnapshot {
  t: number;                                // 时间戳
  a: PetAttributes;
}

/** 购买结果。 */
export interface BuyResult {
  ok: boolean;
  wallet: Wallet;
  error?: 'coins' | 'unknown';
  itemId?: string;
}

// ---- 打工系统 ----
export interface Job {
  id: string;
  name: string;
  icon: string;          // emoji 场景图标
  category: string;      // 分类 key
  durationSec: number;   // 工作时长（秒）
  reward: number;        // 完成奖励金币
  desc: string;
}

export interface JobCategory {
  key: string;
  label: string;
}

/** 当前打工状态（一次只能打一份工）。 */
export interface JobState {
  current: { id: string; startedAt: number; endsAt: number } | null;
  now: number;           // 服务器(主进程)当前时间，用于校准倒计时
}

/** 收取打工奖励的结果。 */
export interface JobCollectResult {
  ok: boolean;
  reward?: number;          // 实发奖励（含随机事件加成）
  baseReward?: number;      // 基础奖励
  jobName?: string;
  wallet?: Wallet;
  event?: string;           // 随机事件标签（💥暴击 / 🍀幸运），无则普通
  error?: 'none' | 'working';
}

// ---- IPC 通道 ----
export const IPC_CHANNELS = {
  // Renderer → Main
  PET_STATE_CHANGED: 'pet:state-changed',
  PET_NEEDS_UPDATE: 'pet:needs-update',
  PET_SAVE: 'pet:save',
  PET_LOAD: 'pet:load',
  PET_EXISTS: 'pet:exists',
  PET_DELETE: 'pet:delete',
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  OPEN_SETTINGS: 'settings:open',
  OPEN_STATUS: 'status:open',
  GET_SCREEN_INFO: 'screen:info',
  GET_TIME_CONTEXT: 'context:time',
  MOVE_PET: 'pet:move',
  FOCUS_MODE: 'pet:focus-mode',

  // ---- 机器种子 / 盲盒 / 放归宠物 ----
  GET_MACHINE_SEED: 'seed:get',
  KILL_PET: 'pet:kill',
  RELEASE_AND_QUIT: 'pet:release-quit',   // 放归后不再领养 → 退出程序

  // ---- 恶作剧：打开文件夹 ----
  MISCHIEF_OPEN_FOLDER: 'mischief:open-folder',

  // ---- 桌面便便世界 ----
  WORLD_ADD_POOP: 'world:add-poop',
  WORLD_REMOVE_POOP: 'world:remove-poop',
  WORLD_CLEAR_POOPS: 'world:clear-poops',
  WORLD_GET_POOPS: 'world:get-poops',

  // ---- grsai 生图 ----
  IMAGE_GENERATE: 'image:generate',

  // ---- 商店 / 货币 ----
  OPEN_SHOP: 'shop:open',
  WALLET_GET: 'wallet:get',
  WALLET_EARN: 'wallet:earn',
  SHOP_BUY: 'shop:buy',

  // ---- 成就 / 图鉴 ----
  OPEN_GALLERY: 'gallery:open',
  GET_COLLECTION: 'collection:get',

  // ---- 成长报告 ----
  OPEN_REPORT: 'report:open',
  GET_ATTR_HISTORY: 'report:attr-history',

  // ---- 打工 ----
  OPEN_WORK: 'work:open',
  JOB_GET: 'job:get',
  JOB_START: 'job:start',
  JOB_COLLECT: 'job:collect',

  // ---- 访客串门 ----
  OPEN_VISITOR: 'visitor:open',
  OPEN_PARTY: 'visitor:party',
  MOVE_SELF: 'window:move-self',   // 让任意窗口移动自身（访客走路用）

  // ---- 设置窗口触发宠物动作（截图/录制）----
  PET_ACTION: 'pet:action',

  // Main → Renderer
  ON_PET_LOADED: 'on:pet-loaded',
  ON_SETTINGS_CHANGED: 'on:settings-changed',
  ON_FOCUS_MODE: 'on:focus-mode',
  ON_SHUTDOWN: 'on:shutdown',
  ON_PUSH_BUBBLE: 'on:push-bubble',       // 主进程推送气泡（天气/通知）
  ON_KILLED: 'on:killed',                  // 宠物被杀死，渲染进程需重新孵化
  ON_WALLET_CHANGED: 'on:wallet-changed',  // 钱包变化（金币/装扮）→ 全窗口
  ON_USE_ITEM: 'on:use-item',              // 主进程 → 宠物窗口：消耗品作用于活宠
  ON_PET_ACTION: 'on:pet-action',          // 主进程 → 宠物窗口：截图/录制
  ON_WORK_STATE: 'on:work-state',          // 主进程 → 宠物窗口：打工中(暂停行为)
  // World overlay 专用
  ON_WORLD_POOPS: 'on:world-poops',        // 主进程 → world 窗口：完整便便列表
} as const;

// ---- 时间上下文 ----
export interface TimeContext {
  hour: number;
  minute: number;
  dayOfWeek: number;
  isNight: boolean;     // 22:00~06:00
  isLateNight: boolean; // 00:00~05:00
  isMorning: boolean;   // 06:00~09:00
  isFridayAfternoon: boolean;
  idleMinutes: number;
  isLocked: boolean;        // screen is locked
  isSuspended: boolean;     // system was suspended
  batteryPercent: number;   // 0-100, -1 if desktop/no battery
  isLowBattery: boolean;    // <20%
  wasLocked: boolean;       // was locked since last check (one-shot for unlock greeting)
  wasSuspended: boolean;    // was suspended since last check (one-shot for resume greeting)
}

// ---- 气泡类型 ----
export type BubbleType = 'hunger' | 'energy' | 'happiness' | 'cleanliness' | 'monologue' | 'greeting' | 'info' | 'emoji';

export interface BubbleData {
  text: string;
  type: BubbleType;
  duration: number; // ms
  icon?: string;
}

// ---- 里程碑 ----
export interface Milestone {
  id: string;
  name: string;
  description: string;
  achievedAt?: number;
}

// ---- Onboarding 步骤 ----
export type OnboardingStep = 'hatch' | 'name' | 'feed' | 'pet' | 'complete';
