import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Star, ShoppingCart, Heart, Minus, Plus, ArrowLeft, Send } from "lucide-react";
import { productsAPI, cartAPI, wishlistAPI, reviewsAPI } from "../services/api";
import { useAuth } from "../context/AuthContext";

const BACKEND = import.meta.env.VITE_API_URL || "http://localhost:8000";

function getCategoryName(category) {
  if (!category) return "";
  if (typeof category === "string") return category;
  if (typeof category === "object") return category.name || "";
  return String(category);
}

function getImageUrl(image) {
  if (!image) return "/placeholder.png";
  if (image.startsWith("http")) return image;
  return `${BACKEND}${image}`;
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
      productsAPI
        .getById(id)
        .then((res) => setProduct(res.data))
        .catch(() => navigate("/home"))
        .finally(() => setLoading(false));

      reviewsAPI
        .getForProduct(id)
        .then((res) => setReviews(res.data.data || res.data || []))
        .catch(() => setReviews([]));
    }
  }, [id, navigate]);

  const handleAddToCart = async () => {
    if (!isAuthenticated) {
      navigate("/login");
      return;
    }
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
    if (!isAuthenticated) {
      navigate("/login");
      return;
    }
    try {
      const res = await wishlistAPI.toggle(product._id || product.id);
      setAddedMessage(res.data.added ? "Added to wishlist!" : "Removed from wishlist");
      setTimeout(() => setAddedMessage(""), 2000);
    } catch {
      // handle silently
    }
  };

  const handleSubmitReview = async (e) => {
    e.preventDefault();
    if (!isAuthenticated) {
      navigate("/login");
      return;
    }
    if (!reviewText.trim()) {
      setReviewError("Please write your review.");
      return;
    }
    setSubmittingReview(true);
    setReviewError("");

    try {
      await reviewsAPI.submit(product._id || product.id, {
        text: reviewText,
        rating: reviewRating,
      });
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
    return <div className="max-w-7xl mx-auto px-4 py-16 text-center text-gray-500">Loading...</div>;
  }

  if (!product) {
    return <div className="max-w-7xl mx-auto px-4 py-16 text-center text-gray-500">Product not found</div>;
  }

  const discount = product.original_price
    ? Math.round(((product.original_price - product.price) / product.original_price) * 100)
    : 0;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-orange-500 mb-6 transition-colors"
      >
        <ArrowLeft size={16} /> Back
      </button>

      <div className="grid md:grid-cols-2 gap-10">
        {/* Image */}
        <div className="bg-gray-100 rounded-xl overflow-hidden aspect-square">
          <img
            src={getImageUrl(product.image)}
            alt={product.name}
            className="w-full h-full object-cover"
            onError={(e) => { e.target.src = "/placeholder.png"; }}
          />
        </div>

        {/* Details */}
        <div>
          <p className="text-sm text-orange-500 font-medium uppercase tracking-wide mb-2">{getCategoryName(product.category)}</p>
          <h1 className="text-3xl font-bold text-gray-900 mb-4">{product.name}</h1>

          <div className="flex items-center gap-2 mb-4">
            <div className="flex items-center gap-0.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={i}
                  size={16}
                  className={i < Math.round(product.rating) ? "text-yellow-400 fill-yellow-400" : "text-gray-300"}
                />
              ))}
            </div>
            <span className="text-sm text-gray-500">({product.reviews_count} reviews)</span>
          </div>

          <div className="flex items-center gap-3 mb-6">
            <span className="text-3xl font-bold text-orange-500">${product.price.toFixed(2)}</span>
            {product.original_price && (
              <>
                <span className="text-xl text-gray-400 line-through">${product.original_price.toFixed(2)}</span>
                <span className="bg-red-100 text-red-600 text-sm font-medium px-2 py-0.5 rounded">-{discount}%</span>
              </>
            )}
          </div>

          <p className="text-gray-600 mb-8 leading-relaxed">{product.description}</p>

          {/* Quantity */}
          <div className="flex items-center gap-4 mb-6">
            <span className="text-sm font-medium text-gray-700">Quantity:</span>
            <div className="flex items-center border border-gray-300 rounded-lg">
              <button
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                className="p-2 hover:bg-gray-100 transition-colors"
              >
                <Minus size={16} />
              </button>
              <span className="px-4 py-2 text-sm font-medium min-w-8 text-center">{quantity}</span>
              <button
                onClick={() => setQuantity(quantity + 1)}
                className="p-2 hover:bg-gray-100 transition-colors"
              >
                <Plus size={16} />
              </button>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleAddToCart}
              disabled={adding}
              className="flex-1 flex items-center justify-center gap-2 bg-orange-500 text-white py-3 rounded-lg font-medium hover:bg-orange-600 transition-colors disabled:opacity-50"
            >
              <ShoppingCart size={18} />
              {adding ? "Adding..." : "Add to Cart"}
            </button>
            <button
              onClick={handleToggleWishlist}
              className="p-3 border border-gray-300 rounded-lg hover:border-orange-500 hover:text-orange-500 transition-colors"
            >
              <Heart size={20} />
            </button>
          </div>

          {addedMessage && (
            <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-600 text-center">
              {addedMessage}
            </div>
          )}
        </div>
      </div>

      <section className="mt-12 bg-white rounded-3xl border border-gray-200 p-6 shadow-sm dark:bg-slate-900 dark:border-gray-700">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between mb-6">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-orange-500">Customer Reviews</p>
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">What shoppers are saying</h2>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-500 dark:text-gray-400">{reviews.length} review{reviews.length === 1 ? "" : "s"}</p>
            <p className="text-2xl font-bold text-orange-500">{product.rating?.toFixed(1) || "0.0"} / 5</p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="space-y-4">
            {reviews.length === 0 ? (
              <div className="rounded-3xl bg-orange-50 p-8 text-center text-gray-600 dark:bg-orange-950/20 dark:text-gray-300">
                No reviews yet. Be the first to review this product.
              </div>
            ) : (
              reviews.map((review) => (
                <div key={review._id || review.id || `${review.user}-${review.createdAt}`} className="rounded-3xl border border-gray-100 p-5 dark:border-gray-700 bg-gray-50 dark:bg-slate-950">
                  <div className="flex items-center justify-between gap-4 mb-3">
                    <div>
                      <p className="font-semibold text-gray-900 dark:text-white">{review.user?.name || review.name || "Anonymous"}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{new Date(review.createdAt || review.created_at || Date.now()).toLocaleDateString()}</p>
                    </div>
                    <div className="flex items-center gap-1 text-yellow-400">
                      {Array.from({ length: 5 }).map((_, index) => (
                        <Star key={index} size={14} className={index < (review.rating || 0) ? "text-yellow-400" : "text-gray-300"} />
                      ))}
                    </div>
                  </div>
                  <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-200">{review.text || review.comment}</p>
                </div>
              ))
            )}
          </div>

          <div className="rounded-3xl border border-gray-200 bg-gray-50 p-6 dark:border-gray-700 dark:bg-slate-950">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Write a review</h3>
            {isAuthenticated ? (
              <form onSubmit={handleSubmitReview} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Rating</label>
                  <select
                    value={reviewRating}
                    onChange={(e) => setReviewRating(Number(e.target.value))}
                    className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm focus:border-orange-500 focus:outline-none dark:border-gray-700 dark:bg-slate-900 dark:text-gray-100"
                  >
                    {[5, 4, 3, 2, 1].map((value) => (
                      <option key={value} value={value}>
                        {value} Stars
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Review</label>
                  <textarea
                    value={reviewText}
                    onChange={(e) => setReviewText(e.target.value)}
                    rows={5}
                    placeholder="Share your experience"
                    className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm focus:border-orange-500 focus:outline-none dark:border-gray-700 dark:bg-slate-900 dark:text-gray-100"
                  />
                </div>
                {reviewError && <p className="text-sm text-red-500">{reviewError}</p>}
                <button
                  type="submit"
                  disabled={submittingReview}
                  className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-5 py-3 text-white font-semibold hover:bg-orange-600 transition-colors disabled:opacity-60"
                >
                  <Send size={16} /> {submittingReview ? "Submitting..." : "Submit Review"}
                </button>
              </form>
            ) : (
              <div className="text-sm text-gray-600 dark:text-gray-300">
                Please <button onClick={() => navigate("/login")} className="font-semibold text-orange-500 underline">login</button> to leave a review.
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
