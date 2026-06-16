import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Truck, ShieldCheck, RefreshCw, Headphones, Sparkles } from "lucide-react";
import { productsAPI, categoriesAPI } from "../services/api";
import ProductCard from "../components/ProductCard";
import { siteConfig } from "../config/site.config";

const ICONS = { Truck, ShieldCheck, RefreshCw, Headphones };

export default function HomePage() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([productsAPI.getAll(), categoriesAPI.getAllRaw()])
      .then(([productsRes, categoriesRes]) => {
        setProducts(productsRes.data);
        const raw = categoriesRes.data;
        setCategories(Array.isArray(raw) ? raw : []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const featured = products.slice(0, 8);
  const { hero, features } = siteConfig;

  return (
    <div>
      {/* Hero */}
      <section className="max-w-7xl mx-auto px-4 pt-6">
        <div className="relative overflow-hidden rounded-3xl bg-brand text-brand-fg">
          <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-gold/20 blur-3xl" />
          <div className="absolute right-1/3 bottom-0 h-56 w-56 rounded-full bg-gold/10 blur-3xl" />
          <div className="relative grid md:grid-cols-2 items-center gap-8 px-7 sm:px-12 py-12 sm:py-16">
            <div className="max-w-lg">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-gold/15 text-gold px-3 py-1 text-xs font-semibold uppercase tracking-wider">
                <Sparkles size={13} /> {hero.eyebrow}
              </span>
              <h1 className="font-display text-4xl sm:text-5xl font-extrabold leading-[1.1] mt-4">{hero.title}</h1>
              <p className="mt-4 text-base sm:text-lg opacity-75">{hero.subtitle}</p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link
                  to={hero.ctaHref}
                  className="inline-flex items-center gap-2 rounded-full bg-gold text-gold-fg font-semibold px-6 py-3 hover:opacity-90 active:scale-95 transition"
                >
                  {hero.ctaLabel} <ArrowRight size={18} />
                </Link>
                <Link
                  to="/category"
                  className="inline-flex items-center gap-2 rounded-full border border-white/25 px-6 py-3 font-semibold hover:bg-white/10 transition"
                >
                  {hero.secondaryCtaLabel}
                </Link>
              </div>
            </div>
            <div className="hidden md:block">
              <img
                src={hero.image}
                alt={siteConfig.brand.name}
                className="w-full max-w-md ml-auto rounded-2xl object-cover shadow-2xl ring-1 ring-white/10"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Trust bar */}
      <section className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {features.map((f) => {
            const Icon = ICONS[f.icon] || Truck;
            return (
              <div
                key={f.title}
                className="flex items-center gap-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4"
              >
                <span className="grid place-items-center h-11 w-11 rounded-xl bg-gold/15 text-gold shrink-0">
                  <Icon size={20} />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-zinc-900 dark:text-white">{f.title}</p>
                  <p className="text-xs text-zinc-500 truncate">{f.subtitle}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Categories */}
      <section className="max-w-7xl mx-auto px-4 py-6">
        <SectionHeader title="Shop by Category" href="/category" />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mt-5">
          {categories.map((cat) => {
            const name = cat.name || cat;
            return (
              <Link
                key={cat._id || cat}
                to={`/category?cat=${encodeURIComponent(name)}`}
                className="group rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 text-center hover:border-gold hover:shadow-card transition"
              >
                <div className="grid place-items-center w-14 h-14 mx-auto mb-3 rounded-full bg-zinc-100 dark:bg-zinc-800 group-hover:bg-gold/15 transition">
                  <span className="font-display text-gold font-extrabold text-xl">{name.charAt(0)}</span>
                </div>
                <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">{name}</p>
              </Link>
            );
          })}
          {categories.length === 0 && !loading && (
            <p className="col-span-full text-center text-zinc-400 py-6">No categories yet.</p>
          )}
        </div>
      </section>

      {/* Featured products */}
      <section className="max-w-7xl mx-auto px-4 py-10">
        <SectionHeader title="Featured Products" href="/category" />
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5 mt-5">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden animate-pulse">
                <div className="aspect-square bg-zinc-200 dark:bg-zinc-800" />
                <div className="p-4 space-y-2">
                  <div className="h-3 bg-zinc-200 dark:bg-zinc-800 rounded w-1/3" />
                  <div className="h-4 bg-zinc-200 dark:bg-zinc-800 rounded w-4/5" />
                  <div className="h-8 bg-zinc-200 dark:bg-zinc-800 rounded mt-3" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5 mt-5">
            {featured.map((product) => (
              <ProductCard key={product._id || product.id} product={product} />
            ))}
          </div>
        )}
      </section>

      {/* CTA band */}
      <section className="max-w-7xl mx-auto px-4 pb-14">
        <div className="rounded-3xl bg-gradient-to-r from-zinc-900 to-zinc-800 text-white px-8 py-12 text-center">
          <h2 className="font-display text-3xl font-extrabold mb-3">Join {siteConfig.brand.name} today</h2>
          <p className="opacity-70 max-w-md mx-auto mb-6">
            Create an account to save favorites, track orders, and unlock member deals.
          </p>
          <Link
            to="/register"
            className="inline-flex items-center gap-2 rounded-full bg-gold text-gold-fg font-semibold px-6 py-3 hover:opacity-90 transition"
          >
            Sign Up Free <ArrowRight size={18} />
          </Link>
        </div>
      </section>
    </div>
  );
}

function SectionHeader({ title, href }) {
  return (
    <div className="flex items-end justify-between">
      <h2 className="font-display text-2xl font-extrabold text-zinc-900 dark:text-white">{title}</h2>
      <Link to={href} className="text-sm font-medium text-gold hover:underline flex items-center gap-1">
        View All <ArrowRight size={14} />
      </Link>
    </div>
  );
}
