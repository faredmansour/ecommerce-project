import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { productsAPI, categoriesAPI } from "../services/api";
import ProductCard from "../components/ProductCard";
import { Filter, X } from "lucide-react";

export default function CategoryPage() {
  const [searchParams] = useSearchParams();
  const selectedCategory = searchParams.get("cat") || "";
  const searchQuery = searchParams.get("search") || "";

  const [products, setProducts] = useState([]);
  // categories: array of { _id, name }
  const [categories, setCategories] = useState([]);
  const [activeCategory, setActiveCategory] = useState(null); // { _id, name } or null
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState("default");

  // Load raw categories (objects) once
  useEffect(() => {
    categoriesAPI.getAllRaw().then((res) => {
      const raw = res.data;
      if (Array.isArray(raw)) {
        setCategories(raw);
        // Set initial active category from URL param
        if (selectedCategory) {
          const found = raw.find((c) => c.name === selectedCategory);
          if (found) setActiveCategory(found);
        }
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (selectedCategory && categories.length > 0) {
      const found = categories.find((c) => c.name === selectedCategory);
      setActiveCategory(found || null);
    } else if (!selectedCategory) {
      setActiveCategory(null);
    }
  }, [selectedCategory, categories]);

  useEffect(() => {
    setLoading(true);
    // Pass category _id for filtering (backend uses ObjectId reference)
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

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {searchQuery ? `Search: "${searchQuery}"` : activeCategory?.name || "All Products"}
          </h1>
          <p className="text-sm text-gray-500 mt-1">{sortedProducts.length} products found</p>
        </div>
        <div className="flex items-center gap-3">
          <Filter size={18} className="text-gray-500" />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-500"
          >
            <option value="default">Default</option>
            <option value="price-low">Price: Low to High</option>
            <option value="price-high">Price: High to Low</option>
            <option value="rating">Highest Rated</option>
            <option value="name">Name A-Z</option>
          </select>
        </div>
      </div>

      <div className="flex gap-8">
        {/* Sidebar */}
        <div className="w-48 shrink-0 hidden md:block">
          <h3 className="font-semibold text-gray-900 mb-3">Categories</h3>
          <div className="space-y-1">
            <button
              onClick={() => setActiveCategory(null)}
              className={`w-full text-left px-3 py-2 text-sm rounded-lg transition-colors ${
                !activeCategory ? "bg-orange-100 text-orange-600 font-medium" : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              All Products
            </button>
            {categories.map((cat) => (
              <button
                key={cat._id}
                onClick={() => setActiveCategory(cat)}
                className={`w-full text-left px-3 py-2 text-sm rounded-lg transition-colors ${
                  activeCategory?._id === cat._id ? "bg-orange-100 text-orange-600 font-medium" : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>

        {/* Products Grid */}
        <div className="flex-1">
          {activeCategory && (
            <div className="mb-4 flex items-center gap-2">
              <span className="text-sm bg-orange-100 text-orange-600 px-3 py-1 rounded-full flex items-center gap-1">
                {activeCategory.name}
                <button onClick={() => setActiveCategory(null)}>
                  <X size={14} />
                </button>
              </span>
            </div>
          )}

          {loading ? (
            <div className="text-center py-16 text-gray-500">Loading products...</div>
          ) : sortedProducts.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-gray-500 text-lg">No products found</p>
              <p className="text-gray-400 text-sm mt-1">Try adjusting your search or filter</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-6">
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
