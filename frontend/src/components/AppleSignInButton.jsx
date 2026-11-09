import { useState } from "react";
import { Apple } from "lucide-react";
import { authAPI } from "../services/api";

export default function AppleSignInButton({ returnTo = "/", mode = "sign-in" }) {
  const previewMode = import.meta.env.VITE_PREVIEW_MODE === "true";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const startSignIn = async () => {
    setBusy(true);
    setError("");
    try {
      const response = mode === "link" ? await authAPI.appleLinkStart(returnTo) : await authAPI.appleStart(returnTo);
      const authUrl = response.data.data?.authUrl;
      if (!authUrl || new URL(authUrl).origin !== "https://appleid.apple.com") {
        throw new Error("Apple sign-in is not available.");
      }
      window.location.assign(authUrl);
    } catch (requestError) {
      setError(requestError.response?.data?.message || requestError.message || "Apple sign-in is not available.");
      setBusy(false);
    }
  };

  if (previewMode) return null;

  return (
    <div className="mt-3">
      <button type="button" onClick={startSignIn} disabled={busy} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-black bg-black px-4 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-60 dark:border-white dark:bg-white dark:text-black dark:hover:bg-zinc-200">
        <Apple size={18} aria-hidden="true" />
        {busy ? "Connecting to Apple…" : mode === "link" ? "Link Apple account" : "Continue with Apple"}
      </button>
      {error && <p role="alert" className="mt-2 text-sm text-state-danger">{error}</p>}
    </div>
  );
}
