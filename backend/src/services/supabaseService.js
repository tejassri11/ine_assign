import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from '../config/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOCAL_FALLBACK_FILE = path.resolve(__dirname, '../../data/tracked_products.json');

class SupabaseService {
  constructor() {
    this.client = null;
    this.isLiveConfigured = false;
    this.initClient();
  }

  initClient() {
    if (config.supabaseUrl && config.supabaseServiceKey) {
      try {
        this.client = createClient(config.supabaseUrl, config.supabaseServiceKey, {
          auth: {
            persistSession: false,
            autoRefreshToken: false
          }
        });
        this.isLiveConfigured = true;
        console.log('[SupabaseService] Initialized with live Supabase credentials.');
      } catch (err) {
        console.error('[SupabaseService] Failed to initialize Supabase client:', err.message);
        this.client = null;
        this.isLiveConfigured = false;
      }
    } else {
      console.warn('[SupabaseService] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not configured in .env. Operating in resilient local storage mode.');
      this.client = null;
      this.isLiveConfigured = false;
    }
  }

  /**
   * Health & connectivity check
   */
  async checkConnection() {
    if (!this.isLiveConfigured || !this.client) {
      return {
        connected: false,
        mode: 'local_fallback',
        message: 'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY not configured in backend/.env. Using local fallback persistence.',
        tables: ['tracked_products', 'price_history', 'scrape_logs', 'scrape_runs']
      };
    }

    const start = Date.now();
    try {
      const { data, error } = await this.client
        .from('tracked_products')
        .select('id')
        .limit(1);

      if (error) throw error;

      return {
        connected: true,
        mode: 'supabase_postgres',
        latencyMs: Date.now() - start,
        message: 'Successfully connected to Supabase PostgreSQL database.'
      };
    } catch (err) {
      return {
        connected: false,
        mode: 'supabase_postgres',
        latencyMs: Date.now() - start,
        error: err.message,
        message: 'Failed to connect to Supabase PostgreSQL. Verify credentials and schema.sql deployment.'
      };
    }
  }

  // =========================================================================
  // LOCAL FALLBACK HELPERS
  // =========================================================================
  async _readLocalFallback() {
    try {
      if (!existsSync(LOCAL_FALLBACK_FILE)) return [];
      const raw = await fs.readFile(LOCAL_FALLBACK_FILE, 'utf8');
      return JSON.parse(raw);
    } catch (err) {
      return [];
    }
  }

  async _writeLocalFallback(data) {
    await fs.writeFile(LOCAL_FALLBACK_FILE, JSON.stringify(data, null, 2), 'utf8');
  }

  // =========================================================================
  // TRACKED PRODUCTS CRUD
  // =========================================================================

