import { Link } from "react-router-dom";
import { Heart, ShoppingCart } from "lucide-react";
import { useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { wishlistAPI } from "../services/api";
import { Badge, Button, PriceDisplay, ProductRating } from "./ui";
import ProductImage from "./ProductImage";

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

export default function ProductCard({
  product,
  onAddToCart,
  onToggleWishlist,
  isWishlisted = false,
  addToCartLabel = "Add to Cart",
}) {
  const { isAuthenticated } = useAuth();
  const { addItem } = useCart();
  const [adding, setAdding] = useState(false);
  const [wished, setWished] = useState(false);
  const [cartMessage, setCartMessage] = useState("");
  const [cartMessageIsError, setCartMessageIsError] = useState(false);
  const addingRef = useRef(false);

  const productId = product.product_id || product._id || product.id;
  const categoryName = getCategoryName(product.category);
  const imageUrl = getImageUrl(product.image);
  const rating = Math.round(product.rating || 0);
  const wishlistActive = onToggleWishlist ? isWishlisted : wished;

  const discount = product.original_price
    ? Math.round(((product.original_price - product.price) / product.original_price) * 100)
    : 0;

  const requireAuth = () => {
    if (!isAuthenticated) {
      window.location.href = "/login";
      return false;
    }
    return true;
  };

  const handleAddToCart = async (e) => {
    e.preventDefault();
    if (addingRef.current || Number(product.stock) < 1) return;
    addingRef.current = true;
    setAdding(true);
    setCartMessage("");
    setCartMessageIsError(false);
    try {
      if (onAddToCart) await onAddToCart(product);
      else await addItem(product, 1);
      setCartMessage("Added to cart.");
    } catch (error) {
      setCartMessageIsError(true);
      setCartMessage(error.response?.data?.message || error.message || "Unable to add this product to your cart.");
    } finally {
      addingRef.current = false;
      setAdding(false);
    }
  };

  const handleToggleWishlist = async (e) => {
    e.preventDefault();
    if (onToggleWishlist) {
      await onToggleWishlist(productId, product);
      return;
    }
    if (!requireAuth()) return;
    setWished((w) => !w);
    try {
      await wishlistAPI.toggle(productId, { name: product.name, image: imageUrl, category: categoryName });
    } catch {
      /* silent */
    }
  };

  return (
    <article className="product-card group relative flex h-full flex-col overflow-hidden rounded-md border border-line bg-surface">
      <Link to={`/product/${productId}`} aria-label={`View ${product.name}`} className="relative block aspect-square overflow-hidden bg-surface-muted">
        <ProductImage src={imageUrl} alt={product.name} className="h-full w-full object-contain p-4 transition-transform duration-200 group-hover:scale-[1.02] sm:p-5" />
        {discount > 0 && (
          <Badge variant="accent" className="absolute left-2.5 top-2.5 nums">
            -{discount}%
          </Badge>
        )}
      </Link>

      <div className="flex flex-1 flex-col p-3 sm:p-4">
        {categoryName && (
          <p className="mb-1 truncate text-[11px] font-medium uppercase tracking-wide text-muted">{categoryName}</p>
        )}
        <Link
          to={`/product/${productId}`}
          className="line-clamp-2 min-h-10 text-sm font-semibold leading-5 text-ink transition-colors duration-200 hover:text-brand"
        >
          {product.name}
        </Link>

        {(product.reviews_count > 0 || product.rating > 0) && <ProductRating rating={rating} count={product.reviews_count} className="mt-2" />}

        <PriceDisplay price={product.price || 0} originalPrice={product.original_price} className="mb-3 mt-2 text-lg" />

        <div className="mt-auto flex items-center gap-2 border-t border-line/70 pt-3">
          <Button
            type="button"
            onClick={handleAddToCart}
            disabled={adding || Number(product.stock) < 1}
            aria-label={adding ? "Adding to cart" : addToCartLabel === "Add" ? "Add to cart" : addToCartLabel}
            className="min-w-0 flex-1 px-2 text-xs sm:text-sm"
          >
            <ShoppingCart size={16} className="shrink-0" />
            <span className="hidden truncate sm:inline">{adding ? "Adding…" : addToCartLabel}</span>
            <span className="truncate sm:hidden">{adding ? "Adding…" : addToCartLabel === "Add to Cart" ? "Add" : addToCartLabel}</span>
          </Button>
          <button
            type="button"
            onClick={handleToggleWishlist}
            aria-label={wishlistActive ? "Remove from wishlist" : "Add to wishlist"}
            aria-pressed={wishlistActive}
            className={`grid h-11 w-11 shrink-0 place-items-center rounded-md border transition-colors duration-200 ${wishlistActive ? "border-brand bg-brand-soft text-brand" : "border-line bg-surface text-muted hover:border-brand hover:text-brand"}`}
          >
            <Heart size={18} className={wishlistActive ? "fill-current" : ""} />
          </button>
        </div>
        {cartMessage && <p role={cartMessageIsError ? "alert" : "status"} aria-live="polite" className={`mt-2 text-xs ${cartMessageIsError ? "text-state-danger" : "text-state-success"}`}>{cartMessage}</p>}
      </div>
    </article>
  );
}
