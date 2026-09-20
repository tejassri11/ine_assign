import React from 'react';
import { Loader2 } from 'lucide-react';

export const Card = ({ children, className = '', interactive = false, ...props }) => {
  const interactiveClass = interactive ? 'card-interactive' : '';
  return (
    <div className={`card ${interactiveClass} ${className}`} {...props}>
      {children}
    </div>
  );
};

export const Button = ({ 
  children, 
  variant = 'primary', 
  className = '', 
  isLoading = false, 
  disabled = false, 
  icon = null,
  ...props 
}) => {
  const baseClass = 'btn';
  let variantClass = 'btn-primary';
  if (variant === 'secondary') variantClass = 'btn-secondary';
  if (variant === 'ghost') variantClass = 'btn-ghost';
  if (variant === 'brand') variantClass = 'btn-brand';
  
  return (
    <button 
      className={`${baseClass} ${variantClass} ${className}`} 
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <Loader2 className="spinner" size={16} />
      ) : icon ? (
        <span className="flex items-center">{icon}</span>
      ) : null}
      {children}
    </button>
  );
};

export const Badge = ({ 
  children, 
  variant = 'neutral', 
  className = '', 
  hasDot = false,
  ...props 
}) => {
  const variantClass = `badge-${variant}`;
  let dotClass = 'pulse-dot-brand';
  if (variant === 'success') dotClass = 'pulse-dot-success';
  if (variant === 'failure') dotClass = 'pulse-dot-failure';
  
  return (
    <span className={`badge ${variantClass} ${className}`} {...props}>
      {hasDot && <span className={`pulse-dot ${dotClass}`} />}
      {children}
    </span>
  );
};

export const Spinner = ({ size = 20, className = '' }) => {
  return <Loader2 className={`spinner ${className}`} size={size} />;
};

export const Container = ({ children, className = '' }) => (
  <div className={`container ${className}`}>{children}</div>
);

export const StatCard = ({ title, value, subtitle, icon, badge, className = '' }) => (
  <Card className={`flex flex-col justify-between ${className}`}>
    <div className="flex items-center justify-between mb-3">
      <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">{title}</span>
      {icon && <div className="text-[var(--text-secondary)] p-2 rounded-lg bg-[rgba(255,255,255,0.03)] border border-[var(--border-subtle)]">{icon}</div>}
    </div>
    <div>
      <div className="text-2xl font-bold text-white tracking-tight">{value}</div>
      {(subtitle || badge) && (
        <div className="flex items-center gap-2 mt-2">
          {badge}
          {subtitle && <span className="text-xs text-[var(--text-muted)]">{subtitle}</span>}
        </div>
      )}
    </div>
  </Card>
);

export const PageHeader = ({ title, subtitle, badge, action }) => (
  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
    <div>
      {badge && <div className="mb-2">{badge}</div>}
      <h1 className="text-3xl font-extrabold text-white tracking-tight">{title}</h1>
      {subtitle && <p className="text-[var(--text-secondary)] mt-1 text-sm max-w-2xl">{subtitle}</p>}
    </div>
    {action && <div className="flex items-center gap-3">{action}</div>}
  </div>
);

export const EmptyState = ({ title, description, icon, action }) => (
  <Card className="text-center p-12 flex flex-col items-center justify-center min-h-[340px] border-dashed border-[var(--border-strong)] bg-[rgba(18,18,24,0.4)]">
    {icon && (
      <div className="mb-4 p-4 rounded-2xl bg-[rgba(255,255,255,0.03)] border border-[var(--border-default)] text-[var(--text-secondary)] shadow-inner">
        {icon}
      </div>
    )}
    <h3 className="text-xl font-bold text-white mb-2 tracking-tight">{title}</h3>
    <p className="text-[var(--text-secondary)] max-w-md mx-auto mb-6 text-sm leading-relaxed">{description}</p>
    {action}
  </Card>
);
