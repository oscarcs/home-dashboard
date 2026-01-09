/**
 * Weather utility functions shared across weather services
 */

import type { CurrentWeather, ForecastDay, HourlyForecast, Units } from './types';

interface IconAndDescription {
  icon: string;
  description: string;
}

interface WeatherDataForStatic {
  current?: Partial<CurrentWeather> & {
    temp?: number;
    description?: string;
  };
  forecast?: Array<Partial<ForecastDay> & {
    high?: number;
    low?: number;
    rain_chance?: number;
  }>;
  hourlyForecast?: Array<Partial<HourlyForecast> & {
    temp?: number;
    rain_chance?: number;
  }>;
  units?: Units;
}

interface TimeContext {
  period: 'morning' | 'afternoon' | 'evening' | 'night';
}

interface Thresholds {
  coldMorning: number;
  warmMorning: number;
  warmAfternoon: number;
  hotAfternoon: number;
  coolAfternoon: number;
  coolEvening: number;
  coldNight: number;
  warmNight: number;
  hotNight: number;
  extremeHeat: number;
  bigSwing: number;
  largeWarmup: number;
  largeDrop: number;
  rainChance: number;
}

interface SummaryParams {
  currentTemp: number;
  highTemp: number;
  lowTemp: number;
  condition: string;
  isRainy: boolean;
  hasBigSwing: boolean;
  tempRange: number;
  thresholds: Thresholds;
}

interface AfternoonSummaryParams {
  currentTemp: number;
  highTemp: number;
  lowTemp: number;
  condition: string;
  isRainy: boolean;
  thresholds: Thresholds;
}

interface EveningSummaryParams {
  currentTemp: number;
  lowTemp: number;
  condition: string;
  isRainy: boolean;
  thresholds: Thresholds;
}

interface NightSummaryParams {
  tomorrowHigh: number;
  tomorrowLow: number;
  condition: string;
  isRainy: boolean;
  thresholds: Thresholds;
}

interface SummaryResult {
  summary: string;
}

interface StaticDescription {
  daily_summary: string;
}

/**
 * Map weather condition text to icon and description
 * This function analyzes weather condition text and returns a standardized
 * icon code and description that can be used across the application.
 *
 * @param conditionText - Weather condition text from API
 * @returns Object with icon code and description
 *
 * @example
 * mapIconAndDescription('Partly Cloudy')
 * // Returns: { icon: 'partly_cloudy', description: 'Partly Cloudy' }
 */
export function mapIconAndDescription(conditionText: string = ''): IconAndDescription {
  const text = String(conditionText).toLowerCase();

  // Thunderstorms and severe weather
  if (/(thunder|storm)/.test(text)) {
    return { icon: 'stormy', description: conditionText || 'Stormy' };
  }

  // Snow and winter precipitation
  if (/(snow|sleet|blizzard)/.test(text)) {
    return { icon: 'snow', description: conditionText || 'Snow' };
  }

  // Rain and precipitation
  if (/(rain|drizzle|showers)/.test(text)) {
    return { icon: 'rain', description: conditionText || 'Rain' };
  }

  // Fog and mist
  if (/(fog|mist|haze|smoke)/.test(text)) {
    return { icon: 'fog', description: conditionText || 'Fog' };
  }

  // Partly cloudy (must check before fully cloudy)
  if (/(partly|mostly)\s*(cloudy|sunny)/.test(text)) {
    return { icon: 'partly_cloudy', description: conditionText || 'Partly Cloudy' };
  }

  // Cloudy and overcast
  if (/(overcast|cloud)/.test(text)) {
    return { icon: 'cloudy', description: conditionText || 'Cloudy' };
  }

  // Clear and sunny (default)
  if (/(clear|sunny|fair)/.test(text)) {
    return { icon: 'sunny', description: conditionText || 'Clear' };
  }

  // Default fallback
  return { icon: 'sunny', description: conditionText || 'Clear' };
}

/**
 * Convert wind direction degrees to cardinal direction text
 *
 * @param degrees - Wind direction in degrees (0-360)
 * @returns Cardinal direction (e.g., 'N', 'NE', 'SSW')
 *
 * @example
 * getWindDirection(45)
 * // Returns: 'NE'
 */
export function getWindDirection(degrees: number): string {
  const directions = [
    'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
    'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'
  ];
  const index = Math.round(degrees / 22.5) % 16;
  return directions[index];
}

