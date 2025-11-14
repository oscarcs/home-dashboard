const axios = require('axios');
const fs = require('fs');
const { BaseService } = require('../lib/BaseService');
const { AUTH_PATH } = require('../lib/paths');
const { getStateKey, setStateKey } = require('../lib/state');
const { getWindDirection } = require('../lib/weatherUtils');

/**
 * Ambient Weather Service (Personal Weather Station) - OPTIONAL
 * Provides hyper-local current conditions that override WeatherAPI data
 */
class AmbientService extends BaseService {
  constructor(cacheTTLMinutes = 10) {
    super({
      name: 'AmbientWeather',
      cacheKey: 'ambient',
      cacheTTL: cacheTTLMinutes * 60 * 1000,
      retryAttempts: 2,
      retryCooldown: 1000,
    });
  }

  isEnabled() {
    const appKey = process.env.AMBIENT_APPLICATION_KEY;
    const apiKey = process.env.AMBIENT_API_KEY;
    return !!(appKey && apiKey);
  }

  async fetchData(config, logger) {
    const appKey = process.env.AMBIENT_APPLICATION_KEY || config?.ambient_application_key;
    const apiKey = process.env.AMBIENT_API_KEY || config?.ambient_api_key;

    if (!appKey || !apiKey) {
      throw new Error('AMBIENT_APPLICATION_KEY and AMBIENT_API_KEY required');
    }

    // Get device MAC (check config, env, or stored value)
    const deviceMac = await this.getDeviceMac(config, appKey, apiKey, logger);

    // Fetch current data for the device
    const url = this.buildApiUrl(`devices/${deviceMac}`, appKey, apiKey, { limit: 1 });
    const response = await axios.get(url, { timeout: 10000 });

    if (response.status !== 200) {
      throw new Error(`Ambient Weather API returned status ${response.status}`);
    }

    const rawData = response.data || [];
    if (rawData.length === 0) {
      throw new Error('No current data available from Ambient Weather device');
    }

    return rawData[0];
  }

  async getDeviceMac(config, appKey, apiKey, logger) {
    // Priority 1: Config/env
    const configured = config?.ambient_device_mac || process.env.AMBIENT_DEVICE_MAC;
    if (configured) return configured;

    // Priority 2: Stored in auth.json
    const stored = this.getStoredDeviceMac();
    if (stored) return stored;

    // Priority 3: Fetch from API
    logger.info?.('[AmbientWeather] Fetching device list...');
    const url = this.buildApiUrl('devices', appKey, apiKey);
    const response = await axios.get(url, { timeout: 10000 });

    if (response.status !== 200 || !response.data || response.data.length === 0) {
      throw new Error('No Ambient Weather devices found');
    }

    const mac = response.data[0].macAddress;
    this.storeDeviceMac(mac);
    
    // Wait 1 second to respect rate limits before next call
    await this.sleep(1000);
    
    return mac;
  }

  buildApiUrl(endpoint, appKey, apiKey, params = {}) {
    const url = new URL(`https://rt.ambientweather.net/v1/${endpoint}`);
    url.searchParams.set('applicationKey', appKey);
    url.searchParams.set('apiKey', apiKey);

    Object.entries(params).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    });

    return url.toString();
  }

  getStoredDeviceMac() {
    try {
      if (fs.existsSync(AUTH_PATH)) {
        const auth = JSON.parse(fs.readFileSync(AUTH_PATH, 'utf-8'));
        return auth.ambient_device_mac || null;
      }
    } catch (_) {}
    return null;
  }

  storeDeviceMac(mac) {
    try {
      const auth = fs.existsSync(AUTH_PATH) 
        ? JSON.parse(fs.readFileSync(AUTH_PATH, 'utf-8')) 
        : {};
      auth.ambient_device_mac = mac;
      fs.writeFileSync(AUTH_PATH, JSON.stringify(auth, null, 2));
    } catch (err) {
      console.warn('Failed to store device MAC:', err.message);
    }
  }

  mapToDashboard(apiData, config) {
    const tempF = Number(apiData.tempf) || 0;
    const tempC = (tempF - 32) * 5 / 9;
    const feelsLikeF = Number(apiData.feelsLike || apiData.feelslikef) || tempF;
    const feelsLikeC = (feelsLikeF - 32) * 5 / 9;
    const humidity = Number(apiData.humidity) || 0;
    const windSpeedMph = Number(apiData.windspeedmph) || 0;
    const windSpeedKmh = windSpeedMph * 1.60934;
    const windDir = apiData.winddir || 0;
    const pressureInHg = Number(apiData.baromrelin || apiData.baromabsin) || 0;
    const pressureHpa = pressureInHg * 33.8638866667;
    const rainRate = Number(apiData.rainratein) || 0;
    const solarRadiation = Number(apiData.solarradiation) || 0;

    const windDirection = getWindDirection(windDir);

    return {
  current_temp_f: Math.round(tempF * 10) / 10,
  current_temp_c: Math.round(tempC * 10) / 10,
  current_temp: Math.round(tempF * 10) / 10,
  feels_like_f: Math.round(feelsLikeF * 10) / 10,
  feels_like_c: Math.round(feelsLikeC * 10) / 10,
  feels_like: Math.round(feelsLikeF * 10) / 10,
      humidity: Math.round(humidity),
  pressure_in: Math.round(pressureInHg * 100) / 100,
  pressure: Math.round(pressureInHg * 100) / 100,
      pressure_hpa: Math.round(pressureHpa),
      wind: {
        speed_mph: Math.round(windSpeedMph * 10) / 10,
        speed_kmh: Math.round(windSpeedKmh * 10) / 10,
        direction: windDirection,
      },
      precipitation: {
        last_24h_in: Math.round(Number(apiData.dailyrainin || 0) * 100) / 100,
        last_24h_mm: Math.round(Number(apiData.dailyrainin || 0) * 2540) / 100,
        week_total_in: Math.round(Number(apiData.weeklyrainin || 0) * 100) / 100,
        week_total_mm: Math.round(Number(apiData.weeklyrainin || 0) * 2540) / 100,
        month_total_in: Math.round(Number(apiData.monthlyrainin || 0) * 100) / 100,
        month_total_mm: Math.round(Number(apiData.monthlyrainin || 0) * 2540) / 100,
        year_total_in: Math.round(Number(apiData.yearlyrainin || 0) * 100) / 100,
        year_total_mm: Math.round(Number(apiData.yearlyrainin || 0) * 2540) / 100,
        last_24h: Math.round(Number(apiData.dailyrainin || 0) * 100) / 100,
        week_total: Math.round(Number(apiData.weeklyrainin || 0) * 100) / 100,
        month_total: Math.round(Number(apiData.monthlyrainin || 0) * 100) / 100,
        year_total: Math.round(Number(apiData.yearlyrainin || 0) * 100) / 100,
        units: 'in',
      },
      solar_radiation: solarRadiation,
    };
  }

}

module.exports = { AmbientService };
