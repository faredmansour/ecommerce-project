import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { createProduct, getProductById, updateProduct } from "../../api/productsApi";

export default function ProductForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(id);
  const [form, setForm] = useState({ name: "", description: "", price: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isEdit) {
      const fetchProduct = async () => {
        try {
          const res = await getProductById(id);
          setForm({
            name: res.data.name,
            description: res.data.description,
            price: res.data.price,
          });
        } catch (err) {
          setError(err.response?.data?.message || "Failed to load product");
        }
      };
      fetchProduct();
    }
  }, [id, isEdit]);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.name || !form.description || !form.price) {
      setError("All fields are required");
      return;
    }
    setLoading(true);
    try {
      const payload = { ...form, price: Number(form.price) };
      if (isEdit) {
        await updateProduct(id, payload);
      } else {
        await createProduct(payload);
      }
      navigate("/products");
    } catch (err) {
      setError(err.response?.data?.message || "Failed to save product");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="form-page">
      <h2>{isEdit ? "Edit Product" : "Add Product"}</h2>
      {error && <div className="alert alert-error">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="name">Name</label>
          <input
            id="name"
            name="name"
            type="text"
            value={form.name}
            onChange={handleChange}
            required
          />
        </div>
        <div className="form-group">
          <label htmlFor="description">Description</label>
          <textarea
            id="description"
            name="description"
            value={form.description}
            onChange={handleChange}
            required
            rows={4}
          />
        </div>
        <div className="form-group">
          <label htmlFor="price">Price</label>
          <input
            id="price"
            name="price"
            type="number"
            step="0.01"
            min="0"
            value={form.price}
            onChange={handleChange}
            required
          />
        </div>
        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? "Saving..." : isEdit ? "Update Product" : "Create Product"}
        </button>
      </form>
    </div>
  );
}
