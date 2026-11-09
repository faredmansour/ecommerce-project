import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { authAPI } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { getAuthReturnPath } from "../lib/authReturnPath";

export default function AuthCallbackPage() {
  const { completeLogin, isAuthenticated } = useAuth();
  const { mergeStatus } = useCart();
  const navigate = useNavigate();
  const started = useRef(false);
  const [returnTo, setReturnTo] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const callbackParams = new URLSearchParams(window.location.search);
    const code = callbackParams.get("code");
    const provider = callbackParams.get("provider") === "apple" ? "apple" : "google";
    window.history.replaceState(window.history.state, "", "/auth/callback");
    if (!code) {
      setError("Sign-in could not be completed. Please try again.");
      return;
    }
    const exchange = provider === "apple" ? authAPI.appleExchange : authAPI.googleExchange;
    exchange(code).then((response) => {
      const payload = response.data.data || response.data;
      completeLogin(payload);
      setReturnTo(getAuthReturnPath({ pathname: payload.returnTo }, "/"));
    }).catch((requestError) => {
      setError(requestError.response?.data?.message || "Sign-in could not be completed. Please try again.");
    });
  }, [completeLogin]);

  useEffect(() => {
    if (isAuthenticated && mergeStatus === "ready" && returnTo) navigate(returnTo, { replace: true });
  }, [isAuthenticated, mergeStatus, navigate, returnTo]);

  return error
    ? <div role="alert" className="mx-auto max-w-lg px-4 py-16 text-center text-state-danger">{error}</div>
    : <div role="status" className="mx-auto max-w-lg px-4 py-16 text-center text-muted">Finishing sign-in and restoring your cart…</div>;
}
