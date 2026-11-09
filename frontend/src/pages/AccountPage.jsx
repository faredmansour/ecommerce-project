import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Package, MapPin, UserCircle2, ArrowRight } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { addressesAPI, ordersAPI } from "../services/api";
import { formatPrice } from "../lib/format";
import GoogleSignInButton from "../components/GoogleSignInButton";
import AppleSignInButton from "../components/AppleSignInButton";

export default function AccountPage() {
  const navigate = useNavigate();
  const location = useLocation();
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
  const providerError = new URLSearchParams(location.search).get("providerError");
  const providerErrorMessage = {
    identity_already_linked: "This Google account is already linked to another customer account.",
    link_email_mismatch: "The verified Google email must match this account before linking.",
    google_failed: "Google account linking could not be completed. Please try again.",
    apple_identity_already_linked: "This Apple account is already linked to another customer account.",
    apple_link_email_mismatch: "The verified Apple email must match this account before linking.",
    apple_failed: "Apple account linking could not be completed. Please try again.",
  }[providerError];

  if (loading) {
    return <div role="status" className="mx-auto max-w-content px-4 py-16 text-center text-muted">Loading account…</div>;
  }

  return (
    <div className="mx-auto max-w-content px-4 py-6 sm:py-8">
      <div className="mb-6 border-b border-line pb-5 sm:mb-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <div className="grid h-12 w-12 place-items-center rounded-md bg-brand-soft text-brand">
              <UserCircle2 size={32} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-brand">Account</p>
              <h1 className="font-display text-2xl font-bold text-ink dark:text-white">{user?.name || "Welcome"}</h1>
              <p className="text-sm text-muted">{user?.email}</p>
            </div>
          </div>
          <button
            onClick={() => logout()}
            className="min-h-11 rounded-md border border-line px-4 py-2 text-sm font-semibold text-ink transition-colors duration-200 hover:border-brand hover:text-brand dark:text-white"
          >
            Sign out
          </button>
        </div>
      </div>

      {providerErrorMessage && <p role="alert" className="mb-6 rounded-lg border border-state-danger-border bg-state-danger-bg p-4 text-sm text-state-danger">{providerErrorMessage}</p>}

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          {!user?.authProviders?.google && import.meta.env.VITE_GOOGLE_CLIENT_ID && (
            <section className="rounded-md border border-line bg-surface p-5 sm:p-6">
              <h2 className="font-display text-lg font-bold text-ink dark:text-white">Sign-in methods</h2>
              <p className="mt-1 text-sm text-muted">Link Google after signing in to this account. The verified Google email must match your account email.</p>
              <GoogleSignInButton mode="link" returnTo="/account" />
            </section>
          )}
          {!user?.authProviders?.apple && (
            <section className="rounded-md border border-line bg-surface p-5 sm:p-6">
              <h2 className="font-display text-lg font-bold text-ink dark:text-white">Apple sign-in</h2>
              <p className="mt-1 text-sm text-muted">Link Apple after signing in to this account. The verified Apple email must match your account email.</p>
              <AppleSignInButton mode="link" returnTo="/account" />
            </section>
          )}
          <section className="border-y border-line py-5 sm:py-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-bold text-ink dark:text-white">Quick overview</h2>
                <p className="text-sm text-muted">A snapshot of your shopping activity.</p>
              </div>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="border-l-2 border-brand pl-3 py-2">
                <p className="text-sm text-muted">Orders</p>
                <p className="mt-1 text-xl font-semibold text-ink dark:text-white">{orders.length}</p>
              </div>
              <div className="border-l-2 border-line pl-3 py-2">
                <p className="text-sm text-muted">Saved addresses</p>
                <p className="mt-1 text-xl font-semibold text-ink dark:text-white">{addresses.length}</p>
              </div>
              <div className="border-l-2 border-line pl-3 py-2">
                <p className="text-sm text-muted">Spent</p>
                <p className="mt-1 text-xl font-semibold text-ink nums dark:text-white">{formatPrice(totalSpend)}</p>
              </div>
            </div>
          </section>

          <section className="border-b border-line pb-5 sm:pb-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-bold text-ink dark:text-white">Recent orders</h2>
                <p className="text-sm text-muted">Your latest purchases and their status.</p>
              </div>
              <Link to="/orders" className="inline-flex items-center gap-2 text-sm font-semibold text-brand">
                View all <ArrowRight size={16} />
              </Link>
            </div>
            <div className="mt-5 space-y-3">
              {orders.slice(0, 3).map((order) => (
                <div key={order._id} className="flex items-center justify-between gap-4 border-t border-line py-3 first:border-0">
                  <div>
                    <p className="text-sm font-semibold text-ink dark:text-white">#{order._id?.slice(-6).toUpperCase()}</p>
                    <p className="text-xs capitalize text-muted">{order.status || "pending"}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-ink nums dark:text-white">{formatPrice(order.totalAmount || 0)}</p>
                    <p className="text-xs text-muted">{new Date(order.createdAt).toLocaleDateString()}</p>
                  </div>
                </div>
              ))}
              {orders.length === 0 && <p className="border-t border-line pt-3 text-sm text-muted">No orders yet.</p>}
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="border-b border-line pb-5 sm:pb-6">
            <div className="flex items-center gap-2">
              <MapPin size={18} className="text-brand" />
              <h2 className="font-display text-lg font-bold text-ink dark:text-white">Saved addresses</h2>
            </div>
            <div className="mt-5 space-y-3">
              {addresses.length === 0 ? (
                <p className="border-t border-line pt-3 text-sm text-muted">No addresses saved yet.</p>
              ) : (
                addresses.map((address) => (
                  <div key={address._id} className="border-t border-line py-3 first:border-0">
                    <p className="text-sm font-semibold text-ink dark:text-white">{address.fullName}</p>
                    <p className="text-sm text-muted">{address.line1}, {address.city}, {address.country}</p>
                  </div>
                ))
              )}
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}
