import { berths, defaultBerthId, type Berth } from '../data/berths';

const BERTH_KEY = 'yacht:berth';
const CACHE_PREFIX = 'yacht:readings:';
const CACHE_TTL = 20 * 60 * 1000;

export interface Readings {
  fetchedAt: number;
  weather: {
    temperature: number;
    apparent: number;
    humidity: number;
    code: number;
    wind: number;
    precipitation: number;
  };
  sun: {
    sunrise: string;
    sunset: string;
    tMax: number;
    tMin: number;
    precipProb: number;
  };
  air: { aqi: number; pm25: number; pm10: number } | null;
  sea: { waveHeight: number; wavePeriod: number; sst: number } | null;
}

const WMO: Record<number, { text: string; icon: string }> = {
  0: { text: '晴', icon: 'clear' },
  1: { text: '大部晴朗', icon: 'mostly-clear' },
  2: { text: '局部多云', icon: 'partly' },
  3: { text: '阴', icon: 'overcast' },
  45: { text: '有雾', icon: 'fog' },
  48: { text: '冻雾', icon: 'fog' },
  51: { text: '毛毛雨', icon: 'drizzle' },
  53: { text: '毛毛雨', icon: 'drizzle' },
  55: { text: '浓毛毛雨', icon: 'drizzle' },
  56: { text: '冻毛毛雨', icon: 'drizzle' },
  57: { text: '冻毛毛雨', icon: 'drizzle' },
  61: { text: '小雨', icon: 'rain' },
  63: { text: '中雨', icon: 'rain' },
  65: { text: '大雨', icon: 'rain' },
  66: { text: '冻雨', icon: 'rain' },
  67: { text: '冻雨', icon: 'rain' },
  71: { text: '小雪', icon: 'snow' },
  73: { text: '中雪', icon: 'snow' },
  75: { text: '大雪', icon: 'snow' },
  77: { text: '米雪', icon: 'snow' },
  80: { text: '阵雨', icon: 'showers' },
  81: { text: '阵雨', icon: 'showers' },
  82: { text: '强阵雨', icon: 'showers' },
  85: { text: '阵雪', icon: 'snow' },
  86: { text: '强阵雪', icon: 'snow' },
  95: { text: '雷阵雨', icon: 'thunder' },
  96: { text: '雷阵雨伴冰雹', icon: 'thunder' },
  99: { text: '雷阵雨伴冰雹', icon: 'thunder' },
};

const ICONS: Record<string, string> = {
  clear:
    '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.6v2.6M12 18.8v2.6M2.6 12h2.6M18.8 12h2.6M5.4 5.4l1.9 1.9M16.7 16.7l1.9 1.9M18.6 5.4l-1.9 1.9M7.3 16.7l-1.9 1.9"/>',
  'mostly-clear':
    '<circle cx="10.6" cy="10.4" r="3.5"/><path d="M10.6 2.8v2.1M3 10.4h2.1M5.2 5l1.5 1.5M16 5l-1.5 1.5"/><path d="M8.6 18.6h8.2a3.3 3.3 0 0 0 .3-6.6 4.6 4.6 0 0 0-8.8 1 3 3 0 0 0 .3 5.6Z"/>',
  partly:
    '<path d="M8.4 19h8.4a3.4 3.4 0 0 0 .3-6.8 4.7 4.7 0 0 0-9-1 3.1 3.1 0 0 0 .3 7.8Z"/>',
  overcast:
    '<path d="M6.6 18.4h9.6a3.3 3.3 0 0 0 .3-6.6 4.6 4.6 0 0 0-8.8 1 3 3 0 0 0-1.1 5.6Z"/><path d="M4.4 14.2a3 3 0 0 1 .9-4.1 3.6 3.6 0 0 1 4.9-.4"/>',
  fog: '<path d="M5 9.6h12M3.6 13h14.8M6.4 16.4h11.2"/>',
  drizzle: '<path d="M8 15.4h8a3.2 3.2 0 0 0 .3-6.4 4.5 4.5 0 0 0-8.7 1 2.9 2.9 0 0 0 .4 5.4Z"/><path d="M9 18.4v1.4M13 18.4v1.4"/>',
  rain: '<path d="M8 14.6h8a3.2 3.2 0 0 0 .3-6.4 4.5 4.5 0 0 0-8.7 1 2.9 2.9 0 0 0 .4 5.4Z"/><path d="M9 17.4l-.9 2.4M12.4 17.4l-.9 2.4M15.8 17.4l-.9 2.4"/>',
  showers:
    '<path d="M8 14.2h8a3.2 3.2 0 0 0 .3-6.4 4.5 4.5 0 0 0-8.7 1 2.9 2.9 0 0 0 .4 5.4Z"/><path d="M10.2 17.2 9 20.6M14.6 17.2l-1.2 3.4"/>',
  snow: '<path d="M8 14.6h8a3.2 3.2 0 0 0 .3-6.4 4.5 4.5 0 0 0-8.7 1 2.9 2.9 0 0 0 .4 5.4Z"/><path d="M9.4 17.6h.01M12.6 19.4h.01M15.4 17.6h.01"/>',
  thunder:
    '<path d="M8 14h8a3.2 3.2 0 0 0 .3-6.4 4.5 4.5 0 0 0-8.7 1 2.9 2.9 0 0 0 .4 5.4Z"/><path d="M12.8 16.2 10.4 20h3.4l-1.2 2.4"/>',
};

