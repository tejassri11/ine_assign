import express from 'express';
import cors from 'cors';
import { config } from './config/index.js';
import productRoutes from './routes/productRoutes.js';
import cronRoutes from './routes/cronRoutes.js';

export function createApp() {
  const app = express();

  const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:5174',
    'https://ine-assign.vercel.app',
    config.frontendUrl
  ].filter(Boolean);

  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, Postman, cron) or if in allowed list
      if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
        return callback(null, true);
      }
      return callback(null, true); // Permissive fallback to ensure zero CORS blocks
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
  }));
  app.use(express.json());

  // Request logger
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      console.log(`[HTTP] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${duration}ms)`);
    });
    next();
  });

  // Health check with database connectivity status and last scrape run info
  app.get('/health', async (req, res) => {
    const { supabaseService } = await import('./services/supabaseService.js');
    const dbStatus = await supabaseService.checkConnection();

    // Get last run summary from DB if available
    let lastRun = null;
    try {
      if (supabaseService.isLiveConfigured && supabaseService.client) {
        const { data } = await supabaseService.client
          .from('scrape_runs')
          .select('id, status, started_at, finished_at, total_products, successes, failures, triggered_by')
          .order('started_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        lastRun = data || null;
      }
    } catch (_) {}

    res.json({
      status: 'ok',
      service: 'ine-price-tracker-backend',
      timestamp: new Date().toISOString(),
      database: dbStatus,
      lastScrapeRun: lastRun
    });
  });

  // Product API routes
  app.use('/api/products', productRoutes);

  // Cron scrape route (protected by CRON_SECRET bearer token)
  app.use('/api/cron', cronRoutes);

  // 404 Handler
  app.use((req, res) => {
    res.status(404).json({
      success: false,
      error: 'Not Found',
      path: req.originalUrl
    });
  });

  // Global Error Handler
  app.use((err, req, res, next) => {
    console.error('[Unhandled Error]', err);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: err.message
    });
  });

  return app;
}
