-- ====================================================================
-- SUPABASE PERMISSIONS & RLS POLICIES FIX
-- Run this in the Supabase SQL Editor (https://supabase.com/dashboard/project/ugewxietvckirosuuhmx/sql)
-- ====================================================================

-- 1. Grant table access to service_role
GRANT USAGE ON SCHEMA public TO service_role;
GRANT ALL ON TABLE public.tracked_products TO service_role;
GRANT ALL ON TABLE public.price_history TO service_role;
GRANT ALL ON TABLE public.scrape_logs TO service_role;

-- 2. Grant sequence permissions for auto-incrementing BIGSERIAL IDs
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- 3. Enable Row Level Security (RLS) for defense-in-depth
ALTER TABLE public.tracked_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scrape_logs ENABLE ROW LEVEL SECURITY;

-- 4. Minimum required policies for service_role
DROP POLICY IF EXISTS "service_role_all_tracked_products" ON public.tracked_products;
CREATE POLICY "service_role_all_tracked_products"
ON public.tracked_products
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_all_price_history" ON public.price_history;
CREATE POLICY "service_role_all_price_history"
ON public.price_history
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_all_scrape_logs" ON public.scrape_logs;
CREATE POLICY "service_role_all_scrape_logs"
ON public.scrape_logs
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
