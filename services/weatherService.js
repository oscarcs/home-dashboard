const axios = require('axios');
const { BaseService } = require('../lib/BaseService');
const { mapIconAndDescription } = require('../lib/weatherUtils');

/**
 * Weather API Service (Visual Crossing) - PRIMARY WEATHER DATA SOURCE
 * This is the only required service - all others are optional
 */
class WeatherService extends BaseService {
  constructor(cacheTTLMinutes = 30) {
    super({
      name: 'Visual Crossing Weather',
      cacheKey: 'weather',
      cacheTTL: cacheTTLMinutes * 60 * 1000,
      retryAttempts: 3,
      retryCooldown: 1000,
    });
    this.unitSystem = this.getUnitSystem();
  }

  getCacheSignature() {
    const locations = this.getConfiguredLocations();
    const unitSystem = this.getUnitSystem();

    // Keep instance unit system in sync with current configuration
    this.unitSystem = unitSystem;

    return JSON.stringify({
      unitSystem,
      locations,
    });
  }

  isEnabled() {
    const apiKey = process.env.VISUAL_CROSSING_API_KEY;
    return !!apiKey;
  }

  getUnitSystem() {
    const system = (process.env.WEATHER_UNIT_SYSTEM || '').trim().toLowerCase();
    return system === 'metric' ? 'metric' : 'us';
  }

  buildForecastUrl(apiKey, location, days = 7) {
    // Visual Crossing uses location/next{days}days format for forecast
    const url = new URL(`https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/${encodeURIComponent(location)}/next${days}days`);
    url.searchParams.set('key', apiKey);
    url.searchParams.set('unitGroup', this.unitSystem);
    url.searchParams.set('include', 'days,hours,current,alerts');
    // Include air quality elements: aqius (US EPA AQI) and pm2p5 (PM2.5)
    url.searchParams.set('elements', 'datetime,tempmax,tempmin,temp,feelslike,feelslikemax,feelslikemin,humidity,precip,precipprob,preciptype,snow,snowdepth,windspeed,winddir,pressure,cloudcover,visibility,solarradiation,solarenergy,uvindex,sunrise,sunset,moonphase,conditions,description,icon,severerisk,aqius,pm2p5');
    return url.toString();
  }

  async fetchData(config, logger) {
    const apiKey = process.env.VISUAL_CROSSING_API_KEY;
    if (!apiKey) throw new Error('VISUAL_CROSSING_API_KEY not configured');

  // Read configured locations from env
    const locations = this.getConfiguredLocations();

  if (locations.length === 0) throw new Error('No locations configured. Set MAIN_LOCATION.');

    const days = 7;
    
    // Fetch all locations in parallel
    const promises = locations.map(location => 
      this.fetchLocationData(apiKey, location, days, logger)
    );
    
    const results = await Promise.all(promises);
    return results;
  }

  getConfiguredLocations() {
    const mainLocation = (process.env.MAIN_LOCATION || '').trim();
    const additionalLocationsRaw = process.env.ADDITIONAL_LOCATIONS || '';

    const parsedAdditional = additionalLocationsRaw
      .split(/\r?\n|\|/)
      .map(l => l.trim())
      .filter(Boolean)
      .slice(0, 3);

    const locations = [];

    if (mainLocation) {
      locations.push(mainLocation);
    }

    locations.push(...parsedAdditional);

    return Array.from(new Set(locations));
  }

  async fetchLocationData(apiKey, location, days, logger) {
    const url = this.buildForecastUrl(apiKey, location, days);
    const resp = await axios.get(url, { timeout: 10000 });
    
    if (resp.status !== 200) {
      throw new Error(`Weather API returned status ${resp.status}`);
    }
    
    return { location, data: resp.data };
  }

