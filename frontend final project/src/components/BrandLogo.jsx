import { Link } from "react-router-dom";
import { siteConfig } from "../config/site.config";

/**
 * Config-driven brand logo. Shows the logo image when `brand.logoSrc` is set,
 * otherwise a gold badge with `brand.logoText` plus the brand name.
 */
export default function BrandLogo({ to = "/home", className = "", textClassName = "" }) {
  const { name, logoText, logoSrc } = siteConfig.brand;

  const content = (
    <span className={`flex items-center gap-2.5 shrink-0 ${className}`}>
      {logoSrc ? (
        <img src={logoSrc} alt={name} className="h-8 w-auto" />
      ) : (
        <span className="grid place-items-center h-9 w-9 rounded-xl bg-brand text-brand-fg font-display font-extrabold text-lg">
          {logoText}
        </span>
      )}
      <span className={`font-display text-xl font-extrabold tracking-tight ${textClassName}`}>{name}</span>
    </span>
  );

  if (!to) return content;
  return (
    <Link to={to} aria-label={name}>
      {content}
    </Link>
  );
}
