/**
 * ──────────────────────────────────────────────────────────────────────────
 *  STORE CONFIG — single source of truth for branding.
 *  Rebrand the whole template from here: name, logo, currency, hero, nav,
 *  footer, contact and feature highlights. Change the color theme in
 *  src/index.css (the --color-* CSS variables).
 * ──────────────────────────────────────────────────────────────────────────
 */
export const siteConfig = {
  brand: {
    name: "ALFREDO",
    // Short mark shown in the logo badge (1–2 letters) when no logo image is set.
    logoText: "A",
    // Optional logo image URL (place in /public). Leave empty to use the text badge.
    logoSrc: "",
    tagline: "Quality products at great prices.",
  },

  // Currency formatting used across the whole storefront.
  currency: {
    code: "USD",
    locale: "en-US",
  },

  // Free-shipping threshold (in currency units). Set to 0 to disable.
  freeShippingThreshold: 50,
  shippingFee: 5.99,

  announcement: {
    enabled: true,
    text: "Free shipping on orders over $50 · 30-day easy returns",
  },

  hero: {
    eyebrow: "New Season",
    title: "Discover products you'll love",
    subtitle:
      "Curated quality across every category — shop the latest with fast delivery and easy returns.",
    ctaLabel: "Shop Now",
    ctaHref: "/category",
    secondaryCtaLabel: "Browse Categories",
    // Hero image lives in /public.
    image: "/Widgets.png",
  },

  // Trust/feature highlights shown on the home page.
  features: [
    { icon: "Truck", title: "Free Shipping", subtitle: "On orders over $50" },
    { icon: "ShieldCheck", title: "Secure Payment", subtitle: "100% protected" },
    { icon: "RefreshCw", title: "Easy Returns", subtitle: "30-day policy" },
    { icon: "Headphones", title: "24/7 Support", subtitle: "Dedicated team" },
  ],

  contact: {
    phone: "+1-202-555-0104",
    email: "support@alfredo.com",
    address: "123 Commerce St, New York",
  },

  social: {
    twitter: "#",
    instagram: "#",
    facebook: "#",
  },

  footer: {
    quickLinks: [
      { label: "Home", href: "/home" },
      { label: "All Products", href: "/category" },
      { label: "Cart", href: "/cart" },
      { label: "Wishlist", href: "/wishlist" },
    ],
    accountLinks: [
      { label: "Login", href: "/login" },
      { label: "Register", href: "/register" },
    ],
  },
};

export default siteConfig;
