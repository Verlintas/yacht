/**
 * 舰船数据表 —— 所有可调参数集中在这里。
 *
 * 单位：速度 m/s，距离 m，伤害/结构值为无量纲点数。
 * 硬点坐标是「舰体局部坐标」：+X 右，+Y 上，-Z 前（机首方向）。
 * 模型缩放后，坐标原点在舰体几何中心。
 */

export type WeaponType = 'laser' | 'cannon' | 'missile';

export interface WeaponMount {
  id: string;
  type: WeaponType;
  /** 挂点位置 */
  pos: [number, number, number];
  /** 射向（局部坐标，一般朝 -Z） */
  dir?: [number, number, number];
  damage: number;
  /** 每秒发数 */
  rate: number;
  /** 弹速 */
  speed: number;
  /** 射程（米）：弹丸飞到这个距离就消失 */
  range: number;
  /** 散布（弧度） */
  spread: number;
  /** 弹丸颜色 */
  color: number;
}

export interface NozzleMount {
  pos: [number, number, number];
  /** 喷口大小倍率 */
  size: number;
}

export interface ShipSpec {
  id: string;
  name: string;
  /** 英文名/舷号，HUD 显示 */
  code: string;
  /** GLB 路径（相对 site base） */
  model: string;
  /** 模型缩放（让不同模型统一到「驾驶舱尺寸」基准） */
  scale: number;
  /** 驾驶舱在模型局部坐标中的位置 */
  cockpit: [number, number, number];

  /* 飞行 */
  maxSpeed: number;
  boostSpeed: number;
  accel: number;
  turnRate: number;

  /* 结构 */
  hull: number;
  shield: number;
  shieldRegen: number;
  /** 部件耐久：被打坏会降性能 */
  parts: { engine: number; weapon: number; cockpit: number };

  /* 硬点 */
  nozzles: NozzleMount[];
  weapons: WeaponMount[];

  /** 一句话定位，HUD 用 */
  role: string;
}

const laser = (id: string, pos: [number, number, number], damage = 18): WeaponMount => ({
  id,
  type: 'laser',
  pos,
  damage,
  rate: 3.2,
  speed: 5200,
  range: 3500,
  spread: 0.0016,
  color: 0x6fe8ff,
});

const cannon = (id: string, pos: [number, number, number], damage = 55): WeaponMount => ({
  id,
  type: 'cannon',
  pos,
  damage,
  rate: 1.1,
  speed: 3600,
  range: 3000,
  spread: 0.004,
  color: 0xffb066,
});

const missile = (id: string, pos: [number, number, number], damage = 220): WeaponMount => ({
  id,
  type: 'missile',
  pos,
  damage,
  rate: 0.35,
  speed: 1400,
  range: 6000,
  spread: 0.01,
  color: 0xff7a5c,
});

