import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowRight, ChevronDown, ChevronLeft, ChevronRight, Heart, LayoutGrid, Package, Search, ShoppingBag, Star, Store, User } from "lucide-react";
import { formatPrice } from "../../lib/format";

const buttonVariants = {
  primary: "bg-brand text-brand-fg hover:bg-brand-hover",
  secondary: "bg-secondary text-white hover:bg-secondary/90",
  outline: "border border-line bg-surface text-ink hover:border-brand hover:text-brand",
  ghost: "text-ink hover:bg-surface-muted",
  danger: "bg-state-danger-action text-state-danger-action-fg hover:brightness-90",
};

const actionBase = "inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50";

export function Button({ variant = "primary", className = "", children, ...props }) {
  return (
    <button className={`${actionBase} ${buttonVariants[variant] || buttonVariants.primary} ${className}`} {...props}>
      {children}
    </button>
  );
}

export function ActionLink({ variant = "primary", className = "", children, ...props }) {
  return (
    <Link className={`${actionBase} ${buttonVariants[variant] || buttonVariants.primary} ${className}`} {...props}>
      {children}
    </Link>
  );
}

export function Input({ className = "", ...props }) {
  return <input className={`ui-control w-full px-3 py-2.5 text-sm ${className}`} {...props} />;
}

export function Select({ className = "", children, ...props }) {
  return <select className={`ui-control w-full px-3 py-2.5 text-sm ${className}`} {...props}>{children}</select>;
}

export function SearchBar({ value, onChange, onSubmit, placeholder = "Search products", className = "" }) {
  return (
    <form className={`relative ${className}`} onSubmit={(event) => { event.preventDefault(); onSubmit?.(); }} role="search">
      <Input
        type="search"
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
        placeholder={placeholder}
        className="h-11 rounded-md pl-4 pr-12"
        aria-label={placeholder}
      />
      <button type="submit" aria-label="Search" className="absolute right-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-md bg-brand text-brand-fg transition-colors hover:bg-brand-hover">
        <Search size={18} />
      </button>
    </form>
  );
}

