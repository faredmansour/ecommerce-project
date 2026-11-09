import { siteConfig } from "../config/site.config";

const formatter = new Intl.NumberFormat(siteConfig.currency.locale, {
  style: "currency",
  currency: siteConfig.currency.code,
});

/** Format a number as a localized currency string (e.g. $29.99). */
export function formatPrice(amount) {
  const value = Number(amount);
  if (Number.isNaN(value)) return formatter.format(0);
  return formatter.format(value);
}

export function formatCurrency(amount, currency) {
  const value = Number(amount);
  if (!Number.isFinite(value)) return "—";
  if (!currency) return `${value.toFixed(2)} (currency unavailable)`;

  try {
    return new Intl.NumberFormat(siteConfig.currency.locale, {
      style: "currency",
      currency,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

export default formatPrice;
