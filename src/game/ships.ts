/**
 * 舰船数据表 —— 由标注器输出直接转换。
 *
 * 命名约定（来自标注）：
 *   武器前缀：su 鱼雷 / le 激光 / ca 机枪 / K 轨道炮 / P 等离子 / io 离子炮
 *   强度后缀：- 削弱 / -- 更削弱 / + 增强 / ++ 更强 / +++ 超强 / A 定制级
 *   A = 定制级主炮：按同型号舰船的有效耐久（结构+护盾）评定，标准是 4 发击毁同级舰。
 *   附带 Auto = 自动炮：只攻击「已经攻击过我方」的目标，不主动开火
 *   喷口后缀：S 副推进器 / F 反推进器 / A 定制级
 *
 * 坐标：+X 右 / +Y 上 / -Z 机首，单位米。
 */

export type WeaponType = 'laser' | 'cannon' | 'torpedo' | 'railgun' | 'plasma' | 'ion';

export interface WeaponMount {
  id: string;
  type: WeaponType;
  pos: [number, number, number];
  damage: number;
  rate: number;
  speed: number;
  range: number;
  spread: number;
  color: number;
  /** 自动炮塔：可独立瞄准 */
  turret?: boolean;
  /** 侧向发射：su(L)/su(R) */
  side?: 'left' | 'right';
  /** 动态装填范围（秒）；定制鱼雷每次发射后在范围内随机 */
  reloadRange?: [number, number];
}

export type NozzleRole = 'main' | 'secondary' | 'retro';

/** 武器选择面板的顺序/名称 */
export const WEAPON_ORDER: WeaponType[] = ['railgun', 'torpedo', 'plasma', 'ion', 'cannon', 'laser'];
export const WEAPON_LABELS: Record<WeaponType, string> = {
  railgun: '轨道炮',
  torpedo: '鱼雷',
  // P = 舰首炮；io = 副炮
  plasma: '舰首炮',
  ion: '副炮',
  cannon: '机炮',
  laser: '激光',
};

export const TIER_LABELS: Record<number, string> = {
  1: '微型', 2: '轻型', 3: '中型', 4: '重型', 5: '大型', 6: '主力',
  7: '旗舰', 8: '母舰', 9: '无畏', 10: '超无畏', 11: '贡献', 12: '未定',
};

export function tierLabel(tier: number): string {
  return TIER_LABELS[tier] ?? `T${tier}`;
}

export function manualWeaponTypes(spec: ShipSpec): WeaponType[] {
  return WEAPON_ORDER.filter((type) => spec.weapons.some((weapon) => !weapon.turret && weapon.type === type));
}

export interface NozzleMount {
  id: string;
  pos: [number, number, number];
  role: NozzleRole;
  size: number;
}

export interface ShipSpec {
  id: string;
  name: string;
  code: string;
  role: string;
  class: string;
  /** 舰级：按舰桥/驾驶舱尺寸分级，T5+ 主力，T6+ 准主力，T7+ 超主力 */
  tier: number;
  /** public/models 下的 GLB 文件名 */
  model: string;
  length: number;
  /** 引擎尾焰颜色 */
  exhaust: number;
  /** 主推进器尾焰长度/宽度缩放，默认 1；超大舰可调小 */
  plumeScale: number;
  /** 舰载传感器探测距离（米） */
  sensorRange: number;
  /** B 键跃迁充能秒数 */
  chargeTime: number;
  /** 超大舰需要 G+H+B 组合 */
  warpCombo: boolean;
  cockpits: Array<[number, number, number]>;
  maxSpeed: number;
  boostSpeed: number;
  accel: number;
  turnRate: number;
  hull: number;
  shield: number;
  shieldRegen: number;
  parts: { engine: number; weapon: number; cockpit: number };
  nozzles: NozzleMount[];
  weapons: WeaponMount[];
}

const BASE: Record<WeaponType, { damage: number; rate: number; speed: number; range: number; spread: number; color: number }> = {
  laser:   { damage: 14,  rate: 5.0,  speed: 6500, range: 3000, spread: 0.0010, color: 0x6fe8ff },
  cannon:  { damage: 42,  rate: 2.2,  speed: 4000, range: 2800, spread: 0.0030, color: 0xffb066 },
  torpedo: { damage: 180, rate: 0.4,  speed: 900,  range: 8000, spread: 0.0100, color: 0xff7a5c },
  railgun: { damage: 320, rate: 0.18, speed: 9000, range: 9000, spread: 0.0005, color: 0xd8c8ff },
  plasma:  { damage: 120, rate: 0.8,  speed: 2200, range: 3200, spread: 0.0040, color: 0xb49cff },
  ion:     { damage: 80,  rate: 1.4,  speed: 3600, range: 3400, spread: 0.0025, color: 0x9fd8ff },
};

