// @ts-nocheck - Services are not yet converted to TypeScript
import { WeatherService } from '../services/weatherService';
import { CalendarService } from '../services/calendarService';
import { NewsService } from '../services/newsService';
import { MarketsService } from '../services/marketsService';
import { getStateKey, setStateKey } from './state';
import { buildStaticDescription, getWindDirection } from './weatherUtils';
import { getBaseUrl } from './utils';
import type {
  DashboardData,
  Logger,
  WeatherLocation,
  ForecastDay,
  HourlyForecast,
  CurrentWeather,
  WindData,
  PrecipitationData,
  CalendarEvent,
  ServiceStatus,
  Units,
  NewsData,
  MarketsData,
} from './types';


interface WeatherData {
  locations: WeatherLocation[];
  forecast: ForecastDay[];
  hourlyForecast: HourlyForecast[];
  precipitation?: PrecipitationData;
  timezone?: string;
  sun: { sunrise: string; sunset: string };
  moon: { phase: string; direction: string; illumination: number | null };
  air_quality: { aqi: number | null; category: string };
  uv_index: number;
  visibility: number;
  cloud_cover: number;
  units: Units;
}

/**
 * Build complete dashboard data from all available services
 * Services fail gracefully - only WeatherAPI is required
 *
 * @param req - Request object with headers (for baseUrl)
 * @param logger - Logger instance
 * @returns Complete dashboard data model
 */
