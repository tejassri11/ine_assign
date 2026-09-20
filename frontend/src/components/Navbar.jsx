import React from 'react';
import { NavLink, Link } from 'react-router-dom';
import { Container } from './UI';
import { ShieldCheck, Compass, LayoutDashboard, ExternalLink, Zap } from 'lucide-react';

export const Navbar = () => {
  return (
    <nav className="border-b border-[var(--border-default)] bg-[rgba(9,9,12,0.85)] backdrop-blur-xl sticky top-0 z-50 transition-all">
      <Container className="flex items-center justify-between h-16">
        {/* Brand */}
        <Link to="/" className="flex items-center gap-3 group">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 group-hover:border-indigo-500/60 group-hover:scale-105 transition-all shadow-[0_0_15px_rgba(99,102,241,0.2)]">
            <Zap size={18} className="text-white fill-indigo-400" />
          </div>
          <div className="flex flex-col">
            <span className="font-extrabold text-base tracking-tight text-white flex items-center gap-1.5">
              SENTINEL <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-white/10 text-slate-300 font-mono">INE</span>
            </span>
          </div>
        </Link>
        
        {/* Navigation items */}
        <div className="flex items-center gap-1 sm:gap-2">
          <NavLink 
            to="/" 
            end
            className={({ isActive }) => 
              `flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold transition-all ${
                isActive 
                  ? 'bg-white/10 text-white shadow-sm border border-white/10' 
                  : 'text-[var(--text-secondary)] hover:text-white hover:bg-white/5'
              }`
            }
          >
            <Compass size={16} />
            <span>Discover</span>
          </NavLink>

          <NavLink 
            to="/dashboard" 
            className={({ isActive }) => 
              `flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold transition-all ${
                isActive 
                  ? 'bg-white/10 text-white shadow-sm border border-white/10' 
                  : 'text-[var(--text-secondary)] hover:text-white hover:bg-white/5'
              }`
            }
          >
            <LayoutDashboard size={16} />
            <span>Tracked</span>
          </NavLink>

          {/* Anti-bot Status pill */}
          <div className="hidden md:flex items-center gap-2 ml-4 pl-4 border-l border-[var(--border-default)]">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-xs text-emerald-400 font-medium">
              <span className="pulse-dot pulse-dot-success" />
              Scraper Engine Online
            </span>

            <a 
              href="https://demo.inelabteamdev.com/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--text-muted)] hover:text-white hover:bg-white/5 transition-colors"
              title="Open INE Mock Store in new tab"
            >
              Mock Store <ExternalLink size={12} />
            </a>
          </div>
        </div>
      </Container>
    </nav>
  );
};
