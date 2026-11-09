import { useState, useEffect, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { CreditCard, Truck, Tag, Loader2, ShieldCheck } from "lucide-react";
import { cartAPI, addressesAPI, couponsAPI, ordersAPI, paymentsAPI } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import CheckoutProgress from "../components/CheckoutProgress";
import { Button } from "../components/ui";

const CHECKOUT_CURRENCY = "EGP";
const formatCheckoutPrice = (amount) => new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: CHECKOUT_CURRENCY,
}).format(Number(amount) || 0);

const emptyAddress = {
  fullName: "",
  phone: "",
  line1: "",
  line2: "",
  city: "",
  state: "",
  postalCode: "",
  country: "",
};

function getProductId(item) {
  const product = item?.product;
  const productId = item?.product_id || (typeof product === "string" ? product : product?._id);
  return typeof productId === "string" ? productId : "";
}

export default function CheckoutPage() {
  if (import.meta.env.VITE_PREVIEW_MODE === "true") {
    return (
      <div className="mx-auto max-w-content px-4 py-16">
        <section role="status" className="mx-auto max-w-xl rounded-lg border border-state-warning-border bg-state-warning-bg p-6 text-center sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-wide text-state-warning">Preview experience</p>
          <h1 className="mt-2 font-display text-2xl font-bold text-ink dark:text-white">Checkout is unavailable</h1>
          <p className="mt-3 text-sm leading-6 text-muted">
            This Preview store is for browsing only. Orders, Cash on Delivery, and payments are disabled; your cart remains available.
          </p>
          <Link to="/cart" className="mt-6 inline-flex min-h-11 items-center justify-center rounded-md bg-brand px-5 py-2.5 font-semibold text-brand-fg hover:bg-brand-hover">
            Return to cart
          </Link>
        </section>
      </div>
    );
  }
  return <CheckoutFlow />;
}

