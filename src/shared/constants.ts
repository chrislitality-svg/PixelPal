import type { PetSpecies, BreedDefinition, FreqLevel, ShopItem, Job, JobCategory } from './types';

// ============================================================
// PixelPal 全局常量
// ============================================================

// ---- 渲染 ----
export const CANVAS_SIZE = 128;
export const SPRITE_SIZE = 32;     // 单个精灵帧 32×32
export const SPRITE_SCALE = 3;     // 渲染放大倍数 → 96px on 128 canvas
export const PIXEL_RATIO = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

// ---- 帧率 ----
export const FPS_ACTIVE = 30;
export const FPS_IDLE = 10;
export const FRAME_MS_ACTIVE = 1000 / FPS_ACTIVE;
export const FRAME_MS_IDLE = 1000 / FPS_IDLE;

// ---- 属性总和 ----
export const ATTRIBUTES_TOTAL = 300;
export const ATTRIBUTE_MIN = 10;
export const ATTRIBUTE_MAX = 90;

// ---- 需求变化速率（每秒） ----
// 放慢节奏：宠物是"陪伴"而非"任务"，需求衰减很慢，避免频繁弹气泡打断工作。
// 大致：饥饿约 8 小时才会很饿；心情约一整天才明显低落。
export const NEEDS_DECAY = {
  hungerBase: 0.0035,         // 基础饥饿增长（原 0.015 → 约 1/4）
  energyDrainBase: 0.005,     // 基础精力消耗
  happinessDecayBase: 0.0025, // 基础心情衰减（原 0.008 → 约 1/3）
  cleanlinessDecayBase: 0.0025, // 基础清洁度下降
};

// ---- 经验 ----
export const EXP_TABLE: Record<string, number> = {
  '1-10': 100,
  '11-20': 300,
  '21-40': 800,
  '41-60': 2000,
  '61-99': 5000,
};

export function getExpForLevel(level: number): number {
  if (level <= 10) return 100;
  if (level <= 20) return 300;
  if (level <= 40) return 800;
  if (level <= 60) return 2000;
  return 5000;
}

// ---- 进化等级 ----
export const EVOLUTION_LEVELS = [1, 11, 21, 41];

// ---- 食物刷新间隔 ----
export const FOOD_SPAWN_INTERVAL = 5 * 60 * 1000; // 5 分钟
export const FOOD_SPAWN_CHANCE = 0.3; // 30% 概率

// ---- 行为概率（每 tick 检查） ----
export const BEHAVIOR_PROBS = {
  wanderFromIdle: 0.02,
  selfPlayFromIdle: 0.008,
  fishFromIdle: 0.005,
  daydreamFromIdle: 0.01,
  poopAfterEat: 0.3,
  stuffedFromEat: 0.2,
  randomExpression: 0.003,
};

// ---- 状态持续时间（毫秒）----
export const STATE_DURATIONS = {
  idleMin: 3000,
  idleMax: 15000,
  wanderMin: 5000,
  wanderMax: 20000,
  selfPlayMin: 20000,
  selfPlayMax: 60000,
  daydreamMin: 30000,
  daydreamMax: 180000,
  fishMin: 30000,
  fishMax: 120000,
  sleepMin: 60000,
  sleepMax: 300000,
  eatMin: 3000,
  eatMax: 8000,
  stuffedMin: 5000,
  stuffedMax: 10000,
  poopMin: 3000,
  poopMax: 5000,
};

// ---- 交互反馈 ----
export const INTERACTION = {
  petHappinessGain: 5,
  feedHappinessGain: 3,
  clickHappinessGain: 1,
  pokeHappinessGain: -2,
  dragHappinessGain: -1,
  poopCleanHappinessGain: 2,
};

// ---- 气泡 ----
export const BUBBLE_DURATION = 4000;
export const BUBBLE_COOLDOWN = 8000;

// ---- 数据持久化 ----
export const SAVE_DEBOUNCE_MS = 8000; // 8 秒防抖落盘
export const SAVE_KEY_EVENTS = ['eat', 'levelup', 'evolution', 'poop', 'exit'] as const;

// ---- 里程碑 / 成就定义（icon + 解锁奖励金币）----
export const MILESTONES = [
  { id: 'first-interaction', name: '初次触碰', description: '第一次和宠物互动', threshold: 1,   icon: '👋', coin: 5  },
  { id: 'interact-10',       name: '小小友谊', description: '互动 10 次',        threshold: 10,  icon: '🤝', coin: 10 },
  { id: 'interact-100',      name: '深厚羁绊', description: '互动 100 次',       threshold: 100, icon: '💞', coin: 50 },
  { id: 'days-7',            name: '一周伙伴', description: '在一起 7 天',       threshold: 7,   icon: '📅', coin: 20 },
  { id: 'days-30',           name: '一月挚友', description: '在一起 30 天',      threshold: 30,  icon: '🗓️', coin: 80 },
  { id: 'days-100',          name: '百日之约', description: '在一起 100 天',     threshold: 100, icon: '🏅', coin: 200 },
  { id: 'first-evolution',   name: '蜕变时刻', description: '第一次进化',         threshold: 1,   icon: '✨', coin: 30 },
  { id: 'first-feed',        name: '投喂初体验', description: '第一次喂食',       threshold: 1,   icon: '🍖', coin: 5  },
  { id: 'feed-50',           name: '美食家',   description: '喂食 50 次',        threshold: 50,  icon: '🍱', coin: 60 },
];

// ---- 颜色（用于程序化像素绘制）----
export const PET_COLORS = {
  cat: {
    body: '#F5A623',
    bodyDark: '#D4891A',
    belly: '#FFF5E0',
    eye: '#333333',
    nose: '#FF9999',
    ear: '#E8943C',
    earInner: '#FFB8C6',
  },
  dog: {
    body: '#C8A06E',
    bodyDark: '#A6834E',
    belly: '#F5E6D0',
    eye: '#333333',
    nose: '#553333',
    ear: '#B08850',
    earInner: '#D4A87C',
  },
  dragon: {
    body: '#6BCB77',
    bodyDark: '#4AA356',
    belly: '#D0F5D8',
    eye: '#FF6B35',
    nose: '#4AA356',
    ear: '#5BB868',
    earInner: '#8FE09A',
  },
  slime: {
    body: '#88D8F5',
    bodyDark: '#5BBCDE',
    belly: '#C8F0FF',
    eye: '#333333',
    nose: '#88D8F5',
    ear: '#88D8F5',
    earInner: '#88D8F5',
  },
};

// ---- 动物大类权重 (species-level spawn weights) ----
export const SPECIES_WEIGHTS: Record<PetSpecies, number> = {
  cat: 35, dog: 25, rabbit: 12, sheep: 8, cow: 6,
  rodent: 5, bird: 4, fox: 2, deer: 1.5, panda: 1, dragon: 0.5,
};

// ---- 动物大类中文标签 ----
export const SPECIES_LABELS: Record<PetSpecies, string> = {
  cat: '猫咪', dog: '小狗', rabbit: '兔子', sheep: '羊', cow: '牛',
  rodent: '鼠类', bird: '鸟类', fox: '狐狸', deer: '鹿', panda: '熊猫', dragon: '龙',
};