const MOD: Record<string, number> = {
  '': 1, '-': 0.7, '--': 0.5, '+': 1.3, '++': 1.6, '+++': 2.0, '++++': 2.5,
};

/** 伤害越低射速越快；A 级主炮刻意更慢 */
const MOD_RATE: Record<string, number> = {
  '': 1, '-': 1.35, '--': 1.7, '+': 0.9, '++': 0.78, '+++': 0.68, '++++': 0.6, 'A': 0.85,
};

/** A 级定制武器的初速倍率：定制鱼雷和舰首炮明显更快 */
const A_SPEED: Partial<Record<WeaponType, number>> = {
  torpedo: 2.4,
  plasma: 1.5,
};

/** 每艘船的设计射速系数：拦截机快、轰炸机慢、大舰更慢 */
const SHIP_FIRE_RATE: Record<string, number> = {
  thunderbolt: 1.25,
  f008: 1.5,
  bomber: 0.82,
  freighter: 0.7,
  commander: 0.95,
  battleship: 0.72,
};

/** 大舰尾焰缩放：Archon 的喷口太大，缩小成红色小尾焰 */
const PLUME_SCALE: Record<string, number> = {
  rta_archon: 0.16,
};

/** 护盾每秒恢复比例：大舰按最大护盾百分比恢复，避免 120k 护盾回满要半小时 */
const SHIELD_REGEN_FRACTION: Record<string, number> = {
  light: 0.022,
  heavy: 0.014,
  large: 0.010,
  capital: 0.0075,
  flagship: 0.0085,
  dreadnought: 0.0055,
};

/** A 级主炮：4 发击毁同型号舰船（按结构+护盾计算） */
const A_SHOTS_TO_KILL = 4;
/** A 级定制鱼雷：伤害为主炮一半、初速 4×、装填 0.5× */
const A_TORPEDO_SHOTS_TO_KILL = 8;
const A_TORPEDO_SPEED_MULT = 4;
const A_TORPEDO_RATE_MULT = 0.5;

/** 从标注标签解析武器：W1su- / W3K A / W2ca+++Auto */
function parseWeapon(
  tag: string,
  pos: [number, number, number],
  durability: number,
  shipFireRate = 1,
  rangeScale = 1,
): WeaponMount {
  const code = tag.replace(/^W\d+/, '');
  const turret = /Auto/i.test(code);
  let body = code.replace(/Auto/i, '');
  const sideMatch = body.match(/\((L|R)\)/i);
  const side = sideMatch ? (sideMatch[1].toUpperCase() === 'L' ? 'left' as const : 'right' as const) : undefined;
  body = body.replace(/\((L|R)\)/gi, '');

  const typeMatch = body.match(/^(su|le|ca|K|P|io)/);
  const prefix = typeMatch ? typeMatch[1] : 'le';
  const rest = body.slice(prefix.length);

  const modMatch = rest.match(/(---+|\+{1,4}|A|)$/);
  const mod = modMatch ? modMatch[1] : '';

  const type: WeaponType =
    prefix === 'su' ? 'torpedo' : prefix === 'le' ? 'laser' : prefix === 'ca' ? 'cannon' : prefix === 'K' ? 'railgun' : prefix === 'io' ? 'ion' : 'plasma';

  const base = BASE[type];
  const aTorpedo = mod === 'A' && type === 'torpedo';
  const damage = mod === 'A'
    ? Math.round(durability / (aTorpedo ? A_TORPEDO_SHOTS_TO_KILL : A_SHOTS_TO_KILL))
    : Math.round(base.damage * (MOD[mod] ?? 1));

  return {
    id: tag,
    type,
    pos,
    damage,
    rate: base.rate * (aTorpedo ? A_TORPEDO_RATE_MULT : (MOD_RATE[mod] ?? 1)) * shipFireRate,
    speed: base.speed * (aTorpedo ? A_TORPEDO_SPEED_MULT : mod === 'A' ? (A_SPEED[type] ?? 1) : 1),
    range: base.range * rangeScale,
    spread: base.spread,
    color: base.color,
    turret,
    side,
    reloadRange: aTorpedo ? [5, 15] : undefined,
  };
}

