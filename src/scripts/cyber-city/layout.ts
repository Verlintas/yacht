/**
 * Authored layout for the /yacht/cyber-city/ vertical slice.
 * Units: metres. +X = east/right, +Z = north/down-street, +Y = up.
 * Street centre is x=0; road half-width 11 m; sidewalk 4 m; building line ±15 m.
 */

export type Vec3 = [number, number, number];

export interface TowerPlacement {
  /** node name in towers.glb */
  id: string;
  /** optional authored template to instance (defaults to id) */
  template?: string;
  /** footprint centre, y is 0 (recentred in Blender) */
  pos: Vec3;
  /** radians, around +Y */
  yaw: number;
  /** which street edge the detailed front faces; used for sign anchors */
  side: 'left' | 'right' | 'end' | 'back';
}

export interface PropPlacement {
  type: string;
  pos: Vec3;
  yaw?: number;
  scale?: number;
  castShadow?: boolean;
}

export const STREET = {
  zStart: -40,
  zEnd: 300,
  roadHalfWidth: 11,
  sidewalkWidth: 4,
  curbHeight: 0.16,
  buildingLine: 15.4,
};

export const TOWERS: TowerPlacement[] = [
  // ---------- left side (face +X) ----------
  { id: 'Tower_02', pos: [-30.0, 0, 10], yaw: Math.PI / 2, side: 'left' },
  { id: 'BldgS_B_LEFT', template: 'BldgS_B', pos: [-38.5, 0, 44], yaw: Math.PI / 2, side: 'left' },
  { id: 'BldgLG_E', pos: [-46.0, 0, 95], yaw: Math.PI / 2, side: 'left' },
  { id: 'BldgM_D', pos: [-32.0, 0, 175], yaw: Math.PI / 2, side: 'left' },
  // ---------- right side (face -X) ----------
  { id: 'BldgS_B', pos: [23.4, 0, 10], yaw: -Math.PI / 2, side: 'right' },
  { id: 'XL_Bldg_C', pos: [84.0, 0, 104], yaw: -Math.PI / 2, side: 'right' },
  { id: 'MidRiseG', pos: [26.5, 0, 195], yaw: -Math.PI / 2, side: 'right' },
  // ---------- vista / skyline ----------
  { id: 'TowerF', pos: [10.0, 0, 330], yaw: Math.PI, side: 'end' },
  { id: 'TowerC', pos: [-60.0, 0, 318], yaw: Math.PI / 2, side: 'back' },
];

/** LOD1 node list (same positions; only the 7 detailed towers). */
export const TOWER_LOD1_IDS = [
  'TowerF',
  'BldgLG_E',
  'Tower_02',
  'XL_Bldg_C',
  'BldgM_D',
  'BldgS_B',
  'MidRiseG',
];

export const SHOPS: PropPlacement[] = [
  // left gap between Tower_02 and BldgLG_E: sushi counter
  { type: 'CyberShop_Sushi', pos: [-18.2, 0, 44.0], yaw: Math.PI / 2, castShadow: true },
  // right side, in the gap before XL_Bldg_C: convenience store
  { type: 'CyberShop_StreetStore', pos: [21.2, 0, 33.0], yaw: -Math.PI / 2, castShadow: true },
  // right side, after XL_Bldg_C: coffee bar
  { type: 'CyberShop_Cofe', pos: [20.4, 0, 171.0], yaw: -Math.PI / 2, castShadow: true },
];

export interface Interaction {
  id: string;
  label: string;
  sub: string;
  point: Vec3;
  radius: number;
}

export const INTERACTIONS: Interaction[] = [
  { id: 'sushi', label: 'ENTER NOODLE BAR', sub: 'AKIRA’S / 24H COUNTER', point: [-14.4, 1.7, 44.0], radius: 18 },
  { id: 'store', label: 'BROWSE STORE', sub: 'SECTOR 09 SUPPLY', point: [15.0, 1.7, 33.0], radius: 18 },
  { id: 'cafe', label: 'ORDER COFFEE', sub: 'BLACK RAIN CAFÉ', point: [15.0, 1.7, 171.0], radius: 18 },
];