// ---- 品种注册表 (60+ breeds + 5 hidden variants) ----
export const BREED_REGISTRY: BreedDefinition[] = [
  // ================================================================
  // CAT BREEDS (10)
  // ================================================================
  {
    id: 'siamese', name: '暹罗猫', species: 'cat', rarity: 'common', weight: 15,
    colors: { body: '#F5E6D0', bodyDark: '#6B4C3B', belly: '#FFF5E8', eye: '#4A90D9', nose: '#6B4C3B', ear: '#6B4C3B', earInner: '#D4A890' },
    attributeModifiers: { wisdom: 5, agility: 3 },
    description: '优雅苗条的暹罗猫，深色重点色搭配蓝色眼眸，聪慧而高贵',
  },
  {
    id: 'balinese', name: '巴厘猫', species: 'cat', rarity: 'normal', weight: 8,
    colors: { body: '#FFF0E0', bodyDark: '#8B6955', belly: '#FFF8F0', eye: '#4A90D9', nose: '#8B6955', ear: '#8B6955', earInner: '#D4B8A0' },
    attributeModifiers: { agility: 5, wisdom: 3 },
    description: '身姿优雅的长毛巴厘猫，如舞者般轻盈灵动',
  },
  {
    id: 'norwegian-forest', name: '挪威森林猫', species: 'cat', rarity: 'normal', weight: 8,
    colors: { body: '#E8943C', bodyDark: '#C47530', belly: '#FFF0E0', eye: '#5BA84A', nose: '#C47530', ear: '#D4891A', earInner: '#FFB8C6' },
    attributeModifiers: { strength: 8, agility: 3 },
    description: '毛发浓密的挪威森林猫，像维京勇士一样强壮',
  },
  {
    id: 'chinese-tabby', name: '狸花猫', species: 'cat', rarity: 'common', weight: 15,
    colors: { body: '#C8A06E', bodyDark: '#6B5B3E', belly: '#F5E6D0', eye: '#D4A017', nose: '#8B7355', ear: '#A08050', earInner: '#D4A87C', accent: '#6B5B3E' },
    attributeModifiers: { agility: 5, strength: 3 },
    description: '经典中国狸花猫，虎斑纹路威武霸气，抓老鼠一把好手',
  },
  {
    id: 'lion-cat', name: '狮子猫', species: 'cat', rarity: 'normal', weight: 8,
    colors: { body: '#FAFAFA', bodyDark: '#E8E8E8', belly: '#FFFFFF', eye: '#4A90D9', nose: '#FFB8C6', ear: '#F0F0F0', earInner: '#FFB8C6', accent2: '#D4A017' },
    attributeModifiers: { wisdom: 8, hygiene: 5 },
    description: '纯白蓬松的狮子猫，一蓝一琥珀的异色瞳令人着迷',
  },
  {
    id: 'ragdoll', name: '布偶猫', species: 'cat', rarity: 'common', weight: 12,
    colors: { body: '#F5EDE0', bodyDark: '#8B7B6B', belly: '#FFF8F0', eye: '#4A90D9', nose: '#B8A090', ear: '#8B7B6B', earInner: '#D4C0B0' },
    attributeModifiers: { wisdom: 5, playful: 3 },
    description: '温柔的大型布偶猫，蓝色眼眸如宝石，被抱起时全身放松',
  },
  {
    id: 'sphynx', name: '无毛猫', species: 'cat', rarity: 'uncommon', weight: 3,
    colors: { body: '#F0C8B8', bodyDark: '#D4A898', belly: '#F8D8C8', eye: '#D4A017', nose: '#D4A898', ear: '#E8B8A8', earInner: '#F0C8B8' },
    attributeModifiers: { hygiene: 10, playful: 5 },
    description: '独特的无毛猫，皮肤褶皱温暖如绒，性格亲人活泼',
  },
  {
    id: 'orange-tabby', name: '橘猫', species: 'cat', rarity: 'common', weight: 15,
    colors: { body: '#F5A623', bodyDark: '#D4891A', belly: '#FFF5E0', eye: '#D4A017', nose: '#FF9999', ear: '#E8943C', earInner: '#FFB8C6' },
    attributeModifiers: { appetite: 15, strength: 5 },
    description: '圆滚滚的大橘猫，十橘九胖，不是在吃就是在去吃的路上',
  },
  {
    id: 'tuxedo', name: '奶牛猫', species: 'cat', rarity: 'common', weight: 12,
    colors: { body: '#333333', bodyDark: '#1A1A1A', belly: '#FAFAFA', eye: '#5BA84A', nose: '#553333', ear: '#333333', earInner: '#FFB8C6', accent: '#FAFAFA' },
    attributeModifiers: { playful: 8, agility: 3 },
    description: '黑白花纹的奶牛猫，像穿了燕尾服的小绅士，调皮捣蛋',
  },
  {
    id: 'persian', name: '波斯猫', species: 'cat', rarity: 'uncommon', weight: 4,
    colors: { body: '#F5EDE0', bodyDark: '#D4C8B8', belly: '#FFF8F0', eye: '#CD7F32', nose: '#C8A8A0', ear: '#D4C8B8', earInner: '#FFB8C6' },
    attributeModifiers: { hygiene: 10, playful: -10 },
    description: '扁脸蓬松的波斯猫，安静优雅的贵族，最爱趴在软垫上',
  },

  // ================================================================
  // DOG BREEDS (10)
  // ================================================================
  {
    id: 'shiba', name: '柴犬', species: 'dog', rarity: 'common', weight: 15,
    colors: { body: '#E8A850', bodyDark: '#C88830', belly: '#FFF5E0', eye: '#333333', nose: '#333333', ear: '#D49840', earInner: '#F5D8B0' },
    attributeModifiers: { strength: 5, playful: 3 },
    description: '永远在微笑的柴犬，倔强又忠诚，doge本dog',
  },
  {
    id: 'corgi', name: '柯基', species: 'dog', rarity: 'common', weight: 15,
    colors: { body: '#E8A850', bodyDark: '#C88830', belly: '#FFF8F0', eye: '#333333', nose: '#333333', ear: '#D49840', earInner: '#F5D8B0' },
    attributeModifiers: { playful: 8, appetite: 5 },
    description: '短腿蜜桃臀的柯基，电臀摇摆萌化人心',
  },
  {
    id: 'golden', name: '金毛', species: 'dog', rarity: 'common', weight: 12,
    colors: { body: '#D4A050', bodyDark: '#B88830', belly: '#F5E8C8', eye: '#5B4030', nose: '#333333', ear: '#C89840', earInner: '#D4B880' },
    attributeModifiers: { playful: 10, wisdom: 3 },
    description: '阳光友善的金毛寻回犬，暖男代表，见谁都摇尾巴',
  },
  {
    id: 'husky', name: '哈士奇', species: 'dog', rarity: 'normal', weight: 8,
    colors: { body: '#A8B8C8', bodyDark: '#6B7B8B', belly: '#F0F0F0', eye: '#4A90D9', nose: '#333333', ear: '#7B8B9B', earInner: '#C8D0D8', accent: '#F0F0F0' },
    attributeModifiers: { playful: 15, strength: 5 },
    description: '蓝眼睛的拆家小能手，撒手没的哈士奇，永远精力过剩',
  },
  {
    id: 'samoyed', name: '萨摩耶', species: 'dog', rarity: 'normal', weight: 8,
    colors: { body: '#FAFAFA', bodyDark: '#E8E8E8', belly: '#FFFFFF', eye: '#333333', nose: '#333333', ear: '#F0F0F0', earInner: '#FFE0E0' },
    attributeModifiers: { playful: 8, hygiene: 5 },
    description: '永远在微笑的白色天使萨摩耶，毛发蓬松如棉花糖',
  },
  {
    id: 'french-bulldog', name: '法斗', species: 'dog', rarity: 'normal', weight: 8,
    colors: { body: '#A08878', bodyDark: '#7B6858', belly: '#D4C0B0', eye: '#333333', nose: '#333333', ear: '#8B7868', earInner: '#B8A898', accent: '#6B5848' },
    attributeModifiers: { strength: 8, agility: -5 },
    description: '蝙蝠耳朵的法斗，敦实矮壮，打呼噜声音巨大',
  },
  {
    id: 'border-collie', name: '边牧', species: 'dog', rarity: 'normal', weight: 8,
    colors: { body: '#333333', bodyDark: '#1A1A1A', belly: '#FAFAFA', eye: '#5B4030', nose: '#333333', ear: '#333333', earInner: '#C8B8A8', accent: '#FAFAFA' },
    attributeModifiers: { wisdom: 15, agility: 5 },
    description: '犬界智商天花板边牧，会察言观色，可能比你还聪明',
  },
  {
    id: 'dachshund', name: '腊肠犬', species: 'dog', rarity: 'uncommon', weight: 5,
    colors: { body: '#8B5E3C', bodyDark: '#6B4226', belly: '#C8A080', eye: '#333333', nose: '#333333', ear: '#7B4E2C', earInner: '#A07858' },
    attributeModifiers: { agility: 5, appetite: 8 },
    description: '身长腿短的腊肠犬，像一根可爱的热狗',
  },
  {
    id: 'chinese-rural', name: '中华田园犬', species: 'dog', rarity: 'common', weight: 12,
    colors: { body: '#D4A050', bodyDark: '#B88830', belly: '#F5E0C0', eye: '#5B4030', nose: '#333333', ear: '#C89840', earInner: '#D4B880' },
    attributeModifiers: { strength: 5, wisdom: 5 },
    description: '忠诚朴实的中华田园犬，看家护院的好手，不挑食好养活',
  },
  {
    id: 'poodle', name: '泰迪', species: 'dog', rarity: 'uncommon', weight: 4,
    colors: { body: '#8B5E3C', bodyDark: '#6B4226', belly: '#B8886B', eye: '#333333', nose: '#333333', ear: '#7B4E2C', earInner: '#A07858' },
    attributeModifiers: { wisdom: 8, playful: 5 },
    description: '卷毛小巧的泰迪犬，聪明粘人，造型百变的小可爱',
  },

  // ================================================================
  // RABBIT BREEDS (6)
  // ================================================================
  {
    id: 'holland-lop', name: '荷兰垂耳兔', species: 'rabbit', rarity: 'common', weight: 20,
    colors: { body: '#D4C0A8', bodyDark: '#B8A890', belly: '#F5EDE0', eye: '#333333', nose: '#FFB8C6', ear: '#C8B098', earInner: '#FFD0D8' },
    attributeModifiers: { playful: 5, hygiene: 3 },
    description: '耷拉着可爱垂耳的荷兰垂耳兔，温顺乖巧惹人怜',
  },
  {
    id: 'angora', name: '安哥拉兔', species: 'rabbit', rarity: 'normal', weight: 15,
    colors: { body: '#FAFAFA', bodyDark: '#E8E8E8', belly: '#FFFFFF', eye: '#CC3333', nose: '#FFB8C6', ear: '#F0F0F0', earInner: '#FFE0E0' },
    attributeModifiers: { hygiene: 8, wisdom: 3 },
    description: '蓬松如云朵的安哥拉兔，毛量惊人像一团棉花糖',
  },
  {
    id: 'dwarf', name: '侏儒兔', species: 'rabbit', rarity: 'common', weight: 20,
    colors: { body: '#C8B8A8', bodyDark: '#A89888', belly: '#F0E8E0', eye: '#333333', nose: '#FFB8C6', ear: '#B8A898', earInner: '#FFD0D8' },
    attributeModifiers: { appetite: 5, playful: 5 },
    description: '圆滚滚的侏儒兔，小小一团捧在手心，短耳圆脸超萌',
  },
  {
    id: 'lionhead', name: '狮子兔', species: 'rabbit', rarity: 'normal', weight: 15,
    colors: { body: '#E8D8C0', bodyDark: '#C8B8A0', belly: '#FFF5E8', eye: '#333333', nose: '#FFB8C6', ear: '#D4C8B0', earInner: '#FFE0D8' },
    attributeModifiers: { strength: 5, playful: 3 },
    description: '头顶一圈鬃毛的狮子兔，迷你版小狮子，威风又可爱',
  },
  {
    id: 'panda-rabbit', name: '熊猫兔', species: 'rabbit', rarity: 'uncommon', weight: 10,
    colors: { body: '#FAFAFA', bodyDark: '#333333', belly: '#FFFFFF', eye: '#333333', nose: '#FFB8C6', ear: '#333333', earInner: '#FFD0D8', accent: '#333333' },
    attributeModifiers: { playful: 5, wisdom: 5 },
    description: '眼睛有黑色 patches 的熊猫兔，黑白配色像小熊猫',
  },
  {
    id: 'belgian-hare', name: '比利时野兔', species: 'rabbit', rarity: 'uncommon', weight: 10,
    colors: { body: '#C8883C', bodyDark: '#A06828', belly: '#F5D8B0', eye: '#8B5E3C', nose: '#A06828', ear: '#B87828', earInner: '#D4A868' },
    attributeModifiers: { agility: 10, strength: 3 },
    description: '长耳矫健的比利时野兔，奔跑如风，充满野性美',
  },

  // ================================================================
  // SHEEP BREEDS (5)
  // ================================================================
  {
    id: 'small-tail', name: '小尾寒羊', species: 'sheep', rarity: 'common', weight: 25,
    colors: { body: '#F5F0E8', bodyDark: '#E0D8D0', belly: '#FFFFFF', eye: '#5B4030', nose: '#C8A8A0', ear: '#E8E0D8', earInner: '#FFD0D8' },
    attributeModifiers: { hygiene: 5, wisdom: 3 },
    description: '温柔安静的小尾寒羊，白色毛发柔软如绒',
  },
  {
    id: 'black-nose', name: '黑鼻羊', species: 'sheep', rarity: 'normal', weight: 20,
    colors: { body: '#FAFAFA', bodyDark: '#333333', belly: '#FFFFFF', eye: '#5B4030', nose: '#1A1A1A', ear: '#333333', earInner: '#D8D0C8' },
    attributeModifiers: { playful: 5, wisdom: 5 },
    description: '白身体黑脸蛋的黑鼻羊，呆萌表情自带喜感',
  },
  {
    id: 'goat', name: '山羊', species: 'sheep', rarity: 'normal', weight: 18,
    colors: { body: '#A8A8A8', bodyDark: '#7B7B7B', belly: '#D0D0D0', eye: '#D4A017', nose: '#5B5B5B', ear: '#8B8B8B', earInner: '#B8B8B8', accent: '#E8E0D8' },
    attributeModifiers: { agility: 8, strength: 5 },
    description: '长着山羊胡的山羊，擅长攀岩登高，下巴的小胡子很帅',
  },
  {
    id: 'merino', name: '绵羊', species: 'sheep', rarity: 'normal', weight: 18,
    colors: { body: '#F0E8D8', bodyDark: '#D8D0C0', belly: '#FFF8F0', eye: '#5B4030', nose: '#C8A8A0', ear: '#E0D8C8', earInner: '#FFD0D8' },
    attributeModifiers: { hygiene: 8, strength: 3 },
    description: '卷毛超级蓬松的绵羊，浑身都是软绵绵的羊毛',
  },
  {
    id: 'ibex', name: '岩羊', species: 'sheep', rarity: 'uncommon', weight: 10,
    colors: { body: '#8B8070', bodyDark: '#6B6058', belly: '#B8B0A0', eye: '#D4A017', nose: '#5B5048', ear: '#7B7068', earInner: '#A09888' },
    attributeModifiers: { agility: 12, strength: 5 },
    description: '悬崖峭壁上的跳跃者岩羊，平衡感惊人，登山健将',
  },

  // ================================================================
  // COW BREEDS (5)
  // ================================================================
  {
    id: 'holstein', name: '奶牛', species: 'cow', rarity: 'common', weight: 30,
    colors: { body: '#FAFAFA', bodyDark: '#333333', belly: '#FFFFFF', eye: '#5B4030', nose: '#FFB8C6', ear: '#E8E0D8', earInner: '#FFD0D8', accent: '#333333' },
    attributeModifiers: { appetite: 8, strength: 5 },
    description: '经典黑白花纹的荷斯坦奶牛，产奶冠军，温柔大方',
  },
  {
    id: 'highland', name: '高地牛', species: 'cow', rarity: 'normal', weight: 20,
    colors: { body: '#A0682C', bodyDark: '#804820', belly: '#C88850', eye: '#333333', nose: '#6B4226', ear: '#905828', earInner: '#B87840' },
    attributeModifiers: { strength: 10, hygiene: -5 },
    description: '刘海遮住眼睛的高地牛，蓬松长毛像摇滚明星',
  },
  {
    id: 'buffalo', name: '水牛', species: 'cow', rarity: 'normal', weight: 18,
    colors: { body: '#5B5B5B', bodyDark: '#3B3B3B', belly: '#7B7B7B', eye: '#333333', nose: '#4B4B4B', ear: '#4B4B4B', earInner: '#6B6B6B' },
    attributeModifiers: { strength: 12, agility: -3 },
    description: '壮硕的大角水牛，弯弯的大角威武霸气',
  },
  {
    id: 'yak', name: '牦牛', species: 'cow', rarity: 'uncommon', weight: 12,
    colors: { body: '#5B3E2B', bodyDark: '#3B2618', belly: '#7B5E4B', eye: '#333333', nose: '#4B2E1B', ear: '#4B2E1B', earInner: '#6B4E3B' },
    attributeModifiers: { strength: 10, wisdom: 3 },
    description: '长毛飘逸的牦牛，高原之舟，耐寒抗冻的硬汉',
  },
  {
    id: 'angus', name: '安格斯牛', species: 'cow', rarity: 'uncommon', weight: 10,
    colors: { body: '#2B2B2B', bodyDark: '#1A1A1A', belly: '#3B3B3B', eye: '#5B4030', nose: '#1A1A1A', ear: '#2B2B2B', earInner: '#4B4B4B' },
    attributeModifiers: { strength: 12, playful: -5 },
    description: '纯黑色的安格斯牛，敦实健壮，沉稳安静的大力士',
  },

  // ================================================================
  // RODENT BREEDS (5)
  // ================================================================
  {
    id: 'golden-hamster', name: '金丝熊', species: 'rodent', rarity: 'common', weight: 30,
    colors: { body: '#E8A850', bodyDark: '#C88830', belly: '#FFF5E0', eye: '#333333', nose: '#FFB8C6', ear: '#D49840', earInner: '#FFD0C8' },
    attributeModifiers: { appetite: 10, playful: 5 },
    description: '腮帮子鼓鼓的金丝熊仓鼠，最爱往嘴里塞食物',
  },
  {
    id: 'pudding-hamster', name: '布丁仓鼠', species: 'rodent', rarity: 'common', weight: 25,
    colors: { body: '#F5E8B8', bodyDark: '#E0D0A0', belly: '#FFF8D8', eye: '#333333', nose: '#FFB8C6', ear: '#E8D8A8', earInner: '#FFE8C0' },
    attributeModifiers: { playful: 8, agility: 5 },
    description: '淡黄色的小布丁仓鼠，圆圆滚滚像一颗小布丁',
  },
  {
    id: 'snow-squirrel', name: '雪地松鼠', species: 'rodent', rarity: 'normal', weight: 15,
    colors: { body: '#B0B8C0', bodyDark: '#8890A0', belly: '#E0E4E8', eye: '#333333', nose: '#6B6B6B', ear: '#98A0A8', earInner: '#C8D0D8' },
    attributeModifiers: { agility: 12, playful: 5 },
    description: '大尾巴毛茸茸的雪地松鼠，在枝头跳跃的冬日精灵',
  },
  {
    id: 'red-belly-squirrel', name: '红腹松鼠', species: 'rodent', rarity: 'uncommon', weight: 10,
    colors: { body: '#8B5E3C', bodyDark: '#6B4226', belly: '#CC4444', eye: '#333333', nose: '#5B3E2B', ear: '#7B4E2C', earInner: '#A07858' },
    attributeModifiers: { agility: 10, wisdom: 5 },
    description: '红肚皮的小松鼠，灵活好动，在林间穿梭如闪电',
  },
  {
    id: 'chinchilla', name: '龙猫', species: 'rodent', rarity: 'uncommon', weight: 10,
    colors: { body: '#A8A8B0', bodyDark: '#7B7B88', belly: '#E0E0E8', eye: '#333333', nose: '#FFB8C6', ear: '#8B8B98', earInner: '#FFD0D8' },
    attributeModifiers: { hygiene: 10, playful: 8 },
    description: '圆耳朵大眼的龙猫，毛茸茸软乎乎，爱洗火山灰澡',
  },

  // ================================================================
  // BIRD BREEDS (5)
  // ================================================================
  {
    id: 'budgie', name: '虎皮鹦鹉', species: 'bird', rarity: 'common', weight: 30,
    colors: { body: '#5BA84A', bodyDark: '#3B8830', belly: '#D4E850', eye: '#333333', nose: '#E8A850', ear: '#4A9838', earInner: '#5BA84A', accent: '#4A90D9' },
    attributeModifiers: { playful: 8, wisdom: 5 },
    description: '五彩斑斓的虎皮鹦鹉，叽叽喳喳话很多，爱学说话',
  },
  {
    id: 'cockatiel', name: '玄凤鹦鹉', species: 'bird', rarity: 'common', weight: 25,
    colors: { body: '#C8C8C8', bodyDark: '#A0A0A0', belly: '#E0E0E0', eye: '#333333', nose: '#8B8B8B', ear: '#B0B0B0', earInner: '#D0D0D0', accent: '#E8A030', accent2: '#E8A030' },
    attributeModifiers: { playful: 10, wisdom: 3 },
    description: '头顶黄色羽冠的玄凤鹦鹉，两坨橘红腮红超可爱',
  },
  {
    id: 'java-finch', name: '文鸟', species: 'bird', rarity: 'normal', weight: 18,
    colors: { body: '#D0D0D0', bodyDark: '#A0A0A0', belly: '#F0F0F0', eye: '#333333', nose: '#CC4444', ear: '#B8B8B8', earInner: '#D0D0D0' },
    attributeModifiers: { hygiene: 8, agility: 5 },
    description: '整洁干净的小文鸟，灰白配色简约优雅，叫声悦耳',
  },
  {
    id: 'canary', name: '金丝雀', species: 'bird', rarity: 'normal', weight: 15,
    colors: { body: '#F5D020', bodyDark: '#D4B010', belly: '#FFF080', eye: '#333333', nose: '#E8A850', ear: '#E8C010', earInner: '#F5D820' },
    attributeModifiers: { playful: 8, agility: 5 },
    description: '明黄色的小金丝雀，歌声婉转动听，是大自然的歌唱家',
  },
  {
    id: 'long-tailed-tit', name: '银喉长尾山雀', species: 'bird', rarity: 'uncommon', weight: 5,
    colors: { body: '#FAFAFA', bodyDark: '#E0E0E0', belly: '#FFFFFF', eye: '#333333', nose: '#8B8B8B', ear: '#F0F0F0', earInner: '#FAFAFA', accent: '#333333' },
    attributeModifiers: { agility: 12, playful: 8 },
    description: '圆滚滚的白色小团子银喉长尾山雀，像一颗会飞的糯米糍',
  },

  // ================================================================
  // FOX BREEDS (4)
  // ================================================================
  {
    id: 'red-fox', name: '赤狐', species: 'fox', rarity: 'common', weight: 30,
    colors: { body: '#D45020', bodyDark: '#A83818', belly: '#FFF5E0', eye: '#D4A017', nose: '#333333', ear: '#C84020', earInner: '#F5D8B0', accent: '#FAFAFA' },
    attributeModifiers: { wisdom: 8, agility: 5 },
    description: '火红色皮毛的赤狐，狡猾聪慧，丛林中的谋略家',
  },
  {
    id: 'arctic-fox', name: '白狐', species: 'fox', rarity: 'normal', weight: 25,
    colors: { body: '#F0F0F8', bodyDark: '#D0D0E0', belly: '#FFFFFF', eye: '#4A90D9', nose: '#A0A0B0', ear: '#E0E0F0', earInner: '#F0F0F8' },
    attributeModifiers: { agility: 8, hygiene: 5 },
    description: '纯白如雪的北极狐，在冰天雪地中优雅穿行',
  },
  {
    id: 'fennec', name: '耳廓狐', species: 'fox', rarity: 'uncommon', weight: 15,
    colors: { body: '#E8D0A8', bodyDark: '#C8B088', belly: '#FFF5E8', eye: '#5B4030', nose: '#A08868', ear: '#D8C098', earInner: '#FFE8D0' },
    attributeModifiers: { agility: 10, playful: 8 },
    description: '耳朵比脸还大的耳廓狐，沙漠里的小精灵，听力超群',
  },
  {
    id: 'silver-fox', name: '银狐', species: 'fox', rarity: 'uncommon', weight: 15,
    colors: { body: '#8890A0', bodyDark: '#5B6070', belly: '#C8D0D8', eye: '#D4A017', nose: '#4B4B5B', ear: '#6B7080', earInner: '#A0A8B8' },
    attributeModifiers: { wisdom: 10, agility: 5 },
    description: '银灰色毛发的银狐，神秘高贵，月光下的银色幻影',
  },

  // ================================================================
  // DEER BREEDS (4)
  // ================================================================
  {
    id: 'sika', name: '梅花鹿', species: 'deer', rarity: 'common', weight: 30,
    colors: { body: '#B8783C', bodyDark: '#8B5E2B', belly: '#F5E0C0', eye: '#5B4030', nose: '#6B4226', ear: '#A06828', earInner: '#D4A868', accent: '#FFF8F0' },
    attributeModifiers: { agility: 8, wisdom: 5 },
    description: '身上有白色梅花斑点的小鹿，温顺可爱，林间的精灵',
  },
  {
    id: 'white-tail', name: '白尾鹿', species: 'deer', rarity: 'normal', weight: 25,
    colors: { body: '#A08060', bodyDark: '#806040', belly: '#E8D8C0', eye: '#5B4030', nose: '#6B5040', ear: '#907050', earInner: '#C8B098', accent: '#FAFAFA' },
    attributeModifiers: { agility: 10, strength: 5 },
    description: '尾巴翻起像白旗的白尾鹿，奔跑时白色尾旗高高扬起',
  },
  {
    id: 'pere-david', name: '麋鹿', species: 'deer', rarity: 'uncommon', weight: 15,
    colors: { body: '#6B4226', bodyDark: '#4B2E18', belly: '#A07850', eye: '#5B4030', nose: '#4B2E18', ear: '#5B3220', earInner: '#8B6848' },
    attributeModifiers: { wisdom: 10, strength: 8 },
    description: 'majestic 的麋鹿，角似鹿非鹿，中国特有的珍稀物种',
  },
  {
    id: 'muntjac', name: '小麂', species: 'deer', rarity: 'uncommon', weight: 15,
    colors: { body: '#B8885C', bodyDark: '#8B6840', belly: '#E8D0B0', eye: '#5B4030', nose: '#6B5040', ear: '#A07848', earInner: '#D4B890' },
    attributeModifiers: { agility: 12, playful: 5 },
    description: '只有小狗那么大的小麂，胆小灵敏，叫声像犬吠',
  },

  // ================================================================
  // PANDA BREEDS (2)
  // ================================================================
  {
    id: 'giant-panda', name: '大熊猫', species: 'panda', rarity: 'common', weight: 50,
    colors: { body: '#FAFAFA', bodyDark: '#333333', belly: '#FAFAFA', eye: '#333333', nose: '#333333', ear: '#333333', earInner: '#333333', accent: '#333333' },
    attributeModifiers: { appetite: 12, strength: 8 },
    description: '圆滚滚的大熊猫，黑白色国宝，最爱抱着竹子啃',
  },
  {
    id: 'red-panda', name: '小熊猫', species: 'panda', rarity: 'normal', weight: 30,
    colors: { body: '#CC5533', bodyDark: '#993322', belly: '#333333', eye: '#333333', nose: '#333333', ear: '#CC5533', earInner: '#FFF8F0', accent: '#E8A050' },
    attributeModifiers: { agility: 10, playful: 8 },
    description: '红棕色毛皮的小熊猫，尾巴有环纹，举手投降姿势超萌',
  },

  // ================================================================
  // DRAGON BREEDS (3)
  // ================================================================
  {
    id: 'eastern-dragon', name: '东方龙', species: 'dragon', rarity: 'common', weight: 35,
    colors: { body: '#D4A017', bodyDark: '#B88810', belly: '#FFF080', eye: '#CC3333', nose: '#B88810', ear: '#C89018', earInner: '#E8C040', accent: '#5BA84A' },
    attributeModifiers: { wisdom: 15, agility: 5 },
    description: '蜿蜒金绿鳞片的东方龙，腾云驾雾，祥瑞之兆',
  },
  {
    id: 'western-dragon', name: '西方龙', species: 'dragon', rarity: 'normal', weight: 30,
    colors: { body: '#CC3333', bodyDark: '#992222', belly: '#E8A050', eye: '#FFD700', nose: '#992222', ear: '#BB2828', earInner: '#E85050', accent: '#FF6600' },
    attributeModifiers: { strength: 15, agility: 5 },
    description: '展翅喷火的西方龙，赤红鳞片威武霸气，守护宝藏',
  },
  {
    id: 'quetzalcoatl', name: '羽蛇神', species: 'dragon', rarity: 'uncommon', weight: 15,
    colors: { body: '#40B8A0', bodyDark: '#289880', belly: '#A0E8D8', eye: '#FFD700', nose: '#289880', ear: '#30A890', earInner: '#60D0B8', accent: '#E85050', accent2: '#FFD700' },
    attributeModifiers: { wisdom: 10, playful: 8 },
    description: '翠绿羽毛的羽蛇神，古老神秘的传说生物， winds 之神',
  },

  // ================================================================
  // HIDDEN VARIANTS (5)
  // ================================================================
  {
    id: 'heterochromia-cat', name: '异色瞳白猫', species: 'cat', rarity: 'legendary', weight: 1,
    isVariant: true,
    colors: { body: '#FAFAFA', bodyDark: '#E8E8E8', belly: '#FFFFFF', eye: '#4A90D9', nose: '#FFB8C6', ear: '#F0F0F0', earInner: '#FFB8C6', accent2: '#D4A017' },
    attributeModifiers: { wisdom: 10, agility: 8, hygiene: 5 },
    description: '传说中的异色瞳白猫，一只眼蓝如海，一只眼琥珀如金',
  },
  {
    id: 'bowtie-corgi', name: '戴蝴蝶结的柯基', species: 'dog', rarity: 'epic', weight: 1,
    isVariant: true,
    colors: { body: '#E8A850', bodyDark: '#C88830', belly: '#FFF8F0', eye: '#333333', nose: '#333333', ear: '#D49840', earInner: '#F5D8B0', accent: '#CC2222' },
    attributeModifiers: { playful: 12, wisdom: 5, appetite: 5 },
    description: '脖子上系着红色蝴蝶结的柯基，时尚电臀，全场最靓',
  },
  {
    id: 'golden-wool-sheep', name: '金色羊毛的羊', species: 'sheep', rarity: 'legendary', weight: 1,
    isVariant: true,
    colors: { body: '#FFD700', bodyDark: '#DAA520', belly: '#FFF8DC', eye: '#8B6914', nose: '#DAA520', ear: '#E8C200', earInner: '#FFE44D', accent: '#FFFACD' },
    attributeModifiers: { hygiene: 10, wisdom: 8, strength: 5 },
    description: '浑身金灿灿的传说绵羊，羊毛闪闪发光如金丝',
  },
  {
    id: 'rainbow-antler-deer', name: '彩虹角的小鹿', species: 'deer', rarity: 'epic', weight: 1,
    isVariant: true,
    colors: { body: '#D4B896', bodyDark: '#B89878', belly: '#F5E8D0', eye: '#8B6914', nose: '#A08868', ear: '#C8A880', earInner: '#E8D0B8', accent: '#FF6B6B', accent2: '#4ECDC4' },
    attributeModifiers: { agility: 12, playful: 10, wisdom: 5 },
    description: '鹿角如彩虹般绚丽的小鹿，森林中的魔法精灵',
  },
  {
    id: 'glow-dragon', name: '荧光龙', species: 'dragon', rarity: 'mythic', weight: 1,
    isVariant: true,
    colors: { body: '#00FF88', bodyDark: '#00CC66', belly: '#88FFCC', eye: '#FF00FF', nose: '#00CC66', ear: '#00EE77', earInner: '#66FFAA', accent: '#00FFFF', accent2: '#FF00FF' },
    attributeModifiers: { wisdom: 15, agility: 10, playful: 8 },
    description: '全身散发荧光的神秘龙，暗夜中最耀眼的存在',
  },
];

