export const siteConfig = {
  brand: {
    name: "ALFREDO",
    logoText: "A",
    logoSrc: "",
    tagline: "منتجات عالية الجودة بأفضل الأسعار",
  },

  // العملة: يمكنك إبقاؤها USD أو تحويلها لـ EGP / SAR حسب السوق المستهدف
  currency: {
    code: "USD",
    locale: "en-US",
  },

  freeShippingThreshold: 50,
  shippingFee: 5.99,

  announcement: {
    enabled: true,
    text: "شحن مجاني للطلبات لأكثر من $50 · إمكانية الإرجاع خلال 30 يومًا",
  },

  hero: {
    eyebrow: "تشكيلة جديدة",
    title: "اكتشف منتجاتك المفضلة اليوم",
    subtitle: "جودة ممتازة في جميع التصنيفات — تسوق أحدث المنتجات مع شحن سريع وتجربة تسوق آمنة.",
    ctaLabel: "تسوق الآن",
    ctaHref: "/category",
    secondaryCtaLabel: "تصفح التصنيفات",
    image: "/Widgets.png",
  },

  features: [
    { icon: "Truck", title: "شحن مجاني", subtitle: "للطلبات فوق $50" },
    { icon: "ShieldCheck", title: "دفع آمن", subtitle: "حماية بنسبة 100%" },
    { icon: "RefreshCw", title: "إرجاع سهل", subtitle: "سياسة إرجاع 30 يومًا" },
    { icon: "Headphones", title: "دعم 24/7", subtitle: "فريق جاهز للمساعدة" },
  ],

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
      { label: "الرئيسية", href: "/home" },
      { label: "جميع المنتجات", href: "/category" },
      { label: "سلة المشتريات", href: "/cart" },
      { label: "المفضلة", href: "/wishlist" },
    ],
    accountLinks: [
      { label: "تسجيل الدخول", href: "/login" },
      { label: "إنشاء حساب", href: "/register" },
    ],
  },
};

export default siteConfig;