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

export default formatPrice;