// ---- 共情时钟文案 ----
export const EMPATHY_MESSAGES = {
  lateNight: ['主人该休息了...', '好困呀...', '夜深了呢...'],
  morning: ['早上好呀！', '新的一天！', '伸个懒腰~'],
  fridayAfternoon: ['周五啦~摸鱼时间！', '快下班了吧？', '嘻嘻，周末要来了~'],
  longIdle: ['主人还在吗？', '好久没理我了...', '想你了~'],
  shutdown: ['晚安，明天见！', '拜拜~', '困了，一起睡吧...'],
  // Patch 2: Empathy Clock Signal Sources
  unlockGreeting: ['你回来啦！', '欢迎回来~', '等你好久了！'],
  resumeGreeting: ['醒来了~', '唔...刚才睡着了...', '又见面了~'],
  lowBattery: ['电量不够了...', '好累，快没电了...', '省电模式...'],
  lockBye: ['主人走了吗...那我也休息一下', '等你回来~', '再见~'],
  suspendBye: ['要合上了...晚安', '困了...zzz', '等你唤醒我~'],
  idleDaydream: ['发呆中...', '主人在干嘛呢...', '好无聊呀~'],
  idleSleep: ['好困...先睡一会', 'zzZ~', '打个盹~'],
};

// ---- 冷笑话语料（宠物会莫名其妙地讲）----
export const COLD_JOKES: string[] = [
  '为什么海绵宝宝能浮起来？因为它海绵宝宝~',
  '有一只北极熊，它把毛都拔光了……于是它变成了一只“北极”。',
  '什么动物最没有方向感？麋鹿，因为它会“迷路”。',
  '一只鸭子对另一只鸭子说：嘎。另一只回答：我正想这么说呢！',
  '为什么蜜蜂的嗡嗡声不准？因为它不知道歌词，只会哼。',
  '据说每个人体内都有水。所以严格来说，你也是一瓶矿泉水。',
  '便利店为什么 24 小时营业？因为它根本找不到锁的钥匙。',
  '我昨天梦见自己是一台手机，醒来发现……我电量只剩 1%。',
  '为什么数学书总是很忧郁？因为它有太多“问题”。',
  '企鹅为什么不怕冷？因为它穿了一件“燕尾服”。',
  '一个西红柿过马路，结果变成了番茄酱。因为它没看红绿灯。',
  '什么东西越洗越脏？水。',
  '我给 WiFi 起名叫“看得见连不上”，邻居都疯了。',
  '为什么程序员喜欢黑暗？因为光会产生 bug（虫子）。',
  '小明把闹钟调到 6 点，结果 6 点的是另一个小明。',
  '考拉为什么没当上国家公务员？因为它没有“考拉”资格（考啦）。',
  '我减肥失败了，因为冰箱总是在向我招手。',
  '为什么气球害怕针？因为它一针见血就崩溃了。',
  '猫为什么不用上班？因为它已经是“喵”级人物了。',
  '一只蚂蚁搬家，搬了三天，因为它走错了房间。',
];

