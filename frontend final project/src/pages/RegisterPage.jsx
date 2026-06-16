import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Mail, Lock, Eye, EyeOff, UserIcon } from "lucide-react";

export default function RegisterPage() {

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const { register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setLoading(true);

    try {
      await register(name, email, password);
      navigate("/home");
    } catch (err) {
      setError(err.response?.data?.detail || "Registration failed.");
    } finally {
      setLoading(false);
    }
  };

  return (

    <div className="min-h-screen flex items-center justify-center bg-gray-100">

      <div className="w-[900px] bg-white rounded-2xl shadow-lg overflow-hidden flex">

        {/* LEFT SIDE REGISTER FORM */}

        <div className="w-1/2 p-10">

          <h1 className="text-2xl font-bold mb-6">Register</h1>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-600">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">

            {/* NAME */}

            <div className="relative">
              <UserIcon size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
              <input
                type="text"
                value={name}
                onChange={(e)=>setName(e.target.value)}
                placeholder="Full Name"
                required
                className="w-full pl-10 pr-4 py-2.5 border rounded-lg focus:outline-none focus:border-purple-500"
              />
            </div>

            {/* EMAIL */}

            <div className="relative">
              <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
              <input
                type="email"
                value={email}
                onChange={(e)=>setEmail(e.target.value)}
                placeholder="Email"
                required
                className="w-full pl-10 pr-4 py-2.5 border rounded-lg focus:outline-none focus:border-purple-500"
              />
            </div>

            {/* PASSWORD */}

            <div className="relative">
              <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>

              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e)=>setPassword(e.target.value)}
                placeholder="Password"
                required
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

            {/* CONFIRM PASSWORD */}

            <div className="relative">
              <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>

              <input
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e)=>setConfirmPassword(e.target.value)}
                placeholder="Confirm Password"
                required
                className="w-full pl-10 pr-4 py-2.5 border rounded-lg focus:outline-none focus:border-purple-500"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
            >
              {loading ? "Creating..." : "Create Account"}
            </button>

          </form>

        </div>


        {/* RIGHT PANEL */}

        <div className="w-1/2 bg-gradient-to-br from-purple-600 to-purple-400 text-white flex flex-col items-center justify-center rounded-l-[120px]">

          <h2 className="text-3xl font-bold mb-3">
            Hello Friend!
          </h2>

          <p className="mb-6 opacity-90">
            Already have an account?
          </p>

          <Link
            to="/login"
            className="px-6 py-2 border border-white rounded-full hover:bg-white hover:text-purple-600 transition"
          >
            Login
          </Link>

        </div>

      </div>

    </div>
  );
}