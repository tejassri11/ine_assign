import express from 'express';
import { catalogService } from '../services/catalogService.js';
import { supabaseService } from '../services/supabaseService.js';
import { scrapeOneProduct } from '../services/scraperService.js';

const router = express.Router();

/**
 * GET /api/products/search?q=&limit=
 * Searches the local product catalog by name, brand, or SKU.
 * Supports partial matching, exact matching, case-insensitive, ignores leading/trailing whitespace.
 */
router.get('/search', (req, res) => {
  try {
    const query = req.query.q || '';
    const limit = req.query.limit;

    const trimmedQuery = typeof query === 'string' ? query.trim() : '';

    if (!trimmedQuery) {
      return res.json({
        success: true,
        query: '',
        count: 0,
        results: []
      });
    }

    const results = catalogService.search(trimmedQuery, limit);

    return res.json({
      success: true,
      query: trimmedQuery,
      count: results.length,
      results
    });
  } catch (error) {
    console.error('[Route: /search] Error executing search:', error);
    return res.status(500).json({
      success: false,
      error: 'An internal error occurred while performing search',
      details: error.message
    });
  }
});

/**
 * GET /api/products/catalog?page=1&pageSize=50
 * Returns the catalog metadata and paginated list of products for debugging/admin inspection.
 */
router.get('/catalog', (req, res) => {
  try {
    const page = req.query.page;
    const pageSize = req.query.pageSize;

    const catalogData = catalogService.getCatalog(page, pageSize);
    return res.json({
      success: true,
      ...catalogData
    });
  } catch (error) {
    console.error('[Route: /catalog] Error fetching catalog:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve catalog',
      details: error.message
    });
  }
});

/**
 * POST /api/products/catalog/refresh
 * Manually triggers a catalog re-fetch from the mock store and updates catalog.json.
 */
router.post('/catalog/refresh', async (req, res) => {
  try {
    const result = await catalogService.refreshCatalog();
    return res.json({
      success: true,
      message: 'Catalog refreshed successfully',
      ...result
    });
  } catch (error) {
    console.error('[Route: /catalog/refresh] Error refreshing catalog:', error);
    return res.status(502).json({
      success: false,
      error: 'Failed to refresh catalog from mock store',
      details: error.message
    });
  }
});

/**
 * POST /api/products/track
 * Selects a product to track and persists in Supabase PostgreSQL.
 * Input must be a valid productId from our catalog. Arbitrary URLs are strictly rejected.
 */
router.post('/track', async (req, res) => {
  try {
    const { productId } = req.body;

    if (productId === undefined || productId === null) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: "productId". Input must contain a product identifier from the catalog.'
      });
    }

    // Strict validation: Reject arbitrary URLs or non-numeric identifiers
    const pId = parseInt(productId, 10);
    if (isNaN(pId) || pId <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid productId format. Must be a valid positive integer referencing an INE mock store product.'
      });
    }

    // Verify product exists in our canonical verified catalog
    const productMetadata = catalogService.getProductById(pId);
    if (!productMetadata) {
      return res.status(404).json({
        success: false,
        error: `Product with ID ${pId} does not exist in the official INE catalog. Arbitrary external URLs and unverified products cannot be tracked.`
      });
    }

    // Add to tracked_products table
    const trackedRecord = await supabaseService.addTrackedProduct(productMetadata);

    return res.status(201).json({
      success: true,
      message: `Product "${productMetadata.name}" (ID: ${pId}) is now tracked.`,
      product: trackedRecord
    });
  } catch (error) {
    if (error.code === 'DUPLICATE_TRACKING' || error.status === 409) {
      return res.status(409).json({
        success: false,
        error: error.message,
        code: 'DUPLICATE_TRACKING'
      });
    }

    console.error('[Route: /track] Error adding product to tracking:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to add product to tracking database',
      details: error.message
    });
  }
});

/**
 * GET /api/products/tracked
 * Returns the list of all tracked products from Supabase PostgreSQL.
 */
