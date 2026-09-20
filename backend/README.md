# 📦 INE Backend - Product Catalog & Search Service

This backend service powers the product catalog indexing and search engine for the INE Software Engineer Intern Product Price Tracker assignment.

---

## 💡 Architecture Rationale

### 1. Why the Local Catalog Exists (`backend/data/catalog.json`)
- **Zero-Latency Search:** Searching directly in memory and backed by a local JSON store avoids making repeated network requests across the Internet for every keystroke or search query.
- **Resilience Against Upstream Outages:** The INE mock storefront intentionally experiences transient delays, rate limits (429), and 500 server errors. By maintaining a local verified catalog index, the search functionality remains 100% operational even if the external storefront is temporarily slow or down.
- **Clean Separation of Concerns:** Product catalog discovery/metadata (name, brand, category, SKU, description, product URL) is separated from the volatile, anti-bot-protected price and stock scraping.

### 2. Why Homepage HTML is NOT Used for Catalog Discovery
- **Single Page Application (SPA):** The storefront is a client-side React SPA (`<div id="root"></div>`). Fetching the raw homepage HTML via HTTP (`curl`, `cheerio`, `axios`) returns empty HTML shells with no product elements or catalog listings.
- **No HTML Search Form on Storefront:** The storefront UI itself does not contain an HTML search input or server-rendered catalog.
- **Official Discovered Endpoint:** Reverse-engineering the storefront JavaScript bundle revealed the official pagination endpoint:
  ```
  GET https://demo.inelabteamdev.com/api/catalog?page=1&pageSize=60
  ```
  Fetching this endpoint provides structured, canonical metadata without executing heavy headless browsers for basic search discovery.

### 3. How Catalog Refresh Works
1. **Startup Check:** When the backend starts (`npm start`), `CatalogService` inspects `backend/data/catalog.json`. If it exists, it loads all products into an in-memory index immediately.
2. **On-Demand / Automated Refresh:**
   - If `catalog.json` does not exist, or if `REFRESH_CATALOG_ON_STARTUP=true`, the service automatically queries all pages (`1..17`) from the mock store API.
   - **CLI Script:** Developers can refresh the catalog anytime via:
     ```bash
     npm run catalog:refresh
     ```
   - **HTTP Endpoint:** Admin or webhooks can trigger a refresh via:
     ```bash
     POST /api/products/catalog/refresh
     ```
3. **Deduplication & Validation:** Each product is checked for valid `productId`, non-empty `name`, canonical `slug`, `sku`, `category`, and unique IDs before saving to disk.

---

## 🚀 Running the Service

### Installation
```bash
npm install
```

### Run Unit Tests
```bash
npm test
```

### Refresh Catalog
```bash
npm run catalog:refresh
```

### Start Server
```bash
npm start
# or development watch mode:
npm run dev
```

---

## 📡 API Endpoints

### 1. Product Search
- **Endpoint:** `GET /api/products/search?q={query}&limit={limit}`
- **Features:** Case-insensitive, supports partial matches, exact matches, ignores leading/trailing whitespace, searches across name, brand, SKU, and category.
- **Sample Request:**
  ```bash
  curl "http://localhost:5001/api/products/search?q=slimbook&limit=5"
  ```
- **Sample Response:**
  ```json
  {
    "success": true,
    "query": "slimbook",
    "count": 5,
    "results": [
      {
        "productId": 735,
        "name": "Cobalt Slimbook X",
        "brand": "Cobalt",
        "category": "Laptops",
        "sku": "COB-10735",
        "slug": "cobalt-slimbook-x",
        "description": "The Cobalt Slimbook X. A dependable laptops pick...",
        "imageUrl": null,
        "productUrl": "https://demo.inelabteamdev.com/product/735",
        "updatedAt": "2026-09-20T12:57:20.358Z"
      }
    ]
  }
  ```

### 2. Inspect Catalog (Admin / Debugging)
- **Endpoint:** `GET /api/products/catalog?page=1&pageSize=20`
- **Sample Response:**
  ```json
  {
    "success": true,
    "metadata": {
      "totalProducts": 643,
      "lastRefreshedAt": "2026-09-20T13:00:52.000Z",
      "status": "ready"
    },
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "totalPages": 33,
      "totalItems": 643
    },
    "products": [...]
  }
  ```

### 3. Single Product Lookup
- **Endpoint:** `GET /api/products/:id`
- **Sample Request:**
  ```bash
  curl "http://localhost:5001/api/products/735"
  ```

### 4. Track Product
- **Endpoint:** `POST /api/products/track`
- **Validation:** Accepts only `productId` from our catalog. Arbitrary URLs or non-catalog IDs are rejected with 400/404. Duplicate tracking returns 409 conflict.
- **Sample Request:**
  ```bash
  curl -X POST "http://localhost:5001/api/products/track" \
    -H "Content-Type: application/json" \
    -d '{"productId": 735}'
  ```
- **Sample Response (201 Created):**
  ```json
  {
    "success": true,
    "message": "Product \"Cobalt Slimbook X\" (ID: 735) is now tracked.",
    "product": {
      "id": 1,
      "product_id": 735,
      "name": "Cobalt Slimbook X",
      "brand": "Cobalt",
      "category": "Laptops",
      "sku": "COB-10735",
      "slug": "cobalt-slimbook-x",
      "product_url": "https://demo.inelabteamdev.com/product/735",
      "is_active": true,
      "created_at": "2026-09-20T13:13:11.294Z"
    }
  }
  ```

### 5. List Tracked Products
- **Endpoint:** `GET /api/products/tracked?activeOnly=true`
- **Sample Response:**
  ```json
  {
    "success": true,
    "count": 2,
    "products": [...]
  }
  ```

### 6. Deactivate Tracked Product
- **Endpoint:** `DELETE /api/products/:id/track`
- **Behavior:** Soft-deactivates the product (`is_active = false`), preserving price and scrape logs history.
- **Sample Response:**
  ```json
  {
    "success": true,
    "message": "Product \"Cobalt Slimbook X\" has been deactivated from active tracking.",
    "product": { ... }
  }
  ```

### 7. Health & Database Connectivity Check
- **Endpoint:** `GET /health`
- **Sample Response:**
  ```json
  {
    "status": "ok",
    "service": "ine-price-tracker-backend",
    "timestamp": "2026-09-20T13:12:48.793Z",
    "database": {
      "connected": true,
      "mode": "supabase_postgres",
      "latencyMs": 42,
      "message": "Successfully connected to Supabase PostgreSQL database."
    }
  }
  ```

---

## 🗄️ Database Schema & Relationships

Execute `backend/data/schema.sql` in your Supabase SQL Editor:

```
[tracked_products] (1)
       │
       ├─── (1:N) ───► [price_history]
       │                 └── tracked_product_id (FK -> tracked_products.id ON DELETE CASCADE)
       │
       └─── (1:N) ───► [scrape_logs]
                         └── tracked_product_id (FK -> tracked_products.id ON DELETE CASCADE)
```

### Environment Variables
```ini
# Supabase PostgreSQL Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi... # Never expose to frontend!
CRON_SECRET=dev-cron-secret-ine-2026
```
