import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { createCategory, getCategoryById, updateCategory } from "../../api/categoriesApi";

export default function CategoryForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(id);
  const [form, setForm] = useState({ name: "", description: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isEdit) {
      const fetchCategory = async () => {
        try {
          const res = await getCategoryById(id);
          setForm({ name: res.data.name, description: res.data.description });
        } catch (err) {
          setError(err.response?.data?.message || "Failed to load category");
        }
      };
      fetchCategory();
    }
  }, [id, isEdit]);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.name || !form.description) {
      setError("All fields are required");
      return;
    }
    setLoading(true);
    try {
      if (isEdit) {
        await updateCategory(id, form);
      } else {
        await createCategory(form);
      }
      navigate("/categories");
    } catch (err) {
      setError(err.response?.data?.message || "Failed to save category");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="form-page">
      <h2>{isEdit ? "Edit Category" : "Add Category"}</h2>
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
        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? "Saving..." : isEdit ? "Update Category" : "Create Category"}
        </button>
      </form>
    </div>
  );
}
