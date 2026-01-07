import express, { Request, Response, Router } from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import type { Browser } from 'puppeteer';
import { buildDashboardData } from '../lib/dataBuilder.js';
import { getBaseUrl } from '../lib/utils.js';
import { setStateKey } from '../lib/state.js';
import type { DashboardData } from '../lib/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router: Router = express.Router();

/**
 * GET /api/dashboard - Dashboard data API
 */
router.get('/api/dashboard', async (req: Request, res: Response): Promise<void> => {
  try {
    const data: DashboardData = await buildDashboardData(req, console);
    // Remove internal service statuses from public API response
    const { _serviceStatuses, ...publicData } = data;
    res.type('application/json').status(200).json(publicData);
  } catch (error) {
    console.error('Error generating dashboard data:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      error: 'Failed to generate dashboard data',
      details: errorMessage
    });
  }
});

/**
 * GET /dashboard - Server-side rendered dashboard view
 */
router.get('/dashboard', async (req: Request, res: Response): Promise<void> => {
  try {
    const data = await buildDashboardData(req, console);
    const extendedData = {
      ...data,
      isDevelopment: true,
      battery_level: null as number | null,
      hasCustomFonts: false,
      display_width: 800,
      display_height: 480
    };

    // Parse battery level from query param (0-100) if provided
    const batteryParam = req.query.battery;
    if (batteryParam !== undefined) {
      const parsedBattery = parseInt(String(batteryParam), 10);
      extendedData.battery_level = isNaN(parsedBattery) ? null : parsedBattery;
    }

    // (Optional) Check if custom fonts exist
    const customFontsPath = path.join(__dirname, '../views/styles/fonts/fonts.css');
    extendedData.hasCustomFonts = fs.existsSync(customFontsPath);

    // Display dimensions from env
    extendedData.display_width = parseInt(process.env.DISPLAY_WIDTH || '800', 10);
    extendedData.display_height = parseInt(process.env.DISPLAY_HEIGHT || '480', 10);

    res.render('dashboard', extendedData);
  } catch (error) {
    console.error('Error rendering dashboard display:', error);
    res.status(500).send('Failed to render dashboard display');
  }
});

/**
 * GET /dashboard/image - Generate screenshot for e-paper display
 */
router.get('/dashboard/image', async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  let browser: Browser | null = null;
  try {
    const puppeteer = await import('puppeteer');
    const sharp = await import('sharp');
    const baseUrl = getBaseUrl(req);

    // Get display dimensions from env
    const displayWidth = parseInt(process.env.DISPLAY_WIDTH || '800', 10);
    const displayHeight = parseInt(process.env.DISPLAY_HEIGHT || '480', 10);

    // Build display URL with battery param if provided
    const batteryParam = req.query.battery;
    const displayUrl = batteryParam !== undefined
      ? `${baseUrl}/dashboard?battery=${encodeURIComponent(String(batteryParam))}`
      : `${baseUrl}/dashboard`;

    // Check for system Chrome
    const systemChromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    const useSystemChrome = fs.existsSync(systemChromePath);

    browser = await puppeteer.launch({
      headless: true,
      pipe: true,
      timeout: 60000,
      executablePath: useSystemChrome ? systemChromePath : undefined,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--font-render-hinting=none',
        '--force-color-profile=srgb'
      ]
    });

    const page = await browser.newPage();

    // Log page errors
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

    await page.setViewport({
      width: displayWidth,
      height: displayHeight,
      deviceScaleFactor: 4
    });

    await page.goto(displayUrl, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    // Wait for fonts and icons to load
    await page.evaluateHandle('document.fonts.ready');
    await new Promise(resolve => setTimeout(resolve, 500));

    const screenshot = await page.screenshot({
      type: 'png',
      fullPage: false
    });

    await browser.close();
    browser = null;

    // Convert to 1-bit black and white PNG for e-paper
    const processedImage = await sharp.default(screenshot)
      .greyscale()
      .resize(displayWidth, displayHeight, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255 },
        kernel: sharp.default.kernel.lanczos3
      })
      .normalise()
      .linear(1.2, -(128 * 0.2))
      .threshold(190)
      .png({
        palette: true,
        colors: 2,
        compressionLevel: 9
      })
      .toBuffer();

    // Log image info
    const meta = await sharp.default(processedImage).metadata();
    const latency = Date.now() - startTime;
    console.log(`Processed image: ${processedImage.length} bytes, ${meta.width}x${meta.height}, ${meta.channels} channels, ${latency}ms`);

    // Track successful sync
    setStateKey('last_display_sync', {
      timestamp: Date.now(),
      status: 'success',
      imageSize: processedImage.length,
      latency: latency,
      error: null
    });

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', 'attachment; filename="dashboard.png"');
    res.send(processedImage);
  } catch (error) {
    console.error('Error generating display screenshot:', error);

    const latency = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Track failed sync
    setStateKey('last_display_sync', {
      timestamp: Date.now(),
      status: 'failed',
      imageSize: null,
      latency: latency,
      error: errorMessage
    });

    if (browser) {
      try { await browser.close(); } catch (e) { /* ignore */ }
    }
    res.status(500).json({
      error: 'Failed to generate screenshot',
      details: errorMessage
    });
  }
});

export default router;
