import { execSync } from 'child_process';

let playwrightModule = null;

async function getChromium() {
  if (!playwrightModule) {
    playwrightModule = await import('playwright');
  }
  return playwrightModule.chromium;
}

/**
 * Creates and configures a Playwright browser instance and context.
 * Features automatic self-healing: if Chromium binary is missing on Render cloud host,
 * it auto-installs Chromium on the fly and retries seamlessly.
 */
export async function createBrowserSession(options = {}) {
  const isHeaded = options.headed === true || process.env.HEADLESS === 'false';
  const slowMo = isHeaded ? (options.slowMo ?? 50) : 0;

  const launchOptions = {
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
  };

  const chromium = await getChromium();
  let browser = null;

  try {
    browser = await chromium.launch(launchOptions);
  } catch (err) {
    const isMissingBinary = err.message.includes("Executable doesn't exist") || 
                            err.message.includes('playwright install') ||
                            err.message.includes('Looks like Playwright was just installed');

    if (isMissingBinary) {
      console.warn('[BrowserManager] ⚠️ Chromium binary missing on host. Triggering automatic download & install...');
      try {
        execSync('npx playwright install chromium', {
          stdio: 'inherit',
          env: process.env
        });
        console.log('[BrowserManager] ✅ Chromium installation complete! Retrying browser launch...');
        browser = await chromium.launch(launchOptions);
      } catch (installErr) {
        console.error('[BrowserManager] ❌ Auto-install failed:', installErr.message);
        throw err;
      }
    } else {
      throw err;
    }
  }

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