/** 从标注标签解析喷口：N1 / N2S / N1SF / N1A */
function parseNozzle(tag: string, pos: [number, number, number], length: number): NozzleMount {
  const code = tag.replace(/^N\d+/, '');
  const role: NozzleRole = code.includes('F') ? 'retro' : code.includes('S') ? 'secondary' : 'main';
  const size = role === 'main' ? Math.max(0.8, length * 0.012) : Math.max(0.4, length * 0.006);
  return { id: tag, pos, role, size };
}

interface Raw {
  id: string;
  name: string;
  code: string;
  role: string;
  class: string;
  /** 舰级：按舰桥/驾驶舱尺寸分级，T5+ 主力，T6+ 准主力，T7+ 超主力 */
  tier: number;
  /** public/models 下的 GLB 文件名 */
  model: string;
  length: number;
  exhaust: number;
  plumeScale?: number;
  sensorRange: number;
  speed: [number, number, number, number];
  hull: [number, number, number, number];
  cockpits: Array<[number, number, number]>;
  nozzles: Array<[string, number, number, number]>;
  weapons: Array<[string, number, number, number]>;
}

const ANNOTATION_LENGTH: Record<string, number> = {
  thunderbolt: 25,
  f008: 22,
  bomber: 120,
  freighter: 280,
  commander: 620,
  battleship: 1250,
  rta_archon: 8000,
  iac_bomber_dk6: 35,
  iac_gladius: 90,
  wrs_templar: 160,
  wrs_tigris: 280,
  ort_phalanx: 80,
  ort_rhodes: 350,
  rta_shark: 28,
};

