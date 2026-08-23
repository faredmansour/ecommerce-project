import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Package, MapPin, ShieldCheck, UserCircle2, ArrowRight } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { addressesAPI, ordersAPI } from "../services/api";
import { formatPrice } from "../lib/format";

export default function AccountPage() {
  const navigate = useNavigate();
  const { user, isAuthenticated, logout } = useAuth();
  const [orders, setOrders] = useState([]);
  const [addresses, setAddresses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate("/login");
      return;
    }

    Promise.all([ordersAPI.getAll().catch(() => ({ data: { data: [] } })), addressesAPI.getAll().catch(() => ({ data: { data: [] } }))])
      .then(([ordersRes, addressesRes]) => {
        setOrders(ordersRes.data.data || []);
        setAddresses(addressesRes.data.data || []);
      })
      .finally(() => setLoading(false));
  }, [isAuthenticated, navigate]);

  const totalSpend = orders.reduce((sum, order) => sum + (order.totalAmount || 0), 0);

  if (loading) {
    return <div className="mx-auto max-w-6xl px-4 py-16 text-center text-zinc-500">Loading account...</div>;
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 rounded-3xl border border-zinc-200 bg-white p-6 shadow-card dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gold/15 text-gold">
              <UserCircle2 size={28} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-gold">Account</p>
              <h1 className="font-display text-2xl font-extrabold text-zinc-900 dark:text-white">{user?.name || "Welcome"}</h1>
              <p className="text-sm text-zinc-500">{user?.email}</p>
            </div>
          </div>
          <button
            onClick={() => logout()}
            className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:border-gold hover:text-gold dark:border-zinc-700 dark:text-zinc-200"
          >
            Sign out
          </button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-card dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-xl font-bold text-zinc-900 dark:text-white">Quick overview</h2>
                <p className="text-sm text-zinc-500">A snapshot of your shopping activity.</p>
              </div>
              <span className="rounded-full bg-gold/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-gold">Member</span>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-800/50">
                <p className="text-sm text-zinc-500">Orders</p>
                <p className="mt-1 text-xl font-semibold text-zinc-900 dark:text-white">{orders.length}</p>
              </div>
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-800/50">
                <p className="text-sm text-zinc-500">Saved addresses</p>
                <p className="mt-1 text-xl font-semibold text-zinc-900 dark:text-white">{addresses.length}</p>
              </div>
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-800/50">
                <p className="text-sm text-zinc-500">Spent</p>
                <p className="mt-1 text-xl font-semibold text-zinc-900 dark:text-white">{formatPrice(totalSpend)}</p>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-card dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-xl font-bold text-zinc-900 dark:text-white">Recent orders</h2>
                <p className="text-sm text-zinc-500">Your latest purchases and their status.</p>
              </div>
              <Link to="/orders" className="inline-flex items-center gap-2 text-sm font-semibold text-gold">
                View all <ArrowRight size={15} />
              </Link>
            </div>
            <div className="mt-5 space-y-3">
              {orders.slice(0, 3).map((order) => (
                <div key={order._id} className="flex items-center justify-between rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-800/50">
                  <div>
                    <p className="text-sm font-semibold text-zinc-900 dark:text-white">#{order._id?.slice(-6).toUpperCase()}</p>
                    <p className="text-xs text-zinc-500">{order.status || "pending"}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-zinc-900 dark:text-white">{formatPrice(order.totalAmount || 0)}</p>
                    <p className="text-xs text-zinc-500">{new Date(order.createdAt).toLocaleDateString()}</p>
                  </div>
                </div>
              ))}
              {orders.length === 0 && <p className="text-sm text-zinc-500">No orders yet.</p>}
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-card dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center gap-2">
              <MapPin size={18} className="text-gold" />
              <h2 className="font-display text-xl font-bold text-zinc-900 dark:text-white">Saved addresses</h2>
            </div>
            <div className="mt-5 space-y-3">
              {addresses.length === 0 ? (
                <p className="text-sm text-zinc-500">No addresses saved yet.</p>
              ) : (
                addresses.map((address) => (
                  <div key={address._id} className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-800/50">
                    <p className="text-sm font-semibold text-zinc-900 dark:text-white">{address.fullName}</p>
                    <p className="text-sm text-zinc-600 dark:text-zinc-300">{address.line1}, {address.city}, {address.country}</p>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-card dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center gap-2">
              <ShieldCheck size={18} className="text-gold" />
              <h2 className="font-display text-xl font-bold text-zinc-900 dark:text-white">Security & support</h2>
            </div>
            <div className="mt-5 space-y-3 text-sm text-zinc-600 dark:text-zinc-300">
              <div className="flex items-center justify-between rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-3 dark:border-zinc-800 dark:bg-zinc-800/50">
                <span>Protected account</span>
                <span className="font-semibold text-green-600">Active</span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-3 dark:border-zinc-800 dark:bg-zinc-800/50">
                <span>Support response</span>
                <span className="font-semibold text-zinc-900 dark:text-white">24/7</span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
