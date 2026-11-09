import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import BrandLogo from "../components/BrandLogo";
import { authAPI } from "../services/api";
import { getAuthReturnPath } from "../lib/authReturnPath";

export default function VerifyEmailPage() {
  const started = useRef(false);
  const navigate = useNavigate();
  const [status, setStatus] = useState("Checking your verification link…");
  const [returnTo, setReturnTo] = useState("/");
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = new URLSearchParams(window.location.search).get("token");
    window.history.replaceState(window.history.state, "", "/verify-email");
    if (!token) { setStatus("This verification link is invalid or expired."); return; }
    authAPI.verifyEmail(token).then((response) => {
      const destination = getAuthReturnPath({ pathname: response.data?.data?.returnTo }, "/");
      setReturnTo(destination);
      setStatus("Your email is verified. Sign in to continue.");
      navigate(`/login?verified=1&returnTo=${encodeURIComponent(destination)}`, { replace: true });
    }).catch(() => setStatus("This verification link is invalid or expired. You can request another from sign in."));
  }, [navigate]);
  return <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center px-5 text-center"><BrandLogo to="/home"/><p role="status" className="mt-6 text-ink">{status}</p><Link className="mt-5 font-semibold text-brand underline" to={`/login?returnTo=${encodeURIComponent(returnTo)}`}>Go to sign in</Link></main>;
}
