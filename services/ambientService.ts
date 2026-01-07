import axios from 'axios';
import fs from 'fs';
import { BaseService } from '../lib/BaseService';
import { AUTH_PATH } from '../lib/paths';
import { getWindDirection } from '../lib/weatherUtils';
import type { Logger } from '../lib/types';

// ============================================================================
// Ambient Weather API Response Types
// ============================================================================

interface AmbientWeatherDevice {
  macAddress: string;
  info?: {
    name?: string;
    location?: string;
  };
}

interface AmbientWeatherApiData {
  dateutc: number;
  tempf: number;
  humidity: number;
  windspeedmph: number;
  winddir: number;
  baromrelin?: number;
  baromabsin?: number;
  rainratein?: number;
  dailyrainin?: number;
  weeklyrainin?: number;
  monthlyrainin?: number;
  yearlyrainin?: number;
  solarradiation?: number;
  feelsLike?: number;
  feelslikef?: number;
}

// ============================================================================
// Ambient Service Output Types
// ============================================================================

interface AmbientWindData {
  speed: number;
  direction: string;
}

interface AmbientPrecipitationData {
  last_24h: number;
  week_total: number;
  month_total: number;
  year_total: number;
  units: string;
}

interface AmbientDashboardData {
  current_temp: number;
  feels_like: number;
  humidity: number;
  pressure: number;
  wind: AmbientWindData;
  precipitation: AmbientPrecipitationData;
  solar_radiation: number;
}

interface AmbientServiceConfig {
  baseUrl?: string;
  ambient_application_key?: string;
  ambient_api_key?: string;
  ambient_device_mac?: string;
}

// ============================================================================
// Ambient Weather Service Class
// ============================================================================

/**
 * Ambient Weather Service (Personal Weather Station) - OPTIONAL
 * Provides hyper-local current conditions that override WeatherAPI data
 */
class AmbientService extends BaseService<AmbientDashboardData, AmbientServiceConfig> {
  constructor(cacheTTLMinutes: number = 10) {
    super({
      name: 'AmbientWeather',
      cacheKey: 'ambient',
      cacheTTL: cacheTTLMinutes * 60 * 1000,
      retryAttempts: 2,
      retryCooldown: 1000,
    });
  }

  isEnabled(): boolean {
    const appKey = process.env.AMBIENT_APPLICATION_KEY;
    const apiKey = process.env.AMBIENT_API_KEY;
    return !!(appKey && apiKey);
  }

  async fetchData(config: AmbientServiceConfig, logger: Logger): Promise<AmbientWeatherApiData> {
    const appKey = process.env.AMBIENT_APPLICATION_KEY || config?.ambient_application_key;
    const apiKey = process.env.AMBIENT_API_KEY || config?.ambient_api_key;

    if (!appKey || !apiKey) {
      throw new Error('AMBIENT_APPLICATION_KEY and AMBIENT_API_KEY required');
    }

    // Get device MAC (check config, env, or stored value)
    const deviceMac = await this.getDeviceMac(config, appKey, apiKey, logger);

    // Fetch current data for the device
    const url = this.buildApiUrl(`devices/${deviceMac}`, appKey, apiKey, { limit: 1 });
    const response = await axios.get<AmbientWeatherApiData[]>(url, { timeout: 10000 });

    if (response.status !== 200) {
      throw new Error(`Ambient Weather API returned status ${response.status}`);
    }

    const rawData = response.data || [];
    if (rawData.length === 0) {
      throw new Error('No current data available from Ambient Weather device');
    }

    return rawData[0];
  }

  async getDeviceMac(config: AmbientServiceConfig, appKey: string, apiKey: string, logger: Logger): Promise<string> {
    // Priority 1: Config/env
    const configured = config?.ambient_device_mac || process.env.AMBIENT_DEVICE_MAC;
    if (configured) return configured;

    // Priority 2: Stored in auth.json
    const stored = this.getStoredDeviceMac();
    if (stored) return stored;

    // Priority 3: Fetch from API
    logger.info?.('[AmbientWeather] Fetching device list...');
    const url = this.buildApiUrl('devices', appKey, apiKey);
    const response = await axios.get<AmbientWeatherDevice[]>(url, { timeout: 10000 });

    if (response.status !== 200 || !response.data || response.data.length === 0) {
      throw new Error('No Ambient Weather devices found');
    }

    const mac = response.data[0].macAddress;
    this.storeDeviceMac(mac);

    // Wait 1 second to respect rate limits before next call
    await this.sleep(1000);

    return mac;
  }

  buildApiUrl(endpoint: string, appKey: string, apiKey: string, params: Record<string, string | number> = {}): string {
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

  getStoredDeviceMac(): string | null {
    try {
      if (fs.existsSync(AUTH_PATH)) {
        const auth = JSON.parse(fs.readFileSync(AUTH_PATH, 'utf-8')) as { ambient_device_mac?: string };
        return auth.ambient_device_mac || null;
      }
    } catch (_) {
      // Ignore errors
    }
    return null;
  }

  storeDeviceMac(mac: string): void {
    try {
      const auth: { ambient_device_mac?: string } = fs.existsSync(AUTH_PATH)
        ? JSON.parse(fs.readFileSync(AUTH_PATH, 'utf-8'))
        : {};
      auth.ambient_device_mac = mac;
      fs.writeFileSync(AUTH_PATH, JSON.stringify(auth, null, 2));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.warn('Failed to store device MAC:', errorMessage);
    }
  }

  mapToDashboard(apiData: AmbientWeatherApiData, _config: AmbientServiceConfig): AmbientDashboardData {
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
    const solarRadiation = Number(apiData.solarradiation) || 0;

    const windDirection = getWindDirection(windDir);

    return {
      current_temp: Math.round(tempC * 10) / 10,
      feels_like: Math.round(feelsLikeC * 10) / 10,
      humidity: Math.round(humidity),
      pressure: Math.round(pressureHpa),
      wind: {
        speed: Math.round(windSpeedKmh * 10) / 10,
        direction: windDirection,
      },
      precipitation: {
        last_24h: Math.round(Number(apiData.dailyrainin || 0) * 2540) / 100,
        week_total: Math.round(Number(apiData.weeklyrainin || 0) * 2540) / 100,
        month_total: Math.round(Number(apiData.monthlyrainin || 0) * 2540) / 100,
        year_total: Math.round(Number(apiData.yearlyrainin || 0) * 2540) / 100,
        units: 'mm',
      },
      solar_radiation: solarRadiation,
    };
  }
}

export { AmbientService };
