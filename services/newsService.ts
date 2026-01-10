import { BaseService } from '../lib/BaseService';
import { GoogleGenerativeAI } from "@google/generative-ai";
import type { Logger } from '../lib/types';
import type { Browser } from 'puppeteer';

// ============================================================================
// News Service Types
// ============================================================================

interface NewsServiceConfig {
  sources?: NewsSource[];
}

interface NewsSource {
  name: string;
  url: string;
  scraper: (page: any) => Promise<string[]>;
}

interface NewsHeadline {
  source: string;
  title: string;
}

interface NewsData {
  headlines: NewsHeadline[];
  summary: string;
  _meta?: {
    input_tokens: number;
    output_tokens: number;
    cost_usd: number;
    scrapedAt: number;
  };
}

// ============================================================================
// News Source Scrapers
// ============================================================================

const NEWS_SOURCES: NewsSource[] = [
  {
    name: 'BBC News',
    url: 'https://www.bbc.com/news',
    scraper: async (page) => {
      try {
        await page.goto('https://www.bbc.com/news', {
          waitUntil: 'domcontentloaded',
          timeout: 15000
        });

        const headlines = await page.evaluate(() => {
          const items: string[] = [];

          // BBC uses various selectors for headlines
          const selectors = [
            'h2[data-testid="card-headline"]',
            'h3[data-testid="card-headline"]',
            '[data-testid="card-headline"]',
            'a[data-testid="internal-link"] h2',
            'a[data-testid="internal-link"] h3'
          ];

          for (const selector of selectors) {
            const elements = document.querySelectorAll(selector);
            elements.forEach(el => {
              const text = el.textContent?.trim();
              if (text && text.length > 10 && !items.includes(text)) {
                items.push(text);
              }
            });
            if (items.length >= 8) break;
          }

          return items.slice(0, 8);
        });

        return headlines;
      } catch (error) {
        console.error('BBC scraping failed:', error);
        return [];
      }
    }
  },
  {
    name: 'ABC News (AU)',
    url: 'https://www.abc.net.au/news',
    scraper: async (page) => {
      try {
        await page.goto('https://www.abc.net.au/news', {
          waitUntil: 'domcontentloaded',
          timeout: 15000
        });

        const headlines = await page.evaluate(() => {
          const items: string[] = [];

          // ABC uses article cards with h3 headers
          const selectors = [
            'article h3',
            '[data-component="CardHeading"]',
            '.ContentHeading_heading',
            'a[data-component="Link"] h3'
          ];

          for (const selector of selectors) {
            const elements = document.querySelectorAll(selector);
            elements.forEach(el => {
              const text = el.textContent?.trim();
              if (text && text.length > 10 && !items.includes(text)) {
                items.push(text);
              }
            });
            if (items.length >= 8) break;
          }

          return items.slice(0, 8);
        });

        return headlines;
      } catch (error) {
        console.error('ABC scraping failed:', error);
        return [];
      }
    }
  },
  {
    name: 'RNZ',
    url: 'https://www.rnz.co.nz/news',
    scraper: async (page) => {
      try {
        await page.goto('https://www.rnz.co.nz/news', {
          waitUntil: 'domcontentloaded',
          timeout: 15000
        });

        // Wait a bit for dynamic content
        await new Promise(resolve => setTimeout(resolve, 1000));

        const headlines = await page.evaluate(() => {
          const items: string[] = [];

          // RNZ uses various selectors for headlines
          const selectors = [
            'h3 a',
            'h2 a',
            'article h3',
            'article h2',
            '.article-heading',
            '.story-headline',
            '[class*="heading"] a',
            '[class*="title"] a',
          ];

          for (const selector of selectors) {
            const elements = document.querySelectorAll(selector);
            elements.forEach(el => {
              const text = el.textContent?.trim();
              if (text && text.length > 10 && !items.includes(text)) {
                items.push(text);
              }
            });
            if (items.length >= 8) break;
          }

          return items.slice(0, 8);
        });

        return headlines;
      } catch (error) {
        console.error('RNZ scraping failed:', error);
        return [];
      }
    }
  }
];

