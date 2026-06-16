import { Link } from "react-router-dom";
import { Heart, ShoppingCart, Star } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { cartAPI, wishlistAPI } from "../services/api";
import { useState } from "react";

const BACKEND = import.meta.env.VITE_API_URL || "http://localhost:8000";

// Helper: resolve category name whether it's a string or a populated object
function getCategoryName(category) {
  if (!category) return "";
  if (typeof category === "string") return category;
  if (typeof category === "object") return category.name || "";
  return String(category);
}

// Helper: resolve full image URL
function getImageUrl(image) {
  if (!image) return "/placeholder.png";
  if (image.startsWith("http")) return image;
  return `${BACKEND}${image}`;
}

export default function ProductCard({ product }) {
  const { isAuthenticated } = useAuth();
  const [adding, setAdding] = useState(false);

  // MongoDB uses _id; mock data may use id
  const productId = product._id || product.id;
  const categoryName = getCategoryName(product.category);
  const imageUrl = getImageUrl(product.image);

  const discount = product.original_price
    ? Math.round(((product.original_price - product.price) / product.original_price) * 100)
    : 0;

  const handleAddToCart = async (e) => {
    e.preventDefault();
    if (!isAuthenticated) {
      window.location.href = "/login";
      return;
    }
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
      // handle error silently
    }
    setAdding(false);
  };

  const handleToggleWishlist = async (e) => {
    e.preventDefault();
    if (!isAuthenticated) {
      window.location.href = "/login";
      return;
    }
    try {
      await wishlistAPI.toggle(productId);
    } catch {
      // handle error silently
    }
  };

  return (
    <div className="group bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow">
      <Link to={`/product/${productId}`} className="block relative aspect-square overflow-hidden bg-gray-100">
        <img
          src={imageUrl}
          alt={product.name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          onError={(e) => { e.target.src = "/placeholder.png"; }}
        />
        {discount > 0 && (
          <span className="absolute top-2 left-2 bg-red-500 text-white text-xs font-semibold px-2 py-1 rounded">
            -{discount}%
          </span>
        )}
      </Link>
      <div className="p-4">
        <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{categoryName}</p>
        <Link to={`/product/${productId}`} className="block text-sm font-medium text-gray-900 line-clamp-2 mb-2 hover:text-orange-500">
          {product.name}
        </Link>
        <div className="flex items-center gap-1 mb-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star
              key={i}
              size={12}
              className={i < Math.round(product.rating || 0) ? "text-yellow-400 fill-yellow-400" : "text-gray-300"}
            />
          ))}
          <span className="text-xs text-gray-500 ml-1">({product.reviews_count || 0})</span>
        </div>
        <div className="flex items-center gap-2 mb-4">
          <span className="text-lg font-bold text-orange-500">${(product.price || 0).toFixed(2)}</span>
          {product.original_price && (
            <span className="text-sm text-gray-400 line-through">${product.original_price.toFixed(2)}</span>
          )}
        </div>
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={handleToggleWishlist}
            className="flex-1 py-2 px-3 bg-gray-100 rounded-lg hover:bg-orange-50 transition-colors"
          >
            <Heart size={16} className="text-gray-600" />
          </button>
          <button
            type="button"
            onClick={handleAddToCart}
            disabled={adding}
            className="flex-1 py-2 px-3 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50"
          >
            <ShoppingCart size={16} className="inline-block" />
            <span className="ml-2">{adding ? "Adding..." : "Add to Cart"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