  mapToDashboard(apiResults, config) {
    if (!Array.isArray(apiResults) || apiResults.length === 0) {
      throw new Error('No weather data available');
    }

    const unitSystem = this.unitSystem;

    // Extract timezone from first location for date parsing
    const locationTimezone = apiResults[0]?.data?.timezone || 'America/Los_Angeles';

    /**
     * Get day of week for a date string in the location's timezone
     * @param {string} dateStr - Date string in YYYY-MM-DD format
     * @returns {string} Day of week (e.g., 'Mon', 'Tue')
     */
    const getDayOfWeek = (dateStr) => {
      // Parse at noon to avoid timezone issues with midnight
      const date = new Date(dateStr + 'T12:00:00');
      return date.toLocaleDateString('en-US', { 
        weekday: 'short',
        timeZone: locationTimezone  // Use the location's timezone from Visual Crossing
      });
    };

    // Extract and transform data from raw API response
    const processedLocations = apiResults.map(({ location: originalQuery, data }) => {
      const forecastDays = data?.days || [];
      const current = data?.currentConditions || {};
      
      // Parse location from resolvedAddress
      // Visual Crossing returns "ZIP, Country" for ZIP queries, not city names
      const resolvedAddress = data?.resolvedAddress || '';
      
      const location = this.parseLocationMetadata(originalQuery, resolvedAddress, data?.timezone || locationTimezone);

      const temp = this.normalizeTemperature(current.temp);
      const feelsLike = this.normalizeTemperature(current.feelslike);
      const windspeed = this.normalizeWindSpeed(current.windspeed);
      const pressure = this.normalizePressure(current.pressure);
      
      const today = forecastDays[0];

      return {
        query: originalQuery,
        location,
        current: {
          temp_f: temp.f,
          temp_c: temp.c,
          feels_like_f: feelsLike.f,
          feels_like_c: feelsLike.c,
          humidity: current.humidity,
          pressure_in: pressure.inHg,
          pressure_hpa: pressure.hPa,
          wind_mph: windspeed.mph,
          wind_kmh: windspeed.kmh,
          wind_dir: current.winddir,
          condition: current.conditions,
          pm2_5: current.pm2p5, // PM2.5 particulate matter
          aqi: current.aqius, // US EPA Air Quality Index
        },
        forecast: forecastDays.map(day => {
          const high = this.normalizeTemperature(day.tempmax);
          const low = this.normalizeTemperature(day.tempmin);
          const precip = this.normalizePrecipitation(day.precip);

          return {
            date: day.datetime,
            day_of_week: getDayOfWeek(day.datetime),
            high_f: high.f,
            high_c: high.c,
            low_f: low.f,
            low_c: low.c,
            condition: day.conditions,
            rain_chance: day.precipprob,
            precip_in: precip.in,
            precip_mm: precip.mm,
            avghumidity: day.humidity,
            hour: (day.hours || []).map(h => ({
              time: h.datetime,
              temp_f: this.normalizeTemperature(h.temp).f,
              temp_c: this.normalizeTemperature(h.temp).c,
              condition: h.conditions,
              rain_chance: h.precipprob,
              wind_mph: this.normalizeWindSpeed(h.windspeed).mph,
              wind_kmh: this.normalizeWindSpeed(h.windspeed).kmh,
            })),
          };
        }),
        astro: {
          sunrise: this.formatTime12Hour(today?.sunrise),
          sunset: this.formatTime12Hour(today?.sunset),
          moon_phase: this.convertMoonPhase(today?.moonphase),
          moon_illumination: this.calculateMoonIllumination(today?.moonphase),
        },
      };
    });

    const mainLocation = processedLocations[0];

    // Map locations for dashboard
    const locations = processedLocations.map(loc => {
      const today = loc.forecast[0];
      // Use current actual conditions, not forecast
      const { icon } = mapIconAndDescription(loc.current.condition || '');
      const condition = loc.current.condition || 'Clear';
      const currentTemp = this.unitSystem === 'metric' ? loc.current.temp_c : loc.current.temp_f;
      const highTemp = this.unitSystem === 'metric' ? today?.high_c : today?.high_f;
      const lowTemp = this.unitSystem === 'metric' ? today?.low_c : today?.low_f;
      const windSpeed = this.unitSystem === 'metric' ? loc.current.wind_kmh : loc.current.wind_mph;
      const pressure = this.unitSystem === 'metric' ? loc.current.pressure_hpa : loc.current.pressure_in;
      
      return {
        name: loc.location.name,
        region: loc.location.region,
        country: loc.location.country,
        query: loc.query,
        current_temp: Math.round(Number(currentTemp || 0)),
        current_temp_f: Math.round(Number(loc.current.temp_f || 0)),
        current_temp_c: Math.round(Number(loc.current.temp_c || 0)),
        feels_like: Math.round(Number((this.unitSystem === 'metric' ? loc.current.feels_like_c : loc.current.feels_like_f) || currentTemp || 0)),
        feels_like_f: Math.round(Number(loc.current.feels_like_f || loc.current.temp_f || 0)),
        feels_like_c: Math.round(Number(loc.current.feels_like_c || loc.current.temp_c || 0)),
        high: Math.round(Number(highTemp || 0)),
        high_f: Math.round(Number(today?.high_f || 0)),
        high_c: Math.round(Number(today?.high_c || 0)),
        low: Math.round(Number(lowTemp || 0)),
        low_f: Math.round(Number(today?.low_f || 0)),
        low_c: Math.round(Number(today?.low_c || 0)),
        icon,
        condition,
        rain_chance: Number(today?.rain_chance || 0),
        // Current conditions data (used as fallback if Ambient Weather unavailable)
        humidity: Math.round(Number(loc.current.humidity || 0)),
        pressure: this.unitSystem === 'metric'
          ? Math.round(Number(pressure || 0))
          : Math.round(Number(pressure || 0) * 100) / 100,
        pressure_in: Math.round(Number(loc.current.pressure_in || 0) * 100) / 100,
        pressure_hpa: Math.round(Number(loc.current.pressure_hpa || 0)),
        wind_mph: Math.round(Number(loc.current.wind_mph || 0) * 10) / 10,
        wind_kmh: Math.round(Number(loc.current.wind_kmh || 0) * 10) / 10,
        wind_speed: Math.round(Number(windSpeed || 0) * 10) / 10,
        wind_dir: loc.current.wind_dir || 0,
      };
    });

    // Build 5-day forecast (skip today, show next 5 days)
    const allForecast = mainLocation.forecast.map(day => {
      const { icon } = mapIconAndDescription(day.condition || '');
      const high = this.unitSystem === 'metric' ? day.high_c : day.high_f;
      const low = this.unitSystem === 'metric' ? day.low_c : day.low_f;
      return {
        date: day.date,
        day: day.day_of_week,
        high: Math.round(Number(high || 0)),
        high_f: Math.round(Number(day.high_f || 0)),
        high_c: Math.round(Number(day.high_c || 0)),
        low: Math.round(Number(low || 0)),
        low_f: Math.round(Number(day.low_f || 0)),
        low_c: Math.round(Number(day.low_c || 0)),
        icon,
        rain_chance: Number(day.rain_chance || 0),
      };
    });

    // Skip today and show next 5 days (use actual date comparison)
    // Use local date, not UTC (important for timezone-aware comparison)
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const todayIndex = allForecast.findIndex(d => d.date === todayStr);
    const startIndex = todayIndex >= 0 ? todayIndex + 1 : 1;
    const forecast = allForecast.slice(startIndex, startIndex + 5);

    // Build hourly forecast (next 24 hours)
  const hourlyForecast = this.getNext24Hours(mainLocation.forecast);

    // Use AQI from Visual Crossing if available, otherwise calculate from PM2.5
    let aqi = mainLocation.current.aqi;
    if (aqi == null && mainLocation.current.pm2_5 != null) {
      aqi = this.calculateAQI(mainLocation.current.pm2_5);
    }
    const aqiCategory = this.mapAqiCategory(aqi);

    // Moon phase mapping
    const { phase, direction } = this.mapMoonPhase(mainLocation.astro.moon_phase);

    // Precipitation totals
    const total24hIn = Number(mainLocation.forecast[0]?.precip_in || 0);
    const total24hMm = Number(mainLocation.forecast[0]?.precip_mm || 0);

    const weekTotalsIn = mainLocation.forecast.slice(0, 7).reduce((sum, d) => sum + Number(d.precip_in || 0), 0);
    const weekTotalsMm = mainLocation.forecast.slice(0, 7).reduce((sum, d) => sum + Number(d.precip_mm || 0), 0);

    return {
      locations,
      forecast,
      hourlyForecast,
      timezone: locationTimezone,
      sun: {
        sunrise: mainLocation.astro.sunrise,
        sunset: mainLocation.astro.sunset,
      },
      moon: {
        phase,
        direction,
        illumination: mainLocation.astro.moon_illumination ? Number(mainLocation.astro.moon_illumination) : null,
      },
      air_quality: aqi != null ? { aqi, category: aqiCategory } : { aqi: null, category: 'Unknown' },
      precipitation: {
        last_24h: Number((this.unitSystem === 'metric' ? total24hMm : total24hIn).toFixed(2)),
        last_24h_in: Number(total24hIn.toFixed(2)),
        last_24h_mm: Number(total24hMm.toFixed(2)),
        week_total: Number((this.unitSystem === 'metric' ? weekTotalsMm : weekTotalsIn).toFixed(2)),
        week_total_in: Number(weekTotalsIn.toFixed(2)),
        week_total_mm: Number(weekTotalsMm.toFixed(2)),
        year_total: null,
        units: this.unitSystem === 'metric' ? 'mm' : 'in',
      },
      units: {
        system: this.unitSystem,
        temperature: this.unitSystem === 'metric' ? '°C' : '°F',
        temperature_secondary: this.unitSystem === 'metric' ? '°F' : '°C',
        wind_speed: this.unitSystem === 'metric' ? 'km/h' : 'mph',
        wind_speed_secondary: this.unitSystem === 'metric' ? 'mph' : 'km/h',
        precipitation: this.unitSystem === 'metric' ? 'mm' : 'in',
        precipitation_secondary: this.unitSystem === 'metric' ? 'in' : 'mm',
        pressure: this.unitSystem === 'metric' ? 'hPa' : 'inHg',
        pressure_secondary: this.unitSystem === 'metric' ? 'inHg' : 'hPa',
      },
    };
  }

