import { useEffect, useState } from "react";
import { PackageOpen } from "lucide-react";

export default function ProductImage({ src, alt, className = "", loading = "lazy" }) {
  const [failed, setFailed] = useState(!src);

  useEffect(() => {
    setFailed(!src);
  }, [src]);

  if (!src || failed) {
    return (
      <span
        role="img"
        aria-label={`${alt || "Product"} image unavailable`}
        className={`flex flex-col items-center justify-center gap-1 bg-surface-muted text-center text-xs text-muted ${className}`}
      >
        <PackageOpen size={20} aria-hidden="true" />
        <span>Image unavailable</span>
      </span>
    );
  }

  return <img src={src} alt={alt} loading={loading} className={className} onError={() => setFailed(true)} />;
}