export async function buildDashboardData(req: { headers: Record<string, string | string[] | undefined> }, logger: Logger = console): Promise<DashboardData> {
  const now = new Date();
  const formatTime = (date: Date): string => date.toISOString();

  // Initialize all services (each service defines its own cache TTL)
  const weatherService = new WeatherService();
  const calendarService = new CalendarService();
  const newsService = new NewsService();
  const marketsService = new MarketsService();

  // Fetch weather data (REQUIRED)
  let weatherData: WeatherData;
  let weatherStatus: ServiceStatus;
  try {
    const result = await weatherService.getData({}, logger);
    weatherData = result.data;
    weatherStatus = result.status;
  } catch (error) {
    const err = error as Error;
    logger.error?.('[DataBuilder] Weather service failed (REQUIRED):', err.message);
    throw new Error(`Weather API unavailable: ${err.message}`);
  }


  // Build current conditions
  // Always use WeatherAPI for condition/icon
  const mainLocation = weatherData.locations[0] || {};

  const fallbackWindDirection = (dir: number): string => getWindDirection(dir || 0);

  const current = buildCurrentFromWeather(mainLocation, fallbackWindDirection);

  // Use WeatherAPI for precipitation
  const precipitation = normalizePrecipitationData(weatherData.precipitation);

  // Fetch calendar (optional)
  let calendar_events: CalendarEvent[] = [];
  let calendarStatus: ServiceStatus;
  try {
    const baseUrl = getBaseUrl(req);
    const calendarConfig = {
      baseUrl,
      timezone: weatherData.timezone,
    };
    const result = await calendarService.getData(calendarConfig, logger);
    calendar_events = result.data || [];
    calendarStatus = result.status;
  } catch (error) {
    const err = error as Error;
    logger.info?.('[DataBuilder] Calendar service unavailable (optional):', err.message);
    calendarStatus = calendarService.getStatus();
  }

  // Fetch news (optional)
  let news_summary = '';
  let newsStatus: ServiceStatus;
  try {
    const result = await newsService.getData({}, logger);
    const newsData: NewsData | null = result.data;
    newsStatus = result.status;

    if (newsData && newsData.summary) {
      news_summary = newsData.summary;
      logger.info?.('[DataBuilder] News summary retrieved');
    }
  } catch (error) {
    const err = error as Error;
    logger.info?.('[DataBuilder] News service unavailable (optional):', err.message);
    newsStatus = newsService.getStatus();
  }

  // Fetch markets (optional)
  let markets: MarketsData | undefined = undefined;
  let marketsStatus: ServiceStatus;
  try {
    const result = await marketsService.getData({}, logger);
    markets = result.data || undefined;
    marketsStatus = result.status;
    logger.info?.('[DataBuilder] Markets data retrieved');
  } catch (error) {
    const err = error as Error;
    logger.info?.('[DataBuilder] Markets service unavailable (optional):', err.message);
    marketsStatus = marketsService.getStatus();
  }

  // Compute temperature comparison (today's high vs yesterday's high)
  const todayForecast = weatherData.locations[0]?.forecast?.[0];
  const todayHigh = todayForecast?.high;
  const tempComparison = computeTempComparison(todayHigh);

  // Build base data model
  const data: DashboardData = {
    current_temp: current.temp,
    feels_like: current.feels_like,
    weather_icon: current.weather_icon,
    weather_description: current.description,
    date: formatTime(now),
    temp_comparison: tempComparison,
    locations: weatherData.locations,
    forecast: weatherData.forecast,
    hourlyForecast: weatherData.hourlyForecast,
    wind: current.wind,
    sun: weatherData.sun,
    moon: weatherData.moon,
    humidity: current.humidity,
    pressure: current.pressure,
    air_quality: weatherData.air_quality,
    uv_index: weatherData.uv_index,
    visibility: weatherData.visibility,
    cloud_cover: weatherData.cloud_cover,
    precipitation,
    calendar_events,
    daily_summary: '',
    news_summary,
    markets,
    last_updated: formatTime(now),
    units: weatherData.units,
  };

  // Use AI insights from weather service if available
  if (weatherData.daily_summary && weatherData.daily_summary.trim().length > 0) {
    data.daily_summary = weatherData.daily_summary.trim();
    data.weather_summary_source = 'ai';
    logger.info?.('[DataBuilder] Using AI-generated weather summary');

    // Add AI cost info if available
    const aiCostInfo = weatherService.getAICostInfo();
    if (aiCostInfo) {
      data._ai_cost = {
        total_tokens: aiCostInfo.last_call.total_tokens,
        cost_usd: aiCostInfo.last_call.cost_usd,
        prompt: aiCostInfo.last_call.prompt,
        monthly_cost_usd: aiCostInfo.projections.monthly_cost_usd,
      };
    }
  } else {
    // Fallback to static description
    logger.info?.('[DataBuilder] Using static description fallback');
    const staticDescription = buildStaticDescription({
      current,
      forecast: data.forecast,
      hourlyForecast: data.hourlyForecast,
      units: data.units,
    });
    data.daily_summary = staticDescription.daily_summary;
    data.weather_summary_source = 'static_fallback';
  }

  // Attach service statuses for admin panel
  data._serviceStatuses = {
    weather: weatherStatus,
    calendar: calendarStatus,
    news: newsStatus,
    markets: marketsStatus,
  };

  return data;
}

/**
 * Get service statuses for admin panel
 * Instantiates services to read their TTL configs, then reads status from state
 * @returns All service statuses
 */
export function getServiceStatuses(): Record<string, ServiceStatus> {
  // Instantiate services to get their TTL values
  const weatherService = new WeatherService();
  const calendarService = new CalendarService();
  const newsService = new NewsService();
  const marketsService = new MarketsService();

  // Service definitions
  const serviceConfigs: Record<string, { service: any }> = {
    weather: { service: weatherService },
    calendar: { service: calendarService },
    news: { service: newsService },
    markets: { service: marketsService },
  };

  const allStatuses = getStateKey<Record<string, Partial<ServiceStatus>>>('service_status', {});
  const allCaches = getStateKey<Record<string, { fetchedAt?: number }>>('service_cache', {});

  const statuses: Record<string, ServiceStatus> = {};
  for (const [key, cfg] of Object.entries(serviceConfigs)) {
    const service = cfg.service;
    const savedStatus = allStatuses[service.cacheKey] || {};
    const cache = allCaches[service.cacheKey];
    const isEnabled = service.isEnabled();

    statuses[key] = {
      name: service.name,
      isEnabled,
      state: savedStatus.state || (isEnabled ? 'unknown' : 'disabled'),
      cacheTTL: service.cacheTTL,
      fetchedAt: cache?.fetchedAt || null,
      latency: savedStatus.latency || null,
      error: savedStatus.error || null,
    };
  }

  return statuses;
}

