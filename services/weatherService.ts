import axios from 'axios';
import { BaseService } from '../lib/BaseService';
import { mapIconAndDescription } from '../lib/weatherUtils';
import { GoogleGenerativeAI } from "@google/generative-ai";
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
  description?: {
    text: string;
    languageCode: string;
  };
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
    value?: number;
    quantity?: number;
    unit: string;
  };
}

interface GoogleCurrentConditions {
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
  cloudCover?: number;
  visibility?: {
    value?: number;
    distance?: number;
    unit: string;
  };
  airPressure?: {
    value?: number;
    meanSeaLevelMillibars?: number;
    unit?: string;
  };
}

interface GoogleForecastDay {
  displayDate: {
    year: number;
    month: number;
    day: number;
  };
  daytimeForecast?: {
    weatherCondition: GoogleWeatherCondition;
    precipitation?: GooglePrecipitation;
  };
  maxTemperature: GoogleTemperature;
  minTemperature: GoogleTemperature;
  maxFeelsLikeTemperature?: GoogleTemperature;
  minFeelsLikeTemperature?: GoogleTemperature;
  sunEvents?: {
    sunriseTime?: string;
    sunsetTime?: string;
  };
  moonEvents?: {
    moonPhase?: string;
  }
}

interface GoogleForecastHour {
  displayDateTime: {
    year: number;
    month: number;
    day: number;
    hours: number;
  };
  weatherCondition: GoogleWeatherCondition;
  temperature: GoogleTemperature;
  feelsLikeTemperature: GoogleTemperature;
  relativeHumidity?: number;
  wind?: GoogleWind;
  precipitation?: GooglePrecipitation;
  uvIndex?: number;
}

interface GoogleDailyResponse {
  forecastDays: GoogleForecastDay[];
}

interface GoogleHourlyResponse {
  forecastHours: GoogleForecastHour[];
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
  uv_index: number;
  visibility: number;
  cloud_cover: number;
  precipitation: PrecipitationData;
  units: Units;
  daily_summary?: string;
  _ai_meta?: {
    input_tokens: number;
    output_tokens: number;
    cost_usd: number;
    prompt: string;
  };
}

interface TimeContext {
  period: 'morning' | 'afternoon' | 'evening' | 'night';
  planningFocus: string;
}

interface WeatherContext {
  dailyInfo: string;
  hourlyData: string;
  contextNotes: string;
}

interface BuildWeatherContextParams {
  current: {
    temp: number;
    description?: string;
    feels_like?: number;
    humidity?: number;
    uv_index?: number;
    visibility?: number;
    cloud_cover?: number;
  };
  relevantForecast?: ForecastDay;
  relevantHourly: HourlyForecast[];
  isNight: boolean;
  moon?: MoonData;
  air_quality?: AirQualityData;
  timeContext: TimeContext;
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
    if (!mainLocation) return [];
    return [mainLocation];
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
    const geo = await this.geocodeLocation(apiKey, locationQuery);
    if (!geo) {
      throw new Error(`Could not resolve location: ${locationQuery}`);
    }

    const baseUrl = 'https://weather.googleapis.com/v1';

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

