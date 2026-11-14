/**
 * 三维硬点设置器的初始数据。
 *
 * 这里刻意复制一份 ships.ts 的 RAW 条目，避免标注工具和游戏主循环互相依赖。
 * 坐标约定与 ships.ts 完全一致：+X 右 / +Y 上 / -Z 机首，原点在包围盒中心，单位米。
 */

export interface EditorShip {
  id: string;
  name: string;
  code: string;
  role: string;
  model: string;
  length: number;
  cockpits: Array<[number, number, number]>;
  nozzles: Array<[string, number, number, number]>;
  weapons: Array<[string, number, number, number]>;
}

export const EDITOR_SHIPS: EditorShip[] = [
  {
    id: 'thunderbolt',
    name: 'A-30 雷霆',
    code: 'A-30',
    role: '多用途战斗机',
    model: 'thunderbolt.glb',
    length: 25,
    cockpits: [[0, 2.0, -3.5]],
    nozzles: [
      ['N1', 2.6, 0.0, 8.2],
      ['N2', -2.6, 0.0, 8.2],
      ['N3S', 7.4, 0.0, 4.2],
      ['N4S', -7.4, 0.0, 4.2],
      ['N1SF', 2.7, 1.7, -4.2],
      ['N2SF', -2.8, 1.7, -4.2],
    ],
    weapons: [
      ['W1su-', 0.0, -2.5, -8.5],
      ['W2su-', -9.5, 0.0, 2.5],
      ['W3su-', 9.5, 0.0, 2.5],
      ['W4su--', -11.5, 0.5, 0.0],
      ['W5su--', 11.5, 0.5, 0.0],
    ],
  },
  {
    id: 'f008',
    name: 'SF-F008 短剑',
    code: 'F-008',
    role: '轻型截击机',
    model: 'f008.glb',
    length: 22,
    cockpits: [[0, 2.2, -5.5]],
    nozzles: [
      ['N1', 5.2, 0.0, 9.2],
      ['N2', -5.2, 0.0, 9.2],
      ['N1SF', 3.7, 0.1, -7.5],
      ['N2SF', -3.8, 0.1, -7.5],
    ],
    weapons: [
      ['W1su+', 2.2, 0.0, -4.5],
      ['W2su+', -2.2, 0.0, -4.5],
      ['W1ca+', -0.9, -2.2, -8.7],
      ['W2ca+', 1.0, -2.1, -8.8],
    ],
  },
  {
    id: 'bomber',
    name: 'SF 轰炸机 CR',
    code: 'CR-3',
    role: '重型轰炸机',
    model: 'bomber.glb',
    length: 120,
    cockpits: [[0, 10.1, -26.0]],
    nozzles: [
      ['N1', 7.0, 0.0, 53.9],
      ['N2', -7.0, 0.0, 53.9],
      ['N3S', 36.0, 0.0, 32.9],
      ['N4S', -36.0, 0.0, 32.9],
    ],
    weapons: [
      ['W1P-', -36.0, 0.0, -10.1],
      ['W2P-', 36.0, 0.0, -10.1],
    ],
  },
  {
    id: 'freighter',
    name: '货船 MB',
    code: 'MB-4',
    role: '货船',
    model: 'freighter.glb',
    length: 280,
    cockpits: [[0, 26.0, -58.0]],
    nozzles: [
      ['N1', 13.8, 4.3, 132.0],
      ['N2', -13.8, 4.3, 132.0],
      ['N3S', 40.1, -5.8, 125.9],
      ['N4S', -40.1, -5.8, 125.9],
    ],
    weapons: [['W1ca-', 0.0, -8.0, -119.7]],
  },
  {
    id: 'commander',
    name: 'Commander 指挥舰',
    code: 'CG-7',
    role: '指挥舰',
    model: 'commander.glb',
    length: 620,
    cockpits: [[0, 31.2, -93.6]],
    nozzles: [
      ['N1', 0.0, 0.0, 297.7],
      ['N2S', 36.6, 0.0, 278.7],
      ['N3S', -37.3, 0.0, 278.7],
    ],
    weapons: [
      ['W1KA', -74.0, 0.0, -217.0],
      ['W2KA', 74.0, 0.0, -217.0],
      ['W1P-Auto', -145.0, 25.0, -60.0],
      ['W2P-Auto', 145.0, 25.0, -60.0],
      ['W3P-Auto', -145.0, 25.0, 60.0],
      ['W4P-Auto', 145.0, 25.0, 60.0],
      ['W1ca-Auto', -110.0, 55.0, 0.0],
      ['W2ca-Auto', 110.0, 55.0, 0.0],
    ],
  },
  {
    id: 'battleship',
    name: 'SF 战列舰',
    code: 'BB-6',
    role: '战列舰',
    model: 'battleship.glb',
    length: 1250,
    cockpits: [[0, 50.6, -125.8]],
    nozzles: [
      ['N1', 62.9, 26.0, 561.9],
      ['N2', -61.5, 26.0, 561.9],
      ['N3S', 276.2, 0.0, 374.6],
      ['N4S', -274.8, 0.0, 374.6],
    ],
    weapons: [
      ['W1P+++Auto', -311.7, 0.0, -125.8],
      ['W2P+++Auto', 311.7, 0.0, -125.8],
      ['W3ca+++Auto', -374.6, 0.0, 61.5],
      ['W4ca+++Auto', 374.6, 0.0, 61.5],
      ['W5su+++', -260.0, 20.0, 200.0],
      ['W6su+++', 260.0, 20.0, 200.0],
      ['W7KA', 0.0, -80.0, -400.0],
    ],
  },
];
