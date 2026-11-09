import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ShoppingCart, Heart, Send } from "lucide-react";
import { productsAPI, wishlistAPI, reviewsAPI } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import ProductCard from "../components/ProductCard";
import ProductImage from "../components/ProductImage";
import { Badge, Breadcrumbs, Button, EmptyState, LoadingState, PriceDisplay, ProductRating, QuantityControl, SectionHeader, Select } from "../components/ui";

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

export default function ProductDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { addItem } = useCart();
  const [product, setProduct] = useState(null);
  const [relatedProducts, setRelatedProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [productError, setProductError] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [relatedError, setRelatedError] = useState("");
  const [selectedImage, setSelectedImage] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [adding, setAdding] = useState(false);
  const [wishlistUpdating, setWishlistUpdating] = useState(false);
  const [wishlisted, setWishlisted] = useState(false);
  const addingRef = useRef(false);
  const [addedMessage, setAddedMessage] = useState("");
  const [messageIsError, setMessageIsError] = useState(false);
  const [reviews, setReviews] = useState([]);
  const [reviewText, setReviewText] = useState("");
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewError, setReviewError] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setProduct(null);
    setProductError("");
    setNotFound(false);
    setRelatedProducts([]);
    setRelatedError("");
    setSelectedImage("");
    setQuantity(1);
    setAddedMessage("");
    setWishlisted(false);
    setReviews([]);

    if (!id) {
      setNotFound(true);
      setLoading(false);
      return () => { cancelled = true; };
    }

    productsAPI.getById(id)
      .then(({ data }) => {
        if (cancelled) return;
        if (!data) {
          setNotFound(true);
          return;
        }
        setProduct(data);
        setSelectedImage(data.image || "");
      })
      .catch((error) => {
        if (cancelled) return;
        if (error.response?.status === 404) {
          setNotFound(true);
        } else {
          setProductError(error.response?.data?.message || error.message || "Could not load this product.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    reviewsAPI.getForProduct(id)
      .then((response) => {
        if (!cancelled) {
          const data = response.data.data || response.data;
          setReviews(Array.isArray(data) ? data : []);
        }
      })
      .catch(() => {
        if (!cancelled) setReviews([]);
      });

    return () => { cancelled = true; };
  }, [id, loadAttempt]);

  useEffect(() => {
    if (!product) return undefined;
    let cancelled = false;
    productsAPI.getAll()
      .then((res) => {
        if (cancelled) return;
        if (!Array.isArray(res.data)) {
          throw new Error("Related products response was not a list.");
        }
        const productId = product._id || product.id;
        const candidates = res.data.filter((candidate) => (candidate._id || candidate.id) !== productId);
        const categoryName = getCategoryName(product.category);
        const sameCategory = candidates.filter((candidate) => getCategoryName(candidate.category) === categoryName);
        setRelatedProducts((sameCategory.length ? sameCategory : candidates).slice(0, 4));
      })
      .catch((error) => {
        if (!cancelled) {
          setRelatedProducts([]);
          setRelatedError(error.response?.data?.message || error.message || "Could not load related products.");
        }
      });
    return () => { cancelled = true; };
  }, [product]);

  useEffect(() => {
    if (!product || !isAuthenticated) {
      setWishlisted(false);
      setWishlistUpdating(false);
      return undefined;
    }

    let cancelled = false;
    setWishlistUpdating(true);
    wishlistAPI.getAll()
      .then((response) => {
        const items = response.data?.data;
        if (!Array.isArray(items)) {
          throw new Error("The wishlist response was invalid.");
        }
        if (!cancelled) {
          const productId = product._id || product.id;
          setWishlisted(items.some((item) => item.product_id === productId));
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setMessageIsError(true);
          setAddedMessage(error.response?.data?.message || error.message || "Could not load your wishlist.");
        }
      })
      .finally(() => {
        if (!cancelled) setWishlistUpdating(false);
      });

    return () => { cancelled = true; };
  }, [isAuthenticated, product]);

  useEffect(() => {
    if (!product) return;
    const stock = Number.isFinite(Number(product.stock)) ? Math.max(1, Math.floor(Number(product.stock))) : 1;
    setQuantity((current) => Math.min(current, stock));
  }, [product]);

  const handleAddToCart = async () => {
    const stock = Number(product.stock);
    if (addingRef.current) return;
    if (!Number.isFinite(stock) || stock < 1 || !Number.isInteger(quantity) || quantity < 1 || quantity > Math.min(99, Math.floor(stock))) {
      setMessageIsError(true);
      setAddedMessage("Choose a quantity within the available stock.");
      return;
    }
    addingRef.current = true;
    setAdding(true);
    setAddedMessage("");
    try {
      await addItem(product, quantity);
      setMessageIsError(false);
      setAddedMessage("Added to cart!");
      setTimeout(() => setAddedMessage(""), 2000);
    } catch (error) {
      setMessageIsError(true);
      setAddedMessage(error.response?.data?.message || error.message || "Failed to add this product to your cart.");
    } finally {
      addingRef.current = false;
      setAdding(false);
    }
  };

  const handleToggleWishlist = async () => {
    if (!isAuthenticated) return navigate("/login");
    setWishlistUpdating(true);
    setAddedMessage("");
    try {
      if (wishlisted) {
        await wishlistAPI.remove(product._id || product.id);
      } else {
        await wishlistAPI.add(product._id || product.id, {
          name: product.name,
          image: getImageUrl(product.image),
          category: getCategoryName(product.category),
        });
      }
      setWishlisted((current) => !current);
      setMessageIsError(false);
      setAddedMessage(wishlisted ? "Removed from wishlist." : "Added to wishlist.");
      setTimeout(() => setAddedMessage(""), 2000);
    } catch (error) {
      setMessageIsError(true);
      setAddedMessage(error.response?.data?.message || error.message || "Could not update your wishlist.");
    } finally {
      setWishlistUpdating(false);
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
    return <LoadingState label="Loading product…" className="min-h-[50vh]" />;
  }
  if (productError) {
    return (
      <div role="alert" className="mx-auto my-12 max-w-content border border-state-danger-border bg-state-danger-bg px-5 py-6 text-state-danger">
        <p className="font-semibold">{productError}</p>
        <Button type="button" onClick={() => setLoadAttempt((attempt) => attempt + 1)} className="mt-4">
          Try again
        </Button>
      </div>
    );
  }
  if (notFound) {
    return <EmptyState title="Product not found" description="This product may no longer be available." className="min-h-[50vh]" />;
  }
  if (!product) {
    return <LoadingState label="Loading product…" className="min-h-[50vh]" />;
  }

  const discount = product.original_price
    ? Math.round(((product.original_price - product.price) / product.original_price) * 100)
    : 0;
  const availableStock = Number.isFinite(Number(product.stock)) ? Math.max(0, Math.floor(Number(product.stock))) : 0;
  const categoryName = getCategoryName(product.category);
  const specifications = [
    ["Category", categoryName || "—"],
    ["Availability", availableStock > 0 ? "In stock" : "Out of stock"],
    ["Quantity available", availableStock],
    ...(Number(product.rating) > 0 ? [["Customer rating", `${Number(product.rating).toFixed(1)} / 5`]] : []),
    ...(product.reviews_count != null ? [["Review count", product.reviews_count]] : []),
    ...(product._id || product.id ? [["Product ID", product._id || product.id]] : []),
  ];

  return (
    <div className="mx-auto max-w-content px-4 py-6 sm:py-8">
        <div className="product-detail-layout grid gap-6 lg:grid-cols-2 lg:gap-10">
          <div className="product-detail-gallery min-w-0">
            <div className="product-detail-image relative aspect-square overflow-hidden rounded-xl border border-line">
              <ProductImage src={getImageUrl(selectedImage)} alt={product.name} className="h-full w-full object-contain p-6 sm:p-10" loading="eager" />
              {discount > 0 && <Badge variant="accent" className="absolute left-4 top-4">Save {discount}%</Badge>}
            </div>
            {product.image && (
              <div aria-label="Product image gallery" className="mt-4 flex gap-3">
                <button
                  type="button"
                  aria-label={`View ${product.name} image`}
                  aria-pressed={selectedImage === product.image}
                  onClick={() => setSelectedImage(product.image)}
                  className={`h-20 w-20 overflow-hidden rounded-lg border bg-surface p-1 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${selectedImage === product.image ? "border-brand ring-1 ring-brand" : "border-line hover:border-brand"}`}
                >
                  <ProductImage src={getImageUrl(product.image)} alt="" className="h-full w-full object-contain" />
                </button>
              </div>
            )}
          </div>

          <div className="product-detail-buybox min-w-0 rounded-xl border border-line">
            <Breadcrumbs
              className="mb-6"
              items={[
                { label: "Home", href: "/" },
                { label: "All Products", href: "/category" },
                ...(categoryName ? [{ label: categoryName, href: `/category?cat=${encodeURIComponent(categoryName)}` }] : []),
                { label: product.name },
              ]}
            />

            {categoryName && <p className="mb-2 text-xs font-semibold uppercase text-brand">{categoryName}</p>}
            <h1 className="font-display text-2xl font-bold leading-tight text-ink dark:text-white sm:text-3xl">{product.name}</h1>

            <a href="#reviews" aria-label={`${Number(product.rating || 0).toFixed(1)} out of 5 stars, ${product.reviews_count || 0} reviews`} className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm text-muted transition hover:text-brand">
              <ProductRating rating={product.rating || 0} />
              <span className="nums">{product.reviews_count || 0} reviews</span>
            </a>

            <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2">
              <PriceDisplay price={product.price || 0} originalPrice={product.original_price} className="text-2xl sm:text-3xl" />
              {discount > 0 && <Badge variant="accent">Save {discount}%</Badge>}
            </div>

            <p className="mt-5 line-clamp-3 max-w-2xl text-sm leading-6 text-muted sm:text-base">{product.description || "No description is available for this product."}</p>

            <div className="mt-6 flex flex-wrap items-center gap-3 border-y border-line py-4">
              {availableStock > 0 ? (
                <Badge variant="success">In stock</Badge>
              ) : (
                <Badge variant="warning">Out of stock</Badge>
              )}
              <span className="text-sm text-muted">{availableStock} available</span>
            </div>

            <div className="mt-5 flex items-center justify-between gap-4">
              <span className="text-sm font-semibold text-ink dark:text-white">Quantity</span>
              {availableStock > 0 ? (
                <QuantityControl value={quantity} onChange={setQuantity} min={1} max={Math.min(99, availableStock)} />
              ) : (
                <span className="text-sm text-muted">Unavailable</span>
              )}
            </div>

            <div className="mt-5 grid grid-cols-[minmax(0,1fr)_48px] gap-2">
              <Button type="button" onClick={handleAddToCart} disabled={adding || availableStock < 1} className="min-h-12 rounded-lg bg-brand px-4 text-sm sm:text-base">
                <ShoppingCart size={18} /> {adding ? "Adding…" : "Add to Cart"}
              </Button>
              <button
                type="button"
                onClick={handleToggleWishlist}
                disabled={wishlistUpdating}
                aria-label={wishlisted ? "Remove from wishlist" : "Add to wishlist"}
                aria-pressed={wishlisted}
                className={`grid h-12 w-12 place-items-center rounded-lg border transition hover:border-brand hover:text-brand disabled:cursor-wait disabled:opacity-60 ${wishlisted ? "border-brand bg-brand-soft text-brand" : "border-line bg-surface text-muted"}`}
              >
                <Heart size={20} className={wishlisted ? "fill-current" : ""} />
              </button>
            </div>

            {addedMessage && (
              <div role={messageIsError ? "alert" : "status"} className={`mt-3 rounded-md border px-4 py-3 text-sm ${messageIsError ? "border-state-danger-border bg-state-danger-bg text-state-danger" : "border-state-success-border bg-state-success-bg text-state-success"}`}>
                {addedMessage}
              </div>
            )}

          </div>
        </div>

        <div className="mt-12 grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section className="rounded-lg border border-line bg-surface p-5 sm:p-7">
            <SectionHeader title="Product description" className="mb-4" />
            <p className="whitespace-pre-line text-sm leading-7 text-muted">{product.description || "No description is available for this product."}</p>
          </section>

          <section className="rounded-lg border border-line bg-surface p-5 sm:p-7">
            <SectionHeader title="Specifications" className="mb-4" />
            <dl className="divide-y divide-line">
              {specifications.map(([label, value]) => (
                <div key={label} className="flex items-start justify-between gap-4 py-3 text-sm first:pt-0 last:pb-0">
                  <dt className="text-muted">{label}</dt>
                  <dd className="text-right font-medium text-ink dark:text-white">{value}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>

        <section id="reviews" className="mt-12 scroll-mt-32">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-line pb-4">
            <div>
              <p className="text-xs font-semibold uppercase text-brand">Customer reviews</p>
              <h2 className="mt-1 font-display text-xl font-bold text-ink dark:text-white">What shoppers are saying</h2>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted nums">{reviews.length} review{reviews.length === 1 ? "" : "s"}</span>
              <span className="font-display text-xl font-bold text-brand nums">              {Number(product.rating || 0).toFixed(1)} / 5</span>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-3">
              {reviews.length === 0 ? (
                <EmptyState title="No reviews yet" description="Be the first to review this product." className="rounded-lg border border-line bg-surface px-4" />
              ) : (
                reviews.map((review) => (
                  <article key={review._id || `${review.user}-${review.createdAt}`} className="rounded-lg border border-line bg-surface p-4 sm:p-5">
                    <div className="mb-2 flex items-center justify-between gap-4">
                      <div>
                        <p className="font-semibold text-ink dark:text-white">{review.user?.name || review.name || "Anonymous"}</p>
                        <p className="text-xs text-muted">{new Date(review.createdAt || Date.now()).toLocaleDateString()}</p>
                      </div>
                      <ProductRating rating={review.rating || 0} />
                    </div>
                    {review.title && <p className="text-sm font-semibold text-ink dark:text-white">{review.title}</p>}
                    <p className="text-sm leading-6 text-muted">{review.comment || review.text}</p>
                  </article>
                ))
              )}
            </div>

            <aside className="h-fit rounded-lg border border-line bg-surface p-5 sm:p-6">
              <h3 className="mb-4 font-display text-lg font-bold text-ink dark:text-white">Write a review</h3>
              {isAuthenticated ? (
                <form onSubmit={handleSubmitReview} className="space-y-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-ink dark:text-zinc-200">Rating</label>
                    <Select value={reviewRating} onChange={(e) => setReviewRating(Number(e.target.value))}>
                      {[5, 4, 3, 2, 1].map((value) => <option key={value} value={value}>{value} Stars</option>)}
                    </Select>
                  </div>
                  <div>
                    <label htmlFor="review-text" className="mb-1.5 block text-sm font-medium text-ink dark:text-zinc-200">Review</label>
                    <textarea
                      id="review-text"
                      value={reviewText}
                      onChange={(e) => setReviewText(e.target.value)}
                      rows={5}
                      placeholder="Share your experience"
                      className="w-full resize-y rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                    />
                  </div>
                  {reviewError && <p role="alert" className="text-sm text-red-600">{reviewError}</p>}
                  <Button type="submit" disabled={submittingReview} className="w-full">
                    <Send size={16} /> {submittingReview ? "Submitting…" : "Submit Review"}
                  </Button>
                </form>
              ) : (
                <div className="text-sm leading-6 text-muted">
                  Please <button onClick={() => navigate("/login")} className="font-semibold text-brand underline underline-offset-2">login</button> to leave a review.
                </div>
              )}
            </aside>
          </div>
        </section>

        {relatedProducts.length > 0 && (
          <section className="mt-12 border-t border-line pt-8">
            <SectionHeader title="Related products" subtitle="More from this collection." />
            <div className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 lg:grid-cols-4">
              {relatedProducts.map((relatedProduct) => (
                <ProductCard key={relatedProduct._id || relatedProduct.id} product={relatedProduct} />
              ))}
            </div>
          </section>
        )}
        {relatedError && (
          <p role="status" className="mt-8 text-sm text-muted">
            Related products are unavailable right now: {relatedError}
          </p>
        )}
    </div>
  );
}