  // Override getData to handle async mapToDashboard
  async getData(config: WeatherServiceConfig, logger: Logger = console) {
    const cacheSignature = this.getCacheSignature(config);
    this.loadStatus();

    if (!this.isEnabled()) {
      this.status.state = 'disabled';
      this.saveStatus();
      return { data: null as any, source: 'disabled' as const, status: this.getStatus() };
    }

    const cached = this.getCache(false, cacheSignature);
    if (cached) {
      logger.info?.(`[${this.name}] Using valid cache`);
      this.status.state = 'healthy';
      this.saveStatus();
      return { data: cached, source: 'cache' as const, status: this.getStatus() };
    }

    let lastError: Error | undefined;
    for (let attempt = 0; attempt < this.retryAttempts; attempt++) {
      try {
        if (attempt > 0) {
          const delay = this.getBackoffDelay(attempt - 1);
          logger.warn?.(`[${this.name}] Retry attempt ${attempt + 1}/${this.retryAttempts} after ${delay}ms`);
          await this.sleep(delay);
        }

        const apiCallStart = Date.now();
        const apiData = await this.fetchData(config, logger);
        const apiLatency = Date.now() - apiCallStart;

        const dashboardData = await this.mapToDashboard(apiData, config);
        this.setCache(dashboardData, cacheSignature);

        this.status.state = 'healthy';
        this.status.latency = apiLatency;
        this.status.error = null;
        this.saveStatus();

        logger.info?.(`[${this.name}] Fetched successfully from API`);
        return { data: dashboardData, source: 'api' as const, status: this.getStatus() };
      } catch (error) {
        lastError = error as Error;
        logger.warn?.(`[${this.name}] Attempt ${attempt + 1} failed: ${lastError.message}`);
      }
    }

    const staleCache = this.getCache(true, cacheSignature);
    if (staleCache) {
      logger.warn?.(`[${this.name}] API failed, using stale cache. Error: ${lastError!.message}`);
      this.status.state = 'degraded';
      this.status.error = lastError!.message;
      this.saveStatus();
      return { data: staleCache, source: 'stale_cache' as const, status: this.getStatus() };
    }

    logger.error?.(`[${this.name}] API failed with no cache fallback: ${lastError!.message}`);
    this.status.state = 'unhealthy';
    this.status.latency = null;
    this.status.error = lastError!.message;
    this.saveStatus();

    throw lastError!;
  }

  async mapToDashboard(apiResults: LocationData[], _config: WeatherServiceConfig): Promise<WeatherDashboardData> {
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
      const pressureVal = current.airPressure?.meanSeaLevelMillibars || current.airPressure?.value || 1013; // hPa
      const pressure = pressureVal;

      // Condition mapping
      const conditionType = String(current.weatherCondition?.description?.text || current.weatherCondition?.type || 'unknown');
      const { icon: conditionIcon, description: conditionDesc } = mapIconAndDescription(conditionType);

      // Forecast Maps
      const dailyForecasts = daily.forecastDays || [];
      const forecastDays: ForecastDay[] = dailyForecasts.map(d => {
        const high = normalizeTemp(d.maxTemperature?.degrees ?? 0, d.maxTemperature?.unit);
        const low = normalizeTemp(d.minTemperature?.degrees ?? 0, d.minTemperature?.unit);
        const dateStr = formatDate(d.displayDate);

        // Precip
        const precipProb = d.daytimeForecast?.precipitation?.probability?.percent || 0;

        const dayConditionType = String(d.daytimeForecast?.weatherCondition?.description?.text || d.daytimeForecast?.weatherCondition?.type || 'unknown');
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

        uv_index: current.uvIndex || 0,
        visibility: current.visibility?.distance || current.visibility?.value || 0,
        cloud_cover: current.cloudCover || 0,

        forecast: forecastDays
      };
    });

    const mainLoc = mappedLocations[0];
    const mainApiData = apiResults[0].data;

    // Hourly Forecast for main location
    // Limit to next 24 hours
    const hourlyForecasts = mainApiData.hourly?.forecastHours || [];
    const next24 = hourlyForecasts.slice(0, 24).map(h => {
      const t = normalizeTemp(h.temperature?.degrees ?? 0, h.temperature?.unit);
      const { icon } = mapIconAndDescription(h.weatherCondition?.description?.text || h.weatherCondition?.type);
      const wSpeed = h.wind?.speed?.value || 0;
      const wUnit = h.wind?.speed?.unit || 'KILOMETERS_PER_HOUR';
      const windSpeed = normalizeSpeed(wSpeed, wUnit);

      const isoTime = new Date(
        h.displayDateTime.year,
        h.displayDateTime.month - 1,
        h.displayDateTime.day,
        h.displayDateTime.hours
      ).toISOString();

      return {
        time: isoTime,
        temp: t,
        condition: h.weatherCondition?.description?.text || h.weatherCondition?.type || '',
        icon,
        rain_chance: h.precipitation?.probability?.percent || 0,
        wind_speed: windSpeed,
      };
    });