export const SHIPS: ShipSpec[] = [
  {
    id: 'thunderbolt',
    name: 'A-30 雷霆',
    code: 'A-30',
    role: '多用途战斗机',
    model: '/models/thunderbolt.glb',
    scale: 0.66,
    cockpit: [0, 2.4, -4.4],
    maxSpeed: 4200,
    boostSpeed: 22000,
    accel: 2600,
    turnRate: 1,
    hull: 1200,
    shield: 400,
    shieldRegen: 22,
    parts: { engine: 300, weapon: 240, cockpit: 180 },
    nozzles: [
      { pos: [0, 0, 7.2], size: 1.2 },
      { pos: [-3.1, -0.1, 4.4], size: 1 },
      { pos: [3.1, -0.1, 4.4], size: 1 },
    ],
    weapons: [
      laser('tb-l1', [-1.6, 0.4, -5.2]),
      laser('tb-l2', [1.6, 0.4, -5.2]),
      cannon('tb-c1', [0, -0.3, -7.6], 62),
    ],
  },
  {
    id: 'f008',
    name: 'SF-F008 短剑',
    code: 'F-008',
    role: '轻型截击机',
    model: '/models/thunderbolt.glb',
    scale: 0.55,
    cockpit: [0, 2.2, -4.8],
    maxSpeed: 5600,
    boostSpeed: 30000,
    accel: 3400,
    turnRate: 1.25,
    hull: 780,
    shield: 620,
    shieldRegen: 30,
    parts: { engine: 220, weapon: 200, cockpit: 140 },
    nozzles: [
      { pos: [-1.8, 0, 6.4], size: 0.9 },
      { pos: [1.8, 0, 6.4], size: 0.9 },
    ],
    weapons: [
      laser('f-l1', [-2.4, 0.2, -4.4]),
      laser('f-l2', [2.4, 0.2, -4.4]),
    ],
  },
  {
    id: 'commander',
    name: 'Commander G003',
    code: 'CG-3',
    role: '指挥舰',
    model: '/models/thunderbolt.glb',
    scale: 1.05,
    cockpit: [0, 3.2, -6.2],
    maxSpeed: 2600,
    boostSpeed: 14000,
    accel: 1500,
    turnRate: 0.62,
    hull: 4200,
    shield: 1800,
    shieldRegen: 40,
    parts: { engine: 900, weapon: 800, cockpit: 600 },
    nozzles: [
      { pos: [-4.2, -0.4, 6.0], size: 1.3 },
      { pos: [4.2, -0.4, 6.0], size: 1.3 },
      { pos: [-1.6, 0.6, 7.4], size: 1 },
      { pos: [1.6, 0.6, 7.4], size: 1 },
    ],
    weapons: [
      laser('cg-l1', [-3.4, 0.6, -6.0], 22),
      laser('cg-l2', [3.4, 0.6, -6.0], 22),
      cannon('cg-c1', [-1.2, -0.4, -8.2], 70),
      cannon('cg-c2', [1.2, -0.4, -8.2], 70),
    ],
  },
  {
    id: 'battleship',
    name: 'SF 战列舰 G003',
    code: 'BB-3',
    role: '战列舰',
    model: '/models/thunderbolt.glb',
    scale: 1.45,
    cockpit: [0, 3.6, -8.0],
    maxSpeed: 1800,
    boostSpeed: 9000,
    accel: 900,
    turnRate: 0.34,
    hull: 8200,
    shield: 3200,
    shieldRegen: 55,
    parts: { engine: 1800, weapon: 1600, cockpit: 1200 },
    nozzles: [
      { pos: [-6.0, -0.8, 8.0], size: 1.8 },
      { pos: [6.0, -0.8, 8.0], size: 1.8 },
      { pos: [-2.4, 0.4, 9.2], size: 1.4 },
      { pos: [2.4, 0.4, 9.2], size: 1.4 },
    ],
    weapons: [
      cannon('bb-c1', [-5.0, 0.8, -7.0], 95),
      cannon('bb-c2', [5.0, 0.8, -7.0], 95),
      cannon('bb-c3', [-2.0, -0.6, -9.0], 80),
      cannon('bb-c4', [2.0, -0.6, -9.0], 80),
      missile('bb-m1', [-3.0, 1.4, -3.0]),
      missile('bb-m2', [3.0, 1.4, -3.0]),
    ],
  },
  {
    id: 'bomber',
    name: 'SF 轰炸机 CR002',
    code: 'CR-2',
    role: '重型轰炸机',
    model: '/models/thunderbolt.glb',
    scale: 1.1,
    cockpit: [0, 2.8, -5.4],
    maxSpeed: 3000,
    boostSpeed: 15000,
    accel: 1700,
    turnRate: 0.72,
    hull: 2600,
    shield: 900,
    shieldRegen: 26,
    parts: { engine: 600, weapon: 700, cockpit: 420 },
    nozzles: [
      { pos: [-2.6, -0.2, 7.0], size: 1.4 },
      { pos: [2.6, -0.2, 7.0], size: 1.4 },
    ],
    weapons: [
      missile('cr-m1', [-4.0, 0, -2.0], 260),
      missile('cr-m2', [4.0, 0, -2.0], 260),
      cannon('cr-c1', [0, -0.8, -8.0], 85),
    ],
  },
  {
    id: 'freighter',
    name: '货船 MB016',
    code: 'MB-16',
    role: '货船',
    model: '/models/thunderbolt.glb',
    scale: 1.25,
    cockpit: [0, 3.0, -7.0],
    maxSpeed: 2100,
    boostSpeed: 11000,
    accel: 1100,
    turnRate: 0.45,
    hull: 3400,
    shield: 700,
    shieldRegen: 18,
    parts: { engine: 700, weapon: 400, cockpit: 500 },
    nozzles: [
      { pos: [-4.6, -0.6, 7.6], size: 1.5 },
      { pos: [4.6, -0.6, 7.6], size: 1.5 },
      { pos: [-1.8, 0.4, 8.4], size: 1.1 },
      { pos: [1.8, 0.4, 8.4], size: 1.1 },
    ],
    weapons: [laser('mb-l1', [0, 1.0, -3.0], 12)],
  },
];

export function getShip(id: string): ShipSpec {
  return SHIPS.find((ship) => ship.id === id) ?? SHIPS[0];
}
