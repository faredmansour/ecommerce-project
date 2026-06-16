import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Trash2, Minus, Plus, ShoppingBag } from "lucide-react";
import { cartAPI } from "../services/api";
import { useAuth } from "../context/AuthContext";

export default function CartPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const { isAuthenticated } = useAuth();
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
    if (quantity <= 0) {
      await removeItem(itemId);
      return;
    }
    try {
      await cartAPI.update(itemId, quantity);
      setItems(items.map((item) => (item.id === itemId ? { ...item, quantity } : item)));
    } catch {
      // handle error
    }
  };

  const removeItem = async (itemId) => {
    try {
      await cartAPI.remove(itemId);
      setItems(items.filter((item) => item.id !== itemId));
    } catch {
      // handle error
    }
  };

  const total = items.reduce((sum, item) => sum + (item.price || 0) * (item.quantity || 0), 0);

  if (loading) {
    return <div className="max-w-7xl mx-auto px-4 py-16 text-center text-gray-500">Loading cart...</div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Shopping Cart</h1>

      {items.length === 0 ? (
        <div className="text-center py-16">
          <ShoppingBag size={48} className="text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 text-lg mb-2">Your cart is empty</p>
          <p className="text-gray-400 text-sm mb-6">Add some products to get started</p>
          <Link
            to="/category"
            className="inline-flex items-center gap-2 bg-orange-500 text-white px-6 py-3 rounded-lg font-medium hover:bg-orange-600 transition-colors"
          >
            Continue Shopping
          </Link>
        </div>
      ) : (
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Cart Items */}
          <div className="lg:col-span-2 space-y-4">
            {items.map((item) => (
              <div key={item.id} className="bg-white border border-gray-200 rounded-lg p-4 flex items-center gap-4">
                <img
                  src={item.image}
                  alt={item.name}
                  className="w-20 h-20 object-cover rounded-lg bg-gray-100"
                />
                <div className="flex-1">
                  <Link to={`/product/${item.product_id}`} className="text-sm font-medium text-gray-900 hover:text-orange-500">
                    {item.name}
                  </Link>
                  <p className="text-xs text-gray-500 mt-0.5">{item.category}</p>
                  <p className="text-orange-500 font-bold mt-1">${item.price.toFixed(2)}</p>
                </div>
                <div className="flex items-center border border-gray-300 rounded-lg">
                  <button
                    onClick={() => updateQuantity(item.id, item.quantity - 1)}
                    className="p-1.5 hover:bg-gray-100 transition-colors"
                  >
                    <Minus size={14} />
                  </button>
                  <span className="px-3 py-1 text-sm font-medium">{item.quantity}</span>
                  <button
                    onClick={() => updateQuantity(item.id, item.quantity + 1)}
                    className="p-1.5 hover:bg-gray-100 transition-colors"
                  >
                    <Plus size={14} />
                  </button>
                </div>
                <p className="text-sm font-bold text-gray-900 w-20 text-right">
                  ${(item.price * item.quantity).toFixed(2)}
                </p>
                <button
                  onClick={() => removeItem(item.id)}
                  className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>

          {/* Order Summary */}
          <div className="bg-white border border-gray-200 rounded-lg p-6 h-fit">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Order Summary</h2>
            <div className="space-y-3 mb-6">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Subtotal ({items.length} items)</span>
                <span className="font-medium">${total.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Shipping</span>
                <span className="font-medium text-green-600">{total >= 50 ? "Free" : "$5.99"}</span>
              </div>
              <hr className="border-gray-200" />
              <div className="flex justify-between">
                <span className="font-bold text-gray-900">Total</span>
                <span className="font-bold text-orange-500 text-lg">
                  ${(total + (total >= 50 ? 0 : 5.99)).toFixed(2)}
                </span>
              </div>
            </div>
            <button className="w-full bg-orange-500 text-white py-3 rounded-lg font-medium hover:bg-orange-600 transition-colors">
              Checkout
            </button>
            <Link
              to="/category"
              className="block text-center text-sm text-gray-500 hover:text-orange-500 mt-3 transition-colors"
            >
              Continue Shopping
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
