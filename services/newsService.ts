import { BaseService } from '../lib/BaseService';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { generateCodexJSON, getLLMProvider, getLLMSignature, isConfiguredLLMProvider } from '../lib/codexLLM';
import { findPuppeteerExecutable } from '../lib/puppeteerExecutable';
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
  displayHeadlines?: NewsHeadline[];
  summary: string;
  _meta?: {
    input_tokens: number;
    output_tokens: number;
    cost_usd: number;
    provider?: string;
    selectionReasons?: Record<string, string>;
    scrapedAt: number;
  };
}

interface NewsAIResult {
  text: string;
  headlineIds: string[];
  selectionReasons: Record<string, string>;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  provider: string;
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
  },
  {
    name: 'Yle',
    url: 'https://yle.fi/uutiset',
    scraper: async (page) => {
      try {
        await page.goto('https://yle.fi/uutiset', {
          waitUntil: 'domcontentloaded',
          timeout: 15000
        });

        const headlines = await page.evaluate(() => {
          const items: string[] = [];
          const blockedHeadings = new Set([
            'Aiheet',
            'Uutisia lyhyesti',
            'Suosituimmat',
            'Tuoreimmat',
            'Tästä keskustellaan nyt',
          ]);

          const selectors = [
            'main h2',
            'main h3',
            'article h2',
            'article h3',
            'a[href*="/a/"] h2',
            'a[href*="/a/"] h3',
          ];

          for (const selector of selectors) {
            const elements = document.querySelectorAll(selector);
            elements.forEach(el => {
              const text = el.textContent?.trim().replace(/\s+/g, ' ');
              if (
                text &&
                text.length > 20 &&
                !blockedHeadings.has(text) &&
                !items.includes(text)
              ) {
                items.push(text);
              }
            });
            if (items.length >= 8) break;
          }

          return items.slice(0, 8);
        });

        return headlines;
      } catch (error) {
        console.error('Yle scraping failed:', error);
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
 * Uses the configured LLM provider to generate a concise summary
 */
export class NewsService extends BaseService<NewsData, NewsServiceConfig> {
  constructor(cacheTTLMinutes: number = 30) {
    super({
      name: 'News',
      cacheKey: 'news',
      cacheTTL: cacheTTLMinutes * 60 * 1000,
      retryAttempts: 2,
      retryCooldown: 2000,
    });
  }

  isEnabled(): boolean {
    return true;
  }

  protected getCacheSignature(_config: NewsServiceConfig): string {
    return JSON.stringify({
      llm: getLLMSignature(),
      sources: NEWS_SOURCES.map(source => source.name),
      selection: 'headline-id-editorial-v3',
    });
  }

  async fetchData(_config: NewsServiceConfig, logger: Logger): Promise<NewsData> {
    let browser: Browser | null = null;

    try {
      // Import puppeteer dynamically
      const puppeteer = await import('puppeteer');
      const os = await import('os');
      const platform = os.platform();
      const executablePath = findPuppeteerExecutable();

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

      let summaryText = '';
      let displayHeadlines = this.getFallbackDisplayHeadlines(allHeadlines);
      let summaryMeta = undefined;

      if (isConfiguredLLMProvider()) {
        // Generate AI summary and select display headlines using the configured LLM provider.
        logger.info?.('[News] Generating AI summary and display headline selection...');
        try {
          const result = await this.generateNewsAIResult(allHeadlines);
          summaryText = result.text;
          displayHeadlines = this.mapSelectedHeadlineIds(allHeadlines, result.headlineIds);
          summaryMeta = {
            input_tokens: result.inputTokens,
            output_tokens: result.outputTokens,
            cost_usd: result.cost,
            provider: result.provider,
            selectionReasons: result.selectionReasons,
            scrapedAt: Date.now()
          };
          logger.info?.(`[News] AI summary generated: "${summaryText}"`);
          logger.info?.(`[News] AI selected ${displayHeadlines.length} display headlines`);
        } catch (summaryError) {
          logger.warn?.('[News] AI summary generation failed:', summaryError);
          // Continue with fallback display headlines rather than failing the whole service
        }
      } else {
        logger.info?.('[News] No LLM provider configured; skipping AI summary');
      }

      return {
        headlines: allHeadlines,
        displayHeadlines,
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

  async generateNewsAIResult(
    headlines: NewsHeadline[]
  ): Promise<NewsAIResult> {
    const { systemPrompt, userMessage } = this.buildNewsPrompt(headlines);
    const provider = getLLMProvider();

    if (provider === 'codex') {
      const result = await generateCodexJSON<{
        summary: string;
        headline_ids: string[];
        selection_reasons: Array<{ id: string; reason: string }>;
      }>({
        prompt: `${systemPrompt}\n\n${userMessage}`,
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            summary: {
              type: 'string',
              minLength: 40,
              maxLength: 90,
            },
            headline_ids: {
              type: 'array',
              minItems: 1,
              maxItems: 4,
              items: {
                type: 'string',
              },
            },
            selection_reasons: {
              type: 'array',
              minItems: 1,
              maxItems: 4,
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  id: {
                    type: 'string',
                  },
                  reason: {
                    type: 'string',
                  },
                },
                required: ['id', 'reason'],
              },
            },
          },
          required: ['summary', 'headline_ids', 'selection_reasons'],
        },
      });

      return {
        text: result.data.summary,
        headlineIds: result.data.headline_ids,
        selectionReasons: this.normalizeSelectionReasons(result.data.selection_reasons),
        inputTokens: result.tokensUsed || 0,
        outputTokens: 0,
        cost: 0,
        provider: `codex:${result.model}`,
      };
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY is not set');

    return this.generateGeminiNewsResult(systemPrompt, userMessage, apiKey);
  }

  private async generateGeminiNewsResult(
    systemPrompt: string,
    userMessage: string,
    apiKey: string
  ): Promise<NewsAIResult> {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
      generationConfig: {
        responseMimeType: "application/json",
      }
    });

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
      if (!Array.isArray(parsed.headline_ids)) {
        throw new Error('Response JSON missing "headline_ids" array');
      }
      if (!Array.isArray(parsed.selection_reasons)) {
        throw new Error('Response JSON missing "selection_reasons" array');
      }

      // Cost calculation for Gemini 2 Flash
      const inputTokens = response.usageMetadata?.promptTokenCount || 0;
      const outputTokens = response.usageMetadata?.candidatesTokenCount || 0;
      const cost = (inputTokens * 0.1 / 1000000) + (outputTokens * 0.4 / 1000000);

      return {
        text: parsed.summary,
        headlineIds: parsed.headline_ids,
        selectionReasons: this.normalizeSelectionReasons(parsed.selection_reasons),
        inputTokens,
        outputTokens,
        cost,
        provider: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      };
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : 'Unknown error';
      throw new Error(`Failed to parse Gemini response: ${errorMsg}. Raw text: ${text.substring(0, 200)}`);
    }
  }

  private buildNewsPrompt(headlines: NewsHeadline[]): { systemPrompt: string; userMessage: string } {
    const headlineRows = headlines
      .map((headline, index) => `${this.getHeadlineId(index)}. ${headline.source}: ${headline.title}`)
      .join('\n');

    const systemPrompt = `You generate concise news summaries and select display headlines for a kitchen e-ink display. You will receive candidate headlines from BBC News, ABC News Australia, Radio New Zealand, and Yle Finland.

Return JSON:
{
  "summary": "concise news summary, 60-78 chars total (including spaces and punctuation), no ending punctuation",
  "headline_ids": ["H1", "H2", "H3", "H4"],
  "selection_reasons": [
    { "id": "H1", "reason": "brief reason for selecting this original headline" }
  ]
}

Style:
- Write like a news anchor delivering a brief update
- Focus on the most significant or recurring stories across sources
- Be factual and neutral
- Mention specific events, places, or developments
- The summary should reflect the selected headline_ids, not lower-priority unselected stories

Rules:
- DO NOT use phrases like "today's headlines" or "in the news"
- DO NOT be vague - mention specific stories or developments
- MUST be between 60-78 characters total (including spaces and punctuation)
- DO NOT use ending punctuation
- Select the 4 most important headlines for display from the candidate list
- The selected headlines MUST be about different news events; skip duplicates or near-duplicates
- Return ONLY headline IDs in headline_ids
- NEVER translate, edit, shorten, rewrite, or invent headline text
- Consider Finnish Yle headlines normally. You may understand/translate internally, but only return IDs and reasons.
- Prefer broad public impact: disasters, war, geopolitics, government, economy, public health, climate, severe weather, public safety
- Penalize celebrity, media-personality, sport, lifestyle, novelty, and curiosity stories unless clearly nationally or internationally significant
- Prefer stories appearing across multiple sources, but select only one headline for that event
- Use source diversity as an important quality check after applying importance and duplicate rules
- Prefer at least 3 different sources in the 4 selected headlines when those sources have qualifying public-interest stories
- Do not select more than 2 headlines from one source unless the other sources lack strong public-impact candidates
- When choosing between duplicate-event headlines, prefer the clearest, most informative original headline

Examples:
{"summary": "Climate summit opens, markets rally and hospital strike escalates", "headline_ids": ["H3", "H8", "H12", "H19"], "selection_reasons": [{"id": "H3", "reason": "geopolitics and broad public impact"}, {"id": "H8", "reason": "economy story with wide relevance"}, {"id": "H12", "reason": "public health service disruption"}, {"id": "H19", "reason": "severe weather risk"}]}
{"summary": "Prime Minister sets election date as flooding continues in NSW", "headline_ids": ["H2", "H7", "H10", "H18"], "selection_reasons": [{"id": "H2", "reason": "national politics"}, {"id": "H7", "reason": "public safety and weather impact"}, {"id": "H10", "reason": "international conflict"}, {"id": "H18", "reason": "economic policy impact"}]}

Remember:
- Summary must be at least 60 characters and CANNOT be more than 78 total characters
- You MUST return valid JSON ONLY
- Focus on the most important 2-3 stories for the summary
- headline_ids must contain up to 4 IDs from the candidate list, in display priority order
- selection_reasons must include one short reason object for each selected ID
`;

    const userMessage = `Candidate headlines:

${headlineRows}

Generate a concise summary and choose the 4 most important non-duplicate headline IDs for display. Apply the editorial rubric strictly.`;

    return { systemPrompt, userMessage };
  }

  private mapSelectedHeadlineIds(headlines: NewsHeadline[], headlineIds: string[]): NewsHeadline[] {
    const selected: NewsHeadline[] = [];
    const seenIds = new Set<string>();

    for (const id of headlineIds) {
      const normalizedId = String(id).trim().toUpperCase();
      if (seenIds.has(normalizedId)) continue;
      seenIds.add(normalizedId);

      const index = this.parseHeadlineId(normalizedId);
      const headline = index == null ? null : headlines[index];
      if (headline) selected.push(headline);
      if (selected.length >= 4) break;
    }

    if (selected.length >= 4) return selected;

    for (const fallback of this.getFallbackDisplayHeadlines(headlines)) {
      if (!selected.includes(fallback)) selected.push(fallback);
      if (selected.length >= 4) break;
    }

    return selected;
  }

  private normalizeSelectionReasons(reasons: Array<{ id: string; reason: string }>): Record<string, string> {
    return reasons.reduce((acc, item) => {
      const id = String(item.id || '').trim().toUpperCase();
      const reason = String(item.reason || '').trim();
      if (id && reason) acc[id] = reason;
      return acc;
    }, {} as Record<string, string>);
  }

  private getFallbackDisplayHeadlines(headlines: NewsHeadline[]): NewsHeadline[] {
    const seenSources = new Set<string>();
    const selected: NewsHeadline[] = [];

    for (const headline of headlines) {
      if (!seenSources.has(headline.source)) {
        selected.push(headline);
        seenSources.add(headline.source);
        if (selected.length >= 4) return selected;
      }
    }

    for (const headline of headlines) {
      if (!selected.includes(headline)) {
        selected.push(headline);
        if (selected.length >= 4) break;
      }
    }

    return selected;
  }

  private getHeadlineId(index: number): string {
    return `H${index + 1}`;
  }

  private parseHeadlineId(id: string): number | null {
    const match = id.match(/^H(\d+)$/);
    if (!match) return null;
    const index = Number(match[1]) - 1;
    return Number.isInteger(index) && index >= 0 ? index : null;
  }

  mapToDashboard(apiData: NewsData, _config: NewsServiceConfig): NewsData {
    return {
      headlines: apiData.headlines,
      displayHeadlines: apiData.displayHeadlines,
      summary: apiData.summary,
      _meta: apiData._meta,
    };
  }
}
