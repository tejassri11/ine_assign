import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
  Search, ChevronRight, Activity, Check, Plus, Sparkles, 
  Laptop, BatteryCharging, Headphones, Watch, Monitor, 
  ShoppingBag, Building2, X, ArrowUpRight, Tag
} from 'lucide-react';
import { Container, Card, Button, Spinner, Badge } from '../components/UI';
import * as api from '../api';
import { useDebounce } from '../hooks/useDebounce';

// Assign dynamic icons to categories
const getCategoryIcon = (categoryName) => {
  const cat = (categoryName || '').toLowerCase();
  if (cat.includes('laptop') || cat.includes('computer')) return <Laptop size={15} />;
  if (cat.includes('power') || cat.includes('charg') || cat.includes('battery')) return <BatteryCharging size={15} />;
  if (cat.includes('audio') || cat.includes('sound') || cat.includes('headphone')) return <Headphones size={15} />;
  if (cat.includes('wear') || cat.includes('watch')) return <Watch size={15} />;
  if (cat.includes('display') || cat.includes('monitor')) return <Monitor size={15} />;
  return <ShoppingBag size={15} />;
};

export const HomePage = () => {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  
  const [allCatalog, setAllCatalog] = useState([]);
  const [selectedBrand, setSelectedBrand] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [recentlyTracked, setRecentlyTracked] = useState([]);
  const [isLoadingHome, setIsLoadingHome] = useState(true);
  
  const [trackingIds, setTrackingIds] = useState(new Set());
  const [isTracking, setIsTracking] = useState({});

  const debouncedQuery = useDebounce(query, 350);

  // Fetch all 643 catalog products from catalog.json via backend and real tracked products
  const loadHomeData = async () => {
    setIsLoadingHome(true);
    try {
      // 1. Fetch tracked products
      const trackedRes = await api.getTrackedProducts(true).catch(() => ({ products: [] }));
      const tracked = trackedRes.products || [];
      setRecentlyTracked(tracked);

      // Map tracked by product_id (from catalog.json)
      const tIds = new Set(tracked.map(p => p.product_id || p.productId || p.id));
      setTrackingIds(tIds);

      // 2. Fetch all pages of catalog.json (pageSize is capped at 200 per backend endpoint, so 4 pages cover all 643 products)
      const [p1, p2, p3, p4] = await Promise.all([
        api.getCatalog(1, 200).catch(() => ({ products: [] })),
        api.getCatalog(2, 200).catch(() => ({ products: [] })),
        api.getCatalog(3, 200).catch(() => ({ products: [] })),
        api.getCatalog(4, 200).catch(() => ({ products: [] }))
      ]);

      const mergedCatalog = [
        ...(p1.products || []),
        ...(p2.products || []),
        ...(p3.products || []),
        ...(p4.products || [])
      ];

      setAllCatalog(mergedCatalog);
    } catch (err) {
      console.error('Failed to load home data:', err);
    } finally {
      setIsLoadingHome(false);
    }
  };

  useEffect(() => {
    loadHomeData();
  }, []);

  // Derive unique brands/companies and categories from real catalog.json
  const brands = useMemo(() => {
    const list = [...new Set(allCatalog.map(p => p.brand))].filter(Boolean);
    return list.sort();
  }, [allCatalog]);

  const categories = useMemo(() => {
    const list = [...new Set(allCatalog.map(p => p.category))].filter(Boolean);
    return list.sort();
  }, [allCatalog]);

  // Live search using backend /api/products/search?q=
  useEffect(() => {
    const fetchSearchResults = async () => {
      if (!debouncedQuery.trim()) {
        setSearchResults([]);
        return;
      }
      setIsSearching(true);
      try {
        const data = await api.searchProducts(debouncedQuery);
        setSearchResults(data.results || []);
      } catch (err) {
        console.error('Search error:', err);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    };

    fetchSearchResults();
  }, [debouncedQuery]);

  // Track product using catalog productId
  const handleTrack = async (product, e) => {
    if (e) e.stopPropagation();
    const pId = product.productId || product.product_id;
    if (!pId) return;

    setIsTracking(prev => ({ ...prev, [pId]: true }));
    try {
      await api.trackProduct(pId);
      setTrackingIds(prev => new Set([...prev, pId]));
      
      // Update recently tracked list
      setRecentlyTracked(prev => {
        if (prev.find(p => (p.product_id || p.productId) === pId)) return prev;
        return [
          {
            ...product,
            product_id: pId,
            current_price: null,
            current_stock_status: 'UNKNOWN',
            last_scraped_at: null
          },
          ...prev
        ];
      });
    } catch (err) {
      if (err.code === 'DUPLICATE_TRACKING') {
        setTrackingIds(prev => new Set([...prev, pId]));
      } else {
        alert(err.message || 'Failed to track product.');
      }
    } finally {
      setIsTracking(prev => ({ ...prev, [pId]: false }));
    }
  };

  // Filter catalog products by selected brand and category
  const filteredCatalog = useMemo(() => {
    let result = allCatalog;
    if (selectedBrand) {
      result = result.filter(p => p.brand === selectedBrand);
    }
    if (selectedCategory) {
      result = result.filter(p => p.category === selectedCategory);
    }
    return result;
  }, [allCatalog, selectedBrand, selectedCategory]);

  const formatPrice = (price) => {
    if (price === null || price === undefined) return '—';
    return new Intl.NumberFormat('en-IN', { 
      style: 'currency', 
      currency: 'INR', 
      maximumFractionDigits: 0 
    }).format(price);
  };

  return (
    <div className="flex flex-col w-full pb-24">
      {/* Hero Section */}
      <section className="relative w-full overflow-hidden pt-16 pb-20 px-6 border-b border-[var(--border-subtle)]">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-indigo-500/10 blur-[120px] rounded-full pointer-events-none" />

        <Container className="max-w-4xl mx-auto flex flex-col items-center text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.08] backdrop-blur-md shadow-sm mb-6">
            <span className="pulse-dot pulse-dot-brand" />
            <span className="text-xs font-semibold text-slate-300 tracking-wide uppercase">
              Autonomous Price & Inventory Surveillance
            </span>
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold text-white tracking-tight mb-5 leading-[1.1]">
            Track Prices. <span className="text-gradient-brand">Buy Smarter.</span>
          </h1>

          <p className="text-base sm:text-lg text-[var(--text-secondary)] max-w-2xl mx-auto mb-10 leading-relaxed font-normal">
            Automated Playwright price reveal and inventory change surveillance. Real-time catalog monitoring across all brands and categories.
          </p>

          {/* Search Command Input */}
          <div className="w-full max-w-2xl relative">
            <div className="relative flex items-center">
              <div className="absolute left-4.5 pointer-events-none text-[var(--text-muted)] flex items-center">
                <Search size={20} className={isSearching ? 'text-indigo-400' : ''} />
              </div>

              <input
                type="text"
                className="w-full pl-12 pr-12 py-4 bg-[var(--surface-card)] border border-[var(--border-strong)] rounded-2xl text-white placeholder-[var(--text-muted)] focus:outline-none focus:border-indigo-500/80 focus:ring-4 focus:ring-indigo-500/15 transition-all text-base shadow-2xl backdrop-blur-xl"
                placeholder="Search by product name, brand, or SKU..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />

              {query.trim() && (
                <button 
                  onClick={() => setQuery('')}
                  className="absolute right-4 text-[var(--text-muted)] hover:text-white p-1 rounded-full hover:bg-white/10 transition-colors"
                  title="Clear search"
                >
                  <X size={18} />
                </button>
              )}

              {isSearching && (
                <div className="absolute right-11 flex items-center">
                  <Spinner size={18} className="text-indigo-400" />
                </div>
              )}
            </div>

            {/* Quick Keyword Suggestions */}
            {!query.trim() && brands.length > 0 && (
              <div className="flex items-center justify-center gap-1.5 mt-4 flex-wrap text-xs text-[var(--text-muted)]">
                <span>Popular Brands:</span>
                {brands.slice(0, 6).map((b) => (
                  <button
                    key={b}
                    onClick={() => {
                      setSelectedBrand(b === selectedBrand ? null : b);
                      setSelectedCategory(null);
                    }}
                    className={`px-2.5 py-1 rounded-md border text-xs transition-all cursor-pointer ${
                      selectedBrand === b 
                        ? 'bg-indigo-600/20 border-indigo-500/50 text-white'
                        : 'bg-white/[0.04] border-white/[0.06] hover:border-white/20 text-slate-300 hover:text-white'
                    }`}
                  >
                    {b}
                  </button>
                ))}
              </div>
            )}

            {/* Search Results Dropdown */}
            {query.trim() && (
              <div className="absolute top-full left-0 right-0 mt-3 bg-[rgba(16,16,22,0.98)] border border-[var(--border-strong)] rounded-2xl shadow-2xl overflow-hidden z-30 backdrop-blur-2xl text-left max-h-[460px] overflow-y-auto">
                <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between text-xs text-[var(--text-muted)]">
                  <span>
                    {isSearching ? 'Searching...' : `Found ${searchResults.length} product${searchResults.length === 1 ? '' : 's'}`}
                  </span>
                  <span className="font-mono text-[10px] uppercase">Real-time Search</span>
                </div>

                {isSearching && searchResults.length === 0 ? (
                  <div className="p-10 text-center text-[var(--text-muted)] flex flex-col items-center gap-3">
                    <Spinner size={24} className="text-indigo-400" />
                    <span className="text-sm">Searching catalog...</span>
                  </div>
                ) : searchResults.length === 0 ? (
                  <div className="p-10 text-center">
                    <p className="text-white font-medium mb-1">No products found</p>
                    <p className="text-xs text-[var(--text-muted)]">
                      No matches for "{query}". Try checking SKU, brand, or category.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-[var(--border-subtle)]">
                    {searchResults.map((product) => {
                      const canonicalId = product.productId || product.product_id;
                      const isAlreadyTracked = trackingIds.has(canonicalId);
                      return (
                        <div 
                          key={canonicalId}
                          onClick={() => isAlreadyTracked ? navigate(`/product/${canonicalId}`) : null}
                          className={`flex items-center justify-between p-4 hover:bg-white/[0.04] transition-all group ${
                            isAlreadyTracked ? 'cursor-pointer' : ''
                          }`}
                        >
                          <div className="flex items-center gap-3.5 min-w-0 pr-4">
                            <div className="w-11 h-11 rounded-xl bg-[var(--surface-elevated)] border border-[var(--border-subtle)] overflow-hidden flex-shrink-0 flex items-center justify-center">
                              {getCategoryIcon(product.category)}
                            </div>

                            <div className="min-w-0">
                              <h4 className="text-sm font-semibold text-white truncate group-hover:text-indigo-300 transition-colors">
                                {product.name}
                              </h4>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-xs text-indigo-400 font-medium">
                                  {product.brand}
                                </span>
                                <span className="text-[var(--border-strong)]">•</span>
                                <span className="text-[11px] px-2 py-0.5 rounded bg-white/[0.05] text-[var(--text-secondary)]">
                                  {product.category}
                                </span>
                                <span className="text-[var(--border-strong)]">•</span>
                                <span className="text-[11px] font-mono text-[var(--text-muted)]">
                                  ID: {canonicalId}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 flex-shrink-0">
                            {isAlreadyTracked ? (
                              <Link 
                                to={`/product/${canonicalId}`}
                                className="btn btn-secondary btn-sm"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Check size={13} className="text-emerald-400" />
                                Tracked
                              </Link>
                            ) : (
                              <button 
                                className="btn btn-primary btn-sm"
                                disabled={isTracking[canonicalId]}
                                onClick={(e) => handleTrack(product, e)}
                              >
                                {isTracking[canonicalId] ? <Spinner size={13} /> : <Plus size={13} />}
                                Track
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </Container>
      </section>

      {/* Main Catalog Exploration Container */}
      <Container className="pt-12 max-w-6xl mx-auto flex flex-col gap-14">
        
        {/* Brands & Companies Section */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                <Building2 size={20} className="text-indigo-400" />
                <span>Companies & Brands</span>
              </h2>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                All 14 manufacturers and organizations available in the INE catalog
              </p>
            </div>
            {selectedBrand && (
              <button 
                onClick={() => setSelectedBrand(null)}
                className="text-xs text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
              >
                Clear Brand Filter
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {brands.map((b) => {
              const isSelected = selectedBrand === b;
              return (
                <button
                  key={b}
                  onClick={() => setSelectedBrand(isSelected ? null : b)}
                  className={`px-3.5 py-2 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                    isSelected 
                      ? 'bg-indigo-600/25 border-indigo-500 text-white shadow-lg shadow-indigo-500/20'
                      : 'bg-[var(--surface-card)] border-[var(--border-default)] hover:border-[var(--border-strong)] text-slate-300 hover:text-white'
                  }`}
                >
                  {b}
                </button>
              );
            })}
          </div>
        </div>

        {/* Categories Section */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                <Tag size={20} className="text-indigo-400" />
                <span>Product Categories</span>
              </h2>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                Browse by hardware domain and equipment type
              </p>
            </div>
            {selectedCategory && (
              <button 
                onClick={() => setSelectedCategory(null)}
                className="text-xs text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
              >
                Clear Category Filter
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {categories.map((category) => {
              const isSelected = selectedCategory === category;
              return (
                <button
                  key={category}
                  onClick={() => setSelectedCategory(isSelected ? null : category)}
                  className={`flex items-center justify-between p-3 rounded-xl border transition-all text-left cursor-pointer ${
                    isSelected 
                      ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-md' 
                      : 'bg-[var(--surface-card)] border-[var(--border-default)] hover:border-[var(--border-strong)] text-slate-300 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0 pr-1">
                    <div className={`p-1.5 rounded-lg ${isSelected ? 'bg-indigo-500/30 text-indigo-300' : 'bg-white/[0.04] text-[var(--text-muted)]'}`}>
                      {getCategoryIcon(category)}
                    </div>
                    <span className="text-xs font-semibold truncate">{category}</span>
                  </div>
                  <ChevronRight size={14} className={`flex-shrink-0 ${isSelected ? 'text-indigo-400' : 'text-[var(--text-muted)]'}`} />
                </button>
              );
            })}
          </div>
        </div>

        {/* Catalog Items Showcase Grid */}
        <div>
          <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">
                {selectedBrand && selectedCategory ? (
                  `${selectedBrand} ${selectedCategory}`
                ) : selectedBrand ? (
                  `${selectedBrand} Products`
                ) : selectedCategory ? (
                  `${selectedCategory}`
                ) : (
                  'All Catalog Products'
                )}
              </h2>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                Official products from catalog.json ready for scheduled price and inventory surveillance
              </p>
            </div>
            
            <div className="flex items-center gap-3 text-xs text-[var(--text-muted)]">
              {(selectedBrand || selectedCategory) && (
                <button 
                  onClick={() => { setSelectedBrand(null); setSelectedCategory(null); }}
                  className="text-indigo-400 hover:text-indigo-300 font-medium"
                >
                  Reset all filters
                </button>
              )}
              <span className="font-mono">{filteredCatalog.length} products found</span>
            </div>
          </div>

          {isLoadingHome ? (
            <div className="flex justify-center py-12">
              <Spinner size={32} className="text-indigo-400" />
            </div>
          ) : filteredCatalog.length === 0 ? (
            <div className="p-8 text-center text-[var(--text-muted)] rounded-xl border border-[var(--border-default)]">
              No products match the selected filters. Try clearing brand or category.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {filteredCatalog.slice(0, 16).map((product) => {
                const canonicalId = product.productId || product.product_id;
                const isAlreadyTracked = trackingIds.has(canonicalId);

                return (
                  <Card 
                    key={canonicalId}
                    interactive
                    className="flex flex-col justify-between p-4 border-[var(--border-default)] hover:border-indigo-500/40 group"
                    onClick={() => {
                      if (isAlreadyTracked) navigate(`/product/${canonicalId}`);
                    }}
                  >
                    <div>
                      {/* Thumbnail with fallback icon */}
                      <div className="w-full aspect-[4/3] rounded-lg bg-[var(--surface-elevated)] border border-[var(--border-subtle)] overflow-hidden mb-3 relative flex items-center justify-center">
                        {getCategoryIcon(product.category)}
                        
                        <div className="absolute top-2 left-2">
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-black/60 backdrop-blur-md text-slate-300 border border-white/10">
                            {product.category}
                          </span>
                        </div>
                        <div className="absolute top-2 right-2">
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/10 text-slate-400">
                            #{canonicalId}
                          </span>
                        </div>
                      </div>

                      <div className="text-xs text-indigo-400 font-semibold mb-1 uppercase tracking-wider">
                        {product.brand}
                      </div>
                      <h3 className="text-sm font-bold text-white line-clamp-2 mb-2 group-hover:text-indigo-300 transition-colors" title={product.name}>
                        {product.name}
                      </h3>
                    </div>

                    {/* Bottom Action Row with aligned buttons */}
                    <div className="pt-3 border-t border-[var(--border-subtle)] flex items-center justify-between mt-2">
                      <span className="text-xs text-[var(--text-muted)] font-mono">
                        {product.sku || 'SKU: N/A'}
                      </span>
                      
                      {isAlreadyTracked ? (
                        <Link 
                          to={`/product/${canonicalId}`}
                          onClick={(e) => e.stopPropagation()}
                          className="btn btn-secondary btn-sm"
                        >
                          Trends <ArrowUpRight size={13} />
                        </Link>
                      ) : (
                        <button 
                          className="btn btn-primary btn-sm"
                          disabled={isTracking[canonicalId]}
                          onClick={(e) => handleTrack(product, e)}
                        >
                          {isTracking[canonicalId] ? <Spinner size={13} /> : <Plus size={13} />}
                          Track
                        </button>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {/* Active Tracked Surveillance Section */}
        <div>
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                <span>Active Tracked Surveillance</span>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              </h2>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                Items scheduled for automated Playwright price reveal runs
              </p>
            </div>

            <Link 
              to="/dashboard" 
              className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors"
            >
              Open Full Dashboard <ChevronRight size={14} />
            </Link>
          </div>

          {isLoadingHome ? (
            <div className="flex justify-center py-6">
              <Spinner size={24} className="text-[var(--text-muted)]" />
            </div>
          ) : recentlyTracked.length === 0 ? (
            <Card className="text-center py-10 border-dashed">
              <Activity size={32} className="mx-auto text-[var(--text-muted)] mb-2" />
              <p className="text-white font-bold mb-1">No products tracked yet</p>
              <p className="text-xs text-[var(--text-secondary)] max-w-sm mx-auto">
                Search or click "+ Track" on any product from the catalog above to start automated monitoring.
              </p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {recentlyTracked.slice(0, 4).map((product) => {
                const canonicalId = product.product_id || product.productId || product.id;
                const isAvailable = product.current_stock_status === 'IN_STOCK';
                const isUnavailable = product.current_stock_status === 'OUT_OF_STOCK';

                return (
                  <Link key={canonicalId} to={`/product/${canonicalId}`} className="block group">
                    <Card interactive className="h-full flex flex-col justify-between p-4 border-[var(--border-default)] hover:border-indigo-500/40">
                      <div>
                        <div className="flex items-start gap-3 mb-3">
                          <div className="w-10 h-10 rounded-lg bg-[var(--surface-elevated)] border border-[var(--border-subtle)] overflow-hidden flex-shrink-0 flex items-center justify-center">
                            {getCategoryIcon(product.category)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <span className="text-[10px] text-indigo-400 uppercase tracking-wider block font-semibold">
                              {product.brand}
                            </span>
                            <h4 className="text-xs font-bold text-white truncate group-hover:text-indigo-300 transition-colors" title={product.name}>
                              {product.name}
                            </h4>
                          </div>
                        </div>
                      </div>

                      <div className="pt-3 border-t border-[var(--border-subtle)] flex items-center justify-between">
                        <div>
                          <span className="text-[10px] text-[var(--text-muted)] block uppercase font-mono">Revealed Price</span>
                          <span className="text-base font-extrabold text-white">
                            {formatPrice(product.current_price)}
                          </span>
                        </div>

                        <div>
                          {isAvailable ? (
                            <Badge variant="success" hasDot>Available</Badge>
                          ) : isUnavailable ? (
                            <Badge variant="failure" hasDot>Sold Out</Badge>
                          ) : (
                            <Badge variant="neutral">Pending</Badge>
                          )}
                        </div>
                      </div>
                    </Card>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

      </Container>
    </div>
  );
};
