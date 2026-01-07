import { BaseService } from '../lib/BaseService';
import type {
  Logger,
  HourlyForecast,
  ForecastDay,
  MoonData,
  AirQualityData,
} from '../lib/types';

// ============================================================================
// LLM Service Types
// ============================================================================

interface LLMServiceConfig {
  baseUrl?: string;
}

interface CurrentWeatherForLLM {
  temp: number;
  description?: string;
  feels_like?: number;
  humidity?: number;
}

interface LocationForLLM {
  name?: string;
}

interface WeatherContextForPrompt {
  current?: CurrentWeatherForLLM;
  forecast?: ForecastDay[];
  hourlyForecast?: HourlyForecast[];
  location?: LocationForLLM;
  timezone?: string;
  sun?: {
    sunrise?: string;
    sunset?: string;
  };
  moon?: MoonData;
  air_quality?: AirQualityData;
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
  current?: CurrentWeatherForLLM;
  relevantForecast?: ForecastDay;
  relevantHourly: HourlyForecast[];
  isNight: boolean;
  moon?: MoonData;
  air_quality?: AirQualityData;
  timeContext: TimeContext;
}

interface PromptResult {
  systemPrompt: string;
  userMessage: string;
}

interface LLMInsights {
  clothing_suggestion: string;
  daily_summary: string;
  _meta?: {
    input_tokens: number;
    output_tokens: number;
    cost_usd: number;
    prompt: string;
  };
}

interface CostInfo {
  last_call: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    cost_usd: number;
    prompt: string;
  };
  projections: {
    calls_per_day: number;
    daily_cost_usd: number;
    monthly_cost_usd: number;
  };
}

// ============================================================================
// LLM Service Class
// ============================================================================

/**
 * LLM Service (AI Insights) - OPTIONAL
 * Currently supports Anthropic Claude, but designed to be provider-agnostic
 */
class LLMService extends BaseService<LLMInsights, LLMServiceConfig> {
  constructor(cacheTTLMinutes: number = 90) {
    super({
      name: 'LLM',
      cacheKey: 'llm',
      cacheTTL: cacheTTLMinutes * 60 * 1000,
      retryAttempts: 3,
      retryCooldown: 300,
    });
  }

  isEnabled(): boolean {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    return !!apiKey;
  }

  async fetchData(_config: LLMServiceConfig, _logger: Logger): Promise<LLMInsights> {
    // This method would be implemented to call the LLM API
    // For now, we return empty data as the implementation depends on external API
    throw new Error('fetchData must be implemented with LLM API call');
  }

  mapToDashboard(apiData: LLMInsights, _config: LLMServiceConfig): LLMInsights {
    return {
      clothing_suggestion: apiData.clothing_suggestion,
      daily_summary: apiData.daily_summary,
      _meta: apiData._meta,
    };
  }

  /**
   * Get current cached cost information
   * @returns Cost info or null if no cache
   */
  getCostInfo(): CostInfo | null {
    const cached = this.getCache(true) as LLMInsights | null; // Allow stale
    if (!cached || !cached._meta) return null;

    const { input_tokens, output_tokens, cost_usd, prompt } = cached._meta;

    // Calculate projected daily/monthly costs based on cache TTL
    const cacheTTLHours = this.cacheTTL / (1000 * 60 * 60);
    const callsPerDay = (24 - 5) / cacheTTLHours;
    const projectedDailyCost = cost_usd * callsPerDay;
    const projectedMonthlyCost = projectedDailyCost * 30;

    return {
      last_call: {
        input_tokens,
        output_tokens,
        total_tokens: input_tokens + output_tokens,
        cost_usd,
        prompt,
      },
      projections: {
        calls_per_day: Math.round(callsPerDay * 10) / 10,
        daily_cost_usd: projectedDailyCost,
        monthly_cost_usd: projectedMonthlyCost,
      }
    };
  }

