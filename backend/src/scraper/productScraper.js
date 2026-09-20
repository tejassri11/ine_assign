import path from 'path';
import { fileURLToPath } from 'url';
import { createBrowserSession } from './browserManager.js';
import { handleCookieBanner } from './cookieHandler.js';
import { executeRevealInteraction, extractRealPriceAndStock } from './humanInteraction.js';
import { cleanAndParsePrice } from './priceParser.js';
import { parseStockBadge, validateScrapedProduct } from './validators.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCREENSHOTS_DIR = path.resolve(__dirname, '../../screenshots');

/**
 * Single scrape execution attempt (runs inside a fresh browser instance)
 */
async function executeSingleScrapeAttempt(product, options, attemptNumber) {
  const startTime = Date.now();
  const productId = parseInt(product.productId ?? product.product_id ?? product.id, 10);
  const targetUrl = product.productUrl || product.product_url || `https://demo.inelabteamdev.com/product/${productId}`;

  let session = null;

  try {
    // Layer 6: Recreate Browser/Context/Page freshly on each attempt
    session = await createBrowserSession(options);
    const { page } = session;

    console.log(`[Scraper] Attempt ${attemptNumber}: Navigating to ${targetUrl}...`);
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });

    // Ensure React app and product container mounted
    await page.waitForSelector('.detail, .detail-info, .price-block, #root', { timeout: 25000 });

    // Dismiss any initial cookie modal
    await handleCookieBanner(page, 1500);

    // Layer 2, 3, 4: Execute hover dwell, movement count, and click-and-verify loop
    const { isSuccess } = await executeRevealInteraction(page, options);

    if (!isSuccess) {
      // Store returned error state (intentional mock store 500/429 transient error)
      const errorMsg = await page.locator('.price-block.price-error .price-substatus, .price-block.price-error .price-status')
        .first()
        .textContent()
        .catch(() => 'Store failed to return price after retries');

      const cleanError = errorMsg ? errorMsg.trim() : 'Store responded with error';
      console.warn(`[Scraper] Attempt ${attemptNumber}: Store responded with error UI: "${cleanError}"`);

      // Capture screenshot of store error UI for audit
      const screenshotPath = path.join(SCREENSHOTS_DIR, `error-${productId}-att${attemptNumber}-${Date.now()}.png`);
      await page.screenshot({ path: screenshotPath }).catch(() => {});

      return {
        success: false,
        isTransient: true, // Worth retrying in outer loop
        errorType: 'STORE_ERROR_RESPONSE',
        errorMessage: cleanError,
        durationMs: Date.now() - startTime
      };
    }

    // Layer 7: Honeypot Protection: Extract only visible, non-decoy price and stock
    console.log(`[Scraper] Attempt ${attemptNumber}: Price revealed. Extracting visible price and stock...`);
    const rawData = await extractRealPriceAndStock(page);

    if (!rawData.priceText) {
      throw new Error('Price element could not be found or all candidates were honeypot decoys');
    }

    // Layer 8: Price Normalization (strips zero-width spaces, NBSPs, unicode digits)
    const priceResult = cleanAndParsePrice(rawData.priceText);
    if (!priceResult) {
      throw new Error(`Failed to parse extracted price text: "${rawData.priceText}"`);
    }

    // Layer 9: Stock Validation (strictly distinguishes IN_STOCK, OUT_OF_STOCK, UNKNOWN)
    const stockResult = parseStockBadge(rawData.stockText);

    const candidateResult = {
      status: 'SUCCESS',
      productId,
      productName: product.name || `Product ${productId}`,
      price: priceResult.price,
      currency: priceResult.currency,
      stockStatus: stockResult.status,
      stockCount: stockResult.count,
      durationMs: Date.now() - startTime,
      extractionMethod: 'playwright_interactive',
      errorType: null,
      errorMessage: null
    };

    // Layer 10: Central Validation: Ensure NO WRONG DATA is returned
    const validation = validateScrapedProduct(candidateResult);
    if (!validation.isValid) {
      const valError = `Validation failed: ${validation.errors.join('; ')}`;
      console.error(`[Scraper] Attempt ${attemptNumber}: ❌ ${valError}`);
      return {
        success: false,
        isTransient: false, // Do not blindly retry permanent validation failures
        errorType: 'VALIDATION_FAILURE',
        errorMessage: valError,
        durationMs: Date.now() - startTime
      };
    }

    return {
      success: true,
      data: candidateResult,
      durationMs: Date.now() - startTime
    };

  } catch (error) {
    console.error(`[Scraper] Attempt ${attemptNumber} Exception:`, error.message);

    if (session && session.page) {
      const errorScreenshot = path.join(SCREENSHOTS_DIR, `exception-${productId}-att${attemptNumber}-${Date.now()}.png`);
      await session.page.screenshot({ path: errorScreenshot }).catch(() => {});
    }

    // Determine if transient
    const isTransient = /timeout|closed|connection|reset|econnreset|navigation/i.test(error.message) || error.name === 'TimeoutError';

    return {
      success: false,
      isTransient,
      errorType: error.name || 'SCRAPE_EXCEPTION',
      errorMessage: error.message,
      durationMs: Date.now() - startTime
    };
  } finally {
    // Always close browser immediately to prevent memory leaks and ensure fresh browser next attempt
    if (session && session.browser) {
      await session.browser.close().catch(() => {});
    }
  }
}

