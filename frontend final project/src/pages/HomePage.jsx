import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Truck, Shield, RefreshCw, Headphones } from "lucide-react";
import { productsAPI, categoriesAPI } from "../services/api";
import ProductCard from "../components/ProductCard";

export default function HomePage() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([productsAPI.getAll(), categoriesAPI.getAllRaw()])
      .then(([productsRes, categoriesRes]) => {
        setProducts(productsRes.data);
        // getAllRaw returns full objects [{_id, name}, ...]
        const raw = categoriesRes.data;
        setCategories(Array.isArray(raw) ? raw : []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const featuredProducts = products.slice(0, 8);

  return (
    <div>
      {/* Hero Section */}
      <section className="bg-gradient-to-r from-orange-500 to-orange-600 text-white">
        <div className="max-w-7xl mx-auto px-4 py-16 flex items-center justify-between">
          <div className="max-w-lg">
            <p className="text-orange-100 text-sm font-medium uppercase tracking-wide mb-2">Welcome to ALFREDO</p>
            <h1 className="text-4xl font-bold mb-4 leading-tight">Discover Amazing Products at Great Prices</h1>
            <p className="text-orange-100 mb-6">Shop the latest trends in electronics, fashion, sports, and more. Free shipping on orders over $50.</p>
            <Link
              to="/category"
              className="inline-flex items-center gap-2 bg-white text-orange-500 font-semibold px-6 py-3 rounded-lg hover:bg-orange-50 transition-colors"
            >
              Shop Now <ArrowRight size={18} />
            </Link>
          </div>
          <div className="hidden md:block">
            <img
              src="Widgets.png"
              alt="Shopping"
              className="w-150 h-64 object-cover rounded-xl shadow-2xl"
            />
          </div>
        </div>
      </section>

      {/* Features Bar */}
      <section className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-100 rounded-lg">
                <Truck size={20} className="text-orange-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">Free Shipping</p>
                <p className="text-xs text-gray-500">On orders over $50</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-100 rounded-lg">
                <Shield size={20} className="text-orange-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">Secure Payment</p>
                <p className="text-xs text-gray-500">100% protected</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-100 rounded-lg">
                <RefreshCw size={20} className="text-orange-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">Easy Returns</p>
                <p className="text-xs text-gray-500">30-day return policy</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-100 rounded-lg">
                <Headphones size={20} className="text-orange-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">24/7 Support</p>
                <p className="text-xs text-gray-500">Dedicated support</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="max-w-7xl mx-auto px-4 py-12">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Shop by Category</h2>
          <Link to="/category" className="text-sm text-orange-500 font-medium hover:text-orange-600 flex items-center gap-1">
            View All <ArrowRight size={14} />
          </Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {categories.map((cat) => (
            <Link
              key={cat._id || cat}
              to={`/category?cat=${encodeURIComponent(cat.name || cat)}`}
              className="bg-white border border-gray-200 rounded-xl p-6 text-center hover:border-orange-300 hover:shadow-md transition-all group"
            >
              <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-3 group-hover:bg-orange-200 transition-colors">
                <span className="text-orange-500 font-bold text-lg">{(cat.name || cat).charAt(0)}</span>
              </div>
              <p className="text-sm font-medium text-gray-900">{cat.name || cat}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* Featured Products */}
      <section className="max-w-7xl mx-auto px-4 py-12">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Featured Products</h2>
          <Link to="/category" className="text-sm text-orange-500 font-medium hover:text-orange-600 flex items-center gap-1">
            View All <ArrowRight size={14} />
          </Link>
        </div>
        {loading ? (
          <div className="text-center py-12 text-gray-500">Loading products...</div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {featuredProducts.map((product) => (
              <ProductCard key={product._id || product.id} product={product} />
            ))}
          </div>
        )}
      </section>

      {/* CTA Banner */}
      <section className="bg-gray-900 text-white">
        <div className="max-w-7xl mx-auto px-4 py-12 text-center">
          <h2 className="text-3xl font-bold mb-3">Join ALFREDO Today</h2>
          <p className="text-gray-400 mb-6 max-w-md mx-auto">Create an account to save your favorites, track orders, and get exclusive deals.</p>
          <Link
            to="/register"
            className="inline-flex items-center gap-2 bg-orange-500 text-white font-semibold px-6 py-3 rounded-lg hover:bg-orange-600 transition-colors"
          >
            Sign Up Free <ArrowRight size={18} />
          </Link>
        </div>
      </section>
    </div>
  );
}
