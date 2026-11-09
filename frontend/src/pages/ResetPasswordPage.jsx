import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import BrandLogo from "../components/BrandLogo";
import { authAPI } from "../services/api";
import { getAuthReturnPath } from "../lib/authReturnPath";

export default function ResetPasswordPage() {
  const location = useLocation();
  const [token] = useState(() => new URLSearchParams(window.location.search).get("token") || "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState("");
  const returnTo = getAuthReturnPath({ pathname: new URLSearchParams(location.search).get("returnTo") }, "/");
  useEffect(() => {
    window.history.replaceState(window.history.state, "", "/reset-password");
  }, []);
  const submit = async (event) => {
    event.preventDefault(); setError("");
    if (password !== confirm) { setError("Passwords do not match."); return; }
    try { await authAPI.resetPassword(token, password); setComplete(true); }
    catch { setError("This reset link is invalid or expired. Request a new link and try again."); }
  };
  return <main className="flex min-h-screen items-center justify-center bg-canvas px-4"><section className="w-full max-w-md rounded-md border border-line bg-surface p-7 shadow-card"><BrandLogo to="/home"/><h1 className="mt-7 text-2xl font-bold">Choose a new password</h1>{complete ? <p role="status" className="mt-4 text-sm text-muted">Password updated successfully.</p> : <form onSubmit={submit} className="mt-5 space-y-4"><label className="block text-sm">New password<input className="ui-control mt-2 h-11 w-full px-3" type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)}/></label><label className="block text-sm">Confirm password<input className="ui-control mt-2 h-11 w-full px-3" type="password" required minLength={8} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)}/></label>{error && <p role="alert" className="text-sm text-state-danger">{error}</p>}<button disabled={!token} className="w-full rounded-md bg-brand px-4 py-3 font-semibold text-brand-fg disabled:opacity-60">Update password</button></form>}<Link className="mt-5 inline-block text-sm font-semibold text-brand underline" to={`/login?reset=1&returnTo=${encodeURIComponent(returnTo)}`}>Go to sign in</Link></section></main>;
}
