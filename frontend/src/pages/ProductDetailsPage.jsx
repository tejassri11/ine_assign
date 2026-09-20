import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { 
  ArrowLeft, Activity, Calendar, AlertTriangle, CheckCircle2, 
  Clock, ExternalLink, ShoppingBag, 
  TrendingDown, TrendingUp, Minus, Terminal, Laptop, 
  BatteryCharging, Headphones, Watch, Monitor, Building2
} from 'lucide-react';
import { 
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip 
} from 'recharts';
import { Container, Card, Button, Badge, Spinner, StatCard } from '../components/UI';
import * as api from '../api';

const getCategoryIcon = (categoryName) => {
  const cat = (categoryName || '').toLowerCase();
  if (cat.includes('laptop') || cat.includes('computer')) return <Laptop size={32} className="text-indigo-400" />;
  if (cat.includes('power') || cat.includes('charg') || cat.includes('battery')) return <BatteryCharging size={32} className="text-amber-400" />;
  if (cat.includes('audio') || cat.includes('sound') || cat.includes('headphone')) return <Headphones size={32} className="text-purple-400" />;
  if (cat.includes('wear') || cat.includes('watch')) return <Watch size={32} className="text-emerald-400" />;
  if (cat.includes('display') || cat.includes('monitor')) return <Monitor size={32} className="text-blue-400" />;
  return <ShoppingBag size={32} className="text-[var(--text-muted)]" />;
};

