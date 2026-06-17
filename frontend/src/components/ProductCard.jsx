import { Link } from "react-router-dom";
import { Heart, ShoppingCart, Star } from "lucide-react";
import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { cartAPI, wishlistAPI } from "../services/api";
import { formatPrice } from "../lib/format";

const BACKEND = import.meta.env.VITE_API_URL || "http://localhost:8000";

function getCategoryName(category) {
  if (!category) return "";
  if (typeof category === "string") return category;
  if (typeof category === "object") return category.name || "";
  return String(category);
}

function getImageUrl(image) {
  if (!image) return "";
  if (image.startsWith("http") || image.startsWith("data:")) return image;
  return `${BACKEND}${image}`;
}

function getFallbackImage(name = "Product") {
  const label = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="480" height="480" viewBox="0 0 480 480">
      <defs>
        <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
          <stop stop-color="#f5c451"/>
          <stop offset="1" stop-color="#18181b"/>
        </linearGradient>
      </defs>
      <rect width="480" height="480" fill="url(#g)"/>
      <circle cx="356" cy="108" r="98" fill="rgba(255,255,255,.16)"/>
      <rect x="92" y="300" width="296" height="52" rx="18" fill="rgba(255,255,255,.24)"/>
      <text x="240" y="248" text-anchor="middle" font-family="Arial, sans-serif" font-size="104" font-weight="700" fill="#fff">${label || "P"}</text>
    </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

export default function ProductCard({ product }) {
  const { isAuthenticated } = useAuth();
  const [adding, setAdding] = useState(false);
  const [wished, setWished] = useState(false);

  const productId = product._id || product.id;
  const categoryName = getCategoryName(product.category);
  const imageUrl = getImageUrl(product.image) || getFallbackImage(product.name);
  const rating = Math.round(product.rating || 0);

  const discount = product.original_price
    ? Math.round(((product.original_price - product.price) / product.original_price) * 100)
    : 0;

  const requireAuth = () => {
    if (!isAuthenticated) {
      window.location.href = "/login";
      return false;
    }
    return true;
  };

  const handleAddToCart = async (e) => {
    e.preventDefault();
    if (!requireAuth()) return;
    setAdding(true);
    try {
      await cartAPI.add(productId, 1, {
        name: product.name,
        price: product.price || 0,
        category: categoryName,
        image: imageUrl,
        original_price: product.original_price,
      });
    } catch {
      /* silent */
    }
    setAdding(false);
  };

  const handleToggleWishlist = async (e) => {
    e.preventDefault();
    if (!requireAuth()) return;
    setWished((w) => !w);
    try {
      await wishlistAPI.toggle(productId, { name: product.name, image: imageUrl, category: categoryName });
    } catch {
      /* silent */
    }
  };

  return (
    <div className="group relative flex flex-col bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden shadow-card hover:shadow-hover hover:-translate-y-1 transition-all duration-300">
      <Link to={`/product/${productId}`} className="block relative aspect-square overflow-hidden bg-zinc-100 dark:bg-zinc-800">
        <img
          src={imageUrl}
          alt={product.name}
          loading="lazy"
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          onError={(e) => { e.target.src = getFallbackImage(product.name); }}
        />
        {discount > 0 && (
          <span className="absolute top-2.5 left-2.5 bg-gold text-gold-fg text-xs font-bold px-2 py-1 rounded-full nums">
            -{discount}%
          </span>
        )}
      </Link>

      {/* Floating wishlist */}
      <button
        type="button"
        onClick={handleToggleWishlist}
        aria-label="Toggle wishlist"
        className="absolute top-2.5 right-2.5 grid place-items-center h-9 w-9 rounded-full bg-white/90 dark:bg-zinc-800/90 shadow-sm text-zinc-700 dark:text-zinc-200 hover:text-gold opacity-0 group-hover:opacity-100 focus:opacity-100 transition"
      >
        <Heart size={16} className={wished ? "fill-gold text-gold" : ""} />
      </button>

      <div className="flex flex-col flex-1 p-4">
        {categoryName && (
          <p className="text-[11px] text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1">{categoryName}</p>
        )}
        <Link
          to={`/product/${productId}`}
          className="block font-medium text-sm text-zinc-900 dark:text-zinc-100 line-clamp-2 hover:text-gold transition min-h-[2.5rem]"
        >
          {product.name}
        </Link>

        <div className="flex items-center gap-1 mt-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star key={i} size={13} className={i < rating ? "text-gold fill-gold" : "text-zinc-300 dark:text-zinc-600"} />
          ))}
          <span className="text-xs text-zinc-400 ml-1 nums">({product.reviews_count || 0})</span>
        </div>

        <div className="flex items-baseline gap-2 mt-2 mb-4">
          <span className="text-lg font-bold text-zinc-900 dark:text-white nums">{formatPrice(product.price || 0)}</span>
          {product.original_price && (
            <span className="text-sm text-zinc-400 line-through nums">{formatPrice(product.original_price)}</span>
          )}
        </div>

        <button
          type="button"
          onClick={handleAddToCart}
          disabled={adding}
          className="mt-auto w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-brand text-brand-fg text-sm font-semibold hover:opacity-90 active:scale-[0.98] transition disabled:opacity-50"
        >
          <ShoppingCart size={16} />
          {adding ? "Adding…" : "Add to Cart"}
        </button>
      </div>
    </div>
  );
}
