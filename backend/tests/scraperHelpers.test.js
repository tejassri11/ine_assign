import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { cleanAndParsePrice } from '../src/scraper/priceParser.js';
import { parseStockBadge, validateScrapedProduct } from '../src/scraper/validators.js';

describe('Scraper Helper & Parser Tests', () => {

  test('1. Price Parser: Strips zero-width spaces (\u200B) between digits', () => {
    const raw = '₹\u200B2\u200B,\u200B4\u200B9\u200B9';
    const parsed = cleanAndParsePrice(raw);
    assert.ok(parsed);
    assert.strictEqual(parsed.price, 2499);
    assert.strictEqual(parsed.currency, 'INR');
  });

  test('2. Price Parser: Normalizes full-width Unicode digits (０-９)', () => {
    const raw = '₹１４９９';
    const parsed = cleanAndParsePrice(raw);
    assert.ok(parsed);
    assert.strictEqual(parsed.price, 1499);
    assert.strictEqual(parsed.currency, 'INR');
  });

  test('3. Price Parser: Handles all required currency formats correctly', () => {
    // ₹1,499
    assert.strictEqual(cleanAndParsePrice('₹1,499')?.price, 1499);
    // ₹ 1 499 (spaced)
    assert.strictEqual(cleanAndParsePrice('₹ 1 499')?.price, 1499);
    // ₹1,499/-
    assert.strictEqual(cleanAndParsePrice('₹1,499/-')?.price, 1499);
    // ₹1.499,00 (European)
    assert.strictEqual(cleanAndParsePrice('₹1.499,00')?.price, 1499);
    // NBSP (\u00A0)
    assert.strictEqual(cleanAndParsePrice('₹\u00A01\u00A0499')?.price, 1499);
    // Indian lakhs format
    assert.strictEqual(cleanAndParsePrice('₹1,49,900/- (incl. of all taxes)')?.price, 149900);
  });

  test('4. Price Parser: Rejects ambiguous formatting cleanly (Never guess)', () => {
    assert.strictEqual(cleanAndParsePrice(''), null);
    assert.strictEqual(cleanAndParsePrice('Price hidden'), null);
    assert.strictEqual(cleanAndParsePrice('Check availability'), null);
    assert.strictEqual(cleanAndParsePrice(null), null);
    // Ambiguous multiple decimal / separator points
    assert.strictEqual(cleanAndParsePrice('₹1.2.3.4'), null);
    assert.strictEqual(cleanAndParsePrice('₹1,2,3,4'), null);
    assert.strictEqual(cleanAndParsePrice('₹14.99.00'), null);
  });

  test('5. Stock Parser: Correctly distinguishes IN_STOCK with count', () => {
    const r1 = parseStockBadge('In stock · 14 left');
    assert.strictEqual(r1.status, 'IN_STOCK');
    assert.strictEqual(r1.count, 14);

    const r2 = parseStockBadge('Only 3 left');
    assert.strictEqual(r2.status, 'IN_STOCK');
    assert.strictEqual(r2.count, 3);

    const r3 = parseStockBadge('Hurry, just 1 left');
    assert.strictEqual(r3.status, 'IN_STOCK');
    assert.strictEqual(r3.count, 1);
  });

  test('6. Stock Parser: Correctly identifies OUT_OF_STOCK', () => {
    const out = parseStockBadge('Out of stock');
    assert.strictEqual(out.status, 'OUT_OF_STOCK');
    assert.strictEqual(out.count, 0);
  });

  test('7. Stock Parser: Never silently marks missing/unrecognized text as OUT_OF_STOCK', () => {
    const unknown1 = parseStockBadge(null);
    assert.strictEqual(unknown1.status, 'UNKNOWN');
    assert.strictEqual(unknown1.count, null);

    const unknown2 = parseStockBadge('Some random badge text');
    assert.strictEqual(unknown2.status, 'UNKNOWN');
    assert.strictEqual(unknown2.count, null);
  });

  test('8. Scraper Payload Validator: Validates price and stock constraints', () => {
    const valid = validateScrapedProduct({
      status: 'SUCCESS',
      productId: 910,
      price: 2499,
      stockStatus: 'IN_STOCK'
    });
    assert.strictEqual(valid.isValid, true);

    const invalidPrice = validateScrapedProduct({
      status: 'SUCCESS',
      productId: 910,
      price: -50,
      stockStatus: 'IN_STOCK'
    });
    assert.strictEqual(invalidPrice.isValid, false);
    assert.ok(invalidPrice.errors.length > 0);

    const missingStock = validateScrapedProduct({
      status: 'SUCCESS',
      productId: 910,
      price: 1499,
      stockStatus: 'UNKNOWN'
    });
    assert.strictEqual(missingStock.isValid, false);
  });

});
