import axios from 'axios';
import { BaseService } from '../lib/BaseService';
import { mapIconAndDescription } from '../lib/weatherUtils';
import type {
  Logger,
  WeatherLocation,
  ForecastDay,
  HourlyForecast,
  SunData,
  MoonData,
  AirQualityData,
  PrecipitationData,
  Units,
} from '../lib/types';

// ============================================================================
// Google Maps Platform Weather API Response Types
// ============================================================================

interface GoogleWeatherCondition {
  type: string;
  description?: string;
  iconBaseUri?: string;
}

interface GoogleTemperature {
  degrees: number;
  unit: string;
}

interface GoogleWind {
  speed?: {
    value: number;
    unit: string;
  };
  direction?: {
    degrees: number;
    cardinal: string;
  };
  gust?: {
    value: number;
    unit: string;
  };
}

interface GooglePrecipitation {
  probability?: {
    percent: number;
    type: string;
  };
  qpf?: {
    value: number;
    unit: string;
  };
}

interface GoogleCurrentConditions {
  name?: string; // Resource name
  currentTime: string;
  timeZone: {
    id: string;
  };
  weatherCondition: GoogleWeatherCondition;
  temperature: GoogleTemperature;
  feelsLikeTemperature: GoogleTemperature;
  dewPoint?: GoogleTemperature;
  relativeHumidity?: number;
  wind?: GoogleWind;
  precipitation?: GooglePrecipitation;
  isDaytime?: boolean;
  uvIndex?: number;
  visibility?: {
    value: number;
    unit: string;
  };
  airPressure?: {
    value: number;
    unit: string;
  };
}

interface GoogleForecastDay {
  forecastDate: {
    year: number;
    month: number;
    day: number;
  };
  weatherCondition: GoogleWeatherCondition;
  maxTemperature: GoogleTemperature;
  minTemperature: GoogleTemperature;
  maxFeelsLikeTemperature?: GoogleTemperature;
  minFeelsLikeTemperature?: GoogleTemperature;
  relativeHumidity?: {
    maxPercent?: number;
    minPercent?: number;
    averagePercent?: number;
  };
  precipitation?: GooglePrecipitation;
  wind?: GoogleWind;
  sunriseTime?: string;
  sunsetTime?: string;
  moonriseTime?: string;
  moonsetTime?: string;
  moonPhase?: {
    phase: string;
  }
  uvIndex?: {
    max?: number;
  };
}

interface GoogleForecastHour {
  forecastTime: string;
  weatherCondition: GoogleWeatherCondition;
  temperature: GoogleTemperature;
  feelsLikeTemperature: GoogleTemperature;
  relativeHumidity?: number;
  wind?: GoogleWind;
  precipitation?: GooglePrecipitation;
  uvIndex?: number;
}

interface GoogleDailyResponse {
  dailyForecasts: GoogleForecastDay[];
}

interface GoogleHourlyResponse {
  hourlyForecasts: GoogleForecastHour[];
}

interface FullWeatherData {
  current: GoogleCurrentConditions;
  daily: GoogleDailyResponse;
  hourly: GoogleHourlyResponse;
  resolvedAddress: string;
  timezone: string;
}

interface LocationData {
  location: string;
  data: FullWeatherData;
}

interface WeatherServiceConfig {
  baseUrl?: string;
  timezone?: string;
}

interface WeatherDashboardData {
  locations: WeatherLocation[];
  forecast: ForecastDay[];
  hourlyForecast: HourlyForecast[];
  timezone: string;
  sun: SunData;
  moon: MoonData;
  air_quality: AirQualityData;
  precipitation: PrecipitationData;
  units: Units;
}

// ============================================================================
// Weather Service Class
// ============================================================================

export class WeatherService extends BaseService<WeatherDashboardData, WeatherServiceConfig> {
  constructor(cacheTTLMinutes: number = 30) {
    super({
      name: 'Google Weather',
      cacheKey: 'weather-google',
      cacheTTL: cacheTTLMinutes * 60 * 1000,
      retryAttempts: 3,
      retryCooldown: 1000,
    });
  }

  getCacheSignature(): string {
    const locations = this.getConfiguredLocations();
    return JSON.stringify({ locations });
  }

  isEnabled(): boolean {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    return !!apiKey;
  }

  getConfiguredLocations(): string[] {
    const mainLocation = (process.env.MAIN_LOCATION || '').trim();
    const additionalLocationsRaw = process.env.ADDITIONAL_LOCATIONS || '';

    const parsedAdditional = additionalLocationsRaw
      .split(/\r?\n|\|/)
      .map(l => l.trim())
      .filter(Boolean)
      .slice(0, 3);

    const locations: string[] = [];

    if (mainLocation) {
      locations.push(mainLocation);
    }

    locations.push(...parsedAdditional);

    return Array.from(new Set(locations));
  }

