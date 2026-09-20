import { scrapeProduct } from '../scraper/productScraper.js';
import { supabaseService } from './supabaseService.js';
import { randomUUID } from 'crypto';

/**
 * ScraperService: Orchestrates cron scrape runs.
 *
 * Responsibilities:
 *  - Creates a scrape_run record for deduplication / idempotency
 *  - Iterates tracked products SEQUENTIALLY (Render memory limits)
 *  - Calls persistSuccessfulScrape / persistFailedScrape honestly
 *  - Never writes invalid price or missing stock to the database
 *  - Finalizes the run record on completion or error
 */

/**
 * Run a full scrape of all active tracked products.
 *
 * @param {Object} opts
 * @param {string} [opts.triggeredBy='cron'] - 'cron' or 'manual'
 * @param {boolean} [opts.headed=false]
 * @returns {Promise<Object>} Run summary
 */
export async function runFullScrape(opts = {}) {
  const triggeredBy = opts.triggeredBy || 'cron';
  const headed = opts.headed === true;

  const runId = randomUUID();
  const runStartTime = Date.now();

  console.log(`\n${'='.repeat(70)}`);
  console.log(`[ScraperService] Starting scrape run: ${runId}`);
  console.log(`[ScraperService] Triggered by: ${triggeredBy.toUpperCase()}`);
  console.log(`${'='.repeat(70)}\n`);

  // Create a DB run record to lock concurrent executions
  await supabaseService.createScrapeRun(runId, triggeredBy);

  let trackedProducts = [];
  try {
    trackedProducts = await supabaseService.getTrackedProducts(true /* onlyActive */);
  } catch (err) {
    console.error('[ScraperService] Failed to fetch tracked products:', err.message);
    await supabaseService.finalizeScrapeRun(runId, {
      status: 'FAILED',
      totalProducts: 0,
      successes: 0,
      failures: 0
    });
    return {
      runId,
      status: 'FAILED',
      error: 'Could not retrieve tracked products from database',
      totalProducts: 0,
      successes: 0,
      failures: 0,
      durationMs: Date.now() - runStartTime
    };
  }

  if (trackedProducts.length === 0) {
    console.log('[ScraperService] No active tracked products found. Run complete with no work.');
    await supabaseService.finalizeScrapeRun(runId, {
      status: 'COMPLETED',
      totalProducts: 0,
      successes: 0,
      failures: 0
    });
    return {
      runId,
      status: 'COMPLETED',
      totalProducts: 0,
      successes: 0,
      failures: 0,
      results: [],
      durationMs: Date.now() - runStartTime
    };
  }

  console.log(`[ScraperService] Scraping ${trackedProducts.length} active product(s) sequentially...`);

  const results = [];
  let successes = 0;
  let failures = 0;

  for (let i = 0; i < trackedProducts.length; i++) {
    const tp = trackedProducts[i];
    const productForScraper = {
      productId: tp.product_id,
      product_id: tp.product_id,
      id: tp.product_id,
      name: tp.name,
      productUrl: tp.product_url,
      product_url: tp.product_url
    };

    console.log(`\n[ScraperService] [${i + 1}/${trackedProducts.length}] Scraping: "${tp.name}" (product_id: ${tp.product_id})`);

    let scrapeResult;
    try {
      scrapeResult = await scrapeProduct(productForScraper, {
        headed,
        maxAttempts: 3
      });
    } catch (unexpectedErr) {
      // Should never happen since scrapeProduct has its own try/catch,
      // but guard against it anyway
      console.error(`[ScraperService] Unexpected scraper crash for product ${tp.product_id}:`, unexpectedErr.message);
      scrapeResult = {
        status: 'FAILED',
        productId: tp.product_id,
        productName: tp.name,
        price: null,
        currency: null,
        stockStatus: 'UNKNOWN',
        stockCount: null,
        durationMs: 0,
        totalAttempts: 1,
        errorType: 'SCRAPER_CRASH',
        errorMessage: unexpectedErr.message,
        attempts: [{
          attemptNumber: 1,
          status: 'FAILED',
          durationMs: 0,
          priceScraped: null,
          stockScraped: null,
          errorType: 'SCRAPER_CRASH',
          errorMessage: unexpectedErr.message
        }]
      };
    }

    const isSuccess = scrapeResult.status === 'SUCCESS';
    const resultEntry = {
      productId: tp.product_id,
      productName: tp.name,
      status: scrapeResult.status,
      price: scrapeResult.price,
      currency: scrapeResult.currency,
      stockStatus: scrapeResult.stockStatus,
      stockCount: scrapeResult.stockCount,
      durationMs: scrapeResult.durationMs,
      totalAttempts: scrapeResult.totalAttempts,
      errorType: scrapeResult.errorType,
      errorMessage: scrapeResult.errorMessage
    };

    if (isSuccess) {
      successes++;
      console.log(`[ScraperService] ✅ Product ${tp.product_id}: ₹${scrapeResult.price} | ${scrapeResult.stockStatus}`);
      try {
        await supabaseService.persistSuccessfulScrape(tp.id, scrapeResult, runId);
        resultEntry.persisted = true;
      } catch (persistErr) {
        console.error(`[ScraperService] ⚠️ Failed to persist success for product ${tp.product_id}:`, persistErr.message);
        resultEntry.persistError = persistErr.message;
      }
    } else {
      failures++;
      console.warn(`[ScraperService] ❌ Product ${tp.product_id} FAILED: ${scrapeResult.errorMessage}`);
      try {
        await supabaseService.persistFailedScrape(tp.id, scrapeResult, runId);
        resultEntry.persisted = true;
      } catch (persistErr) {
        console.error(`[ScraperService] ⚠️ Failed to persist failure for product ${tp.product_id}:`, persistErr.message);
        resultEntry.persistError = persistErr.message;
      }
    }

    results.push(resultEntry);
  }

  const finalStatus = failures === 0 ? 'COMPLETED' : successes === 0 ? 'FAILED' : 'PARTIAL';
  const totalDurationMs = Date.now() - runStartTime;

  await supabaseService.finalizeScrapeRun(runId, {
    status: finalStatus,
    totalProducts: trackedProducts.length,
    successes,
    failures
  });

  console.log(`\n${'='.repeat(70)}`);
  console.log(`[ScraperService] Run ${runId} complete.`);
  console.log(`[ScraperService] Status: ${finalStatus} | Products: ${trackedProducts.length} | ✅ ${successes} | ❌ ${failures} | Duration: ${totalDurationMs}ms`);
  console.log(`${'='.repeat(70)}\n`);

  return {
    runId,
    status: finalStatus,
    totalProducts: trackedProducts.length,
    successes,
    failures,
    results,
    durationMs: totalDurationMs
  };
}

