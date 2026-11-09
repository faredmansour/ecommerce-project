const CURRENCY_PATTERN = /^[A-Z]{3}$/;

const normalizeCurrency = (currency) => {
  const normalized = String(currency || "").trim().toUpperCase();
  if (!CURRENCY_PATTERN.test(normalized)) {
    throw new Error("Currency must be a valid ISO 4217 code");
  }
  return normalized;
};

const isValidMinorAmount = (amount) => Number.isInteger(amount) && amount >= 0;

const asMoney = (amountMinor, currency) => {
  if (!isValidMinorAmount(amountMinor)) {
    throw new Error("amountMinor must be a non-negative integer");
  }

  return {
    amountMinor,
    currency: normalizeCurrency(currency),
  };
};

module.exports = {
  CURRENCY_PATTERN,
  normalizeCurrency,
  isValidMinorAmount,
  asMoney,
};
