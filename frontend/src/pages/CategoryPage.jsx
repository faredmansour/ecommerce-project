import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { SlidersHorizontal, X } from "lucide-react";
import { EmptyState, Input, LoadingState, Pagination, Select } from "../components/ui";
import ProductCard from "../components/ProductCard";
import { categoriesAPI, productsAPI } from "../services/api";

const PAGE_SIZE = 12;

export default function CategoryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedCategory = searchParams.get("cat") || "";
  const searchQuery = searchParams.get("search") || "";

  const [categories, setCategories] = useState([]);
  const [categoriesLoaded, setCategoriesLoaded] = useState(false);
  const [categoryError, setCategoryError] = useState("");
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [sortBy, setSortBy] = useState("default");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [inStockOnly, setInStockOnly] = useState(false);
  const [page, setPage] = useState(1);

  const activeCategory = categories.find((category) => category.name === selectedCategory) || null;

  useEffect(() => {
    let isCurrent = true;

    categoriesAPI.getAllRaw()
      .then(({ data }) => {
        if (!Array.isArray(data)) {
          throw new Error("Category response was not a list.");
        }
        if (isCurrent) {
          setCategories(data);
          setCategoryError("");
        }
      })
      .catch((requestError) => {
        if (isCurrent) {
          setCategoryError(requestError.response?.data?.message || requestError.message || "Could not load categories.");
        }
      })
      .finally(() => {
        if (isCurrent) setCategoriesLoaded(true);
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  useEffect(() => {
    if (selectedCategory && !categoriesLoaded) return undefined;

    let isCurrent = true;
    setLoading(true);
    setError("");

    productsAPI.getAll(activeCategory?._id || undefined, searchQuery || undefined)
      .then(({ data }) => {
        if (!Array.isArray(data)) {
          throw new Error("Product response was not a list.");
        }
        if (isCurrent) setProducts(data);
      })
      .catch((requestError) => {
        if (isCurrent) {
          setProducts([]);
          setError(requestError.response?.data?.message || requestError.message || "Could not load products.");
        }
      })
      .finally(() => {
        if (isCurrent) setLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [activeCategory?._id, categoriesLoaded, loadAttempt, searchQuery, selectedCategory]);

  const filteredProducts = useMemo(() => {
    const min = priceMin === "" ? null : Number(priceMin);
    const max = priceMax === "" ? null : Number(priceMax);
    const filtered = products.filter((product) => {
      const price = Number(product.price);
      return (min === null || price >= min)
        && (max === null || price <= max)
        && (!inStockOnly || Number(product.stock) > 0);
    });

    return filtered.sort((a, b) => {
      switch (sortBy) {
        case "price-low":
          return Number(a.price) - Number(b.price);
        case "price-high":
          return Number(b.price) - Number(a.price);
        case "rating":
          return Number(b.rating || 0) - Number(a.rating || 0);
        case "name":
          return String(a.name || "").localeCompare(String(b.name || ""));
        default:
          return 0;
      }
    });
  }, [inStockOnly, priceMax, priceMin, products, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / PAGE_SIZE));
  const paginatedProducts = filteredProducts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [sortBy, priceMin, priceMax, inStockOnly, activeCategory?._id, searchQuery]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const selectCategory = (category) => {
    const nextParams = new URLSearchParams(searchParams);
    if (category) {
      nextParams.set("cat", category.name);
    } else {
      nextParams.delete("cat");
    }
    setSearchParams(nextParams);
  };

  const clearFilters = () => {
    setPriceMin("");
    setPriceMax("");
    setInStockOnly(false);
    setSortBy("default");
    setPage(1);
    selectCategory(null);
  };

  const activeFilters = [
    ...(activeCategory ? [{
      key: "category",
      label: activeCategory.name,
      onRemove: () => selectCategory(null),
    }] : []),
    ...(priceMin ? [{
      key: "minimum-price",
      label: `Min: ${priceMin}`,
      onRemove: () => setPriceMin(""),
    }] : []),
    ...(priceMax ? [{
      key: "maximum-price",
      label: `Max: ${priceMax}`,
      onRemove: () => setPriceMax(""),
    }] : []),
    ...(inStockOnly ? [{
      key: "in-stock",
      label: "In stock",
      onRemove: () => setInStockOnly(false),
    }] : []),
  ];

  return (
    <div className="mx-auto max-w-content px-4 py-6 sm:py-8">
      <header className="mb-5 flex flex-col gap-4 border-b border-line pb-5 sm:mb-7 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-brand">Shop</p>
          <h1 className="font-display text-2xl font-bold text-ink dark:text-white sm:text-3xl">
            {searchQuery ? `Search: “${searchQuery}”` : activeCategory?.name || "All Products"}
          </h1>
          <p className="mt-1 text-sm text-muted nums" aria-live="polite">
            {filteredProducts.length} products
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:items-end">
          <label className="flex items-center gap-2 text-sm text-muted">
            <SlidersHorizontal size={16} aria-hidden="true" />
            <span>Sort by</span>
            <Select
              aria-label="Sort products"
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value)}
              className="min-w-40 bg-surface px-3 py-2 text-ink"
            >
              <option value="default">Sort: Featured</option>
              <option value="price-low">Price: Low to High</option>
              <option value="price-high">Price: High to Low</option>
              <option value="rating">Highest Rated</option>
              <option value="name">Name A–Z</option>
            </Select>
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <Input
              type="number"
              min="0"
              step="any"
              aria-label="Minimum price"
              placeholder="Min price"
              value={priceMin}
              onChange={(event) => setPriceMin(event.target.value)}
              className="w-28"
            />
            <Input
              type="number"
              min="0"
              step="any"
              aria-label="Maximum price"
              placeholder="Max price"
              value={priceMax}
              onChange={(event) => setPriceMax(event.target.value)}
              className="w-28"
            />
            <label className="flex min-h-11 items-center gap-2 text-sm text-muted">
              <input
                type="checkbox"
                checked={inStockOnly}
                onChange={(event) => setInStockOnly(event.target.checked)}
                className="h-4 w-4 accent-brand"
              />
              In stock only
            </label>
            {activeFilters.length === 0 && (
              <button
                type="button"
                onClick={clearFilters}
                className="min-h-11 rounded px-2 py-1 text-sm text-ink transition-colors hover:bg-brand-soft"
              >
                Clear all filters
              </button>
            )}
          </div>
        </div>
      </header>

      <nav aria-label="Product categories" className="mb-4 flex gap-2 overflow-x-auto pb-2 md:hidden">
        <button
          type="button"
          aria-pressed={!activeCategory}
          onClick={() => selectCategory(null)}
          className={`min-h-11 shrink-0 rounded-full border px-4 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${!activeCategory ? "border-brand bg-brand text-brand-fg" : "border-line bg-surface text-ink hover:border-brand hover:text-brand"}`}
        >
          All Products
        </button>
        {categories.map((category) => {
          const active = activeCategory?._id === category._id;
          return (
            <button
              key={category._id}
              type="button"
              aria-pressed={active}
              onClick={() => selectCategory(category)}
              className={`min-h-11 shrink-0 rounded-full border px-4 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${active ? "border-brand bg-brand text-brand-fg" : "border-line bg-surface text-ink hover:border-brand hover:text-brand"}`}
            >
              {category.name}
            </button>
          );
        })}
      </nav>

      {activeFilters.length > 0 && (
        <div aria-label="Applied filters" className="mb-5 flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-muted">
            Applied filters ({activeFilters.length})
          </span>
          {activeFilters.map((filter) => (
            <button
              key={filter.key}
              type="button"
              onClick={filter.onRemove}
              aria-label={`Remove ${filter.label} filter`}
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-brand/30 bg-brand-soft px-3 text-sm font-medium text-ink transition-colors hover:border-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              {filter.label}
              <X size={14} aria-hidden="true" />
            </button>
          ))}
          <button
            type="button"
            onClick={clearFilters}
            className="min-h-11 px-2 text-sm font-medium text-muted underline underline-offset-2 transition-colors hover:text-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            Clear all
          </button>
        </div>
      )}

      <div className="grid items-start gap-6 md:grid-cols-[200px_minmax(0,1fr)] md:gap-8">
        <aside aria-label="Product categories" className="hidden border-r border-line pr-4 md:block">
          <h2 className="mb-3 font-display text-base font-bold text-ink dark:text-white">Categories</h2>
          <nav className="space-y-1">
            <button
              type="button"
              aria-pressed={!activeCategory}
              onClick={() => selectCategory(null)}
              className={`min-h-11 w-full border-l-2 px-3 text-left text-sm transition-colors duration-200 ${!activeCategory ? "border-brand bg-brand-soft font-semibold text-ink" : "border-transparent text-muted hover:bg-surface-muted hover:text-ink"}`}
            >
              All Products
            </button>
            {categories.map((category) => {
              const active = activeCategory?._id === category._id;
              return (
                <button
                  key={category._id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => selectCategory(category)}
                  className={`min-h-11 w-full border-l-2 px-3 text-left text-sm transition-colors duration-200 ${active ? "border-brand bg-brand-soft font-semibold text-ink" : "border-transparent text-muted hover:bg-surface-muted hover:text-ink"}`}
                >
                  {category.name}
                </button>
              );
            })}
          </nav>
        </aside>

        <section aria-label="Products" className="min-w-0">
          {categoryError && (
            <div role="alert" className="mb-4 border border-state-danger-border bg-state-danger-bg px-4 py-3 text-sm text-state-danger">
              Could not load categories: {categoryError}
            </div>
          )}

          {loading ? (
            <LoadingState label="Loading products" />
          ) : error ? (
            <div role="alert" className="border border-state-danger-border bg-state-danger-bg px-4 py-5 text-sm text-state-danger">
              <p className="font-semibold">{error}</p>
              <button
                type="button"
                onClick={() => setLoadAttempt((attempt) => attempt + 1)}
                className="mt-3 min-h-11 rounded px-3 font-semibold underline underline-offset-2"
              >
                Try again
              </button>
            </div>
          ) : filteredProducts.length === 0 ? (
            <EmptyState
              title="No products found"
              description="Try adjusting your filters or search."
              className="border border-dashed border-line bg-surface px-4"
            />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
                {paginatedProducts.map((product) => (
                  <ProductCard key={product._id || product.id} product={product} />
                ))}
              </div>
              <Pagination page={page} pages={totalPages} onChange={setPage} className="mt-4" />
            </>
          )}
        </section>
      </div>
    </div>
  );
}