/**
 * Hardened Production-Style Scraper with Outer Retries, Fresh Browsers, and Honest Observability
 * 
 * @param {Object} product Product record from catalog or tracked_products
 * @param {Object} options Options { headed?: boolean, maxAttempts?: number, slowMo?: number }
 * @returns {Promise<Object>} Standardized result with full attempt history
 */
export async function scrapeProduct(product, options = {}) {
  const overallStart = Date.now();
  const maxAttempts = Math.min(Math.max(1, options.maxAttempts ?? 3), 5);
  const productId = parseInt(product.productId ?? product.product_id ?? product.id, 10);
  const productName = product.name || `Product ${productId}`;

  console.log(`\n========================================================`);
  console.log(`[Scraper] Commencing scrape for: "${productName}" (ID: ${productId})`);
  console.log(`[Scraper] Max Outer Retry Attempts: ${maxAttempts}`);
  console.log(`[Scraper] Mode: ${options.headed ? 'HEADED (Visible)' : 'HEADLESS'}`);
  console.log(`========================================================`);

  if (isNaN(productId) || productId <= 0) {
    return {
      status: 'FAILED',
      productId: null,
      productName,
      price: null,
      currency: null,
      stockStatus: 'UNKNOWN',
      stockCount: null,
      durationMs: Date.now() - overallStart,
      totalAttempts: 0,
      extractionMethod: 'playwright_interactive',
      errorType: 'INVALID_PRODUCT_ID',
      errorMessage: 'Invalid productId provided for scraping',
      attempts: []
    };
  }

  const attemptLogs = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(`\n[Scraper] ---> Executing Outer Attempt ${attempt}/${maxAttempts}...`);

    const attemptResult = await executeSingleScrapeAttempt(product, options, attempt);

    if (attemptResult.success) {
      console.log(`[Scraper] ✅ Attempt ${attempt} SUCCEEDED in ${attemptResult.durationMs}ms!`);

      attemptLogs.push({
        attemptNumber: attempt,
        status: 'SUCCESS',
        durationMs: attemptResult.durationMs,
        priceScraped: attemptResult.data.price,
        stockScraped: attemptResult.data.stockStatus,
        errorType: null,
        errorMessage: null
      });

      return {
        ...attemptResult.data,
        durationMs: Date.now() - overallStart,
        totalAttempts: attempt,
        attempts: attemptLogs
      };
    }

    // If attempt failed
    const willRetry = attempt < maxAttempts && attemptResult.isTransient;
    const attemptStatus = willRetry ? 'RETRIED' : 'FAILED';

    console.warn(`[Scraper] ⚠️ Attempt ${attempt} status: ${attemptStatus} (${attemptResult.errorType}: ${attemptResult.errorMessage})`);

    attemptLogs.push({
      attemptNumber: attempt,
      status: attemptStatus,
      durationMs: attemptResult.durationMs,
      priceScraped: null,
      stockScraped: null,
      errorType: attemptResult.errorType,
      errorMessage: attemptResult.errorMessage
    });

    if (willRetry) {
      // Exponential backoff: attempt 1 -> wait 1000ms, attempt 2 -> wait 2000ms
      const backoffMs = 1000 * attempt;
      console.log(`[Scraper] Waiting ${backoffMs}ms before attempting retry ${attempt + 1}...`);
      await new Promise(resolve => setTimeout(resolve, backoffMs));
    } else {
      break; // Non-transient or max attempts reached
    }
  }

  const lastAttempt = attemptLogs[attemptLogs.length - 1];

  console.error(`[Scraper] ❌ All ${attemptLogs.length} attempt(s) exhausted. Final outcome: FAILED.`);

  return {
    status: 'FAILED',
    productId,
    productName,
    price: null,
    currency: null,
    stockStatus: 'UNKNOWN',
    stockCount: null,
    durationMs: Date.now() - overallStart,
    totalAttempts: attemptLogs.length,
    extractionMethod: 'playwright_interactive',
    errorType: lastAttempt ? lastAttempt.errorType : 'SCRAPE_FAILED',
    errorMessage: lastAttempt ? lastAttempt.errorMessage : 'Scrape attempts exhausted',
    attempts: attemptLogs
  };
}
