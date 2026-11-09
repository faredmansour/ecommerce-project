import { Link } from "react-router-dom";
import { Phone, Mail, MapPin, Twitter, Instagram, Facebook } from "lucide-react";
import { siteConfig } from "../config/site.config";
import logo from "../assets/brand/logo.svg";

const year = new Date().getFullYear();

export default function Footer() {
  const { brand, contact, social, footer } = siteConfig;

  return (
    <footer className="mt-auto border-t border-line bg-surface-muted text-ink">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:py-12">
        <div className="grid grid-cols-1 gap-9 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1.2fr] lg:gap-12">
          <div>
            <div className="mb-4 flex items-center gap-2.5">
              <img src={logo} alt={brand.name} className="h-10 w-auto" />
            </div>
            <p className="max-w-xs text-sm font-semibold tracking-wide text-muted">{brand.tagline}</p>
            <div className="mt-5 flex items-center gap-2">
              <Social href={social.twitter} icon={Twitter} label="Twitter" />
              <Social href={social.instagram} icon={Instagram} label="Instagram" />
              <Social href={social.facebook} icon={Facebook} label="Facebook" />
            </div>
          </div>

          <FooterCol title="Quick Links" links={footer.quickLinks} />
          <FooterCol title="Account" links={footer.accountLinks} />

          <div>
            <h3 className="mb-4 font-display font-bold">Contact</h3>
            <ul className="space-y-3 text-sm text-muted">
              <li className="flex items-start gap-2.5"><Phone size={16} className="mt-0.5 shrink-0 text-secondary" /> {contact.phone}</li>
              <li className="flex items-start gap-2.5"><Mail size={16} className="mt-0.5 shrink-0 text-secondary" /> {contact.email}</li>
              <li className="flex items-start gap-2.5"><MapPin size={16} className="mt-0.5 shrink-0 text-secondary" /> {contact.address}</li>
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-line pt-5 text-xs text-muted sm:flex-row sm:text-sm">
          <p>&copy; {year} {brand.name}. All rights reserved.</p>
          <p>WHERE LEGENDS MEET TECHNOLOGY.</p>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }) {
  return (
    <div>
      <h3 className="mb-4 font-display font-bold">{title}</h3>
      <ul className="space-y-3">
        {links.map((l) => (
          <li key={l.href}>
            <Link to={l.href} className="text-sm text-muted transition hover:text-brand">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Social({ href, icon: Icon, label }) {
  return (
    <a
      href={href}
      aria-label={label}
      className="grid h-10 w-10 place-items-center rounded-full border border-line text-muted transition-colors hover:border-brand hover:bg-brand hover:text-white"
    >
      <Icon size={18} />
    </a>
  );
}
