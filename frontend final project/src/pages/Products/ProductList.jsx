import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { getProducts, deleteProduct } from "../../api/productsApi";
import { useAuth } from "../../context/AuthContext";

export default function ProductList() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { isAdmin } = useAuth();

  const fetchProducts = async () => {
    try {
      const res = await getProducts();
      const data = Array.isArray(res.data) ? res.data : res.data.product || [];
      setProducts(data);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load products");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this product?")) return;
    try {
      await deleteProduct(id);
      setProducts(products.filter((p) => p._id !== id));
    } catch (err) {
      setError(err.response?.data?.message || "Failed to delete product");
    }
  };

  if (loading) return <div className="loading">Loading products...</div>;
  if (error) return <div className="alert alert-error">{error}</div>;

  return (
    <div className="page">
      <div className="page-header">
        <h2>Products</h2>
        {isAdmin() && (
          <Link to="/products/new" className="btn btn-primary">
            + Add Product
          </Link>
        )}
      </div>
      {products.length === 0 ? (
        <p className="empty-state">No products found.</p>
      ) : (
        <div className="card-grid">
          {products.map((product) => (
            <div key={product._id} className="card">
              <h3>{product.name}</h3>
              <p>{product.description}</p>
              <p className="price">${product.price}</p>
              <div className="card-actions">
                <Link to={`/products/${product._id}`} className="btn btn-sm">
                  View
                </Link>
                {isAdmin() && (
                  <>
                    <Link to={`/products/edit/${product._id}`} className="btn btn-sm btn-edit">
                      Edit
                    </Link>
                    <button
                      onClick={() => handleDelete(product._id)}
                      className="btn btn-sm btn-delete"
                    >
                      Delete
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
