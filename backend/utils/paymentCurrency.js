const supportedCurrencyCodes = new Set(
  typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("currency") : []
);

function isSupportedPaymentCurrency(value) {
  return typeof value === "string" && /^[A-Z]{3}$/.test(value) && supportedCurrencyCodes.has(value);
}

module.exports = { isSupportedPaymentCurrency };
