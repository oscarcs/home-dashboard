const axios = require('axios');
const { BaseService } = require('../lib/BaseService');

/**
 * LLM Service (AI Insights) - OPTIONAL
 * Currently supports Anthropic Claude, but designed to be provider-agnostic
 */
class LLMService extends BaseService {

  constructor(cacheTTLMinutes = 90) {
    super({
      name: 'LLM',
      cacheKey: 'llm',
      cacheTTL: cacheTTLMinutes * 60 * 1000,
      retryAttempts: 3,
      retryCooldown: 300,
    });
  }

  isEnabled() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    return !!apiKey;
  }
  
  async fetchData(config, logger) {
    
  }

  mapToDashboard(apiData, config) {
    return {
      clothing_suggestion: apiData.clothing_suggestion,
      daily_summary: apiData.daily_summary,
      _meta: apiData._meta,
    };
  }

  /**
   * Get current cached cost information
   * @returns {Object|null} Cost info or null if no cache
   */
  getCostInfo() {
    const cached = this.getCache(true); // Allow stale
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

  buildPrompt({ current, forecast, hourlyForecast, location, timezone, sun, moon, air_quality }) {
    const timeContext = this.getTimeContext();
    const tz = timezone || 'America/Los_Angeles';

    // Determine scope
    // Note: forecast[0] is always the "next full day"
    // During daytime: forecast[0] = today, during nighttime: forecast[0] = tomorrow
    const isNight = timeContext.period === 'night';
    const hoursToShow = timeContext.period === 'morning' ? 8 : 6;
    const relevantHourly = isNight ? hourlyForecast : hourlyForecast.slice(0, hoursToShow);
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

CURRENT WEATHER: ${current?.temp_f}°F, ${current?.description}
${weatherContext.dailyInfo}

HOURLY FORECAST:
${weatherContext.hourlyData}${weatherContext.contextNotes ? '\n\nNOTES: ' + weatherContext.contextNotes : ''}`;

    return { systemPrompt, userMessage };
  }

  buildWeatherContext({ current, relevantForecast, relevantHourly, isNight, moon, air_quality, timeContext }) {
    const context = { contextNotes: [] };

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
      .map(h => `${h.time}: ${h.temp_f}° ${h.condition.trim()}${h.rain_chance > 0 ? ` (${h.rain_chance}%)` : ''}`)
      .join('\n');

    // Temperature swing
    const temps = relevantHourly.map(h => h.temp_f);
    const tempRange = Math.max(...temps) - Math.min(...temps);
    if (tempRange >= 15) {
      context.contextNotes.push(`${tempRange}° temperature swing`);
    }

    // Wind
    const maxWind = Math.max(...relevantHourly.map(h => h.wind_mph || 0));
    if (maxWind >= 12) {
      context.contextNotes.push(`Windy, gusts ${maxWind} mph`);
    }

    // Humidity extremes
    const humidity = current?.humidity;
    if (humidity >= 80) {
      context.contextNotes.push(`Humid (${humidity}%, muggy feel)`);
    } else if (humidity <= 30) {
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
      if (moon.phase === 'full' || moon.illumination >= 95) {
        context.contextNotes.push('Full moon (bright night)');
      } else if (moon.phase === 'new' || moon.illumination <= 5) {
        context.contextNotes.push('New moon');
      } else if (moon.illumination >= 50 && moon.direction === 'waxing') {
        context.contextNotes.push(`Bright ${moon.phase.replace('_', ' ')} moon`);
      }
    }

    // Air quality
    if (air_quality?.aqi > 100) {
      context.contextNotes.push(`AQI ${air_quality.aqi} (${air_quality.category})`);
    }

    // Special conditions - enhanced
    const fogHours = relevantHourly.filter(h => 
      h.condition.toLowerCase().includes('fog') || h.condition.toLowerCase().includes('mist')
    );
    if (fogHours.length >= 2) {
      const fogStart = fogHours[0].time;
      const fogEnd = fogHours[fogHours.length-1].time;
      context.contextNotes.push(`Marine layer ${fogStart}-${fogEnd}`);
    }

    // Heat advisory
    const hotHours = relevantHourly.filter(h => h.temp_f >= 90);
    if (hotHours.length >= 2) {
      context.contextNotes.push(`Heat peak ${hotHours[0].time}-${hotHours[hotHours.length-1].time}`);
    }

    // Feels-like delta - when significantly different
    if (current?.feels_like_f && Math.abs(current.temp_f - current.feels_like_f) >= 5) {
      const delta = current.feels_like_f - current.temp_f;
      context.contextNotes.push(`Feels ${delta > 0 ? 'warmer' : 'cooler'} (${Math.abs(delta)}° diff)`);
    }

    // Limit to top 5
    context.contextNotes = context.contextNotes.slice(0, 5).join(' • ');
    return context;
  }

  getTimeContext() {
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

module.exports = { LLMService };
