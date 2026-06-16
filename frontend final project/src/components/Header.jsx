import { useState, useRef, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search, ShoppingCart, Heart, User, ChevronDown, Phone, LayoutGrid, LogOut } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import ThemeToggle from "./ThemeToggle";
import { categoriesAPI } from "../services/api";
import { siteConfig } from "../config/site.config";
import BrandLogo from "./BrandLogo";

export default function Header() {
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [categories, setCategories] = useState([]);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const dropdownRef = useRef(null);
  const userMenuRef = useRef(null);
  const navigate = useNavigate();
  const { user, isAuthenticated, logout } = useAuth();
  const { count } = useCart();

  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setCategoryOpen(false);
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) setUserMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    categoriesAPI.getAll().then((res) => setCategories(res.data)).catch(() => {});
  }, []);

  const handleSearch = () => {
    if (searchQuery.trim()) navigate(`/category?search=${encodeURIComponent(searchQuery.trim())}`);
  };

  const handleLogout = () => {
    logout();
    setUserMenuOpen(false);
    navigate("/");
  };

  const iconBtn =
    "relative p-2 rounded-full text-zinc-700 hover:text-gold hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800 transition-colors";

  return (
    <header className="sticky top-0 z-40 bg-white/95 dark:bg-zinc-900/95 backdrop-blur border-b border-zinc-200 dark:border-zinc-800">
      {/* Announcement bar */}
      {siteConfig.announcement.enabled && (
        <div className="bg-brand text-brand-fg text-center text-xs sm:text-sm py-2 px-4">
          <span className="text-gold font-semibold">★</span> {siteConfig.announcement.text}
        </div>
      )}

      {/* Main row */}
      <div className="max-w-7xl mx-auto py-3.5 px-4 flex items-center justify-between gap-4">
        <BrandLogo />

        {/* Search */}
        <div className="hidden md:block flex-1 max-w-xl">
          <div className="relative">
            <input
              type="text"
              placeholder="Search for products, brands and more…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="w-full rounded-full border border-zinc-300 dark:border-zinc-700 dark:bg-zinc-800 py-2.5 pl-5 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold transition"
            />
            <button
              onClick={handleSearch}
              aria-label="Search"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 h-8 w-8 grid place-items-center rounded-full bg-brand text-brand-fg hover:opacity-90 transition"
            >
              <Search size={16} />
            </button>
          </div>
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          <ThemeToggle />
          {user?.role === "admin" && (
            <Link
              to="/admin"
              className="hidden sm:inline-flex items-center rounded-full border border-gold/40 bg-gold/10 px-3.5 py-1.5 text-sm font-medium text-gold hover:bg-gold/20 transition"
            >
              Dashboard
            </Link>
          )}
          <Link to="/wishlist" aria-label="Wishlist" className={iconBtn}>
            <Heart size={21} />
          </Link>
          <Link to="/cart" aria-label="Cart" className={iconBtn}>
            <ShoppingCart size={21} />
            {count > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-gold text-gold-fg text-[11px] font-bold grid place-items-center px-1 nums">
                {count}
              </span>
            )}
          </Link>

          <div className="relative" ref={userMenuRef}>
            <button
              aria-label="Account"
              onClick={() => (isAuthenticated ? setUserMenuOpen(!userMenuOpen) : navigate("/login"))}
              className={iconBtn}
            >
              <User size={21} />
            </button>
            {userMenuOpen && isAuthenticated && (
              <div className="absolute right-0 top-full mt-2 w-52 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-hover z-50 overflow-hidden">
                <div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
                  <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">{user?.name}</p>
                  <p className="text-xs text-zinc-500 truncate">{user?.email}</p>
                </div>
                <button
                  onClick={handleLogout}
                  className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition flex items-center gap-2"
                >
                  <LogOut size={15} /> Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile search */}
      <div className="md:hidden px-4 pb-3">
        <div className="relative">
          <input
            type="text"
            placeholder="Search…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="w-full rounded-full border border-zinc-300 dark:border-zinc-700 dark:bg-zinc-800 py-2.5 pl-5 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold"
          />
          <button onClick={handleSearch} aria-label="Search" className="absolute right-1.5 top-1/2 -translate-y-1/2 h-8 w-8 grid place-items-center rounded-full bg-brand text-brand-fg">
            <Search size={16} />
          </button>
        </div>
      </div>

      {/* Category nav */}
      <div className="border-t border-zinc-200 dark:border-zinc-800 bg-white/60 dark:bg-zinc-900/60">
        <div className="max-w-7xl mx-auto px-4 flex items-center justify-between">
          <div className="flex items-center gap-1 sm:gap-5 overflow-x-auto">
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setCategoryOpen(!categoryOpen)}
                className={`flex items-center gap-2 py-2.5 px-4 my-1.5 rounded-full text-sm font-semibold transition ${
                  categoryOpen ? "bg-brand text-brand-fg" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                }`}
              >
                <LayoutGrid size={15} /> Categories
                <ChevronDown size={14} className={`transition-transform ${categoryOpen ? "rotate-180" : ""}`} />
              </button>
              {categoryOpen && (
                <div className="absolute top-full left-0 mt-1 w-60 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-hover z-50 overflow-hidden">
                  {categories.length === 0 && <p className="px-4 py-3 text-sm text-zinc-400">No categories</p>}
                  {categories.map((cat) => (
                    <Link
                      key={cat}
                      to={`/category?cat=${encodeURIComponent(cat)}`}
                      onClick={() => setCategoryOpen(false)}
                      className="block px-4 py-2.5 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-gold/10 hover:text-gold transition border-b border-zinc-100 dark:border-zinc-800 last:border-0"
                    >
                      {cat}
                    </Link>
                  ))}
                </div>
              )}
            </div>
            <nav className="flex items-center gap-4 sm:gap-5 whitespace-nowrap">
              <NavLink to="/category">All Products</NavLink>
              <NavLink to="/cart">My Cart</NavLink>
              <NavLink to="/wishlist">Wishlist</NavLink>
            </nav>
          </div>
          <a
            href={`tel:${siteConfig.contact.phone}`}
            className="hidden lg:flex items-center gap-1.5 text-sm text-zinc-600 dark:text-zinc-400 hover:text-gold py-3 transition"
          >
            <Phone size={14} /> {siteConfig.contact.phone}
          </a>
        </div>
      </div>
    </header>
  );
}

function NavLink({ to, children }) {
  return (
    <Link to={to} className="text-sm text-zinc-600 dark:text-zinc-400 hover:text-gold py-3 transition-colors">
      {children}
    </Link>
  );
}
