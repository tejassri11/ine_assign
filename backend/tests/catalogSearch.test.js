import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { catalogService } from '../src/services/catalogService.js';

describe('CatalogService & Search Engine Tests', () => {

  const sampleMockProducts = [
    {
      id: 735,
      slug: 'cobalt-slimbook-x',
      name: 'Cobalt Slimbook X',
      brand: 'Cobalt',
      category: 'Laptops',
      sku: 'COB-10735',
      description: 'A dependable laptops pick with clean design.'
    },
    {
      id: 121,
      slug: 'vista-charger-mini',
      name: 'Vista Charger Mini',
      brand: 'Vista',
      category: 'Power',
      sku: 'VIS-10121',
      description: 'Compact USB-C fast charger.'
    },
    {
      id: 84,
      slug: 'summit-soundbar-mini',
      name: 'Summit Soundbar Mini',
      brand: 'Summit',
      category: 'Audio',
      sku: 'SUM-10084',
      description: 'High-fidelity compact TV audio soundbar.'
    },
    {
      id: 31,
      slug: 'larkspur-curved-monitor-pro',
      name: 'Larkspur Curved Monitor Pro',
      brand: 'Larkspur',
      category: 'Monitors',
      sku: 'LAR-10031',
      description: 'Ultra-wide curved display for productivity.'
    }
  ];

  beforeEach(() => {
    // Reset service state before each test
    catalogService.catalog = catalogService.validateAndDeduplicate(sampleMockProducts);
    catalogService.metadata = {
      totalProducts: catalogService.catalog.length,
      lastRefreshedAt: new Date().toISOString(),
      status: 'ready'
    };
  });

  test('1. Exact search matches exact product name', () => {
    const results = catalogService.search('Cobalt Slimbook X');
    assert.ok(results.length >= 1, 'Should find at least 1 result');
    assert.strictEqual(results[0].productId, 735);
    assert.strictEqual(results[0].name, 'Cobalt Slimbook X');
  });

  test('2. Partial search matches substring in product name', () => {
    const results = catalogService.search('Slimbook');
    assert.ok(results.length >= 1, 'Should find products containing "Slimbook"');
    assert.strictEqual(results[0].productId, 735);

    const chargerResults = catalogService.search('Charger');
    assert.ok(chargerResults.length >= 1, 'Should find products containing "Charger"');
    assert.strictEqual(chargerResults[0].productId, 121);
  });

  test('3. Case-insensitive search works across upper, lower, and mixed case', () => {
    const lowerResults = catalogService.search('soundbar');
    const upperResults = catalogService.search('SOUNDBAR');
    const mixedResults = catalogService.search('SoUnDbAr');

    assert.ok(lowerResults.length >= 1, 'Lower case search should return result');
    assert.ok(upperResults.length >= 1, 'Upper case search should return result');
    assert.ok(mixedResults.length >= 1, 'Mixed case search should return result');

    assert.strictEqual(lowerResults[0].productId, upperResults[0].productId);
    assert.strictEqual(lowerResults[0].productId, mixedResults[0].productId);
    assert.strictEqual(lowerResults[0].productId, 84);
  });

  test('4. Ignores leading and trailing whitespace', () => {
    const paddedResults = catalogService.search('   Larkspur   ');
    assert.ok(paddedResults.length >= 1, 'Should find Larkspur even with spaces');
    assert.strictEqual(paddedResults[0].productId, 31);
  });

  test('5. No-result search returns empty array cleanly', () => {
    const nonExistent = catalogService.search('NonExistentProductXYZ123456');
    assert.ok(Array.isArray(nonExistent));
    assert.strictEqual(nonExistent.length, 0);

    const emptyQuery = catalogService.search('');
    assert.ok(Array.isArray(emptyQuery));
    assert.strictEqual(emptyQuery.length, 0);

    const spacesOnly = catalogService.search('     ');
    assert.ok(Array.isArray(spacesOnly));
    assert.strictEqual(spacesOnly.length, 0);
  });

  test('6. Deduplication and validation of duplicate product IDs', () => {
    const rawWithDuplicates = [
      { id: 101, name: 'Product Alpha', brand: 'Brand A' },
      { id: 101, name: 'Product Alpha Duplicate', brand: 'Brand A' }, // Duplicate ID
      { id: 102, name: 'Product Beta', brand: 'Brand B' },
      { id: 'invalid_id', name: 'Product Gamma' }, // Invalid ID
      { id: 103, name: '' } // Missing name
    ];

    const validated = catalogService.validateAndDeduplicate(rawWithDuplicates);
    assert.strictEqual(validated.length, 2, 'Should only keep valid unique IDs');
    assert.strictEqual(validated[0].productId, 101);
    assert.strictEqual(validated[0].name, 'Product Alpha');
    assert.strictEqual(validated[1].productId, 102);
    assert.strictEqual(validated[1].name, 'Product Beta');
  });

  test('7. Empty and malformed catalog handling', () => {
    // Setting catalog to empty
    catalogService.catalog = [];

    const searchOnEmpty = catalogService.search('laptop');
    assert.ok(Array.isArray(searchOnEmpty));
    assert.strictEqual(searchOnEmpty.length, 0);

    // Testing malformed input to validateAndDeduplicate
    assert.deepStrictEqual(catalogService.validateAndDeduplicate(null), []);
    assert.deepStrictEqual(catalogService.validateAndDeduplicate('not-an-array'), []);
    assert.deepStrictEqual(catalogService.validateAndDeduplicate([{}]), []);
  });

  test('8. Search by SKU and Brand also works', () => {
    const skuResults = catalogService.search('VIS-10121');
    assert.ok(skuResults.length >= 1, 'Should find product by SKU');
    assert.strictEqual(skuResults[0].productId, 121);

    const brandResults = catalogService.search('Cobalt');
    assert.ok(brandResults.length >= 1, 'Should find products by brand name');
    assert.strictEqual(brandResults[0].brand, 'Cobalt');
  });

});