export const ProductDetailsPage = () => {
  const { id } = useParams(); // id is the official mock store productId (e.g. 572, 735)
  const navigate = useNavigate();
  const [product, setProduct] = useState(null);
  const [history, setHistory] = useState([]);
  const [logs, setLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isScraping, setIsScraping] = useState(false);
  const [scrapeSuccessMsg, setScrapeSuccessMsg] = useState(null);
  const [scrapeErrorMsg, setScrapeErrorMsg] = useState(null);
  const [error, setError] = useState(null);

  const fetchAllData = async () => {
    try {
      const [prodRes, histRes, logsRes] = await Promise.all([
        api.getProductDetails(id).catch(() => ({ product: null })),
        api.getProductHistory(id).catch(() => ({ history: [] })),
        api.getProductLogs(id).catch(() => ({ logs: [] }))
      ]);

      if (prodRes?.product) {
        setProduct(prodRes.product);
      } else {
        // If not found in catalog endpoint, try to find in tracked list
        const trackedData = await api.getTrackedProducts(false).catch(() => ({ products: [] }));
        const matched = (trackedData.products || []).find(p => String(p.product_id || p.productId || p.id) === String(id));
        if (matched) {
          setProduct(matched);
        }
      }

      setHistory(histRes.history || []);
      setLogs(logsRes.logs || []);
    } catch (err) {
      setError(err.message || 'Failed to load product details.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, [id]);

  const handleScrape = async () => {
    setIsScraping(true);
    setScrapeSuccessMsg(null);
    setScrapeErrorMsg(null);
    try {
      const res = await api.scrapeProductNow(id);
      await fetchAllData();
      const dur = res.result?.durationMs || res.duration_ms;
      setScrapeSuccessMsg(`Playwright scrape completed successfully${dur ? ` in ${(dur / 1000).toFixed(1)}s` : ''}! Price revealed & logged.`);
      setTimeout(() => setScrapeSuccessMsg(null), 7000);
    } catch (err) {
      const msg = err.data?.message || err.message || 'Scrape failed or timed out. Please try again.';
      setScrapeErrorMsg(msg);
    } finally {
      setIsScraping(false);
    }
  };

  // Format history for Recharts
  const chartData = useMemo(() => {
    return history
      .filter(h => h.price !== null && h.price !== undefined)
      .map(h => {
        const rawDateStr = h.recorded_at || h.created_at;
        const d = rawDateStr ? new Date(rawDateStr) : new Date();
        const isValidDate = !isNaN(d.getTime());
        return {
          timestamp: isValidDate ? d.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          }) : 'Recorded',
          fullDate: isValidDate ? d.toLocaleString() : 'Date N/A',
          price: Number(h.price),
          unitsCount: h.stock_count,
          availabilityStatus: h.stock_status,
          rawDate: isValidDate ? d.getTime() : 0
        };
      })
      .sort((a, b) => a.rawDate - b.rawDate);
  }, [history]);

  // Derived price trajectory stats
  const priceMetrics = useMemo(() => {
    if (chartData.length === 0) return null;
    const prices = chartData.map(d => d.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const latest = prices[prices.length - 1];
    const initial = prices[0];
    const diff = latest - initial;
    const percentChange = initial > 0 ? ((diff / initial) * 100).toFixed(1) : 0;
    return { min, max, latest, diff, percentChange };
  }, [chartData]);

  const latestHistory = chartData.length > 0 ? chartData[chartData.length - 1] : null;
  const currentLivePrice = product?.current_price ?? latestHistory?.price ?? null;
  const currentAvailability = product?.current_stock_status ?? latestHistory?.availabilityStatus ?? 'UNKNOWN';
  const currentUnits = product?.current_stock_count ?? latestHistory?.unitsCount ?? null;

  const formatPrice = (value) => {
    if (value === null || value === undefined) return '—';
    return new Intl.NumberFormat('en-IN', { 
      style: 'currency', 
      currency: 'INR', 
      maximumFractionDigits: 0 
    }).format(value);
  };

  // Live store canonical URL
  const liveStoreUrl = product?.product_url || product?.productUrl || `https://demo.inelabteamdev.com/product/${id}`;

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const isAvail = data.availabilityStatus === 'IN_STOCK';
      return (
        <div className="bg-[rgba(18,18,24,0.96)] border border-[var(--border-strong)] p-3.5 rounded-xl shadow-2xl backdrop-blur-xl">
          <p className="text-[var(--text-muted)] text-[11px] font-mono mb-1">{data.fullDate}</p>
          <div className="text-lg font-black text-white">{formatPrice(data.price)}</div>
          {data.availabilityStatus && (
            <div className="mt-1.5 flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
              <span className={`w-2 h-2 rounded-full ${isAvail ? 'bg-emerald-400' : 'bg-rose-400'}`} />
              <span className="font-medium">
                {isAvail ? `Available ${data.unitsCount ? `(${data.unitsCount} units)` : ''}` : 'Sold Out'}
              </span>
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  if (isLoading) {
    return (
      <Container className="py-24 flex flex-col items-center justify-center gap-4">
        <Spinner size={36} className="text-indigo-400" />
        <span className="text-sm text-[var(--text-secondary)] font-medium">Loading telemetry & history...</span>
      </Container>
    );
  }

  if (error && !product) {
    return (
      <Container className="py-16 text-center">
        <Card className="max-w-md mx-auto p-8 border-rose-500/30">
          <AlertTriangle size={48} className="mx-auto text-rose-400 mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">Product Not Found</h2>
          <p className="text-sm text-[var(--text-secondary)] mb-6">{error || 'Could not retrieve product record.'}</p>
          <Link to="/dashboard" className="btn btn-primary">
            Back to Dashboard
          </Link>
        </Card>
      </Container>
    );
  }

  const isAvailable = currentAvailability === 'IN_STOCK';
  const isSoldOut = currentAvailability === 'OUT_OF_STOCK';

  return (
    <div className="flex flex-col w-full pb-24">
      {/* Top Breadcrumbs */}
      <section className="border-b border-[var(--border-subtle)] bg-[rgba(15,15,20,0.5)] backdrop-blur-md py-4 px-6">
        <Container className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
            <Link to="/" className="hover:text-white transition-colors">Home</Link>
            <span>/</span>
            <Link to="/dashboard" className="hover:text-white transition-colors">Tracked</Link>
            <span>/</span>
            <span className="text-slate-300 truncate max-w-xs font-medium">{product?.name || `Product #${id}`}</span>
          </div>

          <Link 
            to="/dashboard" 
            className="inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)] hover:text-white transition-colors"
          >
            <ArrowLeft size={14} /> Back to Tracked
          </Link>
        </Container>
      </section>

      <Container className="pt-8 max-w-6xl mx-auto flex flex-col gap-8">
        
        {/* Scrape Success Alert */}
        {scrapeSuccessMsg && (
          <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 text-sm flex items-center justify-between shadow-lg">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 size={18} className="text-emerald-400" />
              <span className="font-medium">{scrapeSuccessMsg}</span>
            </div>
            <button onClick={() => setScrapeSuccessMsg(null)} className="text-xs text-emerald-400/80 hover:text-emerald-300">Dismiss</button>
          </div>
        )}

        {/* Scrape Error Alert */}
        {scrapeErrorMsg && (
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-300 text-sm flex items-center justify-between shadow-lg">
            <div className="flex items-center gap-2.5">
              <AlertTriangle size={18} className="text-rose-400" />
              <span className="font-medium">{scrapeErrorMsg}</span>
            </div>
            <button onClick={() => setScrapeErrorMsg(null)} className="text-xs text-rose-400/80 hover:text-rose-300">Dismiss</button>
          </div>
        )}

        {/* Hero Showcase Card */}
        <Card className="p-6 md:p-8 border-[var(--border-default)]">
          <div style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '2rem' }}>
            
            {/* Left: Thumbnail & Details */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', minWidth: '0', flex: '1 1 380px' }}>
              <div style={{ width: '84px', height: '84px', borderRadius: '16px', backgroundColor: 'var(--surface-elevated)', border: '1px solid var(--border-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 4px 16px rgba(0,0,0,0.4)' }}>
                {product?.image_url ? (
                  <img src={product.image_url} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '15px' }} />
                ) : (
                  getCategoryIcon(product?.category)
                )}
              </div>

              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                  <Badge variant="brand">{product?.category || 'Category'}</Badge>
                  <span className="badge badge-neutral font-semibold text-indigo-400">
                    <Building2 size={12} style={{ marginRight: '4px' }} />
                    {product?.brand || 'Brand'}
                  </span>
                  <span className="badge badge-neutral font-mono text-xs">
                    SKU: {product?.sku || 'N/A'}
                  </span>
                  <span className="badge badge-neutral font-mono text-xs">
                    ID: #{id}
                  </span>
                </div>

                <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#ffffff', margin: '0 0 0.5rem 0', lineHeight: 1.25, letterSpacing: '-0.02em' }}>
                  {product?.name || 'Product Details'}
                </h1>

                <div>
                  {isAvailable ? (
                    <Badge variant="success" hasDot>
                      Available {currentUnits !== null ? `(${currentUnits} units)` : ''}
                    </Badge>
                  ) : isSoldOut ? (
                    <Badge variant="failure" hasDot>Sold Out</Badge>
                  ) : (
                    <Badge variant="neutral">Pending Verification</Badge>
                  )}
                </div>
              </div>
            </div>

            {/* Right: Price & Buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.75rem', flexShrink: 0 }}>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: 'monospace', display: 'block', marginBottom: '2px' }}>
                  Current Revealed Price
                </span>
                <div style={{ fontSize: '2.25rem', fontWeight: 900, color: '#ffffff', letterSpacing: '-0.03em', lineHeight: 1 }}>
                  {formatPrice(currentLivePrice)}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                <button
                  className="btn btn-primary"
                  disabled={isScraping}
                  onClick={handleScrape}
                >
                  {isScraping ? (
                    <>
                      <Spinner size={15} />
                      <span>Bypassing & Scraping...</span>
                    </>
                  ) : (
                    <>
                      <Activity size={15} className="text-indigo-600" />
                      <span>Trigger Playwright Scrape</span>
                    </>
                  )}
                </button>

                <a 
                  href={liveStoreUrl}
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="btn btn-secondary"
                  title={`Open ${liveStoreUrl} in new tab`}
                >
                  <span>Live Store</span>
                  <ExternalLink size={13} />
                </a>
              </div>
            </div>

          </div>
        </Card>

        {/* Statistical KPI Grid (No stock wording) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard 
            title="Current Price"
            value={formatPrice(currentLivePrice)}
            subtitle="Verified by anti-bot reveal"
            icon={<Activity size={16} />}
          />
          <StatCard 
            title="Lowest Recorded"
            value={priceMetrics ? formatPrice(priceMetrics.min) : '—'}
            subtitle="Historical lowest price"
            icon={<TrendingDown size={16} className="text-emerald-400" />}
          />
          <StatCard 
            title="Highest Recorded"
            value={priceMetrics ? formatPrice(priceMetrics.max) : '—'}
            subtitle="Peak recorded price"
            icon={<TrendingUp size={16} className="text-rose-400" />}
          />
          <StatCard 
            title="Recorded Snapshots"
            value={history.length}
            subtitle="Historical price reveals"
            icon={<Calendar size={16} />}
          />
        </div>

        {/* Price History Chart */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
            <div>
              <h3 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                <Activity size={18} className="text-indigo-400" />
                <span>Price Trend Curve</span>
              </h3>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                Dynamic curve rendered from verified historical anti-bot reveal runs
              </p>
            </div>

            {priceMetrics && (
              <div className="flex items-center gap-2 text-xs font-medium">
                <span className="text-[var(--text-muted)]">Net Trajectory:</span>
                {priceMetrics.diff < 0 ? (
                  <span className="text-emerald-400 flex items-center gap-1 font-semibold">
                    <TrendingDown size={14} /> {priceMetrics.percentChange}%
                  </span>
                ) : priceMetrics.diff > 0 ? (
                  <span className="text-rose-400 flex items-center gap-1 font-semibold">
                    <TrendingUp size={14} /> +{priceMetrics.percentChange}%
                  </span>
                ) : (
                  <span className="text-slate-400 flex items-center gap-1">
                    <Minus size={14} /> Stable
                  </span>
                )}
              </div>
            )}
          </div>

          {chartData.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-[var(--text-muted)] border border-dashed border-[var(--border-default)] rounded-xl">
              <Activity size={32} className="mb-2 opacity-50" />
              <p className="text-sm font-medium text-white mb-1">No price history points recorded</p>
              <p className="text-xs text-[var(--text-secondary)]">Click "Trigger Playwright Scrape" above to capture the first snapshot.</p>
            </div>
          ) : (
            <div className="h-80 w-full pt-4">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.35}/>
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                  <XAxis 
                    dataKey="timestamp" 
                    tick={{ fill: '#71717a', fontSize: 11 }}
                    tickLine={false}
                    axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
                    minTickGap={24}
                  />
                  <YAxis 
                    tickFormatter={(val) => `₹${Number(val).toLocaleString('en-IN')}`}
                    tick={{ fill: '#71717a', fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    domain={['auto', 'auto']}
                    width={80}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Area 
                    type="monotone" 
                    dataKey="price" 
                    stroke="#818cf8" 
                    strokeWidth={2.5}
                    fillOpacity={1} 
                    fill="url(#priceGradient)"
                    dot={{ fill: '#09090c', stroke: '#818cf8', strokeWidth: 2, r: 4 }}
                    activeDot={{ r: 6, fill: '#818cf8', stroke: '#ffffff', strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        {/* Dual Split: Availability Records & Observability Scrape Logs */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* Availability History Timeline */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                  <Calendar size={16} className="text-indigo-400" />
                  <span>Availability & Price Records</span>
                </h3>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                  Historical availability records logged per scrape cycle
                </p>
              </div>
              <span className="text-xs text-[var(--text-muted)] font-mono">{history.length} records</span>
            </div>

            {history.length === 0 ? (
              <div className="text-center py-10 text-xs text-[var(--text-muted)] border border-dashed border-[var(--border-default)] rounded-xl">
                No availability snapshots logged yet.
              </div>
            ) : (
              <div className="overflow-x-auto max-h-[380px] overflow-y-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Timestamp</th>
                      <th>Price</th>
                      <th>Availability</th>
                      <th>Units</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((item, idx) => {
                      const rawD = item.recorded_at || item.created_at;
                      const dateObj = rawD ? new Date(rawD) : null;
                      const formattedDate = dateObj && !isNaN(dateObj.getTime()) ? dateObj.toLocaleString() : 'Recent';
                      const isAvail = item.stock_status === 'IN_STOCK';

                      return (
                        <tr key={item.id || idx}>
                          <td className="text-xs text-[var(--text-secondary)] font-mono">
                            {formattedDate}
                          </td>
                          <td className="text-xs font-bold text-white">
                            {formatPrice(item.price)}
                          </td>
                          <td>
                            {isAvail ? (
                              <Badge variant="success" hasDot>Available</Badge>
                            ) : (
                              <Badge variant="failure" hasDot>Sold Out</Badge>
                            )}
                          </td>
                          <td className="text-xs font-mono text-white">
                            {item.stock_count !== null ? item.stock_count : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Observability Scrape Logs */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                  <Terminal size={16} className="text-indigo-400" />
                  <span>Scraper Execution Audit Trail</span>
                </h3>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                  Anti-bot reveal telemetry, duration, and error trace
                </p>
              </div>
              <span className="text-xs text-[var(--text-muted)] font-mono">{logs.length} runs</span>
            </div>

            {logs.length === 0 ? (
              <div className="text-center py-10 text-xs text-[var(--text-muted)] border border-dashed border-[var(--border-default)] rounded-xl">
                No execution logs recorded yet.
              </div>
            ) : (
              <div className="flex flex-col gap-3 max-h-[380px] overflow-y-auto pr-1">
                {logs.map((log, idx) => {
                  const logD = log.created_at ? new Date(log.created_at) : null;
                  const logTimeStr = logD && !isNaN(logD.getTime()) ? logD.toLocaleTimeString() : 'Recent';

                  return (
                    <div 
                      key={log.id || idx}
                      className="p-3.5 rounded-xl bg-[var(--surface-elevated)] border border-[var(--border-subtle)] text-xs flex flex-col gap-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {log.status === 'SUCCESS' ? (
                            <Badge variant="success">SUCCESS</Badge>
                          ) : log.status === 'RETRIED' ? (
                            <Badge variant="warning">RETRIED</Badge>
                          ) : (
                            <Badge variant="failure">FAILED</Badge>
                          )}
                          <span className="font-mono text-[var(--text-secondary)] text-[11px]">
                            Attempt #{log.attempt_number || log.attempt || 1}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)] font-mono">
                          <Clock size={12} />
                          <span>{log.duration_ms}ms</span>
                          <span>•</span>
                          <span>{logTimeStr}</span>
                        </div>
                      </div>

                      {log.error_message && (
                        <div className="mt-1 p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 font-mono text-[11px] whitespace-pre-wrap break-all">
                          {log.error_message}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

        </div>

      </Container>
    </div>
  );
};
