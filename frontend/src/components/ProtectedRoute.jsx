import { Link, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";

export default function ProtectedRoute({ children, adminOnly = false, requireCartSync = false }) {
  const { user, isAdmin, loading } = useAuth();
  const { mergeStatus, syncError, retryMerge } = useCart();
  const location = useLocation();

  if (loading) {
    return <div role="status" className="mx-auto max-w-7xl px-4 py-16 text-center text-muted">Checking your account…</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (adminOnly && !isAdmin()) {
    return <Navigate to="/" replace />;
  }

  if (requireCartSync && mergeStatus !== "ready") {
    if (mergeStatus === "failed") {
      return (
        <div className="mx-auto max-w-2xl px-4 py-16 text-center">
          <p role="alert" className="mb-4 text-sm text-red-700">{syncError || "Your saved cart could not be synchronized. Your guest items are still saved; retry before checkout."}</p>
          <button type="button" onClick={retryMerge} className="rounded-lg bg-brand px-5 py-3 text-sm font-semibold text-brand-fg">
            Retry cart synchronization
          </button>
          <Link to="/cart" className="ml-4 text-sm font-semibold underline">Review saved cart</Link>
        </div>
      );
    }
    return <div role="status" className="mx-auto max-w-7xl px-4 py-16 text-center text-muted">Synchronizing your cart before checkout…</div>;
  }

  return children;
}
