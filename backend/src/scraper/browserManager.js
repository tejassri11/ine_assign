import { chromium } from 'playwright';
import { execSync } from 'child_process';

/**
 * Launches Chromium with automatic self-healing fallback.
 * If Chromium is missing from server cache, runs `npx playwright install chromium` on demand.
 */
async function launchChromiumWithFallback(launchOptions) {
  try {
    return await chromium.launch(launchOptions);
  } catch (err) {
    const isMissingBinary = err.message.includes("Executable doesn't exist") || 
                            err.message.includes("Please run the following command") ||
                            err.message.includes("chrome-headless-shell");
                            
    if (isMissingBinary) {
      console.warn('[BrowserManager] ⚠️ Chromium binary missing from runtime cache. Triggering self-healing install: npx playwright install chromium...');
      try {
        execSync('npx playwright install chromium', { stdio: 'inherit', env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: '0' } });
        console.log('[BrowserManager] ✅ Chromium installed successfully. Retrying browser launch...');
        return await chromium.launch(launchOptions);
      } catch (installErr) {
        console.error('[BrowserManager] ❌ Self-healing browser installation failed:', installErr.message);
        throw err;
      }
    }
    throw err;
  }
}

/**
 * Creates and configures a Playwright browser instance and context.
 * Supports headed and headless modes, memory optimization for Render,
 * and realistic viewport / user-agent emulation.
 */
export async function createBrowserSession(options = {}) {
  const isHeaded = options.headed === true || process.env.HEADLESS === 'false';
  const slowMo = isHeaded ? (options.slowMo ?? 50) : 0;

  const browser = await launchChromiumWithFallback({
    headless: !isHeaded,
    slowMo,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
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

  // Resource optimization: block heavy video/audio media only to preserve page rendering integrity
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
