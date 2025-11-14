const { WeatherService } = require('../services/weatherService');
const { AmbientService } = require('../services/ambientService');
const { LLMService } = require('../services/llmService');
const { VehiclesService } = require('../services/vehicleService');
const { CalendarService } = require('../services/calendarService');
const { getStateKey, setStateKey } = require('./state');
const { buildStaticDescription, getWindDirection } = require('./weatherUtils');

/**
 * Build complete dashboard data from all available services
 * Services fail gracefully - only WeatherAPI is required
 * 
 * @param {Object} req - Express request object (for baseUrl)
 * @param {Object} logger - Logger instance
 * @returns {Promise<Object>} Complete dashboard data model
 */
async function buildDashboardData(req, logger = console) {
  const now = new Date();
  const formatTime = (date) => date.toISOString();

  // Initialize all services (each service defines its own cache TTL)
  const weatherService = new WeatherService();
  const ambientService = new AmbientService();
  const llmService = new LLMService();
  const vehiclesService = new VehiclesService();
  const calendarService = new CalendarService();

  // Fetch weather data (REQUIRED)
  let weatherData;
  let weatherStatus;
  try {
    const result = await weatherService.getData({}, logger);
    weatherData = result.data;
    weatherStatus = result.status;
  } catch (error) {
    logger.error?.('[DataBuilder] Weather service failed (REQUIRED):', error.message);
    throw new Error(`Weather API unavailable: ${error.message}`);
  }

  // Fetch ambient data (OPTIONAL - overrides weather current conditions)
  let ambientData = null;
  let ambientStatus;
  try {
    const result = await ambientService.getData({}, logger);
    ambientData = result.data;
    ambientStatus = result.status;
  } catch (error) {
    logger.info?.('[DataBuilder] Ambient service unavailable (optional):', error.message);
    ambientStatus = ambientService.getStatus();
  }

  // Build current conditions
  // Use ambient sensor data if available, otherwise fall back to Visual Crossing
  // Always use WeatherAPI for condition/icon
  const mainLocation = weatherData.locations[0] || {};
  const unitSystem = weatherData.units?.system || 'us';

  const fallbackWindDirection = (dir) => getWindDirection(dir || 0);

  const current = ambientData ? buildCurrentFromAmbient(ambientData, mainLocation, unitSystem, fallbackWindDirection) : buildCurrentFromWeather(mainLocation, unitSystem, fallbackWindDirection);

  // Use Ambient precipitation if available, otherwise WeatherAPI
  const precipitation = normalizePrecipitationData(ambientData?.precipitation, weatherData.precipitation, unitSystem);

  // Fetch vehicles (OPTIONAL)
  let vehicles = [];
  let vehiclesStatus;
  try {
    const result = await vehiclesService.getData({}, logger);
    vehicles = result.data || [];
    vehiclesStatus = result.status;
  } catch (error) {
    logger.info?.('[DataBuilder] Vehicles service unavailable (optional):', error.message);
    vehiclesStatus = vehiclesService.getStatus();
  }

  // Fetch calendar (OPTIONAL)
  let calendar_events = [];
  let calendarStatus;
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
    logger.info?.('[DataBuilder] Calendar service unavailable (optional):', error.message);
    calendarStatus = calendarService.getStatus();
  }

  // Compute temperature comparison (today's high vs yesterday's high)
  const todayForecast = weatherData.locations[0]?.forecast?.[0];
  const todayHigh = unitSystem === 'metric' ? todayForecast?.high_c : todayForecast?.high_f;
  const tempComparison = computeTempComparison(todayHigh, unitSystem);

  // Build base data model
  const data = {
    current_temp: current.temp,
    current_temp_f: current.temp_f,
    current_temp_c: current.temp_c,
    feels_like: current.feels_like,
    feels_like_f: current.feels_like_f,
    feels_like_c: current.feels_like_c,
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
    pressure_in: current.pressure_in,
    pressure_hpa: current.pressure_hpa,
    air_quality: weatherData.air_quality,
    precipitation,
    calendar_events,
    vehicles,
    last_updated: formatTime(now),
    units: weatherData.units,
  };

  // Fetch LLM insights (OPTIONAL - enriches clothing suggestion and adds daily summary)
  let llmStatus;
  let hasValidInsights = false;
  
  try {
    const llmConfig = {
      input: {
  current,
        forecast: data.forecast,
        hourlyForecast: data.hourlyForecast,
        calendar: data.calendar_events,
        location: data.locations[0],
        timezone: weatherData.timezone,
        sun: data.sun,
        moon: data.moon,
        air_quality: data.air_quality,
        units: data.units,
      },
    };
    const result = await llmService.getData(llmConfig, logger);
    const insights = result.data;
    llmStatus = result.status;

    // Check if we got valid insights from LLM
    if (insights && insights.daily_summary && insights.daily_summary.trim().length > 0) {
      data.clothing_suggestion = insights.clothing_suggestion;
      data.daily_summary = insights.daily_summary.trim();
      data.llm_source = result.source;
      hasValidInsights = true;
    }
  } catch (error) {
    logger.info?.('[DataBuilder] LLM service error (optional):', error.message);
    llmStatus = llmService.getStatus();
  }
  
  // If no valid insights (disabled, error, or invalid response), try fallbacks
  if (!hasValidInsights) {
    let usedCache = false;
    
    // Try to use stale cache for LLM
    try {
      const staleCache = llmService.getCache(true); // true = allow stale
      if (staleCache && staleCache.daily_summary) {
        data.daily_summary = staleCache.daily_summary.trim();
        if (staleCache.clothing_suggestion) {
          data.clothing_suggestion = staleCache.clothing_suggestion.trim();
        }
        data.llm_source = 'stale_cache';
        usedCache = true;
        logger.info?.('[DataBuilder] Using stale LLM cache');
      }
    } catch (_) {}
    
    // If no cache available, use static description fallback
    if (!usedCache) {
      logger.info?.('[DataBuilder] Using static description fallback');
      const staticDescription = buildStaticDescription({
        current,
        forecast: data.forecast,
        hourlyForecast: data.hourlyForecast,
        units: data.units,
      });
      data.clothing_suggestion = staticDescription.clothing_suggestion;
      data.daily_summary = staticDescription.daily_summary;
      data.llm_source = 'static_fallback';
    }
  }

  // Attach service statuses for admin panel
  data._serviceStatuses = {
    weather: weatherStatus,
    ambient: ambientStatus,
    llm: llmStatus,
    vehicles: vehiclesStatus,
    calendar: calendarStatus,
  };

  return data;
}

