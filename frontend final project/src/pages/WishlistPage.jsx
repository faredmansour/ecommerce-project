import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Heart, ShoppingCart } from "lucide-react";
import { wishlistAPI, cartAPI } from "../services/api";
import { useAuth } from "../context/AuthContext";

export default function WishlistPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isAuthenticated) {
      navigate("/login");
      return;
    }
    fetchWishlist();
  }, [isAuthenticated, navigate]);

  const fetchWishlist = async () => {
    try {
      const res = await wishlistAPI.getAll();
      setItems(res.data?.data || []);
    } catch {
      setItems([]);
    }
    setLoading(false);
  };

  const removeFromWishlist = async (productId) => {
    try {
      await wishlistAPI.remove(productId);
      setItems(items.filter((item) => item.product_id !== productId));
    } catch {
      // handle error
    }
  };

  const addToCart = async (productId, item) => {
    try {
      await cartAPI.add(productId, 1, {
        name: item.name,
        price: item.price || 0,
        category: item.category,
        image: item.image,
        original_price: item.original_price,
      });
    } catch {
      // handle error
    }
  };

  if (loading) {
    return <div className="max-w-7xl mx-auto px-4 py-16 text-center text-gray-500">Loading wishlist...</div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">My Wishlist</h1>

      {items.length === 0 ? (
        <div className="text-center py-16">
          <Heart size={48} className="text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 text-lg mb-2">Your wishlist is empty</p>
          <p className="text-gray-400 text-sm mb-6">Save items you love for later</p>
          <Link
            to="/category"
            className="inline-flex items-center gap-2 bg-orange-500 text-white px-6 py-3 rounded-lg font-medium hover:bg-orange-600 transition-colors"
          >
            Browse Products
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {items.map((item) => (
            <div key={item.id} className="bg-white rounded-lg border border-gray-200 overflow-hidden group">
              <Link to={`/product/${item.product_id}`} className="block">
                <div className="relative aspect-square overflow-hidden bg-gray-100">
                  <img
                    src={item.image}
                    alt={item.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                </div>
              </Link>
              <div className="p-4">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{item.category}</p>
                <h3 className="text-sm font-medium text-gray-900 line-clamp-2 mb-2">{item.name}</h3>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-lg font-bold text-orange-500">${item.price.toFixed(2)}</span>
                  {item.original_price && (
                    <span className="text-sm text-gray-400 line-through">${item.original_price.toFixed(2)}</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => addToCart(item.product_id, item)}
                    className="flex-1 flex items-center justify-center gap-1 bg-orange-500 text-white text-sm py-2 rounded-lg hover:bg-orange-600 transition-colors"
                  >
                    <ShoppingCart size={14} /> Add to Cart
                  </button>
                  <button
                    onClick={() => removeFromWishlist(item.product_id)}
                    className="p-2 text-red-500 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                  >
                    <Heart size={16} className="fill-red-500" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
