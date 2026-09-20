import { chromium } from 'playwright';

/**
 * Creates and configures a Playwright browser instance and context.
 * PLAYWRIGHT_BROWSERS_PATH=0 must be set at runtime so Playwright resolves
 * Chromium from node_modules instead of /opt/render/.cache (which is wiped on Render free tier).
 */
export async function createBrowserSession(options = {}) {
  const isHeaded = options.headed === true || process.env.HEADLESS === 'false';
  const slowMo = isHeaded ? (options.slowMo ?? 50) : 0;

  const browser = await chromium.launch({
    headless: !isHeaded,
    slowMo,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--single-process',
      '--disable-blink-features=AutomationControlled'
    ]
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    locale: 'en-IN',
    timezoneId: 'Asia/Kolkata'
  });

  // Resource optimization: block heavy video/audio media only
  if (!isHeaded) {
    await context.route('**/*.{mp4,mp3,wav,avi}', route => {
      route.abort();
    });
  }

  const page = await context.newPage();

  return {
    browser,
    context,
    page,
    isHeaded
  };
}
