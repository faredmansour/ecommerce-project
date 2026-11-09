const { PROVIDERS } = require("../providers/providerIdentifiers");
const { CAPABILITY_STATUS } = require("../providers/providerCapabilities");

const METHOD = Object.freeze({
  CARD: "card",
  MEEZA: "meeza",
  MOBILE_WALLET: "mobile_wallet",
  APPLE_PAY: "apple_pay",
  GOOGLE_PAY: "google_pay",
  INSTAPAY: "instapay",
  BNPL: "bnpl",
  COD: "cod",
  FAWRY_REFERENCE: "fawry_reference",
});

const PROVIDER_CAPABILITY = CAPABILITY_STATUS;
const EGYPT_EGP = Object.freeze({ countries: Object.freeze(["EG"]), currencies: Object.freeze(["EGP"]) });

const METHOD_CAPABILITIES = Object.freeze([
  Object.freeze({ method: METHOD.CARD, displayName: "Card", providers: Object.freeze({
    [PROVIDERS.PAYMOB]: PROVIDER_CAPABILITY.VERIFIED,
    [PROVIDERS.KASHIER]: PROVIDER_CAPABILITY.VERIFIED,
    [PROVIDERS.FAWRY]: PROVIDER_CAPABILITY.VERIFIED,
  }), ...EGYPT_EGP }),
  Object.freeze({ method: METHOD.MEEZA, displayName: "Meeza", providers: Object.freeze({
    [PROVIDERS.KASHIER]: PROVIDER_CAPABILITY.VERIFIED,
    [PROVIDERS.PAYMOB]: PROVIDER_CAPABILITY.NOT_VERIFIED,
    [PROVIDERS.FAWRY]: PROVIDER_CAPABILITY.NOT_VERIFIED,
  }), ...EGYPT_EGP }),
  Object.freeze({ method: METHOD.MOBILE_WALLET, displayName: "Mobile wallet", providers: Object.freeze({
    [PROVIDERS.PAYMOB]: PROVIDER_CAPABILITY.VERIFIED,
    [PROVIDERS.KASHIER]: PROVIDER_CAPABILITY.VERIFIED,
    [PROVIDERS.FAWRY]: PROVIDER_CAPABILITY.VERIFIED,
  }), ...EGYPT_EGP }),
  Object.freeze({ method: METHOD.APPLE_PAY, displayName: "Apple Pay", requiresDeviceCapability: "applePayAvailable", providers: Object.freeze({
    [PROVIDERS.PAYMOB]: PROVIDER_CAPABILITY.VERIFIED,
    [PROVIDERS.KASHIER]: PROVIDER_CAPABILITY.VERIFIED,
    [PROVIDERS.FAWRY]: PROVIDER_CAPABILITY.NOT_VERIFIED,
  }), ...EGYPT_EGP }),
  Object.freeze({ method: METHOD.GOOGLE_PAY, displayName: "Google Pay", requiresDeviceCapability: "googlePayAvailable", providers: Object.freeze({
    [PROVIDERS.PAYMOB]: PROVIDER_CAPABILITY.VERIFIED,
    [PROVIDERS.KASHIER]: PROVIDER_CAPABILITY.NOT_SUPPORTED,
    [PROVIDERS.FAWRY]: PROVIDER_CAPABILITY.NOT_VERIFIED,
  }), ...EGYPT_EGP }),
  Object.freeze({ method: METHOD.INSTAPAY, displayName: "InstaPay", providers: Object.freeze({
    [PROVIDERS.KASHIER]: PROVIDER_CAPABILITY.VERIFIED,
    [PROVIDERS.PAYMOB]: PROVIDER_CAPABILITY.NOT_VERIFIED,
    [PROVIDERS.FAWRY]: PROVIDER_CAPABILITY.NOT_VERIFIED,
  }), ...EGYPT_EGP }),
  Object.freeze({ method: METHOD.BNPL, displayName: "Buy now, pay later", providers: Object.freeze({
    [PROVIDERS.PAYMOB]: PROVIDER_CAPABILITY.VERIFIED,
    [PROVIDERS.KASHIER]: PROVIDER_CAPABILITY.VERIFIED,
    [PROVIDERS.FAWRY]: PROVIDER_CAPABILITY.VERIFIED,
  }), ...EGYPT_EGP }),
  // COD is documented as a provider product, but this merchant's collection and
  // fulfillment contract is not verified; it therefore remains unverified here.
  Object.freeze({ method: METHOD.COD, displayName: "Cash on delivery", providers: Object.freeze({
    [PROVIDERS.PAYMOB]: PROVIDER_CAPABILITY.NOT_VERIFIED,
    [PROVIDERS.KASHIER]: PROVIDER_CAPABILITY.NOT_VERIFIED,
    [PROVIDERS.FAWRY]: PROVIDER_CAPABILITY.NOT_VERIFIED,
  }), ...EGYPT_EGP }),
  Object.freeze({ method: METHOD.FAWRY_REFERENCE, displayName: "Fawry reference", providers: Object.freeze({
    [PROVIDERS.FAWRY]: PROVIDER_CAPABILITY.VERIFIED,
    [PROVIDERS.PAYMOB]: PROVIDER_CAPABILITY.NOT_VERIFIED,
    [PROVIDERS.KASHIER]: PROVIDER_CAPABILITY.NOT_VERIFIED,
  }), ...EGYPT_EGP }),
]);

const METHOD_BY_ID = new Map(METHOD_CAPABILITIES.map((entry) => [entry.method, entry]));
if (METHOD_BY_ID.size !== METHOD_CAPABILITIES.length) throw new Error("Duplicate payment method identifier.");

function getMethodCapability(method) {
  const capability = METHOD_BY_ID.get(method);
  if (!capability) {
    const error = new Error("Payment method is unsupported.");
    error.code = "METHOD_UNSUPPORTED";
    throw error;
  }
  return capability;
}

module.exports = { METHOD, METHOD_CAPABILITIES, getMethodCapability };