/**
 * Scrape a single product by its tracked_products.product_id.
 * Reuses the same scraper service as cron.
 *
 * @param {number} productId
 * @param {Object} [opts]
 * @returns {Promise<Object>} Scrape result
 */
export async function scrapeOneProduct(productId, opts = {}) {
  const pId = parseInt(productId, 10);
  if (isNaN(pId) || pId <= 0) {
    return { success: false, error: 'Invalid productId' };
  }

  const tp = await supabaseService.getTrackedProductByProductId(pId);
  if (!tp) {
    return { success: false, error: `Product ${pId} is not being tracked` };
  }
  if (!tp.is_active) {
    return { success: false, error: `Product ${pId} is tracked but not active (deactivated)` };
  }

  const runId = `manual-${randomUUID()}`;
  await supabaseService.createScrapeRun(runId, 'manual');

  const productForScraper = {
    productId: tp.product_id,
    id: tp.product_id,
    name: tp.name,
    productUrl: tp.product_url
  };

  let scrapeResult;
  try {
    scrapeResult = await scrapeProduct(productForScraper, {
      headed: opts.headed === true,
      maxAttempts: opts.maxAttempts || 3
    });
  } catch (err) {
    scrapeResult = {
      status: 'FAILED',
      productId: pId,
      productName: tp.name,
      price: null,
      currency: null,
      stockStatus: 'UNKNOWN',
      stockCount: null,
      durationMs: 0,
      totalAttempts: 1,
      errorType: 'SCRAPER_CRASH',
      errorMessage: err.message,
      attempts: [{
        attemptNumber: 1,
        status: 'FAILED',
        durationMs: 0,
        priceScraped: null,
        stockScraped: null,
        errorType: 'SCRAPER_CRASH',
        errorMessage: err.message
      }]
    };
  }

  const isSuccess = scrapeResult.status === 'SUCCESS';

  try {
    if (isSuccess) {
      await supabaseService.persistSuccessfulScrape(tp.id, scrapeResult, runId);
    } else {
      await supabaseService.persistFailedScrape(tp.id, scrapeResult, runId);
    }
  } catch (persistErr) {
    console.error(`[ScraperService] Persistence error for manual scrape of product ${pId}:`, persistErr.message);
  }

  await supabaseService.finalizeScrapeRun(runId, {
    status: isSuccess ? 'COMPLETED' : 'FAILED',
    totalProducts: 1,
    successes: isSuccess ? 1 : 0,
    failures: isSuccess ? 0 : 1
  });

  return {
    runId,
    ...scrapeResult
  };
}