/**
 * Build static weather description as fallback when LLM service is unavailable
 * Generates time-aware descriptions with similar vibe to LLM service
 *
 * @param weatherData - Weather data object
 */
export function buildStaticDescription(weatherData: WeatherDataForStatic): StaticDescription {
  const hour = new Date().getHours();
  const timeContext = getTimeContext(hour);

  const thresholds = deriveThresholds();

  const current = weatherData.current || {};
  const hourlyForecast = weatherData.hourlyForecast || [];

  const todayForecast = weatherData.forecast?.[0] || {};
  const tomorrowForecast = weatherData.forecast?.[1] || {};

  const currentTemp = current.temp ?? 20;
  const highTemp = todayForecast.high ?? 20;
  const lowTemp = todayForecast.low ?? 15;
  const condition = (current.description || 'Clear').toLowerCase();

  const maxRainChance = Math.max(
    todayForecast.rain_chance || 0,
    ...hourlyForecast.slice(0, 6).map(h => h.rain_chance || 0)
  );
  const isRainy = maxRainChance > thresholds.rainChance || /rain|shower|drizzle/.test(condition);

  const hourlyTemps = hourlyForecast
    .slice(0, 8)
    .map(h => h.temp ?? 20);
  const tempRange = hourlyTemps.length > 0
    ? Math.max(...hourlyTemps) - Math.min(...hourlyTemps)
    : highTemp - lowTemp;

  const hasBigSwing = tempRange >= thresholds.bigSwing;

  let summary: string;

  if (timeContext.period === 'morning') {
    ({ summary } = buildMorningSummary({
      currentTemp,
      highTemp,
      lowTemp,
      condition,
      isRainy,
      hasBigSwing,
      tempRange,
      thresholds,
    }));
  } else if (timeContext.period === 'afternoon') {
    ({ summary } = buildAfternoonSummary({
      currentTemp,
      highTemp,
      lowTemp,
      condition,
      isRainy,
      thresholds,
    }));
  } else if (timeContext.period === 'evening') {
    ({ summary } = buildEveningSummary({
      currentTemp,
      lowTemp,
      condition,
      isRainy,
      thresholds,
    }));
  } else {
    const tomorrowHigh = tomorrowForecast.high ?? 20;
    const tomorrowLow = tomorrowForecast.low ?? 15;
    ({ summary } = buildNightSummary({
      tomorrowHigh,
      tomorrowLow,
      condition,
      isRainy,
      thresholds,
    }));
  }

  return {
    daily_summary: summary,
  };
}

function getTimeContext(hour: number): TimeContext {
  if (hour >= 5 && hour < 11) {
    return { period: 'morning' };
  } else if (hour >= 11 && hour < 16) {
    return { period: 'afternoon' };
  } else if (hour >= 16 && hour < 20) {
    return { period: 'evening' };
  } else {
    return { period: 'night' };
  }
}

function buildMorningSummary({ currentTemp, highTemp, condition, isRainy, hasBigSwing, tempRange, thresholds }: SummaryParams): SummaryResult {
  const isCold = currentTemp < thresholds.coldMorning;
  const isWarm = currentTemp >= thresholds.warmMorning;
  const willWarmUp = highTemp - currentTemp >= thresholds.largeWarmup;

  let summary: string;

  if (isRainy) {
    if (isCold) {
      summary = "Chilly and rainy morning, staying wet and cool throughout the day";
    } else {
      summary = "Rainy start continuing through the day, stay dry and cozy inside";
    }
  } else if (hasBigSwing && willWarmUp) {
    if (/fog|mist/.test(condition)) {
      summary = "Cool and foggy this morning, clearing to warmer skies by afternoon";
    } else {
      summary = `Cool start warming up fast, pleasant ${Math.round(tempRange)}° swing by afternoon`;
    }
  } else if (isCold) {
    if (/cloud|overcast/.test(condition)) {
      summary = "Chilly and cloudy morning, staying fairly cool throughout the day";
    } else {
      summary = "Crisp cool morning, staying on the cooler side all day long";
    }
  } else if (isWarm) {
    if (highTemp >= thresholds.extremeHeat) {
      summary = "Extreme heat warning today, temperatures soaring to dangerous levels";
    } else {
      summary = "Warm start to a beautiful day, staying sunny and pleasant throughout";
    }
  } else {
    if (/cloud/.test(condition)) {
      summary = "Mild and cloudy morning, comfortable temperatures all day long";
    } else {
      summary = "Pleasant morning with comfortable temps, nice conditions all day";
    }
  }

  return { summary };
}

