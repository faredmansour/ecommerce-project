import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { productsAPI, categoriesAPI } from "../services/api";
import ProductCard from "../components/ProductCard";
import { SlidersHorizontal, X } from "lucide-react";

export default function CategoryPage() {
  const [searchParams] = useSearchParams();
  const selectedCategory = searchParams.get("cat") || "";
  const searchQuery = searchParams.get("search") || "";

  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [activeCategory, setActiveCategory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState("default");

  useEffect(() => {
    categoriesAPI.getAllRaw().then((res) => {
      const raw = res.data;
      if (Array.isArray(raw)) {
        setCategories(raw);
        if (selectedCategory) {
          const found = raw.find((c) => c.name === selectedCategory);
          if (found) setActiveCategory(found);
        }
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (selectedCategory && categories.length > 0) {
      setActiveCategory(categories.find((c) => c.name === selectedCategory) || null);
    } else if (!selectedCategory) {
      setActiveCategory(null);
    }
  }, [selectedCategory, categories]);

  useEffect(() => {
    setLoading(true);
    productsAPI
      .getAll(activeCategory?._id || undefined, searchQuery || undefined)
      .then((res) => setProducts(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [activeCategory, searchQuery]);

  const sortedProducts = [...products].sort((a, b) => {
    switch (sortBy) {
      case "price-low": return a.price - b.price;
      case "price-high": return b.price - a.price;
      case "rating": return (b.rating || 0) - (a.rating || 0);
      case "name": return a.name.localeCompare(b.name);
      default: return 0;
    }
  });

  const chip = (active) =>
    `w-full text-left px-3 py-2 text-sm rounded-lg transition ${
      active
        ? "bg-gold/15 text-gold font-semibold"
        : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
    }`;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-zinc-900 dark:text-white">
            {searchQuery ? `Search: “${searchQuery}”` : activeCategory?.name || "All Products"}
          </h1>
          <p className="text-sm text-zinc-500 mt-1 nums">{sortedProducts.length} products found</p>
        </div>
        <div className="flex items-center gap-2">
          <SlidersHorizontal size={16} className="text-zinc-400" />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="border border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold"
          >
            <option value="default">Sort: Featured</option>
            <option value="price-low">Price: Low to High</option>
            <option value="price-high">Price: High to Low</option>
            <option value="rating">Highest Rated</option>
            <option value="name">Name A–Z</option>
          </select>
        </div>
      </div>

      <div className="flex gap-8">
        {/* Sidebar */}
        <aside className="w-52 shrink-0 hidden md:block">
          <div className="sticky top-28">
            <h3 className="font-display font-bold text-zinc-900 dark:text-white mb-3">Categories</h3>
            <div className="space-y-1">
              <button onClick={() => setActiveCategory(null)} className={chip(!activeCategory)}>
                All Products
              </button>
              {categories.map((cat) => (
                <button key={cat._id} onClick={() => setActiveCategory(cat)} className={chip(activeCategory?._id === cat._id)}>
                  {cat.name}
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* Grid */}
        <div className="flex-1 min-w-0">
          {activeCategory && (
            <div className="mb-4">
              <span className="inline-flex items-center gap-1.5 text-sm bg-gold/15 text-gold px-3 py-1 rounded-full">
                {activeCategory.name}
                <button onClick={() => setActiveCategory(null)} aria-label="Clear filter"><X size={14} /></button>
              </span>
            </div>
          )}

          {loading ? (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-5">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden animate-pulse">
                  <div className="aspect-square bg-zinc-200 dark:bg-zinc-800" />
                  <div className="p-4 space-y-2">
                    <div className="h-4 bg-zinc-200 dark:bg-zinc-800 rounded w-4/5" />
                    <div className="h-8 bg-zinc-200 dark:bg-zinc-800 rounded mt-3" />
                  </div>
                </div>
              ))}
            </div>
          ) : sortedProducts.length === 0 ? (
            <div className="text-center py-20 rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-700">
              <p className="text-zinc-600 dark:text-zinc-300 text-lg font-medium">No products found</p>
              <p className="text-zinc-400 text-sm mt-1">Try adjusting your search or filter.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-5">
              {sortedProducts.map((product) => (
                <ProductCard key={product._id || product.id} product={product} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
