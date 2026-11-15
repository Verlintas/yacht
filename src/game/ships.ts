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
}

export type NozzleRole = 'main' | 'secondary' | 'retro';

/** 武器选择面板的顺序/名称 */
export const WEAPON_ORDER: WeaponType[] = ['railgun', 'torpedo', 'plasma', 'ion', 'cannon', 'laser'];
export const WEAPON_LABELS: Record<WeaponType, string> = {
  railgun: '轨道炮',
  torpedo: '鱼雷',
  plasma: '等离子',
  ion: '离子炮',
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
  '': 1, '-': 0.7, '--': 0.5, '+': 1.3, '++': 1.6, '+++': 2.0,
};

/** A 级主炮：4 发击毁同型号舰船（按结构+护盾计算） */
const A_SHOTS_TO_KILL = 4;

/** 从标注标签解析武器：W1su- / W3K A / W2ca+++Auto */
function parseWeapon(
  tag: string,
  pos: [number, number, number],
  durability: number,
): WeaponMount {
  const code = tag.replace(/^W\d+/, '');
  const turret = /Auto/i.test(code);
  const body = code.replace(/Auto/i, '');

  const typeMatch = body.match(/^(su|le|ca|K|P|io)/);
  const prefix = typeMatch ? typeMatch[1] : 'le';
  const rest = body.slice(prefix.length);

  const modMatch = rest.match(/(---+|\+{1,3}|A|)$/);
  const mod = modMatch ? modMatch[1] : '';

  const type: WeaponType =
    prefix === 'su' ? 'torpedo' : prefix === 'le' ? 'laser' : prefix === 'ca' ? 'cannon' : prefix === 'K' ? 'railgun' : prefix === 'io' ? 'ion' : 'plasma';

  const base = BASE[type];
  const damage = mod === 'A' ? Math.round(durability / A_SHOTS_TO_KILL) : Math.round(base.damage * (MOD[mod] ?? 1));

  return {
    id: tag,
    type,
    pos,
    damage,
    rate: base.rate,
    speed: base.speed,
    range: base.range,
    spread: base.spread,
    color: base.color,
    turret,
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
};

const RAW: Raw[] = [
  {
    id: 'thunderbolt', name: 'A-30 雷霆', code: 'A-30', role: '多用途战斗机', class: 'light', tier: 2, model: 'thunderbolt.glb', length: 25, exhaust: 0x4fd8ff, sensorRange: 15000,
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
    id: 'f008', name: 'SF-F008 短剑', code: 'F-008', role: '轻型截击机', class: 'light', tier: 2, model: 'f008.glb', length: 22, exhaust: 0xff8a3c, sensorRange: 18000,
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
    id: 'bomber', name: 'SF 轰炸机 CR', code: 'CR-3', role: '重型轰炸机', class: 'heavy', tier: 4, model: 'bomber.glb', length: 180, exhaust: 0x4fd8ff, sensorRange: 32000,
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
    id: 'freighter', name: '货船 MB', code: 'MB-4', role: '货船', class: 'large', tier: 5, model: 'freighter.glb', length: 520, exhaust: 0x4fd8ff, sensorRange: 50000,
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
    id: 'commander', name: 'Commander 指挥舰', code: 'CG-7', role: '指挥舰', class: 'flagship', tier: 7, model: 'commander.glb', length: 2400, exhaust: 0xbfe0ff, sensorRange: 120000,
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
    id: 'battleship', name: 'SF 战列舰', code: 'BB-6', role: '战列舰', class: 'capital', tier: 6, model: 'battleship.glb', length: 2000, exhaust: 0xff4a3a, sensorRange: 100000,
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
];

export const SHIPS: ShipSpec[] = RAW.map((raw) => {
  const coordScale = raw.length / (ANNOTATION_LENGTH[raw.id] ?? raw.length);
  const scaled = (x: number, y: number, z: number): [number, number, number] => [
    x * coordScale,
    y * coordScale,
    z * coordScale,
  ];
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
    sensorRange: raw.sensorRange,
    chargeTime: Math.max(3, Math.min(10, 3 + (7 * Math.log10(raw.length / 25)) / Math.log10(50))),
    warpCombo: raw.length > 3000,
    cockpits: raw.cockpits.map(([x, y, z]) => scaled(x, y, z)),
    maxSpeed: raw.speed[0],
    boostSpeed: raw.speed[1],
    accel: raw.speed[2],
    turnRate: raw.speed[3],
    hull: raw.hull[0],
    shield: raw.hull[1],
    shieldRegen: raw.hull[2],
    parts: {
      engine: Math.round(raw.hull[3]),
      weapon: Math.round(raw.hull[3] * 0.9),
      cockpit: Math.round(raw.hull[3] * 0.7),
    },
    nozzles: raw.nozzles.map(([tag, x, y, z]) => parseNozzle(tag, scaled(x, y, z), raw.length)),
    weapons: raw.weapons.map(([tag, x, y, z]) =>
      parseWeapon(tag, scaled(x, y, z), raw.hull[0] + raw.hull[1]),
    ),
  };
});

export function getShip(id: string): ShipSpec {
  return SHIPS.find((ship) => ship.id === id) ?? SHIPS[0];
}
