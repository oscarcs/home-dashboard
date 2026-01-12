// ============================================================================
// Shared Type Definitions for Home Dashboard
// ============================================================================

// ----------------------------------------------------------------------------
// Unit System Types
// ----------------------------------------------------------------------------

export interface Units {
  temperature: string;
  wind_speed: string;
  precipitation: string;
  pressure: string;
}

// ----------------------------------------------------------------------------
// Service Status Types
// ----------------------------------------------------------------------------

export type ServiceState = 'unknown' | 'healthy' | 'degraded' | 'unhealthy' | 'disabled' | 'pending';

export interface ServiceStatus {
  name: string;
  isEnabled: boolean;
  state: ServiceState;
  cacheTTL: number;
  fetchedAt: number | null;
  latency: number | null;
  error: string | null;
}

// ----------------------------------------------------------------------------
// Weather Types
// ----------------------------------------------------------------------------

export interface WeatherLocation {
  name: string;
  region: string;
  country: string;
  query: string;
  current_temp: number;
  feels_like: number;
  high: number;
  low: number;
  icon: string;
  condition: string;
  rain_chance: number;
  humidity: number;
  pressure: number;
  wind_speed: number;
  wind_dir: number;
  uv_index: number;
  visibility: number;
  cloud_cover: number;
  forecast?: ForecastDay[];
}

export interface ForecastDay {
  date: string;
  day: string;
  high: number;
  low: number;
  icon: string;
  rain_chance: number;
}

export interface HourlyForecast {
  time: string;
  temp: number | null;
  condition: string;
  icon: string;
  rain_chance: number;
  wind_speed: number | null;
}

export interface WindData {
  speed: number | null;
  direction: string;
}

export interface SunData {
  sunrise: string;
  sunset: string;
}

export interface MoonData {
  phase: string;
  direction: string;
  illumination: number | null;
}

export interface AirQualityData {
  aqi: number | null;
  category: string;
}

export interface PrecipitationData {
  last_24h: number | null;
  week_total: number | null;
  month_total: number | null;
  year_total: number | null;
  units: string;
}

// ----------------------------------------------------------------------------
// Calendar Types
// ----------------------------------------------------------------------------

export interface CalendarEvent {
  title: string;
  time: string;
}

// ----------------------------------------------------------------------------
// Dashboard Data Model
// ----------------------------------------------------------------------------

export interface DashboardData {
  current_temp: number;
  feels_like: number;
  weather_icon: string;
  weather_description: string;
  date: string;
  temp_comparison: string | null;
  locations: WeatherLocation[];
  forecast: ForecastDay[];
  hourlyForecast: HourlyForecast[];
  wind: WindData;
  sun: SunData;
  moon: MoonData;
  humidity: number;
  pressure: number | null;
  air_quality: AirQualityData;
  uv_index: number;
  visibility: number;
  cloud_cover: number;
  precipitation: PrecipitationData;
  calendar_events: CalendarEvent[];
  daily_summary: string;
  weather_summary_source?: string;
  news_summary?: string;
  news_headlines?: NewsHeadline[];
  markets?: MarketsData;
  last_updated: string;
  units: Units;
  _serviceStatuses?: {
    weather: ServiceStatus;
    calendar: ServiceStatus;
    news: ServiceStatus;
    markets: ServiceStatus;
  };
  _ai_cost?: {
    total_tokens: number;
    cost_usd: number;
    prompt: string;
    monthly_cost_usd: number;
  };
}

// ----------------------------------------------------------------------------
// Service Cache Types
// ----------------------------------------------------------------------------

export interface ServiceCache<T = unknown> {
  data: T;
  fetchedAt: number;
  signature?: string | null;
}

// ----------------------------------------------------------------------------
// BaseService Types
// ----------------------------------------------------------------------------

export interface BaseServiceOptions {
  name: string;
  cacheKey: string;
  cacheTTL: number;
  retryAttempts?: number;
  retryCooldown?: number;
}

export interface ServiceDataResult<T> {
  data: T;
  source: 'cache' | 'api' | 'stale_cache' | 'disabled';
  status: ServiceStatus;
}

// ----------------------------------------------------------------------------
// Logger Interface
// ----------------------------------------------------------------------------

export interface Logger {
  info?: (message: string, ...args: unknown[]) => void;
  warn?: (message: string, ...args: unknown[]) => void;
  error?: (message: string, ...args: unknown[]) => void;
  log?: (message: string, ...args: unknown[]) => void;
}

// ----------------------------------------------------------------------------
// Current Weather Data (for internal use in dataBuilder)
// ----------------------------------------------------------------------------

export interface CurrentWeather {
  temp: number;
  feels_like: number;
  weather_icon: string;
  description: string;
  humidity: number;
  pressure: number | null;
  uv_index: number;
  visibility: number;
  cloud_cover: number;
  wind: WindData;
}

// ----------------------------------------------------------------------------
// LLM Service Types
// ----------------------------------------------------------------------------

export interface LLMInsights {
  daily_summary: string;
}

// ----------------------------------------------------------------------------
// News Service Types
// ----------------------------------------------------------------------------

export interface NewsHeadline {
  source: string;
  title: string;
}

export interface NewsData {
  headlines: NewsHeadline[];
  summary: string;
}

// ----------------------------------------------------------------------------
// Markets Service Types
// ----------------------------------------------------------------------------

export interface MarketQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  currency: string;
}

export interface MarketsData {
  quotes: MarketQuote[];
  lastUpdated: number;
}


// ----------------------------------------------------------------------------
// State Management Types
// ----------------------------------------------------------------------------

export interface StateData {
  service_cache?: Record<string, ServiceCache>;
  service_status?: Record<string, ServiceStatus>;
  [key: string]: unknown;
}
