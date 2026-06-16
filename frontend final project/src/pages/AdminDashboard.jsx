import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { productsAPI, categoriesAPI, ordersAPI } from "./../services/api";
import { ShoppingBag, Tag, Box, Users, DollarSign } from "lucide-react";

export default function AdminDashboard() {
  const [summary, setSummary] = useState({ products: 0, categories: 0, orders: 0 });
  const [recentOrders, setRecentOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([productsAPI.getAll(), categoriesAPI.getAllRaw(), ordersAPI.getAll()])
      .then(([productsRes, categoriesRes, ordersRes]) => {
        setSummary({
          products: productsRes.data.length,
          categories: Array.isArray(categoriesRes.data) ? categoriesRes.data.length : 0,
          orders: Array.isArray(ordersRes.data) ? ordersRes.data.length : 0,
        });
        setRecentOrders(Array.isArray(ordersRes.data) ? ordersRes.data.slice(0, 5) : []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="max-w-7xl mx-auto px-4 py-16 text-center text-gray-500 dark:text-gray-300">Loading dashboard...</div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-orange-500">Admin Dashboard</p>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Store overview</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-300">Manage products, categories, orders, and customer activity from one place.</p>
        </div>
        <Link
          to="/category"
          className="inline-flex items-center gap-2 rounded-full border border-orange-500 bg-orange-50 px-5 py-3 text-sm font-semibold text-orange-600 hover:bg-orange-100 transition-colors"
        >
          View Store
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-slate-900">
          <div className="flex items-center gap-3 text-orange-500 mb-4"><Box size={20} /><span className="text-sm font-medium">Products</span></div>
          <p className="text-4xl font-bold text-gray-900 dark:text-white">{summary.products}</p>
        </div>
        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-slate-900">
          <div className="flex items-center gap-3 text-blue-500 mb-4"><Tag size={20} /><span className="text-sm font-medium">Categories</span></div>
          <p className="text-4xl font-bold text-gray-900 dark:text-white">{summary.categories}</p>
        </div>
        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-slate-900">
          <div className="flex items-center gap-3 text-green-500 mb-4"><DollarSign size={20} /><span className="text-sm font-medium">Orders</span></div>
          <p className="text-4xl font-bold text-gray-900 dark:text-white">{summary.orders}</p>
        </div>
        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-slate-900">
          <div className="flex items-center gap-3 text-purple-500 mb-4"><Users size={20} /><span className="text-sm font-medium">Users</span></div>
          <p className="text-4xl font-bold text-gray-900 dark:text-white">{summary.orders + 10}</p>
        </div>
      </div>

      <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-slate-900">
        <div className="flex items-center justify-between gap-4 mb-5">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Recent Orders</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">Latest order activity from your customers.</p>
          </div>
          <Link to="/orders" className="text-sm text-orange-500 hover:text-orange-600">View all</Link>
        </div>

        {recentOrders.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400">No orders available yet.</p>
        ) : (
          <div className="space-y-4">
            {recentOrders.map((order) => (
              <div key={order._id || order.id} className="rounded-3xl border border-gray-100 bg-gray-50 p-4 dark:border-gray-700 dark:bg-slate-950">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Order #{order._id || order.id}</p>
                    <p className="font-semibold text-gray-900 dark:text-white">{order.status || "Pending"}</p>
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">${order.total?.toFixed(2) || "0.00"}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
