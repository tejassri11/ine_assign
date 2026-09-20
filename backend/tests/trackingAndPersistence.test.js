import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { supabaseService } from '../src/services/supabaseService.js';
import { catalogService } from '../src/services/catalogService.js';

describe('Product Tracking and Persistence Tests', () => {

  const testProducts = [
    {
      id: 9901,
      slug: 'test-item-alpha',
      name: 'Test Item Alpha',
      brand: 'TestBrand',
      category: 'Peripherals',
      sku: 'TEST-9901',
      description: 'Test product for persistence.'
    },
    {
      id: 9902,
      slug: 'test-item-beta',
      name: 'Test Item Beta',
      brand: 'TestBrand',
      category: 'Peripherals',
      sku: 'TEST-9902',
      description: 'Second test product.'
    }
  ];

  catalogService.catalog = catalogService.validateAndDeduplicate(testProducts);

  // Cleanup helper
  async function cleanupTestRecords() {
    try {
      if (supabaseService.isLiveConfigured && supabaseService.client) {
        await supabaseService.client
          .from('tracked_products')
          .delete()
          .in('product_id', [9901, 9902]);
      }
    } catch (err) {}
    await supabaseService._writeLocalFallback([]);
  }

  after(async () => {
    await cleanupTestRecords();
  });

  test('1. Tracking a valid product stores canonical metadata and URL', async () => {
    await cleanupTestRecords();
    const product = catalogService.getProductById(9901);
    assert.ok(product, 'Product 9901 should exist in catalog');

    const tracked = await supabaseService.addTrackedProduct(product);
    assert.ok(tracked, 'Tracked record should be returned');
    assert.strictEqual(tracked.product_id, 9901);
    assert.strictEqual(tracked.name, 'Test Item Alpha');
    assert.strictEqual(tracked.product_url, 'https://demo.inelabteamdev.com/product/9901');
    assert.strictEqual(tracked.is_active, true);
    assert.strictEqual(tracked.current_price, null);
  });

  test('2. Tracking the same product twice throws DUPLICATE_TRACKING (409)', async () => {
    const product = catalogService.getProductById(9901);
    // 9901 was added in test 1 and is active
    await assert.rejects(
      async () => {
        await supabaseService.addTrackedProduct(product);
      },
      (err) => {
        assert.strictEqual(err.code, 'DUPLICATE_TRACKING');
        assert.strictEqual(err.status, 409);
        assert.match(err.message, /already being tracked/);
        return true;
      }
    );
  });

  test('3. Listing tracked products returns stored products', async () => {
    const p2 = catalogService.getProductById(9902);
    await supabaseService.addTrackedProduct(p2);

    const list = await supabaseService.getTrackedProducts();
    assert.ok(list.length >= 2, 'Should list at least both test products');

    const ids = list.map(p => p.product_id);
    assert.ok(ids.includes(9901));
    assert.ok(ids.includes(9902));
  });

  test('4. Deactivating product sets is_active to false (soft delete)', async () => {
    const deactivated = await supabaseService.deactivateTrackedProduct(9901);
    assert.strictEqual(deactivated.is_active, false);

    // Active-only query should now exclude 9901
    const activeList = await supabaseService.getTrackedProducts(true);
    const activeIds = activeList.map(p => p.product_id);
    assert.strictEqual(activeIds.includes(9901), false, 'Deactivated product should not be in active list');
  });

  test('5. Re-tracking a previously deactivated product reactivates it', async () => {
    const product = catalogService.getProductById(9901);
    const reactivated = await supabaseService.addTrackedProduct(product);
    assert.strictEqual(reactivated.is_active, true);
  });

  test('6. Database connectivity check reports status cleanly', async () => {
    const status = await supabaseService.checkConnection();
    assert.ok(typeof status.connected === 'boolean');
    assert.ok(status.mode);
  });

});
