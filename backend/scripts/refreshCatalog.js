import { catalogService } from '../src/services/catalogService.js';
import { config } from '../src/config/index.js';

async function main() {
  console.log('--- INE Product Catalog CLI Refresh Tool ---');
  console.log(`Target: ${config.ineBaseUrl}${config.catalogApiPath}`);
  console.log(`Destination: ${config.catalogFilePath}`);

  const start = Date.now();
  try {
    const result = await catalogService.refreshCatalog();
    console.log(`✅ Success! Total products fetched & saved: ${result.totalProducts} (${Date.now() - start}ms)`);
    process.exit(0);
  } catch (error) {
    console.error(`❌ Catalog refresh failed: ${error.message}`);
    process.exit(1);
  }
}

main();
