import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  BarChart3,
  Box,
  ImagePlus,
  PackageCheck,
  Pencil,
  Plus,
  Save,
  ShoppingBag,
  Tag,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { adminAPI, categoriesAPI, ordersAPI, productsAPI } from "./../services/api";
import { formatPrice } from "../lib/format";

const BACKEND = import.meta.env.VITE_API_URL || "http://localhost:8000";

const EMPTY_PRODUCT = {
  name: "",
  description: "",
  price: "",
  stock: "",
  category: "",
  image: null,
};

const EMPTY_CATEGORY = {
  name: "",
  description: "",
};

const STATUS_STYLES = {
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
  shipped: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
  delivered: "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400",
};

const getCategoryName = (category) => {
  if (!category) return "Uncategorized";
  if (typeof category === "string") return category;
  return category.name || "Uncategorized";
};

const getProductImage = (image) => {
  if (!image) return "";
  if (image.startsWith("http") || image.startsWith("data:")) return image;
  return `${BACKEND}${image}`;
};

const getFallbackImage = (name = "Product") => {
  const label = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
      <defs>
        <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
          <stop stop-color="#f5c451"/>
          <stop offset="1" stop-color="#18181b"/>
        </linearGradient>
      </defs>
      <rect width="160" height="160" rx="18" fill="url(#g)"/>
      <circle cx="118" cy="36" r="34" fill="rgba(255,255,255,.16)"/>
      <rect x="30" y="96" width="100" height="18" rx="7" fill="rgba(255,255,255,.24)"/>
      <text x="80" y="82" text-anchor="middle" font-family="Arial, sans-serif" font-size="36" font-weight="700" fill="#fff">${label || "P"}</text>
    </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
};