  getNext24Hours(forecastDays) {
    const now = new Date();
    const currentHour = now.getHours();
    const hourlyData = [];

    for (let dayIndex = 0; dayIndex < Math.min(3, forecastDays.length) && hourlyData.length < 24; dayIndex++) {
      const day = forecastDays[dayIndex];
      const hours = day.hour || [];

      for (const hourData of hours) {
        if (hourlyData.length >= 24) break;

        // Visual Crossing uses HH:MM:SS format for hour time
        const [hourStr] = (hourData.time || '00:00:00').split(':');
        const hour = parseInt(hourStr, 10);

        if (dayIndex === 0 && hour < currentHour) continue;

        const { icon } = mapIconAndDescription(hourData.condition || '');
        
        // Format time display
        const hourNum = hour % 12 || 12;
        const ampm = hour < 12 ? 'AM' : 'PM';
        
        const tempF = Math.round(Number(hourData.temp_f || 0));
        const tempC = Math.round(Number(hourData.temp_c || 0));
        const windMph = Math.round(Number(hourData.wind_mph || 0));
        const windKmh = Math.round(Number(hourData.wind_kmh || 0));

        const displayTemp = this.unitSystem === 'metric' ? hourData.temp_c : hourData.temp_f;
        const fallbackTemp = this.unitSystem === 'metric' ? hourData.temp_f : hourData.temp_c;
        const resolvedTemp = displayTemp != null ? displayTemp : fallbackTemp;

        const displayWind = this.unitSystem === 'metric' ? hourData.wind_kmh : hourData.wind_mph;
        const fallbackWind = this.unitSystem === 'metric' ? hourData.wind_mph : hourData.wind_kmh;
        const resolvedWind = displayWind != null ? displayWind : fallbackWind;

        hourlyData.push({
          time: `${hourNum} ${ampm}`,
          temp: resolvedTemp != null ? Math.round(Number(resolvedTemp)) : null,
          temp_f: tempF,
          temp_c: tempC,
          condition: hourData.condition || 'Unknown',
          icon,
          rain_chance: Number(hourData.rain_chance || 0),
          wind_speed: resolvedWind != null ? Math.round(Number(resolvedWind)) : null,
          wind_mph: windMph,
          wind_kmh: windKmh,
        });
      }
    }

    return hourlyData;
  }

