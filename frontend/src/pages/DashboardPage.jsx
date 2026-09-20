import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  RefreshCw, LayoutDashboard, ExternalLink, Activity, 
  Search, LayoutGrid, List, CheckCircle2, AlertOctagon, 
  Clock, ArrowUpRight, ShoppingBag, Eye, Laptop, 
  BatteryCharging, Headphones, Watch, Monitor, Plus, Check, Building2
} from 'lucide-react';
import { Container, Card, Button, Badge, EmptyState, Spinner, StatCard } from '../components/UI';
import * as api from '../api';
import { useDebounce } from '../hooks/useDebounce';

const getCategoryIcon = (categoryName) => {
  const cat = (categoryName || '').toLowerCase();
  if (cat.includes('laptop') || cat.includes('computer')) return <Laptop size={18} className="text-indigo-400" />;
  if (cat.includes('power') || cat.includes('charg') || cat.includes('battery')) return <BatteryCharging size={18} className="text-amber-400" />;
  if (cat.includes('audio') || cat.includes('sound') || cat.includes('headphone')) return <Headphones size={18} className="text-purple-400" />;
  if (cat.includes('wear') || cat.includes('watch')) return <Watch size={18} className="text-emerald-400" />;
  if (cat.includes('display') || cat.includes('monitor')) return <Monitor size={18} className="text-blue-400" />;
  return <ShoppingBag size={18} className="text-[var(--text-muted)]" />;
};

