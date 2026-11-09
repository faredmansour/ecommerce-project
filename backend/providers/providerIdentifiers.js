const PROVIDERS = Object.freeze({
  PAYMOB: "paymob",
  KASHIER: "kashier",
  FAWRY: "fawry",
});

const PAYMENT_METHODS = Object.freeze({
  CARD: "card",
  MOBILE_WALLET: "mobile_wallet",
  INSTAPAY: "instapay",
  FAWRY: "fawry",
  BNPL: "bnpl",
  INSTALLMENTS: "installments",
  APPLE_PAY: "apple_pay",
  GOOGLE_PAY: "google_pay",
  COD: "cod",
});

module.exports = { PROVIDERS, PAYMENT_METHODS };