/**
 * Get base URL from request
 * @param {Object} req - Express request object
 * @returns {string} Base URL
 */
function getBaseUrl(req) {
  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0];
  const host = req.get('host');
  return `${proto}://${host}`;
}

/**
 * Get service statuses for admin panel
 * Instantiates services to read their TTL configs, then reads status from state
 * @returns {Object} All service statuses
 */
function getServiceStatuses() {
  const { getStateKey } = require('./state');
  
  // Instantiate services to get their TTL values
  const weatherService = new WeatherService();
  const ambientService = new AmbientService();
  const llmService = new LLMService();
  const vehiclesService = new VehiclesService();
  const calendarService = new CalendarService();
  
  // Service definitions
  const serviceConfigs = {
    weather: { service: weatherService },
    ambient: { service: ambientService },
    llm: { service: llmService },
    vehicles: { service: vehiclesService },
    calendar: { service: calendarService },
  };
  
  const allStatuses = getStateKey('service_status', {});
  const allCaches = getStateKey('service_cache', {});
  
  const statuses = {};
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
 * @param {number} todayHigh - Today's forecast high temperature
 * @returns {string|null} Comparison string or null if no yesterday data
 */
function computeTempComparison(todayHigh, unitSystem = 'us') {
  if (todayHigh == null) return null;
  
  // Use local dates, not UTC (important for timezone-aware comparison)
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  
  // Get yesterday's date
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
  
  // Get daily highs history keyed by unit system
  const storedHighs = getStateKey('daily_highs', {});
  const unitKey = unitSystem === 'metric' ? 'metric' : 'us';
  const dailyHighs = storedHighs[unitKey] || {};

  // Store today's high if not already stored for today
  if (!dailyHighs[todayStr]) {
    dailyHighs[todayStr] = todayHigh;
    
    // Keep only last 3 days
    const allDates = Object.keys(dailyHighs).sort().reverse();
    const recentDates = allDates.slice(0, 3);
    const trimmedHighs = {};
    recentDates.forEach(date => {
      trimmedHighs[date] = dailyHighs[date];
    });
    
    const nextState = { ...storedHighs, [unitKey]: trimmedHighs };
    setStateKey('daily_highs', nextState);
    return null; // Need a previous value to compare; return on first store
  }
  
  // Compare with yesterday's high if available
  const yesterdayHigh = dailyHighs[yesterdayStr];
  if (yesterdayHigh == null) return null; // No comparison available
  
  const diff = Number(todayHigh) - Number(yesterdayHigh);
  
  // Determine comparison based on temperature difference
  const threshold = unitSystem === 'metric' ? 0.5 : 1;
  const strongThreshold = unitSystem === 'metric' ? 5.5 : 10; // ~10°F ≈ 5.5°C
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

function buildCurrentFromAmbient(ambient, mainLocation, unitSystem, windDirectionFallback) {
  if (!ambient) return buildCurrentFromWeather(mainLocation, unitSystem, windDirectionFallback);

  const temp = unitSystem === 'metric' ? ambient.current_temp_c : ambient.current_temp_f;
  const tempF = ambient.current_temp_f ?? ambient.current_temp ?? null;
  const tempC = ambient.current_temp_c ?? (tempF != null ? convertFtoC(tempF) : null);

  const feels = unitSystem === 'metric' ? ambient.feels_like_c : ambient.feels_like_f;
  const feelsF = ambient.feels_like_f ?? ambient.feels_like ?? null;
  const feelsC = ambient.feels_like_c ?? (feelsF != null ? convertFtoC(feelsF) : null);

  const pressureIn = ambient.pressure_in ?? ambient.pressure ?? null;
  const pressureHpa = ambient.pressure_hpa ?? (pressureIn != null ? convertInHgToHpa(pressureIn) : null);
  const pressure = unitSystem === 'metric' ? pressureHpa : pressureIn;

  const windSpeedMph = ambient.wind?.speed_mph ?? null;
  const windSpeedKmh = ambient.wind?.speed_kmh ?? (windSpeedMph != null ? windSpeedMph * 1.60934 : null);
  const windSpeed = unitSystem === 'metric' ? windSpeedKmh : windSpeedMph;
  const windDirection = ambient.wind?.direction || windDirectionFallback(mainLocation.wind_dir);

  return {
    temp: roundValue(temp),
    temp_f: roundValue(tempF),
    temp_c: roundValue(tempC),
    feels_like: roundValue(feels),
    feels_like_f: roundValue(feelsF),
    feels_like_c: roundValue(feelsC),
    humidity: ambient.humidity ?? mainLocation.humidity ?? 0,
    pressure: pressure != null ? roundValue(pressure, unitSystem === 'metric' ? 0 : 2) : null,
    pressure_in: pressureIn != null ? roundValue(pressureIn, 2) : null,
    pressure_hpa: pressureHpa != null ? Math.round(pressureHpa) : null,
    weather_icon: mainLocation.icon || 'sunny',
    description: mainLocation.condition || 'Clear',
    wind: {
      speed: windSpeed != null ? roundValue(windSpeed, 1) : null,
      speed_mph: windSpeedMph != null ? roundValue(windSpeedMph, 1) : null,
      speed_kmh: windSpeedKmh != null ? roundValue(windSpeedKmh, 1) : null,
      direction: windDirection,
    },
  };
}

function buildCurrentFromWeather(location, unitSystem, windDirectionFallback) {
  const temp = unitSystem === 'metric' ? location.current_temp_c : location.current_temp_f;
  const feels = unitSystem === 'metric'
    ? (location.feels_like_c != null ? location.feels_like_c : location.current_temp_c)
    : (location.feels_like_f != null ? location.feels_like_f : location.current_temp_f);
  const windSpeedMph = location.wind_mph ?? null;
  const windSpeedKmh = location.wind_kmh ?? (windSpeedMph != null ? windSpeedMph * 1.60934 : null);
  const windSpeed = unitSystem === 'metric' ? windSpeedKmh : windSpeedMph;
  const pressureIn = location.pressure_in ?? null;
  const pressureHpa = location.pressure_hpa ?? (pressureIn != null ? convertInHgToHpa(pressureIn) : null);
  const pressure = unitSystem === 'metric' ? pressureHpa : pressureIn;

  return {
    temp: roundValue(temp),
    temp_f: location.current_temp_f != null ? roundValue(location.current_temp_f) : null,
    temp_c: location.current_temp_c != null ? roundValue(location.current_temp_c) : null,
  feels_like: roundValue(feels),
  feels_like_f: location.feels_like_f != null ? roundValue(location.feels_like_f) : (location.current_temp_f != null ? roundValue(location.current_temp_f) : null),
  feels_like_c: location.feels_like_c != null ? roundValue(location.feels_like_c) : (location.current_temp_c != null ? roundValue(location.current_temp_c) : null),
    humidity: location.humidity || 0,
    pressure: pressure != null ? roundValue(pressure, unitSystem === 'metric' ? 0 : 2) : null,
    pressure_in: pressureIn != null ? roundValue(pressureIn, 2) : null,
    pressure_hpa: pressureHpa != null ? Math.round(pressureHpa) : null,
    weather_icon: location.icon || 'sunny',
    description: location.condition || 'Clear',
    wind: {
      speed: windSpeed != null ? roundValue(windSpeed, 1) : null,
      speed_mph: windSpeedMph != null ? roundValue(windSpeedMph, 1) : null,
      speed_kmh: windSpeedKmh != null ? roundValue(windSpeedKmh, 1) : null,
      direction: windDirectionFallback(location.wind_dir),
    },
  };
}

function normalizePrecipitationData(ambientPrecip, weatherPrecip = {}, unitSystem) {
  const source = ambientPrecip || weatherPrecip || {};
  const units = unitSystem === 'metric' ? 'mm' : 'in';

  const last24In = resolvePrecipValue(source.last_24h_in, source.last_24h_mm, source.last_24h, source.units, 'in');
  const last24Mm = resolvePrecipValue(source.last_24h_mm, source.last_24h_in, source.last_24h, source.units, 'mm');

  const weekIn = resolvePrecipValue(source.week_total_in, source.week_total_mm, source.week_total, source.units, 'in');
  const weekMm = resolvePrecipValue(source.week_total_mm, source.week_total_in, source.week_total, source.units, 'mm');

  const monthIn = resolvePrecipValue(source.month_total_in, source.month_total_mm, source.month_total, source.units, 'in');
  const monthMm = resolvePrecipValue(source.month_total_mm, source.month_total_in, source.month_total, source.units, 'mm');

  const yearIn = resolvePrecipValue(source.year_total_in, source.year_total_mm, source.year_total, source.units, 'in');
  const yearMm = resolvePrecipValue(source.year_total_mm, source.year_total_in, source.year_total, source.units, 'mm');

  const formatValue = (value) => (value == null ? null : Number(value.toFixed(2)));

  const last24Display = formatValue(units === 'mm' ? last24Mm : last24In);
  const last24InDisplay = formatValue(last24In);
  const last24MmDisplay = formatValue(last24Mm);

  const weekDisplay = formatValue(units === 'mm' ? weekMm : weekIn);
  const weekInDisplay = formatValue(weekIn);
  const weekMmDisplay = formatValue(weekMm);

  const monthDisplay = formatValue(units === 'mm' ? monthMm : monthIn);
  const monthInDisplay = formatValue(monthIn);
  const monthMmDisplay = formatValue(monthMm);

  const yearDisplay = formatValue(units === 'mm' ? yearMm : yearIn);
  const yearInDisplay = formatValue(yearIn);
  const yearMmDisplay = formatValue(yearMm);

  return {
    last_24h: last24Display,
    last_24h_in: last24InDisplay,
    last_24h_mm: last24MmDisplay,
    week_total: weekDisplay,
    week_total_in: weekInDisplay,
    week_total_mm: weekMmDisplay,
    month_total: monthDisplay,
    month_total_in: monthInDisplay,
    month_total_mm: monthMmDisplay,
    year_total: yearDisplay,
    year_total_in: yearInDisplay,
    year_total_mm: yearMmDisplay,
    units,
  };
}

function roundValue(value, decimals = 0) {
  if (value == null || !Number.isFinite(Number(value))) return value;
  const factor = 10 ** decimals;
  return Math.round(Number(value) * factor) / factor;
}

function convertFtoC(value) {
  return (Number(value) - 32) * 5 / 9;
}

function convertInHgToHpa(value) {
  return Number(value) * 33.8638866667;
}

function resolvePrecipValue(primary, secondary, fallback, unitLabel, targetUnit) {
  const hasPrimary = primary != null;
  const hasSecondary = secondary != null;
  const hasFallback = fallback != null;

  if (!hasPrimary && !hasSecondary && !hasFallback) {
    return null;
  }

  if (hasPrimary) return Number(primary);
  if (hasSecondary) {
    if (targetUnit === 'in') return Number(secondary) / 25.4;
    if (targetUnit === 'mm') return Number(secondary) * 25.4;
  }
  if (hasFallback) {
    if (unitLabel === 'mm') {
      return targetUnit === 'mm' ? Number(fallback) : Number(fallback) / 25.4;
    }
    if (unitLabel === 'in') {
      return targetUnit === 'in' ? Number(fallback) : Number(fallback) * 25.4;
    }
    // Unknown unit; assume inches for backwards compatibility
    return targetUnit === 'mm' ? Number(fallback) * 25.4 : Number(fallback);
  }
  return null;
}

module.exports = {
  buildDashboardData,
  getServiceStatuses,
};
