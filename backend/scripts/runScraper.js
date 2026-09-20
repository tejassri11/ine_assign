import { scrapeProduct } from '../src/scraper/index.js';
import { catalogService } from '../src/services/catalogService.js';

async function main() {
  const args = process.argv.slice(2);

  // Parse CLI flags
  let productId = 572; // Default to tracked product 572
  let isHeaded = args.includes('--headed');
  let slowMo = 50;

  const productIdx = args.indexOf('--product');
  if (productIdx !== -1 && args[productIdx + 1]) {
    productId = parseInt(args[productIdx + 1], 10);
  }

  const slowMoIdx = args.indexOf('--slowMo');
  if (slowMoIdx !== -1 && args[slowMoIdx + 1]) {
    slowMo = parseInt(args[slowMoIdx + 1], 10);
  }

  // Initialize catalog to get product metadata
  await catalogService.initialize();

  let product = catalogService.getProductById(productId);
  if (!product) {
    console.warn(`[CLI] Product ID ${productId} not found in local catalog. Constructing fallback product target.`);
    product = {
      productId,
      name: `Product ${productId}`,
      productUrl: `https://demo.inelabteamdev.com/product/${productId}`
    };
  }

  console.log(`\n======================================================`);
  console.log(` INE Playwright Scraper CLI Tool`);
  console.log(` Product: ${product.name} (ID: ${product.productId})`);
  console.log(` Mode:    ${isHeaded ? 'HEADED (Visible Browser Window)' : 'HEADLESS'}`);
  console.log(` URL:     ${product.productUrl}`);
  console.log(`======================================================\n`);

  try {
    const result = await scrapeProduct(product, {
      headed: isHeaded,
      slowMo: isHeaded ? slowMo : 0
    });

    console.log(`\n--- RESULT SUMMARY ---`);
    console.log(JSON.stringify(result, null, 2));

    if (result.status === 'SUCCESS') {
      console.log(`\n✅ Scrape succeeded in ${result.durationMs}ms!`);
      process.exit(0);
    } else {
      console.log(`\n⚠️ Scrape completed with status: ${result.status} (${result.errorMessage})`);
      process.exit(1);
    }
  } catch (error) {
    console.error(`\n❌ Fatal execution error:`, error);
    process.exit(1);
  }
}

main();
