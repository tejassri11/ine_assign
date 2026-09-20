import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const config = {
  port: parseInt(process.env.PORT || '5001', 10),
  ineBaseUrl: (process.env.INE_BASE_URL || 'https://demo.inelabteamdev.com').replace(/\/+$/, ''),
  catalogApiPath: '/api/catalog',
  productApiPath: '/api/product',
  catalogPageSize: 60, // Discovered max page size supported by mock store backend
  catalogFilePath: path.resolve(__dirname, '../../data/catalog.json'),
  refreshOnStartup: process.env.REFRESH_CATALOG_ON_STARTUP === 'true',
  maxSearchResults: parseInt(process.env.MAX_SEARCH_RESULTS || '20', 10),
  // Supabase PostgreSQL Configuration
  supabaseUrl: (process.env.SUPABASE_URL || '').trim(),
  supabaseServiceKey: (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim(),
  // Security token for cron-triggered scrapes
  cronSecret: (process.env.CRON_SECRET || 'dev-cron-secret-ine-2026').trim(),
  // Allowed Frontend URL for CORS & redirects
  frontendUrl: (process.env.FRONTEND_URL || 'https://ine-assign.vercel.app').trim(),
};