/**
 * Compare today's high with yesterday's high
 * Stores daily highs for the last 3 days for historical comparison
 * @param todayHigh - Today's forecast high temperature (Celsius)
 * @returns Comparison string or null if no yesterday data
 */
function computeTempComparison(todayHigh: number | undefined): string | null {
  if (todayHigh == null) return null;

  // Use local dates, not UTC (important for timezone-aware comparison)
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  // Get yesterday's date
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

  // Get daily highs history
  const dailyHighs = getStateKey<Record<string, number>>('daily_highs', {});

  // Store today's high if not already stored for today
  if (!dailyHighs[todayStr]) {
    dailyHighs[todayStr] = todayHigh;

    // Keep only last 3 days
    const allDates = Object.keys(dailyHighs).sort().reverse();
    const recentDates = allDates.slice(0, 3);
    const trimmedHighs: Record<string, number> = {};
    recentDates.forEach(date => {
      trimmedHighs[date] = dailyHighs[date];
    });

    setStateKey('daily_highs', trimmedHighs);
    return null; // Need a previous value to compare; return on first store
  }

  // Compare with yesterday's high if available
  const yesterdayHigh = dailyHighs[yesterdayStr];
  if (yesterdayHigh == null) return null; // No comparison available

  const diff = Number(todayHigh) - Number(yesterdayHigh);

  // Determine comparison based on temperature difference (Celsius)
  const threshold = 1;
  const strongThreshold = 6;
  if (Math.abs(diff) < threshold) {
    return 'Same as yesterday';
  } else if (diff >= strongThreshold) {
    return 'Much warmer than yesterday';
  } else if (diff > 0) {
    return 'Warmer than yesterday';
  } else if (diff <= -strongThreshold) {
    return 'Much cooler than yesterday';
  } else {
    return 'Cooler than yesterday';
  }
}

function buildCurrentFromWeather(
  location: WeatherLocation,
  windDirectionFallback: (dir: number) => string
): CurrentWeather {
  const temp = location.current_temp;
  const feels = location.feels_like ?? location.current_temp;
  const windSpeed = location.wind_speed ?? null;
  const pressure = location.pressure ?? null;

  return {
    temp: roundValue(temp),
    feels_like: roundValue(feels),
    humidity: location.humidity || 0,
    pressure: pressure != null ? roundValue(pressure, 0) : null,
    weather_icon: location.icon || 'sunny',
    description: location.condition || 'Clear',
    uv_index: location.uv_index || 0,
    visibility: location.visibility || 0,
    cloud_cover: location.cloud_cover || 0,
    wind: {
      speed: windSpeed != null ? roundValue(windSpeed, 1) : null,
      direction: windDirectionFallback(location.wind_dir),
    },
  };
}

function normalizePrecipitationData(
  weatherPrecip: PrecipitationData | undefined
): PrecipitationData {
  const source = weatherPrecip || {};

  const formatValue = (value: number | null): number | null => (value == null ? null : Number(value.toFixed(2)));

  return {
    last_24h: formatValue(source.last_24h ?? null),
    week_total: formatValue(source.week_total ?? null),
    month_total: formatValue(source.month_total ?? null),
    year_total: formatValue(source.year_total ?? null),
    units: 'mm',
  };
}

function roundValue(value: number | null, decimals: number = 0): number {
  if (value == null || !Number.isFinite(Number(value))) return value ?? 0;
  const factor = 10 ** decimals;
  return Math.round(Number(value) * factor) / factor;
}
