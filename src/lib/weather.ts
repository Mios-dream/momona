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

const readCache = (): WeatherData | null => {
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
};

const writeCache = (data: WeatherData): void => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ savedAt: Date.now(), data }),
    );
  } catch {
    // Private browsing and storage quotas should not disable the weather card.
  }
};

const fetchJson = async <T>(url: string): Promise<T> => {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`天气服务返回 ${response.status}`);
    return (await response.json()) as T;
  } finally {
    window.clearTimeout(timer);
  }
};

const browserLocation = (): Promise<WeatherLocation | null> =>
  new Promise((resolve) => {
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

const resolveLocation = async (): Promise<WeatherLocation | null> => {
  if (locationRequest) return locationRequest;
  locationRequest = (async () => {
    // Static pages have no server-side location fallback. A denied or unavailable
    // browser permission intentionally results in the weather failure state.
    return browserLocation();
  })().finally(() => {
    locationRequest = null;
  });
  return locationRequest;
};

const weatherText = (code: number): string => {
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
};

const weatherIcon = (code: number): { asset: string; iconName: IconName } => {
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
};

const loadWeather = async (): Promise<WeatherData | null> => {
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
};

export const getWeatherInfo = async (
  force = false,
): Promise<WeatherData | null> => {
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
};

export const airQualityLabel = (aqi?: number): string => {
  if (typeof aqi !== "number") return "空气未知";
  if (aqi <= 50) return "空气优";
  if (aqi <= 100) return "空气良";
  if (aqi <= 150) return "轻度污染";
  return "需要留意空气质量";
};