export const DashboardPage = () => {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [scrapingId, setScrapingId] = useState(null);
  
  // Dashboard filters
  const [filterQuery, setFilterQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL' | 'AVAILABLE' | 'UNAVAILABLE'
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'table'

  // Live Catalog search on dashboard
  const [catalogSearchResults, setCatalogSearchResults] = useState([]);
  const [isSearchingCatalog, setIsSearchingCatalog] = useState(false);
  const [trackingId, setTrackingId] = useState(null);

  const debouncedFilter = useDebounce(filterQuery, 350);

  const fetchProducts = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.getTrackedProducts(true);
      setProducts(data.products || []);
    } catch (err) {
      setError(err.message || 'Failed to load tracked products.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  // When user types in search on dashboard, also query full catalog to find any brand/company
  useEffect(() => {
    const searchCatalog = async () => {
      const q = debouncedFilter.trim();
      if (!q) {
        setCatalogSearchResults([]);
        return;
      }

      setIsSearchingCatalog(true);
      try {
        const data = await api.searchProducts(q);
        const results = data.results || [];
        
        // Exclude products that are already tracked
        const trackedIds = new Set(products.map(p => p.product_id || p.productId || p.id));
        const untrackedResults = results.filter(p => !trackedIds.has(p.productId));
        setCatalogSearchResults(untrackedResults);
      } catch (err) {
        console.error('Failed to search catalog from dashboard:', err);
        setCatalogSearchResults([]);
      } finally {
        setIsSearchingCatalog(false);
      }
    };

    searchCatalog();
  }, [debouncedFilter, products]);

  // Scrape using the canonical INE product_id from catalog.json
  const handleScrapeNow = async (canonicalId, e) => {
    if (e) e.stopPropagation();
    setScrapingId(canonicalId);
    try {
      await api.scrapeProductNow(canonicalId);
      await fetchProducts();
    } catch (err) {
      alert(`Scrape failed: ${err.message}`);
    } finally {
      setScrapingId(null);
    }
  };

  // Track product directly from dashboard search
  const handleTrackFromSearch = async (product) => {
    const pId = product.productId || product.product_id;
    if (!pId) return;

    setTrackingId(pId);
    try {
      await api.trackProduct(pId);
      await fetchProducts();
      // Remove from search results
      setCatalogSearchResults(prev => prev.filter(p => p.productId !== pId));
    } catch (err) {
      alert(`Failed to track: ${err.message}`);
    } finally {
      setTrackingId(null);
    }
  };

  // Compute summary stats with no stock terminology
  const stats = useMemo(() => {
    const total = products.length;
    const available = products.filter(p => p.current_stock_status === 'IN_STOCK').length;
    const unavailable = products.filter(p => p.current_stock_status === 'OUT_OF_STOCK').length;
    const pending = products.filter(p => !p.current_stock_status || p.current_stock_status === 'UNKNOWN').length;
    return { total, available, unavailable, pending };
  }, [products]);

  // Filter tracked products
  const filteredProducts = useMemo(() => {
    return products.filter(product => {
      const q = filterQuery.toLowerCase();
      const matchesText = 
        (product.name || '').toLowerCase().includes(q) ||
        (product.brand || '').toLowerCase().includes(q) ||
        (product.category || '').toLowerCase().includes(q) ||
        String(product.product_id || product.productId || product.id).includes(q);

      if (!matchesText) return false;

      if (statusFilter === 'AVAILABLE') return product.current_stock_status === 'IN_STOCK';
      if (statusFilter === 'UNAVAILABLE') return product.current_stock_status === 'OUT_OF_STOCK';
      return true;
    });
  }, [products, filterQuery, statusFilter]);

  const formatPrice = (price) => {
    if (price === null || price === undefined) return '—';
    return new Intl.NumberFormat('en-IN', { 
      style: 'currency', 
      currency: 'INR', 
      maximumFractionDigits: 0 
    }).format(price);
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Never scraped';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="flex flex-col w-full pb-20">
      {/* Page Header */}
      <section className="border-b border-[var(--border-subtle)] bg-[rgba(15,15,20,0.6)] backdrop-blur-md py-10 px-6">
        <Container className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xs font-mono uppercase px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                Surveillance Hub
              </span>
              <span className="text-xs text-[var(--text-muted)]">Live Data Feed</span>
            </div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight">Tracked Products</h1>
            <p className="text-sm text-[var(--text-secondary)] mt-0.5">
              Real-time anti-bot telemetry, price reveals, and inventory surveillance
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button 
              className="btn btn-secondary"
              onClick={fetchProducts} 
              disabled={isLoading}
            >
              <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
              Refresh
            </button>
            <Link to="/" className="btn btn-primary">
              + Track New Product
            </Link>
          </div>
        </Container>
      </section>

      <Container className="pt-8 max-w-6xl mx-auto flex flex-col gap-8">
        
        {/* Metric Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard 
            title="Total Under Watch" 
            value={stats.total} 
            subtitle="Catalog items tracked"
            icon={<Activity size={18} />}
          />
          <StatCard 
            title="Available" 
            value={stats.available} 
            subtitle="Ready for order"
            icon={<CheckCircle2 size={18} className="text-emerald-400" />}
            badge={<Badge variant="success" hasDot>Available</Badge>}
          />
          <StatCard 
            title="Sold Out" 
            value={stats.unavailable} 
            subtitle="Currently unavailable"
            icon={<AlertOctagon size={18} className="text-rose-400" />}
            badge={<Badge variant="failure" hasDot>Sold Out</Badge>}
          />
          <StatCard 
            title="Pending Scrape" 
            value={stats.pending} 
            subtitle="Awaiting reveal cycle"
            icon={<Clock size={18} />}
            badge={<Badge variant="neutral">Queued</Badge>}
          />
        </div>

        {/* Toolbar: Search, Filters, and View Switcher with Strict Matching Heights */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', padding: '1rem', borderRadius: '12px', backgroundColor: 'var(--surface-card)', border: '1px solid var(--border-default)' }}>
          
          {/* Search Box */}
          <div style={{ position: 'relative', width: '300px', flexShrink: 0 }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input 
              type="text"
              style={{ width: '100%', height: '38px', paddingLeft: '36px', paddingRight: '12px', backgroundColor: 'var(--surface-elevated)', border: '1px solid var(--border-subtle)', borderRadius: '8px', color: '#fff', fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box' }}
              placeholder="Search by company, product, or ID..."
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
            />
          </div>

          {/* Filter Pills */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              onClick={() => setStatusFilter('ALL')}
              className={`btn btn-sm ${statusFilter === 'ALL' ? 'btn-primary' : 'btn-secondary'}`}
            >
              All ({stats.total})
            </button>
            <button
              onClick={() => setStatusFilter('AVAILABLE')}
              className={`btn btn-sm ${statusFilter === 'AVAILABLE' ? 'btn-primary' : 'btn-secondary'}`}
            >
              Available ({stats.available})
            </button>
            <button
              onClick={() => setStatusFilter('UNAVAILABLE')}
              className={`btn btn-sm ${statusFilter === 'UNAVAILABLE' ? 'btn-primary' : 'btn-secondary'}`}
            >
              Sold Out ({stats.unavailable})
            </button>
          </div>

          {/* View switcher */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginLeft: 'auto' }}>
            <button
              onClick={() => setViewMode('grid')}
              className={`btn btn-sm ${viewMode === 'grid' ? 'btn-primary' : 'btn-secondary'}`}
              title="Grid View"
            >
              <LayoutGrid size={15} />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`btn btn-sm ${viewMode === 'table' ? 'btn-primary' : 'btn-secondary'}`}
              title="Table View"
            >
              <List size={15} />
            </button>
          </div>
        </div>

        {/* Catalog Search Results Section (Shown when search has matching items in catalog) */}
        {filterQuery.trim() && catalogSearchResults.length > 0 && (
          <div style={{ padding: '1.25rem', borderRadius: '14px', backgroundColor: 'rgba(99, 102, 241, 0.05)', border: '1px solid rgba(99, 102, 241, 0.25)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <span style={{ fontSize: '0.9375rem', fontWeight: 800, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Building2 size={16} className="text-indigo-400" />
                  <span>Found in Catalog from other Companies ({catalogSearchResults.length} items):</span>
                </span>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  Click "+ Track" on any product to add it to your live tracking dashboard
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {catalogSearchResults.slice(0, 6).map((item) => (
                <div 
                  key={item.productId}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', borderRadius: '10px', backgroundColor: 'var(--surface-elevated)', border: '1px solid var(--border-default)', gap: '0.75rem' }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '2px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-brand)', textTransform: 'uppercase' }}>
                        {item.brand}
                      </span>
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>• #{item.productId}</span>
                    </div>
                    <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#ffffff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {item.name}
                    </div>
                  </div>

                  <button
                    className="btn btn-primary btn-sm"
                    disabled={trackingId === item.productId}
                    onClick={() => handleTrackFromSearch(item)}
                  >
                    {trackingId === item.productId ? <Spinner size={12} /> : <Plus size={12} />}
                    Track
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Error Notification */}
        {error && (
          <Card className="border-rose-500/30 bg-rose-500/10 text-rose-300 p-4">
            <div className="flex items-center gap-2">
              <AlertOctagon size={18} />
              <span>{error}</span>
            </div>
          </Card>
        )}

        {/* Tracked Content View */}
        {isLoading && products.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Spinner size={32} className="text-indigo-400" />
            <span className="text-sm text-[var(--text-muted)]">Loading tracked items...</span>
          </div>
        ) : products.length === 0 ? (
          <EmptyState 
            icon={<LayoutDashboard size={44} />}
            title="No products under surveillance"
            description="Start tracking products to monitor price reveal interactions and inventory updates."
            action={
              <Link to="/" className="btn btn-primary">
                Search Catalog to Track
              </Link>
            }
          />
        ) : filteredProducts.length === 0 && catalogSearchResults.length === 0 ? (
          <div className="text-center py-12 p-6 rounded-xl border border-[var(--border-default)] bg-[var(--surface-card)]">
            <p className="text-white font-medium mb-1">No matching products found</p>
            <p className="text-xs text-[var(--text-muted)]">Try adjusting your search query or filter pills.</p>
          </div>
        ) : viewMode === 'grid' ? (
          /* GRID VIEW */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredProducts.map(product => {
              const canonicalId = product.product_id || product.productId || product.id;
              const isAvailable = product.current_stock_status === 'IN_STOCK';
              const isSoldOut = product.current_stock_status === 'OUT_OF_STOCK';
              const isScrapingThis = scrapingId === canonicalId;

              return (
                <Card 
                  key={canonicalId}
                  interactive
                  className="flex flex-col justify-between border-[var(--border-default)] hover:border-indigo-500/40 group"
                  style={{ padding: '1.5rem', minHeight: '235px' }}
                  onClick={() => navigate(`/product/${canonicalId}`)}
                >
                  <div>
                    {/* Top Row: Icon + Meta */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.875rem', marginBottom: '1rem' }}>
                      <div style={{ width: '48px', height: '48px', borderRadius: '10px', backgroundColor: 'var(--surface-elevated)', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {getCategoryIcon(product.category)}
                      </div>

                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-brand)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            {product.brand}
                          </span>
                          <span style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                            #{canonicalId}
                          </span>
                        </div>
                        <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: '#ffffff', margin: 0, lineHeight: 1.35 }} title={product.name}>
                          {product.name}
                        </h3>
                      </div>
                    </div>

                    {/* Availability Strip */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 0', borderTop: '1px solid var(--border-subtle)', borderBottom: '1px solid var(--border-subtle)', marginBottom: '1.25rem' }}>
                      <div>
                        {isAvailable ? (
                          <Badge variant="success" hasDot>
                            Available {product.current_stock_count !== null ? `(${product.current_stock_count} units)` : ''}
                          </Badge>
                        ) : isSoldOut ? (
                          <Badge variant="failure" hasDot>Sold Out</Badge>
                        ) : (
                          <Badge variant="neutral">Pending Verification</Badge>
                        )}
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block' }}>Last Checked</span>
                        <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                          {formatDate(product.last_scraped_at)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Bottom Row: Price & Aligned Buttons with Breathing Room */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', paddingTop: '0.25rem' }}>
                    <div>
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', fontFamily: 'monospace', display: 'block' }}>
                        Revealed Price
                      </span>
                      <span style={{ fontSize: '1.35rem', fontWeight: 800, color: '#ffffff', lineHeight: 1.1 }}>
                        {formatPrice(product.current_price)}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <button
                        className="btn btn-secondary btn-sm"
                        disabled={isScrapingThis}
                        onClick={(e) => handleScrapeNow(canonicalId, e)}
                        title="Run Playwright reveal scraper"
                      >
                        {isScrapingThis ? (
                          <>
                            <Spinner size={13} />
                            <span>Scraping...</span>
                          </>
                        ) : (
                          <>
                            <Activity size={13} className="text-indigo-400" />
                            <span>Scrape</span>
                          </>
                        )}
                      </button>

                      <Link 
                        to={`/product/${canonicalId}`}
                        onClick={(e) => e.stopPropagation()}
                        className="btn btn-secondary btn-sm"
                      >
                        Details <ArrowUpRight size={13} />
                      </Link>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        ) : (
          /* TABLE VIEW */
          <div className="data-table-container">
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Brand & Category</th>
                    <th>Revealed Price</th>
                    <th>Availability</th>
                    <th>Last Checked</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map(product => {
                    const canonicalId = product.product_id || product.productId || product.id;
                    const isAvailable = product.current_stock_status === 'IN_STOCK';
                    const isSoldOut = product.current_stock_status === 'OUT_OF_STOCK';
                    const isScrapingThis = scrapingId === canonicalId;

                    return (
                      <tr key={canonicalId}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div style={{ width: '36px', height: '36px', borderRadius: '8px', backgroundColor: 'var(--surface-elevated)', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              {getCategoryIcon(product.category)}
                            </div>
                            <div className="min-w-0 max-w-xs">
                              <Link 
                                to={`/product/${canonicalId}`}
                                className="font-semibold text-white hover:text-indigo-300 transition-colors line-clamp-1 block text-sm"
                              >
                                {product.name}
                              </Link>
                              <span className="text-xs text-[var(--text-muted)] font-mono">
                                ID: #{canonicalId} • SKU: {product.sku || 'N/A'}
                              </span>
                            </div>
                          </div>
                        </td>

                        <td>
                          <div className="text-xs font-semibold text-white">{product.brand}</div>
                          <div className="text-xs text-[var(--text-muted)]">{product.category}</div>
                        </td>

                        <td>
                          <span className="text-sm font-extrabold text-white">
                            {formatPrice(product.current_price)}
                          </span>
                        </td>

                        <td>
                          {isAvailable ? (
                            <Badge variant="success" hasDot>
                              Available {product.current_stock_count !== null ? `(${product.current_stock_count})` : ''}
                            </Badge>
                          ) : isSoldOut ? (
                            <Badge variant="failure" hasDot>Sold Out</Badge>
                          ) : (
                            <Badge variant="neutral">Pending</Badge>
                          )}
                        </td>

                        <td className="text-xs text-[var(--text-secondary)] font-mono">
                          {formatDate(product.last_scraped_at)}
                        </td>

                        <td className="text-right">
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.5rem' }}>
                            <button
                              className="btn btn-secondary btn-sm"
                              disabled={isScrapingThis}
                              onClick={() => handleScrapeNow(canonicalId)}
                            >
                              {isScrapingThis ? (
                                <>
                                  <Spinner size={13} />
                                  <span>Scraping...</span>
                                </>
                              ) : (
                                <>
                                  <Activity size={13} className="text-indigo-400" />
                                  <span>Scrape</span>
                                </>
                              )}
                            </button>

                            <Link to={`/product/${canonicalId}`} className="btn btn-secondary btn-sm">
                              Details <ArrowUpRight size={13} />
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </Container>
    </div>
  );
};