// ---- WMO 天气代码 → 中文描述 + emoji ----
export const WEATHER_CODE_MAP: Record<number, { desc: string; icon: string }> = {
  0:  { desc: '晴朗',   icon: '☀️' },
  1:  { desc: '晴间多云', icon: '🌤️' },
  2:  { desc: '多云',   icon: '⛅' },
  3:  { desc: '阴天',   icon: '☁️' },
  45: { desc: '有雾',   icon: '🌫️' },
  48: { desc: '雾凇',   icon: '🌫️' },
  51: { desc: '毛毛雨', icon: '🌦️' },
  53: { desc: '小雨',   icon: '🌦️' },
  55: { desc: '中雨',   icon: '🌧️' },
  56: { desc: '冻毛雨', icon: '🌧️' },
  57: { desc: '冻雨',   icon: '🌧️' },
  61: { desc: '小雨',   icon: '🌧️' },
  63: { desc: '中雨',   icon: '🌧️' },
  65: { desc: '大雨',   icon: '🌧️' },
  66: { desc: '冻雨',   icon: '🌧️' },
  67: { desc: '强冻雨', icon: '🌧️' },
  71: { desc: '小雪',   icon: '🌨️' },
  73: { desc: '中雪',   icon: '🌨️' },
  75: { desc: '大雪',   icon: '❄️' },
  77: { desc: '雪粒',   icon: '🌨️' },
  80: { desc: '阵雨',   icon: '🌦️' },
  81: { desc: '强阵雨', icon: '🌧️' },
  82: { desc: '暴雨',   icon: '⛈️' },
  85: { desc: '阵雪',   icon: '🌨️' },
  86: { desc: '强阵雪', icon: '❄️' },
  95: { desc: '雷阵雨', icon: '⛈️' },
  96: { desc: '雷阵雨伴冰雹', icon: '⛈️' },
  99: { desc: '强雷暴冰雹',   icon: '⛈️' },
};

