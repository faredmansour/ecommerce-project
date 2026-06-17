import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Trash2, Minus, Plus, ShoppingBag } from "lucide-react";
import { cartAPI } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { formatPrice } from "../lib/format";
import { siteConfig } from "../config/site.config";

const THRESHOLD = siteConfig.freeShippingThreshold;
const FEE = siteConfig.shippingFee;

export default function CartPage() {
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
    fetchCart();
  }, [isAuthenticated, navigate]);

  const fetchCart = async () => {
    try {
      const res = await cartAPI.getAll();
      setItems(res.data.data || []);
    } catch {
      setItems([]);
    }
    setLoading(false);
  };

  const updateQuantity = async (itemId, quantity) => {
    if (quantity <= 0) return removeItem(itemId);
    try {
      await cartAPI.update(itemId, quantity);
      setItems(items.map((item) => (item._id === itemId ? { ...item, quantity } : item)));
    } catch {
      /* silent */
    }
  };

  const removeItem = async (itemId) => {
    try {
      await cartAPI.remove(itemId);
      setItems(items.filter((item) => item._id !== itemId));
      refreshCart();
    } catch {
      /* silent */
    }
  };

  const total = items.reduce((sum, item) => sum + (item.price || 0) * (item.quantity || 0), 0);
  const shipping = total >= THRESHOLD || total === 0 ? 0 : FEE;

  if (loading) {
    return <div className="max-w-7xl mx-auto px-4 py-16 text-center text-zinc-500">Loading cart…</div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-zinc-900 dark:text-white mb-6">Shopping Cart</h1>

      {items.length === 0 ? (
        <div className="text-center py-20 rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-700">
          <ShoppingBag size={48} className="text-zinc-300 dark:text-zinc-600 mx-auto mb-4" />
          <p className="text-zinc-700 dark:text-zinc-200 text-lg font-medium mb-1">Your cart is empty</p>
          <p className="text-zinc-400 text-sm mb-6">Add some products to get started</p>
          <Link to="/category" className="inline-flex items-center gap-2 bg-brand text-brand-fg px-6 py-3 rounded-full font-semibold hover:opacity-90 transition">
            Continue Shopping
          </Link>
        </div>
      ) : (
        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-4">
            {items.map((item) => (
              <div key={item._id} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 flex items-center gap-4">
                <img src={item.image} alt={item.name} className="w-20 h-20 object-cover rounded-lg bg-zinc-100 dark:bg-zinc-800" onError={(e) => { e.target.src = "/placeholder.png"; }} />
                <div className="flex-1 min-w-0">
                  <Link to={`/product/${item.product_id}`} className="text-sm font-medium text-zinc-900 dark:text-zinc-100 hover:text-gold line-clamp-1">
                    {item.name}
                  </Link>
                  <p className="text-xs text-zinc-500 mt-0.5">{item.category}</p>
                  <p className="text-zinc-900 dark:text-white font-bold mt-1 nums">{formatPrice(item.price)}</p>
                </div>
                <div className="flex items-center border border-zinc-300 dark:border-zinc-700 rounded-full">
                  <button onClick={() => updateQuantity(item._id, item.quantity - 1)} className="p-1.5 hover:text-gold transition"><Minus size={14} /></button>
                  <span className="px-3 text-sm font-semibold nums">{item.quantity}</span>
                  <button onClick={() => updateQuantity(item._id, item.quantity + 1)} className="p-1.5 hover:text-gold transition"><Plus size={14} /></button>
                </div>
                <p className="text-sm font-bold text-zinc-900 dark:text-white w-24 text-right nums">{formatPrice(item.price * item.quantity)}</p>
                <button onClick={() => removeItem(item._id)} aria-label="Remove" className="p-2 text-zinc-400 hover:text-red-500 transition"><Trash2 size={16} /></button>
              </div>
            ))}
          </div>

          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 h-fit shadow-card">
            <h2 className="font-display text-lg font-bold text-zinc-900 dark:text-white mb-4">Order Summary</h2>
            <div className="space-y-3 mb-6 text-sm">
              <div className="flex justify-between">
                <span className="text-zinc-500">Subtotal ({items.length} items)</span>
                <span className="font-medium nums">{formatPrice(total)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Shipping</span>
                <span className="font-medium text-green-600 nums">{shipping === 0 ? "Free" : formatPrice(shipping)}</span>
              </div>
              <hr className="border-zinc-200 dark:border-zinc-800" />
              <div className="flex justify-between items-baseline">
                <span className="font-bold text-zinc-900 dark:text-white">Total</span>
                <span className="font-bold text-zinc-900 dark:text-white text-lg nums">{formatPrice(total + shipping)}</span>
              </div>
            </div>
            <button onClick={() => navigate("/checkout")} className="w-full bg-brand text-brand-fg py-3 rounded-full font-semibold hover:opacity-90 active:scale-[0.99] transition">
              Proceed to Checkout
            </button>
            <Link to="/category" className="block text-center text-sm text-zinc-500 hover:text-gold mt-3 transition">
              Continue Shopping
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