export function iconSvg(code: number): string {
  const key = WMO[code]?.icon ?? 'partly';
  return `<svg class="weather-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[key]}</svg>`;
}

export function describeCode(code: number): string {
  return WMO[code]?.text ?? '未知';
}

function beaufort(kmh: number): number {
  const scale = [1, 6, 12, 20, 29, 39, 50, 62, 75, 89, 103, 118];
  for (let i = 0; i < scale.length; i += 1) {
    if (kmh < scale[i]) return i;
  }
  return 12;
}

export function windLabel(kmh: number): string {
  return `${kmh.toFixed(1)} km/h · ${beaufort(kmh)} 级`;
}

export function airGrade(pm25: number): { text: string; level: 'good' | 'warn' | 'bad' } {
  if (pm25 <= 35) return { text: '优', level: 'good' };
  if (pm25 <= 75) return { text: '良', level: 'good' };
  if (pm25 <= 115) return { text: '轻度污染', level: 'warn' };
  if (pm25 <= 150) return { text: '中度污染', level: 'warn' };
  if (pm25 <= 250) return { text: '重度污染', level: 'bad' };
  return { text: '严重污染', level: 'bad' };
}

function hhmm(iso: string): string {
  const part = iso.split('T')[1];
  return part ? part.slice(0, 5) : iso;
}

function daylight(sunrise: string, sunset: string): string {
  const [rh, rm] = hhmm(sunrise).split(':').map(Number);
  const [sh, sm] = hhmm(sunset).split(':').map(Number);
  const minutes = sh * 60 + sm - (rh * 60 + rm);
  return `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分`;
}

function readCache(id: string): Readings | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + id);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Readings;
    if (!parsed || typeof parsed.fetchedAt !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(id: string, readings: Readings): void {
  try {
    localStorage.setItem(CACHE_PREFIX + id, JSON.stringify(readings));
  } catch {
    /* 存储不可用时静默跳过 */
  }
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()) as T;
}