// ---- 桌面漫游 / 便便 / 恶作剧参数 ----
export const ROAM = {
  /** 决定下一个漫游目标前的最小停留(ms) */
  pauseMin: 4000,
  pauseMax: 12000,
  /** 窗口移动基础速度(像素/秒，agility 50 时) */
  baseSpeed: 70,
  /** 距离目标多少像素算到达 */
  arriveThreshold: 6,
};

export const POOP = {
  /** 桌面最多保留多少坨便便（超出丢最旧的） */
  maxOnScreen: 16,
  /** 便便自动消失时间(ms)，超过则下次同步时清掉 */
  expireMs: 6 * 60 * 60 * 1000, // 6 小时
};

export const MISCHIEF = {
  /** 冷笑话调度检查间隔无关；这里是手动触发的防连点最小间隔(ms) */
  manualMinGapMs: 2000,
};

export const JOKE = {
  /** 冷笑话调度检查间隔(ms) */
  checkIntervalMs: 60 * 1000,
};

// ---- 行为频率档位 → 实际参数 ----
// 冷笑话：每 JOKE.checkIntervalMs(60s) 检查一次，按档位给触发概率。
export const JOKE_LEVEL_CHANCE: Record<FreqLevel, number> = {
  off: 0,
  low: 0.03,    // ≈ 平均每 33 分钟一次
  medium: 0.08, // ≈ 平均每 12 分钟一次
  high: 0.18,   // ≈ 平均每 5~6 分钟一次
};

