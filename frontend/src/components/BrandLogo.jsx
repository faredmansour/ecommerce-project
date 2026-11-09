import { Link } from "react-router-dom";
import logo from "../assets/brand/logo.svg";

/**
 * Config-driven brand logo. Shows the logo image when `brand.logoSrc` is set,
 * otherwise a gold badge with `brand.logoText` plus the brand name.
 */
export default function BrandLogo({ to = "/", className = "" }) {
  const content = (
    <span className={`inline-flex shrink-0 items-center ${className}`}>
      <img src={logo} alt="ALFREDO" className="h-10 w-auto sm:h-11" />
    </span>
  );

  if (!to) return content;
  return (
    <Link to={to} aria-label="ALFREDO home">
      {content}
    </Link>
  );
}