export const PROPS: PropPlacement[] = [
  // ---- near-field framing ----
  { type: 'CyberProp_NewsPaperMachine', pos: [14.1, 0, -2.0], yaw: -Math.PI / 2 },
  { type: 'CyberProp_RoadBlock', pos: [-7.5, 0, 1.0], yaw: 0.12 },
  { type: 'CyberAcc_TrashCan', pos: [-12.8, 0, -5.0], yaw: 0.4 },
  { type: 'CyberAcc_TrashBag_A', pos: [-13.2, 0, -3.6], yaw: 1.1 },

  // ---- street furniture ----
  { type: 'CyberProp_Lamp', pos: [-12.4, 0, 2], yaw: 0 },
  { type: 'CyberProp_Lamp', pos: [12.4, 0, 62], yaw: Math.PI },
  { type: 'CyberProp_Lamp', pos: [12.4, 0, 190], yaw: Math.PI },
  { type: 'CyberProp_Lamp', pos: [12.4, 0, 296], yaw: Math.PI },

  // ---- vending / kiosk ----
  { type: 'CyberProp_SodaMachine', pos: [-14.0, 0, 34.0], yaw: Math.PI / 2 },
  { type: 'CyberProp_NewsPaperMachine', pos: [14.0, 0, 47.5], yaw: -Math.PI / 2 },

  // ---- trash / street clutter ----
  { type: 'CyberAcc_TrashCan', pos: [-13.8, 0, 49.6], yaw: 0.2 },
  { type: 'CyberAcc_TrashBag_A', pos: [-14.1, 0, 51.2], yaw: 0.7 },
  { type: 'CyberAcc_TrashBag_A', pos: [-13.4, 0, 52.1], yaw: 2.1, scale: 0.9 },
  { type: 'CyberProp_Trash', pos: [-14.0, 0, 57.0], yaw: 0.4 },
  { type: 'CyberAcc_Crate', pos: [-14.2, 0, 60.4], yaw: 0.15 },
  { type: 'CyberAcc_CardboardBox_A', pos: [-13.4, 0, 61.0], yaw: -0.3 },
  { type: 'CyberAcc_TrashCan', pos: [14.1, 0, 154.0], yaw: 0 },
  { type: 'CyberAcc_FireHydrant_A', pos: [9.8, 0, 26.0], yaw: 0 },

  // ---- barriers / works ----
  { type: 'CyberProp_RoadBlock', pos: [-6.0, 0, 72.0], yaw: 0.08 },
  { type: 'CyberProp_RoadBlock', pos: [6.0, 0, 72.0], yaw: -0.08 },
  { type: 'CyberAcc_AC_A', pos: [-14.2, 0, 118.0], yaw: Math.PI / 2 },
  { type: 'CyberAcc_AC_B', pos: [14.2, 0, 116.0], yaw: -Math.PI / 2 },
  { type: 'CyberAcc_Pot_A', pos: [-13.6, 0, 36.0], yaw: 0.4 },
  { type: 'CyberAcc_Vent', pos: [9.9, 0, 84.0], yaw: Math.PI },

  // ---- alley / service clutter ----
  { type: 'CyberProp_Dumpster', pos: [-22.5, 0, 61.0], yaw: Math.PI / 2 },
  { type: 'CyberAcc_FuseBox_A', pos: [-14.6, 4.8, 66.0], yaw: Math.PI / 2 },
  { type: 'CyberAcc_Vent', pos: [-14.6, 5.6, 86.0], yaw: Math.PI / 2 },
  { type: 'CyberAcc_AC_A', pos: [-14.8, 11.2, 160.0], yaw: Math.PI / 2 },
];

/** Overhead cables spanning the street. */
export const CABLES: { pos: Vec3; yaw: number; scale: number }[] = [
  { pos: [0, 7.2, 28], yaw: 0, scale: 1.5 },
  { pos: [0, 9.8, 66], yaw: 0, scale: 1.5 },
  { pos: [0, 11.4, 154], yaw: 0, scale: 1.5 },
  { pos: [0, 10.2, 258], yaw: 0, scale: 1.5 },
];

/** 20 m pipe runs along the facades. */
export const PIPES: { pos: Vec3; yaw: number; scale: number }[] = [
  { pos: [-14.5, 4.6, 22], yaw: Math.PI / 2, scale: 1.0 },
  { pos: [-14.5, 7.2, 78], yaw: Math.PI / 2, scale: 1.0 },
  { pos: [14.5, 8.8, 136], yaw: Math.PI / 2, scale: 1.0 },
  { pos: [14.5, 4.2, 220], yaw: Math.PI / 2, scale: 1.0 },
];

export interface NeonSign {
  id: string;
  /** canvas text lines */
  lines: string[];
  /** world position of the sign centre */
  pos: Vec3;
  /** yaw so the readable face looks toward the street */
  yaw: number;
  width: number;
  height: number;
  /** neon colour */
  color: string;
  /** vertical blade sign vs horizontal fascia */
  vertical?: boolean;
  /** point light intensity (0 = none) */
  light?: number;
}

