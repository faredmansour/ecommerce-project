import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Heart } from "lucide-react";
import { wishlistAPI, cartAPI } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import ProductCard from "../components/ProductCard";

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
    return <div role="status" className="mx-auto max-w-content px-4 py-16 text-center text-muted">Loading wishlist…</div>;
  }

  return (
    <div className="mx-auto max-w-content px-4 py-6 sm:py-8">
      <h1 className="mb-6 border-b border-line pb-4 font-display text-2xl font-bold text-ink dark:text-white sm:text-3xl">My Wishlist</h1>

      {items.length === 0 ? (
        <div className="border border-dashed border-line bg-surface px-4 py-14 text-center">
          <Heart size={36} aria-hidden="true" className="mx-auto mb-4 text-brand" />
          <p className="mb-1 text-lg font-semibold text-ink dark:text-white">Your wishlist is empty</p>
          <p className="mb-6 text-sm text-muted">Save items you love for later</p>
          <Link to="/category" className="inline-flex min-h-11 items-center gap-2 rounded-md bg-brand px-5 py-2.5 font-semibold text-brand-fg transition-colors duration-200 hover:bg-brand-hover">
            Browse Products
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 lg:grid-cols-4">
          {items.map((item) => (
            <ProductCard
              key={item._id || item.product_id}
              product={item}
              isWishlisted
              addToCartLabel="Add"
              onAddToCart={() => addToCart(item.product_id, item)}
              onToggleWishlist={() => removeFromWishlist(item.product_id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