export default function AdminDashboard() {
  const [summary, setSummary] = useState({
    totals: { products: 0, categories: 0, users: 0, orders: 0, revenue: 0, itemsSold: 0 },
    recentOrders: [],
    topProducts: [],
  });
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [productForm, setProductForm] = useState(EMPTY_PRODUCT);
  const [categoryForm, setCategoryForm] = useState(EMPTY_CATEGORY);
  const [editingProduct, setEditingProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const loadDashboard = async () => {
    const [summaryRes, productsRes, categoriesRes] = await Promise.all([
      adminAPI.getSummary(),
      productsAPI.getAll(undefined, undefined, { limit: 1000, sort: "latest" }),
      categoriesAPI.getAllRaw(),
    ]);

    setSummary(summaryRes.data.data);
    setProducts(productsRes.data);
    setCategories(Array.isArray(categoriesRes.data) ? categoriesRes.data : []);
  };

  useEffect(() => {
    loadDashboard()
      .catch(() => setMessage("Could not load dashboard data."))
      .finally(() => setLoading(false));
  }, []);

  const stats = useMemo(
    () => [
      { icon: Box, label: "Products", value: summary.totals.products },
      { icon: ShoppingBag, label: "Orders", value: summary.totals.orders },
      { icon: PackageCheck, label: "Items sold", value: summary.totals.itemsSold },
      { icon: Users, label: "Users", value: summary.totals.users },
      { icon: BarChart3, label: "Revenue", value: formatPrice(summary.totals.revenue) },
      { icon: Tag, label: "Categories", value: summary.totals.categories },
    ],
    [summary]
  );

  const resetProductForm = () => {
    setProductForm(EMPTY_PRODUCT);
    setEditingProduct(null);
  };

  const handleProductChange = (event) => {
    const { name, value, files } = event.target;
    setProductForm((current) => ({
      ...current,
      [name]: files ? files[0] : value,
    }));
  };

  const handleCategoryChange = (event) => {
    const { name, value } = event.target;
    setCategoryForm((current) => ({ ...current, [name]: value }));
  };

  const startEdit = (product) => {
    setEditingProduct(product);
    setProductForm({
      name: product.name || "",
      description: product.description || "",
      price: product.price ?? "",
      stock: product.stock ?? "",
      category: product.category?._id || product.category || "",
      image: null,
    });
  };

  const submitProduct = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    const data = new FormData();
    data.append("name", productForm.name);
    data.append("description", productForm.description);
    data.append("price", productForm.price);
    data.append("stock", productForm.stock || 0);
    data.append("category", productForm.category);
    if (productForm.image) data.append("image", productForm.image);

    try {
      if (editingProduct) {
        await productsAPI.update(editingProduct._id, data);
        setMessage("Product updated successfully.");
      } else {
        await productsAPI.create(data);
        setMessage("Product added successfully.");
      }
      resetProductForm();
      await loadDashboard();
    } catch (err) {
      setMessage(err.response?.data?.message || "Could not save product.");
    } finally {
      setSaving(false);
    }
  };

  const submitCategory = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    try {
      await categoriesAPI.create(categoryForm.name, categoryForm.description);
      setCategoryForm(EMPTY_CATEGORY);
      setMessage("Category added successfully.");
      await loadDashboard();
    } catch (err) {
      setMessage(err.response?.data?.message || "Could not add category.");
    } finally {
      setSaving(false);
    }
  };

  const deleteProduct = async (product) => {
    if (!window.confirm(`Delete ${product.name}?`)) return;
    setMessage("");
    try {
      await productsAPI.remove(product._id);
      setMessage("Product deleted successfully.");
      await loadDashboard();
    } catch (err) {
      setMessage(err.response?.data?.message || "Could not delete product.");
    }
  };

  const updateOrderStatus = async (orderId, status) => {
    try {
      await ordersAPI.updateStatus(orderId, status);
      await loadDashboard();
    } catch {
      setMessage("Could not update order status.");
    }
  };

  if (loading) {
    return <div className="max-w-7xl mx-auto px-4 py-16 text-center text-zinc-500">Loading dashboard...</div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-gold font-semibold">Admin Dashboard</p>
          <h1 className="font-display text-3xl font-extrabold text-zinc-900 dark:text-white">Store control center</h1>
          <p className="mt-1 text-zinc-500">Add products, manage inventory, track orders and watch store performance.</p>
        </div>
        <Link to="/category" className="inline-flex items-center gap-2 rounded-full bg-brand text-brand-fg px-5 py-3 text-sm font-semibold hover:opacity-90 transition">
          <ShoppingBag size={17} /> View Store
        </Link>
      </div>

      {message && (
        <div className="rounded-lg border border-gold/30 bg-gold/10 px-4 py-3 text-sm font-medium text-zinc-800 dark:text-zinc-100">
          {message}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        {stats.map(({ icon: Icon, label, value }) => (
          <div key={label} className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-card">
            <div className="flex items-center gap-2.5 text-gold mb-3">
              <span className="grid place-items-center h-9 w-9 rounded-lg bg-gold/15"><Icon size={18} /></span>
              <span className="text-sm font-medium text-zinc-600 dark:text-zinc-300">{label}</span>
            </div>
            <p className="text-2xl font-extrabold text-zinc-900 dark:text-white nums">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <section className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-card">
          <div className="flex items-center justify-between gap-4 mb-5">
            <div>
              <h2 className="font-display text-xl font-bold text-zinc-900 dark:text-white">Products</h2>
              <p className="text-sm text-zinc-500">Edit inventory and remove old products.</p>
            </div>
            {editingProduct && (
              <button onClick={resetProductForm} className="inline-flex items-center gap-2 rounded-full border border-zinc-300 dark:border-zinc-700 px-3 py-2 text-sm hover:text-gold transition">
                <X size={15} /> Cancel edit
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="text-xs uppercase text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
                <tr>
                  <th className="py-3 pr-4">Product</th>
                  <th className="py-3 pr-4">Category</th>
                  <th className="py-3 pr-4">Price</th>
                  <th className="py-3 pr-4">Stock</th>
                  <th className="py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {products.map((product) => (
                  <tr key={product._id}>
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <img
                          src={getProductImage(product.image) || getFallbackImage(product.name)}
                          alt={product.name}
                          className="h-12 w-12 rounded-lg object-cover bg-zinc-100 dark:bg-zinc-800"
                          onError={(event) => { event.currentTarget.src = getFallbackImage(product.name); }}
                        />
                        <div className="min-w-0">
                          <p className="font-semibold text-zinc-900 dark:text-white truncate">{product.name}</p>
                          <p className="text-xs text-zinc-500 line-clamp-1">{product.description}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-zinc-600 dark:text-zinc-300">{getCategoryName(product.category)}</td>
                    <td className="py-3 pr-4 font-semibold nums">{formatPrice(product.price || 0)}</td>
                    <td className="py-3 pr-4 nums">{product.stock || 0}</td>
                    <td className="py-3">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => startEdit(product)} aria-label="Edit product" className="grid h-9 w-9 place-items-center rounded-full border border-zinc-200 dark:border-zinc-700 hover:text-gold transition">
                          <Pencil size={15} />
                        </button>
                        <button onClick={() => deleteProduct(product)} aria-label="Delete product" className="grid h-9 w-9 place-items-center rounded-full border border-zinc-200 dark:border-zinc-700 hover:text-red-600 transition">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {products.length === 0 && (
                  <tr>
                    <td colSpan="5" className="py-10 text-center text-zinc-500">No products yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <div className="space-y-6">
          <section className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-card">
            <h2 className="font-display text-xl font-bold text-zinc-900 dark:text-white mb-4">
              {editingProduct ? "Edit Product" : "Add Product"}
            </h2>
            <form onSubmit={submitProduct} className="space-y-4">
              <Field label="Name" name="name" value={productForm.name} onChange={handleProductChange} required />
              <label className="block">
                <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">Description</span>
                <textarea
                  name="description"
                  value={productForm.description}
                  onChange={handleProductChange}
                  required
                  rows="3"
                  className="mt-1 w-full rounded-lg border border-zinc-300 dark:border-zinc-700 dark:bg-zinc-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold/40"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Price" name="price" type="number" min="0" step="0.01" value={productForm.price} onChange={handleProductChange} required />
                <Field label="Stock" name="stock" type="number" min="0" value={productForm.stock} onChange={handleProductChange} />
              </div>
              <label className="block">
                <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">Category</span>
                <select
                  name="category"
                  value={productForm.category}
                  onChange={handleProductChange}
                  required
                  className="mt-1 w-full rounded-lg border border-zinc-300 dark:border-zinc-700 dark:bg-zinc-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold/40"
                >
                  <option value="">Select category</option>
                  {categories.map((category) => (
                    <option key={category._id} value={category._id}>{category.name}</option>
                  ))}
                </select>
              </label>
              <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 px-3 py-3 text-sm text-zinc-500 hover:text-gold transition">
                <ImagePlus size={18} />
                <span className="truncate">{productForm.image?.name || "Choose product image"}</span>
                <input type="file" name="image" accept="image/*" onChange={handleProductChange} className="sr-only" />
              </label>
              <button disabled={saving} className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-brand text-brand-fg px-5 py-3 text-sm font-semibold hover:opacity-90 disabled:opacity-60 transition">
                {editingProduct ? <Save size={17} /> : <Plus size={17} />}
                {saving ? "Saving..." : editingProduct ? "Save Changes" : "Add Product"}
              </button>
            </form>
          </section>

          <section className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-card">
            <h2 className="font-display text-xl font-bold text-zinc-900 dark:text-white mb-4">Add Category</h2>
            <form onSubmit={submitCategory} className="space-y-4">
              <Field label="Name" name="name" value={categoryForm.name} onChange={handleCategoryChange} required />
              <Field label="Description" name="description" value={categoryForm.description} onChange={handleCategoryChange} required />
              <button disabled={saving} className="w-full inline-flex items-center justify-center gap-2 rounded-full border border-gold/40 bg-gold/10 px-5 py-3 text-sm font-semibold text-gold hover:bg-gold/20 disabled:opacity-60 transition">
                <Plus size={17} /> Add Category
              </button>
            </form>
          </section>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-card">
          <h2 className="font-display text-xl font-bold text-zinc-900 dark:text-white mb-4">Top Selling Products</h2>
          <div className="space-y-3">
            {summary.topProducts.map((product) => (
              <div key={product._id} className="flex items-center justify-between gap-4 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 p-3">
                <div className="min-w-0">
                  <p className="font-semibold text-zinc-900 dark:text-white truncate">{product.name}</p>
                  <p className="text-xs text-zinc-500">{product.quantitySold} sold</p>
                </div>
                <span className="font-bold nums">{formatPrice(product.revenue || 0)}</span>
              </div>
            ))}
            {summary.topProducts.length === 0 && <p className="text-zinc-500">No sales data yet.</p>}
          </div>
        </section>

        <section className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-card">
          <h2 className="font-display text-xl font-bold text-zinc-900 dark:text-white mb-4">Recent Orders</h2>
          <div className="space-y-3">
            {summary.recentOrders.map((order) => (
              <div key={order._id} className="rounded-lg bg-zinc-50 dark:bg-zinc-800/50 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs text-zinc-500 font-mono truncate">#{order._id}</p>
                    <p className="text-sm text-zinc-700 dark:text-zinc-200">{order.user?.name || "Customer"} - {order.items?.length || 0} items</p>
                  </div>
                  <span className="text-sm font-bold nums">{formatPrice(order.totalAmount || 0)}</span>
                </div>
                <select
                  value={order.status || "pending"}
                  onChange={(event) => updateOrderStatus(order._id, event.target.value)}
                  className={`mt-3 rounded-full border-0 px-3 py-1.5 text-xs font-semibold capitalize ${STATUS_STYLES[order.status] || STATUS_STYLES.pending}`}
                >
                  <option value="pending">Pending</option>
                  <option value="shipped">Shipped</option>
                  <option value="delivered">Delivered</option>
                </select>
              </div>
            ))}
            {summary.recentOrders.length === 0 && <p className="text-zinc-500">No orders available yet.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}

function Field({ label, name, type = "text", value, onChange, ...props }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">{label}</span>
      <input
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        className="mt-1 w-full rounded-lg border border-zinc-300 dark:border-zinc-700 dark:bg-zinc-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold/40"
        {...props}
      />
    </label>
  );
}
