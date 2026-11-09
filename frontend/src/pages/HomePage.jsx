import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { siteConfig } from "../config/site.config";
import heroImageOne from "../assets/brand/home-hero-electronics-1.png";
import heroImageTwo from "../assets/brand/home-hero-electronics-2.png";
import heroImageThree from "../assets/brand/home-hero-electronics-3.png";
import gamingArenaImage from "../assets/brand/gaming-arena-user.png";
import { ActionLink, CategoryCard } from "../components/ui";
import ProductCard from "../components/ProductCard";
import { useEffect, useState } from "react";
import { productsAPI } from "../services/api";

const heroImages = [
  {
    src: heroImageOne,
    alt: "A collection of headphones, laptops, tablets, phones, and smartwatches",
    label: "Everyday technology",
  },
  {
    src: heroImageTwo,
    alt: "Headphones, smartphone, smartwatch, and wireless earbuds on a blue display",
    label: "Audio and mobile",
  },
  {
    src: heroImageThree,
    alt: "Smartphone, tablet, laptop, earbuds, and smartwatches arranged on a desk",
    label: "Connected devices",
  },
];

export default function HomePage() {
  const { hero } = siteConfig;
  const [featuredProducts, setFeaturedProducts] = useState([]);
  const [activeHeroImage, setActiveHeroImage] = useState(0);

  // Load a small set of products for the homepage showcase
  useEffect(() => {
    // The backend supports a `limit` query param; request a few items.
    productsAPI
      .getAll(undefined, undefined, { limit: 6 })
      .then((res) => setFeaturedProducts(res.data))
      .catch(() => setFeaturedProducts([]));
  }, []);

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return undefined;
    const timer = window.setInterval(() => {
      setActiveHeroImage((current) => (current + 1) % heroImages.length);
    }, 5000);
    return () => window.clearInterval(timer);
  }, []);

  const arenas = [
    {
      name: "GAMING",
      description: "Precision gear. Uninterrupted play.",
      image: gamingArenaImage,
      alt: "Gaming setup with a headset, controllers, RGB keyboard, gaming PC, and mice",
      href: "/category?search=gaming",
    },
    {
      name: "TECHNOLOGY",
      description: "Everyday technology, elevated.",
      image: heroImageThree,
      alt: "Smartphone, tablet, laptop, earbuds, and smartwatches arranged on a desk",
      href: "/category?search=technology",
    },
  ];

  return (
    <div>
      {/* Hero section */}
      <section aria-labelledby="home-title" className="mx-auto max-w-content px-4 pb-7 pt-5 sm:pb-9 sm:pt-7">
        <div className="brand-home-hero grid min-w-0 overflow-hidden md:min-h-[460px] md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="brand-home-hero-copy flex flex-col items-start justify-center px-6 py-9 sm:px-10 sm:py-12 lg:px-14">
            <p className="brand-home-hero-kicker inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-brand sm:text-sm">
              <span aria-hidden="true" className="h-px w-7 bg-brand" />
              {hero.eyebrow}
            </p>
            <h1 id="home-title" className="brand-home-hero-title mt-5 max-w-xl font-display text-hero font-extrabold uppercase leading-[0.98] tracking-[-0.06em] text-ink">
              {hero.title}
            </h1>
            <h2 className="brand-home-hero-subtitle mt-3 max-w-xl font-display text-xl font-bold uppercase leading-tight tracking-[-0.035em] text-secondary sm:text-2xl lg:text-3xl">
              {hero.secondaryTitle}
            </h2>
            <p className="brand-home-hero-description mt-5 max-w-md text-base leading-7 text-muted sm:text-lg">
              {hero.subtitle}
            </p>
            <ActionLink to={hero.ctaHref} className="brand-home-hero-cta mt-7 min-h-12 gap-3 px-6 py-3 font-bold tracking-wide">
              {hero.ctaLabel}
              <ArrowRight size={18} aria-hidden="true" />
            </ActionLink>
          </div>
          <div className="brand-home-hero-visual min-w-0">
            <figure className="brand-home-gallery">
              <div className="brand-home-gallery-stage">
                <img
                  key={heroImages[activeHeroImage].src}
                  src={heroImages[activeHeroImage].src}
                  alt={heroImages[activeHeroImage].alt}
                  className="brand-home-hero-image"
                />
                <button
                  type="button"
                  className="brand-home-gallery-control brand-home-gallery-previous"
                  aria-label="Show previous hero image"
                  onClick={() => setActiveHeroImage((current) => (current - 1 + heroImages.length) % heroImages.length)}
                >
                  <ChevronLeft size={20} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="brand-home-gallery-control brand-home-gallery-next"
                  aria-label="Show next hero image"
                  onClick={() => setActiveHeroImage((current) => (current + 1) % heroImages.length)}
                >
                  <ChevronRight size={20} aria-hidden="true" />
                </button>
              </div>
              <figcaption className="brand-home-gallery-caption">
                <span className="brand-home-gallery-label">{heroImages[activeHeroImage].label}</span>
                <div className="brand-home-gallery-thumbnails" aria-label="Choose a hero image">
                  {heroImages.map((image, index) => (
                    <button
                      key={image.src}
                      type="button"
                      className="brand-home-gallery-thumbnail"
                      aria-label={`Show ${image.label} image`}
                      aria-pressed={activeHeroImage === index}
                      onClick={() => setActiveHeroImage(index)}
                    >
                      <img src={image.src} alt="" />
                    </button>
                  ))}
                </div>
              </figcaption>
            </figure>
          </div>
        </div>
      </section>

      {/* Arena selection */}
      <section aria-labelledby="arena-title" className="mx-auto max-w-content px-4 pb-12 pt-2 sm:pb-16">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b border-line pb-4 sm:mb-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand">ALFREDO COLLECTIONS</p>
            <h2 id="arena-title" className="mt-2 font-display text-2xl font-extrabold uppercase tracking-[-0.04em] text-ink sm:text-3xl">
              CHOOSE YOUR ARENA.
            </h2>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 md:gap-6">
          {arenas.map((arena) => (
            <CategoryCard
              key={arena.name}
              title={arena.name}
              description={arena.description}
              image={arena.image}
              imageAlt={arena.alt}
              to={arena.href}
              className="arena-card-photo"
            />
          ))}
        </div>
      </section>

      {/* Featured products showcase */}
      {featuredProducts.length > 0 && (
        <section aria-labelledby="featured-products" className="mx-auto max-w-content px-4 py-8">
          <h2 id="featured-products" className="mb-4 font-display text-2xl font-bold text-ink">
            Featured Products
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {featuredProducts.map((product) => (
              <ProductCard key={product._id || product.id} product={product} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
