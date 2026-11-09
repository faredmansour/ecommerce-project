import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, ChevronDown, ChevronUp, CreditCard, MapPin, Package, RefreshCw, ReceiptText } from "lucide-react";
import { ordersAPI } from "../services/api";
import { formatCurrency } from "../lib/format";

const ORDER_STATUS_STYLES = {
  pending: "border-state-warning-border bg-state-warning-bg text-state-warning",
  pending_payment: "border-state-warning-border bg-state-warning-bg text-state-warning",
  paid: "border-state-success-border bg-state-success-bg text-state-success",
  shipped: "border-state-info-border bg-state-info-bg text-state-info",
  delivered: "border-state-success-border bg-state-success-bg text-state-success",
  failed: "border-state-danger-border bg-state-danger-bg text-state-danger",
  cancelled: "border-state-danger-border bg-state-danger-bg text-state-danger",
};

function formatAmount(order) {
  const snapshot = order.commercialSnapshot;
  const currency = snapshot?.currency;
  if (Number.isFinite(snapshot?.grandTotalMinor) && currency) {
    return formatCurrency(snapshot.grandTotalMinor / 100, currency);
  }
  if (currency && Number.isFinite(Number(order.totalAmount))) {
    return formatCurrency(Number(order.totalAmount), currency);
  }
  return "Total unavailable";
}

function paymentStatus(order) {
  if (order.status === "failed") return "Payment failed";
  if (order.status === "cancelled") return "Payment cancelled";
  if (order.paymentMethod === "cod") {
    return order.status === "paid" ? "Payment confirmed" : "Due on delivery";
  }
  if (order.status === "paid" || order.status === "shipped" || order.status === "delivered") return "Payment successful";
  return "Payment pending";
}

function formatItemAmount(item, currency) {
  if (Number.isFinite(item.lineTotalMinor) && currency) {
    return formatCurrency(item.lineTotalMinor / 100, currency);
  }
  if (currency && Number.isFinite(Number(item.price))) {
    return formatCurrency(Number(item.price) * (item.quantity || 1), currency);
  }
  return "—";
}

