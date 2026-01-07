// ============================================================================
// Shared Type Definitions for Home Dashboard
// ============================================================================

// ----------------------------------------------------------------------------
// Unit System Types
// ----------------------------------------------------------------------------

export type UnitSystem = 'us' | 'metric';

export interface Units {
  system: UnitSystem;
  temperature: string;
  temperature_secondary: string;
  wind_speed: string;
  wind_speed_secondary: string;
  precipitation: string;
  precipitation_secondary: string;
  pressure: string;
  pressure_secondary: string;
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
  current_temp_f: number;
  current_temp_c: number;
  feels_like: number;
  feels_like_f: number;
  feels_like_c: number;
  high: number;
  high_f: number;
  high_c: number;
  low: number;
  low_f: number;
  low_c: number;
  icon: string;
  condition: string;
  rain_chance: number;
  humidity: number;
  pressure: number;
  pressure_in: number;
  pressure_hpa: number;
  wind_mph: number;
  wind_kmh: number;
  wind_speed: number;
  wind_dir: number;
  forecast?: ForecastDay[];
}

export interface ForecastDay {
  date: string;
  day: string;
  high: number;
  high_f: number;
  high_c: number;
  low: number;
  low_f: number;
  low_c: number;
  icon: string;
  rain_chance: number;
}

export interface HourlyForecast {
  time: string;
  temp: number | null;
  temp_f: number;
  temp_c: number;
  condition: string;
  icon: string;
  rain_chance: number;
  wind_speed: number | null;
  wind_mph: number;
  wind_kmh: number;
}

export interface WindData {
  speed: number | null;
  speed_mph: number | null;
  speed_kmh: number | null;
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
  last_24h_in: number | null;
  last_24h_mm: number | null;
  week_total: number | null;
  week_total_in: number | null;
  week_total_mm: number | null;
  month_total: number | null;
  month_total_in: number | null;
  month_total_mm: number | null;
  year_total: number | null;
  year_total_in: number | null;
  year_total_mm: number | null;
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
  current_temp_f: number;
  current_temp_c: number;
  feels_like: number;
  feels_like_f: number;
  feels_like_c: number;
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
  pressure_in: number | null;
  pressure_hpa: number | null;
  air_quality: AirQualityData;
  precipitation: PrecipitationData;
  calendar_events: CalendarEvent[];
  clothing_suggestion: string;
  daily_summary: string;
  llm_source?: string;
  last_updated: string;
  units: Units;
  _serviceStatuses?: {
    weather: ServiceStatus;
    ambient: ServiceStatus;
    llm: ServiceStatus;
    calendar: ServiceStatus;
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
  temp_f: number;
  temp_c: number;
  feels_like: number;
  feels_like_f: number;
  feels_like_c: number;
  weather_icon: string;
  description: string;
  humidity: number;
  pressure: number | null;
  pressure_in: number | null;
  pressure_hpa: number | null;
  wind: WindData;
}

// ----------------------------------------------------------------------------
// LLM Service Types
// ----------------------------------------------------------------------------

export interface LLMInsights {
  clothing_suggestion: string;
  daily_summary: string;
}

// ----------------------------------------------------------------------------
// Ambient Service Types
// ----------------------------------------------------------------------------

export interface AmbientPrecipitationData {
  last_24h?: number | null;
  last_24h_in?: number | null;
  last_24h_mm?: number | null;
  week_total?: number | null;
  week_total_in?: number | null;
  week_total_mm?: number | null;
  month_total?: number | null;
  month_total_in?: number | null;
  month_total_mm?: number | null;
  year_total?: number | null;
  year_total_in?: number | null;
  year_total_mm?: number | null;
}

// ----------------------------------------------------------------------------
// State Management Types
// ----------------------------------------------------------------------------

export interface StateData {
  service_cache?: Record<string, ServiceCache>;
  service_status?: Record<string, ServiceStatus>;
  [key: string]: unknown;
}