export async function fetchReadings(berth: Berth): Promise<Readings> {
  const { latitude, longitude } = berth;
  const common = `latitude=${latitude}&longitude=${longitude}&timezone=Asia%2FShanghai`;

  const [forecast, air, sea] = await Promise.all([
    getJson<any>(
      `https://api.open-meteo.com/v1/forecast?${common}&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,precipitation&daily=sunrise,sunset,temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=1`,
    ),
    getJson<any>(
      `https://air-quality-api.open-meteo.com/v1/air-quality?${common}&current=pm2_5,pm10,us_aqi`,
    ).catch(() => null),
    berth.coastal
      ? getJson<any>(
          `https://marine-api.open-meteo.com/v1/marine?latitude=${(berth.seaPoint ?? berth).latitude}&longitude=${(berth.seaPoint ?? berth).longitude}&timezone=Asia%2FShanghai&current=wave_height,wave_period,sea_surface_temperature`,
        ).catch(() => null)
      : Promise.resolve(null),
  ]);

  return {
    fetchedAt: Date.now(),
    weather: {
      temperature: forecast.current.temperature_2m,
      apparent: forecast.current.apparent_temperature,
      humidity: forecast.current.relative_humidity_2m,
      code: forecast.current.weather_code,
      wind: forecast.current.wind_speed_10m,
      precipitation: forecast.current.precipitation,
    },
    sun: {
      sunrise: forecast.daily.sunrise[0],
      sunset: forecast.daily.sunset[0],
      tMax: forecast.daily.temperature_2m_max[0],
      tMin: forecast.daily.temperature_2m_min[0],
      precipProb: forecast.daily.precipitation_probability_max[0],
    },
    air: air
      ? { aqi: air.current.us_aqi, pm25: air.current.pm2_5, pm10: air.current.pm10 }
      : null,
    sea:
      sea && sea.current && sea.current.wave_height != null
        ? {
            waveHeight: sea.current.wave_height,
            wavePeriod: sea.current.wave_period,
            sst: sea.current.sea_surface_temperature,
          }
        : null,
  };
}

function setText(root: ParentNode, slot: string, value: string): void {
  const el = root.querySelector<HTMLElement>(`[data-slot="${slot}"]`);
  if (el) el.textContent = value;
}

function setHtml(root: ParentNode, slot: string, value: string): void {
  const el = root.querySelector<HTMLElement>(`[data-slot="${slot}"]`);
  if (el) el.innerHTML = value;
}

function render(root: HTMLElement, berth: Berth, readings: Readings, stale: boolean): void {
  const { weather, sun, air, sea } = readings;

  root.classList.toggle('stale', stale);
  setText(root, 'berth-name', berth.name);
  setText(root, 'berth-latin', berth.latin);
  setText(root, 'berth-kind', berth.kindLabel);

  setHtml(root, 'weather-icon', iconSvg(weather.code));
  setText(root, 'weather-temp', `${weather.temperature.toFixed(1)}°`);
  setText(root, 'weather-desc', describeCode(weather.code));
  setText(root, 'weather-range', `${sun.tMax.toFixed(1)}° / ${sun.tMin.toFixed(1)}°`);
  setText(root, 'weather-apparent', `${weather.apparent.toFixed(1)} °C`);
  setText(root, 'weather-humidity', `${weather.humidity} %`);
  setText(root, 'weather-wind', windLabel(weather.wind));
  setText(root, 'weather-precip', `${weather.precipitation.toFixed(1)} mm`);
  setText(root, 'weather-prob', `${sun.precipProb ?? 0} %`);

  setText(root, 'sun-sunrise', hhmm(sun.sunrise));
  setText(root, 'sun-sunset', hhmm(sun.sunset));
  setText(root, 'sun-daylight', daylight(sun.sunrise, sun.sunset));

  const airCard = root.querySelector<HTMLElement>('[data-card="air"]');
  if (air) {
    const grade = airGrade(air.pm25);
    setText(root, 'air-aqi', `${Math.round(air.aqi)}`);
    setText(root, 'air-pm25', `${air.pm25.toFixed(1)} μg/m³`);
    setText(root, 'air-pm10', `${air.pm10.toFixed(1)} μg/m³`);
    const badge = root.querySelector<HTMLElement>('[data-slot="air-badge"]');
    if (badge) {
      badge.textContent = grade.text;
      badge.className = `badge badge-${grade.level}`;
    }
  } else {
    setText(root, 'air-aqi', '--');
    setText(root, 'air-pm25', '--');
    setText(root, 'air-pm10', '--');
  }
  if (airCard) airCard.hidden = !air;

  const seaCard = root.querySelector<HTMLElement>('[data-card="sea"]');
  if (sea) {
    setText(root, 'sea-wave', `${sea.waveHeight.toFixed(2)} m`);
    setText(root, 'sea-period', `${sea.wavePeriod.toFixed(1)} s`);
    setText(root, 'sea-sst', `${sea.sst.toFixed(1)} °C`);
  } else {
    setText(root, 'sea-wave', '--');
    setText(root, 'sea-period', '--');
    setText(root, 'sea-sst', '--');
  }
  if (seaCard) seaCard.hidden = !sea;

  const stamp = new Date(readings.fetchedAt);
  setText(
    root,
    'updated',
    `${stale ? '缓存于' : '更新于'} ${String(stamp.getHours()).padStart(2, '0')}:${String(stamp.getMinutes()).padStart(2, '0')}`,
  );
}

