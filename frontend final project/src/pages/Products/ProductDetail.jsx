import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { getProductById, deleteProduct } from "../../api/productsApi";
import { useAuth } from "../../context/AuthContext";

export default function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchProduct = async () => {
      try {
        const res = await getProductById(id);
        setProduct(res.data);
      } catch (err) {
        setError(err.response?.data?.message || "Product not found");
      } finally {
        setLoading(false);
      }
    };
    fetchProduct();
  }, [id]);

  const handleDelete = async () => {
    if (!window.confirm("Are you sure you want to delete this product?")) return;
    try {
      await deleteProduct(id);
      navigate("/products");
    } catch (err) {
      setError(err.response?.data?.message || "Failed to delete product");
    }
  };

  if (loading) return <div className="loading">Loading...</div>;
  if (error) return <div className="alert alert-error">{error}</div>;
  if (!product) return <div className="alert alert-error">Product not found</div>;

  return (
    <div className="page">
      <Link to="/products" className="btn btn-back">&larr; Back to Products</Link>
      <div className="detail-card">
        <h2>{product.name}</h2>
        <p className="detail-description">{product.description}</p>
        <p className="price">${product.price}</p>
        <p className="detail-date">
          Created: {new Date(product.createdAt).toLocaleDateString()}
        </p>
        {isAdmin() && (
          <div className="detail-actions">
            <Link to={`/products/edit/${product._id}`} className="btn btn-edit">
              Edit
            </Link>
            <button onClick={handleDelete} className="btn btn-delete">
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
