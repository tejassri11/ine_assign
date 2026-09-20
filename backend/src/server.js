import { createApp } from './app.js';
import { config } from './config/index.js';
import { catalogService } from './services/catalogService.js';

async function startServer() {
  console.log('========================================================');
  console.log(' Starting INE Product Price Tracker Backend Service');
  console.log('========================================================');
  console.log(`Port: ${config.port}`);
  console.log(`Mock Store URL: ${config.ineBaseUrl}`);
  console.log(`Catalog File Path: ${config.catalogFilePath}`);
  console.log(`Refresh on startup: ${config.refreshOnStartup}`);

  // Initialize catalog (loads from disk or fetches from mock store)
  await catalogService.initialize();

  const app = createApp();

  const server = app.listen(config.port, () => {
    console.log(`[Server] Backend listening on http://localhost:${config.port}`);
    console.log(`[Endpoints]:`);
    console.log(` - Health check:          GET  http://localhost:${config.port}/health`);
    console.log(` - Search products:       GET  http://localhost:${config.port}/api/products/search?q=laptop`);
    console.log(` - Inspect catalog:       GET  http://localhost:${config.port}/api/products/catalog`);
    console.log(` - Refresh catalog:       POST http://localhost:${config.port}/api/products/catalog/refresh`);
    console.log('========================================================');
  });

  // Graceful shutdown
  const shutdown = () => {
    console.log('\n[Server] Shutting down gracefully...');
    server.close(() => {
      console.log('[Server] Process terminated.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

startServer().catch(err => {
  console.error('[Server Fatal Error]:', err);
  process.exit(1);
});