// ============================================================================
// News Service Class
// ============================================================================

/**
 * News Service - Scrapes top headlines and generates AI summary
 * Uses Puppeteer to scrape BBC, ABC News (AU), and RNZ
 * Uses Google Gemini to generate a concise summary
 */
export class NewsService extends BaseService<NewsData, NewsServiceConfig> {
  constructor(cacheTTLMinutes: number = 120) {
    super({
      name: 'News',
      cacheKey: 'news',
      cacheTTL: cacheTTLMinutes * 60 * 1000,
      retryAttempts: 2,
      retryCooldown: 2000,
    });
  }

  isEnabled(): boolean {
    const apiKey = process.env.GEMINI_API_KEY;
    return !!apiKey;
  }

  async fetchData(_config: NewsServiceConfig, logger: Logger): Promise<NewsData> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY is not set');

    let browser: Browser | null = null;

    try {
      // Import puppeteer dynamically
      const puppeteer = await import('puppeteer');
      const fs = await import('fs');
      const os = await import('os');

      // Detect system Chrome path based on platform
      let executablePath: string | undefined = undefined;
      const platform = os.platform();

      if (platform === 'darwin') {
        // macOS
        const macPath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
        if (fs.existsSync(macPath)) {
          executablePath = macPath;
        }
      } else if (platform === 'linux') {
        // Linux - try common paths
        const linuxPaths = [
          '/usr/bin/google-chrome',
          '/usr/bin/google-chrome-stable',
          '/usr/bin/chromium-browser',
          '/usr/bin/chromium',
        ];
        for (const path of linuxPaths) {
          if (fs.existsSync(path)) {
            executablePath = path;
            break;
          }
        }
      }

      logger.info?.(`[News] Launching browser for scraping (platform: ${platform})...`);
      browser = await puppeteer.launch({
        headless: true,
        pipe: true,
        timeout: 30000,
        executablePath,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu'
        ]
      });

      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 800 });

      // Scrape all sources
      const allHeadlines: NewsHeadline[] = [];

      for (const source of NEWS_SOURCES) {
        logger.info?.(`[News] Scraping ${source.name}...`);
        try {
          const headlines = await source.scraper(page);
          logger.info?.(`[News] Found ${headlines.length} headlines from ${source.name}`);

          headlines.forEach(title => {
            allHeadlines.push({ source: source.name, title });
          });
        } catch (error) {
          logger.warn?.(`[News] Failed to scrape ${source.name}: ${error}`);
        }
      }

      await browser.close();
      browser = null;

      if (allHeadlines.length === 0) {
        throw new Error('No headlines scraped from any source');
      }

      if (allHeadlines.length < 3) {
        logger.warn?.(`[News] Only ${allHeadlines.length} headlines scraped - summary may be limited`);
      }

      logger.info?.(`[News] Total headlines scraped: ${allHeadlines.length}`);

      // Generate AI summary using Gemini
      logger.info?.('[News] Generating AI summary...');
      let summaryText = '';
      let summaryMeta = undefined;

      try {
        const summary = await this.generateSummary(allHeadlines, apiKey);
        summaryText = summary.text;
        summaryMeta = {
          input_tokens: summary.inputTokens,
          output_tokens: summary.outputTokens,
          cost_usd: summary.cost,
          scrapedAt: Date.now()
        };
        logger.info?.(`[News] AI summary generated: "${summaryText}"`);
      } catch (summaryError) {
        logger.warn?.('[News] AI summary generation failed:', summaryError);
        // Continue with empty summary rather than failing the whole service
      }

      return {
        headlines: allHeadlines,
        summary: summaryText,
        _meta: summaryMeta
      };
    } catch (error) {
      if (browser) {
        try {
          await browser.close();
        } catch (e) {
          // Ignore close errors
        }
      }
      throw error;
    }
  }

  async generateSummary(
    headlines: NewsHeadline[],
    apiKey: string
  ): Promise<{ text: string; inputTokens: number; outputTokens: number; cost: number }> {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      generationConfig: {
        responseMimeType: "application/json",
      }
    });

    // Group headlines by source
    const headlinesBySources = headlines.reduce((acc, h) => {
      if (!acc[h.source]) acc[h.source] = [];
      acc[h.source].push(h.title);
      return acc;
    }, {} as Record<string, string[]>);

    const headlinesText = Object.entries(headlinesBySources)
      .map(([source, titles]) => `${source}:\n${titles.map((t, i) => `${i + 1}. ${t}`).join('\n')}`)
      .join('\n\n');

    const systemPrompt = `You generate concise news summaries for a kitchen e-ink display. The user has just seen these top headlines from international news outlets. Your job is to identify and summarize the 2-3 most important stories of the day in a clear, informative way.

Return JSON:
{
  "summary": "concise news summary, 60-78 chars total (including spaces and punctuation), no ending punctuation"
}

Style:
- Write like a news anchor delivering a brief update
- Focus on the most significant or recurring stories across sources
- Be factual and neutral
- Mention specific events, places, or developments

Rules:
- DO NOT use phrases like "today's headlines" or "in the news"
- DO NOT be vague - mention specific stories or developments
- MUST be between 60-78 characters total (including spaces and punctuation)
- DO NOT use ending punctuation

Examples:
{"summary": "Major climate summit underway, markets rally on tech earnings surprise"}
{"summary": "Prime Minister announces election date, flooding continues in NSW"}
{"summary": "Trade deal signed, severe weather warnings issued for South Island"}
{"summary": "UN votes on ceasefire resolution, inflation falls to 2-year low"}

Remember:
- Summary must be at least 60 characters and CANNOT be more than 78 total characters
- You MUST return valid JSON ONLY
- Focus on the most important 2-3 stories
`;

    const userMessage = `Today's top headlines from BBC News, ABC News (Australia), and Radio New Zealand:

${headlinesText}

Generate a concise summary of the most important news stories.`;

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\n${userMessage}` }] }],
    });

    const response = await result.response;

    // Check if response was blocked
    const candidate = response.candidates?.[0];
    if (candidate?.finishReason === 'SAFETY' || candidate?.finishReason === 'RECITATION') {
      throw new Error(`Gemini blocked response: ${candidate.finishReason}`);
    }

    const text = response.text();

    if (!text || text.trim().length === 0) {
      throw new Error('Gemini returned empty response');
    }

    console.log('[News] Raw Gemini response:', text);

    try {
      let parsed = JSON.parse(text);

      // Handle if Gemini returns an array instead of object
      if (Array.isArray(parsed) && parsed.length > 0) {
        parsed = parsed[0];
      }

      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Response is not a valid object');
      }

      if (!parsed.summary) {
        throw new Error('Response JSON missing "summary" field');
      }

      // Cost calculation for Gemini 2 Flash
      const inputTokens = response.usageMetadata?.promptTokenCount || 0;
      const outputTokens = response.usageMetadata?.candidatesTokenCount || 0;
      const cost = (inputTokens * 0.1 / 1000000) + (outputTokens * 0.4 / 1000000);

      return {
        text: parsed.summary,
        inputTokens,
        outputTokens,
        cost
      };
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : 'Unknown error';
      throw new Error(`Failed to parse Gemini response: ${errorMsg}. Raw text: ${text.substring(0, 200)}`);
    }
  }

  mapToDashboard(apiData: NewsData, _config: NewsServiceConfig): NewsData {
    return {
      headlines: apiData.headlines,
      summary: apiData.summary,
      _meta: apiData._meta,
    };
  }
}