    // Sun data from Daily forecast (Day 0)
    const today = mainApiData.daily?.forecastDays?.[0];
    const sunData: SunData = {
      sunrise: today?.sunEvents?.sunriseTime ? new Date(today.sunEvents.sunriseTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }) : '--:--',
      sunset: today?.sunEvents?.sunsetTime ? new Date(today.sunEvents.sunsetTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }) : '--:--'
    };

    // Moon
    const moonData: MoonData = {
      phase: today?.moonEvents?.moonPhase || 'unknown',
      direction: 'unknown',
      illumination: 0
    };

    const baseData: WeatherDashboardData = {
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
      uv_index: mainLoc.uv_index,
      visibility: mainLoc.visibility,
      cloud_cover: mainLoc.cloud_cover,
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

    // Optionally generate AI insights if Gemini API key is available
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (geminiApiKey) {
      try {
        const aiInsights = await this.generateAIInsights(baseData, geminiApiKey);
        baseData.daily_summary = aiInsights.summary;
        baseData._ai_meta = aiInsights.meta;
      } catch (error) {
        console.warn('[WeatherService] AI insights generation failed:', error);
        // Continue without AI insights - not critical
      }
    }

    return baseData;
  }

  // ============================================================================
  // AI Insights Generation (Optional)
  // ============================================================================

  private async generateAIInsights(
    weatherData: WeatherDashboardData,
    apiKey: string
  ): Promise<{ summary: string; meta: { input_tokens: number; output_tokens: number; cost_usd: number; prompt: string } }> {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      generationConfig: {
        responseMimeType: "application/json",
      }
    });

    const { systemPrompt, userMessage } = this.buildPrompt(weatherData);

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\n${userMessage}` }] }],
    });

    const response = await result.response;
    const text = response.text();

    const parsed = JSON.parse(text);

    // Cost calculation for Gemini 2 Flash
    const inputTokens = response.usageMetadata?.promptTokenCount || 0;
    const outputTokens = response.usageMetadata?.candidatesTokenCount || 0;
    const cost = (inputTokens * 0.1 / 1000000) + (outputTokens * 0.4 / 1000000);

    return {
      summary: parsed.daily_summary || "",
      meta: {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cost_usd: cost,
        prompt: userMessage,
      }
    };
  }

  private buildPrompt(weatherData: WeatherDashboardData): { systemPrompt: string; userMessage: string } {
    const timeContext = this.getTimeContext();
    const mainLoc = weatherData.locations[0];

    const current = {
      temp: mainLoc.current_temp,
      description: mainLoc.condition,
      feels_like: mainLoc.feels_like,
      humidity: mainLoc.humidity,
      uv_index: mainLoc.uv_index,
      visibility: mainLoc.visibility,
      cloud_cover: mainLoc.cloud_cover
    };

    const isNight = timeContext.period === 'night';
    const hoursToShow = timeContext.period === 'morning' ? 8 : 6;
    const relevantHourly = isNight ? weatherData.hourlyForecast : weatherData.hourlyForecast.slice(0, hoursToShow);
    const relevantForecast = weatherData.forecast[0];

    const weatherContext = this.buildWeatherContext({
      current,
      relevantForecast,
      relevantHourly,
      isNight,
      moon: weatherData.moon,
      air_quality: weatherData.air_quality,
      timeContext
    });

    const systemPrompt = `You generate accurate and helpful weather insights for a kitchen e-ink display. The dashboard shows temps/numbers, so describe the FEEL and STORY of the weather to help the user plan their day.

Return JSON:
{
  "daily_summary": "vivid weather narrative, 60-78 chars total (including spaces and punctuation), no ending punctuation"
}

Style:
- Write like a friendly late night weather reporter providing informative updates
- Keep observations factual and helpful
- Describe changes: "warming up", "heating up fast", "cooling down", "drying out", "getting wetter", "clearing up", "getting cloudy"

Rules:
- DO NOT mention specific temps (dashboard shows these) - use "cool", "warm", "hot", "chilly", "mild"
- DO NOT mention specific month or date

Examples:
{"daily_summary": "Dreary and rainy most of the day. Rain not letting up, stay cozy and dry"}
{"daily_summary": "Cool start warming up fast, sunny and pleasant by afternoon"}
{"daily_summary": "Chilly and misty this morning, staying fairly cool throughout the day"}
{"daily_summary": "Breezy and mild now, cooling down with clear skies come evening"}
{"daily_summary": "Tomorrow foggy and cool early, clearing to sunny skies and warm temperatures"}
{"daily_summary": "Misty morning transforming into a gorgeous mild but sunny afternoon"}