export const SIGNS: NeonSign[] = [
  { id: 'near-left', lines: ['HOTEL', '宿'], pos: [-15.1, 11.0, 6.0], yaw: Math.PI / 2, width: 2.4, height: 7.0, color: '#ff4a7a', vertical: true, light: 0 },
  { id: 'near-right', lines: ['SYNTH', '義体'], pos: [14.9, 9.2, -2.0], yaw: -Math.PI / 2, width: 2.4, height: 6.5, color: '#35e8ff', vertical: true, light: 0 },
  { id: 'billboard', lines: ['KOWLOON', '九龍 / NIGHT MARKET'], pos: [14.6, 11.6, 9.0], yaw: -Math.PI / 2, width: 8.2, height: 4.6, color: '#ff3e9a' },
  { id: 'vista', lines: ['KOWLOON 9', '九龍'], pos: [8.0, 38.0, 306.5], yaw: Math.PI, width: 10.0, height: 12.0, color: '#35e8ff' },
  { id: 'shop-menu', lines: ['AKIRA’S', '拉麺 / ¥900', 'OPEN 24H'], pos: [-14.3, 6.5, 44.0], yaw: Math.PI / 2, width: 4.4, height: 2.0, color: '#ffb070' },
  { id: 'left-banner', lines: ['九龍', 'NIGHT MARKET / 09'], pos: [-18.8, 13.0, 44.0], yaw: Math.PI / 2, width: 8.5, height: 4.8, color: '#35e8ff' },
  { id: 'noodle', lines: ['NOODLE', '拉麵', '24H'], pos: [-14.6, 7.8, 50.5], yaw: Math.PI / 2, width: 2.4, height: 8.2, color: '#ff7a36', vertical: true, light: 0 },
  { id: 'sushi-small', lines: ['SUSHI', '寿司'], pos: [-14.4, 4.1, 38.0], yaw: Math.PI / 2, width: 3.4, height: 1.2, color: '#ffb15a' },
  { id: 'synth', lines: ['SYNTH', '義体'], pos: [14.5, 8.0, 33.0], yaw: -Math.PI / 2, width: 3.0, height: 8.4, color: '#34e8ff', vertical: true, light: 0 },
  { id: 'store', lines: ['SECTOR 09', 'SUPPLY'], pos: [14.4, 4.3, 33.0], yaw: -Math.PI / 2, width: 5.2, height: 1.3, color: '#8dffb0' },
  { id: 'hotel', lines: ['HOTEL', '宿'], pos: [-14.7, 15.0, 110.0], yaw: Math.PI / 2, width: 3.4, height: 10.0, color: '#ff3e9a', vertical: true, light: 0 },
  { id: 'cafe', lines: ['BLACK RAIN', '珈琲'], pos: [14.5, 4.8, 171.0], yaw: -Math.PI / 2, width: 5.6, height: 1.6, color: '#ffa04a', light: 0 },
  { id: 'market', lines: ['NIGHT MARKET', '夜市'], pos: [-14.6, 4.4, 146.0], yaw: Math.PI / 2, width: 6.0, height: 1.5, color: '#ffd166' },
  { id: 'arcade', lines: ['ARCADE', '電玩'], pos: [14.5, 6.0, 196.0], yaw: -Math.PI / 2, width: 4.2, height: 1.4, color: '#c77dff' },
  { id: 'ramen', lines: ['RAMEN', '拉麺'], pos: [14.5, 4.2, 286.0], yaw: -Math.PI / 2, width: 4.0, height: 1.2, color: '#ff6a3d' },
];

export interface HologramSpec {
  id: string;
  pos: Vec3;
  yaw: number;
  width: number;
  height: number;
  tint: string;
  text: string;
  sub: string;
}

export const HOLOGRAMS: HologramSpec[] = [
  { id: 'geisha', pos: [-11.8, 15.5, 84.0], yaw: Math.PI / 2, width: 9.0, height: 13.0, tint: '#2fe6ff', text: '義体', sub: 'SYNTHETIC BODY CLINIC / SECTOR 09' },
  { id: 'market', pos: [11.8, 18.0, 146.0], yaw: -Math.PI / 2, width: 10.0, height: 14.0, tint: '#ff3e9a', text: '夜市', sub: 'KOWLOON NIGHT MARKET / 23:00—05:00' },
];

export interface SteamVent {
  pos: Vec3;
  scale: number;
  rate: number;
}

export const STEAM: SteamVent[] = [
  { pos: [-6.4, 0.05, 24], scale: 3.2, rate: 0.8 },
  { pos: [5.6, 0.05, 72], scale: 4.6, rate: 1.05 },
  { pos: [-7.2, 0.05, 118], scale: 5.2, rate: 0.9 },
  { pos: [6.8, 0.05, 158], scale: 3.0, rate: 1.2 },
  { pos: [-4.2, 0.05, 206], scale: 4.0, rate: 0.7 },
  { pos: [-13.8, 0.05, 60], scale: 2.4, rate: 1.4 },
  { pos: [2.6, 0.05, 30], scale: 6.0, rate: 1.2 },
  { pos: [8.8, 0.05, 272], scale: 3.4, rate: 0.95 },
];

export interface Shot {
  position: Vec3;
  target: Vec3;
  fov: number;
  /** optional HUD override */
  hud?: boolean;
  lod?: 'auto' | 0 | 1;
}

export const SHOTS: Record<string, Shot> = {
  hero: { position: [0.8, 1.68, -27], target: [0.0, 7.4, 78], fov: 48 },
  store: { position: [-2.0, 1.68, 44.0], target: [-14.8, 3.8, 44.0], fov: 42 },
  street: { position: [6.0, 1.2, 20], target: [-8.0, 4.6, 80], fov: 56 },
  wide: { position: [0, 28, -56], target: [0, 28, 150], fov: 60, lod: 0 },
  ui: { position: [-2.0, 1.68, 44.0], target: [-14.8, 3.8, 44.0], fov: 42, hud: true },
  alley: { position: [2.2, 1.6, 52.0], target: [-18.0, 3.0, 62.0], fov: 52 },
};
