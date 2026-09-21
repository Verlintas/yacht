import { berths, defaultBerthId, type Berth } from '../data/berths';

const BERTH_KEY = 'yacht:berth';
const CACHE_PREFIX = 'yacht:readings:v2:';
const CACHE_TTL = 20 * 60 * 1000;

export interface Readings {
  fetchedAt: number;
  weather: {
    temperature: number;
    apparent: number;
    humidity: number;
    dewpoint: number;
    code: number;
    isDay: number;
    wind: number;
    windDir: number;
    gusts: number;
    precipitation: number;
    cloudCover: number;
    pressure: number;
    visibility: number;
    uvIndex: number;
  };
  hourly: {
    time: string[];
    temperature: number[];
    precipProb: number[];
    precipitation: number[];
    wind: number[];
    uv: number[];
  };
  daily: {
    time: string[];
    code: number[];
    tMax: number[];
    tMin: number[];
    sunrise: string[];
    sunset: string[];
    daylight: number[];
    uvMax: number[];
    precipSum: number[];
    precipProb: number[];
    windMax: number[];
    gustMax: number[];
    windDir: number[];
  };
  air: {
    aqi: number;
    pm25: number;
    pm10: number;
    no2: number | null;
    o3: number | null;
    so2: number | null;
    co: number | null;
    dust: number | null;
  } | null;
  sea: {
    waveHeight: number;
    waveDir: number | null;
    wavePeriod: number;
    swellHeight: number | null;
    swellDir: number | null;
    swellPeriod: number | null;
    sst: number;
    currentVel: number | null;
    currentDir: number | null;
  } | null;
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

export function iconSvg(code: number, className = 'weather-icon'): string {
  const key = WMO[code]?.icon ?? 'partly';
  return `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[key]}</svg>`;
}

export function describeCode(code: number): string {
  return WMO[code]?.text ?? '未知';
}

const DIRECTIONS = ['北', '北东北', '东北', '东东北', '东', '东东南', '东南', '南东南', '南', '南西南', '西南', '西西南', '西', '西西北', '西北', '北西北'];

export function windDirLabel(deg: number | null | undefined): string {
  if (deg == null || Number.isNaN(deg)) return '—';
  const index = Math.round(((deg % 360) + 360) % 360 / 22.5) % 16;
  return DIRECTIONS[index];
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

export function uvLabel(uv: number): { text: string; level: 'good' | 'warn' | 'bad' } {
  if (uv < 3) return { text: '低', level: 'good' };
  if (uv < 6) return { text: '中等', level: 'warn' };
  if (uv < 8) return { text: '高', level: 'warn' };
  if (uv < 11) return { text: '很高', level: 'bad' };
  return { text: '极高', level: 'bad' };
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

/** Open-Meteo 的 daylight_duration 单位为秒 */
function daylightLabel(seconds: number): string {
  const total = Math.round(seconds / 60);
  return `${Math.floor(total / 60)} 小时 ${total % 60} 分`;
}

function readCache(id: string): Readings | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + id);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Readings;
    if (!parsed || typeof parsed.fetchedAt !== 'number' || !parsed.hourly) return null;
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

const FORECAST_CURRENT =
  'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m,uv_index,visibility,dewpoint_2m';
const FORECAST_HOURLY =
  'temperature_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m,uv_index';
const FORECAST_DAILY =
  'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,daylight_duration,uv_index_max,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant';

export async function fetchReadings(berth: Berth): Promise<Readings> {
  const { latitude, longitude } = berth;
  const common = `latitude=${latitude}&longitude=${longitude}&timezone=Asia%2FShanghai`;
  const seaPoint = berth.seaPoint ?? berth;

  const [forecast, air, sea] = await Promise.all([
    getJson<any>(
      `https://api.open-meteo.com/v1/forecast?${common}&current=${FORECAST_CURRENT}&hourly=${FORECAST_HOURLY}&daily=${FORECAST_DAILY}&forecast_days=4`,
    ),
    getJson<any>(
      `https://air-quality-api.open-meteo.com/v1/air-quality?${common}&current=pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone,us_aqi,dust`,
    ).catch(() => null),
    berth.coastal
      ? getJson<any>(
          `https://marine-api.open-meteo.com/v1/marine?latitude=${seaPoint.latitude}&longitude=${seaPoint.longitude}&timezone=Asia%2FShanghai&current=wave_height,wave_direction,wave_period,swell_wave_height,swell_wave_direction,swell_wave_period,sea_surface_temperature,ocean_current_velocity,ocean_current_direction`,
        ).catch(() => null)
      : Promise.resolve(null),
  ]);

  const c = forecast.current;
  const h = forecast.hourly;
  const d = forecast.daily;

  return {
    fetchedAt: Date.now(),
    weather: {
      temperature: c.temperature_2m,
      apparent: c.apparent_temperature,
      humidity: c.relative_humidity_2m,
      dewpoint: c.dewpoint_2m,
      code: c.weather_code,
      isDay: c.is_day,
      wind: c.wind_speed_10m,
      windDir: c.wind_direction_10m,
      gusts: c.wind_gusts_10m,
      precipitation: c.precipitation,
      cloudCover: c.cloud_cover,
      pressure: c.pressure_msl,
      visibility: c.visibility,
      uvIndex: c.uv_index,
    },
    hourly: {
      time: h.time,
      temperature: h.temperature_2m,
      precipProb: h.precipitation_probability,
      precipitation: h.precipitation,
      wind: h.wind_speed_10m,
      uv: h.uv_index,
    },
    daily: {
      time: d.time,
      code: d.weather_code,
      tMax: d.temperature_2m_max,
      tMin: d.temperature_2m_min,
      sunrise: d.sunrise,
      sunset: d.sunset,
      daylight: d.daylight_duration,
      uvMax: d.uv_index_max,
      precipSum: d.precipitation_sum,
      precipProb: d.precipitation_probability_max,
      windMax: d.wind_speed_10m_max,
      gustMax: d.wind_gusts_10m_max,
      windDir: d.wind_direction_10m_dominant,
    },
    air:
      air && air.current
        ? {
            aqi: air.current.us_aqi,
            pm25: air.current.pm2_5,
            pm10: air.current.pm10,
            no2: air.current.nitrogen_dioxide ?? null,
            o3: air.current.ozone ?? null,
            so2: air.current.sulphur_dioxide ?? null,
            co: air.current.carbon_monoxide ?? null,
            dust: air.current.dust ?? null,
          }
        : null,
    sea:
      sea && sea.current && sea.current.wave_height != null
        ? {
            waveHeight: sea.current.wave_height,
            waveDir: sea.current.wave_direction ?? null,
            wavePeriod: sea.current.wave_period,
            swellHeight: sea.current.swell_wave_height ?? null,
            swellDir: sea.current.swell_wave_direction ?? null,
            swellPeriod: sea.current.swell_wave_period ?? null,
            sst: sea.current.sea_surface_temperature,
            currentVel: sea.current.ocean_current_velocity ?? null,
            currentDir: sea.current.ocean_current_direction ?? null,
          }
        : null,
  };
}

/* ── 渲染辅助 ───────────────────────────── */

function setText(root: ParentNode, slot: string, value: string): void {
  const el = root.querySelector<HTMLElement>(`[data-slot="${slot}"]`);
  if (el) el.textContent = value;
}

function setHtml(root: ParentNode, slot: string, value: string): void {
  const el = root.querySelector<HTMLElement>(`[data-slot="${slot}"]`);
  if (el) el.innerHTML = value;
}

function setBadge(root: ParentNode, slot: string, text: string, level: string): void {
  const el = root.querySelector<HTMLElement>(`[data-slot="${slot}"]`);
  if (!el) return;
  el.textContent = text;
  el.className = `badge badge-${level}`;
}

/**
 * 风向箭头。
 * 气象上的风向指风的「来向」（135° = 东南风 = 风从东南吹来），
 * 所以箭头需要旋转 deg + 180 才能指向风的去向。
 */
function windArrow(deg: number | null | undefined): string {
  if (deg == null || Number.isNaN(deg)) return '';
  const to = (deg + 180) % 360;
  return `<svg class="wind-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="transform: rotate(${to}deg)" aria-hidden="true"><title>风从 ${windDirLabel(deg)} 吹来，箭头指向去向</title><path d="M12 20V5"/><path d="M7 10l5-5 5 5"/></svg>`;
}

/** 从当前小时开始的逐小时切片 */
function sliceFromNow(hourly: Readings['hourly'], count: number): number[] {
  const now = new Date();
  const nowKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T${String(now.getHours()).padStart(2, '0')}:00`;
  let start = hourly.time.findIndex((t) => t === nowKey);
  if (start < 0) start = 0;
  return hourly.temperature.slice(start, start + count);
}

/** 温度曲线（SVG 折线 + 面积） */
function sparkline(values: number[], width = 320, height = 78): string {
  if (values.length < 2) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const padY = 10;
  const stepX = width / (values.length - 1);
  const points = values.map((value, index) => {
    const x = index * stepX;
    const y = padY + (1 - (value - min) / span) * (height - padY * 2);
    return [x, y] as const;
  });
  const line = points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const area = `${line} L${width} ${height} L0 ${height} Z`;
  return `<svg class="spark" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
    <path class="spark-area" d="${area}"/>
    <path class="spark-line" d="${line}"/>
  </svg>`;
}

function forecastRows(readings: Readings, root: ParentNode): void {
  const container = root.querySelector<HTMLElement>('[data-slot="forecast"]');
  if (!container) return;
  const { daily } = readings;
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const rows = daily.time.map((iso, index) => {
    const date = new Date(`${iso}T00:00:00`);
    const label = index === 0 ? '今天' : index === 1 ? '明天' : weekdays[date.getDay()];
    const code = daily.code[index];
    const dir = windDirLabel(daily.windDir[index]);
    return `<div class="fc-row">
      <span class="fc-day">${label}</span>
      <span class="fc-icon">${iconSvg(code, 'fc-icon-svg')}</span>
      <span class="fc-desc">${describeCode(code)}</span>
      <span class="fc-temp"><b>${Math.round(daily.tMax[index])}°</b> / ${Math.round(daily.tMin[index])}°</span>
      <span class="fc-rain">${Math.round(daily.precipProb[index] ?? 0)}%</span>
      <span class="fc-wind">${dir} ${Math.round(daily.windMax[index])} km/h</span>
    </div>`;
  });
  container.innerHTML = rows.join('');
}

function render(root: HTMLElement, berth: Berth, readings: Readings, stale: boolean): void {
  const { weather, daily, air, sea } = readings;

  root.classList.toggle('stale', stale);
  setText(root, 'berth-name', berth.name);
  setText(root, 'berth-latin', berth.latin);
  setText(root, 'berth-kind', berth.kindLabel);

  setHtml(root, 'weather-icon', iconSvg(weather.code));
  setText(root, 'weather-temp', `${weather.temperature.toFixed(1)}°`);
  setText(root, 'weather-desc', describeCode(weather.code));
  setText(root, 'weather-range', `${daily.tMax[0].toFixed(1)}° / ${daily.tMin[0].toFixed(1)}°`);
  setText(root, 'weather-apparent', `${weather.apparent.toFixed(1)} °C`);
  setText(root, 'weather-humidity', `${weather.humidity} %`);
  setText(root, 'weather-dewpoint', `${weather.dewpoint.toFixed(1)} °C`);
  setText(root, 'weather-wind', windLabel(weather.wind));
  setText(root, 'weather-winddir', windDirLabel(weather.windDir));
  setHtml(root, 'weather-windarrow', windArrow(weather.windDir));
  setText(root, 'weather-gusts', `${weather.gusts.toFixed(1)} km/h`);
  setText(root, 'weather-precip', `${weather.precipitation.toFixed(1)} mm`);
  setText(root, 'weather-prob', `${daily.precipProb[0] ?? 0} %`);
  setText(root, 'weather-cloud', `${weather.cloudCover} %`);
  setText(root, 'weather-pressure', `${Math.round(weather.pressure)} hPa`);
  setText(root, 'weather-visibility', `${(weather.visibility / 1000).toFixed(1)} km`);
  setText(root, 'weather-uv', `${weather.uvIndex.toFixed(1)}`);
  const uv = uvLabel(weather.uvIndex);
  setBadge(root, 'weather-uv-badge', uv.text, uv.level);

  setText(root, 'sun-sunrise', hhmm(daily.sunrise[0]));
  setText(root, 'sun-sunset', hhmm(daily.sunset[0]));
  setText(root, 'sun-daylight', daylightLabel(daily.daylight[0]));
  setText(root, 'sun-uvmax', `${(daily.uvMax[0] ?? 0).toFixed(1)}`);

  const chart = root.querySelector<HTMLElement>('[data-slot="hourly-chart"]');
  if (chart) {
    const values = sliceFromNow(readings.hourly, 24);
    chart.innerHTML = sparkline(values);
    setText(root, 'hourly-min', values.length ? `${Math.min(...values).toFixed(1)}°` : '—');
    setText(root, 'hourly-max', values.length ? `${Math.max(...values).toFixed(1)}°` : '—');
  }

  forecastRows(readings, root);

  const airCard = root.querySelector<HTMLElement>('[data-card="air"]');
  if (air) {
    setText(root, 'air-aqi', `${Math.round(air.aqi)}`);
    setText(root, 'air-pm25', `${air.pm25.toFixed(1)} μg/m³`);
    setText(root, 'air-pm10', `${air.pm10.toFixed(1)} μg/m³`);
    setText(root, 'air-no2', air.no2 == null ? '—' : `${air.no2.toFixed(1)} μg/m³`);
    setText(root, 'air-o3', air.o3 == null ? '—' : `${air.o3.toFixed(1)} μg/m³`);
    setText(root, 'air-so2', air.so2 == null ? '—' : `${air.so2.toFixed(1)} μg/m³`);
    setText(root, 'air-co', air.co == null ? '—' : `${air.co.toFixed(0)} μg/m³`);
    setBadge(root, 'air-badge', airGrade(air.pm25).text, airGrade(air.pm25).level);
  } else {
    setText(root, 'air-aqi', '--');
    setText(root, 'air-pm25', '--');
    setText(root, 'air-pm10', '--');
    setText(root, 'air-no2', '--');
    setText(root, 'air-o3', '--');
    setText(root, 'air-so2', '--');
    setText(root, 'air-co', '--');
  }
  if (airCard) airCard.hidden = !air;

  const seaCard = root.querySelector<HTMLElement>('[data-card="sea"]');
  if (sea) {
    setText(root, 'sea-wave', `${sea.waveHeight.toFixed(2)} m`);
    setText(root, 'sea-wavedir', windDirLabel(sea.waveDir));
    setText(root, 'sea-period', `${sea.wavePeriod.toFixed(1)} s`);
    setText(root, 'sea-swell', sea.swellHeight == null ? '—' : `${sea.swellHeight.toFixed(2)} m`);
    setText(root, 'sea-swelldir', windDirLabel(sea.swellDir));
    setText(root, 'sea-sst', `${sea.sst.toFixed(1)} °C`);
    setText(
      root,
      'sea-current',
      sea.currentVel == null
        ? '—'
        : `${sea.currentVel.toFixed(2)} km/h · ${windDirLabel(sea.currentDir)}`,
    );
  } else {
    setText(root, 'sea-wave', '--');
    setText(root, 'sea-wavedir', '--');
    setText(root, 'sea-period', '--');
    setText(root, 'sea-swell', '--');
    setText(root, 'sea-swelldir', '--');
    setText(root, 'sea-sst', '--');
    setText(root, 'sea-current', '--');
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