// 恶作剧：漫游决策时按概率触发，并受主进程冷却限制。
export const MISCHIEF_LEVEL: Record<FreqLevel, { chance: number; cooldownMs: number }> = {
  off:    { chance: 0,    cooldownMs: Number.MAX_SAFE_INTEGER },
  low:    { chance: 0.02, cooldownMs: 25 * 60 * 1000 }, // 最快 25 分钟一次
  medium: { chance: 0.05, cooldownMs: 12 * 60 * 1000 },
  high:   { chance: 0.12, cooldownMs: 5 * 60 * 1000 },
};

// ============================================================
// 货币系统（爱心币 ❤️）
// ============================================================
// 获取维度（自行设计，向"养成 + 陪伴"倾斜）：
//   · 日常互动：摸头 +1 / 喂食 +2 / 清理便便 +5（脏活给得多）
//   · 成长：升级 +10×等级 / 进化 +50
//   · 每日首次启动登录奖励 +20
//   · 宠物漫游时偶尔"捡到"金币（被动，像旅行青蛙带东西回来）
export const COIN_REWARDS = {
  pet: 1,
  feed: 2,
  cleanPoop: 5,
  levelupPerLevel: 10,
  evolution: 50,
  dailyLogin: 20,
};

// 漫游捡金币
export const ROAM_COIN = {
  chancePerWander: 0.18,         // 每次漫游决策捡到的概率
  min: 1,
  max: 5,
  cooldownMs: 90 * 1000,         // 两次捡钱最小间隔
};

// ============================================================
// 商店目录
// ============================================================
export const SHOP_ITEMS: ShopItem[] = [
  // ---- 食物 ----
  { id: 'fish-snack', name: '小鱼干', icon: '🐟', price: 12, category: 'food',
    desc: '酥脆小鱼干，解解馋', effect: { hunger: -25, happiness: 6 } },
  { id: 'deluxe-meal', name: '豪华大餐', icon: '🍱', price: 45, category: 'food',
    desc: '管饱又开心的一顿', effect: { hunger: -60, happiness: 16 } },
  { id: 'birthday-cake', name: '生日蛋糕', icon: '🎂', price: 88, category: 'food',
    desc: '甜甜的蛋糕，幸福感拉满', effect: { hunger: -45, happiness: 32, exp: 25 } },
  // ---- 玩具 ----
  { id: 'ball', name: '小皮球', icon: '⚽', price: 30, category: 'toy',
    desc: '滚来滚去玩不腻', effect: { happiness: 26, energy: -6 } },
  { id: 'teaser', name: '逗猫棒', icon: '🎏', price: 55, category: 'toy',
    desc: '玩到停不下来', effect: { happiness: 38, energy: -10 } },
  // ---- 装扮（持久穿戴，带稀有度）----
  { id: 'red-hat', name: '小红帽', icon: '🎩', price: 100, category: 'cosmetic', slot: 'hat',
    rarity: 'common', desc: '戴上立刻精神三分' },
  { id: 'crown', name: '黄金皇冠', icon: '👑', price: 320, category: 'cosmetic', slot: 'hat',
    rarity: 'legendary', desc: '本机最尊贵的小宠物' },
  { id: 'bowtie', name: '蝴蝶结', icon: '🎀', price: 120, category: 'cosmetic', slot: 'accessory',
    rarity: 'normal', desc: '脖子上的可爱点缀' },
  { id: 'sunglasses', name: '墨镜', icon: '🕶️', price: 150, category: 'cosmetic', slot: 'glasses',
    rarity: 'uncommon', desc: '酷酷的，谁都挡不住' },
  // ---- 新品上架 ----
  { id: 'round-glasses', name: '圆框眼镜', icon: '🤓', price: 110, category: 'cosmetic', slot: 'glasses',
    rarity: 'normal', desc: '斯文败类既视感' },
  { id: 'heart-glasses', name: '爱心墨镜', icon: '😍', price: 180, category: 'cosmetic', slot: 'glasses',
    rarity: 'epic', desc: '看什么都自带滤镜' },
  { id: 'bell', name: '小铃铛', icon: '🔔', price: 100, category: 'cosmetic', slot: 'accessory',
    rarity: 'common', desc: '走起路来叮叮当当' },
  // ---- 季节限定 ----
  { id: 'flower-crown', name: '花环', icon: '🌸', price: 160, category: 'cosmetic', slot: 'hat',
    rarity: 'uncommon', season: 'spring', desc: '春日限定 · 头戴一圈小花' },
  { id: 'straw-hat', name: '草帽', icon: '👒', price: 90, category: 'cosmetic', slot: 'hat',
    rarity: 'normal', season: 'summer', desc: '夏日限定 · 去海边的标配' },
  { id: 'scarf', name: '毛围巾', icon: '🧣', price: 130, category: 'cosmetic', slot: 'accessory',
    rarity: 'uncommon', season: 'autumn', desc: '秋日限定 · 暖暖的' },
  { id: 'santa-hat', name: '圣诞帽', icon: '🎅', price: 180, category: 'cosmetic', slot: 'hat',
    rarity: 'rare', season: 'winter', desc: '冬日限定 · 叮叮当~' },
  // ---- 特殊 ----
  { id: 'energy-drink', name: '营养快线', icon: '🥤', price: 200, category: 'special',
    desc: '一口回满所有状态', effect: { hunger: -100, energy: 100, happiness: 50, cleanliness: 100 } },
  { id: 'exp-boost', name: '成长加速器', icon: '⭐', price: 260, category: 'special',
    desc: '一大口经验值', effect: { exp: 120, happiness: 10 } },
];

// ============================================================
// 打工系统（让宠物去打工赚爱心币）
// ============================================================
export const JOB_CATEGORIES: JobCategory[] = [
  { key: 'tech',     label: '💻 科技' },
  { key: 'errand',   label: '🛵 跑腿' },
  { key: 'pet',      label: '🐾 宠物服务' },
  { key: 'food',     label: '🍳 餐饮' },
  { key: 'outdoor',  label: '🌳 户外' },
  { key: 'creative', label: '🎨 创意' },
  { key: 'home',     label: '🏠 居家' },
  { key: 'perform',  label: '🎭 表演' },
  { key: 'office',   label: '📚 文职' },
  { key: 'fantasy',  label: '🧙 魔幻' },
  { key: 'space',    label: '🚀 星际' },
  { key: 'odd',      label: '🎲 奇趣' },
];

