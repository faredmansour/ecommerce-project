export const siteConfig = {
  brand: {
    name: "ALFREDO",
    tagline: "WHERE LEGENDS MEET TECHNOLOGY.",
  },

  // العملة: يمكنك إبقاؤها USD أو تحويلها لـ EGP / SAR حسب السوق المستهدف
  currency: {
    code: "USD",
    locale: "en-US",
  },

  freeShippingThreshold: 50,
  shippingFee: 5.99,

  announcement: {
    enabled: false,
    text: "Free shipping on orders over $50",
  },

  hero: {
    eyebrow: "THE NEXT GENERATION",
    title: "PLAY LIKE A LEGEND.",
    secondaryTitle: "LIVE THE TECHNOLOGY.",
    subtitle: "Discover premium gaming gear and next-level technology.",
    ctaLabel: "EXPLORE COLLECTION",
    ctaHref: "/category",
  },

  contact: {
    phone: "+20 100 000 0000",
    email: "support@alfredo.com",
    address: "القاهرة، مصر",
  },

  social: {
    twitter: "#",
    instagram: "#",
    facebook: "#",
  },

  footer: {
    quickLinks: [
      { label: "Home", href: "/" },
      { label: "All products", href: "/category" },
      { label: "Shopping cart", href: "/cart" },
      { label: "Wishlist", href: "/wishlist" },
    ],
    accountLinks: [
      { label: "Log in", href: "/login" },
      { label: "Create account", href: "/register" },
    ],
  },
};

export default siteConfig;