  calculateAQI(pm25) {
    if (pm25 == null || pm25 < 0) return null;

    const breakpoints = [
      { cLow: 0.0, cHigh: 12.0, aqiLow: 0, aqiHigh: 50 },
      { cLow: 12.1, cHigh: 35.4, aqiLow: 51, aqiHigh: 100 },
      { cLow: 35.5, cHigh: 55.4, aqiLow: 101, aqiHigh: 150 },
      { cLow: 55.5, cHigh: 150.4, aqiLow: 151, aqiHigh: 200 },
      { cLow: 150.5, cHigh: 250.4, aqiLow: 201, aqiHigh: 300 },
      { cLow: 250.5, cHigh: 500.4, aqiLow: 301, aqiHigh: 500 },
    ];

    let bp = breakpoints[breakpoints.length - 1];
    for (const breakpoint of breakpoints) {
      if (pm25 >= breakpoint.cLow && pm25 <= breakpoint.cHigh) {
        bp = breakpoint;
        break;
      }
    }

    const { cLow, cHigh, aqiLow, aqiHigh } = bp;
    const aqi = ((aqiHigh - aqiLow) / (cHigh - cLow)) * (pm25 - cLow) + aqiLow;
    return Math.round(aqi);
  }

  mapAqiCategory(aqi) {
    if (aqi == null) return 'Unknown';
    if (aqi <= 50) return 'Good';
    if (aqi <= 100) return 'Moderate';
    if (aqi <= 150) return 'Unhealthy for Sensitive Groups';
    if (aqi <= 200) return 'Unhealthy';
    if (aqi <= 300) return 'Very Unhealthy';
    return 'Hazardous';
  }