function OrderDetails({ order, loading, error, onRetry }) {
  const currency = order.commercialSnapshot?.currency;
  const totals = order.commercialSnapshot;

  return (
    <div className="mt-5 border-t border-line pt-4">
      {loading ? (
        <p role="status" className="text-sm text-muted">Loading full order details…</p>
      ) : error ? (
        <div role="alert" className="rounded-sm border border-state-danger-border bg-state-danger-bg p-3 text-sm text-state-danger">
          <p>{error}</p>
          <button type="button" onClick={onRetry} className="mt-3 inline-flex min-h-9 items-center gap-2 font-semibold underline">
            <RefreshCw size={14} /> Retry
          </button>
        </div>
      ) : (
        <>
          <h3 className="mb-3 font-semibold text-ink dark:text-white">Order details</h3>
          <div className="space-y-3">
            {(order.items || []).map((item, index) => (
              <div key={`${item.product_id || item._id || index}`} className="flex items-start justify-between gap-4 border-t border-line pt-3 first:border-0 first:pt-0">
                <div>
                  <p className="font-medium text-ink dark:text-white">{item.name || "Product"}</p>
                  <p className="text-sm text-muted">Quantity: {item.quantity || 1}</p>
                </div>
                <p className="shrink-0 text-sm font-semibold text-ink nums dark:text-white">{formatItemAmount(item, currency)}</p>
              </div>
            ))}
          </div>

          {totals && (
            <dl className="mt-4 space-y-2 border-t border-line pt-3 text-sm">
              <div className="flex justify-between gap-4"><dt className="text-muted">Subtotal</dt><dd>{Number.isFinite(totals.subtotalMinor) ? formatCurrency(totals.subtotalMinor / 100, currency) : "—"}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-muted">Discount</dt><dd>{Number.isFinite(totals.discountMinor) ? formatCurrency(totals.discountMinor / 100, currency) : "—"}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-muted">Shipping</dt><dd>{Number.isFinite(totals.shippingMinor) ? formatCurrency(totals.shippingMinor / 100, currency) : "—"}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-muted">Tax</dt><dd>{Number.isFinite(totals.taxMinor) ? formatCurrency(totals.taxMinor / 100, currency) : "—"}</dd></div>
              <div className="flex justify-between gap-4 border-t border-line pt-2 font-semibold text-ink dark:text-white"><dt>Total</dt><dd>{formatAmount(order)}</dd></div>
            </dl>
          )}

          {order.shippingAddress && (
            <div className="mt-4 border-t border-line pt-3">
              <div className="mb-1 flex items-center gap-2 font-semibold text-ink dark:text-white"><MapPin size={15} /> Shipping address</div>
              <p className="text-sm text-muted">
                {[order.shippingAddress.fullName, order.shippingAddress.line1, order.shippingAddress.line2, order.shippingAddress.city, order.shippingAddress.state, order.shippingAddress.country, order.shippingAddress.postalCode]
                  .filter(Boolean)
                  .join(", ")}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function OrdersPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [expandedOrderId, setExpandedOrderId] = useState("");
  const [details, setDetails] = useState({});

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await ordersAPI.getAll();
      const result = response.data.data;
      if (!Array.isArray(result)) throw new Error("The orders response was invalid.");
      setOrders(result);
    } catch (requestError) {
      setError(requestError.response?.data?.message || requestError.message || "Could not load your orders.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();
  }, [loadOrders, refreshKey]);

  const toggleDetails = async (orderId) => {
    if (expandedOrderId === orderId) {
      setExpandedOrderId("");
      return;
    }
    setExpandedOrderId(orderId);
    if (details[orderId]?.order || details[orderId]?.loading) return;

    setDetails((current) => ({ ...current, [orderId]: { loading: true, error: "" } }));
    try {
      const response = await ordersAPI.getById(orderId);
      if (!response.data.data) throw new Error("Order details were not returned.");
      setDetails((current) => ({ ...current, [orderId]: { order: response.data.data, loading: false, error: "" } }));
    } catch (requestError) {
      setDetails((current) => ({
        ...current,
        [orderId]: {
          loading: false,
          error: requestError.response?.data?.message || requestError.message || "Could not load order details.",
        },
      }));
    }
  };

  const retryDetails = async (orderId) => {
    setDetails((current) => ({ ...current, [orderId]: { loading: true, error: "" } }));
    try {
      const response = await ordersAPI.getById(orderId);
      if (!response.data.data) throw new Error("Order details were not returned.");
      setDetails((current) => ({ ...current, [orderId]: { order: response.data.data, loading: false, error: "" } }));
    } catch (requestError) {
      setDetails((current) => ({
        ...current,
        [orderId]: { loading: false, error: requestError.response?.data?.message || requestError.message || "Could not load order details." },
      }));
    }
  };

  return (
    <div className="mx-auto max-w-content px-4 py-6 sm:py-8">
      <header className="mb-6 flex flex-col gap-4 border-b border-line pb-5 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand">My Orders</p>
          <h1 className="mt-1 font-display text-2xl font-bold text-ink dark:text-white">Your order history</h1>
          <p className="mt-2 text-sm text-muted">Review order items, totals, and server-confirmed status.</p>
        </div>
        <button type="button" onClick={() => setRefreshKey((key) => key + 1)} disabled={loading} className="inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-md border border-line px-4 font-semibold text-ink disabled:opacity-60 dark:text-white sm:self-auto">
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </header>

      {loading ? (
        <p role="status" className="py-12 text-center text-muted">Loading your orders…</p>
      ) : error ? (
        <div role="alert" className="rounded-md border border-state-danger-border bg-state-danger-bg p-5 text-state-danger">
          <p>{error}</p>
          <button type="button" onClick={() => setRefreshKey((key) => key + 1)} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-md border border-current px-4 font-semibold">
            <RefreshCw size={16} /> Retry
          </button>
        </div>
      ) : orders.length === 0 ? (
        <div className="border border-dashed border-line bg-surface px-5 py-12 text-center text-muted">
          <Package size={32} className="mx-auto mb-3 text-brand" />
          <p className="text-lg font-semibold text-ink dark:text-white">No orders yet</p>
          <p className="mt-2">Start shopping to see your purchases here.</p>
          <Link to="/category" className="mt-5 inline-flex min-h-11 items-center rounded-md bg-brand px-5 font-semibold text-brand-fg">Continue shopping</Link>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => {
            const detailState = details[order._id] || {};
            const isExpanded = expandedOrderId === order._id;
            const statusClass = ORDER_STATUS_STYLES[order.status] || "border-line bg-surface-muted text-muted";
            return (
              <article key={order._id} className="rounded-md border border-line bg-surface p-4 sm:p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-sm bg-surface-muted px-2.5 py-1 font-mono text-xs font-semibold text-muted">
                        #{order._id?.slice(-8).toUpperCase()}
                      </span>
                      <span className={`rounded-sm border px-2.5 py-1 text-xs font-semibold capitalize ${statusClass}`}>
                        {(order.status || "unknown").replaceAll("_", " ")}
                      </span>
                    </div>
                    <p className="mt-3 flex items-center gap-2 text-sm text-muted">
                      <CalendarDays size={15} /> {order.createdAt ? new Date(order.createdAt).toLocaleString() : "Date unavailable"}
                    </p>
                  </div>
                  <div className="sm:text-right">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">Server total</p>
                    <p className="mt-1 text-lg font-semibold text-ink nums dark:text-white">{formatAmount(order)}</p>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-3">
                  <div>
                    <p className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted"><ReceiptText size={14} /> Items</p>
                    <p className="text-sm text-ink dark:text-white">{order.items?.length || 0} item(s)</p>
                  </div>
                  <div>
                    <p className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted"><CreditCard size={14} /> Payment method</p>
                    <p className="text-sm capitalize text-ink dark:text-white">{order.paymentMethod || "Unavailable"}</p>
                    <p className="mt-1 text-sm text-muted">{paymentStatus(order)}</p>
                  </div>
                  <div>
                    <p className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted"><MapPin size={14} /> Delivery</p>
                    <p className="text-sm text-muted">{order.shippingAddress?.city || "Address details available in order"}</p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-3 border-t border-line pt-4">
                  <button type="button" aria-expanded={isExpanded} onClick={() => toggleDetails(order._id)} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-line px-4 text-sm font-semibold text-ink hover:border-brand hover:text-brand dark:text-white">
                    {isExpanded ? "Hide details" : "View details"}
                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                  <Link to={`/order-success/${order._id}`} className="inline-flex min-h-10 items-center rounded-md px-2 text-sm font-semibold text-brand hover:underline">
                    Order status
                  </Link>
                </div>

                {isExpanded && (
                  <OrderDetails
                    order={detailState.order || order}
                    loading={detailState.loading}
                    error={detailState.error}
                    onRetry={() => retryDetails(order._id)}
                  />
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
