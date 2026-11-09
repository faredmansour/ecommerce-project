import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Heart, LogOut, Menu, ShoppingBag, User, X } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import ThemeToggle from "./ThemeToggle";
import BrandLogo from "./BrandLogo";
import { SearchBar } from "./ui";

const primaryLinks = [
  { label: "SHOP", to: "/category" },
  { label: "GAMING", to: "/category?search=gaming" },
  { label: "TECH", to: "/category?search=technology" },
];

export default function Header() {
  const [searchQuery, setSearchQuery] = useState("");
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const userMenuRef = useRef(null);
  const headerRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAuthenticated, logout } = useAuth();
  const { count } = useCart();
  const urlSearchQuery = new URLSearchParams(location.search).get("search") || "";

  useEffect(() => {
    setSearchQuery(urlSearchQuery);
  }, [urlSearchQuery]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) setUserMenuOpen(false);
      if (headerRef.current && !headerRef.current.contains(event.target)) setMobileMenuOpen(false);
    }
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setUserMenuOpen(false);
        setMobileMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const handleSearch = () => {
    const query = searchQuery.trim();
    if (query) navigate(`/category?search=${encodeURIComponent(query)}`);
  };

  const handleClearSearch = () => {
    setSearchQuery("");
    const nextParams = new URLSearchParams(location.search);
    nextParams.delete("search");
    const query = nextParams.toString();
    navigate({ pathname: "/category", search: query ? `?${query}` : "" });
  };

  const handleLogout = () => {
    logout();
    setUserMenuOpen(false);
    navigate("/");
  };

  const iconButton = "relative inline-flex h-11 min-w-11 items-center justify-center gap-2 rounded-full px-2 text-ink transition-colors hover:bg-surface-muted focus-visible:outline-brand";
  const navClass = "min-h-11 px-2 text-xs font-bold tracking-[0.16em] text-ink transition-colors hover:text-brand focus-visible:outline-brand sm:px-3 sm:text-sm";

  return (
    <header ref={headerRef} className="site-header sticky top-0 z-40 border-b-2 border-brand bg-surface">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5 sm:gap-5 md:py-3">
        <BrandLogo />

        <nav aria-label="Main navigation" className="hidden items-center gap-1 md:flex">
          {primaryLinks.map((link) => (
            <Link key={link.label} to={link.to} className={navClass}>{link.label}</Link>
          ))}
        </nav>

        <div className="hidden min-w-0 max-w-sm flex-1 items-center gap-1 lg:flex">
          <SearchBar
            className="min-w-0 flex-1"
            value={searchQuery}
            onChange={setSearchQuery}
            onSubmit={handleSearch}
            placeholder="Search products"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={handleClearSearch}
              aria-label="Clear search"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-md text-muted transition-colors hover:bg-surface-muted hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
            >
              <X size={18} aria-hidden="true" />
            </button>
          )}
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
          <div className="hidden md:block"><ThemeToggle /></div>
          <Link to="/wishlist" aria-label="Wishlist" className={`${iconButton} hidden md:inline-flex`}>
            <Heart size={20} aria-hidden="true" />
          </Link>
          <Link to="/cart" aria-label={count ? `Shopping bag, ${count} items` : "Shopping bag"} className={iconButton}>
            <ShoppingBag size={21} aria-hidden="true" />
            {count > 0 && (
              <span className="absolute right-0 top-0 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-brand px-1 text-[11px] font-bold text-white nums">
                {count}
              </span>
            )}
          </Link>

          <div className="relative hidden md:block" ref={userMenuRef}>
            <button
              type="button"
              aria-label="Account"
              aria-expanded={userMenuOpen}
              onClick={() => (isAuthenticated ? setUserMenuOpen((open) => !open) : navigate("/login"))}
              className={iconButton}
            >
              <User size={20} aria-hidden="true" />
            </button>
            {userMenuOpen && isAuthenticated && (
              <div className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-lg border border-line bg-surface shadow-hover">
                <div className="border-b border-line px-4 py-3">
                  <p className="truncate text-sm font-semibold text-ink dark:text-white">{user?.name}</p>
                  <p className="truncate text-xs text-muted">{user?.email}</p>
                </div>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex min-h-11 w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-state-danger transition-colors hover:bg-state-danger-bg"
                >
                  <LogOut size={16} aria-hidden="true" /> Sign out
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-navigation"
            onClick={() => setMobileMenuOpen((open) => !open)}
            className={`${iconButton} md:hidden`}
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-1 px-4 pb-3 lg:hidden">
        <SearchBar className="min-w-0 flex-1" value={searchQuery} onChange={setSearchQuery} onSubmit={handleSearch} placeholder="Search products" />
        {searchQuery && (
          <button
            type="button"
            onClick={handleClearSearch}
            aria-label="Clear search"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-md text-muted transition-colors hover:bg-surface-muted hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
          >
            <X size={18} aria-hidden="true" />
          </button>
        )}
      </div>

      {mobileMenuOpen && (
        <div id="mobile-navigation" className="border-t border-line bg-surface px-4 py-4 shadow-card md:hidden">
          <nav aria-label="Mobile navigation" className="grid grid-cols-2 gap-2">
            {primaryLinks.map((link) => (
              <Link
                key={link.label}
                to={link.to}
                onClick={() => setMobileMenuOpen(false)}
                className="flex min-h-11 items-center rounded-md px-3 text-sm font-bold tracking-wide text-ink transition-colors hover:bg-surface-muted hover:text-brand dark:text-zinc-100"
              >
                {link.label}
              </Link>
            ))}
            <Link to="/wishlist" onClick={() => setMobileMenuOpen(false)} className="flex min-h-11 items-center gap-2 rounded-md px-3 text-sm text-ink hover:bg-surface-muted dark:text-zinc-100">
              <Heart size={18} /> Wishlist
            </Link>
            <Link to="/account" onClick={() => setMobileMenuOpen(false)} className="flex min-h-11 items-center gap-2 rounded-md px-3 text-sm text-ink hover:bg-surface-muted dark:text-zinc-100">
              <User size={18} /> Account
            </Link>
          </nav>
          <div className="mt-3 border-t border-line pt-3">
            <ThemeToggle />
          </div>
        </div>
      )}
    </header>
  );
}
