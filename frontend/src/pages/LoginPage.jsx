import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { getAuthReturnPath } from "../lib/authReturnPath";
import { Mail, Lock, Eye, EyeOff, ArrowRight } from "lucide-react";
import BrandLogo from "../components/BrandLogo";
import GoogleSignInButton from "../components/GoogleSignInButton";
import AppleSignInButton from "../components/AppleSignInButton";
import { authAPI } from "../services/api";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [verificationRequired, setVerificationRequired] = useState(false);
  const [notice, setNotice] = useState("");
  const [developmentVerificationUrl, setDevelopmentVerificationUrl] = useState("");

  const { login, isAuthenticated } = useAuth();
  const { mergeStatus, syncError, retryMerge } = useCart();
  const navigate = useNavigate();
  const location = useLocation();
  const queryReturnTo = new URLSearchParams(location.search).get("returnTo");
  let queryDestination;
  if (queryReturnTo) {
    try {
      const url = new URL(queryReturnTo, window.location.origin);
      if (url.origin === window.location.origin) queryDestination = { pathname: url.pathname, search: url.search, hash: url.hash };
    } catch { /* Ignore invalid provider return paths. */ }
  }
  const returnTo = getAuthReturnPath(location.state?.from || queryDestination, "/");
  const providerError = new URLSearchParams(location.search).get("providerError");
  const providerErrorMessage = {
    account_exists: "An account already uses this email. Sign in with your password to continue.",
    invalid_state: "The sign-in request expired or was invalid. Please try again.",
    google_failed: "Google sign-in could not be completed. Please try again.",
    google_unavailable: "Google sign-in is temporarily unavailable.",
    identity_already_linked: "This Google account is already linked to another customer account.",
    link_email_mismatch: "The verified Google email must match the signed-in account before linking.",
    apple_failed: "Apple sign-in could not be completed. Please try again.",
    apple_unavailable: "Apple sign-in is temporarily unavailable.",
    apple_invalid_state: "The Apple sign-in request expired or was invalid. Please try again.",
    apple_identity_already_linked: "This Apple account is already linked to another customer account.",
    apple_link_email_mismatch: "The verified Apple email must match the signed-in account before linking.",
    apple_email_unavailable: "Apple did not provide a verified email for this account.",
  }[providerError];

  useEffect(() => {
    if (isAuthenticated && mergeStatus === "ready") {
      navigate(returnTo, { replace: true });
    }
  }, [isAuthenticated, mergeStatus, navigate, returnTo]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      if (err.response?.data?.code === "EMAIL_VERIFICATION_REQUIRED") setVerificationRequired(true);
      setError(err.response?.data?.message || err.response?.data?.detail || "Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const resendVerification = async () => {
    try {
      const response = await authAPI.resendVerification(email, returnTo);
      setDevelopmentVerificationUrl(response.data?.developmentVerificationUrl || "");
      setNotice("If the account needs verification, a fresh link has been sent.");
      setError("");
    } catch {
      setNotice("If the account needs verification, a fresh link has been sent.");
    }
  };

  const inputCls =
    "h-11 w-full rounded-md border border-line bg-surface pl-10 pr-4 text-sm text-ink placeholder:text-muted focus:border-brand-hover focus:outline-none focus:ring-2 focus:ring-brand-hover/20 dark:bg-surface dark:text-white";

  return (
    <div className="flex min-h-screen items-start justify-center bg-canvas px-4 py-8 sm:items-center sm:py-12">
      <div className="w-full max-w-md rounded-md border border-line bg-surface p-6 shadow-card sm:p-8">
          <div className="mb-7"><BrandLogo to="/home" /></div>
          <h1 className="mb-1 font-display text-2xl font-bold text-ink dark:text-white">Welcome back</h1>
          <p className="mb-6 text-sm text-muted">Sign in to continue shopping.</p>

          {error && (
            <div role="alert" className="mb-4 p-3 rounded-md border border-state-danger-border bg-state-danger-bg text-sm text-state-danger">
              {error}
            </div>
          )}
          {notice && <div role="status" className="mb-4 text-sm text-state-success">{notice}{developmentVerificationUrl && <><br /><a className="font-semibold underline" href={developmentVerificationUrl}>Verify your email locally</a></>}</div>}
          {verificationRequired && <button type="button" onClick={resendVerification} className="mb-4 text-sm font-semibold text-brand underline">Resend verification email</button>}
          {new URLSearchParams(location.search).get("verified") === "1" && <p role="status" className="mb-4 text-sm text-state-success">Email verified. Sign in to continue.</p>}
          {new URLSearchParams(location.search).get("reset") === "1" && <p role="status" className="mb-4 text-sm text-state-success">Password updated. Sign in with your new password.</p>}
          {providerErrorMessage && (
            <div role="alert" className="mb-4 rounded-md border border-state-danger-border bg-state-danger-bg p-3 text-sm text-state-danger">{providerErrorMessage}</div>
          )}
          {isAuthenticated && mergeStatus === "syncing" && (
            <p role="status" className="mb-4 text-sm text-muted">You’re signed in. Synchronizing your saved cart…</p>
          )}
          {isAuthenticated && mergeStatus === "failed" && (
            <div className="mb-4 rounded-md border border-state-danger-border bg-state-danger-bg p-3 text-sm text-state-danger">
              <p role="alert">{syncError || "Your saved cart could not be synchronized. Your guest items are still saved."}</p>
              <button type="button" onClick={retryMerge} className="mt-3 font-semibold underline">
                Retry cart synchronization
              </button>
              <Link to="/cart" className="ml-4 font-semibold underline">Review saved cart</Link>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="login-email" className="text-sm font-medium text-ink dark:text-white">Email</label>
              <div className="relative mt-1.5">
                <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <input id="login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@example.com" autoComplete="email" className={inputCls} />
              </div>
            </div>

            <div>
              <label htmlFor="login-password" className="text-sm font-medium text-ink dark:text-white">Password</label>
              <div className="relative mt-1.5">
                <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <input id="login-password" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="••••••••" autoComplete="current-password" className={`${inputCls} pr-10`} />
                <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label="Toggle password visibility" className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded text-muted hover:bg-surface-raised hover:text-ink">
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-brand px-4 py-2.5 font-semibold text-brand-fg transition-colors duration-200 hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60">
              {loading ? "Signing in…" : <>Login <ArrowRight size={16} /></>}
            </button>
          </form>

          <p className="mt-3 text-right text-sm"><Link className="font-semibold text-brand underline" to={`/forgot-password?returnTo=${encodeURIComponent(returnTo)}`}>Forgot password?</Link></p>

          <GoogleSignInButton returnTo={returnTo} />
          <AppleSignInButton returnTo={returnTo} />

          <p className="mt-6 text-center text-sm text-muted">
            Don't have an account?{" "}
            <Link to="/register" state={location.state} className="font-semibold text-brand hover:underline">Register</Link>
          </p>
      </div>
    </div>
  );
}
