import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { productsAPI, categoriesAPI, ordersAPI } from "./../services/api";
import { Tag, Box, ShoppingBag, Users } from "lucide-react";
import { formatPrice } from "../lib/format";

const STATUS_STYLES = {
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
  shipped: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
  delivered: "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400",
};

export default function AdminDashboard() {
  const [summary, setSummary] = useState({ products: 0, categories: 0, orders: 0, revenue: 0 });
  const [recentOrders, setRecentOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([productsAPI.getAll(), categoriesAPI.getAllRaw(), ordersAPI.getAll()])
      .then(([productsRes, categoriesRes, ordersRes]) => {
        const orders = Array.isArray(ordersRes.data?.data) ? ordersRes.data.data : Array.isArray(ordersRes.data) ? ordersRes.data : [];
        setSummary({
          products: productsRes.data.length,
          categories: Array.isArray(categoriesRes.data) ? categoriesRes.data.length : 0,
          orders: orders.length,
          revenue: orders.reduce((s, o) => s + (o.totalAmount || 0), 0),
        });
        setRecentOrders(orders.slice(0, 5));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="max-w-7xl mx-auto px-4 py-16 text-center text-zinc-500">Loading dashboard…</div>;
  }

  const stats = [
    { icon: Box, label: "Products", value: summary.products },
    { icon: Tag, label: "Categories", value: summary.categories },
    { icon: ShoppingBag, label: "Orders", value: summary.orders },
    { icon: Users, label: "Revenue", value: formatPrice(summary.revenue) },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-gold font-semibold">Admin Dashboard</p>
          <h1 className="font-display text-3xl font-extrabold text-zinc-900 dark:text-white">Store overview</h1>
          <p className="mt-1 text-zinc-500">Products, categories, orders and revenue at a glance.</p>
        </div>
        <Link to="/category" className="inline-flex items-center gap-2 rounded-full bg-brand text-brand-fg px-5 py-3 text-sm font-semibold hover:opacity-90 transition">
          View Store
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map(({ icon: Icon, label, value }) => (
          <div key={label} className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-card">
            <div className="flex items-center gap-2.5 text-gold mb-4">
              <span className="grid place-items-center h-9 w-9 rounded-lg bg-gold/15"><Icon size={18} /></span>
              <span className="text-sm font-medium text-zinc-600 dark:text-zinc-300">{label}</span>
            </div>
            <p className="text-3xl font-extrabold text-zinc-900 dark:text-white nums">{value}</p>
          </div>
        ))}
      </div>

      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-card">
        <div className="flex items-center justify-between gap-4 mb-5">
          <div>
            <h2 className="font-display text-xl font-bold text-zinc-900 dark:text-white">Recent Orders</h2>
            <p className="text-sm text-zinc-500">Latest activity from your customers.</p>
          </div>
        </div>

        {recentOrders.length === 0 ? (
          <p className="text-zinc-500">No orders available yet.</p>
        ) : (
          <div className="space-y-3">
            {recentOrders.map((order) => (
              <div key={order._id} className="rounded-xl border border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-zinc-500 font-mono truncate">#{order._id}</p>
                  <p className="text-sm text-zinc-600 dark:text-zinc-300">{order.user?.name || "Customer"} · {order.items?.length || 0} items</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${STATUS_STYLES[order.status] || STATUS_STYLES.pending}`}>
                    {order.status || "pending"}
                  </span>
                  <span className="text-sm font-bold text-zinc-900 dark:text-white nums">{formatPrice(order.totalAmount || 0)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
