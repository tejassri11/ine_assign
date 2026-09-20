/**
 * Price Parsing & Text Sanitization Module
 * 
 * Handles all obfuscation and dynamic formats discovered on demo.inelabteamdev.com:
 * 1. Zero-Width Spaces (\u200B) injected between digits
 * 2. Non-Breaking Spaces (\u00A0)
 * 3. Full-width Unicode numbers (\uFF10 - \uFF19)
 * 4. Trailing text: "/- (incl. of all taxes)"
 * 5. Indian lakhs formatting (1,49,900.00), spaced (1 499), and European decimals (1.499,00)
 */
export function cleanAndParsePrice(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    return null;
  }

  // 1. Strip Zero-Width Spaces (\u200B) and Non-Breaking Spaces (\u00A0, \u202F)
  let text = rawText
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, '') // Zero-width characters
    .replace(/[\u00A0\u202F\u2007]/g, ' ')      // Non-breaking spaces to standard space
    .trim();

  // 2. Normalize Full-Width Unicode digits (０-９: \uFF10 to \uFF19) to standard ASCII 0-9
  text = text.replace(/[\uFF10-\uFF19]/g, ch => 
    String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)
  );

  // 3. Detect Currency
  let currency = 'INR';
  if (text.includes('₹') || /rs\.?/i.test(text)) {
    currency = 'INR';
  } else if (text.includes('$')) {
    currency = 'USD';
  } else if (text.includes('€')) {
    currency = 'EUR';
  }

  // 4. Remove trailing text like "/- (incl. of all taxes)", "Deal price", "MRP", etc.
  text = text
    .replace(/\/-\s*(\(.*?\))?/gi, '')
    .replace(/\(.*?\)/g, '')
    .replace(/deal\s+price/gi, '')
    .replace(/mrp/gi, '')
    .replace(/incl\.\s+of\s+all\s+taxes/gi, '')
    .replace(/[^0-9.,\s]/g, '') // Keep only digits, dots, commas, spaces
    .trim();

  if (!text) {
    return null;
  }

  // 5. Strict Pattern Matching to prevent guessing ambiguous formats
  let numericValue = null;

  // Pattern 1: Plain Integer (e.g., "1499")
  if (/^\d+$/.test(text)) {
    numericValue = parseInt(text, 10);
  }
  // Pattern 2: Standard Decimal without thousand separators (e.g., "1499.00" or "1499.5")
  else if (/^\d+\.\d{1,2}$/.test(text)) {
    numericValue = parseFloat(text);
  }
  // Pattern 3: Standard Thousands with Comma (e.g., "1,499" or "1,499.00")
  else if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(text)) {
    numericValue = parseFloat(text.replace(/,/g, ''));
  }
  // Pattern 4: Indian Lakhs Grouping (e.g., "1,49,900" or "1,49,900.50")
  else if (/^\d{1,2}(,\d{2})*,\d{3}(\.\d{1,2})?$/.test(text)) {
    numericValue = parseFloat(text.replace(/,/g, ''));
  }
  // Pattern 5: Spaced Thousands Grouping (e.g., "1 499" or "1 499.00")
  else if (/^\d{1,3}(\s\d{3})+(\.\d{1,2})?$/.test(text)) {
    numericValue = parseFloat(text.replace(/\s+/g, ''));
  }
  // Pattern 6: European Decimal / Thousand Grouping (e.g., "1.499,00" or "1.499")
  else if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(text)) {
    numericValue = parseFloat(text.replace(/\./g, '').replace(',', '.'));
  }
  else {
    // Ambiguous or corrupted format (e.g., "1.2.3.4", "1,2,3", "14.99.00") -> Fail validation!
    return null;
  }

  if (isNaN(numericValue) || !isFinite(numericValue) || numericValue <= 0) {
    return null;
  }

  return {
    price: Math.round(numericValue * 100) / 100,
    currency,
    raw: rawText
  };
}