function showError(root: HTMLElement, retry: () => void): void {
  const box = root.querySelector<HTMLElement>('[data-slot="error"]');
  if (!box) return;
  box.hidden = false;
  box.textContent = '数据源暂时不可用。';
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = '重试';
  button.addEventListener('click', () => {
    box.hidden = true;
    retry();
  });
  box.appendChild(button);
}

async function loadBerth(root: HTMLElement, berth: Berth): Promise<void> {
  const cached = readCache(berth.id);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    render(root, berth, cached, false);
    return;
  }
  try {
    const readings = await fetchReadings(berth);
    writeCache(berth.id, readings);
    render(root, berth, readings, false);
  } catch {
    if (cached) {
      render(root, berth, cached, true);
    } else {
      showError(root, () => void loadBerth(root, berth));
    }
  }
}

function startClock(): void {
  const clock = document.querySelector<HTMLElement>('[data-slot="clock"]');
  const date = document.querySelector<HTMLElement>('[data-slot="date"]');
  const greeting = document.querySelector<HTMLElement>('[data-slot="greeting"]');
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

  const greet = (hour: number): string => {
    if (hour >= 5 && hour < 11) return '早上好，Verlintas';
    if (hour >= 11 && hour < 14) return '中午好，Verlintas';
    if (hour >= 14 && hour < 18) return '下午好，Verlintas';
    if (hour >= 18 && hour < 23) return '晚上好，Verlintas';
    return '夜深了，Verlintas';
  };

  const tick = (): void => {
    const now = new Date();
    if (clock) {
      const h = String(now.getHours()).padStart(2, '0');
      const m = String(now.getMinutes()).padStart(2, '0');
      const s = String(now.getSeconds()).padStart(2, '0');
      clock.innerHTML = `${h}:${m}<span>:${s}</span>`;
    }
    if (date) {
      date.textContent = `${now.getFullYear()} 年 ${now.getMonth() + 1} 月 ${now.getDate()} 日 · ${weekdays[now.getDay()]}`;
    }
    if (greeting) {
      greeting.textContent = greet(now.getHours());
    }
  };

  if (clock || date || greeting) {
    tick();
    window.setInterval(tick, 1000);
  }
}

function readStoredBerthId(): string {
  try {
    const id = localStorage.getItem(BERTH_KEY);
    if (id && berths.some((berth) => berth.id === id)) return id;
  } catch {
    /* 忽略 */
  }
  return defaultBerthId;
}

function storeBerthId(id: string): void {
  try {
    localStorage.setItem(BERTH_KEY, id);
  } catch {
    /* 忽略 */
  }
}

export function initDashboard(): void {
  startClock();

  const root = document.querySelector<HTMLElement>('[data-dashboard]');
  if (!root) return;

  const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-berth-tab]'));
  let currentId = readStoredBerthId();

  const select = (id: string): void => {
    currentId = id;
    storeBerthId(id);
    const berth = berths.find((item) => item.id === id) ?? berths[0];
    tabs.forEach((tab) => {
      tab.setAttribute('aria-selected', String(tab.dataset.berthTab === id));
    });
    void loadBerth(root, berth);
  };

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const id = tab.dataset.berthTab;
      if (id) select(id);
    });
  });

  select(currentId);
}

export function initBerthGrid(): void {
  const cards = Array.from(document.querySelectorAll<HTMLElement>('[data-berth-card]'));
  cards.forEach((card) => {
    const id = card.dataset.berthCard;
    const berth = berths.find((item) => item.id === id);
    if (!berth) return;
    void loadBerth(card, berth);
  });
}
