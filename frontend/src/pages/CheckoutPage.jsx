import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Elements, CardElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { CreditCard, Truck, Tag, Loader2 } from "lucide-react";
import { cartAPI, addressesAPI, couponsAPI, ordersAPI, paymentsAPI } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { stripeEnabled, stripePromise } from "../lib/stripe";
import { formatPrice } from "../lib/format";
import { siteConfig } from "../config/site.config";

const SHIPPING_THRESHOLD = siteConfig.freeShippingThreshold;
const SHIPPING_FEE = siteConfig.shippingFee;

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

export default function CheckoutPage() {
  const { isAuthenticated } = useAuth();
  const { refreshCart } = useCart();
  const navigate = useNavigate();

  const [items, setItems] = useState([]);
  const [addresses, setAddresses] = useState([]);
  const [address, setAddress] = useState(emptyAddress);
  const [selectedAddressId, setSelectedAddressId] = useState("new");

  const [couponCode, setCouponCode] = useState("");
  const [coupon, setCoupon] = useState(null);
  const [couponError, setCouponError] = useState("");

  const [paymentMethod, setPaymentMethod] = useState(stripeEnabled ? "card" : "cod");
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate("/login");
      return;
    }
    Promise.all([cartAPI.getAll(), addressesAPI.getAll().catch(() => ({ data: { data: [] } }))])
      .then(([cartRes, addrRes]) => {
        setItems(cartRes.data.data || []);
        const addrs = addrRes.data.data || [];
        setAddresses(addrs);
        const def = addrs.find((a) => a.isDefault) || addrs[0];
        if (def) {
          setSelectedAddressId(def._id);
          setAddress(extractAddress(def));
        }
      })
      .finally(() => setLoading(false));
  }, [isAuthenticated, navigate]);

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
    if (id === "new") {
      setAddress(emptyAddress);
    } else {
      const found = addresses.find((a) => a._id === id);
      if (found) setAddress(extractAddress(found));
    }
  };

  const subtotal = items.reduce((sum, i) => sum + (i.price || 0) * (i.quantity || 0), 0);
  const shipping = subtotal >= SHIPPING_THRESHOLD || subtotal === 0 ? 0 : SHIPPING_FEE;

  let discount = 0;
  if (coupon) {
    discount =
      coupon.discountType === "percentage"
        ? (subtotal * coupon.discountValue) / 100
        : coupon.discountValue;
    discount = Math.min(discount, subtotal);
  }
  const grandTotal = Math.max(0, subtotal - discount) + shipping;

  const addressValid = ["fullName", "phone", "line1", "city", "country"].every(
    (k) => address[k] && address[k].trim()
  );

  const applyCoupon = async () => {
    setCouponError("");
    if (!couponCode.trim()) return;
    try {
      const res = await couponsAPI.apply(couponCode.trim());
      const c = res.data.data;
      if (c.minimumAmount && subtotal < c.minimumAmount) {
        setCoupon(null);
        setCouponError(`Minimum order of ${formatPrice(c.minimumAmount)} required for this coupon.`);
        return;
      }
      setCoupon(c);
    } catch (err) {
      setCoupon(null);
      setCouponError(err.response?.data?.message || "Invalid or expired coupon.");
    }
  };

  // Creates the order on the backend. `paymentRef` is the Stripe payment intent
  // id when paid by card (informational).
  const submitOrder = async (method) => {
    const payload = {
      items: items.map((i) => ({
        product: i.product,
        product_id: i.product_id,
        name: i.name,
        price: i.price,
        quantity: i.quantity,
        image: i.image,
        category: i.category,
      })),
      shippingAddress: address,
      paymentMethod: method,
      totalAmount: subtotal,
      ...(coupon ? { couponCode: coupon.code } : {}),
    };
    const res = await ordersAPI.create(payload);
    const order = res.data.data;
    // The backend clears the server-side cart on order creation; refresh UI.
    await refreshCart();
    navigate(`/order-success/${order._id}`);
  };

  const handleCodOrder = async () => {
    setError("");
    if (!addressValid) {
      setError("Please complete the shipping address.");
      return;
    }
    setPlacing(true);
    try {
      await submitOrder("cod");
    } catch (err) {
      setError(err.response?.data?.message || "Could not place the order.");
      setPlacing(false);
    }
  };

  if (loading) {
    return <div className="max-w-5xl mx-auto px-4 py-16 text-center text-gray-500">Loading checkout...</div>;
  }

  if (items.length === 0) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-16 text-center">
        <p className="text-gray-500 text-lg mb-4">Your cart is empty.</p>
        <Link to="/category" className="text-gold font-medium hover:underline">
          Continue shopping
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Checkout</h1>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Left: address + payment */}
        <div className="lg:col-span-2 space-y-6">
          {/* Shipping address */}
          <section className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-lg p-6">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Shipping Address</h2>

            {addresses.length > 0 && (
              <div className="mb-4 space-y-2">
                {addresses.map((a) => (
                  <label key={a._id} className="flex items-start gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="address"
                      checked={selectedAddressId === a._id}
                      onChange={() => onSelectAddress(a._id)}
                      className="mt-1"
                    />
                    <span className="text-gray-700 dark:text-gray-300">
                      {a.fullName} — {a.line1}, {a.city}, {a.country}
                      {a.isDefault && <span className="ml-2 text-xs text-gold">(default)</span>}
                    </span>
                  </label>
                ))}
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="address"
                    checked={selectedAddressId === "new"}
                    onChange={() => onSelectAddress("new")}
                  />
                  <span className="text-gray-700 dark:text-gray-300">Use a new address</span>
                </label>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Field label="Full name *" value={address.fullName} onChange={(v) => setAddress({ ...address, fullName: v })} />
              <Field label="Phone *" value={address.phone} onChange={(v) => setAddress({ ...address, phone: v })} />
              <Field label="Address line 1 *" value={address.line1} onChange={(v) => setAddress({ ...address, line1: v })} full />
              <Field label="Address line 2" value={address.line2} onChange={(v) => setAddress({ ...address, line2: v })} full />
              <Field label="City *" value={address.city} onChange={(v) => setAddress({ ...address, city: v })} />
              <Field label="State / Region" value={address.state} onChange={(v) => setAddress({ ...address, state: v })} />
              <Field label="Postal code" value={address.postalCode} onChange={(v) => setAddress({ ...address, postalCode: v })} />
              <Field label="Country *" value={address.country} onChange={(v) => setAddress({ ...address, country: v })} />
            </div>
          </section>

          {/* Payment method */}
          <section className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-lg p-6">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Payment</h2>

            <div className="space-y-2 mb-4">
              {stripeEnabled && (
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="radio" name="pay" checked={paymentMethod === "card"} onChange={() => setPaymentMethod("card")} />
                  <CreditCard size={16} /> Credit / Debit card
                </label>
              )}
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="radio" name="pay" checked={paymentMethod === "cod"} onChange={() => setPaymentMethod("cod")} />
                <Truck size={16} /> Cash on Delivery
              </label>
            </div>

            {!stripeEnabled && (
              <p className="text-xs text-gray-400 mb-2">
                Card payments are disabled (no Stripe key configured). Cash on Delivery is available.
              </p>
            )}

            {error && <p className="text-sm text-red-500 mb-3">{error}</p>}

            {paymentMethod === "card" && stripeEnabled ? (
              <Elements stripe={stripePromise}>
                <StripeCardForm
                  amount={grandTotal}
                  disabled={!addressValid || placing}
                  onError={setError}
                  setPlacing={setPlacing}
                  placing={placing}
                  onPaid={() => submitOrder("stripe")}
                />
              </Elements>
            ) : (
              <button
                onClick={handleCodOrder}
                disabled={placing}
                className="w-full bg-brand text-brand-fg py-3 rounded-full font-semibold hover:opacity-90 active:scale-[0.99] transition disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {placing && <Loader2 size={16} className="animate-spin" />}
                Place Order — {formatPrice(grandTotal)}
              </button>
            )}
          </section>
        </div>

        {/* Right: order summary */}
        <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-lg p-6 h-fit">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Order Summary</h2>

          <div className="space-y-2 mb-4 max-h-48 overflow-auto">
            {items.map((i) => (
              <div key={i._id || i.product_id} className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400 truncate pr-2">
                  {i.name} × {i.quantity}
                </span>
                <span className="font-medium nums">{formatPrice((i.price || 0) * (i.quantity || 0))}</span>
              </div>
            ))}
          </div>

          <div className="flex gap-2 mb-3">
            <input
              value={couponCode}
              onChange={(e) => setCouponCode(e.target.value)}
              placeholder="Coupon code"
              className="flex-1 border border-gray-300 dark:border-slate-700 dark:bg-slate-800 rounded-lg px-3 py-2 text-sm"
            />
            <button
              onClick={applyCoupon}
              className="px-3 py-2 text-sm rounded-lg bg-brand text-brand-fg hover:opacity-90 transition flex items-center gap-1"
            >
              <Tag size={14} /> Apply
            </button>
          </div>
          {couponError && <p className="text-xs text-red-500 mb-2">{couponError}</p>}
          {coupon && <p className="text-xs text-green-600 mb-2">Coupon "{coupon.code}" applied.</p>}

          <div className="space-y-2 text-sm border-t border-gray-200 dark:border-slate-800 pt-3">
            <Row label="Subtotal" value={formatPrice(subtotal)} />
            {discount > 0 && <Row label="Discount" value={`-${formatPrice(discount)}`} green />}
            <Row label="Shipping" value={shipping === 0 ? "Free" : formatPrice(shipping)} />
            <div className="flex justify-between pt-2 border-t border-gray-200 dark:border-slate-800">
              <span className="font-bold text-gray-900 dark:text-white">Total</span>
              <span className="font-bold text-zinc-900 dark:text-white text-lg nums">{formatPrice(grandTotal)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StripeCardForm({ amount, disabled, onError, onPaid, placing, setPlacing }) {
  const stripe = useStripe();
  const elements = useElements();

  const handlePay = async () => {
    onError("");
    if (!stripe || !elements) return;
    setPlacing(true);
    try {
      const intentRes = await paymentsAPI.createIntent(amount);
      const clientSecret = intentRes.data.data.clientSecret;

      const result = await stripe.confirmCardPayment(clientSecret, {
        payment_method: { card: elements.getElement(CardElement) },
      });

      if (result.error) {
        onError(result.error.message || "Payment failed.");
        setPlacing(false);
        return;
      }

      if (result.paymentIntent && result.paymentIntent.status === "succeeded") {
        await onPaid();
      } else {
        onError("Payment was not completed.");
        setPlacing(false);
      }
    } catch (err) {
      onError(err.response?.data?.message || "Payment failed.");
      setPlacing(false);
    }
  };

  return (
    <div>
      <div className="border border-gray-300 dark:border-slate-700 rounded-lg p-3 mb-3 bg-white">
        <CardElement options={{ style: { base: { fontSize: "15px" } } }} />
      </div>
      <button
        onClick={handlePay}
        disabled={disabled || !stripe}
        className="w-full bg-brand text-brand-fg py-3 rounded-full font-semibold hover:opacity-90 active:scale-[0.99] transition disabled:opacity-60 flex items-center justify-center gap-2"
      >
        {placing && <Loader2 size={16} className="animate-spin" />}
        Pay {formatPrice(amount)}
      </button>
    </div>
  );
}

function Field({ label, value, onChange, full }) {
  return (
    <div className={full ? "col-span-2" : ""}>
      <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-gray-300 dark:border-slate-700 dark:bg-slate-800 rounded-lg px-3 py-2 text-sm"
      />
    </div>
  );
}

function Row({ label, value, green }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500 dark:text-gray-400">{label}</span>
      <span className={green ? "font-medium text-green-600" : "font-medium"}>{value}</span>
    </div>
  );
}
