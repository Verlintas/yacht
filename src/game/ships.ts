/**
 * 舰船数据表 —— 由标注器输出直接转换。
 *
 * 命名约定（来自标注）：
 *   武器前缀：su 鱼雷 / le 激光 / ca 机枪 / K 轨道炮 / P 等离子
 *   强度后缀：- 削弱 / -- 更削弱 / + 增强 / ++ 更强 / +++ 超强 / A 定制级
 *   附带 Auto = 自动炮：只攻击「已经攻击过我方」的目标，不主动开火
 *   喷口后缀：S 副推进器 / F 反推进器 / A 定制级
 *
 * 坐标：+X 右 / +Y 上 / -Z 机首，单位米。
 */

export type WeaponType = 'laser' | 'cannon' | 'torpedo' | 'railgun' | 'plasma';

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
};

const MOD: Record<string, number> = {
  '': 1, '-': 0.7, '--': 0.5, '+': 1.3, '++': 1.6, '+++': 2.0, A: 2.5,
};

/** 从标注标签解析武器：W1su- / W3K A / W2ca+++Auto */
function parseWeapon(
  tag: string,
  pos: [number, number, number],
): WeaponMount {
  const code = tag.replace(/^W\d+/, '');
  const turret = /Auto/i.test(code);
  const body = code.replace(/Auto/i, '');

  const typeMatch = body.match(/^(su|le|ca|K|P)/);
  const prefix = typeMatch ? typeMatch[1] : 'le';
  const rest = body.slice(prefix.length);

  const modMatch = rest.match(/(---+|\+{1,3}|A|)$/);
  const mod = modMatch ? modMatch[1] : '';

  const type: WeaponType =
    prefix === 'su' ? 'torpedo' : prefix === 'le' ? 'laser' : prefix === 'ca' ? 'cannon' : prefix === 'K' ? 'railgun' : 'plasma';

  const base = BASE[type];
  const scale = MOD[mod] ?? 1;

  return {
    id: tag,
    type,
    pos,
    damage: Math.round(base.damage * scale),
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
  speed: [number, number, number, number];
  hull: [number, number, number, number];
  cockpits: Array<[number, number, number]>;
  nozzles: Array<[string, number, number, number]>;
  weapons: Array<[string, number, number, number]>;
}

const RAW: Raw[] = [
  {
    id: 'thunderbolt', name: 'A-30 雷霆', code: 'A-30', role: '多用途战斗机', class: 'light', tier: 2, model: 'thunderbolt.glb', length: 25,
    speed: [820, 2600, 700, 1.0], hull: [1200, 400, 22, 300],
    cockpits: [[0, 2.0, -3.5]],
    nozzles: [
      ['N1', 2.6, 0.0, 8.2], ['N2', -2.6, 0.0, 8.2],
      ['N3S', 7.4, 0.0, 4.2], ['N4S', -7.4, 0.0, 4.2],
      ['N1SF', 2.7, 1.7, -4.2], ['N2SF', -2.8, 1.7, -4.2],
    ],
    weapons: [
      ['W1su-', 0.0, -2.5, -8.5],
      ['W2su-', -9.5, 0.0, 2.5], ['W3su-', 9.5, 0.0, 2.5],
      ['W4su--', -11.5, 0.5, 0.0], ['W5su--', 11.5, 0.5, 0.0],
    ],
  },
  {
    id: 'f008', name: 'SF-F008 短剑', code: 'F-008', role: '轻型截击机', class: 'light', tier: 2, model: 'f008.glb', length: 22,
    speed: [980, 3000, 900, 1.25], hull: [780, 620, 30, 220],
    cockpits: [[0, 2.2, -5.5]],
    nozzles: [
      ['N1', 5.2, 0.0, 9.2], ['N2', -5.2, 0.0, 9.2],
      ['N1SF', 3.7, 0.1, -7.5], ['N2SF', -3.8, 0.1, -7.5],
    ],
    weapons: [
      ['W1su+', 2.2, 0.0, -4.5], ['W2su+', -2.2, 0.0, -4.5],
      ['W1ca+', -0.9, -2.2, -8.7], ['W2ca+', 1.0, -2.1, -8.8],
    ],
  },
  {
    id: 'bomber', name: 'SF 轰炸机 CR', code: 'CR-3', role: '重型轰炸机', class: 'heavy', tier: 4, model: 'bomber.glb', length: 120,
    speed: [620, 1900, 460, 0.72], hull: [9000, 3000, 40, 700],
    cockpits: [[0, 10.1, -26.0]],
    nozzles: [
      ['N1', 7.0, 0.0, 53.9], ['N2', -7.0, 0.0, 53.9],
      ['N3S', 36.0, 0.0, 32.9], ['N4S', -36.0, 0.0, 32.9],
    ],
    weapons: [
      ['W1P-', -36.0, 0.0, -10.1], ['W2P-', 36.0, 0.0, -10.1],
    ],
  },
  {
    id: 'freighter', name: '货船 MB', code: 'MB-4', role: '货船', class: 'large', tier: 5, model: 'freighter.glb', length: 280,
    speed: [440, 1400, 300, 0.45], hull: [26000, 9000, 18, 1200],
    cockpits: [[0, 26.0, -58.0]],
    nozzles: [
      ['N1', 13.8, 4.3, 132.0], ['N2', -13.8, 4.3, 132.0],
      ['N3S', 40.1, -5.8, 125.9], ['N4S', -40.1, -5.8, 125.9],
    ],
    weapons: [
      ['W1ca-', 0.0, -8.0, -119.7],
    ],
  },
  {
    id: 'commander', name: 'Commander 指挥舰', code: 'CG-7', role: '指挥舰', class: 'flagship', tier: 7, model: 'commander.glb', length: 620,
    speed: [380, 1200, 260, 0.55], hull: [82000, 32000, 55, 2600],
    cockpits: [[0, 31.2, -93.6]],
    nozzles: [
      ['N1', 0.0, 0.0, 297.7],
      ['N2S', 36.6, 0.0, 278.7], ['N3S', -37.3, 0.0, 278.7],
    ],
    weapons: [
      ['W1KA', -74.0, 0.0, -217.0], ['W2KA', 74.0, 0.0, -217.0],
      ['W1P-Auto', -145.0, 25.0, -60.0], ['W2P-Auto', 145.0, 25.0, -60.0],
      ['W3P-Auto', -145.0, 25.0, 60.0], ['W4P-Auto', 145.0, 25.0, 60.0],
      ['W1ca-Auto', -110.0, 55.0, 0.0], ['W2ca-Auto', 110.0, 55.0, 0.0],
    ],
  },
  {
    id: 'battleship', name: 'SF 战列舰', code: 'BB-6', role: '战列舰', class: 'capital', tier: 6, model: 'battleship.glb', length: 1250,
    speed: [280, 900, 180, 0.34], hull: [320000, 120000, 80, 5000],
    cockpits: [[0, 50.6, -125.8]],
    nozzles: [
      ['N1', 62.9, 26.0, 561.9], ['N2', -61.5, 26.0, 561.9],
      ['N3S', 276.2, 0.0, 374.6], ['N4S', -274.8, 0.0, 374.6],
    ],
    weapons: [
      ['W1P+++Auto', -311.7, 0.0, -125.8], ['W2P+++Auto', 311.7, 0.0, -125.8],
      ['W3ca+++Auto', -374.6, 0.0, 61.5], ['W4ca+++Auto', 374.6, 0.0, 61.5],
      ['W5su+++', -260.0, 20.0, 200.0], ['W6su+++', 260.0, 20.0, 200.0],
      ['W7KA', 0.0, -80.0, -400.0],
    ],
  },
];

export const SHIPS: ShipSpec[] = RAW.map((raw) => ({
  id: raw.id,
  name: raw.name,
  code: raw.code,
  role: raw.role,
  class: raw.class,
  tier: raw.tier,
  model: raw.model,
  length: raw.length,
  cockpits: raw.cockpits,
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
  nozzles: raw.nozzles.map(([tag, x, y, z]) => parseNozzle(tag, [x, y, z], raw.length)),
  weapons: raw.weapons.map(([tag, x, y, z]) => parseWeapon(tag, [x, y, z])),
}));

export function getShip(id: string): ShipSpec {
  return SHIPS.find((ship) => ship.id === id) ?? SHIPS[0];
}
