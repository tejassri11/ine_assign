import fs from 'fs/promises';
import path from 'path';
import { existsSync } from 'fs';
import { config } from '../config/index.js';
import { supabaseService } from './supabaseService.js';

class CatalogService {
  constructor() {
    this.catalog = [];
    this.productIdMap = new Map();
    this.brandMap = new Map();
    this.categoryMap = new Map();
    this.metadata = {
      totalProducts: 0,
      lastRefreshedAt: null,
      sourceUrl: config.ineBaseUrl,
      status: 'uninitialized',
      storageEngine: 'Supabase PostgreSQL + L1 Memory Cache'
    };
    this.isRefreshing = false;
  }

  /**
   * Rebuilds fast in-memory L1 index maps (by ID, Brand, Category)
   */
  rebuildIndexes() {
    this.productIdMap.clear();
    this.brandMap.clear();
    this.categoryMap.clear();

    for (const item of this.catalog) {
      if (item.productId) {
        this.productIdMap.set(item.productId, item);
      }
      
      const brand = item.brand || 'Generic';
      if (!this.brandMap.has(brand)) this.brandMap.set(brand, []);
      this.brandMap.get(brand).push(item);

      const cat = item.category || 'General';
      if (!this.categoryMap.has(cat)) this.categoryMap.set(cat, []);
      this.categoryMap.get(cat).push(item);
    }
  }

  /**
   * Initializes the catalog service with multi-tier storage:
   * 1. Supabase PostgreSQL catalog_items table (L2 Database Cache)
   * 2. Local catalog.json (L3 File Cache)
   * 3. Remote Mock Store API (Primary Source)
   */
  async initialize() {
    try {
      // 1. Try loading from Supabase PostgreSQL database first
      const dbCatalog = await supabaseService.getCatalogItemsFromDB({ page: 1, pageSize: 1000 });
      if (dbCatalog && Array.isArray(dbCatalog.products) && dbCatalog.products.length > 0) {
        console.log(`[CatalogService] Loaded ${dbCatalog.products.length} products from Supabase PostgreSQL database cache.`);
        this.catalog = this.validateAndDeduplicate(dbCatalog.products);
        this.metadata = {
          totalProducts: this.catalog.length,
          lastRefreshedAt: new Date().toISOString(),
          sourceUrl: config.ineBaseUrl,
          status: 'ready',
          storageEngine: 'Supabase PostgreSQL'
        };
        this.rebuildIndexes();
        await this.saveToDisk();
        return;
      }

      // 2. Fallback to local catalog.json
      if (existsSync(config.catalogFilePath)) {
        console.log(`[CatalogService] Loading existing catalog from ${config.catalogFilePath}...`);
        await this.loadFromDisk();
        console.log(`[CatalogService] Loaded ${this.catalog.length} products from disk.`);
        this.rebuildIndexes();

        // Sync to Supabase PostgreSQL database in background
        if (this.catalog.length > 0) {
          supabaseService.upsertCatalogItems(this.catalog).catch(err => {
            console.warn('[CatalogService] Background DB sync warning:', err.message);
          });
        }
      }

      // 3. If empty or refreshOnStartup, fetch from mock store & populate DB
      if (this.catalog.length === 0 || config.refreshOnStartup) {
        console.log('[CatalogService] Catalog empty or refresh requested. Fetching from mock store...');
        await this.refreshCatalog();
      }
    } catch (error) {
      console.error('[CatalogService] Initialization warning:', error.message);
    }
  }

  /**
   * Loads catalog from local JSON file
   */
  async loadFromDisk() {
    try {
      const data = await fs.readFile(config.catalogFilePath, 'utf8');
      const parsed = JSON.parse(data);

      if (!parsed || !Array.isArray(parsed.products)) {
        throw new Error('Malformed catalog.json format: expected "products" array');
      }

      this.catalog = this.validateAndDeduplicate(parsed.products);
      this.metadata = parsed.metadata || {
        totalProducts: this.catalog.length,
        lastRefreshedAt: new Date().toISOString(),
        sourceUrl: config.ineBaseUrl,
        status: 'loaded_from_disk'
      };
      this.metadata.totalProducts = this.catalog.length;
      this.metadata.status = 'ready';
    } catch (err) {
      console.error('[CatalogService] Error reading catalog from disk:', err.message);
      throw err;
    }
  }

  /**
   * Saves normalized catalog and metadata to disk (backend/data/catalog.json)
   */
  async saveToDisk() {
    try {
      const dir = path.dirname(config.catalogFilePath);
      if (!existsSync(dir)) {
        await fs.mkdir(dir, { recursive: true });
      }

      const payload = {
        metadata: this.metadata,
        products: this.catalog
      };

      await fs.writeFile(config.catalogFilePath, JSON.stringify(payload, null, 2), 'utf8');
      console.log(`[CatalogService] Saved ${this.catalog.length} products to ${config.catalogFilePath}`);
    } catch (err) {
      console.error('[CatalogService] Failed to write catalog to disk:', err.message);
      throw err;
    }
  }

