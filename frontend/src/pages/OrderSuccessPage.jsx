import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowRight, CheckCircle2, CircleAlert, Clock3, PackageCheck, RefreshCw } from "lucide-react";
import { ordersAPI, paymentsAPI } from "../services/api";
import CheckoutProgress from "../components/CheckoutProgress";
import { formatCurrency } from "../lib/format";

const TERMINAL_ORDER_STATUSES = new Set(["paid", "failed", "cancelled", "shipped", "delivered"]);
const TERMINAL_PAYMENT_STATUSES = new Set(["captured", "failed", "cancelled"]);

function paymentLabel(order, payment) {
  if (payment?.status === "captured" || order.status === "paid") return "Payment successful";
  if (payment?.status === "failed" || order.status === "failed") return "Payment failed";
  if (payment?.status === "cancelled" || order.status === "cancelled") return "Payment cancelled";
  if (order.paymentMethod === "cod") return "Due on delivery";
  if (payment?.status === "authorized") return "Authorized; capture pending";
  if (payment?.status === "requires_action") return "Additional action required";
  return "Payment confirmation pending";
}

function displayAmount(minorAmount, legacyAmount, currency) {
  if (Number.isFinite(minorAmount)) return formatCurrency(minorAmount / 100, currency);
  if (Number.isFinite(Number(legacyAmount))) return formatCurrency(Number(legacyAmount), currency);
  return "—";
}

