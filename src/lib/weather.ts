import type { IconName } from "../data/types";

export interface WeatherData {
  city: string;
  temperature: number;
  weather: string;
  weatherCode: number;
  icon: string;
  iconName: IconName;
  humidity: number;
  windSpeed: number;
  feelsLike: number;
  highTemperature?: number;
  lowTemperature?: number;
  aqi?: number;
}

interface WeatherLocation {
  latitude: number;
  longitude: number;
  city: string;
}

interface OpenMeteoWeatherResponse {
  current?: {
    temperature_2m?: number;
    weather_code?: number;
    relative_humidity_2m?: number;
    apparent_temperature?: number;
    wind_speed_10m?: number;
  };
  daily?: {
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
  };
}

interface OpenMeteoAirResponse {
  current?: { us_aqi?: number };
}

const CACHE_KEY = "momona-weather-v1";
const CACHE_TTL = 30 * 60 * 1000;
const REQUEST_TIMEOUT = 10_000;
const weatherIconBase = "/assets";

let weatherRequest: Promise<WeatherData | null> | null = null;
let locationRequest: Promise<WeatherLocation | null> | null = null;

/**
 * 从浏览器本地缓存读取未过期的天气数据。
 *
 * @returns 未过期的天气缓存；没有可用缓存时返回 null。
 */
function readCache(): WeatherData | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { savedAt?: number; data?: WeatherData };
    if (!parsed.data || !Number.isFinite(parsed.savedAt)) return null;
    if (Date.now() - Number(parsed.savedAt) >= CACHE_TTL) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

/**
 * 将天气数据写入浏览器本地缓存，失败时保持静默。
 *
 * @param data - 需要缓存的天气数据。
 * @returns 无返回值。
 */
function writeCache(data: WeatherData): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ savedAt: Date.now(), data }),
    );
  } catch {
    // 隐私浏览或存储配额异常不应阻止天气卡片继续尝试读取。
  }
}

/**
 * 发送带超时控制的天气服务请求。
 *
 * @param url - 天气服务请求地址。
 * @returns 解析后的天气服务响应。
 * @throws HTTP 请求失败时抛出错误。
 */
async function fetchJson<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`天气服务返回 ${response.status}`);
    return (await response.json()) as T;
  } finally {
    window.clearTimeout(timer);
  }
}

/**
 * 请求浏览器定位权限并返回当前位置。
 *
 * @returns 浏览器定位结果；浏览器不支持或用户拒绝时返回 null。
 */
function browserLocation(): Promise<WeatherLocation | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          city: "当前位置",
        }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 8_000, maximumAge: 10 * 60 * 1000 },
    );
  });
}

/**
 * 复用同一轮定位请求，避免多个天气卡片重复触发权限询问。
 *
 * @returns 当前浏览器位置；定位不可用时返回 null。
 */
async function resolveLocation(): Promise<WeatherLocation | null> {
  if (locationRequest) return locationRequest;
  locationRequest = (async () => {
    // 静态页面没有服务端定位回退；用户拒绝或浏览器无法定位时，保持天气不可用状态。
    return browserLocation();
  })().finally(() => {
    locationRequest = null;
  });
  return locationRequest;
}

/**
 * 将 Open-Meteo 天气代码转换为中文天气描述。
 *
 * @param code - Open-Meteo 天气代码。
 * @returns 中文天气描述。
 */
function weatherText(code: number): string {
  if (code === 0) return "晴";
  if (code === 1 || code === 2) return "多云";
  if (code === 3) return "阴";
  if (code === 45 || code === 48) return "雾";
  if (code >= 51 && code <= 57) return "毛毛雨";
  if (code >= 61 && code <= 67) return "雨";
  if (code >= 71 && code <= 77) return "雪";
  if (code >= 80 && code <= 82) return "阵雨";
  if (code >= 85 && code <= 86) return "阵雪";
  if (code >= 95) return "雷雨";
  return "天气未知";
}

/**
 * 将 Open-Meteo 天气代码转换为资源图片和语义图标。
 *
 * @param code - Open-Meteo 天气代码。
 * @returns 天气图片地址和图标标识。
 */
