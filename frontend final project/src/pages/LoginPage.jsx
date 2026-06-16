import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Mail, Lock, Eye, EyeOff } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await login(email, password);
      navigate("/home");
    } catch (err) {
      setError(err.response?.data?.detail || "Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">

      <div className="w-[850px] bg-white rounded-2xl shadow-lg overflow-hidden flex">

        {/* LEFT SIDE LOGIN */}
        <div className="w-1/2 p-10">

          <h1 className="text-2xl font-bold mb-6">Login</h1>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-600">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">

            {/* EMAIL */}
            <div>
              <label className="text-sm text-gray-600">Email</label>

              <div className="relative mt-1">
                <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>

                <input
                  type="email"
                  value={email}
                  onChange={(e)=>setEmail(e.target.value)}
                  required
                  placeholder="Enter your email"
                  className="w-full pl-10 pr-4 py-2.5 border rounded-lg focus:outline-none focus:border-purple-500"
                />
              </div>
            </div>

            {/* PASSWORD */}
            <div>
              <label className="text-sm text-gray-600">Password</label>

              <div className="relative mt-1">
                <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>

                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e)=>setPassword(e.target.value)}
                  required
                  placeholder="Enter password"
                  className="w-full pl-10 pr-10 py-2.5 border rounded-lg focus:outline-none focus:border-purple-500"
                />

                <button
                  type="button"
                  onClick={()=>setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                >
                  {showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}
                </button>

              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
            >
              {loading ? "Signing in..." : "Login"}
            </button>

          </form>
        </div>


        {/* RIGHT SIDE PANEL */}
        <div className="w-1/2 bg-gradient-to-br from-purple-600 to-purple-400 text-white flex flex-col items-center justify-center rounded-l-[120px]">

          <h2 className="text-3xl font-bold mb-3">Welcome Back!</h2>

          <p className="text-sm mb-6 opacity-90">
            Don't have an account?
          </p>

          <Link
            to="/register"
            className="px-6 py-2 border border-white rounded-full hover:bg-white hover:text-purple-600 transition"
          >
            Register
          </Link>

        </div>

      </div>
    </div>
  );
}