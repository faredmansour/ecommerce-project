import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import { ordersAPI } from "../services/api";

export default function OrderSuccessPage() {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    ordersAPI
      .getById(id)
      .then((res) => setOrder(res.data.data))
      .catch(() => setOrder(null))
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <div className="max-w-2xl mx-auto px-4 py-16 text-center">
      <CheckCircle2 size={64} className="text-green-500 mx-auto mb-4" />
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Thank you for your order!</h1>
      <p className="text-gray-500 dark:text-gray-400 mb-6">
        Your order has been placed successfully.
      </p>

      {loading ? (
        <p className="text-gray-400">Loading order details…</p>
      ) : order ? (
        <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-lg p-6 text-left inline-block mx-auto">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Order ID: <span className="font-mono text-gray-900 dark:text-white">{order._id}</span>
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Status: <span className="font-medium text-gold capitalize">{order.status}</span>
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Payment: <span className="font-medium">{order.paymentMethod}</span>
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Items: <span className="font-medium">{order.items?.length || 0}</span>
          </p>
        </div>
      ) : (
        <p className="text-gray-400">Order placed. (Details unavailable.)</p>
      )}

      <div className="mt-8">
        <Link
          to="/home"
          className="inline-flex items-center gap-2 bg-brand text-brand-fg px-6 py-3 rounded-full font-semibold hover:opacity-90 transition"
        >
          Continue Shopping
        </Link>
      </div>
    </div>
  );
}
