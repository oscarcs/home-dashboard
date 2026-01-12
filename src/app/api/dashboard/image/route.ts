import { setStateKey } from '@/lib/state';
import { NextRequest, NextResponse } from 'next/server';
import type { Browser } from 'puppeteer';

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  let browser: Browser | null = null;
  try {
    const puppeteer = await import('puppeteer');
    const sharp = await import('sharp');
    const fs = await import('fs');
    const baseUrl = `${request.nextUrl.protocol}//${request.nextUrl.host}`;

    // Get display dimensions from env
    const displayWidth = parseInt(process.env.DISPLAY_WIDTH || '800', 10);
    const displayHeight = parseInt(process.env.DISPLAY_HEIGHT || '480', 10);

    // Build display URL with battery param if provided
    const batteryParam = request.nextUrl.searchParams.get('battery');
    const displayUrl = batteryParam !== null
      ? `${baseUrl}/dashboard?battery=${encodeURIComponent(batteryParam)}`
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
      deviceScaleFactor: 1, // 1:1 pixel mapping for e-ink
    });

    await page.goto(displayUrl, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    // Force strict pixel rendering
    await page.addStyleTag({
      content: `
        *, *::before, *::after {
          -webkit-font-smoothing: none !important;
          -moz-osx-font-smoothing: none !important;
          font-smooth: never !important;
          text-rendering: optimizeSpeed !important;
          shape-rendering: crispEdges !important;
        }
        /* Hide Next.js dev overlay elements */
        nextjs-portal, [data-nextjs-toast], #__next-build-watcher, #next-route-announcer {
          display: none !important;
        }
      `
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

    // Convert to 1-bit black and white PNG for e-paper using simple threshold
    const processedImage = await sharp.default(screenshot)
      .greyscale()
      .threshold(128)
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

    return new NextResponse(Buffer.from(processedImage), {
      headers: {
        'Content-Type': 'image/png',
        'Content-Disposition': 'attachment; filename="dashboard.png"',
        'Content-Length': processedImage.length.toString()
      }
    });
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
    return NextResponse.json(
      {
        error: 'Failed to generate screenshot',
        details: errorMessage
      },
      { status: 500 }
    );
  }
}
