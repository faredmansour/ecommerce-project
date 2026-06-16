import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Heart, ShoppingCart } from "lucide-react";
import { wishlistAPI, cartAPI } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { formatPrice } from "../lib/format";

export default function WishlistPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const { isAuthenticated } = useAuth();
  const { refreshCart } = useCart();
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
      /* silent */
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
      refreshCart();
    } catch {
      /* silent */
    }
  };

  if (loading) {
    return <div className="max-w-7xl mx-auto px-4 py-16 text-center text-zinc-500">Loading wishlist…</div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-zinc-900 dark:text-white mb-6">My Wishlist</h1>

      {items.length === 0 ? (
        <div className="text-center py-20 rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-700">
          <Heart size={48} className="text-zinc-300 dark:text-zinc-600 mx-auto mb-4" />
          <p className="text-zinc-700 dark:text-zinc-200 text-lg font-medium mb-1">Your wishlist is empty</p>
          <p className="text-zinc-400 text-sm mb-6">Save items you love for later</p>
          <Link to="/category" className="inline-flex items-center gap-2 bg-brand text-brand-fg px-6 py-3 rounded-full font-semibold hover:opacity-90 transition">
            Browse Products
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
          {items.map((item) => (
            <div key={item._id || item.product_id} className="group bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden shadow-card hover:shadow-hover transition">
              <Link to={`/product/${item.product_id}`} className="block relative aspect-square overflow-hidden bg-zinc-100 dark:bg-zinc-800">
                <img src={item.image} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" onError={(e) => { e.target.src = "/placeholder.png"; }} />
              </Link>
              <div className="p-4">
                {item.category && <p className="text-[11px] text-zinc-400 uppercase tracking-wider mb-1">{item.category}</p>}
                <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100 line-clamp-2 mb-2">{item.name}</h3>
                {item.price != null && (
                  <div className="flex items-baseline gap-2 mb-3">
                    <span className="text-lg font-bold text-zinc-900 dark:text-white nums">{formatPrice(item.price)}</span>
                    {item.original_price && <span className="text-sm text-zinc-400 line-through nums">{formatPrice(item.original_price)}</span>}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <button onClick={() => addToCart(item.product_id, item)} className="flex-1 flex items-center justify-center gap-1.5 bg-brand text-brand-fg text-sm py-2 rounded-lg font-semibold hover:opacity-90 transition">
                    <ShoppingCart size={14} /> Add
                  </button>
                  <button onClick={() => removeFromWishlist(item.product_id)} aria-label="Remove" className="p-2 text-red-500 border border-red-200 dark:border-red-900 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 transition">
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