Remember:
- Daily summary must be at least 60 characters and CANNOT be more than 78 total characters (including spaces and punctuation)
- You MUST return valid JSON ONLY
`;

    const now = new Date();
    const month = now.toLocaleString('default', { month: 'long' });
    const day = now.getDate();
    const hour = now.getHours();
    const ampm = hour < 12 ? 'AM' : 'PM';
    const time = `${hour % 12 || 12}:${String(now.getMinutes()).padStart(2, '0')} ${ampm}`;

    const userMessage = `Today is ${month} ${day}. It is ${timeContext.period.toUpperCase()}, ${time}. Planning for ${timeContext.planningFocus}

CURRENT WEATHER: ${current.temp}°C, ${current.description}
${weatherContext.dailyInfo}

HOURLY FORECAST:
${weatherContext.hourlyData}${weatherContext.contextNotes ? '\n\nNOTES: ' + weatherContext.contextNotes : ''}`;

    return { systemPrompt, userMessage };
  }

  private buildWeatherContext(params: BuildWeatherContextParams): WeatherContext {
    const { current, relevantForecast, relevantHourly, isNight, moon, air_quality, timeContext } = params;
    const context: { dailyInfo: string; hourlyData: string; contextNotes: string[] } = {
      dailyInfo: '',
      hourlyData: '',
      contextNotes: []
    };

    // Daily info with smart rain mention
    const maxRainChance = Math.max(
      relevantForecast?.rain_chance || 0,
      ...relevantHourly.map(h => h.rain_chance || 0)
    );
    const rainMention = maxRainChance > 0 ? `, ${maxRainChance}% rain` : '';

    context.dailyInfo = isNight
      ? `TOMORROW: High ${relevantForecast?.high}°, Low ${relevantForecast?.low}°${rainMention}`
      : `TODAY: High ${relevantForecast?.high}°, Low ${relevantForecast?.low}°${rainMention}`;

    // Hourly data
    context.hourlyData = relevantHourly
      .map(h => `${h.time}: ${h.temp}° ${h.condition.trim()}${h.rain_chance > 0 ? ` (${h.rain_chance}%)` : ''}`)
      .join('\n');

    // Temperature swing
    const temps = relevantHourly.map(h => h.temp ?? 20);
    const tempRange = temps.length > 0 ? Math.max(...temps) - Math.min(...temps) : 0;
    if (tempRange >= 8) {
      context.contextNotes.push(`${Math.round(tempRange)}° temperature swing`);
    }

    // Wind
    const maxWind = Math.max(...relevantHourly.map(h => h.wind_speed || 0));
    if (maxWind >= 20) {
      context.contextNotes.push(`Windy, gusts ${Math.round(maxWind)} km/h`);
    }

    // Humidity extremes
    const humidity = current?.humidity;
    if (humidity && humidity >= 80) {
      context.contextNotes.push(`Humid (${humidity}%, muggy feel)`);
    } else if (humidity && humidity <= 30) {
      context.contextNotes.push(`Dry (${humidity}%, crisp feel)`);
    }

    // Sky transitions
    const conditions = relevantHourly.map(h => h.condition.trim().toLowerCase());
    const uniqueConditions = [...new Set(conditions)];

    if (uniqueConditions.length > 1) {
      const firstCond = conditions[0];
      const lastCond = conditions[conditions.length - 1];

      const transitionIndex = conditions.findIndex((c, i) => i > 0 && c !== conditions[i - 1]);
      if (transitionIndex > 0) {
        const transitionTime = relevantHourly[transitionIndex].time;
        context.contextNotes.push(`${firstCond} → ${lastCond} around ${transitionTime}`);
      } else if (firstCond !== lastCond) {
        context.contextNotes.push(`${firstCond} → ${lastCond}`);
      }
    }

    // Moon
    if (moon && (timeContext.period === 'evening' || timeContext.period === 'night')) {
      if (moon.phase === 'full' || (moon.illumination && moon.illumination >= 95)) {
        context.contextNotes.push('Full moon (bright night)');
      } else if (moon.phase === 'new' || (moon.illumination && moon.illumination <= 5)) {
        context.contextNotes.push('New moon');
      } else if (moon.illumination && moon.illumination >= 50 && moon.direction === 'waxing') {
        context.contextNotes.push(`Bright ${moon.phase.replace('_', ' ')} moon`);
      }
    }

    // Air quality
    if (air_quality?.aqi && air_quality.aqi > 100) {
      context.contextNotes.push(`AQI ${air_quality.aqi} (${air_quality.category})`);
    }

    // Special conditions
    const fogHours = relevantHourly.filter(h =>
      h.condition.toLowerCase().includes('fog') || h.condition.toLowerCase().includes('mist')
    );
    if (fogHours.length >= 2) {
      const fogStart = fogHours[0].time;
      const fogEnd = fogHours[fogHours.length - 1].time;
      context.contextNotes.push(`Marine layer ${fogStart}-${fogEnd}`);
    }

    // Heat advisory
    const hotHours = relevantHourly.filter(h => (h.temp ?? 0) >= 32);
    if (hotHours.length >= 2) {
      context.contextNotes.push(`Heat peak ${hotHours[0].time}-${hotHours[hotHours.length - 1].time}`);
    }

    // Feels-like delta
    if (current?.feels_like && current?.temp && Math.abs(current.temp - current.feels_like) >= 3) {
      const delta = current.feels_like - current.temp;
      context.contextNotes.push(`Feels ${delta > 0 ? 'warmer' : 'cooler'} (${Math.abs(Math.round(delta))}° diff)`);
    }

    // UV Index
    if (current?.uv_index && current.uv_index >= 6) {
      context.contextNotes.push(`High UV (${current.uv_index})`);
    }

    // Visibility
    if (current?.visibility !== undefined && current.visibility <= 5) {
      context.contextNotes.push(`Low visibility (${current.visibility}km)`);
    }

    // Cloud Cover
    if (current?.cloud_cover !== undefined) {
      if (current.cloud_cover >= 90) context.contextNotes.push('Overcast skies');
      else if (current.cloud_cover <= 10) context.contextNotes.push('Clear skies');
    }

    const finalContextNotes: string = context.contextNotes.slice(0, 5).join(' • ');

    return {
      dailyInfo: context.dailyInfo,
      hourlyData: context.hourlyData,
      contextNotes: finalContextNotes,
    };
  }

  private getTimeContext(): TimeContext {
    const hour = new Date().getHours();

    if (hour >= 5 && hour < 11) {
      return { period: 'morning', planningFocus: 'the full day ahead. Describe how the day is starting and what to expect ahead. You MUST mention "today" or "this morning" once' };
    } else if (hour >= 11 && hour < 16) {
      return { period: 'afternoon', planningFocus: 'this afternoon and evening. Describe the current and upcoming conditions.' };
    } else if (hour >= 16 && hour < 20) {
      return { period: 'evening', planningFocus: 'tonight. Describe how the day is ending.' };
    } else {
      return { period: 'night', planningFocus: 'tomorrow. You MUST mention "tomorrow" once' };
    }
  }

  /**
   * Get AI cost information from cached data
   */
  getAICostInfo(): { last_call: { total_tokens: number; cost_usd: number; prompt: string }; projections: { monthly_cost_usd: number } } | null {
    const cached = this.getCache(true) as WeatherDashboardData | null;
    if (!cached || !cached._ai_meta) return null;

    const { input_tokens, output_tokens, cost_usd, prompt } = cached._ai_meta;

    // Calculate projected costs based on cache TTL
    const cacheTTLHours = this.cacheTTL / (1000 * 60 * 60);
    const callsPerDay = (24 - 5) / cacheTTLHours; // Assuming 5 hours of sleep
    const projectedDailyCost = cost_usd * callsPerDay;
    const projectedMonthlyCost = projectedDailyCost * 30;

    return {
      last_call: {
        total_tokens: input_tokens + output_tokens,
        cost_usd,
        prompt,
      },
      projections: {
        monthly_cost_usd: projectedMonthlyCost,
      }
    };
  }
}