export default function OrderSuccessPage() {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [payment, setPayment] = useState(null);
  const [paymentError, setPaymentError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    let timer;
    let hasAttemptedLoad = false;

    const loadOrderStatus = async () => {
      if (active) {
        setError("");
        if (!hasAttemptedLoad) setLoading(true);
        else setRefreshing(true);
        hasAttemptedLoad = true;
      }

      let receivedOrder = null;
      let receivedPayment = null;
      let paymentLookupFailed = "";

      try {
        const orderResponse = await ordersAPI.getById(id);
        receivedOrder = orderResponse.data.data;
        if (!receivedOrder) throw new Error("The order details were not returned.");

        let paymentId = "";
        try {
          paymentId = window.sessionStorage.getItem(`alfredo:payment:${id}`) || "";
        } catch {
          paymentLookupFailed = "Payment details are unavailable in this browser session.";
        }

        if (paymentId) {
          try {
            const paymentResponse = await paymentsAPI.getById(paymentId);
            const candidate = paymentResponse.data.data;
            if (candidate?.orderId !== receivedOrder._id) {
              throw new Error("The payment record does not match this order.");
            }
            receivedPayment = candidate;
          } catch (requestError) {
            paymentLookupFailed = requestError.response?.data?.message
              || requestError.message
              || "Could not verify payment status.";
          }
        }

        if (active) {
          setOrder(receivedOrder);
          setPayment(receivedPayment);
          setPaymentError(paymentLookupFailed);
        }
      } catch (requestError) {
        if (active) setError(requestError.response?.data?.message || requestError.message || "Could not load this order.");
      } finally {
        if (active) {
          setLoading(false);
          setRefreshing(false);
        }
      }

      if (!active || !receivedOrder || receivedOrder.paymentMethod === "cod") return;
      const orderIsFinal = TERMINAL_ORDER_STATUSES.has(receivedOrder.status);
      const paymentIsFinal = receivedPayment && TERMINAL_PAYMENT_STATUSES.has(receivedPayment.status);
      if (!orderIsFinal && !paymentIsFinal) {
        timer = window.setTimeout(loadOrderStatus, 3000);
      }
    };

    loadOrderStatus();
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [id, refreshKey]);

  const currency = order?.commercialSnapshot?.currency;
  const totals = order?.commercialSnapshot;
  const paid = payment?.status === "captured" || order?.status === "paid";
  const paymentFailed = payment?.status === "failed" || order?.status === "failed";
  const paymentCancelled = payment?.status === "cancelled" || order?.status === "cancelled";

  return (
    <div className="mx-auto max-w-content px-4 py-8 sm:py-12">
      <CheckoutProgress currentStep={5} />
      <div className="mx-auto mt-8 max-w-3xl">
        <div className="mb-6 text-center">
          <div className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full ${paid ? "bg-state-success-bg text-state-success" : "bg-surface-muted text-brand"}`}>
            {paid ? <CheckCircle2 size={30} /> : paymentFailed || paymentCancelled ? <CircleAlert size={30} /> : <Clock3 size={30} />}
          </div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand">Order update</p>
          <h1 className="mt-2 font-display text-2xl font-bold text-ink dark:text-white sm:text-3xl">
            {paid ? "Payment confirmed" : paymentFailed ? "Payment failed" : paymentCancelled ? "Payment cancelled" : "Order received"}
          </h1>
          <p className="mt-2 text-sm text-muted">
            {paid
              ? "Your payment was confirmed by the server."
              : "Order creation and payment confirmation are shown separately below."}
          </p>
        </div>

        {loading ? (
          <p role="status" className="py-8 text-center text-muted">Loading order details…</p>
        ) : error ? (
          <div role="alert" className="rounded-md border border-state-danger-border bg-state-danger-bg p-5 text-state-danger">
            <p>{error}</p>
            <button type="button" onClick={() => setRefreshKey((key) => key + 1)} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-md border border-current px-4 font-semibold">
              <RefreshCw size={16} /> Retry
            </button>
          </div>
        ) : order ? (
          <section aria-label="Order details" className="order-confirmation-card rounded-lg border border-line bg-surface p-5 sm:p-6">
            <div className="flex flex-col gap-3 border-b border-line pb-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex items-center gap-2 text-brand">
                  <PackageCheck size={18} />
                  <h2 className="text-sm font-semibold uppercase tracking-wide">Order created</h2>
                </div>
                <p className="mt-2 break-all font-mono text-sm text-muted">{order._id}</p>
              </div>
              <div className="flex items-center gap-2 self-start rounded-sm bg-surface-muted px-3 py-1.5 text-sm font-semibold capitalize text-ink dark:text-white">
                {order.status?.replaceAll("_", " ") || "Status unavailable"}
              </div>
            </div>

            <div className="grid gap-4 border-b border-line py-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">Payment status</p>
                <p className={`mt-1 font-semibold ${paid ? "text-state-success" : paymentFailed || paymentCancelled ? "text-state-danger" : "text-ink dark:text-white"}`}>
                  {paymentLabel(order, payment)}
                </p>
                {paymentError && <p role="status" className="mt-1 text-xs text-state-warning">{paymentError} Order status is still checked with the server.</p>}
                {refreshing && <p role="status" className="mt-1 text-xs text-muted">Checking for a status update…</p>}
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">Payment method</p>
                <p className="mt-1 font-medium capitalize text-ink dark:text-white">{order.paymentMethod || "Unavailable"}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">Order total</p>
                <p className="mt-1 font-semibold text-ink nums dark:text-white">
                  {displayAmount(totals?.grandTotalMinor, order.totalAmount, currency)}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">Items</p>
                <p className="mt-1 font-medium text-ink dark:text-white">{order.items?.length || 0}</p>
              </div>
            </div>

            <div className="space-y-3 border-b border-line py-4">
              <h3 className="font-semibold text-ink dark:text-white">Items</h3>
              {(order.items || []).map((item, index) => (
                <div key={`${item.product_id || item._id || index}`} className="flex items-start justify-between gap-4 text-sm">
                  <div>
                    <p className="font-medium text-ink dark:text-white">{item.name || "Product"}</p>
                    <p className="text-muted">Quantity: {item.quantity || 1}</p>
                    <p className="text-xs text-muted">
                      Unit price: {displayAmount(item.unitPriceMinor, item.price, currency)}
                    </p>
                  </div>
                  <p className="shrink-0 font-medium text-ink nums dark:text-white">
                    {displayAmount(item.lineTotalMinor, Number(item.price) * (item.quantity || 1), currency)}
                  </p>
                </div>
              ))}
            </div>

            {totals && (
              <dl className="space-y-2 border-b border-line py-4 text-sm">
                <div className="flex justify-between gap-4"><dt className="text-muted">Subtotal</dt><dd className="font-medium">{displayAmount(totals.subtotalMinor, undefined, currency)}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-muted">Discount</dt><dd className="font-medium">{displayAmount(totals.discountMinor, undefined, currency)}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-muted">Shipping</dt><dd className="font-medium">{displayAmount(totals.shippingMinor, undefined, currency)}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-muted">Tax</dt><dd className="font-medium">{displayAmount(totals.taxMinor, undefined, currency)}</dd></div>
                <div className="flex justify-between gap-4 border-t border-line pt-2 font-semibold text-ink dark:text-white"><dt>Total</dt><dd>{displayAmount(totals.grandTotalMinor, undefined, currency)}</dd></div>
              </dl>
            )}

            {order.shippingAddress && (
              <div className="pt-4">
                <h3 className="font-semibold text-ink dark:text-white">Shipping address</h3>
                <p className="mt-1 text-sm text-muted">
                  {[order.shippingAddress.fullName, order.shippingAddress.line1, order.shippingAddress.line2, order.shippingAddress.city, order.shippingAddress.state, order.shippingAddress.country, order.shippingAddress.postalCode]
                    .filter(Boolean)
                    .join(", ")}
                </p>
              </div>
            )}
          </section>
        ) : null}

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {order && !TERMINAL_ORDER_STATUSES.has(order.status) && order.paymentMethod !== "cod" && (
            <button type="button" onClick={() => setRefreshKey((key) => key + 1)} disabled={refreshing} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-line px-5 font-semibold text-ink disabled:opacity-60 dark:text-white">
              <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} /> Check status
            </button>
          )}
          <Link to="/orders" className="inline-flex min-h-11 items-center gap-2 rounded-md bg-brand px-5 py-2.5 font-semibold text-brand-fg transition-colors hover:bg-brand-hover">
            My Orders <ArrowRight size={16} />
          </Link>
          <Link to="/category" className="inline-flex min-h-11 items-center gap-2 rounded-md border border-line bg-surface px-5 py-2.5 font-semibold text-muted transition-colors hover:border-brand hover:text-brand">
            Continue Shopping
          </Link>
        </div>
      </div>
    </div>
  );
}
