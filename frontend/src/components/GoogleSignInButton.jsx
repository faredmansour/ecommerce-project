import { useState } from "react";
import { authAPI } from "../services/api";

export default function GoogleSignInButton({ returnTo = "/", mode = "sign-in" }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const startSignIn = async () => {
    setBusy(true);
    setError("");
    try {
      const response = mode === "link" ? await authAPI.googleLinkStart(returnTo) : await authAPI.googleStart(returnTo);
      const authUrl = response.data.data?.authUrl;
      if (!authUrl || new URL(authUrl).origin !== "https://accounts.google.com") {
        throw new Error("Google sign-in is not available.");
      }
      window.location.assign(authUrl);
    } catch (requestError) {
      setError(requestError.response?.data?.message || requestError.message || "Google sign-in is not available.");
      setBusy(false);
    }
  };

  return (
    <div className="mt-4">
      <button type="button" onClick={startSignIn} disabled={busy} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-line bg-surface px-4 text-sm font-semibold text-ink transition hover:bg-surface-raised disabled:opacity-60">
        <span aria-hidden="true" className="font-bold text-brand">G</span>
        {busy ? "Connecting to Google…" : mode === "link" ? "Link Google account" : "Continue with Google"}
      </button>
      {error && <p role="alert" className="mt-2 text-sm text-state-danger">{error}</p>}
    </div>
  );
}
