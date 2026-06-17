import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Star, ShoppingCart, Heart, Minus, Plus, ArrowLeft, Send, Truck, ShieldCheck, RefreshCw } from "lucide-react";
import { productsAPI, cartAPI, wishlistAPI, reviewsAPI } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { formatPrice } from "../lib/format";

const BACKEND = import.meta.env.VITE_API_URL || "http://localhost:8000";

function getCategoryName(category) {
  if (!category) return "";
  if (typeof category === "string") return category;
  if (typeof category === "object") return category.name || "";
  return String(category);
}

function getImageUrl(image) {
  if (!image) return "";
  if (image.startsWith("http") || image.startsWith("data:")) return image;
  return `${BACKEND}${image}`;
}

function getFallbackImage(name = "Product") {
  const label = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="720" height="720" viewBox="0 0 720 720">
      <defs>
        <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
          <stop stop-color="#f5c451"/>
          <stop offset="1" stop-color="#18181b"/>
        </linearGradient>
      </defs>
      <rect width="720" height="720" fill="url(#g)"/>
      <circle cx="528" cy="160" r="146" fill="rgba(255,255,255,.16)"/>
      <rect x="138" y="450" width="444" height="78" rx="26" fill="rgba(255,255,255,.24)"/>
      <text x="360" y="372" text-anchor="middle" font-family="Arial, sans-serif" font-size="150" font-weight="700" fill="#fff">${label || "P"}</text>
    </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

export default function ProductDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const [adding, setAdding] = useState(false);
  const [addedMessage, setAddedMessage] = useState("");
  const [reviews, setReviews] = useState([]);
  const [reviewText, setReviewText] = useState("");
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewError, setReviewError] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);

  useEffect(() => {
    if (id) {
      setLoading(true);
      productsAPI.getById(id).then((res) => setProduct(res.data)).catch(() => navigate("/home")).finally(() => setLoading(false));
      reviewsAPI.getForProduct(id).then((res) => setReviews(res.data.data || res.data || [])).catch(() => setReviews([]));
    }
  }, [id, navigate]);

  const handleAddToCart = async () => {
    if (!isAuthenticated) return navigate("/login");
    setAdding(true);
    try {
      await cartAPI.add(product._id || product.id, quantity, {
        name: product.name,
        price: product.price || 0,
        category: getCategoryName(product.category),
        image: getImageUrl(product.image),
        original_price: product.original_price,
      });
      setAddedMessage("Added to cart!");
      setTimeout(() => setAddedMessage(""), 2000);
    } catch {
      setAddedMessage("Failed to add");
    }
    setAdding(false);
  };

  const handleToggleWishlist = async () => {
    if (!isAuthenticated) return navigate("/login");
    try {
      await wishlistAPI.toggle(product._id || product.id, {
        name: product.name,
        image: getImageUrl(product.image),
        category: getCategoryName(product.category),
      });
      setAddedMessage("Wishlist updated!");
      setTimeout(() => setAddedMessage(""), 2000);
    } catch {
      /* silent */
    }
  };

  const handleSubmitReview = async (e) => {
    e.preventDefault();
    if (!isAuthenticated) return navigate("/login");
    if (!reviewText.trim()) {
      setReviewError("Please write your review.");
      return;
    }
    setSubmittingReview(true);
    setReviewError("");
    try {
      await reviewsAPI.submit(product._id || product.id, { comment: reviewText, rating: reviewRating });
      const updated = await reviewsAPI.getForProduct(product._id || product.id);
      setReviews(updated.data.data || updated.data || []);
      setReviewText("");
      setReviewRating(5);
    } catch (err) {
      setReviewError(err.response?.data?.message || "Unable to submit review.");
    } finally {
      setSubmittingReview(false);
    }
  };

  if (loading) {
    return <div className="max-w-7xl mx-auto px-4 py-16 text-center text-zinc-500">Loading…</div>;
  }
  if (!product) {
    return <div className="max-w-7xl mx-auto px-4 py-16 text-center text-zinc-500">Product not found</div>;
  }

  const discount = product.original_price
    ? Math.round(((product.original_price - product.price) / product.original_price) * 100)
    : 0;
  const rating = Math.round(product.rating || 0);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-zinc-500 hover:text-gold mb-6 transition">
        <ArrowLeft size={16} /> Back
      </button>

      <div className="grid md:grid-cols-2 gap-10">
        {/* Image */}
        <div className="relative bg-zinc-100 dark:bg-zinc-800 rounded-2xl overflow-hidden aspect-square border border-zinc-200 dark:border-zinc-800">
          <img
            src={getImageUrl(product.image) || getFallbackImage(product.name)}
            alt={product.name}
            className="w-full h-full object-cover"
            onError={(e) => { e.target.src = getFallbackImage(product.name); }}
          />
          {discount > 0 && (
            <span className="absolute top-4 left-4 bg-gold text-gold-fg text-sm font-bold px-3 py-1 rounded-full nums">-{discount}%</span>
          )}
        </div>

        {/* Details */}
        <div>
          <p className="text-xs text-gold font-semibold uppercase tracking-wider mb-2">{getCategoryName(product.category)}</p>
          <h1 className="font-display text-3xl font-extrabold text-zinc-900 dark:text-white mb-3">{product.name}</h1>

          <div className="flex items-center gap-2 mb-5">
            <div className="flex items-center gap-0.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} size={16} className={i < rating ? "text-gold fill-gold" : "text-zinc-300 dark:text-zinc-600"} />
              ))}
            </div>
            <span className="text-sm text-zinc-500 nums">({product.reviews_count || 0} reviews)</span>
          </div>

          <div className="flex items-baseline gap-3 mb-6">
            <span className="text-3xl font-bold text-zinc-900 dark:text-white nums">{formatPrice(product.price)}</span>
            {product.original_price && (
              <span className="text-xl text-zinc-400 line-through nums">{formatPrice(product.original_price)}</span>
            )}
          </div>

          <p className="text-zinc-600 dark:text-zinc-300 mb-8 leading-relaxed">{product.description}</p>

          {/* Quantity */}
          <div className="flex items-center gap-4 mb-6">
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Quantity</span>
            <div className="flex items-center border border-zinc-300 dark:border-zinc-700 rounded-full">
              <button onClick={() => setQuantity(Math.max(1, quantity - 1))} className="p-2.5 hover:text-gold transition"><Minus size={16} /></button>
              <span className="px-4 text-sm font-semibold min-w-10 text-center nums">{quantity}</span>
              <button onClick={() => setQuantity(quantity + 1)} className="p-2.5 hover:text-gold transition"><Plus size={16} /></button>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleAddToCart}
              disabled={adding}
              className="flex-1 flex items-center justify-center gap-2 bg-brand text-brand-fg py-3.5 rounded-full font-semibold hover:opacity-90 active:scale-[0.99] transition disabled:opacity-50"
            >
              <ShoppingCart size={18} /> {adding ? "Adding…" : "Add to Cart"}
            </button>
            <button
              onClick={handleToggleWishlist}
              aria-label="Add to wishlist"
              className="p-3.5 border border-zinc-300 dark:border-zinc-700 rounded-full hover:border-gold hover:text-gold transition"
            >
              <Heart size={20} />
            </button>
          </div>

          {addedMessage && (
            <div className="mt-4 p-3 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 rounded-xl text-sm text-green-700 dark:text-green-400 text-center">
              {addedMessage}
            </div>
          )}

          {/* Reassurance */}
          <div className="grid grid-cols-3 gap-3 mt-8">
            {[
              { icon: Truck, label: "Free shipping" },
              { icon: ShieldCheck, label: "Secure payment" },
              { icon: RefreshCw, label: "30-day returns" },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex flex-col items-center gap-1.5 text-center rounded-xl border border-zinc-200 dark:border-zinc-800 py-3 px-2">
                <Icon size={18} className="text-gold" />
                <span className="text-[11px] text-zinc-500">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Reviews */}
      <section className="mt-14 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 sm:p-8 shadow-card">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between mb-6">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-gold font-semibold">Customer Reviews</p>
            <h2 className="font-display text-2xl font-extrabold text-zinc-900 dark:text-white">What shoppers are saying</h2>
          </div>
          <div className="text-right">
            <p className="text-sm text-zinc-500 nums">{reviews.length} review{reviews.length === 1 ? "" : "s"}</p>
            <p className="text-2xl font-bold text-gold nums">{(product.rating || 0).toFixed(1)} / 5</p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="space-y-4">
            {reviews.length === 0 ? (
              <div className="rounded-2xl bg-zinc-50 dark:bg-zinc-800/50 p-8 text-center text-zinc-500">
                No reviews yet. Be the first to review this product.
              </div>
            ) : (
              reviews.map((review) => (
                <div key={review._id || `${review.user}-${review.createdAt}`} className="rounded-2xl border border-zinc-100 dark:border-zinc-800 p-5 bg-zinc-50 dark:bg-zinc-800/40">
                  <div className="flex items-center justify-between gap-4 mb-2">
                    <div>
                      <p className="font-semibold text-zinc-900 dark:text-white">{review.user?.name || review.name || "Anonymous"}</p>
                      <p className="text-xs text-zinc-500">{new Date(review.createdAt || Date.now()).toLocaleDateString()}</p>
                    </div>
                    <div className="flex items-center gap-0.5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star key={i} size={14} className={i < (review.rating || 0) ? "text-gold fill-gold" : "text-zinc-300 dark:text-zinc-600"} />
                      ))}
                    </div>
                  </div>
                  {review.title && <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">{review.title}</p>}
                  <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">{review.comment || review.text}</p>
                </div>
              ))
            )}
          </div>

          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40 p-6">
            <h3 className="font-display text-lg font-bold text-zinc-900 dark:text-white mb-4">Write a review</h3>
            {isAuthenticated ? (
              <form onSubmit={handleSubmitReview} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">Rating</label>
                  <select
                    value={reviewRating}
                    onChange={(e) => setReviewRating(Number(e.target.value))}
                    className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold"
                  >
                    {[5, 4, 3, 2, 1].map((v) => <option key={v} value={v}>{v} Stars</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">Review</label>
                  <textarea
                    value={reviewText}
                    onChange={(e) => setReviewText(e.target.value)}
                    rows={5}
                    placeholder="Share your experience"
                    className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold"
                  />
                </div>
                {reviewError && <p className="text-sm text-red-500">{reviewError}</p>}
                <button
                  type="submit"
                  disabled={submittingReview}
                  className="inline-flex items-center gap-2 rounded-full bg-brand text-brand-fg px-5 py-2.5 font-semibold hover:opacity-90 transition disabled:opacity-60"
                >
                  <Send size={16} /> {submittingReview ? "Submitting…" : "Submit Review"}
                </button>
              </form>
            ) : (
              <div className="text-sm text-zinc-600 dark:text-zinc-300">
                Please <button onClick={() => navigate("/login")} className="font-semibold text-gold underline">login</button> to leave a review.
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
