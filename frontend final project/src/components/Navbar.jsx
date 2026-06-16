import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Navbar() {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <nav className="navbar">
      <div className="navbar-brand">
        <Link to="/">Alfredo</Link>
      </div>
      <div className="navbar-links">
        <Link to="/products">Products</Link>
        <Link to="/categories">Categories</Link>
        {user ? (
          <>
            {isAdmin() && (
              <>
                <Link to="/products/new">+ Product</Link>
                <Link to="/categories/new">+ Category</Link>
              </>
            )}
            <span className="navbar-user">
              {user.name} ({user.role})
            </span>
            <button onClick={handleLogout} className="btn btn-logout">
              Logout
            </button>
          </>
        ) : (
          <>
            <Link to="/login">Login</Link>
            <Link to="/register">Register</Link>
          </>
        )}
      </div>
    </nav>
  );
}
