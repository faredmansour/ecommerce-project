import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { getCategories, deleteCategory } from "../../api/categoriesApi";
import { useAuth } from "../../context/AuthContext";

export default function CategoryList() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { isAdmin } = useAuth();

  const fetchCategories = async () => {
    try {
      const res = await getCategories();
      setCategories(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load categories");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this category?")) return;
    try {
      await deleteCategory(id);
      setCategories(categories.filter((c) => c._id !== id));
    } catch (err) {
      setError(err.response?.data?.message || "Failed to delete category");
    }
  };

  if (loading) return <div className="loading">Loading categories...</div>;
  if (error) return <div className="alert alert-error">{error}</div>;

  return (
    <div className="page">
      <div className="page-header">
        <h2>Categories</h2>
        {isAdmin() && (
          <Link to="/categories/new" className="btn btn-primary">
            + Add Category
          </Link>
        )}
      </div>
      {categories.length === 0 ? (
        <p className="empty-state">No categories found.</p>
      ) : (
        <div className="card-grid">
          {categories.map((category) => (
            <div key={category._id} className="card">
              <h3>{category.name}</h3>
              <p>{category.description}</p>
              {isAdmin() && (
                <div className="card-actions">
                  <Link to={`/categories/edit/${category._id}`} className="btn btn-sm btn-edit">
                    Edit
                  </Link>
                  <button
                    onClick={() => handleDelete(category._id)}
                    className="btn btn-sm btn-delete"
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
