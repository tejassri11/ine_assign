-- ====================================================================
-- INE Product Price Tracker: PostgreSQL Schema for Supabase
-- Tables: tracked_products, price_history, scrape_logs
-- ====================================================================

-- 0. CATALOG ITEMS TABLE
-- Stores full catalog of mock store products in Supabase PostgreSQL with high-performance indexes.
CREATE TABLE IF NOT EXISTS catalog_items (
    id BIGSERIAL PRIMARY KEY,
    product_id INT UNIQUE NOT NULL,                       -- INE mock store product ID
    name TEXT NOT NULL,                                   -- Product name
    brand TEXT NOT NULL,                                  -- Brand / Company name
    category TEXT NOT NULL,                               -- Product category
    sku VARCHAR(100),                                     -- SKU
    slug TEXT,                                            -- SEO slug
    description TEXT,                                     -- Product description
    product_url TEXT NOT NULL,                            -- Canonical product URL
    image_url TEXT,                                       -- Image URL
    price NUMERIC(10, 2),                                 -- Baseline catalog price
    stock_status VARCHAR(50),                             -- Baseline availability status
    stock_count INT,                                      -- Baseline units count
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 1. TRACKED PRODUCTS TABLE
-- Stores canonical products selected by users from INE's mock catalog.
-- Enforces uniqueness on product_id to prevent duplicate tracking.
CREATE TABLE IF NOT EXISTS tracked_products (
    id BIGSERIAL PRIMARY KEY,
    product_id INT UNIQUE NOT NULL,                       -- INE mock store product ID
    name TEXT NOT NULL,                                   -- Canonical product name
    brand TEXT,                                           -- Brand name (e.g. Cobalt, Vista)
    category TEXT,                                        -- Product category (Laptops, Audio, etc.)
    sku VARCHAR(100),                                     -- SKU (e.g. COB-10735)
    slug TEXT,                                            -- SEO slug
    product_url TEXT NOT NULL,                            -- Canonical URL on mock store
    image_url TEXT,                                       -- Product image URL (or null for mock store icons)
    is_active BOOLEAN DEFAULT TRUE,                       -- Allows soft deactivation/pause
    current_price NUMERIC(10, 2),                         -- Latest scraped price
    current_stock_status VARCHAR(50),                     -- 'IN_STOCK', 'OUT_OF_STOCK', 'LOW_STOCK'
    current_stock_count INT,                              -- Exact units left (if reported)
    last_scraped_at TIMESTAMPTZ,                          -- Timestamp of last successful or attempted scrape
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. PRICE HISTORY TABLE
-- High-frequency time-series table tracking price and stock changes over time.
CREATE TABLE IF NOT EXISTS price_history (
    id BIGSERIAL PRIMARY KEY,
    tracked_product_id BIGINT NOT NULL REFERENCES tracked_products(id) ON DELETE CASCADE,
    price NUMERIC(10, 2) NOT NULL,
    stock_status VARCHAR(50) NOT NULL,
    stock_count INT,
    recorded_at TIMESTAMPTZ DEFAULT NOW(),
    scrape_run_id TEXT                                    -- Correlation ID for grouping multi-product runs
);

-- 3. SCRAPE LOGS TABLE
-- Audit log recording every scrape attempt (SUCCESS, RETRIED, FAILED) for complete honesty.
CREATE TABLE IF NOT EXISTS scrape_logs (
    id BIGSERIAL PRIMARY KEY,
    tracked_product_id BIGINT NOT NULL REFERENCES tracked_products(id) ON DELETE CASCADE,
    attempt_number INT DEFAULT 1,
    status VARCHAR(20) NOT NULL,                          -- 'SUCCESS', 'RETRIED', 'FAILED'
    error_type VARCHAR(100),                              -- E.g. 'TIMEOUT', 'COOKIE_BLOCKED', 'HTTP_500'
    error_message TEXT,                                   -- Detailed error string if failed
    duration_ms INT,                                      -- Execution duration in milliseconds
    price_scraped NUMERIC(10, 2),                         -- Price extracted in this attempt
    stock_scraped VARCHAR(50),                            -- Stock status extracted in this attempt
    extraction_method VARCHAR(50) DEFAULT 'playwright',   -- 'playwright', 'http_fallback', etc.
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ====================================================================
-- PERFORMANCE INDEXES FOR FAST RETRIEVAL & SEARCH
-- ====================================================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_catalog_items_pid ON catalog_items(product_id);
CREATE INDEX IF NOT EXISTS idx_catalog_items_brand ON catalog_items(brand);
CREATE INDEX IF NOT EXISTS idx_catalog_items_category ON catalog_items(category);
CREATE INDEX IF NOT EXISTS idx_catalog_items_brand_cat ON catalog_items(brand, category);
CREATE INDEX IF NOT EXISTS idx_catalog_items_sku ON catalog_items(sku);
CREATE INDEX IF NOT EXISTS idx_catalog_items_name_lower ON catalog_items(LOWER(name));

CREATE INDEX IF NOT EXISTS idx_tracked_products_pid ON tracked_products(product_id);
CREATE INDEX IF NOT EXISTS idx_tracked_products_active ON tracked_products(is_active);
CREATE INDEX IF NOT EXISTS idx_price_history_pid_date ON price_history(tracked_product_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_scrape_logs_pid_date ON scrape_logs(tracked_product_id, created_at DESC);

-- Automatic updated_at trigger for tracked_products
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

DROP TRIGGER IF EXISTS trg_update_tracked_products_timestamp ON tracked_products;
CREATE TRIGGER trg_update_tracked_products_timestamp
BEFORE UPDATE ON tracked_products
FOR EACH ROW
EXECUTE FUNCTION update_modified_column();

-- ====================================================================
-- PERMISSIONS & ROW LEVEL SECURITY (RLS)
-- ====================================================================
GRANT USAGE ON SCHEMA public TO service_role;
GRANT ALL ON TABLE public.tracked_products TO service_role;
GRANT ALL ON TABLE public.price_history TO service_role;
GRANT ALL ON TABLE public.scrape_logs TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

ALTER TABLE public.tracked_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scrape_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_tracked_products" ON public.tracked_products FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_price_history" ON public.price_history FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_scrape_logs" ON public.scrape_logs FOR ALL TO service_role USING (true) WITH CHECK (true);
