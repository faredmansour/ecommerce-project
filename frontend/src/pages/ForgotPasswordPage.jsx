import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import BrandLogo from "../components/BrandLogo";
import { authAPI } from "../services/api";
import { getAuthReturnPath } from "../lib/authReturnPath";

export default function ForgotPasswordPage() {
  const location = useLocation();
  const returnTo = getAuthReturnPath({ pathname: new URLSearchParams(location.search).get("returnTo") }, "/");
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async (event) => {
    event.preventDefault(); setLoading(true); setError("");
    try { await authAPI.forgotPassword(email); setSent(true); }
    catch { setError("We couldn’t process that request. Please try again."); }
    finally { setLoading(false); }
  };
  return <main className="flex min-h-screen items-center justify-center bg-canvas px-4"><section className="w-full max-w-md rounded-md border border-line bg-surface p-7 shadow-card"><BrandLogo to="/home"/><h1 className="mt-7 text-2xl font-bold">Reset your password</h1>{sent ? <p role="status" className="mt-4 text-sm text-muted">If that email exists, a password reset link has been sent.</p> : <form onSubmit={submit} className="mt-5 space-y-4"><label className="block text-sm">Email<input className="ui-control mt-2 h-11 w-full px-3" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)}/></label>{error && <p role="alert" className="text-sm text-state-danger">{error}</p>}<button disabled={loading} className="w-full rounded-md bg-brand px-4 py-3 font-semibold text-brand-fg disabled:opacity-60">{loading ? "Sending…" : "Send reset link"}</button></form>}<Link className="mt-5 inline-block text-sm font-semibold text-brand underline" to={`/login?returnTo=${encodeURIComponent(returnTo)}`}>Back to sign in</Link></section></main>;
}