  async geocodeLocation(apiKey: string, metadata: string): Promise<{ lat: number, lng: number, formattedAddress: string } | null> {
    try {
      // Use Google Maps Geocoding API
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(metadata)}&key=${apiKey}`;
      const resp = await axios.get(url, { timeout: 10000 });
      
      if (resp.data.status === 'OK' && resp.data.results && resp.data.results.length > 0) {
        const result = resp.data.results[0];
        return {
          lat: result.geometry.location.lat,
          lng: result.geometry.location.lng,
          formattedAddress: result.formatted_address
        };
      }
      return null;
    } catch (error) {
      console.error(`Geocoding failed for ${metadata}`, error);
      return null;
    }
  }

  async fetchLocationData(apiKey: string, locationQuery: string, _logger: Logger): Promise<LocationData> {
    // 1. Geocode the location
    const geo = await this.geocodeLocation(apiKey, locationQuery);
    if (!geo) {
      throw new Error(`Could not resolve location: ${locationQuery}`);
    }

    // 2. Fetch Weather Data (Metric defaults)
    const baseUrl = 'https://weather.googleapis.com/v1';
    
    // We need to fetch 3 endpoints concurrently
    const currentUrl = `${baseUrl}/currentConditions:lookup?key=${apiKey}&location.latitude=${geo.lat}&location.longitude=${geo.lng}`;
    const dailyUrl = `${baseUrl}/forecast/days:lookup?key=${apiKey}&location.latitude=${geo.lat}&location.longitude=${geo.lng}&days=7`;
    const hourlyUrl = `${baseUrl}/forecast/hours:lookup?key=${apiKey}&location.latitude=${geo.lat}&location.longitude=${geo.lng}&hours=24`;

    const [currentResp, dailyResp, hourlyResp] = await Promise.all([
      axios.get<GoogleCurrentConditions>(currentUrl),
      axios.get<GoogleDailyResponse>(dailyUrl),
      axios.get<GoogleHourlyResponse>(hourlyUrl)
    ]);

    return {
      location: locationQuery,
      data: {
        current: currentResp.data,
        daily: dailyResp.data,
        hourly: hourlyResp.data,
        resolvedAddress: geo.formattedAddress,
        timezone: currentResp.data.timeZone.id
      }
    };
  }

  async fetchData(_config: WeatherServiceConfig, logger: Logger): Promise<LocationData[]> {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) throw new Error('GOOGLE_MAPS_API_KEY not configured');

    const locations = this.getConfiguredLocations();
    if (locations.length === 0) throw new Error('No locations configured. Set MAIN_LOCATION.');

    const promises = locations.map(loc => this.fetchLocationData(apiKey, loc, logger));
    return Promise.all(promises);
  }

  mapToDashboard(apiResults: LocationData[], _config: WeatherServiceConfig): WeatherDashboardData {
    if (!Array.isArray(apiResults) || apiResults.length === 0) {
      throw new Error('No weather data available');
    }

    const firstResult = apiResults[0];
    const locationTimezone = firstResult.data.timezone || 'UTC';

    const getDayOfWeek = (dateStr: string): string => {
      // dateStr is YYYY-MM-DD
      const d = new Date(`${dateStr}T12:00:00`);
      return d.toLocaleDateString('en-US', { weekday: 'short' });
    };

    const formatDate = (d: { year: number, month: number, day: number }) => {
      return `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
    };

    const normalizeTemp = (val: number, unit: string): number => {
      if (unit === 'FAHRENHEIT') {
        const f = val;
        const c = (f - 32) * 5 / 9;
        return c;
      } else {
        // Assume CELSIUS
        return val;
      }
    };

    const normalizeSpeed = (val: number, unit: string): number => {
      if (unit === 'MILES_PER_HOUR') {
        return val * 1.60934; // Convert to km/h
      } else {
        // Assume KILOMETERS_PER_HOUR
        return val;
      }
    };

