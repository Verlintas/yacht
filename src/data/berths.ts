export type BerthKind = 'city' | 'port' | 'ship';

export interface Berth {
  id: string;
  name: string;
  latin: string;
  kind: BerthKind;
  kindLabel: string;
  latitude: number;
  longitude: number;
  coastal: boolean;
  /**
   * 海浪模型在部分岸线坐标无网格点（返回 null），
   * 这里指定最近的有效近海参考点，仅用于海况查询。
   */
  seaPoint?: { latitude: number; longitude: number };
}

/**
 * 泊位坐标。站点前端需要坐标才能取天气，因此坐标必然出现在构建产物中。
 * 这里刻意不记录真实地名，只保留数值。
 */
export const berths: Berth[] = [
  {
    id: 'kazloviiz',
    name: '卡斯罗威斯城',
    latin: 'Kazloviiz',
    kind: 'city',
    kindLabel: '城',
    latitude: 39.99064,
    longitude: 116.28868,
    coastal: false,
  },
  {
    id: 'west-kazloviiz',
    name: '西卡斯罗威斯',
    latin: 'West-Kazloviiz',
    kind: 'city',
    kindLabel: '城',
    latitude: 39.91124,
    longitude: 116.18766,
    coastal: false,
  },
  {
    id: 'polaris',
    name: '北极星空港',
    latin: 'Polaris Spaceport',
    kind: 'port',
    kindLabel: '港',
    latitude: 38.94755,
    longitude: 118.55078,
    coastal: true,
  },
  {
    id: 'orcano',
    name: 'Orcano级防御战列舰',
    latin: 'Orcano Capital Voyager',
    kind: 'ship',
    kindLabel: '舰',
    latitude: 31.22222,
    longitude: 121.45806,
    coastal: true,
    seaPoint: { latitude: 31.0, longitude: 121.8 },
  },
];

export const defaultBerthId = 'kazloviiz';

export function getBerth(id: string): Berth {
  return berths.find((berth) => berth.id === id) ?? berths[0];
}