function CheckoutFlow() {
  const { isAuthenticated, user } = useAuth();
  const { addItem, refreshCart } = useCart();
  const navigate = useNavigate();

  const [items, setItems] = useState([]);
  const [addresses, setAddresses] = useState([]);
  const [address, setAddress] = useState(emptyAddress);
  const [selectedAddressId, setSelectedAddressId] = useState("new");
  const [fieldErrors, setFieldErrors] = useState({});

  const [couponCode, setCouponCode] = useState("");
  const [coupon, setCoupon] = useState(null);
  const [couponError, setCouponError] = useState("");
  const [couponApplying, setCouponApplying] = useState(false);

  const [paymentMethod, setPaymentMethod] = useState("cod");
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [addressLoadError, setAddressLoadError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const submissionRef = useRef(false);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate("/login");
      return;
    }
    let active = true;
    setLoading(true);
    setLoadError("");
    setAddressLoadError("");
    Promise.all([
      cartAPI.getAll(),
      addressesAPI.getAll().catch((requestError) => {
        if (active) {
          setAddressLoadError(requestError.response?.data?.message || "Saved addresses could not be loaded. Enter your address below.");
        }
        return { data: { data: [] } };
      }),
    ])
      .then(([cartRes, addrRes]) => {
        if (!active) return;
        if (!Array.isArray(cartRes.data.data)) throw new Error("The cart response was invalid.");
        setItems(cartRes.data.data);
        const addrs = Array.isArray(addrRes.data.data) ? addrRes.data.data : [];
        setAddresses(addrs);
        const def = addrs.find((a) => a.isDefault) || addrs[0];
        if (def) {
          setSelectedAddressId(def._id);
          setAddress(extractAddress(def));
        } else {
          setSelectedAddressId("new");
          setAddress({ ...emptyAddress, fullName: user?.name || "" });
        }
      })
      .catch((requestError) => {
        if (active) setLoadError(requestError.response?.data?.message || requestError.message || "Could not load checkout.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [isAuthenticated, loadAttempt, navigate, user?.name]);

  const extractAddress = (a) => ({
    fullName: a.fullName || "",
    phone: a.phone || "",
    line1: a.line1 || "",
    line2: a.line2 || "",
    city: a.city || "",
    state: a.state || "",
    postalCode: a.postalCode || "",
    country: a.country || "",
  });

  const onSelectAddress = (id) => {
    setSelectedAddressId(id);
    setFieldErrors({});
    if (id === "new") {
      setAddress(emptyAddress);
    } else {
      const found = addresses.find((a) => a._id === id);
      if (found) setAddress(extractAddress(found));
    }
  };

  const subtotal = items.reduce((sum, i) => sum + (Number(i.price) || 0) * (Number(i.quantity) || 0), 0);
  const shipping = 0;

  let discount = 0;
  if (coupon) {
    discount =
      coupon.discountType === "percentage"
        ? (subtotal * coupon.discountValue) / 100
        : coupon.discountValue;
    discount = Math.min(discount, subtotal);
  }
  const grandTotal = Math.max(0, subtotal - discount) + shipping;

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user?.email || "");
  const customerInfoComplete = Boolean(address.fullName.trim() && address.phone.trim() && emailValid);
  const shippingInfoComplete = Boolean(address.line1.trim() && address.city.trim() && address.country.trim());
  const currentStep = !customerInfoComplete ? 1 : !shippingInfoComplete ? 2 : 3;

  const validateCheckout = () => {
    const errors = {};
    if (!address.fullName.trim()) errors.fullName = "Enter the recipient’s full name.";
    if (!address.phone.trim()) errors.phone = "Enter a phone number for delivery.";
    if (!emailValid) errors.email = "A valid account email is required.";
    if (!address.line1.trim()) errors.line1 = "Enter the street address.";
    if (!address.city.trim()) errors.city = "Enter the city.";
    if (!address.country.trim()) errors.country = "Enter the country.";
    if (paymentMethod === "card") {
      if (address.fullName.trim() && address.fullName.trim().split(/\s+/).length < 2) {
        errors.fullName = "Enter first and last names for card payment.";
      }
      if (address.country.trim() && !["EG", "EGY", "EGYPT"].includes(address.country.trim().toUpperCase())) {
        errors.country = "Card payment is currently available only for Egypt.";
      }
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const updateAddressField = (field, value) => {
    setAddress((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const applyCoupon = async () => {
    setCouponError("");
    if (!couponCode.trim()) return;
    setCouponApplying(true);
    try {
      const res = await couponsAPI.apply(couponCode.trim());
      const c = res.data.data;
      if (!c) throw new Error("The coupon response was invalid.");
      if (c.minimumAmount && subtotal < c.minimumAmount) {
        setCoupon(null);
        setCouponError(`Minimum order of ${formatCheckoutPrice(c.minimumAmount)} required for this coupon.`);
        return;
      }
      setCoupon(c);
    } catch (err) {
      setCoupon(null);
      setCouponError(err.response?.data?.message || err.message || "Invalid or expired coupon.");
    } finally {
      setCouponApplying(false);
    }
  };

  const getVerifiedCart = async () => {
    const response = await cartAPI.getAll();
    const latestItems = response.data.data;
    if (!Array.isArray(latestItems)) throw new Error("Could not verify the current cart. Please try again.");
    setItems(latestItems);
    if (latestItems.length === 0) throw new Error("Your cart is empty.");
    if (latestItems.some((item) => !getProductId(item))) {
      throw new Error("A cart product reference is missing. Return to your cart for assistance.");
    }
    if (latestItems.some((item) => !Number.isInteger(Number(item.quantity)) || Number(item.quantity) < 1)) {
      throw new Error("A cart quantity is invalid. Review your cart and try again.");
    }
    if (latestItems.some((item) => {
      const stock = Number(item.stock);
      return item._unavailable || (Number.isFinite(stock) && stock < Number(item.quantity));
    })) {
      throw new Error("Product availability changed. Review your cart before continuing.");
    }

    const hasChanged = latestItems.length !== items.length || latestItems.some((latest) => {
      const latestId = getProductId(latest);
      const existing = items.find((item) => getProductId(item) === latestId);
      return !existing || Number(existing.price) !== Number(latest.price) || Number(existing.quantity) !== Number(latest.quantity);
    });
    if (hasChanged) throw new Error("Cart prices or quantities changed. Review the updated order summary and try again.");

    const latestSubtotal = latestItems.reduce((sum, item) => sum + (Number(item.price) || 0) * Number(item.quantity), 0);
    let currentCoupon = coupon;
    if (coupon?.code) {
      const couponResponse = await couponsAPI.apply(coupon.code);
      currentCoupon = couponResponse.data.data;
      if (!currentCoupon) throw new Error("The coupon could not be revalidated.");
      if (currentCoupon.minimumAmount && latestSubtotal < currentCoupon.minimumAmount) {
        setCoupon(null);
        throw new Error(`Minimum order of ${formatCheckoutPrice(currentCoupon.minimumAmount)} required for this coupon.`);
      }
      setCoupon(currentCoupon);
    }
    return { items: latestItems, subtotal: latestSubtotal };
  };

  const restoreCart = async (originalItems) => {
    const response = await cartAPI.getAll();
    const currentItems = response.data.data;
    if (!Array.isArray(currentItems)) throw new Error("The current cart could not be read for recovery.");

    for (const original of originalItems) {
      const productId = getProductId(original);
      const existing = currentItems.find((item) => getProductId(item) === productId);
      const missingQuantity = Math.max(0, Number(original.quantity) - (Number(existing?.quantity) || 0));
      if (missingQuantity > 0) await addItem(original, missingQuantity);
    }
    await refreshCart();
  };

  const submitOrder = async (method) => {
    if (submissionRef.current) return;
    submissionRef.current = true;
    setPlacing(true);
    setError("");
    const originalItems = items;
    let orderSubmissionStarted = false;
    try {
      const verifiedCart = await getVerifiedCart();
      const payload = {
        items: verifiedCart.items.map((item) => {
          const productId = getProductId(item);
          return {
            product: productId,
            product_id: productId,
            name: item.name,
            price: item.price,
            quantity: item.quantity,
            image: item.image,
            category: item.category,
          };
        }),
        shippingAddress: address,
        paymentMethod: method,
        totalAmount: verifiedCart.subtotal,
        ...(coupon ? { couponCode: coupon.code } : {}),
      };
      orderSubmissionStarted = true;
      const response = await ordersAPI.create(payload);
      const order = response.data.data;
      if (!order?._id) throw new Error("The order could not be confirmed. Your cart has been preserved.");
      const snapshot = order.commercialSnapshot;
      if (!snapshot || !Number.isSafeInteger(snapshot.grandTotalMinor) || !snapshot.currency) {
        throw new Error("The order service did not return an authoritative total. Your cart has been restored.");
      }

      if (method === "cod") {
        if (order.status !== "pending") throw new Error("The order was not confirmed for Cash on Delivery.");
        await refreshCart();
        navigate(`/order-success/${order._id}`);
        return;
      }

      if (order.status !== "pending_payment") {
        throw new Error("The order is not awaiting payment. Contact support before retrying.");
      }
      const idempotencyKey = `checkout-${order._id}-${window.crypto.randomUUID()}`;
      const paymentResponse = await paymentsAPI.createIntent(order._id, idempotencyKey);
      const payment = paymentResponse.data.data;
      if (
        payment?.orderId !== order._id
        || typeof payment.paymentId !== "string"
        || !payment.paymentId
        || payment.status !== "pending"
        || payment.amountMinor !== snapshot.grandTotalMinor
        || payment.currency !== snapshot.currency
        || typeof payment.checkoutUrl !== "string"
      ) {
        throw new Error("The payment provider did not return a valid checkout session.");
      }
      sessionStorage.setItem(`alfredo:payment:${order._id}`, payment.paymentId);
      await refreshCart();
      window.location.assign(payment.checkoutUrl);
    } catch (requestError) {
      const message = requestError.response?.data?.message || requestError.message || "Could not place the order.";
      let recoveryMessage = "";
      if (orderSubmissionStarted) {
        try {
          await restoreCart(originalItems);
        } catch {
          recoveryMessage = " The cart could not be fully restored; please contact support before retrying.";
        }
      }
      setError(`${message}${recoveryMessage}`);
    } finally {
      submissionRef.current = false;
      setPlacing(false);
    }
  };

  const handlePlaceOrder = async () => {
    setError("");
    if (paymentMethod === "card" && discount > 0) {
      setError("Paymob card checkout cannot currently process discounted totals. Remove the coupon or choose Cash on Delivery.");
      return;
    }
    if (!validateCheckout()) return;
    await submitOrder(paymentMethod);
  };

  if (loading) {
    return <div role="status" className="mx-auto max-w-content px-4 py-16 text-center text-muted">Loading checkout…</div>;
  }

  if (loadError) {
    return (
      <div role="alert" className="mx-auto my-10 max-w-content border border-state-danger-border bg-state-danger-bg p-5 text-state-danger">
        <p className="font-semibold">{loadError}</p>
        <Button type="button" onClick={() => setLoadAttempt((attempt) => attempt + 1)} className="mt-4">
          Try again
        </Button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-content px-4 py-16 text-center">
        <p className="mb-4 text-lg text-muted">Your cart is empty.</p>
        <Link to="/category" className="inline-flex min-h-11 items-center rounded-md bg-brand px-5 py-2.5 font-semibold text-brand-fg hover:bg-brand-hover">
          Continue shopping
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-content px-4 py-6 sm:py-8">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase text-brand">Secure checkout</p>
        <h1 className="mt-1 font-display text-2xl font-bold text-ink dark:text-white sm:text-3xl">Checkout</h1>
      </div>
      <CheckoutProgress currentStep={currentStep} />
      <p role="status" className="mt-4 rounded-md border border-state-warning-border bg-state-warning-bg px-4 py-3 text-sm text-state-warning">Preview store: checkout is for demonstration only. Orders, Cash on Delivery, and live payments are disabled.</p>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-8">
        <main className="min-w-0 space-y-5">
          <section id="customer-information" className="checkout-form-section rounded-lg border border-line bg-surface p-5 sm:p-6">
            <StepHeading number={1} title="Customer information" description="Who should we contact about this order?" />
            {addressLoadError && (
              <p role="status" className="mb-4 rounded-md border border-state-warning-border bg-state-warning-bg px-3 py-2 text-sm text-state-warning">
                {addressLoadError}
              </p>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Full name *" value={address.fullName} onChange={(v) => updateAddressField("fullName", v)} error={fieldErrors.fullName} autoComplete="name" />
              <Field label="Phone *" type="tel" value={address.phone} onChange={(v) => updateAddressField("phone", v)} error={fieldErrors.phone} autoComplete="tel" />
              <Field label="Email" type="email" value={user?.email || ""} readOnly error={fieldErrors.email} autoComplete="email" />
            </div>
          </section>

          <section id="shipping-information" className="checkout-form-section rounded-lg border border-line bg-surface p-5 sm:p-6">
            <StepHeading number={2} title="Shipping information" description="Choose a saved address or enter a new delivery address." icon={Truck} />

            {addresses.length > 0 && (
              <div className="mb-5 space-y-2">
                {addresses.map((a) => (
                  <label key={a._id} className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm transition ${selectedAddressId === a._id ? "border-brand bg-sage/20" : "border-line hover:border-brand/50"}`}>
                    <input
                      type="radio"
                      name="address"
                      checked={selectedAddressId === a._id}
                      onChange={() => onSelectAddress(a._id)}
                      className="mt-1 accent-brand"
                    />
                    <span className="min-w-0 text-muted">
                      <span className="font-medium text-ink dark:text-white">{a.fullName}</span>
                      <span className="block">{a.line1}, {a.city}, {a.country}</span>
                      {a.isDefault && <span className="mt-1 inline-block text-xs font-semibold text-brand">Default address</span>}
                    </span>
                  </label>
                ))}
                <label className={`flex cursor-pointer items-center gap-3 rounded-md border p-3 text-sm transition ${selectedAddressId === "new" ? "border-brand bg-sage/20" : "border-line hover:border-brand/50"}`}>
                  <input
                    type="radio"
                    name="address"
                    checked={selectedAddressId === "new"}
                    onChange={() => onSelectAddress("new")}
                    className="accent-brand"
                  />
                  <span className="font-medium text-ink dark:text-white">Use a new address</span>
                </label>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Address line 1 *" value={address.line1} onChange={(v) => updateAddressField("line1", v)} error={fieldErrors.line1} autoComplete="address-line1" full />
              <Field label="Address line 2" value={address.line2} onChange={(v) => updateAddressField("line2", v)} autoComplete="address-line2" full />
              <Field label="City *" value={address.city} onChange={(v) => updateAddressField("city", v)} error={fieldErrors.city} autoComplete="address-level2" />
              <Field label="State / Area / Region" value={address.state} onChange={(v) => updateAddressField("state", v)} autoComplete="address-level1" />
              <Field label="Postal code" value={address.postalCode} onChange={(v) => updateAddressField("postalCode", v)} autoComplete="postal-code" />
              <Field label="Country *" value={address.country} onChange={(v) => updateAddressField("country", v)} error={fieldErrors.country} autoComplete="country-name" />
            </div>
          </section>

          <section id="payment" className="checkout-form-section rounded-lg border border-line bg-surface p-5 sm:p-6">
            <StepHeading number={3} title="Payment" description="Choose a secure payment method." icon={ShieldCheck} />

            <div className="mb-5 grid gap-3 sm:grid-cols-2">
              <label className={`flex cursor-pointer items-center gap-3 rounded-md border p-3 text-sm transition ${paymentMethod === "card" ? "border-brand bg-sage/20" : "border-line hover:border-brand/50"}`}>
                <input type="radio" name="pay" checked={paymentMethod === "card"} onChange={() => setPaymentMethod("card")} className="accent-brand" />
                <CreditCard size={18} className="text-brand" />
                <span className="font-medium text-ink dark:text-white">Credit / Debit card</span>
              </label>
              <label className={`flex cursor-pointer items-center gap-3 rounded-md border p-3 text-sm transition ${paymentMethod === "cod" ? "border-brand bg-sage/20" : "border-line hover:border-brand/50"}`}>
                <input type="radio" name="pay" checked={paymentMethod === "cod"} onChange={() => setPaymentMethod("cod")} className="accent-brand" />
                <Truck size={18} className="text-brand" />
                <span className="font-medium text-ink dark:text-white">Cash on Delivery</span>
              </label>
            </div>

            {paymentMethod === "card" && (
              <p className="mb-3 rounded-md bg-sand/60 p-3 text-xs leading-5 text-muted">
                You’ll continue to the backend-provided secure payment page. Card availability depends on the configured payment provider.
              </p>
            )}

            {error && <p role="alert" className="mb-3 rounded-md border border-state-danger-border bg-state-danger-bg px-3 py-2 text-sm text-state-danger">{error}</p>}

            <Button
              type="button"
              onClick={handlePlaceOrder}
              disabled={true}
              className="min-h-12 w-full"
            >
              {placing && <Loader2 size={16} className="animate-spin" />}
              Preview checkout disabled — Est. {formatCheckoutPrice(grandTotal)}
            </Button>
          </section>
        </main>

        <aside id="order-review" className="checkout-summary h-fit rounded-lg border border-line bg-surface p-5 shadow-card sm:p-6 lg:sticky lg:top-32">
          <StepHeading number={4} title="Order review" description="Review your items and total." />

          <div className="mb-4 max-h-48 space-y-3 overflow-auto border-b border-line pb-4">
            {items.map((i) => (
              <div key={i._id || i.product_id} className="flex items-start justify-between gap-3 text-sm">
                <span className="min-w-0 text-muted">
                  {i.product_id ? (
                    <Link to={`/product/${i.product_id}`} className="block truncate text-ink hover:text-brand dark:text-zinc-100">{i.name}</Link>
                  ) : (
                    <span className="block truncate text-ink dark:text-zinc-100">{i.name}</span>
                  )}
                  <span className="block text-xs">{formatCheckoutPrice(i.price)} each</span>
                  <span className="text-xs">Qty {i.quantity}</span>
                </span>
                <span className="shrink-0 font-medium text-ink nums dark:text-white">{formatCheckoutPrice((Number(i.price) || 0) * (Number(i.quantity) || 0))}</span>
              </div>
            ))}
          </div>

          <p className="mb-3 text-xs leading-5 text-muted">
            Prices and totals below are estimates from the current cart. The order service revalidates the final amount when your order is submitted.
          </p>
          <label htmlFor="checkout-coupon" className="mb-1.5 block text-xs font-medium text-muted">Coupon code</label>
          <div className="mb-3 flex gap-2">
            <input
              id="checkout-coupon"
              value={couponCode}
              onChange={(e) => setCouponCode(e.target.value)}
              placeholder="Enter code"
              className="h-10 min-w-0 flex-1 rounded-md border border-line bg-surface px-3 text-sm text-ink placeholder:text-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
            />
            <Button type="button" onClick={applyCoupon} disabled={couponApplying || placing} className="h-10 min-h-10 rounded-md px-3">
              <Tag size={16} />{couponApplying ? "Checking…" : "Apply"}
            </Button>
          </div>
          {couponError && <p role="alert" className="mb-2 text-xs leading-5 text-red-600">{couponError}</p>}
          {coupon && <p role="status" className="mb-2 text-xs text-brand">Coupon “{coupon.code}” applied.</p>}

          <div className="space-y-3 border-t border-line pt-4 text-sm">
            <Row label="Subtotal" value={formatCheckoutPrice(subtotal)} />
            {discount > 0 && <Row label="Discount" value={`-${formatCheckoutPrice(discount)}`} green />}
            <Row label="Shipping" value={formatCheckoutPrice(shipping)} />
            <Row label="Taxes" value={formatCheckoutPrice(0)} />
            <div className="flex items-baseline justify-between border-t border-line pt-3">
              <span className="font-bold text-ink dark:text-white">Estimated total</span>
              <span className="font-display text-xl font-bold text-ink nums dark:text-white">{formatCheckoutPrice(grandTotal)}</span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, full, type = "text", error, readOnly = false, autoComplete }) {
  const id = label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink dark:text-zinc-200">{label}</label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        readOnly={readOnly}
        autoComplete={autoComplete}
        aria-required={label.endsWith("*")}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`h-11 w-full rounded-md border bg-surface px-3 text-sm text-ink placeholder:text-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 ${error ? "border-state-danger-border" : "border-line"} ${readOnly ? "bg-surface-muted text-muted" : ""}`}
      />
      {error && <p id={`${id}-error`} className="mt-1 text-xs text-state-danger">{error}</p>}
    </div>
  );
}

function Row({ label, value, green }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted">{label}</span>
      <span className={green ? "font-medium text-brand" : "font-medium text-ink dark:text-white"}>{value}</span>
    </div>
  );
}

function StepHeading({ number, title, description, icon: Icon }) {
  return (
    <div className="mb-5 flex items-start gap-3">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-sage/50 text-sm font-bold text-brand">{number}</span>
      <div className="min-w-0 flex-1">
        <h2 className="font-display text-lg font-bold text-ink dark:text-white">{title}</h2>
        {description && <p className="mt-1 text-sm leading-5 text-muted">{description}</p>}
      </div>
      {Icon && <Icon size={18} className="mt-1 shrink-0 text-brand" aria-hidden="true" />}
    </div>
  );
}
