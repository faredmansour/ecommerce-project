import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { getAuthReturnPath } from "../lib/authReturnPath";
import { Mail, Lock, Eye, EyeOff, User as UserIcon, ArrowRight } from "lucide-react";
import BrandLogo from "../components/BrandLogo";
import GoogleSignInButton from "../components/GoogleSignInButton";
import AppleSignInButton from "../components/AppleSignInButton";
import { Button } from "../components/ui";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [developmentVerificationUrl, setDevelopmentVerificationUrl] = useState("");

  const { register, isAuthenticated } = useAuth();
  const { mergeStatus, syncError, retryMerge } = useCart();
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = getAuthReturnPath(location.state?.from, "/home");

  useEffect(() => {
    if (isAuthenticated && mergeStatus === "ready") {
      navigate(returnTo, { replace: true });
    }
  }, [isAuthenticated, mergeStatus, navigate, returnTo]);

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
      const response = await register(name, email, password, returnTo);
      setDevelopmentVerificationUrl(response.developmentVerificationUrl || "");
      setSubmitted(true);
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.detail || "Registration failed.");
    } finally {
      setLoading(false);
    }
  };

  const inputCls = "ui-control h-11 w-full pl-10 pr-4 text-sm";

  if (submitted) return <div className="flex min-h-screen items-center justify-center bg-canvas px-4"><section className="w-full max-w-md rounded-md border border-line bg-surface p-8 text-center shadow-card"><BrandLogo to="/home" /><h1 className="mt-6 text-2xl font-bold">Check your email</h1><p className="mt-3 text-sm text-muted">If the address can be verified, you’ll receive a link. After verification, sign in to continue.</p>{developmentVerificationUrl && <a className="mt-5 inline-block font-semibold text-brand underline" href={developmentVerificationUrl}>Verify your email locally</a>}<Link className="mt-6 inline-block font-semibold text-brand underline" to={`/login?returnTo=${encodeURIComponent(returnTo)}`}>Continue to sign in</Link></section></div>;

  return (
    <div className="flex min-h-screen items-start justify-center bg-canvas px-4 py-8 sm:items-center sm:py-12">
      <div className="w-full max-w-md rounded-md border border-line bg-surface p-6 shadow-card sm:p-8">
          <div className="mb-7"><BrandLogo to="/home" /></div>
          <h1 className="mb-1 font-display text-2xl font-bold text-ink dark:text-white">Create account</h1>
          <p className="mb-6 text-sm text-muted">Create an account to save favorites and track orders.</p>

          {error && (
            <div role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400">
              {error}
            </div>
          )}
          {isAuthenticated && mergeStatus === "syncing" && (
            <p role="status" className="mb-4 text-sm text-muted">Your account is ready. Synchronizing your saved cart…</p>
          )}
          {isAuthenticated && mergeStatus === "failed" && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400">
              <p role="alert">{syncError || "Your saved cart could not be synchronized. Your guest items are still saved."}</p>
              <button type="button" onClick={retryMerge} className="mt-3 font-semibold underline">
                Retry cart synchronization
              </button>
              <Link to="/cart" className="ml-4 font-semibold underline">Review saved cart</Link>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="register-name" className="mb-1.5 block text-sm font-medium text-ink dark:text-white">Full name</label>
              <div className="relative">
                <UserIcon size={18} aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <input id="register-name" type="text" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" className={inputCls} />
              </div>
            </div>
            <div>
              <label htmlFor="register-email" className="mb-1.5 block text-sm font-medium text-ink dark:text-white">Email</label>
              <div className="relative">
                <Mail size={18} aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <input id="register-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" className={inputCls} />
              </div>
            </div>
            <div>
              <label htmlFor="register-password" className="mb-1.5 block text-sm font-medium text-ink dark:text-white">Password</label>
              <div className="relative">
                <Lock size={18} aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <input id="register-password" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" className={`${inputCls} pr-11`} />
                <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Hide password" : "Show password"} className="absolute right-1 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-sm text-muted hover:bg-surface-muted hover:text-ink">
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            <div>
              <label htmlFor="register-confirm-password" className="mb-1.5 block text-sm font-medium text-ink dark:text-white">Confirm password</label>
              <div className="relative">
                <Lock size={18} aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <input id="register-confirm-password" type={showPassword ? "text" : "password"} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required autoComplete="new-password" className={inputCls} />
              </div>
            </div>
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Creating…" : <>Create Account <ArrowRight size={16} /></>}
            </Button>
          </form>

          <GoogleSignInButton returnTo={returnTo} />
          <AppleSignInButton returnTo={returnTo} />

          <p className="mt-6 text-center text-sm text-muted">
            Already have an account?{" "}
            <Link to="/login" state={location.state} className="font-semibold text-brand hover:underline">Login</Link>
          </p>
      </div>
    </div>
  );
}