  /**
   * Calculate moon illumination percentage from moon phase value
   * @param {number} moonphase - Moon phase value from 0 (new) to 1 (next new)
   * @returns {number} Illumination percentage (0-100)
   */
  calculateMoonIllumination(moonphase) {
    if (moonphase == null) return 0;
    const phase = Number(moonphase);
    
    // Phase cycle: 0 (new) -> 0.5 (full) -> 1 (new)
    // Illumination: 0% -> 100% -> 0%
    if (phase <= 0.5) {
      // Waxing: 0 to 0.5 maps to 0% to 100%
      return Math.round(phase * 2 * 100);
    } else {
      // Waning: 0.5 to 1 maps to 100% to 0%
      return Math.round((1 - phase) * 2 * 100);
    }
  }

  /**
   * Format time from 24-hour "HH:MM:SS" to 12-hour "H:MM AM/PM"
   * @param {string} timeStr - Time string in "HH:MM:SS" format
   * @returns {string} Formatted time in 12-hour format
   */
  formatTime12Hour(timeStr) {
    if (!timeStr) return '';
    
    // Parse time string (format: "07:08:18")
    const [hoursStr, minutesStr] = timeStr.split(':');
    const hours24 = parseInt(hoursStr, 10);
    const minutes = minutesStr.padStart(2, '0');
    
    // Convert to 12-hour format
    const period = hours24 >= 12 ? 'PM' : 'AM';
    const hours12 = hours24 % 12 || 12;
    
    return `${hours12}:${minutes} ${period}`;
  }

