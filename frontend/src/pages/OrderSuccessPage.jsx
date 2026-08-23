import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { CheckCircle2, PackageCheck, ArrowRight } from "lucide-react";
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
    <div className="max-w-3xl mx-auto px-4 py-16 text-center">
      <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-600 dark:bg-green-950/30 dark:text-green-400">
        <CheckCircle2 size={36} />
      </div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Thank you for your order!</h1>
      <p className="text-gray-500 dark:text-gray-400 mb-6">
        Your order has been placed successfully and is now being prepared for shipment.
      </p>

      {loading ? (
        <p className="text-gray-400">Loading order details…</p>
      ) : order ? (
        <div className="mx-auto max-w-xl rounded-2xl border border-gray-200 bg-white p-6 text-left shadow-card dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex items-center gap-2 text-gold">
            <PackageCheck size={18} />
            <span className="text-sm font-semibold uppercase tracking-wide">Order received</span>
          </div>
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

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link
          to="/orders"
          className="inline-flex items-center gap-2 bg-brand text-brand-fg px-6 py-3 rounded-full font-semibold hover:opacity-90 transition"
        >
          View Orders <ArrowRight size={16} />
        </Link>
        <Link
          to="/home"
          className="inline-flex items-center gap-2 rounded-full border border-zinc-300 px-6 py-3 font-semibold text-zinc-700 transition hover:border-gold hover:text-gold dark:border-zinc-700 dark:text-zinc-200"
        >
          Continue Shopping
        </Link>
      </div>
    </div>
  );
}
