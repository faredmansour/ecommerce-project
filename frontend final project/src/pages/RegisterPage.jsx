import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Mail, Lock, Eye, EyeOff, User as UserIcon, ArrowRight } from "lucide-react";
import BrandLogo from "../components/BrandLogo";
import { siteConfig } from "../config/site.config";

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
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters (with upper, lower, number & symbol).");
      return;
    }
    setLoading(true);
    try {
      await register(name, email, password);
      navigate("/home");
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.detail || "Registration failed.");
    } finally {
      setLoading(false);
    }
  };

  const inputCls =
    "w-full pl-10 pr-4 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold transition";

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-100 dark:bg-zinc-950 p-4">
      <div className="w-full max-w-4xl bg-white dark:bg-zinc-900 rounded-3xl shadow-hover overflow-hidden grid md:grid-cols-2">
        {/* Brand panel */}
        <div className="hidden md:flex relative flex-col items-center justify-center bg-brand text-brand-fg p-10 overflow-hidden order-1">
          <div className="absolute -left-16 -top-16 h-56 w-56 rounded-full bg-gold/20 blur-3xl" />
          <div className="absolute -right-10 bottom-0 h-44 w-44 rounded-full bg-gold/10 blur-3xl" />
          <div className="relative text-center">
            <h2 className="font-display text-3xl font-extrabold mb-3">Join {siteConfig.brand.name}</h2>
            <p className="opacity-75 max-w-xs mx-auto">Create an account to save favorites, track orders, and unlock member deals.</p>
          </div>
        </div>

        {/* Form */}
        <div className="p-8 sm:p-10 order-2">
          <div className="mb-8 md:hidden"><BrandLogo to="/home" /></div>
          <h1 className="font-display text-2xl font-extrabold text-zinc-900 dark:text-white mb-1">Create account</h1>
          <p className="text-sm text-zinc-500 mb-6">It only takes a minute.</p>

          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg text-sm text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <UserIcon size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" required autoComplete="name" className={inputCls} />
            </div>
            <div className="relative">
              <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" required autoComplete="email" className={inputCls} />
            </div>
            <div className="relative">
              <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" required autoComplete="new-password" className={`${inputCls} pr-10`} />
              <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label="Toggle password" className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600">
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            <div className="relative">
              <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input type={showPassword ? "text" : "password"} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm password" required autoComplete="new-password" className={inputCls} />
            </div>

            <button type="submit" disabled={loading} className="w-full flex items-center justify-center gap-2 py-3 bg-brand text-brand-fg rounded-full font-semibold hover:opacity-90 active:scale-[0.99] transition disabled:opacity-60">
              {loading ? "Creating…" : <>Create Account <ArrowRight size={16} /></>}
            </button>
          </form>

          <p className="text-sm text-zinc-500 mt-6 text-center">
            Already have an account?{" "}
            <Link to="/login" className="font-semibold text-gold hover:underline">Login</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