  buildPrompt(weatherData: WeatherContextForPrompt): PromptResult {
    const timeContext = this.getTimeContext();

    const { current, forecast, hourlyForecast, moon, air_quality } = weatherData;

    // Determine scope
    // Note: forecast[0] is always the "next full day"
    // During daytime: forecast[0] = today, during nighttime: forecast[0] = tomorrow
    const isNight = timeContext.period === 'night';
    const hoursToShow = timeContext.period === 'morning' ? 8 : 6;
    const relevantHourly = isNight ? (hourlyForecast || []) : (hourlyForecast || []).slice(0, hoursToShow);
    const relevantForecast = forecast?.[0]; // Always use forecast[0] for the next full day

    // Build context intelligently
    const weatherContext = this.buildWeatherContext({
      current,
      relevantForecast,
      relevantHourly,
      isNight,
      moon,
      air_quality,
      timeContext
    });

    const systemPrompt = `You generate accurate and helpful weather insights for a kitchen e-ink display. The dashboard shows temps/numbers, so describe the FEEL and STORY of the weather to help the user plan their day.

Return JSON:
{
  "clothing_suggestion": "practical clothingadvice, max 6 words",
  "daily_summary": "vivid weather narrative, 60-78 chars total (including spaces and punctuation), no ending punctuation"
}

Style:
- Comment specifically on things that are normal or out of the ordinary, help the user plan their day
- Write like a friendly late night weather reporter providing informative updates
- Keep observations factual and helpful
- Describe changes: "warming up", "heating up fast", "cooling down", "drying out", "getting wetter", "clearing up", "getting cloudy"

Rules:
- DO NOT mention specific temps (dashboard shows these) - use "cool", "warm", "hot", "chilly", "mild"
- DO NOT mention specific month or date, but you can describe the season (e.g. Summer, Spring, Fall, Winter)

Examples:
{"clothing_suggestion": "Warm layers and rain gear", "daily_summary": "Dreary and rainy most of the day. Rain not letting up, stay cozy and dry"}
{"clothing_suggestion": "Layers you can shed", "daily_summary": "Cool start warming up fast, sunny and pleasant by afternoon"}
{"clothing_suggestion": "Sweater for the day", "daily_summary": "Chilly and misty this morning, staying fairly cool throughout the day"}
{"clothing_suggestion": "Jacket for tonight", "daily_summary": "Breezy and mild now, cooling down with clear skies come evening"}
{"clothing_suggestion": "Light layers, potentially shorts weather", "daily_summary": "Tomorrow foggy and cool early, clearing to sunny skies and warm temperatures"}
{"clothing_suggestion": "Warm jacket and layers", "daily_summary": "Misty morning transforming into a gorgeous mild but sunny afternoon"}

Remember:
- Daily summary must be at least 60 characters and CANNOT be more than 78 total characters (including spaces and punctuation)
- You MUST return valid JSON ONLY
`;

    const now = new Date();
    const month = now.toLocaleString('default', { month: 'long' });
    const day = now.getDate();
    const hour = now.getHours();
    const ampm = hour < 12 ? 'AM' : 'PM';
    const time = `${hour % 12}:${String(now.getMinutes()).padStart(2, '0')} ${ampm}`;

    const userMessage = `Today is ${month} ${day}. It is ${timeContext.period.toUpperCase()}, ${time}. Planning for ${timeContext.planningFocus}

CURRENT WEATHER: ${current?.temp}°C, ${current?.description}
${weatherContext.dailyInfo}

HOURLY FORECAST:
${weatherContext.hourlyData}${weatherContext.contextNotes ? '\n\nNOTES: ' + weatherContext.contextNotes : ''}`;

    return { systemPrompt, userMessage };
  }

  buildWeatherContext(params: BuildWeatherContextParams): WeatherContext {
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
    if (tempRange >= 8) {  // ~15°F in Celsius
      context.contextNotes.push(`${Math.round(tempRange)}° temperature swing`);
    }

    // Wind
    const maxWind = Math.max(...relevantHourly.map(h => h.wind_speed || 0));
    if (maxWind >= 20) {  // ~12 mph in km/h
      context.contextNotes.push(`Windy, gusts ${Math.round(maxWind)} km/h`);
    }

    // Humidity extremes
    const humidity = current?.humidity;
    if (humidity && humidity >= 80) {
      context.contextNotes.push(`Humid (${humidity}%, muggy feel)`);
    } else if (humidity && humidity <= 30) {
      context.contextNotes.push(`Dry (${humidity}%, crisp feel)`);
    }

    // Sky transitions - enhanced with more detail
    const conditions = relevantHourly.map(h => h.condition.trim().toLowerCase());
    const uniqueConditions = [...new Set(conditions)];

    if (uniqueConditions.length > 1) {
      const firstCond = conditions[0];
      const lastCond = conditions[conditions.length - 1];

      // Find the transition point
      const transitionIndex = conditions.findIndex((c, i) => i > 0 && c !== conditions[i - 1]);
      if (transitionIndex > 0) {
        const transitionTime = relevantHourly[transitionIndex].time;
        context.contextNotes.push(`${firstCond} → ${lastCond} around ${transitionTime}`);
      } else if (firstCond !== lastCond) {
        context.contextNotes.push(`${firstCond} → ${lastCond}`);
      }
    }

    // Moon - enhanced descriptions
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

    // Special conditions - enhanced
    const fogHours = relevantHourly.filter(h =>
      h.condition.toLowerCase().includes('fog') || h.condition.toLowerCase().includes('mist')
    );
    if (fogHours.length >= 2) {
      const fogStart = fogHours[0].time;
      const fogEnd = fogHours[fogHours.length - 1].time;
      context.contextNotes.push(`Marine layer ${fogStart}-${fogEnd}`);
    }

    // Heat advisory
    const hotHours = relevantHourly.filter(h => (h.temp ?? 0) >= 32);  // ~90°F
    if (hotHours.length >= 2) {
      context.contextNotes.push(`Heat peak ${hotHours[0].time}-${hotHours[hotHours.length - 1].time}`);
    }

    // Feels-like delta - when significantly different
    if (current?.feels_like && current?.temp && Math.abs(current.temp - current.feels_like) >= 3) {  // ~5°F
      const delta = current.feels_like - current.temp;
      context.contextNotes.push(`Feels ${delta > 0 ? 'warmer' : 'cooler'} (${Math.abs(Math.round(delta))}° diff)`);
    }

    // Limit to top 5 and join
    const finalContextNotes: string = context.contextNotes.slice(0, 5).join(' • ');

    return {
      dailyInfo: context.dailyInfo,
      hourlyData: context.hourlyData,
      contextNotes: finalContextNotes,
    };
  }

  getTimeContext(): TimeContext {
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
}

export { LLMService };