    // Main map loop
    const mappedLocations: WeatherLocation[] = apiResults.map(locData => {
      const { current, daily, resolvedAddress } = locData.data;

      if (!current || !daily) {
        console.warn(`[WeatherService] Missing current or daily data for ${locData.location}`);
        // Return a dummy or skip? Mapping must return a value. 
        // We will throw here to be caught by the service wrapper, or return partial data.
        // Better to throw if essential data is missing.
        throw new Error(`Incomplete weather data for ${locData.location}`);
      }

      // Current processing
      const curTemp = normalizeTemp(current.temperature?.degrees ?? 0, current.temperature?.unit);
      const curFeels = normalizeTemp(current.feelsLikeTemperature?.degrees ?? 0, current.feelsLikeTemperature?.unit);
      
      // Wind
      const windSpeedVal = current.wind?.speed?.value || 0;
      const windUnit = current.wind?.speed?.unit || 'KILOMETERS_PER_HOUR';
      const windSpeed = normalizeSpeed(windSpeedVal, windUnit);

      // Pressure
      const pressureVal = current.airPressure?.value || 1013; // hPa
      const pressure = pressureVal;

      // Condition mapping
      const conditionType = String(current.weatherCondition?.description || current.weatherCondition?.type || 'unknown');
      const { icon: conditionIcon, description: conditionDesc } = mapIconAndDescription(conditionType);

      // Forecast Maps
      const dailyForecasts = daily.dailyForecasts || [];
      const forecastDays: ForecastDay[] = dailyForecasts.map(d => {
        const high = normalizeTemp(d.maxTemperature?.degrees ?? 0, d.maxTemperature?.unit);
        const low = normalizeTemp(d.minTemperature?.degrees ?? 0, d.minTemperature?.unit);
        const dateStr = formatDate(d.forecastDate);
        
        // Precip
        const precipProb = d.precipitation?.probability?.percent || 0;
        
        const dayConditionType = String(d.weatherCondition?.description || d.weatherCondition?.type || 'unknown');
        const { icon } = mapIconAndDescription(dayConditionType);
        
        return {
          date: dateStr,
          day: getDayOfWeek(dateStr),
          high,
          low,
          icon,
          rain_chance: precipProb
        };
      });

      // return WeatherLocation
      return {
        name: resolvedAddress ? resolvedAddress.split(',')[0] : locData.location,
        region: resolvedAddress || '',
        country: '',
        query: locData.location,
        
        current_temp: curTemp,
        feels_like: curFeels,
        
        high: forecastDays[0]?.high || 0,
        low: forecastDays[0]?.low || 0,

        icon: conditionIcon,
        condition: conditionDesc || conditionType,
        
        rain_chance: current.precipitation?.probability?.percent || 0,
        humidity: current.relativeHumidity || 0,
        
        pressure,
        wind_speed: windSpeed,
        wind_dir: current.wind?.direction?.degrees || 0,
        
        forecast: forecastDays
      };
    });

    const mainLoc = mappedLocations[0];
    const mainApiData = apiResults[0].data;

    // Hourly Forecast for main location
    // Limit to next 24 hours
    const hourlyForecasts = mainApiData.hourly?.hourlyForecasts || [];
    const next24 = hourlyForecasts.slice(0, 24).map(h => {
        const t = normalizeTemp(h.temperature?.degrees ?? 0, h.temperature?.unit);
        const { icon } = mapIconAndDescription(h.weatherCondition?.description || h.weatherCondition?.type);
        const wSpeed = h.wind?.speed?.value || 0;
        const wUnit = h.wind?.speed?.unit || 'KILOMETERS_PER_HOUR';
        const windSpeed = normalizeSpeed(wSpeed, wUnit);

        const isoTime = h.forecastTime; 
        
        return {
            time: isoTime,
            temp: t,
            condition: h.weatherCondition?.description || h.weatherCondition?.type || '',
            icon,
            rain_chance: h.precipitation?.probability?.percent || 0,
            wind_speed: windSpeed,
        };
    });

    // Sun data from Daily forecast (Day 0)
    const today = mainApiData.daily?.dailyForecasts?.[0];
    const sunData: SunData = {
        sunrise: today?.sunriseTime ? new Date(today.sunriseTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--',
        sunset: today?.sunsetTime ? new Date(today.sunsetTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'
    };
    
    // Moon
    const moonData: MoonData = {
        phase: today?.moonPhase?.phase || 'unknown',
        direction: 'unknown',
        illumination: 0
    };

    return {
        locations: mappedLocations,
        forecast: mainLoc.forecast || [],
        hourlyForecast: next24,
        timezone: locationTimezone,
        sun: sunData,
        moon: moonData,
        air_quality: {
            aqi: null,
            category: 'Not available'
        },
        precipitation: {
            last_24h: 0,
            week_total: null,
            month_total: null,
            year_total: null,
            units: 'mm'
        },
        units: {
            temperature: '°C',
            wind_speed: 'km/h',
            precipitation: 'mm',
            pressure: 'hPa'
        }
    };
  }
}