export function CategoryNavigation({ categories = [], mobile = false, onNavigate }) {
  const [categoryOpen, setCategoryOpen] = useState(false);
  const dropdownRef = useRef(null);
  const { pathname } = useLocation();
  const links = [
    { to: "/category", label: "All Products", icon: Store },
    { to: "/cart", label: "My Cart", icon: ShoppingBag },
    { to: "/wishlist", label: "Wishlist", icon: Heart },
    { to: "/orders", label: "My Orders", icon: Package },
    { to: "/account", label: "Account", icon: User },
  ];

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) setCategoryOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (mobile) {
    return (
      <nav aria-label="Mobile navigation" className="space-y-5">
        <div className="grid grid-cols-2 gap-1">
          {links.map(({ to, label, icon: Icon }) => {
            const active = pathname === to;
            return (
              <Link
                key={to}
                to={to}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm transition ${active ? "bg-sage/70 font-semibold text-dark-olive dark:bg-dark-olive dark:text-white" : "text-muted hover:bg-sage/35 dark:hover:bg-surface-muted"}`}
              >
                <Icon size={18} />
                {label}
              </Link>
            );
          })}
        </div>
        {categories.length > 0 && (
          <div className="border-t border-line pt-4">
            <p className="mb-2 px-3 text-xs font-semibold uppercase text-muted">Shop by category</p>
            <div className="grid grid-cols-2 gap-x-1">
              {categories.map((category) => (
                <Link
                  key={category}
                  to={`/category?cat=${encodeURIComponent(category)}`}
                  onClick={onNavigate}
                  className="flex min-h-10 items-center gap-2 rounded-md px-3 py-2 text-sm text-muted transition hover:bg-sage/35 hover:text-dark-olive dark:hover:bg-surface-muted dark:hover:text-ink"
                >
                  <ChevronRight size={16} />
                  <span className="truncate">{category}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </nav>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-1 sm:gap-5">
      <div className="relative shrink-0" ref={dropdownRef}>
        <button
          type="button"
          aria-expanded={categoryOpen}
          onClick={() => setCategoryOpen((open) => !open)}
          className={`flex min-h-10 items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition ${categoryOpen || pathname === "/category" ? "bg-sage/70 text-dark-olive dark:bg-dark-olive dark:text-white" : "text-muted hover:bg-sage/35 hover:text-dark-olive dark:hover:bg-surface-muted dark:hover:text-ink"}`}
        >
          <LayoutGrid size={16} /> Categories
          <ChevronDown size={16} className={`transition-transform ${categoryOpen ? "rotate-180" : ""}`} />
        </button>
        {categoryOpen && (
          <div className="absolute left-0 top-full z-50 mt-2 max-h-80 w-60 overflow-y-auto rounded-lg border border-line bg-surface shadow-hover">
            {categories.length === 0 && <p className="px-4 py-3 text-sm text-muted">No categories</p>}
            {categories.map((category) => (
              <Link
                key={category}
                to={`/category?cat=${encodeURIComponent(category)}`}
                onClick={() => { setCategoryOpen(false); onNavigate?.(); }}
                className="block border-b border-line/60 px-4 py-2.5 text-sm text-ink transition last:border-0 hover:bg-sage/40 hover:text-dark-olive dark:text-zinc-200"
              >
                {category}
              </Link>
            ))}
          </div>
        )}
      </div>
      <nav aria-label="Main categories" className="flex min-w-0 items-center gap-1 overflow-x-auto whitespace-nowrap sm:gap-2">
        {links.map(({ to, label, icon: Icon }) => {
          const active = pathname === to;
          return (
            <CategoryLink key={to} to={to} active={active}>
              <Icon size={18} />
              {label}
            </CategoryLink>
          );
        })}
      </nav>
    </div>
  );
}

function CategoryLink({ to, active, children }) {
  return (
    <Link
      to={to}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-1.5 border-b-2 px-2 py-3 text-sm transition ${active ? "border-brand font-semibold text-brand" : "border-transparent text-muted hover:text-brand"}`}
    >
      {children}
    </Link>
  );
}

export function ProductRating({ rating = 0, count, className = "" }) {
  const roundedRating = Math.max(0, Math.min(5, Math.round(rating)));
  return (
    <div className={`flex items-center gap-1 ${className}`} aria-label={`${roundedRating} out of 5 stars`}>
      {Array.from({ length: 5 }, (_, index) => (
        <Star key={index} size={16} className={index < roundedRating ? "fill-brand text-brand" : "text-zinc-300 dark:text-zinc-600"} />
      ))}
      {count !== undefined && <span className="ml-1 text-xs text-muted nums">({count})</span>}
    </div>
  );
}

export function CategoryCard({ title, description, image, imageAlt, to, className = "" }) {
  return (
    <Link
      to={to}
      className={`arena-card group min-h-[260px] rounded-xl border border-line sm:min-h-[320px] ${className}`}
      aria-label={`Explore ${title.toLowerCase()} collection`}
    >
      <img src={image} alt={imageAlt} className="arena-card-image" loading="lazy" />
      <span className="arena-card-content flex h-full flex-col items-start justify-end p-6 sm:p-8">
        <span className="text-xs font-bold uppercase tracking-[0.18em] text-brand">EXPLORE COLLECTION</span>
        <span className="mt-2 font-display text-3xl font-extrabold uppercase tracking-[-0.05em] text-ink sm:text-4xl">{title}</span>
        <span className="mt-2 flex items-center gap-2 text-sm font-medium text-secondary">
          {description}
          <ArrowRight size={17} aria-hidden="true" className="transition-transform group-hover:translate-x-1" />
        </span>
      </span>
    </Link>
  );
}

export function PriceDisplay({ price = 0, originalPrice, className = "" }) {
  return (
    <div className={`flex items-baseline gap-2 ${className}`}>
      <span className="nums font-bold text-ink dark:text-white">{formatPrice(price)}</span>
      {originalPrice != null && <span className="nums text-sm text-muted line-through">{formatPrice(originalPrice)}</span>}
    </div>
  );
}

export function Badge({ variant = "neutral", className = "", children, ...props }) {
  const variants = {
    neutral: "bg-surface-muted text-ink",
    accent: "bg-brand text-brand-fg",
    success: "border border-state-success-border bg-state-success-bg text-state-success",
    warning: "border border-state-warning-border bg-state-warning-bg text-state-warning",
    danger: "border border-state-danger-border bg-state-danger-bg text-state-danger",
  };
  return <span className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-semibold ${variants[variant] || variants.neutral} ${className}`} {...props}>{children}</span>;
}

export function QuantityControl({ value, onChange, min = 1, max = Infinity, className = "" }) {
  return (
    <div className={`inline-flex h-10 items-center rounded-lg border border-line bg-surface ${className}`}>
      <button type="button" aria-label="Decrease quantity" disabled={value <= min} onClick={() => onChange?.(Math.max(min, value - 1))} className="grid h-full w-10 place-items-center text-muted hover:text-brand disabled:opacity-40">−</button>
      <span className="min-w-8 text-center text-sm font-semibold nums" aria-live="polite">{value}</span>
      <button type="button" aria-label="Increase quantity" disabled={value >= max} onClick={() => onChange?.(Math.min(max, value + 1))} className="grid h-full w-10 place-items-center text-muted hover:text-brand disabled:opacity-40">+</button>
    </div>
  );
}

export function Breadcrumbs({ items = [], className = "" }) {
  return (
    <nav aria-label="Breadcrumb" className={`text-sm ${className}`}>
      <ol className="flex flex-wrap items-center gap-2 text-muted">
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`} className="flex items-center gap-2">
            {index > 0 && <ChevronRight size={16} aria-hidden="true" />}
            {item.href && index < items.length - 1 ? <Link to={item.href} className="hover:text-brand">{item.label}</Link> : <span aria-current="page" className="text-ink dark:text-white">{item.label}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function Pagination({ page, pages, onChange, className = "" }) {
  if (!pages || pages < 2) return null;
  return (
    <nav aria-label="Pagination" className={`flex items-center justify-center gap-2 ${className}`}>
      <Button variant="outline" aria-label="Previous page" disabled={page <= 1} onClick={() => onChange?.(page - 1)} className="h-10 w-10 p-0"><ChevronLeft size={18} /></Button>
      <span className="px-2 text-sm text-muted nums">{page} / {pages}</span>
      <Button variant="outline" aria-label="Next page" disabled={page >= pages} onClick={() => onChange?.(page + 1)} className="h-10 w-10 p-0"><ChevronRight size={18} /></Button>
    </nav>
  );
}

export function Modal({ open, onClose, title, children, className = "" }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/45 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.(); }}>
      <section role="dialog" aria-modal="true" aria-label={title} className={`w-full max-w-lg rounded-lg border border-line bg-surface p-6 shadow-hover ${className}`}>
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="font-display text-lg font-bold text-ink dark:text-white">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close dialog" className="grid h-9 w-9 place-items-center rounded-md text-muted hover:bg-sage/50">×</button>
        </div>
        {children}
      </section>
    </div>
  );
}

export function Toast({ message, variant = "info", className = "" }) {
  if (!message) return null;
  const styles = {
    info: "border-state-info-border bg-state-info-bg text-state-info",
    success: "border-state-success-border bg-state-success-bg text-state-success",
    error: "border-state-danger-border bg-state-danger-bg text-state-danger",
    warning: "border-state-warning-border bg-state-warning-bg text-state-warning",
  };
  return <div role="status" className={`rounded-md border px-4 py-3 text-sm shadow-card ${styles[variant] || styles.info} ${className}`}>{message}</div>;
}

export function Alert({ variant = "info", title, children, className = "" }) {
  const styles = {
    info: "border-state-info-border bg-state-info-bg text-state-info",
    success: "border-state-success-border bg-state-success-bg text-state-success",
    warning: "border-state-warning-border bg-state-warning-bg text-state-warning",
    error: "border-state-danger-border bg-state-danger-bg text-state-danger",
  };
  const role = variant === "error" || variant === "warning" ? "alert" : "status";

  return (
    <div role={role} className={`rounded-md border px-4 py-3 text-sm ${styles[variant] || styles.info} ${className}`}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={title ? "mt-1" : ""}>{children}</div>}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, action, className = "" }) {
  return (
    <div className={`flex flex-col items-center py-12 text-center ${className}`}>
      {Icon && <Icon size={32} aria-hidden="true" className="mb-4 text-brand" />}
      <h2 className="font-display text-lg font-bold text-ink dark:text-white">{title}</h2>
      {description && <p className="mt-2 max-w-md text-sm leading-6 text-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function LoadingState({ label = "Loading…", className = "" }) {
  return (
    <div role="status" className={`flex items-center justify-center gap-3 py-12 text-sm text-muted ${className}`}>
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-line border-t-brand" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function SectionHeader({ title, subtitle, action, className = "" }) {
  return (
    <div className={`mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-line pb-4 ${className}`}>
      <div>
        <h2 className="font-display text-xl font-bold text-ink dark:text-white">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function PromoBanner({ title, description, action, className = "", style, children }) {
  return (
    <section style={style} className={`overflow-hidden rounded-lg bg-brand px-6 py-8 text-white sm:px-8 ${className}`}>
      {children || <>
        <h2 className="font-display text-xl font-bold">{title}</h2>
        {description && <p className="mt-2 max-w-xl text-sm text-white/85">{description}</p>}
        {action && <div className="mt-5">{action}</div>}
      </>}
    </section>
  );
}