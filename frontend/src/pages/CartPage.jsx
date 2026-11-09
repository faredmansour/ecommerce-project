import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Minus, Plus, ShoppingBag, Tag, Trash2 } from "lucide-react";
import { useCart } from "../context/CartContext";
import { formatPrice } from "../lib/format";
import { siteConfig } from "../config/site.config";
import { Button, EmptyState, LoadingState } from "../components/ui";
import ProductImage from "../components/ProductImage";

const THRESHOLD = siteConfig.freeShippingThreshold;
const FEE = siteConfig.shippingFee;
const BACKEND = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? "/_/backend" : "http://localhost:8000");

function getImageUrl(image) {
  if (!image) return "";
  if (image.startsWith("http") || image.startsWith("data:")) return image;
  return `${BACKEND}${image}`;
}

function getItemKey(item) {
  return item._id || item.product_id || item.id;
}

function getCategoryName(category) {
  if (!category) return "";
  if (typeof category === "string") return category;
  return category.name || "";
}

function getVariant(item) {
  if (typeof item.variant === "string") return item.variant;
  if (item.variant && typeof item.variant === "object") return item.variant.name || item.variant.label || "";
  return [item.size, item.color].filter(Boolean).join(" · ");
}

function getActionError(error) {
  return error.response?.data?.message || error.message || "Your cart could not be updated. Please try again.";
}

function CartProductImage({ item, imageUrl, productPath }) {
  if (productPath && !item._unavailable) {
    return <Link to={productPath} aria-label={`View ${item.name}`} className="block aspect-square overflow-hidden rounded-sm border border-line bg-surface-muted sm:w-[92px]"><ProductImage src={imageUrl} alt={item.name} className="h-full w-full object-contain p-2" /></Link>;
  }
  return <div className="aspect-square overflow-hidden rounded-sm border border-line bg-surface-muted sm:w-[92px]"><ProductImage src="" alt={item.name} className="h-full w-full p-2" /></div>;
}

