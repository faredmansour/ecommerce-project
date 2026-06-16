import { useState, useRef, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search, ShoppingCart, Heart, User, ChevronDown, Phone, MapPin, LogOut } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import ThemeToggle from "./ThemeToggle";
import { categoriesAPI } from "../services/api";

export default function Header() {
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [categories, setCategories] = useState([]);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const dropdownRef = useRef(null);
  const userMenuRef = useRef(null);
  const navigate = useNavigate();
  const { user, isAuthenticated, logout } = useAuth();
  const { count } = useCart();

  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setCategoryOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    categoriesAPI.getAll().then((res) => {
      setCategories(res.data);
    }).catch(() => {});
  }, []);

  const handleSearch = () => {
    if (searchQuery.trim()) {
      navigate(`/category?search=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const handleLogout = () => {
    logout();
    setUserMenuOpen(false);
    navigate("/");
  };

  return (
    <div className="bg-white shadow-sm">
      {/* Main Header */}
      <div className="max-w-7xl mx-auto py-4 px-4 flex items-center justify-between gap-4">
        {/* Logo */}
        <Link to="/home" className="flex items-center gap-2 shrink-0">
          <div className="w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center">
            <span className="text-white font-bold text-sm">A</span>
          </div>
          <span className="text-xl font-bold text-gray-900 tracking-tight">ALFREDO</span>
        </Link>

        {/* Search Bar */}
        <div className="flex-1 max-w-xl">
          <div className="relative">
            <input
              type="text"
              placeholder="Search for anything..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSearch();
              }}
              className={`w-full border rounded-sm py-2.5 px-4 pr-10 text-sm focus:outline-none transition-colors ${
                searchFocused ? "border-orange-500" : "border-gray-300"
              }`}
            />
            <button
              onClick={handleSearch}
              className="absolute right-0 top-0 h-full px-3 bg-orange-500 rounded-r-sm hover:bg-orange-600 transition-colors"
            >
              <Search size={18} className="text-white" />
            </button>
          </div>
        </div>

        {/* Right Icons */}
        <div className="flex items-center gap-4 shrink-0">
          <ThemeToggle />
          {user?.role === "admin" && (
            <Link
              to="/admin"
              className="hidden sm:inline-flex items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-4 py-2 text-sm font-medium text-orange-600 hover:bg-orange-100 transition-colors"
            >
              Dashboard
            </Link>
          )}
          <Link to="/cart" className="relative p-1 hover:text-orange-500 transition-colors">
            <ShoppingCart size={22} className="text-gray-700" />
            {count > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-5 rounded-full bg-red-500 text-white text-[11px] font-semibold flex items-center justify-center px-1">
                {count}
              </span>
            )}
          </Link>
          <Link to="/wishlist" className="p-1 hover:text-orange-500 transition-colors">
            <Heart size={22} className="text-gray-700" />
          </Link>

          {/* User Menu */}
          <div className="relative" ref={userMenuRef}>
            <button
              onClick={() => {
                if (isAuthenticated) {
                  setUserMenuOpen(!userMenuOpen);
                } else {
                  navigate("/login");
                }
              }}
              className="p-1 hover:text-orange-500 transition-colors"
            >
              <User size={22} className="text-gray-700" />
            </button>
            {userMenuOpen && isAuthenticated && (
              <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-gray-200 rounded-md shadow-lg z-50">
                <div className="px-4 py-3 border-b border-gray-100">
                  <p className="text-sm font-medium text-gray-900">{user?.name}</p>
                  <p className="text-xs text-gray-500">{user?.email}</p>
                </div>
                <button
                  onClick={handleLogout}
                  className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors flex items-center gap-2"
                >
                  <LogOut size={14} /> Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Category Nav */}
      <div className="border-t border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setCategoryOpen(!categoryOpen)}
                className={`flex items-center gap-1.5 py-3 px-4 text-sm font-medium transition-colors ${
                  categoryOpen ? "bg-orange-500 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                All Category <ChevronDown size={14} className={`transition-transform ${categoryOpen ? "rotate-180" : ""}`} />
              </button>
              {categoryOpen && (
                <div className="absolute top-full left-0 w-56 bg-white border border-gray-200 rounded-b-md shadow-lg z-50">
                  {categories.map((cat) => (
                    <Link
                      key={cat}
                      to={`/category?cat=${encodeURIComponent(cat)}`}
                      onClick={() => setCategoryOpen(false)}
                      className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-500 transition-colors flex items-center gap-2 border-b border-gray-100 last:border-b-0"
                    >
                      {cat}
                    </Link>
                  ))}
                </div>
              )}
            </div>
            <nav className="flex items-center gap-5">
              <Link
                to="/category"
                className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-orange-500 py-3 transition-colors"
              >
                <MapPin size={14} /> All Products
              </Link>
              <Link
                to="/cart"
                className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-orange-500 py-3 transition-colors"
              >
                My Cart
              </Link>
              <Link
                to="/wishlist"
                className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-orange-500 py-3 transition-colors"
              >
                Wishlist
              </Link>
            </nav>
          </div>
          <a href="tel:+12025550104" className="flex items-center gap-1.5 text-sm text-gray-700 hover:text-orange-500 py-3 transition-colors">
            <Phone size={14} /> +1-202-555-0104
          </a>
        </div>
      </div>
    </div>
  );
}