router.get('/tracked', async (req, res) => {
  try {
    const activeOnly = req.query.activeOnly === 'true';
    const products = await supabaseService.getTrackedProducts(activeOnly);

    return res.json({
      success: true,
      count: products.length,
      products
    });
  } catch (error) {
    console.error('[Route: /tracked] Error listing tracked products:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve tracked products from database',
      details: error.message
    });
  }
});

/**
 * DELETE /api/products/:id/track
 * Deactivates tracking for a product (soft delete to preserve history).
 */
router.delete('/:id/track', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid product ID parameter'
      });
    }

    const deactivated = await supabaseService.deactivateTrackedProduct(id);

    return res.json({
      success: true,
      message: `Product "${deactivated.name}" has been deactivated from active tracking.`,
      product: deactivated
    });
  } catch (error) {
    if (error.status === 404) {
      return res.status(404).json({
        success: false,
        error: error.message
      });
    }

    console.error(`[Route: /:id/track] Error deactivating product ${req.params.id}:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to deactivate tracked product',
      details: error.message
    });
  }
});

/**
 * POST /api/products/:id/scrape
 * Manually triggers a scrape for a single tracked product.
 * Uses the same scraper service as the cron endpoint.
 * Useful for testing and the React dashboard's "Refresh now" button.
 */
router.post('/:id/scrape', async (req, res) => {
  try {
    const productId = parseInt(req.params.id, 10);
    if (isNaN(productId) || productId <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid product ID. Expected a positive integer.'
      });
    }

    console.log(`[Route: /:id/scrape] Manual scrape requested for product ${productId}`);

    const result = await scrapeOneProduct(productId, { headed: false, maxAttempts: 3 });

    if (result.status === 'SUCCESS') {
      return res.json({
        success: true,
        message: `Successfully scraped product ${productId}.`,
        result
      });
    } else {
      return res.status(422).json({
        success: false,
        message: result.errorMessage || `Scrape attempt failed for product ${productId}. Please try again.`,
        error: result.errorType || 'SCRAPE_FAILED',
        result
      });
    }
  } catch (err) {
    console.error(`[Route: /:id/scrape] Unexpected error for product ${req.params.id}:`, err.message);
    return res.status(500).json({
      success: false,
      error: 'Unexpected error during manual scrape',
      details: err.message
    });
  }
});

/**
 * GET /api/products/:id/history
 * Returns paginated price and stock history for a tracked product.
 * Suitable for dashboard charts.
 */
router.get('/:id/history', async (req, res) => {
  try {
    const productId = parseInt(req.params.id, 10);
    if (isNaN(productId) || productId <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid product ID.' });
    }

    const limit = Math.min(parseInt(req.query.limit || '100', 10), 500);
    const history = await supabaseService.getPriceHistory(productId, limit);

    return res.json({
      success: true,
      productId,
      count: history.length,
      history
    });
  } catch (err) {
    console.error(`[Route: /:id/history] Error for product ${req.params.id}:`, err.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve price history',
      details: err.message
    });
  }
});

/**
 * GET /api/products/:id/logs
 * Returns recent scrape attempt logs for a tracked product.
 * Shows honest RETRIED and FAILED attempts.
 */
router.get('/:id/logs', async (req, res) => {
  try {
    const productId = parseInt(req.params.id, 10);
    if (isNaN(productId) || productId <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid product ID.' });
    }

    const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
    const logs = await supabaseService.getScrapeLogs(productId, limit);

    return res.json({
      success: true,
      productId,
      count: logs.length,
      logs
    });
  } catch (err) {
    console.error(`[Route: /:id/logs] Error for product ${req.params.id}:`, err.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve scrape logs',
      details: err.message
    });
  }
});

/**
 * GET /api/products/:id
 * Fetches a single product's metadata from the local catalog by its productId.
 */
router.get('/:id', (req, res) => {
  try {
    const productId = parseInt(req.params.id, 10);
    if (isNaN(productId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid productId. Expected an integer.'
      });
    }

    const product = catalogService.getProductById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        error: `Product with ID ${productId} not found in catalog`
      });
    }

    return res.json({
      success: true,
      product
    });
  } catch (error) {
    console.error(`[Route: /:id] Error fetching product ${req.params.id}:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve product details',
      details: error.message
    });
  }
});

export default router;