  async getTrackedProducts(onlyActive = false) {
    if (this.isLiveConfigured && this.client) {
      let query = this.client
        .from('tracked_products')
        .select('*')
        .order('created_at', { ascending: false });

      if (onlyActive) query = query.eq('is_active', true);

      const { data, error } = await query;
      if (error) throw new Error(`Supabase query failed: ${error.message}`);
      return data || [];
    }

    const local = await this._readLocalFallback();
    let filtered = local;
    if (onlyActive) filtered = filtered.filter(p => p.is_active);
    return filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  async getTrackedProductByProductId(productId) {
    const pId = parseInt(productId, 10);
    if (isNaN(pId)) return null;

    if (this.isLiveConfigured && this.client) {
      const { data, error } = await this.client
        .from('tracked_products')
        .select('*')
        .eq('product_id', pId)
        .maybeSingle();

      if (error) throw new Error(`Supabase lookup failed: ${error.message}`);
      return data;
    }

    const local = await this._readLocalFallback();
    return local.find(p => p.product_id === pId) || null;
  }

  async addTrackedProduct(productMetadata) {
    const productId = parseInt(productMetadata.productId, 10);
    if (isNaN(productId)) throw new Error('Invalid productId provided for tracking');

    const existing = await this.getTrackedProductByProductId(productId);

    if (existing) {
      if (existing.is_active) {
        const err = new Error(`Product "${existing.name}" (ID: ${productId}) is already being tracked.`);
        err.code = 'DUPLICATE_TRACKING';
        err.status = 409;
        throw err;
      }
      return await this.reactivateTrackedProduct(existing.id || existing.product_id);
    }

    const newRecord = {
      product_id: productId,
      name: productMetadata.name,
      brand: productMetadata.brand || null,
      category: productMetadata.category || null,
      sku: productMetadata.sku || null,
      slug: productMetadata.slug || null,
      product_url: productMetadata.productUrl,
      image_url: productMetadata.imageUrl || null,
      is_active: true,
      current_price: null,
      current_stock_status: null,
      current_stock_count: null,
      last_scraped_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    if (this.isLiveConfigured && this.client) {
      const { data, error } = await this.client
        .from('tracked_products')
        .insert([newRecord])
        .select()
        .single();

      if (error) throw new Error(`Supabase insert failed: ${error.message}`);
      return data;
    }

    const local = await this._readLocalFallback();
    const id = local.length > 0 ? Math.max(...local.map(p => p.id || 0)) + 1 : 1;
    const recordWithId = { id, ...newRecord };
    local.push(recordWithId);
    await this._writeLocalFallback(local);
    return recordWithId;
  }

  async deactivateTrackedProduct(idOrProductId) {
    const numId = parseInt(idOrProductId, 10);
    if (isNaN(numId)) throw new Error('Invalid product identifier for deactivation');

    if (this.isLiveConfigured && this.client) {
      const { data, error } = await this.client
        .from('tracked_products')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .or(`id.eq.${numId},product_id.eq.${numId}`)
        .select()
        .maybeSingle();

      if (error) throw new Error(`Supabase deactivation failed: ${error.message}`);
      if (!data) {
        const notFound = new Error(`Tracked product with ID ${numId} not found`);
        notFound.status = 404;
        throw notFound;
      }
      return data;
    }

    const local = await this._readLocalFallback();
    const index = local.findIndex(p => p.id === numId || p.product_id === numId);
    if (index === -1) {
      const notFound = new Error(`Tracked product with ID ${numId} not found`);
      notFound.status = 404;
      throw notFound;
    }

    local[index].is_active = false;
    local[index].updated_at = new Date().toISOString();
    await this._writeLocalFallback(local);
    return local[index];
  }

  async reactivateTrackedProduct(idOrProductId) {
    const numId = parseInt(idOrProductId, 10);

    if (this.isLiveConfigured && this.client) {
      const { data, error } = await this.client
        .from('tracked_products')
        .update({ is_active: true, updated_at: new Date().toISOString() })
        .or(`id.eq.${numId},product_id.eq.${numId}`)
        .select()
        .maybeSingle();

      if (error) throw new Error(`Supabase reactivation failed: ${error.message}`);
      return data;
    }

    const local = await this._readLocalFallback();
    const index = local.findIndex(p => p.id === numId || p.product_id === numId);
    if (index !== -1) {
      local[index].is_active = true;
      local[index].updated_at = new Date().toISOString();
      await this._writeLocalFallback(local);
      return local[index];
    }
    return null;
  }

  // =========================================================================
  // SCRAPE RUNS (Deduplication & Progress Tracking)
  // =========================================================================

  /**
   * Create a new scrape run record.
   * Returns the run ID string.
   */
  async createScrapeRun(runId, triggeredBy = 'cron') {
    if (!this.isLiveConfigured || !this.client) {
      console.warn('[SupabaseService] No DB: scrape run not persisted.');
      return runId;
    }

    const { error } = await this.client
      .from('scrape_runs')
      .insert([{
        id: runId,
        status: 'RUNNING',
        total_products: 0,
        successes: 0,
        failures: 0,
        triggered_by: triggeredBy,
        started_at: new Date().toISOString()
      }]);

    if (error) throw new Error(`Failed to create scrape_run: ${error.message}`);
    return runId;
  }

  /**
   * Finalize (update) a scrape run with results.
   */
  async finalizeScrapeRun(runId, { status, totalProducts, successes, failures }) {
    if (!this.isLiveConfigured || !this.client) return;

    const { error } = await this.client
      .from('scrape_runs')
      .update({
        status,
        total_products: totalProducts,
        successes,
        failures,
        finished_at: new Date().toISOString()
      })
      .eq('id', runId);

    if (error) console.error(`[SupabaseService] Failed to finalize scrape_run ${runId}: ${error.message}`);
  }

  /**
   * Check if any scrape run is currently in RUNNING state.
   * Returns the running run record or null.
   */
  async getActiveRun() {
    if (!this.isLiveConfigured || !this.client) return null;

    const { data, error } = await this.client
      .from('scrape_runs')
      .select('*')
      .eq('status', 'RUNNING')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('[SupabaseService] Failed to check active runs:', error.message);
      return null;
    }
    return data;
  }

  /**
   * Stale run guard: if a RUNNING run is more than 30 minutes old,
   * it is considered crashed/stale and can be overridden.
   */
  async getActiveRunIfRecent(maxAgeMinutes = 30) {
    const run = await this.getActiveRun();
    if (!run) return null;

    const startedAt = new Date(run.started_at);
    const ageMs = Date.now() - startedAt.getTime();
    const staleThresholdMs = maxAgeMinutes * 60 * 1000;

    if (ageMs > staleThresholdMs) {
      console.warn(`[SupabaseService] Run ${run.id} has been RUNNING for ${Math.round(ageMs / 60000)}m (stale). Marking as FAILED and allowing new run.`);
      await this.finalizeScrapeRun(run.id, {
        status: 'FAILED',
        totalProducts: run.total_products || 0,
        successes: run.successes || 0,
        failures: run.failures || 0
      });
      return null;
    }

    return run;
  }

  // =========================================================================
  // SCRAPE PERSISTENCE: Success Path
  // =========================================================================

  /**
   * Persist a successful scrape result:
   *  - Update tracked_products current price/stock
   *  - Insert price_history row
   *  - Insert SUCCESS scrape_logs row
   */
  async persistSuccessfulScrape(trackedProductId, scrapeResult, runId = null) {
    if (!this.isLiveConfigured || !this.client) {
      console.warn('[SupabaseService] No DB configured: success not persisted.');
      return;
    }

    const now = new Date().toISOString();
    const errors = [];

    // 1. Update tracked_products current state
    const { error: updateErr } = await this.client
      .from('tracked_products')
      .update({
        current_price: scrapeResult.price,
        current_stock_status: scrapeResult.stockStatus,
        current_stock_count: scrapeResult.stockCount ?? null,
        last_scraped_at: now,
        updated_at: now
      })
      .eq('id', trackedProductId);

    if (updateErr) errors.push(`tracked_products update: ${updateErr.message}`);

    // 2. Insert price_history record (time-series snapshot)
    const { error: histErr } = await this.client
      .from('price_history')
      .insert([{
        tracked_product_id: trackedProductId,
        price: scrapeResult.price,
        stock_status: scrapeResult.stockStatus,
        stock_count: scrapeResult.stockCount ?? null,
        recorded_at: now,
        scrape_run_id: runId
      }]);

    if (histErr) errors.push(`price_history insert: ${histErr.message}`);

    // 3. Insert all attempt logs with honest status (SUCCESS, RETRIED, FAILED)
    if (scrapeResult.attempts && scrapeResult.attempts.length > 0) {
      const logRows = scrapeResult.attempts.map(att => ({
        tracked_product_id: trackedProductId,
        scrape_run_id: runId,
        attempt_number: att.attemptNumber,
        status: att.status,               // 'SUCCESS', 'RETRIED', 'FAILED'
        error_type: att.errorType || null,
        error_message: att.errorMessage || null,
        duration_ms: att.durationMs || null,
        price_scraped: att.priceScraped || null,
        stock_scraped: att.stockScraped || null,
        extraction_method: 'playwright',
        created_at: now
      }));

      const { error: logErr } = await this.client
        .from('scrape_logs')
        .insert(logRows);

      if (logErr) errors.push(`scrape_logs insert: ${logErr.message}`);
    }

    if (errors.length > 0) {
      throw new Error(`Partial persistence failures: ${errors.join(' | ')}`);
    }
  }

  /**
   * Persist a failed scrape result:
   *  - DO NOT update current_price (preserve last known valid state)
   *  - DO NOT insert price_history
   *  - Insert FAILED attempt logs only
   */
  async persistFailedScrape(trackedProductId, scrapeResult, runId = null) {
    if (!this.isLiveConfigured || !this.client) {
      console.warn('[SupabaseService] No DB configured: failure not persisted.');
      return;
    }

    const now = new Date().toISOString();

    // Update only last_scraped_at so dashboard shows last attempt time
    await this.client
      .from('tracked_products')
      .update({ last_scraped_at: now, updated_at: now })
      .eq('id', trackedProductId);

    if (scrapeResult.attempts && scrapeResult.attempts.length > 0) {
      const logRows = scrapeResult.attempts.map(att => ({
        tracked_product_id: trackedProductId,
        scrape_run_id: runId,
        attempt_number: att.attemptNumber,
        status: att.status,             // Honest: 'RETRIED' or 'FAILED'
        error_type: att.errorType || null,
        error_message: att.errorMessage || null,
        duration_ms: att.durationMs || null,
        price_scraped: null,
        stock_scraped: null,
        extraction_method: 'playwright',
        created_at: now
      }));

      const { error: logErr } = await this.client
        .from('scrape_logs')
        .insert(logRows);

      if (logErr) {
        console.error(`[SupabaseService] Failed to insert failure scrape_logs: ${logErr.message}`);
      }
    }
  }

  // =========================================================================
  // HISTORY & LOGS (Dashboard APIs)
  // =========================================================================

  /**
   * Get price history for a tracked product (most recent first).
   */
  async getPriceHistory(productId, limit = 100) {
    const pId = parseInt(productId, 10);
    if (isNaN(pId)) return [];

    if (!this.isLiveConfigured || !this.client) return [];

    // Resolve tracked_products.id from product_id
    const { data: tracked, error: lookupErr } = await this.client
      .from('tracked_products')
      .select('id')
      .eq('product_id', pId)
      .maybeSingle();

    if (lookupErr || !tracked) return [];

    const { data, error } = await this.client
      .from('price_history')
      .select('*')
      .eq('tracked_product_id', tracked.id)
      .order('recorded_at', { ascending: false })
      .limit(limit);

    if (error) throw new Error(`Failed to fetch price history: ${error.message}`);
    return data || [];
  }

  /**
   * Get scrape logs for a tracked product (most recent first).
   */
  async getScrapeLogs(productId, limit = 50) {
    const pId = parseInt(productId, 10);
    if (isNaN(pId)) return [];

    if (!this.isLiveConfigured || !this.client) return [];

    const { data: tracked, error: lookupErr } = await this.client
      .from('tracked_products')
      .select('id')
      .eq('product_id', pId)
      .maybeSingle();

    if (lookupErr || !tracked) return [];

    const { data, error } = await this.client
      .from('scrape_logs')
      .select('*')
      .eq('tracked_product_id', tracked.id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw new Error(`Failed to fetch scrape logs: ${error.message}`);
    return data || [];
  }

  // =========================================================================
  // CATALOG ITEMS DB STORAGE & INDEXED QUERYING
  // =========================================================================

  /**
   * Batch upsert all catalog items into Supabase PostgreSQL catalog_items table.
   */
  async upsertCatalogItems(products) {
    if (!this.isLiveConfigured || !this.client || !Array.isArray(products) || products.length === 0) {
      return { success: false, count: 0, reason: 'Supabase client not live or empty payload' };
    }

    try {
      const now = new Date().toISOString();
      const rows = products.map(item => ({
        product_id: parseInt(item.productId || item.product_id, 10),
        name: item.name,
        brand: item.brand || 'Generic',
        category: item.category || 'General',
        sku: item.sku || null,
        slug: item.slug || null,
        description: item.description || null,
        product_url: item.productUrl || item.product_url || `https://demo.inelabteamdev.com/product/${item.productId}`,
        image_url: item.imageUrl || item.image_url || null,
        price: item.price ? Number(item.price) : null,
        stock_status: item.stockStatus || item.stock_status || null,
        stock_count: item.stockCount ?? item.stock_count ?? null,
        updated_at: item.updatedAt || now
      })).filter(r => !isNaN(r.product_id));

      const chunkSize = 100;
      let insertedCount = 0;

      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        const { error } = await this.client
          .from('catalog_items')
          .upsert(chunk, { onConflict: 'product_id' });

        if (error) {
          console.error(`[SupabaseService] Upsert catalog chunk error (${i}-${i+chunkSize}):`, error.message);
        } else {
          insertedCount += chunk.length;
        }
      }

      console.log(`[SupabaseService] Successfully upserted ${insertedCount}/${products.length} catalog items into Supabase PostgreSQL.`);
      return { success: true, count: insertedCount };
    } catch (err) {
      console.error('[SupabaseService] Error upserting catalog items:', err.message);
      return { success: false, count: 0, error: err.message };
    }
  }

  /**
   * Fetch all or filtered catalog items directly from Supabase DB using indexed queries.
   */
  async getCatalogItemsFromDB({ page = 1, pageSize = 200, brand = null, category = null } = {}) {
    if (!this.isLiveConfigured || !this.client) return null;

    try {
      let query = this.client
        .from('catalog_items')
        .select('*', { count: 'exact' });

      if (brand) query = query.eq('brand', brand);
      if (category) query = query.eq('category', category);

      const offset = (page - 1) * pageSize;
      query = query.range(offset, offset + pageSize - 1).order('product_id', { ascending: true });

      const { data, count, error } = await query;
      if (error) throw error;

      if (!data || data.length === 0) return null;

      const normalizedProducts = data.map(item => ({
        productId: item.product_id,
        name: item.name,
        brand: item.brand,
        category: item.category,
        sku: item.sku,
        slug: item.slug,
        description: item.description,
        productUrl: item.product_url,
        imageUrl: item.image_url,
        price: item.price,
        stockStatus: item.stock_status,
        stockCount: item.stock_count,
        updatedAt: item.updated_at
      }));

      return {
        products: normalizedProducts,
        totalProducts: count || data.length,
        page,
        pageSize
      };
    } catch (err) {
      console.error('[SupabaseService] Error reading catalog from DB:', err.message);
      return null;
    }
  }

  /**
   * Fast indexed DB search across brand, category, name, sku, product_id
   */
  async searchCatalogItemsDB(searchQuery, limit = 50) {
    if (!this.isLiveConfigured || !this.client || !searchQuery) return [];

    try {
      const q = searchQuery.trim();
      const numQuery = parseInt(q, 10);

      let dbQuery = this.client
        .from('catalog_items')
        .select('*');

      if (!isNaN(numQuery)) {
        dbQuery = dbQuery.or(`product_id.eq.${numQuery},sku.ilike.%${q}%,name.ilike.%${q}%,brand.ilike.%${q}%`);
      } else {
        dbQuery = dbQuery.or(`name.ilike.%${q}%,brand.ilike.%${q}%,category.ilike.%${q}%,sku.ilike.%${q}%`);
      }

      const { data, error } = await dbQuery.limit(limit);
      if (error) throw error;

      return (data || []).map(item => ({
        productId: item.product_id,
        name: item.name,
        brand: item.brand,
        category: item.category,
        sku: item.sku,
        slug: item.slug,
        description: item.description,
        productUrl: item.product_url,
        imageUrl: item.image_url,
        price: item.price,
        stockStatus: item.stock_status,
        stockCount: item.stock_count,
        updatedAt: item.updated_at
      }));
    } catch (err) {
      console.error('[SupabaseService] Search DB error:', err.message);
      return [];
    }
  }
}

export const supabaseService = new SupabaseService();
