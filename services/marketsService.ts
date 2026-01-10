import { BaseService } from '../lib/BaseService';
import YahooFinance from 'yahoo-finance2';
import type { Logger } from '../lib/types';

// Initialize Yahoo Finance instance
const yahooFinance = new YahooFinance();

// ============================================================================
// Markets Service Types
// ============================================================================

interface MarketsServiceConfig {
  symbols?: string[];
}

interface MarketQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  currency: string;
}

interface MarketsData {
  quotes: MarketQuote[];
  lastUpdated: number;
}

// Default symbols to track
const DEFAULT_SYMBOLS = [
  { symbol: '^GSPC', name: 'S&P 500' },
  { symbol: '^DJI', name: 'Dow Jones' },
  { symbol: '^IXIC', name: 'Nasdaq' },
  { symbol: 'CL=F', name: 'Crude Oil' },
  { symbol: 'GC=F', name: 'Gold' },
  { symbol: 'BTC-USD', name: 'Bitcoin' },
];

// ============================================================================
// Markets Service Class
// ============================================================================

/**
 * Markets Service - Fetches real-time market data
 * Uses yahoo-finance2 library (free, no API key required)
 */
export class MarketsService extends BaseService<MarketsData, MarketsServiceConfig> {
  constructor(cacheTTLMinutes: number = 15) {
    super({
      name: 'Markets',
      cacheKey: 'markets',
      cacheTTL: cacheTTLMinutes * 60 * 1000,
      retryAttempts: 3,
      retryCooldown: 1000,
    });
  }

  isEnabled(): boolean {
    // Always enabled - uses free Yahoo Finance API
    return true;
  }

  async fetchData(_config: MarketsServiceConfig, logger: Logger): Promise<MarketsData> {
    const symbols = DEFAULT_SYMBOLS.map(s => s.symbol);

    logger.info?.(`[Markets] Fetching quotes for: ${symbols.join(', ')}`);

    try {
      // Use yahoo-finance2 library which handles authentication
      const results = await yahooFinance.quote(symbols);

      const quotes: MarketQuote[] = [];

      for (const result of results) {
        const symbolInfo = DEFAULT_SYMBOLS.find(s => s.symbol === result.symbol);

        // Get the regular market price (fallback to post-market if regular not available)
        const price = result.regularMarketPrice ?? 0;
        const change = result.regularMarketChange ?? 0;
        const changePercent = result.regularMarketChangePercent ?? 0;

        quotes.push({
          symbol: result.symbol,
          name: symbolInfo?.name || result.shortName || result.symbol,
          price: parseFloat(price.toFixed(2)),
          change: parseFloat(change.toFixed(2)),
          changePercent: parseFloat(changePercent.toFixed(2)),
          currency: result.currency || 'USD',
        });
      }

      logger.info?.(`[Markets] Successfully fetched ${quotes.length} quotes`);

      return {
        quotes,
        lastUpdated: Date.now(),
      };
    } catch (error) {
      const err = error as Error;
      logger.error?.(`[Markets] Failed to fetch market data: ${err.message}`);
      throw error;
    }
  }

  mapToDashboard(apiData: MarketsData, _config: MarketsServiceConfig): MarketsData {
    return {
      quotes: apiData.quotes,
      lastUpdated: apiData.lastUpdated,
    };
  }
}
