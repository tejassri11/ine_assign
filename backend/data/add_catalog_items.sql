-- ====================================================================
-- INE Product Price Tracker: Add catalog_items Table with Performance Indexing
-- Stores all catalog items in Supabase PostgreSQL for fast, indexed retrieval
-- ====================================================================

CREATE TABLE IF NOT EXISTS catalog_items (
    id BIGSERIAL PRIMARY KEY,
    product_id INT UNIQUE NOT NULL,                       -- INE mock store product ID
    name TEXT NOT NULL,                                   -- Product name
    brand TEXT NOT NULL,                                  -- Brand / Company name (e.g., Cobalt, Meridian, Vista)
    category TEXT NOT NULL,                               -- Product category (e.g., Laptops, Audio, Wearables)
    sku VARCHAR(100),                                     -- SKU (e.g. COB-10735)
    slug TEXT,                                            -- SEO slug
    description TEXT,                                     -- Product description
    product_url TEXT NOT NULL,                            -- Canonical product URL on mock store
    image_url TEXT,                                       -- Image URL (or null for category icon)
    price NUMERIC(10, 2),                                 -- Baseline catalog price
    stock_status VARCHAR(50),                             -- Baseline availability status
    stock_count INT,                                      -- Baseline units count
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ====================================================================
-- HIGH PERFORMANCE INDEXES FOR ULTRA-FAST DB RETRIEVAL & SEARCH
-- ====================================================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_catalog_items_pid ON catalog_items(product_id);
CREATE INDEX IF NOT EXISTS idx_catalog_items_brand ON catalog_items(brand);
CREATE INDEX IF NOT EXISTS idx_catalog_items_category ON catalog_items(category);
CREATE INDEX IF NOT EXISTS idx_catalog_items_brand_category ON catalog_items(brand, category);
CREATE INDEX IF NOT EXISTS idx_catalog_items_sku ON catalog_items(sku);
CREATE INDEX IF NOT EXISTS idx_catalog_items_name_lower ON catalog_items(LOWER(name));
CREATE INDEX IF NOT EXISTS idx_catalog_items_updated ON catalog_items(updated_at DESC);

-- Automatic updated_at trigger for catalog_items
DROP TRIGGER IF EXISTS trg_update_catalog_items_timestamp ON catalog_items;
CREATE TRIGGER trg_update_catalog_items_timestamp
BEFORE UPDATE ON catalog_items
FOR EACH ROW
EXECUTE FUNCTION update_modified_column();

-- ====================================================================
-- PERMISSIONS & ROW LEVEL SECURITY (RLS)
-- ====================================================================
GRANT ALL ON TABLE public.catalog_items TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

ALTER TABLE public.catalog_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_catalog_items" ON public.catalog_items;
CREATE POLICY "service_role_all_catalog_items"
ON public.catalog_items
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