// durationSec 用秒；reward 大致随时长与难度递增。
export const JOBS: Job[] = [
  // ---- 💻 科技 ----
  { id: 'code-web',   name: '敲代码做网站', icon: '💻', category: 'tech', durationSec: 600,  reward: 90,  desc: '帮人做个小网站' },
  { id: 'fix-pc',     name: '上门修电脑',   icon: '🖥️', category: 'tech', durationSec: 300,  reward: 45,  desc: '重启试试？修好了' },
  { id: 'edit-video', name: '剪辑短视频',   icon: '🎬', category: 'tech', durationSec: 480,  reward: 70,  desc: '卡点剪出爆款' },
  { id: 'live-sell',  name: '直播带货',     icon: '📱', category: 'tech', durationSec: 900,  reward: 150, desc: '家人们上链接！' },
  { id: 'data-label', name: '数据标注',     icon: '🏷️', category: 'tech', durationSec: 360,  reward: 40,  desc: '一框一框标注' },
  { id: 'debug',      name: '通宵修Bug',    icon: '🐛', category: 'tech', durationSec: 420,  reward: 65,  desc: '又是分号的锅' },
  { id: 'make-meme',  name: '做表情包',     icon: '😹', category: 'tech', durationSec: 180,  reward: 24,  desc: 'P一套可爱表情' },
  { id: 'ai-train',   name: '炼丹跑模型',   icon: '🤖', category: 'tech', durationSec: 1200, reward: 200, desc: '显卡呼呼地转' },
  { id: 'write-copy', name: '憋营销文案',   icon: '✍️', category: 'tech', durationSec: 240,  reward: 30,  desc: '标题党一下' },
  { id: 'game-test',  name: '试玩找Bug',    icon: '🎮', category: 'tech', durationSec: 480,  reward: 62,  desc: '边玩边挑刺' },
  { id: 'mini-app',   name: '做小程序',     icon: '📲', category: 'tech', durationSec: 720,  reward: 110, desc: '扫码就能用' },

  // ---- 🛵 跑腿 ----
  { id: 'food-deliver', name: '送外卖',       icon: '🛵', category: 'errand', durationSec: 300, reward: 38, desc: '风里雨里准时达' },
  { id: 'ddriver',      name: '代驾骑回家',   icon: '🚲', category: 'errand', durationSec: 480, reward: 60, desc: '把你安全送到家' },
  { id: 'express',      name: '派送快递',     icon: '📦', category: 'errand', durationSec: 360, reward: 42, desc: '您的快递到了' },
  { id: 'shopping',     name: '跑腿代购',     icon: '🛍️', category: 'errand', durationSec: 240, reward: 28, desc: '帮你把东西买回' },
  { id: 'queue',        name: '排队代排',     icon: '🧍', category: 'errand', durationSec: 600, reward: 70, desc: '替你排网红店' },
  { id: 'bike-park',    name: '摆共享单车',   icon: '🚲', category: 'errand', durationSec: 300, reward: 30, desc: '把车摆整齐' },
  { id: 'night-snack',  name: '夜宵跑腿',     icon: '🌙', category: 'errand', durationSec: 420, reward: 55, desc: '深夜的温暖外卖' },
  { id: 'airport',      name: '机场接送',     icon: '✈️', category: 'errand', durationSec: 600, reward: 90, desc: '举牌接机' },
  { id: 'grocery',      name: '代买菜',       icon: '🥬', category: 'errand', durationSec: 240, reward: 26, desc: '挑最新鲜的' },

  // ---- 🐾 宠物服务 ----
  { id: 'feed-cat',   name: '上门喂猫',   icon: '🐱', category: 'pet', durationSec: 180,  reward: 26,  desc: '给猫主子加餐' },
  { id: 'walk-dog',   name: '遛三只狗',   icon: '🐕', category: 'pet', durationSec: 300,  reward: 40,  desc: '被狗子拽着跑' },
  { id: 'pet-groom',  name: '宠物美容',   icon: '✂️', category: 'pet', durationSec: 480,  reward: 72,  desc: '洗剪吹一条龙' },
  { id: 'pooper',     name: '帮忙铲屎',   icon: '💩', category: 'pet', durationSec: 120,  reward: 18,  desc: '铲屎官的日常' },
  { id: 'pet-hotel',  name: '宠物寄养',   icon: '🏨', category: 'pet', durationSec: 1200, reward: 180, desc: '照看一天毛孩子' },
  { id: 'train-dog',  name: '训练狗狗',   icon: '🦮', category: 'pet', durationSec: 600,  reward: 85,  desc: '教它握手坐下' },
  { id: 'bird-sit',   name: '陪鹦鹉聊天', icon: '🦜', category: 'pet', durationSec: 240,  reward: 30,  desc: '你好~你好~' },
  { id: 'fish-tank',  name: '清理鱼缸',   icon: '🐠', category: 'pet', durationSec: 300,  reward: 36,  desc: '给鱼缸换水' },

  // ---- 🍳 餐饮 ----
  { id: 'kitchen',  name: '后厨颠勺',     icon: '🍳', category: 'food', durationSec: 600, reward: 75, desc: '火候掌握得好' },
  { id: 'waiter',   name: '餐厅端盘',     icon: '🍽️', category: 'food', durationSec: 360, reward: 40, desc: '您的菜上齐了' },
  { id: 'bbq',      name: '烤串小哥',     icon: '🍢', category: 'food', durationSec: 480, reward: 60, desc: '滋滋冒油' },
  { id: 'milk-tea', name: '摇奶茶',       icon: '🧋', category: 'food', durationSec: 300, reward: 38, desc: '三分糖去冰' },
  { id: 'pancake',  name: '摆摊煎饼',     icon: '🥞', category: 'food', durationSec: 420, reward: 52, desc: '加俩蛋不？' },
  { id: 'dishwash', name: '刷一池碗',     icon: '🍴', category: 'food', durationSec: 180, reward: 20, desc: '泡沫满满' },
  { id: 'taster',   name: '当试吃员',     icon: '😋', category: 'food', durationSec: 240, reward: 35, desc: '吃饭也能赚钱' },
  { id: 'dumpling', name: '包一锅饺子',   icon: '🥟', category: 'food', durationSec: 360, reward: 44, desc: '褶子捏得真好' },
  { id: 'barista',  name: '咖啡拉花',     icon: '☕', category: 'food', durationSec: 360, reward: 46, desc: '拉个小爱心' },

  // ---- 🌳 户外 ----
  { id: 'fruit',       name: '果园摘果',   icon: '🍎', category: 'outdoor', durationSec: 480,  reward: 58,  desc: '摘满一篮子' },
  { id: 'plant-tree',  name: '上山种树',   icon: '🌲', category: 'outdoor', durationSec: 600,  reward: 72,  desc: '为地球添点绿' },
  { id: 'fishing',     name: '湖边钓鱼',   icon: '🎣', category: 'outdoor', durationSec: 900,  reward: 110, desc: '愿者上钩' },
  { id: 'shepherd',    name: '草原放羊',   icon: '🐑', category: 'outdoor', durationSec: 1200, reward: 150, desc: '数羊数到睡着' },
  { id: 'sweep-leaf',  name: '扫公园落叶', icon: '🍂', category: 'outdoor', durationSec: 240,  reward: 26,  desc: '沙沙沙' },
  { id: 'water-flower', name: '给花园浇水', icon: '🌻', category: 'outdoor', durationSec: 180,  reward: 18,  desc: '花儿喝饱水' },
  { id: 'harvest',     name: '下地收稻',   icon: '🌾', category: 'outdoor', durationSec: 720,  reward: 95,  desc: '丰收的喜悦' },
  { id: 'beekeep',     name: '养蜂采蜜',   icon: '🐝', category: 'outdoor', durationSec: 900,  reward: 130, desc: '甜甜的蜂蜜' },
  { id: 'mushroom',    name: '采蘑菇',     icon: '🍄', category: 'outdoor', durationSec: 480,  reward: 60,  desc: '别采到毒的' },

  // ---- 🎨 创意 ----
  { id: 'draw',     name: '画画接单',   icon: '🎨', category: 'creative', durationSec: 600,  reward: 95,  desc: '约稿排到下月' },
  { id: 'novel',    name: '码字写小说', icon: '📖', category: 'creative', durationSec: 1200, reward: 190, desc: '日更三千字' },
  { id: 'compose',  name: '写一首歌',   icon: '🎵', category: 'creative', durationSec: 900,  reward: 140, desc: '灵感来了' },
  { id: 'pottery',  name: '捏小陶罐',   icon: '🏺', category: 'creative', durationSec: 480,  reward: 62,  desc: '人间烟火气' },
  { id: 'knit',     name: '织毛衣',     icon: '🧶', category: 'creative', durationSec: 720,  reward: 88,  desc: '一针一线' },
  { id: 'photo',    name: '外拍接单',   icon: '📷', category: 'creative', durationSec: 360,  reward: 50,  desc: '咔嚓出片' },
  { id: 'handbook', name: '做可爱手账', icon: '📒', category: 'creative', durationSec: 300,  reward: 38,  desc: '贴纸贴满' },
  { id: 'couplet',  name: '写春联',     icon: '🧧', category: 'creative', durationSec: 300,  reward: 42,  desc: '福字倒着贴' },

  // ---- 🏠 居家 ----
  { id: 'clean',    name: '大扫除',     icon: '🧹', category: 'home', durationSec: 360, reward: 40,  desc: '一尘不染' },
  { id: 'organize', name: '收纳整理',   icon: '🧺', category: 'home', durationSec: 300, reward: 35,  desc: '断舍离' },
  { id: 'plumb',    name: '修漏水管',   icon: '🔧', category: 'home', durationSec: 420, reward: 58,  desc: '不漏了！' },
  { id: 'bulb',     name: '换个灯泡',   icon: '💡', category: 'home', durationSec: 120, reward: 16,  desc: '咔哒，亮了' },
  { id: 'moving',   name: '搬家帮工',   icon: '📦', category: 'home', durationSec: 900, reward: 130, desc: '小心轻放' },
  { id: 'window',   name: '擦高层玻璃', icon: '🪟', category: 'home', durationSec: 300, reward: 36,  desc: '亮晶晶' },
  { id: 'garden',   name: '修剪花园',   icon: '🌳', category: 'home', durationSec: 420, reward: 50,  desc: '修出造型' },

  // ---- 🎭 表演 ----
  { id: 'busk',   name: '街头弹唱',   icon: '🎸', category: 'perform', durationSec: 600, reward: 80,  desc: '路人纷纷打赏' },
  { id: 'mascot', name: '扮玩偶发单', icon: '🐻', category: 'perform', durationSec: 720, reward: 90,  desc: '热到冒汗也要萌' },
  { id: 'voice',  name: '给动画配音', icon: '🎙️', category: 'perform', durationSec: 480, reward: 72,  desc: '一人配八角' },
  { id: 'dance',  name: '广场领舞',   icon: '💃', category: 'perform', durationSec: 360, reward: 48,  desc: '带阿姨们蹦迪' },
  { id: 'magic',  name: '变魔术',     icon: '🎩', category: 'perform', durationSec: 540, reward: 78,  desc: '见证奇迹' },
  { id: 'sing',   name: '酒吧驻唱',   icon: '🎤', category: 'perform', durationSec: 720, reward: 100, desc: '今晚的歌很温柔' },

  // ---- 📚 文职 ----
  { id: 'files',      name: '归档文件',   icon: '🗂️', category: 'office', durationSec: 300, reward: 32,  desc: '按字母排好' },
  { id: 'data-entry', name: '录入Excel',  icon: '⌨️', category: 'office', durationSec: 360, reward: 38,  desc: '复制粘贴大师' },
  { id: 'phone',      name: '客服接线',   icon: '☎️', category: 'office', durationSec: 600, reward: 60,  desc: '您好请问有什么' },
  { id: 'translate',  name: '翻译文档',   icon: '🌐', category: 'office', durationSec: 720, reward: 110, desc: '信达雅' },
  { id: 'assistant',  name: '当小助理',   icon: '📋', category: 'office', durationSec: 900, reward: 120, desc: '老板的左右手' },
  { id: 'meeting',    name: '做会议记录', icon: '📝', category: 'office', durationSec: 480, reward: 55,  desc: '速记小能手' },

  // ---- 🧙 魔幻 ----
  { id: 'slay-dragon',    name: '讨伐恶龙',   icon: '🐲', category: 'fantasy', durationSec: 1800, reward: 400, desc: '勇者出击！' },
  { id: 'brew-potion',    name: '熬制魔药',   icon: '⚗️', category: 'fantasy', durationSec: 900,  reward: 160, desc: '咕嘟咕嘟' },
  { id: 'guard-treasure', name: '守护宝库',   icon: '💎', category: 'fantasy', durationSec: 1500, reward: 300, desc: '一夜没合眼' },
  { id: 'summon',         name: '画召唤法阵', icon: '🔮', category: 'fantasy', durationSec: 1200, reward: 220, desc: '别画歪了' },
  { id: 'mage-intern',    name: '魔法学徒',   icon: '🪄', category: 'fantasy', durationSec: 600,  reward: 100, desc: '给法师打下手' },
  { id: 'catch-spirit',   name: '森林抓精灵', icon: '🧚', category: 'fantasy', durationSec: 480,  reward: 85,  desc: '它跑得好快' },
  { id: 'ghost-bust',     name: '夜里捉鬼',   icon: '👻', category: 'fantasy', durationSec: 900,  reward: 170, desc: '谁在那儿！' },
  { id: 'tame-phoenix',   name: '驯服火凤凰', icon: '🔥', category: 'fantasy', durationSec: 1500, reward: 320, desc: '浴火重生' },
  { id: 'alchemy',        name: '点石成金',   icon: '🪙', category: 'fantasy', durationSec: 1200, reward: 260, desc: '差一点就成了' },
  { id: 'rune',           name: '刻符文',     icon: '🔯', category: 'fantasy', durationSec: 600,  reward: 105, desc: '古老的力量' },

  // ---- 🚀 星际 ----
  { id: 'mine-asteroid',  name: '小行星采矿', icon: '☄️', category: 'space', durationSec: 1500, reward: 280, desc: '挖到稀有矿' },
  { id: 'space-courier',  name: '时空快递',   icon: '🛸', category: 'space', durationSec: 1200, reward: 240, desc: '跨星系送货' },
  { id: 'moon-farm',      name: '月球种土豆', icon: '🌕', category: 'space', durationSec: 1800, reward: 350, desc: '火星救援同款' },
  { id: 'star-map',       name: '绘制星图',   icon: '🌌', category: 'space', durationSec: 900,  reward: 150, desc: '又发现一颗星' },
  { id: 'alien-talk',     name: '外星语翻译', icon: '👽', category: 'space', durationSec: 720,  reward: 130, desc: '滴滴~叭叭~' },
  { id: 'fix-satellite',  name: '太空修卫星', icon: '🛰️', category: 'space', durationSec: 1200, reward: 230, desc: '太空行走中' },
  { id: 'moon-rover',     name: '开月球车',   icon: '🚙', category: 'space', durationSec: 720,  reward: 140, desc: '颠簸又刺激' },

  // ---- 🎲 奇趣 ----
  { id: 'cloud-count', name: '躺着数云朵',   icon: '☁️', category: 'odd', durationSec: 600,  reward: 50,  desc: '这朵像棉花糖' },
  { id: 'nap-tester',  name: '试睡员',       icon: '😴', category: 'odd', durationSec: 1800, reward: 200, desc: '睡觉也能赚钱' },
  { id: 'bubble-pop',  name: '戳一墙泡泡',   icon: '🫧', category: 'odd', durationSec: 120,  reward: 14,  desc: '啵啵啵超解压' },
  { id: 'net-idol',    name: '拍可爱视频',   icon: '⭐', category: 'odd', durationSec: 900,  reward: 160, desc: '一夜涨粉' },
  { id: 'treasure-dig', name: '海滩挖宝',    icon: '🪙', category: 'odd', durationSec: 720,  reward: 120, desc: '叮！金属探测' },
  { id: 'snowman',     name: '堆雪人',       icon: '⛄', category: 'odd', durationSec: 480,  reward: 55,  desc: '胡萝卜鼻子' },
  { id: 'rainbow',     name: '去找彩虹',     icon: '🌈', category: 'odd', durationSec: 600,  reward: 70,  desc: '雨后的惊喜' },
  { id: 'wish-collect', name: '收集愿望',    icon: '✨', category: 'odd', durationSec: 900,  reward: 130, desc: '满天的星愿' },
];

// ============================================================
// 记忆 / 回忆碎片
// ============================================================
export const MEMORY = {
  /** 回忆气泡调度检查间隔(ms) */
  checkIntervalMs: 90 * 1000,
  /** 每次检查冒出回忆的概率 */
  chance: 0.18,
};

// ---- grsai 生图渠道默认配置 ----
export const GRSAI = {
  nodes: (() => {
    const envNodes = process.env.IMAGE_GEN_GRSAI_NODES;
    if (envNodes) return envNodes.split(',').map(s => s.trim()).filter(Boolean);
    return ['https://grsaiapi.com'];
  })(),
  defaultModel: 'gpt-image-2',
  pollIntervalMs: 4000,
  maxPolls: 90,
};

// ---- MVP Release Gate — each dimension must meet minimum score ----
export const MVP_SCORE_GATE = {
  coreLoop: 7,
  rewardStructure: 6,
  progressionGrowth: 7,
  socialEngine: 4,
  flowChannel: 7,
  triggerHooks: 7,
  ethicalBoundary: 8,
  // Total: 46/56 (avg 6.6/10)
};
