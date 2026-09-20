/**
 * Cookie Modal Handler (Layer 1)
 * 
 * Target Site Trap Discovered:
 * - Appears randomly (75% probability) between 1.5s and 5.0s after page load.
 * - Sets document.body.style.overflow = 'hidden', trapping focus and blocking pointer events.
 * - Jr() counter trap: The component may require 1, 2, or 3 clicks on "Accept"
 *   before it actually unmounts from the DOM.
 */

/**
 * Detects, dismisses, and verifies the removal of the cookie consent banner.
 * Safe to call repeatedly at any stage of page lifecycle.
 * 
 * @param {import('playwright').Page} page
 * @param {number} timeoutMs Fast detection timeout (default 1000ms)
 * @returns {Promise<boolean>} True if a banner was found and dismissed, false otherwise.
 */
export async function handleCookieBanner(page, timeoutMs = 1000) {
  if (!page || page.isClosed()) return false;

  try {
    const banner = page.locator('.cookie-banner, .cookie-overlay, [aria-label="Cookie consent"]').first();
    
    // Non-blocking detection
    const isPresent = await banner.isVisible({ timeout: timeoutMs }).catch(() => false);
    if (!isPresent) {
      return false;
    }

    console.log('[CookieHandler] Cookie consent banner detected. Initiating dismissal...');

    const acceptBtn = banner.locator('button:has-text("Accept"), button[aria-label="Accept cookies"]').first();

    // Loop up to 4 times to defeat the multi-click Jr() counter trap (max 3 clicks needed)
    for (let attempt = 1; attempt <= 4; attempt++) {
      const stillVisible = await banner.isVisible().catch(() => false);
      if (!stillVisible) {
        console.log(`[CookieHandler] Cookie banner confirmed dismissed after ${attempt - 1} click(s).`);
        
        // Ensure body overflow is restored so interactions are unblocked
        await page.evaluate(() => {
          if (document.body.style.overflow === 'hidden') {
            document.body.style.overflow = '';
          }
        }).catch(() => {});

        return true;
      }

      if (await acceptBtn.isVisible().catch(() => false)) {
        await acceptBtn.click({ force: true }).catch(() => {});
      }
      await page.waitForTimeout(200);
    }

    // Final verification check
    const isStillThere = await banner.isVisible().catch(() => false);
    if (isStillThere) {
      console.warn('[CookieHandler] Warning: Cookie banner still detected after 4 dismissal clicks.');
      // Emergency removal if needed so clicks aren't permanently obstructed
      await page.evaluate(() => {
        const el = document.querySelector('.cookie-overlay, .cookie-banner');
        if (el) el.remove();
        document.body.style.overflow = '';
      }).catch(() => {});
    }

    return true;
  } catch (err) {
    // Fail-safe: Cookie modal checks must never crash the scraper
    return false;
  }
}

// Backward compatibility alias
export const dismissCookieModal = handleCookieBanner;