  /**
   * Validates each product record, normalizes fields, and deduplicates by productId
   */
  validateAndDeduplicate(rawProducts) {
    if (!Array.isArray(rawProducts)) return [];

    const seenIds = new Set();
    const validated = [];

    for (const item of rawProducts) {
      const rawId = item.productId ?? item.id;
      if (rawId === undefined || rawId === null) {
        continue; // Skip invalid item without ID
      }

      const productId = parseInt(rawId, 10);
      if (isNaN(productId) || seenIds.has(productId)) {
        continue; // Skip NaN or duplicate productId
      }

      seenIds.add(productId);

      const name = (item.name || '').trim();
      if (!name) continue; // Must have a name

      const slug = item.slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const brand = (item.brand || '').trim();
      const category = (item.category || '').trim();
      const sku = (item.sku || item.SKU || '').trim();
      const description = (item.description || '').trim();
      const imageUrl = item.imageUrl || null;
      const productUrl = `${config.ineBaseUrl}/product/${productId}`;

      validated.push({
        productId,
        name,
        brand,
        category,
        sku,
        slug,
        description,
        imageUrl,
        productUrl,
        updatedAt: item.updatedAt || new Date().toISOString()
      });
    }

    return validated;
  }

  /**
   * Fetches the entire product catalog from INE mock store /api/catalog
   * Handles pagination, retries on transient network errors, validation, and deduplication.
   */
  async refreshCatalog() {
    if (this.isRefreshing) {
      return { status: 'already_running', message: 'Catalog refresh is already in progress' };
    }

    this.isRefreshing = true;
    const startTime = Date.now();
    const collectedItems = [];

    try {
      console.log(`[CatalogService] Starting catalog fetch from ${config.ineBaseUrl}${config.catalogApiPath}...`);

      let currentPage = 1;
      let totalPages = 1;
      const pageSize = config.catalogPageSize;

      while (currentPage <= totalPages) {
        const pageUrl = `${config.ineBaseUrl}${config.catalogApiPath}?page=${currentPage}&pageSize=${pageSize}`;
        console.log(`[CatalogService] Fetching page ${currentPage}/${totalPages}...`);

        let responseData = null;
        let fetchError = null;

        // Retry up to 3 times per page for transient errors/slow loads
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            const res = await fetch(pageUrl, {
              headers: {
                'Accept': 'application/json',
                'User-Agent': 'INE-ProductTracker-Backend/1.0'
              },
              signal: AbortSignal.timeout(15000)
            });

            if (!res.ok) {
              throw new Error(`HTTP ${res.status}: ${res.statusText}`);
            }

            const json = await res.json();
            if (!json || typeof json !== 'object') {
              throw new Error('Malformed JSON response received from mock store');
            }

            if (!Array.isArray(json.items)) {
              throw new Error('Malformed catalog response: "items" array missing');
            }

            responseData = json;
            break; // Success!
          } catch (err) {
            fetchError = err;
            console.warn(`[CatalogService] Page ${currentPage} attempt ${attempt} failed: ${err.message}. Retrying...`);
            await new Promise(r => setTimeout(r, 1000 * attempt));
          }
        }

        if (!responseData) {
          throw new Error(`Failed to fetch catalog page ${currentPage} after 3 attempts: ${fetchError?.message}`);
        }

        totalPages = responseData.pages || 1;
        collectedItems.push(...responseData.items);
        currentPage++;
      }

      if (collectedItems.length === 0) {
        throw new Error('Received empty catalog from mock store');
      }

      const deduplicated = this.validateAndDeduplicate(collectedItems);

      this.catalog = deduplicated;
      this.metadata = {
        totalProducts: this.catalog.length,
        lastRefreshedAt: new Date().toISOString(),
        sourceUrl: config.ineBaseUrl,
        durationMs: Date.now() - startTime,
        status: 'ready',
        storageEngine: 'Supabase PostgreSQL'
      };

      this.rebuildIndexes();
      await this.saveToDisk();

      // Batch sync all catalog items to Supabase PostgreSQL database
      await supabaseService.upsertCatalogItems(this.catalog);