function weatherIcon(code: number): { asset: string; iconName: IconName } {
  if (code === 0)
    return { asset: `${weatherIconBase}/weather-sunny.webp`, iconName: "sun" };
  if (code === 1 || code === 2)
    return {
      asset: `${weatherIconBase}/weather-partly-cloudy.webp`,
      iconName: "cloud",
    };
  if (code === 3 || code === 45 || code === 48)
    return {
      asset: `${weatherIconBase}/weather-partly-cloudy.webp`,
      iconName: "cloudFog",
    };
  if (code >= 71 && code <= 77)
    return {
      asset: `${weatherIconBase}/weather-partly-cloudy.webp`,
      iconName: "cloudSnow",
    };
  if (code >= 95)
    return {
      asset: `${weatherIconBase}/weather-partly-cloudy.webp`,
      iconName: "cloudLightning",
    };
  return {
    asset: `${weatherIconBase}/weather-partly-cloudy.webp`,
    iconName: "cloudRain",
  };
}

/**
 * 读取当前位置的天气和空气质量，并组合为页面模型。
 *
 * @returns 页面使用的天气数据；定位或接口不可用时返回 null。
 */
async function loadWeather(): Promise<WeatherData | null> {
  const location = await resolveLocation();
  if (!location) return null;
  const query = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    current:
      "temperature_2m,weather_code,relative_humidity_2m,apparent_temperature,wind_speed_10m",
    daily: "temperature_2m_max,temperature_2m_min",
    forecast_days: "1",
    timezone: "auto",
  });
  const aqiQuery = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    current: "us_aqi",
  });
  const [weather, air] = await Promise.all([
    fetchJson<OpenMeteoWeatherResponse>(
      `https://api.open-meteo.com/v1/forecast?${query.toString()}`,
    ),
    fetchJson<OpenMeteoAirResponse>(
      `https://air-quality-api.open-meteo.com/v1/air-quality?${aqiQuery.toString()}`,
    ).catch(() => null),
  ]);
  const current = weather.current;
  if (!current || typeof current.weather_code !== "number") return null;
  const icon = weatherIcon(current.weather_code);
  const highTemperature = Number(weather.daily?.temperature_2m_max?.[0]);
  const lowTemperature = Number(weather.daily?.temperature_2m_min?.[0]);
  return {
    city: location.city,
    temperature: Math.round(Number(current.temperature_2m ?? 0)),
    weather: weatherText(current.weather_code),
    weatherCode: current.weather_code,
    icon: icon.asset,
    iconName: icon.iconName,
    humidity: Math.round(Number(current.relative_humidity_2m ?? 0)),
    windSpeed: Math.round(Number(current.wind_speed_10m ?? 0)),
    feelsLike: Math.round(Number(current.apparent_temperature ?? 0)),
    ...(Number.isFinite(highTemperature)
      ? { highTemperature: Math.round(highTemperature) }
      : {}),
    ...(Number.isFinite(lowTemperature)
      ? { lowTemperature: Math.round(lowTemperature) }
      : {}),
    ...(typeof air?.current?.us_aqi === "number"
      ? { aqi: Math.round(air.current.us_aqi) }
      : {}),
  };
}

/**
 * 获取天气数据，默认优先使用短期缓存并合并并发请求。
 *
 * @param force - 是否忽略缓存并强制重新请求。
 * @returns 页面使用的天气数据；不可用时返回 null。
 */
export async function getWeatherInfo(
  force = false,
): Promise<WeatherData | null> {
  if (!force) {
    const cached = readCache();
    if (cached) return cached;
  }
  if (weatherRequest) return weatherRequest;
  weatherRequest = loadWeather()
    .then((data) => {
      if (data) writeCache(data);
      return data;
    })
    .catch(() => null)
    .finally(() => {
      weatherRequest = null;
    });
  return weatherRequest;
}

/**
 * 将 AQI 数值转换为简短的中文健康提示。
 *
 * @param aqi - 空气质量指数。
 * @returns 面向用户的空气质量提示。
 */
export function airQualityLabel(aqi?: number): string {
  if (typeof aqi !== "number") return "空气未知";
  if (aqi <= 50) return "空气优";
  if (aqi <= 100) return "空气良";
  if (aqi <= 150) return "轻度污染";
  return "需要留意空气质量";
}
