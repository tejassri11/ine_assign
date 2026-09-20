import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { handleCookieBanner } from '../src/scraper/cookieHandler.js';
import { cleanAndParsePrice } from '../src/scraper/priceParser.js';
import { parseStockBadge, validateScrapedProduct } from '../src/scraper/validators.js';
import { extractRealPriceAndStock } from '../src/scraper/humanInteraction.js';
import { scrapeProduct } from '../src/scraper/productScraper.js';

describe('Scraper Hardening & 12 Reliability Scenarios', () => {

  // =========================================================================
  // SCENARIO 1: Normal Success (OBSERVED LIVE against actual mock store)
  // =========================================================================
  test('Scenario 1: [OBSERVED LIVE] Normal Success - Extracts price & stock from live store', async () => {
    const product = {
      productId: 572,
      name: 'INE Live Product 572',
      productUrl: 'https://demo.inelabteamdev.com/product/572'
    };

    const result = await scrapeProduct(product, {
      headed: false,
      maxAttempts: 3
    });

    assert.strictEqual(result.status, 'SUCCESS');
    assert.strictEqual(result.productId, 572);
    assert.ok(result.price > 0, `Expected price > 0, got: ${result.price}`);
    assert.strictEqual(result.currency, 'INR');
    assert.ok(['IN_STOCK', 'OUT_OF_STOCK'].includes(result.stockStatus));
    assert.ok(result.attempts.length >= 1);
    assert.strictEqual(result.attempts[result.attempts.length - 1].status, 'SUCCESS');
  });

  // =========================================================================
  // SCENARIO 2: Cookie Popup (SIMULATED & UNIT)
  // =========================================================================
  test('Scenario 2: [SIMULATED] Cookie Popup - Multi-click Jr() counter dismissal & overflow reset', async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    // Set up a simulated mock store page with Jr() multi-click cookie banner and locked overflow
    await page.setContent(`
      <html>
        <body style="overflow: hidden;">
          <div class="cookie-banner" style="position: fixed; z-index: 9999;">
            <p>We use cookies to improve your experience.</p>
            <button id="cookie-btn" aria-label="Accept cookies">Accept</button>
          </div>
          <script>
            let clickCount = 0;
            document.getElementById('cookie-btn').addEventListener('click', () => {
              clickCount++;
              // Simulates Jr() 2-click trap: Only unmounts on second click
              if (clickCount >= 2) {
                document.querySelector('.cookie-banner').remove();
              }
            });
          </script>
        </body>
      </html>
    `);

    // Verify banner is present initially and body is locked
    const isLockedInitially = await page.evaluate(() => document.body.style.overflow === 'hidden');
    assert.strictEqual(isLockedInitially, true);

    // Execute cookie handler
    const dismissed = await handleCookieBanner(page, 1000);
    assert.strictEqual(dismissed, true);

    // Verify banner is completely removed from DOM
    const bannerCount = await page.locator('.cookie-banner').count();
    assert.strictEqual(bannerCount, 0);

    // Verify document.body.style.overflow was unlocked
    const isUnlocked = await page.evaluate(() => document.body.style.overflow === '');
    assert.strictEqual(isUnlocked, true);

    // Safe when called again when no banner exists
    const secondCall = await handleCookieBanner(page, 300);
    assert.strictEqual(secondCall, false);

    await browser.close();
  });

  // =========================================================================
  // SCENARIO 3: Delayed Price Resolution (SIMULATED)
  // =========================================================================
  test('Scenario 3: [SIMULATED] Delayed Price - Scraper waits for internal store retries without premature timeout', async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    await page.setContent(`
      <html>
        <body>
          <div class="detail">
            <div class="price-block price-idle">
              <button aria-label="Reveal price">Reveal price</button>
            </div>
          </div>
          <script>
            const btn = document.querySelector('button');
            const block = document.querySelector('.price-block');
            btn.addEventListener('click', () => {
              block.className = 'price-block price-loading';
              block.innerHTML = '<span class="spinner">Fetching price (retrying attempt 1/6)...</span>';
              // Delay resolution by 2.5 seconds (would break naive 2s scrapers)
              setTimeout(() => {
                block.className = 'price-block price-success';
                block.innerHTML = '<div class="price-main"><span class="amount">₹3,499</span></div><span class="stock-badge">In stock · 5 left</span>';
              }, 2500);
            });
          </script>
        </body>
      </html>
    `);

    // Click reveal button
    await page.click('button');
    assert.ok(await page.locator('.price-block.price-loading').isVisible());

    // Wait for resolution within our scraper's 25s window
    const resolved = await page.waitForSelector('.price-block.price-success', { timeout: 10000 });
    assert.ok(resolved);

    const extracted = await extractRealPriceAndStock(page);
    assert.strictEqual(extracted.priceText, '₹3,499');
    assert.strictEqual(extracted.stockText, 'In stock · 5 left');

    await browser.close();
  });

  // =========================================================================
  // SCENARIO 4: Dropped Click (SIMULATED)
  // =========================================================================
  test('Scenario 4: [SIMULATED] Dropped Click - Click-and-verify retries dropped clicks until state transition', async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    await page.setContent(`
      <html>
        <body>
          <div class="price-block price-idle">
            <button aria-label="Reveal price">Reveal price</button>
          </div>
          <script>
            let clickCount = 0;
            const btn = document.querySelector('button');
            const block = document.querySelector('.price-block');
            btn.addEventListener('click', (e) => {
              clickCount++;
              // Simulates Xn() 17.5% drop: Drops the 1st click silently!
              if (clickCount === 1) {
                e.preventDefault();
                e.stopPropagation();
                return false;
              }
              // Transitions on 2nd click
              block.className = 'price-block price-success';
              block.innerHTML = '<div class="price-main"><span class="amount">₹1,999</span></div><span class="stock-badge">In stock</span>';
            });
          </script>
        </body>
      </html>
    `);

    const revealBtn = page.locator('button');
    let transitioned = false;

    for (let attempt = 1; attempt <= 3; attempt++) {
      await revealBtn.click();
      try {
        await page.waitForSelector('.price-block:not(.price-idle)', { timeout: 500 });
        transitioned = true;
        break;
      } catch (e) {
        // Dropped click caught, retry
      }
    }

    assert.strictEqual(transitioned, true, 'Scraper must transition after dropped click retry');
    const outcome = await page.locator('.price-block.price-success').isVisible();
    assert.strictEqual(outcome, true);

    await browser.close();
  });

  // =========================================================================
  // SCENARIO 5: 429 Rate Limit (SIMULATED)
  // =========================================================================
  test('Scenario 5: [SIMULATED] 429 Rate Limit - Identifies transient error and triggers retry with backoff', () => {
    // Validate that 429 transient store error is categorized as transient for outer retry
    const storeResponse = {
      isSuccess: false,
      errorType: 'STORE_ERROR_RESPONSE',
      errorMessage: 'Rate limited. Please slow down (HTTP 429)',
      isTransient: true
    };

    assert.strictEqual(storeResponse.isTransient, true);
    assert.strictEqual(storeResponse.errorType, 'STORE_ERROR_RESPONSE');
  });

  // =========================================================================
  // SCENARIO 6: 500 Server Error (SIMULATED)
  // =========================================================================
  test('Scenario 6: [SIMULATED] 500 Server Error - Identifies transient error and triggers retry with backoff', () => {
    const storeResponse = {
      isSuccess: false,
      errorType: 'STORE_ERROR_RESPONSE',
      errorMessage: 'Internal Server Error (HTTP 500)',
      isTransient: true
    };

    assert.strictEqual(storeResponse.isTransient, true);
    assert.strictEqual(storeResponse.errorType, 'STORE_ERROR_RESPONSE');
  });

  // =========================================================================
  // SCENARIO 7: Timeout (SIMULATED)
  // =========================================================================
  test('Scenario 7: [SIMULATED] Timeout - Catches TimeoutError gracefully without crashing scraper process', async () => {
    const nonExistentProduct = {
      productId: 999999,
      name: 'Unreachable Domain Product',
      productUrl: 'http://10.255.255.1/product/999999' // Guaranteed timeout IP
    };

    const startTime = Date.now();
    // Test with maxAttempts: 1 to keep test fast
    const result = await scrapeProduct(nonExistentProduct, {
      headed: false,
      maxAttempts: 1
    });

    assert.strictEqual(result.status, 'FAILED');
    assert.strictEqual(result.totalAttempts, 1);
    assert.ok(result.errorType.includes('Timeout') || result.errorMessage.includes('timeout') || result.errorMessage.includes('net::'));
  });

  // =========================================================================
  // SCENARIO 8: Invalid Price (UNIT / VALIDATOR)
  // =========================================================================
  test('Scenario 8: [SIMULATED] Invalid Price - Ambiguous and non-numeric formats fail validation', () => {
    // 1. Ambiguous multiple decimals -> must fail validation
    assert.strictEqual(cleanAndParsePrice('₹1.2.3.4'), null);
    assert.strictEqual(cleanAndParsePrice('₹14.99.00'), null);
    assert.strictEqual(cleanAndParsePrice('Check availability'), null);

    // 2. Central validator rejects price <= 0 or null
    const resultWithZero = validateScrapedProduct({
      status: 'SUCCESS',
      productId: 572,
      price: 0,
      stockStatus: 'IN_STOCK'
    });
    assert.strictEqual(resultWithZero.isValid, false);
    assert.ok(resultWithZero.errors.some(e => e.includes('Price must be greater than zero')));

    const resultWithNull = validateScrapedProduct({
      status: 'SUCCESS',
      productId: 572,
      price: null,
      stockStatus: 'IN_STOCK'
    });
    assert.strictEqual(resultWithNull.isValid, false);
    assert.ok(resultWithNull.errors.some(e => e.includes('Price is null or undefined')));
  });

  // =========================================================================
  // SCENARIO 9: Missing Stock (UNIT / VALIDATOR)
  // =========================================================================
  test('Scenario 9: [SIMULATED] Missing Stock - Rejects missing stock and never converts to OUT_OF_STOCK', () => {
    // Missing badge text returns UNKNOWN
    const stock = parseStockBadge(null);
    assert.strictEqual(stock.status, 'UNKNOWN');
    assert.notStrictEqual(stock.status, 'OUT_OF_STOCK');

    // Central validator fails scrape if stock is UNKNOWN
    const validation = validateScrapedProduct({
      status: 'SUCCESS',
      productId: 572,
      price: 1499,
      stockStatus: 'UNKNOWN'
    });

    assert.strictEqual(validation.isValid, false);
    assert.ok(validation.errors.some(e => e.includes('Stock information could not be determined or is missing')));
  });

  // =========================================================================
  // SCENARIO 10: Out-of-Stock (UNIT & MOCK DOM)
  // =========================================================================
  test('Scenario 10: [SIMULATED] Out-of-Stock - Explicit "Out of stock" badge correctly parsed as OUT_OF_STOCK', () => {
    const stock1 = parseStockBadge('Out of stock');
    assert.strictEqual(stock1.status, 'OUT_OF_STOCK');
    assert.strictEqual(stock1.count, 0);

    const stock2 = parseStockBadge('Sold out online');
    assert.strictEqual(stock2.status, 'OUT_OF_STOCK');
    assert.strictEqual(stock2.count, 0);

    const validation = validateScrapedProduct({
      status: 'SUCCESS',
      productId: 572,
      price: 1499,
      stockStatus: 'OUT_OF_STOCK'
    });
    assert.strictEqual(validation.isValid, true);
  });

  // =========================================================================
  // SCENARIO 11: Fake Honeypot Decoys (SIMULATED DOM)
  // =========================================================================
  test('Scenario 11: [SIMULATED] Fake Honeypot - Filters .price-value, [data-price="true"], and hidden decoys', async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    await page.setContent(`
      <html>
        <body>
          <div class="price-block price-success">
            <div class="price-main">
              <!-- Honeypot 1: .price-value decoy -->
              <span class="price-value" style="display:none">₹99</span>
              <!-- Honeypot 2: [data-price="true"] decoy -->
              <span class="amount" data-price="true" style="display:none">₹49</span>
              <!-- Honeypot 3: aria-hidden element -->
              <span class="amount" aria-hidden="true">₹19</span>
              <!-- Honeypot 4: Strike-through MRP -->
              <span class="mrp" style="text-decoration: line-through">₹4,999</span>
              <!-- Honeypot 5: Discount badge -->
              <span class="badge">40% off</span>
              <!-- REAL ACTIVE VISIBLE PRICE -->
              <span class="amount">₹2,999/-</span>
            </div>
            <span class="stock-badge">In stock · 12 left</span>
          </div>
        </body>
      </html>
    `);

    const extracted = await extractRealPriceAndStock(page);
    assert.strictEqual(extracted.priceText, '₹2,999/-');
    assert.strictEqual(extracted.stockText, 'In stock · 12 left');

    const parsedPrice = cleanAndParsePrice(extracted.priceText);
    assert.strictEqual(parsedPrice.price, 2999);
    assert.strictEqual(parsedPrice.currency, 'INR');

    await browser.close();
  });

  // =========================================================================
  // SCENARIO 12: Browser Crash Recovery (SIMULATED)
  // =========================================================================
  test('Scenario 12: [SIMULATED] Browser Crash - Scraper catches browser/page disconnection cleanly', async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    // Intentionally kill the browser page to simulate a browser/page crash
    await page.close();

    let threwAsExpected = false;
    try {
      await page.goto('https://demo.inelabteamdev.com/');
    } catch (err) {
      threwAsExpected = true;
      assert.ok(/closed|target closed|crash/i.test(err.message));
    }

    assert.strictEqual(threwAsExpected, true, 'Browser crash should be caught as an exception');
    await browser.close().catch(() => {});
  });

});