  /**
   * Convert Visual Crossing moon phase (0-1) to text description
   * @param {number} moonphase - Moon phase value from 0 (new) to 1 (next new)
   * @returns {string} Moon phase text description
   */
  convertMoonPhase(moonphase) {
    if (moonphase == null) return 'New Moon';
    const phase = Number(moonphase);
    
    if (phase === 0) return 'New Moon';
    if (phase < 0.25) return 'Waxing Crescent';
    if (phase === 0.25) return 'First Quarter';
    if (phase < 0.5) return 'Waxing Gibbous';
    if (phase === 0.5) return 'Full Moon';
    if (phase < 0.75) return 'Waning Gibbous';
    if (phase === 0.75) return 'Last Quarter';
    if (phase < 1) return 'Waning Crescent';
    return 'New Moon';
  }

  mapMoonPhase(phaseText) {
    const t = String(phaseText || '').toLowerCase();
    if (t.includes('new')) return { phase: 'new', direction: 'waxing' };
    if (t.includes('first')) return { phase: 'first_quarter', direction: 'waxing' };
    if (t.includes('full')) return { phase: 'full', direction: 'waning' };
    if (t.includes('last') || t.includes('third')) return { phase: 'last_quarter', direction: 'waning' };
    if (t.includes('waxing') && t.includes('crescent')) return { phase: 'waxing_crescent', direction: 'waxing' };
    if (t.includes('waning') && t.includes('crescent')) return { phase: 'waning_crescent', direction: 'waning' };
    if (t.includes('waxing') && t.includes('gibbous')) return { phase: 'waxing_gibbous', direction: 'waxing' };
    if (t.includes('waning') && t.includes('gibbous')) return { phase: 'waning_gibbous', direction: 'waning' };
    return { phase: 'new', direction: 'waxing' };
  }

  parseLocationMetadata(originalQuery, resolvedAddress, timezone) {
    const timezoneId = timezone || 'UTC';
    const parts = (resolvedAddress || '').split(',').map(s => s.trim()).filter(Boolean);

    if (parts.length >= 3) {
      return {
        name: parts[0],
        region: parts.slice(1, parts.length - 1).join(', '),
        country: parts[parts.length - 1],
        tz_id: timezoneId,
      };
    }

    if (parts.length === 2) {
      return {
        name: parts[0],
        region: '',
        country: parts[1],
        tz_id: timezoneId,
      };
    }

    return {
      name: parts[0] || originalQuery,
      region: parts[1] || '',
      country: parts[2] || '',
      tz_id: timezoneId,
    };
  }

  normalizeTemperature(value) {
    if (value == null || value === '') {
      return { f: null, c: null };
    }

    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return { f: null, c: null };
    }

    if (this.unitSystem === 'metric') {
      const c = numeric;
      const f = (c * 9) / 5 + 32;
      return { c, f };
    }

    const f = numeric;
    const c = (f - 32) * 5 / 9;
    return { f, c };
  }

  normalizeWindSpeed(value) {
    if (value == null || value === '') {
      return { mph: null, kmh: null };
    }

    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return { mph: null, kmh: null };
    }

    if (this.unitSystem === 'metric') {
      const kmh = numeric;
      const mph = kmh / 1.60934;
      return { kmh, mph };
    }

    const mph = numeric;
    const kmh = mph * 1.60934;
    return { mph, kmh };
  }

  normalizePrecipitation(value) {
    if (value == null || value === '') {
      return { in: 0, mm: 0 };
    }

    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return { in: 0, mm: 0 };
    }

    if (this.unitSystem === 'metric') {
      const mm = numeric;
      const inches = mm / 25.4;
      return { mm, in: inches };
    }

    const inches = numeric;
    const mm = inches * 25.4;
    return { in: inches, mm };
  }

  normalizePressure(value) {
    if (value == null || value === '') {
      return { inHg: null, hPa: null };
    }

    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return { inHg: null, hPa: null };
    }

    if (this.unitSystem === 'metric') {
      const hPa = numeric;
      const inHg = hPa * 0.0295299830714;
      return { hPa, inHg };
    }

    const inHg = numeric;
    const hPa = inHg * 33.8638866667;
    return { inHg, hPa };
  }
}

module.exports = { WeatherService };