      console.log(`[CatalogService] Successfully refreshed catalog. Total products: ${this.catalog.length} (took ${this.metadata.durationMs}ms)`);
      return {
        success: true,
        totalProducts: this.catalog.length,
        durationMs: this.metadata.durationMs
      };
    } catch (err) {
      console.error('[CatalogService] Catalog refresh failed:', err.message);
      this.metadata.status = 'error';
      this.metadata.lastError = err.message;
      throw err;
    } finally {
      this.isRefreshing = false;
    }
  }

  /**
   * Fast In-Memory Search with Relevance Scoring:
   * Supports exact and partial match, case-insensitive, ignores leading/trailing whitespace.
   * Matches product ID, name, brand, SKU, category, slug, and description.
   */
  search(query, limit = config.maxSearchResults) {
    if (!query || typeof query !== 'string') {
      return [];
    }

    const rawTrimmed = query.trim().toLowerCase();
    if (!rawTrimmed) {
      return [];
    }

    // Extract numeric ID if user pasted a URL or typed "#54", "ID: 54", "product/54", etc.
    const urlOrIdMatch = rawTrimmed.match(/(?:product\/|id:?\s*|#\s*)?(\d+)/i);
    const extractedId = urlOrIdMatch ? urlOrIdMatch[1] : null;

    // Clean tokens for multi-word search
    const cleanQuery = rawTrimmed.replace(/^https?:\/\/[^\/]+/i, '').replace(/[^a-z0-9\s]/gi, ' ').trim();
    const tokens = cleanQuery.split(/\s+/).filter(Boolean);

    const maxResults = Math.min(Math.max(1, parseInt(limit, 10) || config.maxSearchResults), 100);

    const scoredProducts = [];

    for (const product of this.catalog) {
      const pIdStr = String(product.productId);
      const nameLower = (product.name || '').toLowerCase();
      const brandLower = (product.brand || '').toLowerCase();
      const skuLower = (product.sku || '').toLowerCase();
      const categoryLower = (product.category || '').toLowerCase();
      const slugLower = (product.slug || '').toLowerCase();
      const descLower = (product.description || '').toLowerCase();

      let score = 0;

      // 1. Product ID Match (Highest Priority)
      if (extractedId && pIdStr === extractedId) {
        score += 1000;
      } else if (extractedId && pIdStr.startsWith(extractedId)) {
        score += 300;
      } else if (pIdStr === rawTrimmed) {
        score += 1000;
      }

      // 2. Exact Field Matches
      if (nameLower === rawTrimmed) score += 500;
      if (skuLower === rawTrimmed) score += 500;
      if (brandLower === rawTrimmed) score += 400;
      if (categoryLower === rawTrimmed) score += 300;

      // 3. Prefix Matches
      if (nameLower.startsWith(rawTrimmed)) score += 250;
      if (skuLower.startsWith(rawTrimmed)) score += 250;
      if (brandLower.startsWith(rawTrimmed)) score += 200;
      if (categoryLower.startsWith(rawTrimmed)) score += 150;

      // 4. Substring Matches for single-phrase query
      if (nameLower.includes(rawTrimmed)) score += 100;
      if (skuLower.includes(rawTrimmed)) score += 100;
      if (brandLower.includes(rawTrimmed)) score += 80;
      if (categoryLower.includes(rawTrimmed)) score += 60;
      if (slugLower.includes(rawTrimmed)) score += 40;
      if (descLower.includes(rawTrimmed)) score += 20;

      // 5. Multi-token Token Matching (e.g. "Summit Monitor" matches both brand and category/name)
      if (tokens.length > 1) {
        let tokenMatches = 0;
        for (const token of tokens) {
          if (
            nameLower.includes(token) ||
            brandLower.includes(token) ||
            skuLower.includes(token) ||
            categoryLower.includes(token) ||
            pIdStr.includes(token)
          ) {
            tokenMatches++;
          }
        }
        if (tokenMatches === tokens.length) {
          score += 150; // All tokens match
        } else if (tokenMatches > 0) {
          score += tokenMatches * 30; // Partial token match
        }
      }

      if (score > 0) {
        scoredProducts.push({ product, score });
      }
    }

    // Sort descending by relevance score, with fallback tie-breaker by productId
    scoredProducts.sort((a, b) => b.score - a.score || a.product.productId - b.product.productId);

    return scoredProducts.slice(0, maxResults).map(sp => sp.product);
  }

  /**
   * Retrieve catalog metadata and product list (with optional pagination)
   */
  getCatalog(page = 1, pageSize = 50) {
    const p = Math.max(1, parseInt(page, 10) || 1);
    const ps = Math.min(Math.max(1, parseInt(pageSize, 10) || 50), 200);

    const startIndex = (p - 1) * ps;
    const items = this.catalog.slice(startIndex, startIndex + ps);

    return {
      metadata: this.metadata,
      pagination: {
        page: p,
        pageSize: ps,
        totalPages: Math.ceil(this.catalog.length / ps) || 1,
        totalItems: this.catalog.length
      },
      products: items
    };
  }

  /**
   * Fast O(1) Product Lookup by ID
   */
  getProductById(productId) {
    const id = parseInt(productId, 10);
    if (isNaN(id)) return null;
    return this.productIdMap.get(id) || this.catalog.find(p => p.productId === id) || null;
  }
}

export const catalogService = new CatalogService();
