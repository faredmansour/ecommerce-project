import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Clock3, CreditCard, MapPin, Package, ReceiptText } from "lucide-react";
import { ordersAPI } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { formatPrice } from "../lib/format";

const STATUS_STYLES = {
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
  shipped: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
  delivered: "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400",
};

export default function OrdersPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isAuthenticated) {
      navigate("/login");
      return;
    }

    const loadOrders = async () => {
      try {
        const res = await ordersAPI.getAll();
        setOrders(res.data.data || []);
      } catch (err) {
        setError(err.response?.data?.message || "Could not load your orders.");
      } finally {
        setLoading(false);
      }
    };

    loadOrders();
  }, [isAuthenticated, navigate]);

  const totalSpend = useMemo(() => orders.reduce((sum, order) => sum + (order.totalAmount || 0), 0), [orders]);

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-16 text-center text-zinc-500">
        Loading your orders...
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-card dark:border-zinc-800 dark:bg-zinc-900 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-gold">My Orders</p>
          <h1 className="mt-1 font-display text-2xl font-extrabold text-zinc-900 dark:text-white">Your order history</h1>
          <p className="mt-2 text-sm text-zinc-500">Track delivery progress, payment method, and order details in one place.</p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-800/50">
          <p className="text-zinc-500">Total spent</p>
          <p className="text-lg font-semibold text-zinc-900 dark:text-white">{formatPrice(totalSpend)}</p>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-400">
          {error}
        </div>
      )}

      {orders.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-12 text-center text-zinc-500 shadow-card dark:border-zinc-700 dark:bg-zinc-900">
          <Package size={32} className="mx-auto mb-3 text-gold" />
          <p className="text-lg font-semibold text-zinc-900 dark:text-white">No orders yet</p>
          <p className="mt-2">Start shopping to see your recent purchases here.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <article key={order._id} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-card dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                      Order #{order._id?.slice(-6).toUpperCase()}
                    </span>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${STATUS_STYLES[order.status] || STATUS_STYLES.pending}`}>
                      {order.status || "pending"}
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-zinc-500">Placed on {new Date(order.createdAt).toLocaleDateString()}</p>
                </div>
                <div className="text-left lg:text-right">
                  <p className="text-sm text-zinc-500">Total</p>
                  <p className="text-xl font-semibold text-zinc-900 dark:text-white">{formatPrice(order.totalAmount || 0)}</p>
                </div>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-3">
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-800/50">
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-white">
                    <ReceiptText size={15} className="text-gold" /> Items
                  </div>
                  <p className="text-sm text-zinc-600 dark:text-zinc-300">{order.items?.length || 0} item(s)</p>
                </div>
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-800/50">
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-white">
                    <CreditCard size={15} className="text-gold" /> Payment
                  </div>
                  <p className="text-sm capitalize text-zinc-600 dark:text-zinc-300">{order.paymentMethod || "cod"}</p>
                </div>
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-800/50">
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-white">
                    <Clock3 size={15} className="text-gold" /> Update
                  </div>
                  <p className="text-sm text-zinc-600 dark:text-zinc-300">{order.updatedAt ? new Date(order.updatedAt).toLocaleDateString() : "—"}</p>
                </div>
              </div>

              <div className="mt-5 rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-800/50">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-white">
                  <MapPin size={15} className="text-gold" /> Shipping address
                </div>
                <p className="text-sm text-zinc-600 dark:text-zinc-300">
                  {order.shippingAddress?.fullName || "Customer"} — {order.shippingAddress?.line1 || ""}, {order.shippingAddress?.city || ""}, {order.shippingAddress?.country || ""}
                </p>
              </div>

              <div className="mt-5 space-y-2">
                {(order.items || []).map((item, index) => (
                  <div key={`${item.product_id || item._id || index}`} className="flex items-center justify-between rounded-xl border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800">
                    <div>
                      <p className="font-medium text-zinc-900 dark:text-white">{item.name}</p>
                      <p className="text-xs text-zinc-500">Qty {item.quantity || 1}</p>
                    </div>
                    <p className="font-semibold text-zinc-900 dark:text-white">{formatPrice((item.price || 0) * (item.quantity || 1))}</p>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