function OrderSummary({ total, shipping, needsAttention, onCheckout, mobile = false }) {
  const shippingLabel = total === 0 ? "Calculated at checkout" : shipping === 0 ? "Free" : formatPrice(shipping);
  return (
    <>
      {!mobile && <h2 className="mb-5 font-display text-lg font-bold text-ink dark:text-white">Order summary</h2>}
      <div aria-live={mobile ? undefined : "polite"} aria-atomic={!mobile}>
        {!mobile && (
          <>
            <dl className="mb-4 space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Subtotal</dt>
                <dd className="font-medium text-ink nums dark:text-white">{formatPrice(total)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Shipping</dt>
                <dd className={`font-medium nums ${shipping === 0 && total > 0 ? "text-secondary" : "text-ink dark:text-white"}`}>
                  {shippingLabel}
                </dd>
              </div>
            </dl>
            <div className="flex items-start gap-2 rounded-md bg-surface-muted p-3 text-xs leading-5 text-muted">
              <Tag size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-brand" />
              <span>Coupon discounts can be added during checkout.</span>
            </div>
            {needsAttention && (
              <p role="status" className="text-xs text-state-warning">
                Update quantities or remove unavailable items before checkout.
              </p>
            )}
            <p className="text-xs leading-5 text-muted">This is an estimate based on current cart prices and configured shipping. Discounts, shipping, taxes, and the final total are confirmed at checkout.</p>
            <dl className="mt-4 hidden border-t border-line pt-4 lg:block">
              <div className="flex items-baseline justify-between gap-4">
                <dt className="font-bold text-ink dark:text-white">Estimated total</dt>
                <dd className="font-display text-xl font-bold text-ink nums dark:text-white">{formatPrice(total + shipping)}</dd>
              </div>
            </dl>
          </>
        )}
        {mobile && (
          <dl className="min-w-0"><div className="flex flex-col items-start">
            <dt className="text-xs text-muted">Estimated total</dt>
            <dd className="font-display text-lg font-bold text-ink nums dark:text-white">{formatPrice(total + shipping)}</dd>
          </div></dl>
        )}
      </div>
      <Button
        type="button"
        disabled={needsAttention}
        onClick={onCheckout}
        className={mobile ? "min-h-12 w-full" : "hidden min-h-12 w-full lg:inline-flex"}
      >
        Checkout<ArrowRight size={18} aria-hidden="true" />
      </Button>
      {!mobile && (
        <Link to="/category" className="mt-3 hidden min-h-11 items-center justify-center text-sm font-medium text-muted transition-colors duration-200 hover:text-brand lg:flex">
          Continue Shopping
        </Link>
      )}
    </>
  );
}

export default function CartPage() {
  const { items, loading, syncError, mergeStatus, unsyncedGuestItems, refreshCart, retryMerge, updateItem, removeItem, updateUnsyncedGuestItem } = useCart();
  const [actionError, setActionError] = useState("");
  const [actionStatus, setActionStatus] = useState("");
  const [pendingKeys, setPendingKeys] = useState([]);
  const pendingRef = useRef(new Set());
  const navigate = useNavigate();

  const runAction = async (item, action, successMessage) => {
    const key = getItemKey(item);
    if (pendingRef.current.has(key)) return;
    pendingRef.current.add(key);
    setPendingKeys([...pendingRef.current]);
    setActionError("");
    setActionStatus("");
    try {
      await action();
      setActionStatus(successMessage);
    } catch (error) {
      setActionError(getActionError(error));
    } finally {
      pendingRef.current.delete(key);
      setPendingKeys([...pendingRef.current]);
    }
  };

  const unavailable = (item) => item._unavailable || (Number.isFinite(Number(item.stock)) && Number(item.stock) < item.quantity);
  const total = items.reduce((sum, item) => {
    if (item._unavailable || (Number.isFinite(Number(item.stock)) && Number(item.stock) < 1)) return sum;
    return sum + (Number(item.price) || 0) * (Number(item.quantity) || 0);
  }, 0);
  const shipping = total >= THRESHOLD || total === 0 ? 0 : FEE;
  const needsAttention = items.some(unavailable);
  const checkout = () => navigate("/checkout");

  if (loading) return <LoadingState label="Loading your cart" className="mx-auto max-w-content px-4 py-16" />;

  return (
    <div className={`mx-auto max-w-content px-4 pb-8 pt-6 sm:pb-10 sm:pt-8 ${items.length ? "pb-[calc(7.5rem+env(safe-area-inset-bottom))] lg:pb-10" : ""}`}>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b border-line pb-4 sm:mb-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-brand">Your selection</p>
          <h1 className="mt-1 font-display text-2xl font-bold leading-tight text-ink dark:text-white sm:text-3xl">Shopping Cart</h1>
        </div>
        {items.length > 0 && (() => {
          const count = items.reduce((totalCount, item) => totalCount + item.quantity, 0);
          return <p className="text-sm text-muted">{count} {count === 1 ? "item" : "items"}</p>;
        })()}
      </header>

      {(syncError || mergeStatus === "failed") && (
        <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-state-warning-border bg-state-warning-bg px-4 py-3 text-sm text-state-warning">
          <div>
            <p>{syncError || "Your saved cart was updated. Retry synchronization to continue."}</p>
            {mergeStatus === "failed" && <p className="mt-1">Your guest cart is still saved and has not been discarded.</p>}
          </div>
          <Button type="button" variant="outline" onClick={mergeStatus === "failed" ? retryMerge : refreshCart}>
            {mergeStatus === "failed" ? "Retry cart synchronization" : "Try again"}
          </Button>
        </div>
      )}
      {mergeStatus === "syncing" && (
        <p role="status" className="mb-4 rounded-md border border-line bg-surface px-4 py-3 text-sm text-muted">
          Synchronizing your saved guest cart…
        </p>
      )}
      {mergeStatus === "failed" && unsyncedGuestItems.length > 0 && (
        <section aria-label="Guest items awaiting synchronization" className="mb-5 rounded-md border border-state-warning-border bg-state-warning-bg p-4 text-sm text-state-warning">
          <h2 className="font-semibold">Guest items awaiting synchronization</h2>
          <ul className="mt-2 space-y-2">
            {unsyncedGuestItems.map((item) => (
              <li key={item.product_id} className="flex flex-wrap items-center justify-between gap-3">
                <span>{item.name} — quantity {item.quantity}</span>
                <span className="inline-flex items-center gap-2">
                  <button
                    type="button"
                    aria-label={`Decrease saved ${item.name} quantity`}
                    disabled={pendingKeys.includes(item.product_id) || item.quantity <= 1}
                    onClick={() => runAction({ product_id: item.product_id }, () => updateUnsyncedGuestItem(item.product_id, item.quantity - 1), `${item.name} quantity updated.`)}
                    className="grid h-11 w-11 place-items-center rounded-md hover:bg-state-warning-bg focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand disabled:opacity-40"
                  ><Minus size={16} aria-hidden="true" /></button>
                  <button
                    type="button"
                    aria-label={`Remove saved ${item.name}`}
                    disabled={pendingKeys.includes(item.product_id)}
                    onClick={() => runAction({ product_id: item.product_id }, () => updateUnsyncedGuestItem(item.product_id, 0), `${item.name} removed from your saved cart.`)}
                    className="min-h-11 rounded-md px-3 font-medium underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand disabled:opacity-40"
                  >Remove</button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {actionError && <p role="alert" className="mb-4 rounded-md border border-state-danger-border bg-state-danger-bg px-4 py-3 text-sm text-state-danger">{actionError}</p>}
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{actionStatus}</p>

      {items.length === 0 ? (
        <EmptyState
          icon={ShoppingBag}
          title="Your cart is empty"
          description="Add a product to your cart and it will be ready here."
          className="rounded-md border border-dashed border-line bg-surface py-14 sm:py-16"
          action={(
            <Link to="/category" className="inline-flex min-h-11 items-center gap-2 rounded-md bg-brand px-5 py-2.5 text-sm font-semibold text-brand-fg transition-colors duration-200 hover:bg-brand-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
              Continue Shopping<ArrowRight size={16} aria-hidden="true" />
            </Link>
          )}
        />
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-8">
          <section aria-label="Cart items" className="min-w-0 space-y-3">
            {items.map((item) => {
              const key = getItemKey(item);
              const itemUnavailable = unavailable(item);
              const outOfStock = Number.isFinite(Number(item.stock)) && Number(item.stock) < 1;
              const categoryName = getCategoryName(item.category);
              const imageUrl = getImageUrl(item.image);
              const maxQuantity = Number.isFinite(Number(item.stock))
                ? Math.min(99, Math.max(0, Math.floor(Number(item.stock))))
                : 99;
              const pending = pendingKeys.includes(key);
              const productPath = item.product_id ? `/product/${item.product_id}` : null;
              const variant = getVariant(item);

              return (
                <article key={key} className="cart-item-card grid min-w-0 grid-cols-[76px_minmax(0,1fr)] gap-x-3 gap-y-3 rounded-lg border border-line bg-surface p-3 sm:grid-cols-[92px_minmax(0,1fr)_auto] sm:items-center sm:gap-4 sm:p-4">
                  <div className="row-span-1">
                    <CartProductImage item={item} imageUrl={imageUrl} productPath={productPath} />
                  </div>
                  <div className="min-w-0 self-center">
                    {productPath && !item._unavailable ? (
                      <Link to={productPath} className="line-clamp-2 text-sm font-semibold leading-5 text-ink transition-colors duration-200 hover:text-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand dark:text-white">{item.name}</Link>
                    ) : (
                      <p className="line-clamp-2 text-sm font-semibold leading-5 text-ink dark:text-white">{item.name}</p>
                    )}
                    {categoryName && <p className="mt-1 truncate text-xs text-muted">{categoryName}</p>}
                    {item.sku && <p className="mt-1 text-xs text-muted">SKU: {item.sku}</p>}
                    {variant && <p className="mt-1 text-xs text-muted">{variant}</p>}
                    {item._unavailable ? (
                      <p className="mt-2 text-sm font-medium text-state-danger">{item._loadError || "This product is no longer available."}</p>
                    ) : outOfStock ? (
                      <p className="mt-2 text-sm font-medium text-state-danger">Out of stock</p>
                    ) : itemUnavailable ? (
                      <p className="mt-2 text-sm font-medium text-state-warning">Only {item.stock} available. Update quantity or remove this item.</p>
                    ) : (
                      <p className="mt-2 text-sm font-semibold text-ink nums dark:text-white">{formatPrice(item.price)} <span className="font-normal text-muted">each</span></p>
                    )}
                  </div>
                  <div className="col-span-2 flex min-w-0 items-center justify-between gap-2 border-t border-line pt-3 sm:col-span-1 sm:justify-end sm:gap-3 sm:border-0 sm:pt-0">
                    <div className="flex flex-col items-center gap-1 sm:items-start">
                      <div role="group" aria-label={`${item.name} quantity`} className="inline-flex h-11 items-center rounded-md border border-line bg-surface">
                        <button
                          type="button"
                          aria-label={`Decrease ${item.name} quantity`}
                          disabled={pending || item._unavailable || item.quantity <= 1}
                          onClick={() => runAction(item, () => updateItem(item, item.quantity - 1), `${item.name} quantity decreased to ${item.quantity - 1}.`)}
                          className="grid h-11 w-11 place-items-center rounded-l-md text-muted transition-colors duration-200 hover:bg-surface-muted hover:text-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-40"
                        ><Minus size={16} aria-hidden="true" /></button>
                        <span aria-live="polite" aria-atomic="true" className="min-w-8 text-center text-sm font-semibold nums">{item.quantity}</span>
                        <button
                          type="button"
                          aria-label={`Increase ${item.name} quantity`}
                          disabled={pending || item._unavailable || item.quantity >= maxQuantity}
                          onClick={() => runAction(item, () => updateItem(item, item.quantity + 1), `${item.name} quantity increased to ${item.quantity + 1}.`)}
                          className="grid h-11 w-11 place-items-center rounded-r-md text-muted transition-colors duration-200 hover:bg-surface-muted hover:text-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-40"
                        ><Plus size={16} aria-hidden="true" /></button>
                      </div>
                      {Number.isFinite(Number(item.stock)) && item.quantity >= maxQuantity && maxQuantity > 0 && (
                        <p role="status" className="text-center text-[11px] leading-4 text-state-warning sm:text-left">
                          {Number(item.stock) > maxQuantity ? `Cart limit reached (${maxQuantity}).` : "Maximum available quantity reached."}
                        </p>
                      )}
                    </div>
                    <div className="ml-auto min-w-[82px] text-right sm:ml-0 sm:min-w-[92px]">
                      <p className="text-[11px] text-muted sm:hidden">Line total</p>
                      <p className="text-sm font-bold text-ink nums dark:text-white">
                        {!item._unavailable && !outOfStock ? formatPrice((Number(item.price) || 0) * item.quantity) : "—"}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => runAction(item, () => removeItem(item), `${item.name} removed from your cart.`)}
                      aria-label={`Remove ${item.name}`}
                      className="grid h-11 w-11 shrink-0 place-items-center rounded-md text-muted transition-colors duration-200 hover:bg-state-danger-bg hover:text-state-danger focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-40"
                    ><Trash2 size={18} aria-hidden="true" /></button>
                  </div>
                </article>
              );
            })}
            <Link to="/category" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-muted transition-colors duration-200 hover:text-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand">
              <ArrowRight size={16} aria-hidden="true" className="rotate-180" /> Continue Shopping
            </Link>
          </section>

          <aside aria-label="Order summary" className="cart-summary h-fit rounded-lg border border-line bg-surface p-5 shadow-card sm:p-6 lg:sticky lg:top-32">
            <OrderSummary total={total} shipping={shipping} needsAttention={needsAttention} onCheckout={checkout} />
          </aside>
        </div>
      )}

      {items.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 shadow-card lg:hidden">
          <div className="mx-auto flex max-w-content items-center gap-4">
            <OrderSummary total={total} shipping={shipping} needsAttention={needsAttention} onCheckout={checkout} mobile />
          </div>
        </div>
      )}
    </div>
  );
}
