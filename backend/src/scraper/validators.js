/**
 * Central Validation & Stock Parsing Module (Layers 9 & 10)
 * 
 * Rules:
 * - Explicit "Out of stock" = valid OUT_OF_STOCK.
 * - Missing stock element = extraction/validation failure (UNKNOWN).
 * - Never convert missing data into OUT_OF_STOCK.
 * - Central validation layer ensures invalid price or missing stock fails the scrape
 *   so corrupted/empty data is NEVER written to the database.
 */

/**
 * Extracts and categorizes stock information from badge text.
 * 
 * @param {string|null} badgeText Raw text from the .stock-badge element
 * @returns {{ status: 'IN_STOCK'|'OUT_OF_STOCK'|'UNKNOWN', count: number|null, raw: string|null }}
 */
export function parseStockBadge(badgeText) {
  if (!badgeText || typeof badgeText !== 'string') {
    return {
      status: 'UNKNOWN',
      count: null,
      raw: null
    };
  }

  const clean = badgeText.trim();
  const lower = clean.toLowerCase();

  // 1. Explicit Out of stock
  if (lower.includes('out of stock') || lower.includes('sold out')) {
    return {
      status: 'OUT_OF_STOCK',
      count: 0,
      raw: clean
    };
  }

  // 2. Explicit In-stock indicators from INE mock store Rr array:
  // "In stock · X left", "Only X left", "X in stock", "Selling fast — X left", "Hurry, just X left"
  if (
    lower.includes('in stock') ||
    lower.includes('left') ||
    lower.includes('selling fast') ||
    lower.includes('hurry')
  ) {
    const numMatch = clean.match(/\d+/);
    const count = numMatch ? parseInt(numMatch[0], 10) : null;

    return {
      status: 'IN_STOCK',
      count: isNaN(count) ? null : count,
      raw: clean
    };
  }

  // 3. Unrecognized or missing badge text:
  // Must NOT convert to OUT_OF_STOCK
  return {
    status: 'UNKNOWN',
    count: null,
    raw: clean
  };
}

/**
 * Central Validator: Ensures NO WRONG DATA is returned for persistence.
 * Rejects:
 * - price = null or undefined
 * - price <= 0 or NaN
 * - stockStatus = 'UNKNOWN' (missing stock)
 * - missing or invalid productId
 * 
 * @param {Object} result
 * @returns {{ isValid: boolean, errors: string[] }}
 */
export function validateScrapedProduct(result) {
  const errors = [];

  if (!result || typeof result !== 'object') {
    return { isValid: false, errors: ['Result payload is missing or not an object'] };
  }

  if (result.status === 'SUCCESS') {
    // Price Validation
    if (result.price === null || result.price === undefined) {
      errors.push('Price is null or undefined');
    } else if (typeof result.price !== 'number' || isNaN(result.price)) {
      errors.push(`Price is not a valid number: ${result.price}`);
    } else if (result.price <= 0) {
      errors.push(`Price must be greater than zero, got: ${result.price}`);
    }

    // Stock Validation: Must be strictly IN_STOCK or OUT_OF_STOCK
    if (!result.stockStatus || result.stockStatus === 'UNKNOWN') {
      errors.push('Stock information could not be determined or is missing');
    } else if (!['IN_STOCK', 'OUT_OF_STOCK'].includes(result.stockStatus)) {
      errors.push(`Unrecognized stock status: ${result.stockStatus}`);
    }

    // Product ID Validation
    if (!result.productId || isNaN(result.productId) || result.productId <= 0) {
      errors.push(`Invalid product ID: ${result.productId}`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}