function buildAfternoonSummary({ currentTemp, condition, isRainy, thresholds }: AfternoonSummaryParams): SummaryResult {
  const isHot = currentTemp >= thresholds.hotAfternoon;
  const isWarm = currentTemp >= thresholds.warmAfternoon;
  const isCool = currentTemp < thresholds.coolAfternoon;

  let summary: string;

  if (isRainy) {
    summary = "Rainy afternoon continuing into evening, staying wet and overcast";
  } else if (isHot) {
    if (currentTemp >= thresholds.extremeHeat) {
      summary = "Extreme heat alert this afternoon, stay hydrated and keep in the shade";
    } else {
      summary = "Hot afternoon continuing, staying warm as we head into the evening";
    }
  } else if (isWarm) {
    if (/clear|sunny/.test(condition)) {
      summary = "Beautiful sunny afternoon, staying pleasant as the day winds down";
    } else {
      summary = "Mild and comfortable afternoon, nice conditions into the evening";
    }
  } else if (isCool) {
    summary = "Cool and comfortable afternoon, staying on the cooler side tonight";
  } else {
    summary = "Pleasant afternoon temperatures, comfortable conditions into evening";
  }

  return { summary };
}

function buildEveningSummary({ currentTemp, lowTemp, condition, isRainy, thresholds }: EveningSummaryParams): SummaryResult {
  const isCool = currentTemp < thresholds.coolEvening;
  const willCoolDown = currentTemp - lowTemp >= thresholds.largeDrop;

  let summary: string;

  if (isRainy) {
    summary = "Rainy evening ahead, staying wet and cool as the night sets in";
  } else if (willCoolDown) {
    if (isCool) {
      summary = "Cool evening getting chillier, bundle up as temperatures drop tonight";
    } else {
      summary = "Mild now but cooling down, grab a jacket as the evening progresses";
    }
  } else if (isCool) {
    if (/clear/.test(condition)) {
      summary = "Cool and clear evening, staying crisp with nice skies through tonight";
    } else {
      summary = "Cool evening settling in, staying on the chilly side through the night";
    }
  } else {
    if (/clear/.test(condition)) {
      summary = "Pleasant evening with clear skies, comfortable conditions tonight";
    } else {
      summary = "Mild and comfortable evening, nice conditions as the night sets in";
    }
  }

  return { summary };
}

function buildNightSummary({ tomorrowHigh, tomorrowLow, condition, isRainy, thresholds }: NightSummaryParams): SummaryResult {
  const willBeCold = tomorrowLow < thresholds.coldNight;
  const willBeHot = tomorrowHigh >= thresholds.hotNight;
  const willBeWarm = tomorrowHigh >= thresholds.warmNight;

  let summary: string;

  if (isRainy) {
    if (willBeCold) {
      summary = "Tomorrow rainy and cool, expect wet conditions and chilly temperatures";
    } else {
      summary = "Tomorrow bringing rain and clouds, stay dry with umbrella and layers";
    }
  } else if (willBeHot) {
    if (tomorrowHigh >= thresholds.extremeHeat) {
      summary = "Dangerously hot tomorrow, prepare for extreme heat and stay inside";
    } else {
      summary = "Tomorrow heating up nicely, expect warm sunny skies and hot temperatures";
    }
  } else if (willBeWarm) {
    if (/fog|mist/.test(condition)) {
      summary = "Tomorrow foggy start clearing out, warming to pleasant afternoon temps";
    } else {
      summary = "Tomorrow pleasant and mild, comfortable temperatures throughout the day";
    }
  } else if (willBeCold) {
    if (/cloud/.test(condition)) {
      summary = "Tomorrow cool and cloudy, staying on the chilly side all day long";
    } else {
      summary = "Tomorrow crisp and cool, bundle up for chilly temperatures ahead";
    }
  } else {
    summary = "Tomorrow comfortable and mild, nice conditions throughout the day ahead";
  }

  return { summary };
}

function deriveThresholds(): Thresholds {
  return {
    coldMorning: 10,
    warmMorning: 21,
    warmAfternoon: 21,
    hotAfternoon: 29,
    coolAfternoon: 15,
    coolEvening: 15,
    coldNight: 10,
    warmNight: 21,
    hotNight: 29,
    extremeHeat: 38,
    bigSwing: 8,
    largeWarmup: 7,
    largeDrop: 6,
    rainChance: 40,
  };
}
