import { handleCookieBanner } from './cookieHandler.js';

/**
 * Human Interaction & Anti-Bot Challenge Solver (Layers 2, 3, 4, 7)
 * 
 * Solves:
 * 1. class Ar requirement: minMoves: 8, throttled at 40ms interval
 * 2. class Ar requirement: minDwellMs: 600ms hover time
 * 3. function Xn trap: 17.5% random silent click cancellation (Click-and-Verify loop)
 * 4. Late cookie modal popups (Gn to Kn random delay)
 * 5. Honeypot decoy element filtering (Trap 5)
 */
export async function executeRevealInteraction(page, options = {}) {
  // Step 1: Pre-interaction cookie check
  await handleCookieBanner(page, 1000);

  // Step 2: Locate Price Section via stable semantic attributes
  const priceBlock = page.locator('.price-block').first();
  await priceBlock.waitFor({ state: 'visible', timeout: 15000 });

  const box = await priceBlock.boundingBox();
  if (!box) {
    throw new Error('Price block bounding box could not be determined');
  }

  // Step 3: Satisfy Anti-Bot Dwell & Movement Check (class Ar)
  // Move into price box to trigger onMouseEnter
  const startX = box.x + 30;
  const startY = box.y + 30;
  await page.mouse.move(startX, startY);

  // Execute 12 distinct micro-movements across the price box with >45ms gaps
  for (let i = 1; i <= 12; i++) {
    const nextX = startX + (i * 12) + (Math.sin(i) * 8);
    const nextY = startY + ((i % 2 === 0 ? 1 : -1) * 8);
    await page.mouse.move(nextX, nextY);
    await page.waitForTimeout(50);
  }

  // Dwell wait (>600ms required by Ar.minDwellMs)
  await page.waitForTimeout(750);

  // Re-check for any late-appearing cookie consent modal
  await handleCookieBanner(page, 800);

  // Step 4: Click-and-Verify Loop (defeats function Xn 17.5% dropped clicks)
  const revealBtn = priceBlock.locator('button:has-text("Reveal price"), button[aria-label="Reveal price"]').first();

  let transitioned = false;
  const maxClickAttempts = 3;

  for (let attempt = 1; attempt <= maxClickAttempts; attempt++) {
    // Ensure button is enabled before clicking (dwell + moves met)
    let isEnabled = await revealBtn.isEnabled().catch(() => false);
    if (!isEnabled) {
      console.log(`[Interaction] Reveal button disabled on attempt ${attempt}. Re-performing movements & dwell...`);
      for (let i = 1; i <= 8; i++) {
        await page.mouse.move(startX + (i * 10), startY + (i * 5));
        await page.waitForTimeout(50);
      }
      await page.waitForTimeout(700);
      isEnabled = await revealBtn.isEnabled().catch(() => false);
    }

    if (isEnabled) {
      console.log(`[Interaction] Clicking "Reveal price" (Click Attempt ${attempt}/${maxClickAttempts})...`);
      await revealBtn.click({ force: false }).catch(async () => {
        // Fallback force click if intercepted
        await handleCookieBanner(page, 500);
        await revealBtn.click({ force: true }).catch(() => {});
      });
    }

    // Verify state transition: page must leave .price-idle
    try {
      await page.waitForSelector('.price-block:not(.price-idle)', { timeout: 1500 });
      transitioned = true;
      console.log('[Interaction] State transition confirmed: left idle state.');
      break;
    } catch (e) {
      console.warn(`[Interaction] Click attempt ${attempt} was dropped by mock store Xn() wrapper. Retrying click...`);
      await handleCookieBanner(page, 500);
      await page.waitForTimeout(300);
    }
  }

  if (!transitioned) {
    throw new Error('Price section failed to transition from idle state after 3 interaction attempts (Dropped Click Exhaustion)');
  }

  // Step 5: Wait for Final Outcome (.price-success OR .price-error)
  // The store's internal retry mechanism attempts up to 6 retries (jr = 6)
  // We use a resilient timeout of 25 seconds
  console.log('[Interaction] Waiting for store resolution (resilient 25s window for internal store retries)...');
  const outcomeElement = await page.waitForSelector(
    '.price-block.price-success, .price-block.price-error',
    { timeout: 25000 }
  );

  const outcomeClass = await outcomeElement.getAttribute('class');
  const isSuccess = outcomeClass.includes('price-success');

  return {
    isSuccess,
    priceBlock: outcomeElement
  };
}

/**
 * Extracts the real visible price element while strictly filtering out honeypots and decoys
 * 
 * Never trust:
 * - .price-value (Honeypot 1: fake random price)
 * - [data-price="true"] (Honeypot 2: fake random price)
 * - Hidden elements
 * - aria-hidden elements
 * - display:none elements
 */
export async function extractRealPriceAndStock(page) {
  return await page.evaluate(() => {
    const successBlock = document.querySelector('.price-block.price-success');
    if (!successBlock) {
      return { priceText: null, stockText: null, error: 'No price-success element found' };
    }

    const priceMain = successBlock.querySelector('.price-main');
    if (!priceMain) {
      return { priceText: null, stockText: null, error: 'No price-main element found' };
    }

    // Inspect direct children of price-main
    const children = Array.from(priceMain.children);
    let realPriceText = null;

    for (const child of children) {
      // 1. Strict Honeypot Exclusion:
      // Never trust .price-value or [data-price="true"]
      if (child.classList.contains('price-value') || child.getAttribute('data-price') === 'true') {
        continue;
      }

      // 2. Strict Visibility & Accessibility Check:
      const style = window.getComputedStyle(child);
      if (
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        style.opacity === '0' ||
        child.getAttribute('aria-hidden') === 'true'
      ) {
        continue;
      }

      // 3. Filter out strike-through MRP
      if (style.textDecorationLine.includes('line-through') || style.textDecoration.includes('line-through')) {
        continue;
      }

      const text = (child.textContent || '').trim();

      // 4. Filter out discount badges ("X% off"), Deal price labels, and loading states
      if (
        text.includes('% off') ||
        text.toLowerCase().startsWith('deal price') ||
        text.toLowerCase().includes('updating')
      ) {
        continue;
      }

      // The real price element matches currency characters or numbers
      if (/[\d₹$€]|rs\./i.test(text)) {
        realPriceText = text;
        break;
      }
    }

    // Extract stock badge
    const stockBadge = successBlock.querySelector('.stock-badge');
    const stockText = stockBadge ? stockBadge.textContent.trim() : null;

    return {
      priceText: realPriceText,
      stockText
    };
  });
}
