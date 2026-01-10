import { NextRequest, NextResponse } from 'next/server';
import { WeatherService } from '@/services/weatherService';
import { CalendarService } from '@/services/calendarService';
import { NewsService } from '@/services/newsService';
import { MarketsService } from '@/services/marketsService';

/**
 * Test endpoint for manually triggering and inspecting services
 *
 * Usage:
 * - GET /api/test-service?service=news&fresh=true
 * - GET /api/test-service?service=weather&fresh=true
 * - GET /api/test-service?service=calendar
 * - GET /api/test-service?service=markets&fresh=true
 *
 * Query params:
 * - service: which service to test (news, weather, calendar, markets)
 * - fresh: if true, clears cache before fetching
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    const searchParams = request.nextUrl.searchParams;
    const serviceName = searchParams.get('service');
    const fresh = searchParams.get('fresh') === 'true';

    if (!serviceName) {
      return NextResponse.json({
        error: 'Missing service parameter',
        usage: 'GET /api/test-service?service=news&fresh=true',
        availableServices: ['news', 'weather', 'calendar', 'markets']
      }, { status: 400 });
    }

    let service: any;
    let config: any = {};
    let serviceFriendlyName = '';

    // Initialize the requested service
    switch (serviceName.toLowerCase()) {
      case 'news':
        service = new NewsService();
        serviceFriendlyName = 'News Service';
        break;

      case 'weather':
        service = new WeatherService();
        serviceFriendlyName = 'Weather Service (includes AI insights)';
        break;

      case 'calendar':
        service = new CalendarService();
        serviceFriendlyName = 'Calendar Service';
        const baseUrl = `${request.nextUrl.protocol}//${request.nextUrl.host}`;
        config = {
          baseUrl,
          timezone: 'UTC'
        };
        break;

      case 'markets':
        service = new MarketsService();
        serviceFriendlyName = 'Markets Service';
        break;

      default:
        return NextResponse.json({
          error: `Unknown service: ${serviceName}`,
          availableServices: ['news', 'weather', 'calendar', 'markets']
        }, { status: 400 });
    }

    // Check if service is enabled
    const isEnabled = service.isEnabled();
    if (!isEnabled) {
      return NextResponse.json({
        service: serviceFriendlyName,
        error: 'Service is not enabled (missing credentials)',
        status: service.getStatus()
      }, { status: 400 });
    }

    // Clear cache if fresh=true
    if (fresh) {
      service.clearCache();
      console.log(`[TestService] Cleared cache for ${serviceFriendlyName}`);
    }

    // Fetch data
    console.log(`[TestService] Testing ${serviceFriendlyName}...`);
    const result = await service.getData(config, console);

    const latency = Date.now() - startTime;

    return NextResponse.json({
      service: serviceFriendlyName,
      success: true,
      latency: `${latency}ms`,
      source: result.source,
      status: result.status,
      data: result.data,
      cache_info: {
        ttl_minutes: service.cacheTTL / (60 * 1000),
        cache_key: service.cacheKey,
      }
    }, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8'
      }
    });

  } catch (error) {
    const latency = Date.now() - startTime;
    const err = error as Error;

    console.error('[TestService] Error:', err);

    return NextResponse.json({
      success: false,
      error: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
      latency: `${latency}ms`
    }, { status: 500 });
  }
}
