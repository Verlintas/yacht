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
    cockpits: [[0.0, 0.3, -9.9]],
    nozzles: [
      ['N1', 3.3, -1.0, 7.6],
      ['N2', -3.3, -0.8, 8.2],
      ['N3S', 2.6, 1.6, 6.1],
      ['N4S', -2.6, 1.7, 6.2],
      ['N1SF', 2.7, 1.7, -4.2],
      ['N2SF', -2.8, 1.7, -4.2],
    ],
    weapons: [
      ['W1ca-', -0.3, -3.5, -7.6],
      ['W2su-', -9.0, -0.4, 0.9],
      ['W3su-', 9.1, -0.5, 0.9],
      ['W4su--', -10.7, 1.4, 2.5],
      ['W5su--', 10.8, 1.3, 2.8],
    ],
  },
  {
    id: 'f008',
    name: 'SF-F008 短剑',
    code: 'F-008',
    role: '轻型截击机',
    model: 'f008.glb',
    length: 22,
    cockpits: [[0.0, 0.7, -7.2]],
    nozzles: [
      ['N1', 5.4, 0.6, 6.4],
      ['N2', -5.2, 0.5, 5.9],
      ['N1SF', 3.6, 0.2, -5.2],
      ['N2SF', -3.9, 0.3, -5.1],
    ],
    weapons: [
      ['W1ca+', -0.9, -2.2, -8.7],
      ['W1su+', 4.2, -1.5, -3.3],
      ['W2ca+', 1.0, -2.1, -8.8],
      ['W2su+', -4.3, -1.5, -3.3],
    ],
  },
  {
    id: 'bomber',
    name: 'SF 轰炸机 CR',
    code: 'CR-3',
    role: '重型轰炸机',
    model: 'bomber.glb',
    length: 120,
    cockpits: [[0.0, 10.1, -26.0]],
    nozzles: [
      ['N1', 10.1, -4.7, 40.0],
      ['N2', -10.0, -4.8, 40.0],
      ['N3S', 28.9, -1.7, 21.2],
      ['N4S', -29.1, -2.2, 20.9],
    ],
    weapons: [
      ['W1P-', -26.0, -9.0, -31.1],
      ['W2P-', 25.7, -9.1, -30.9],
    ],
  },
  {
    id: 'freighter',
    name: '货船 MB',
    code: 'MB-4',
    role: '货船',
    model: 'freighter.glb',
    length: 280,
    cockpits: [[-24.0, 2.1, -125.1]],
    nozzles: [
      ['N1', 75.1, -26.2, 105.6],
      ['N2', -72.2, -26.6, 105.3],
      ['N3S', 75.1, -26.1, -41.8],
      ['N4S', -72.8, -24.0, -45.5],
    ],
    weapons: [['W1ca-', -41.4, 16.3, -98.9]],
  },
  {
    id: 'commander',
    name: 'Commander 指挥舰',
    code: 'CG-7',
    role: '指挥舰',
    model: 'commander.glb',
    length: 620,
    cockpits: [[0.7, 44.1, -161.0]],
    nozzles: [
      ['N1', -0.5, 18.5, 230.4],
      ['N2S', 5.6, 5.5, 230.4],
      ['N3S', -6.9, 6.4, 230.4],
    ],
    weapons: [
      ['W1ca-Auto', -84.9, 28.5, 13.0],
      ['W1KA', -27.4, 16.6, -310.0],
      ['W1P-Auto', -111.1, 22.7, -137.4],
      ['W2ca-Auto', 86.9, 31.3, 12.8],
      ['W2KA', 25.2, 17.5, -310.0],
      ['W2P-Auto', 110.8, 23.0, -136.5],
      ['W3P-Auto', -108.7, 2.0, 104.7],
      ['W4P-Auto', 105.8, 3.7, 104.1],
    ],
  },
  {
    id: 'battleship',
    name: 'SF 战列舰',
    code: 'BB-6',
    role: '战列舰',
    model: 'battleship.glb',
    length: 1250,
    cockpits: [[-1.0, 131.3, -170.2]],
    nozzles: [
      ['N1', 192.4, 81.0, 597.3],
      ['N2', -188.2, 81.2, 597.3],
      ['N5', 194.4, -79.8, 597.3],
      ['N6', -192.0, -78.1, 597.3],
      ['N3S', 32.6, 121.1, 603.8],
      ['N4S', -29.4, 122.3, 603.8],
    ],
    weapons: [
      ['W1P+++Auto', -170.1, -48.9, -210.3],
      ['W2P+++Auto', 155.0, -62.0, -203.1],
      ['W3ca+++Auto', -50.9, 143.5, 78.8],
      ['W4ca+++Auto', 50.1, 148.3, 74.7],
      ['W5su+++', -302.3, 2.8, 294.8],
      ['W6su+++', 305.4, 0.1, 290.5],
      ['W7KA', -3.6, -136.6, -571.7],
      ['W8ca-Auto', -52.9, 133.1, 139.8],
      ['W9ca-Auto', -45.5, 117.8, 199.9],
      ['W10ca-Auto', -57.8, 129.2, 246.5],
      ['W11ca-Auto', 58.8, 125.3, 236.4],
      ['W12ca-Auto', 58.4, 126.7, 191.1],
      ['W13ca-Auto', 58.5, 126.5, 131.6],
      ['W14io+Auto', 105.8, -76.1, 72.8],
      ['W15io+Auto', -111.9, -75.5, 69.7],
      ['W16io+Auto', -69.8, 31.1, -215.4],
      ['W17io+Auto', 67.6, 33.8, -220.6],
    ],
  },
];
