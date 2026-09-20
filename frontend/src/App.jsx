import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { HomePage } from './pages/HomePage';
import { DashboardPage } from './pages/DashboardPage';
import { ProductDetailsPage } from './pages/ProductDetailsPage';
import { Container } from './components/UI';
import { Zap, ExternalLink, ShieldCheck } from 'lucide-react';

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen flex flex-col w-full bg-[var(--bg-main)] selection:bg-indigo-500/30 selection:text-white">
        <Navbar />
        <main className="flex-1 flex flex-col">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/product/:id" element={<ProductDetailsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>

        {/* Global Footer */}
        <footer className="border-t border-[var(--border-subtle)] bg-[rgba(9,9,12,0.9)] py-8 mt-auto">
          <Container className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[var(--text-muted)]">
            <div className="flex items-center gap-2">
              <Zap size={14} className="text-indigo-400 fill-indigo-400" />
              <span className="font-bold text-slate-300">SENTINEL INE</span>
              <span>•</span>
              <span>Anti-Bot Playwright Price Surveillance System</span>
            </div>

            <div className="flex items-center gap-6">
              <span className="flex items-center gap-1 text-emerald-400">
                <span className="pulse-dot pulse-dot-success" /> Scraper Engine 100% Reliable
              </span>
              <a 
                href="https://demo.inelabteamdev.com/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="hover:text-white transition-colors flex items-center gap-1"
              >
                INE Mock Store <ExternalLink size={11} />
              </a>
            </div>
          </Container>
        </footer>
      </div>
    </BrowserRouter>
  );
}

export default App;
