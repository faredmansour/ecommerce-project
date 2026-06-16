import { Link } from "react-router-dom";
import { Phone, Mail, MapPin, Twitter, Instagram, Facebook } from "lucide-react";
import { siteConfig } from "../config/site.config";

const year = new Date().getFullYear();

export default function Footer() {
  const { brand, contact, social, footer } = siteConfig;

  return (
    <footer className="bg-brand text-brand-fg mt-auto">
      <div className="max-w-7xl mx-auto px-4 py-14">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
          <div>
            <div className="flex items-center gap-2.5 mb-4">
              {brand.logoSrc ? (
                <img src={brand.logoSrc} alt={brand.name} className="h-8 w-auto" />
              ) : (
                <span className="grid place-items-center h-9 w-9 rounded-xl bg-gold text-gold-fg font-display font-extrabold text-lg">
                  {brand.logoText}
                </span>
              )}
              <span className="font-display text-xl font-extrabold tracking-tight">{brand.name}</span>
            </div>
            <p className="text-sm opacity-70 max-w-xs">{brand.tagline}</p>
            <div className="flex items-center gap-3 mt-5">
              <Social href={social.twitter} icon={Twitter} label="Twitter" />
              <Social href={social.instagram} icon={Instagram} label="Instagram" />
              <Social href={social.facebook} icon={Facebook} label="Facebook" />
            </div>
          </div>

          <FooterCol title="Quick Links" links={footer.quickLinks} />
          <FooterCol title="Account" links={footer.accountLinks} />

          <div>
            <h3 className="font-display font-bold mb-4">Contact</h3>
            <ul className="space-y-3 text-sm opacity-80">
              <li className="flex items-center gap-2"><Phone size={15} className="text-gold" /> {contact.phone}</li>
              <li className="flex items-center gap-2"><Mail size={15} className="text-gold" /> {contact.email}</li>
              <li className="flex items-center gap-2"><MapPin size={15} className="text-gold" /> {contact.address}</li>
            </ul>
          </div>
        </div>

        <div className="border-t border-white/10 mt-10 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm opacity-60">
          <p>&copy; {year} {brand.name}. All rights reserved.</p>
          <p>Crafted with care.</p>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }) {
  return (
    <div>
      <h3 className="font-display font-bold mb-4">{title}</h3>
      <ul className="space-y-2.5">
        {links.map((l) => (
          <li key={l.href}>
            <Link to={l.href} className="text-sm opacity-80 hover:opacity-100 hover:text-gold transition">
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
      className="grid place-items-center h-9 w-9 rounded-full bg-white/10 hover:bg-gold hover:text-gold-fg transition"
    >
      <Icon size={16} />
    </a>
  );
}