const RAW: Raw[] = [
  {
    id: 'thunderbolt', name: 'A-30 雷霆', code: 'A-30', role: '多用途战斗机', class: 'light', tier: 2, model: 'thunderbolt.glb', length: 25, exhaust: 0x4fd8ff, sensorRange: 60000,
    speed: [820, 400000, 700, 1.0], hull: [1200, 400, 22, 300],
    cockpits: [[0.0, 0.3, -9.9]],
    nozzles: [
      ['N1', 3.3, -1.0, 7.6], ['N2', -3.3, -0.8, 8.2],
      ['N3S', 2.6, 1.6, 6.1], ['N4S', -2.6, 1.7, 6.2],
      ['N1SF', 2.7, 1.7, -4.2], ['N2SF', -2.8, 1.7, -4.2],
    ],
    weapons: [
      ['W1ca-', -0.3, -3.5, -7.6],
      ['W2su-', -9.0, -0.4, 0.9], ['W3su-', 9.1, -0.5, 0.9],
      ['W4su--', -10.7, 1.4, 2.5], ['W5su--', 10.8, 1.3, 2.8],
    ],
  },
  {
    id: 'f008', name: 'SF-F008 短剑', code: 'F-008', role: '轻型截击机', class: 'light', tier: 2, model: 'f008.glb', length: 22, exhaust: 0xff8a3c, sensorRange: 70000,
    speed: [980, 460000, 900, 1.25], hull: [780, 620, 30, 220],
    cockpits: [[0.0, 0.7, -7.2]],
    nozzles: [
      ['N1', 5.4, 0.6, 6.4], ['N2', -5.2, 0.5, 5.9],
      ['N1SF', 3.6, 0.2, -5.2], ['N2SF', -3.9, 0.3, -5.1],
    ],
    weapons: [
      ['W1ca+', -0.9, -2.2, -8.7], ['W2ca+', 1.0, -2.1, -8.8],
      ['W1su+', 4.2, -1.5, -3.3], ['W2su+', -4.3, -1.5, -3.3],
    ],
  },
  {
    id: 'bomber', name: 'SF 轰炸机 CR', code: 'CR-3', role: '重型轰炸机', class: 'heavy', tier: 4, model: 'bomber.glb', length: 180, exhaust: 0x4fd8ff, sensorRange: 120000,
    speed: [620, 360000, 460, 0.72], hull: [9000, 3000, 40, 700],
    cockpits: [[0.0, 10.1, -26.0]],
    nozzles: [
      ['N1', 10.1, -4.7, 40.0], ['N2', -10.0, -4.8, 40.0],
      ['N3S', 28.9, -1.7, 21.2], ['N4S', -29.1, -2.2, 20.9],
    ],
    weapons: [
      ['W1P-', -26.0, -9.0, -31.1], ['W2P-', 25.7, -9.1, -30.9],
    ],
  },
  {
    id: 'freighter', name: '货船 MB', code: 'MB-4', role: '货船', class: 'large', tier: 5, model: 'freighter.glb', length: 520, exhaust: 0x4fd8ff, sensorRange: 180000,
    speed: [440, 300000, 300, 0.45], hull: [26000, 9000, 18, 1200],
    cockpits: [[-24.0, 2.1, -125.1]],
    nozzles: [
      ['N1', 75.1, -26.2, 105.6], ['N2', -72.2, -26.6, 105.3],
      ['N3S', 75.1, -26.1, -41.8], ['N4S', -72.8, -24.0, -45.5],
    ],
    weapons: [
      ['W1ca-', -41.4, 16.3, -98.9],
    ],
  },
  {
    id: 'commander', name: 'Commander 指挥舰', code: 'CG-7', role: '指挥舰', class: 'flagship', tier: 7, model: 'commander.glb', length: 2400, exhaust: 0xbfe0ff, sensorRange: 400000,
    speed: [380, 280000, 260, 0.55], hull: [82000, 48000, 95, 2600],
    cockpits: [[0.7, 44.1, -161.0]],
    nozzles: [
      ['N1', -0.5, 18.5, 230.4],
      ['N2S', 5.6, 5.5, 230.4], ['N3S', -6.9, 6.4, 230.4],
    ],
    weapons: [
      ['W1ca-Auto', -84.9, 28.5, 13.0], ['W2ca-Auto', 86.9, 31.3, 12.8],
      ['W1KA', -27.4, 16.6, -310.0], ['W2KA', 25.2, 17.5, -310.0],
      ['W1P-Auto', -111.1, 22.7, -137.4], ['W2P-Auto', 110.8, 23.0, -136.5],
      ['W3P-Auto', -108.7, 2.0, 104.7], ['W4P-Auto', 105.8, 3.7, 104.1],
    ],
  },
  {
    id: 'battleship', name: 'SF 战列舰', code: 'BB-6', role: '战列舰', class: 'capital', tier: 6, model: 'battleship.glb', length: 2000, exhaust: 0xff4a3a, sensorRange: 350000,
    speed: [280, 260000, 180, 0.34], hull: [320000, 120000, 80, 5000],
    cockpits: [[-1.0, 131.3, -170.2]],
    nozzles: [
      ['N1', 192.4, 81.0, 597.3], ['N2', -188.2, 81.2, 597.3],
      ['N5', 194.4, -79.8, 597.3], ['N6', -192.0, -78.1, 597.3],
      ['N3S', 32.6, 121.1, 603.8], ['N4S', -29.4, 122.3, 603.8],
    ],
    weapons: [
      ['W1P+++Auto', -170.1, -48.9, -210.3], ['W2P+++Auto', 155.0, -62.0, -203.1],
      ['W3ca+++Auto', -50.9, 143.5, 78.8], ['W4ca+++Auto', 50.1, 148.3, 74.7],
      ['W5su+++', -302.3, 2.8, 294.8], ['W6su+++', 305.4, 0.1, 290.5],
      ['W7KA', -3.6, -136.6, -571.7],
      ['W8ca-Auto', -52.9, 133.1, 139.8], ['W9ca-Auto', -45.5, 117.8, 199.9],
      ['W10ca-Auto', -57.8, 129.2, 246.5], ['W11ca-Auto', 58.8, 125.3, 236.4],
      ['W12ca-Auto', 58.4, 126.7, 191.1], ['W13ca-Auto', 58.5, 126.5, 131.6],
      ['W14io+Auto', 105.8, -76.1, 72.8], ['W15io+Auto', -111.9, -75.5, 69.7],
      ['W16io+Auto', -69.8, 31.1, -215.4], ['W17io+Auto', 67.6, 33.8, -220.6],
    ],
  },
  {
    id: 'rta_archon', name: 'RTA Archon', code: 'AR-10', role: '超无畏舰', class: 'dreadnought', tier: 10, model: 'candidates/rta_archon.glb', length: 8000, exhaust: 0xff2a1a, plumeScale: 0.16, sensorRange: 650000,
    speed: [170, 240000, 100, 0.16], hull: [1000000, 420000, 180, 18000],
    cockpits: [[2.2, 369.4, -3602.3]],
    nozzles: [
      ['N1', -180.3, 183.9, 3868.2], ['N2', 146.2, 179.7, 3868.2],
      ['N3S--', -70.0, 274.7, 3105.0], ['N4S--', 19.1, 269.3, 3104.6],
      ['N5S--', -19.9, 183.7, 3203.1], ['N6S--', -62.2, 103.6, 3102.7],
      ['N7S--', 15.3, 98.1, 3103.7],
      ['N8S---', 621.4, 180.7, 3448.7], ['N9S---', -639.1, 186.0, 3448.7],
      ['N10S---', -438.8, 244.1, 3603.8], ['N11S---', -440.4, 128.7, 3601.8],
      ['N12S---', 410.3, 241.6, 3593.9], ['N13S---', 414.0, 122.0, 3585.6],
    ],
    weapons: [
      ['W1PA', 160.1, 303.8, -3999.0], ['W2PA', -160.4, 307.7, -3999.0],
      ['W3PA', 163.4, 116.7, -4000.0], ['W4PA', -165.4, 117.1, -4000.0],
      ['W5PA', 228.5, 263.4, -3896.0], ['W6PA', 225.1, 157.5, -3876.9],
      ['W7PA', -227.4, 260.7, -3876.5], ['W8PA', -213.2, 122.4, -3762.7],
      ['W9io+++Auto', -545.2, 490.1, 1931.1], ['W10io+++Auto', 538.1, 480.0, 1940.1],
      ['W11io+++Auto', -547.1, -110.1, 1940.6], ['W12io+++Auto', 542.3, -122.2, 1938.9],
      ['W13suA(L)Auto', -537.5, 195.2, -368.6], ['W14suA(L)Auto', -541.1, 190.7, -275.9],
      ['W15suA(L)Auto', -554.2, 190.0, -191.1], ['W16suA(L)Auto', -569.9, 195.0, -109.5],
      ['W17suA(L)Auto', -577.1, 193.3, -20.6], ['W18suA(L)Auto', -587.7, 196.1, 65.4],
      ['W19suA(L)Auto', -596.9, 195.6, 152.6], ['W20suA(L)Auto', -606.0, 194.6, 239.1],
      ['W21suA(L)Auto', -615.1, 191.3, 330.5], ['W22suA(L)Auto', -621.7, 192.9, 420.8],
      ['W23suA(L)Auto', -633.7, 192.8, 505.4],
      ['W24suA(R)Auto', 625.9, 184.5, 416.0], ['W25suA(R)Auto', 614.5, 184.1, 326.3],
      ['W26suA(R)Auto', 605.2, 187.0, 239.7], ['W27suA(R)Auto', 596.4, 186.2, 151.5],
      ['W28suA(R)Auto', 577.8, 178.2, 64.9], ['W29suA(R)Auto', 570.7, 182.1, -28.1],
      ['W30suA(R)Auto', 566.9, 187.7, -106.7], ['W31suA(R)Auto', 559.5, 188.1, -196.0],
      ['W32suA(R)Auto', 550.4, 188.1, -284.4], ['W33suA(R)Auto', 531.1, 181.2, -378.7],
      ['W34io-Auto', 418.1, 326.6, -352.2], ['W35io-Auto', 410.5, 324.8, -502.3],
      ['W36io-Auto', 402.5, 324.6, -638.4],
      ['W37io-Auto', -415.9, 332.1, -363.5], ['W38io-Auto', -410.5, 328.5, -496.6],
      ['W39io-Auto', -401.9, 328.5, -635.5],
      ['W40io-Auto', -417.0, 51.9, -368.8], ['W41io-Auto', -407.9, 52.2, -502.9],
      ['W42io-Auto', -401.5, 56.2, -641.2],
      ['W43io-Auto', 410.2, 39.8, -368.1], ['W44io-Auto', 402.5, 41.9, -503.1],
      ['W45io-Auto', 401.9, 53.7, -645.1],
    ],
  },
  {
    id: 'iac_bomber_dk6', name: 'SF Bomber-DK6', code: 'DK-6', role: '轰炸机', class: 'light', tier: 2, model: 'candidates/iac_bomber_dk6.glb', length: 35, exhaust: 0xff6a3a, sensorRange: 90000,
    speed: [900, 420000, 800, 1.1], hull: [2800, 900, 60, 320],
    cockpits: [[-0.1, 4.5, -9.0]],
    nozzles: [
      ['N1', -11.2, 3.2, 5.2],
      ['N2', 11.2, 3.0, 5.1],
      ['N3S--', -0.5, 5.7, 2.6],
      ['N4S--', -1.8, 5.4, 2.7],
      ['N5S--', -2.8, 4.7, 2.6],
      ['N6S--', -2.8, -2.8, 2.7],
      ['N7S--', -1.8, -3.5, 2.8],
      ['N8S--', 4.4, 2.7, 2.6],
      ['N9S--', -3.8, -1.9, 2.7],
      ['N10S--', -4.3, -0.9, 2.6],
      ['N11S--', 4.7, 1.6, 2.7],
      ['N12S--', 0.6, 5.7, 2.7],
      ['N13S--', 1.8, 5.3, 2.6],
      ['N14S--', 2.8, 4.7, 2.5],
      ['N15S--', 3.8, 3.8, 2.7],
      ['N16S--', -3.7, 3.8, 2.6],
      ['N17S--', -4.4, 2.8, 2.7],
      ['N18S--', -4.7, 1.7, 2.7],
      ['N19S--', -4.6, 0.3, 2.6],
      ['N20S--', 4.7, 0.4, 2.6],
      ['N21S--', 4.4, -0.8, 2.7],
      ['N22S--', 3.8, -1.9, 2.7],
      ['N23S--', 2.9, -2.7, 2.6],
      ['N24S--', 1.8, -3.3, 2.6],
      ['N25S--', 0.6, -3.7, 2.7],
      ['N26S--', -0.7, -3.6, 2.6],
      ['N1SF', -1.8, 2.3, -8.6],
      ['N2SF', 1.8, 2.3, -8.6],
    ],
    weapons: [
      ['W1ca-', -0.4, 3.1, -11.4],
      ['W2ca-', 0.3, 3.2, -11.4],
      ['W3su-', -3.4, 2.1, -0.1],
      ['W4su-', 3.8, 1.6, 0.2],
    ],
  },
  {
    id: 'iac_gladius', name: 'SotP Gladius-class heavy corvette', code: 'GL-4', role: '重型护卫舰', class: 'heavy', tier: 4, model: 'candidates/iac_gladius.glb', length: 90, exhaust: 0xff6a3a, sensorRange: 180000,
    speed: [620, 380000, 500, 0.7], hull: [14000, 5000, 120, 900],
    cockpits: [[0.0, 9.2, 15.1]],
    nozzles: [
      ['N1', 0.1, -3.4, 42.8],
      ['N2', 5.0, 0.2, 34.4],
      ['N3', -4.9, 0.4, 34.4],
      ['N4SF', 8.1, 0.2, 16.2],
      ['N5SF', -8.1, 0.4, 16.8],
    ],
    weapons: [
      ['W1ca+++', 0.0, 2.2, -28.3],
      ['W2su+++', 0.0, -2.4, -28.1],
      ['W3ca+Auto', 5.9, 3.7, 19.4],
      ['W4ca+Auto', 5.7, 3.6, 23.6],
      ['W5ca+Auto', -5.6, 3.7, 19.7],
      ['W6ca+Auto', -5.8, 3.6, 23.6],
      ['W7ca+Auto', 0.0, -9.7, 22.5],
      ['W8ca+Auto', 0.2, -9.5, 27.4],
    ],
  },
  {
    id: 'wrs_templar', name: 'Templar Frigate', code: 'TM-5', role: '护卫舰', class: 'large', tier: 5, model: 'candidates/wrs_templar.glb', length: 1200, exhaust: 0x8fd8ff, sensorRange: 400000,
    speed: [380, 300000, 280, 0.5], hull: [160000, 65000, 180, 3000],
    cockpits: [[12.748, 105.0, 164.248]],
    nozzles: [
      ['N1', -139.5, 0.752, 588.0],
      ['N2', 138.0, 0.752, 588.0],
    ],
    weapons: [
      ['W1ca+Auto', 9.752, 74.252, -425.252],
      ['W2ca+Auto', -5.248, -135.0, 179.248],
      ['W3ca+++Auto', 0.0, 75.748, -165.752],
      ['W4ca+++Auto', 6.752, -69.752, -113.248],
      ['W5ca+++Auto', 4.5, 81.0, 407.248],
    ],
  },
  {
    id: 'wrs_tigris', name: 'Yellowjackets Cruiser Tigris', code: 'TG-6', role: '巡洋舰', class: 'capital', tier: 6, model: 'candidates/wrs_tigris.glb', length: 1600, exhaust: 0x8fd8ff, sensorRange: 450000,
    speed: [330, 280000, 230, 0.38], hull: [240000, 95000, 220, 4500],
    cockpits: [[-1.715, 192.0, 254.855]],
    nozzles: [
      ['N1', -340.0, -24.0, 707.43],
      ['N2', -177.715, -13.145, 650.285],
      ['N3', 176.57, -18.285, 650.285],
      ['N4', 338.285, -25.145, 707.43],
      ['N5++', -2.855, -14.285, 654.285],
      ['N6', -100.57, -17.715, 650.285],
      ['N7', 96.0, -21.145, 650.285],
      ['N1SF', -171.43, -25.145, -640.0],
      ['N2SF', 171.43, -25.145, -640.0],
    ],
    weapons: [
      ['W1ioAuto', -1.145, 168.0, 66.855],
      ['W2io--Auto', 58.855, 96.0, -429.145],
      ['W3io--Auto', -59.43, 96.57, -430.285],
      ['W4ioAuto', -0.57, -242.855, 12.0],
      ['W5ca++', 13.145, 110.285, -401.715],
      ['W6ca++', -14.285, 110.285, -401.715],
      ['W7ioAuto', -1.145, -196.0, -508.57],
      ['W8caAuto', -264.57, -40.57, -312.0],
      ['W9caAuto', 265.145, -40.0, -313.145],
      ['W10K---Auto', -176.57, 62.285, 661.715],
      ['W11K---Auto', 174.855, 62.855, 669.715],
      ['W12le---Auto', 274.855, 72.57, 103.43],
      ['W13le---Auto', -272.0, 73.145, 106.285],
    ],
  },
  {
    id: 'ort_phalanx', name: 'Phalanx Corvette', code: 'PH-3', role: '护卫舰', class: 'light', tier: 3, model: 'candidates/ort_phalanx.glb', length: 80, exhaust: 0x9fb8ff, sensorRange: 160000,
    speed: [680, 380000, 600, 0.9], hull: [12000, 4500, 110, 800],
    cockpits: [[-0.3, 3.5, -21.1]],
    nozzles: [
      ['N1', -6.5, -1.6, 39.2],
      ['N2', 6.1, -1.6, 39.2],
      ['N1SF', -9.4, -0.8, -0.9],
      ['N2SF', 9.4, -0.5, -1.0],
    ],
    weapons: [
      ['W1ca-', -3.3, 0.0, -30.4],
      ['W2ca-', 3.3, 0.0, -30.4],
      ['W3su-', -7.4, -5.1, 11.3],
      ['W4su-', 6.8, -5.3, 11.2],
      ['W5ca+', 9.8, 4.5, 1.0],
      ['W6ca+', 6.8, 1.9, 8.0],
      ['W7ca+', -6.7, 4.4, 1.0],
      ['W8ca+', -13.6, -0.8, 16.5],
    ],
  },
  {
    id: 'ort_rhodes', name: 'Rhodes Battlecruiser', code: 'RH-7', role: '战列巡洋舰', class: 'flagship', tier: 7, model: 'candidates/ort_rhodes.glb', length: 3000, exhaust: 0x9fb8ff, sensorRange: 600000,
    speed: [260, 260000, 170, 0.28], hull: [520000, 190000, 300, 8000],
    cockpits: [[0.0, 160.285, -888.0]],
    nozzles: [
      ['N1', 2.57, -54.0, 1477.715],
      ['N2S', -72.0, -32.57, 1477.715],
      ['N3S', 72.855, -33.43, 1477.715],
      ['N4S', 0.855, -170.57, 1270.285],
      ['N5S--', -20.57, 71.145, 1275.43],
      ['N6S--', 21.43, 72.855, 1275.43],
      ['N7S--', -16.285, 48.0, 1275.43],
      ['N8S--', 21.43, 47.145, 1275.43],
    ],
    weapons: [
      ['W1KAuto', -9.43, -6.0, -1222.285],
      ['W2ca+++Auto', -54.0, 204.0, -510.0],
      ['W3K--Auto', -4.285, -208.285, -647.145],
      ['W4ca+Auto', -294.855, 92.57, 327.43],
      ['W5ca+Auto', -258.855, 80.57, 582.855],
      ['W6ca+Auto', 274.285, 83.145, 607.715],
      ['W7ca+Auto', 280.285, 92.57, 329.145],
      ['W8su++', 78.855, -6.855, -823.715],
      ['W9su++', -81.43, -0.855, -812.57],
    ],
  },
  {
    id: 'rta_shark', name: 'SSF-21 Shark', code: 'SH-3', role: '截击机', class: 'light', tier: 3, model: 'candidates/rta_shark.glb', length: 28, exhaust: 0xff2a1a, sensorRange: 100000,
    speed: [1050, 480000, 1000, 1.35], hull: [1800, 700, 40, 260],
    cockpits: [[0.0, 2.6, -0.8]],
    nozzles: [
      ['N1', -3.0, 1.0, 12.2],
      ['N2', 3.0, 1.0, 12.2],
      ['N3', 0.0, 0.6, 9.6],
    ],
    weapons: [
      ['W1le+', 9.0, -1.2, 0.1],
      ['W2le+', 4.8, 1.8, 0.9],
      ['W3su-', -5.1, -1.3, -11.2],
      ['W4su-', 5.0, -1.3, -11.2],
      ['W5le+', -4.7, 1.6, 0.5],
      ['W6le+', -8.8, -1.5, 0.1],
      ['W7le-Auto', 0.0, 0.1, -2.9],
      ['W8P--', 1.9, 1.9, -3.2],
    ],
  },
];

export const SHIPS: ShipSpec[] = RAW.map((raw) => {
  const coordScale = raw.length / (ANNOTATION_LENGTH[raw.id] ?? raw.length);
  const scaled = (x: number, y: number, z: number): [number, number, number] => [
    x * coordScale,
    y * coordScale,
    z * coordScale,
  ];
  const shipFireRate = SHIP_FIRE_RATE[raw.id] ?? 1;
  // 大舰武器不再贴脸：射程随舰长平方根增长（25 m 基准，8 km 约 17.9×）
  const rangeScale = Math.max(1, Math.sqrt(raw.length / 25));
  const shieldRegenFraction = SHIELD_REGEN_FRACTION[raw.class] ?? 0.012;
  return {
    id: raw.id,
    name: raw.name,
    code: raw.code,
    role: raw.role,
    class: raw.class,
    tier: raw.tier,
    model: raw.model,
    length: raw.length,
    exhaust: raw.exhaust,
    plumeScale: raw.plumeScale ?? PLUME_SCALE[raw.id] ?? 1,
    sensorRange: raw.sensorRange,
    chargeTime: Math.max(3, Math.min(10, 3 + (7 * Math.log10(raw.length / 25)) / Math.log10(50))),
    warpCombo: raw.length >= 3000,
    cockpits: raw.cockpits.map(([x, y, z]) => scaled(x, y, z)),
    maxSpeed: raw.speed[0],
    boostSpeed: raw.speed[1],
    accel: raw.speed[2],
    turnRate: raw.speed[3],
    hull: raw.hull[0],
    shield: raw.hull[1],
    shieldRegen: Math.max(1, Math.round(raw.hull[1] * shieldRegenFraction)),
    parts: {
      engine: Math.round(raw.hull[3]),
      weapon: Math.round(raw.hull[3] * 0.9),
      cockpit: Math.round(raw.hull[3] * 0.7),
    },
    nozzles: raw.nozzles.map(([tag, x, y, z]) => parseNozzle(tag, scaled(x, y, z), raw.length)),
    weapons: raw.weapons.map(([tag, x, y, z]) =>
      parseWeapon(tag, scaled(x, y, z), raw.hull[0] + raw.hull[1], shipFireRate, rangeScale),
    ),
  };
});

/** Shift 极速倍率：船型决定上下限，船体完好度决定当前值（2–5×） */
export function shiftSpeedMultiplier(spec: ShipSpec, hullRatio: number): number {
  const health = Math.max(0, Math.min(1, hullRatio));
  const ranges: Record<string, [number, number]> = {
    light: [3.0, 5.0],
    heavy: [2.6, 4.2],
    large: [2.3, 3.5],
    capital: [2.0, 2.8],
    flagship: [2.0, 2.6],
    dreadnought: [1.8, 2.4],
  };
  const [low, high] = ranges[spec.class] ?? [2.4, 4.0];
  return low + (high - low) * health;
}

export function getShip(id: string): ShipSpec {
  return SHIPS.find((ship) => ship.id === id) ?? SHIPS[0];
}
