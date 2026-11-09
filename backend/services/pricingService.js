const Product = require("../models/productModel");
const PriceBook = require("../models/priceBookModel");
const PriceDefinition = require("../models/priceDefinitionModel");
const AppError = require("../utils/appError");
const { normalizeCurrency } = require("../utils/money");

const DEFAULT_CURRENCY = "EGP";

const buildPriceError = (code, message, statusCode = 404) => {
  const err = new AppError(message, statusCode);
  err.code = code;
  return err;
};

const ensureDefaultPriceBook = async ({ currency = DEFAULT_CURRENCY, priceBookId = null } = {}) => {
  const normalizedCurrency = normalizeCurrency(currency);

  let query = { status: "active" };
  if (priceBookId) {
    query = { _id: priceBookId, status: "active" };
  } else {
    query.isDefault = true;
  }

  const book = await PriceBook.findOne(query).lean();
  if (!book) {
    throw buildPriceError("PRICE_BOOK_INACTIVE", "No active price book is available for the requested context.", 422);
  }

  if (!book.currencyCodes.includes(normalizedCurrency)) {
    throw buildPriceError("CURRENCY_UNSUPPORTED", `Currency ${normalizedCurrency} is not supported by the selected price book.`, 422);
  }

  return book;
};

const resolvePrice = async ({ sellableId, currency = DEFAULT_CURRENCY, asOf = new Date(), priceBookId = null, sellableType = "product" }) => {
  const normalizedCurrency = normalizeCurrency(currency);

  const product = await Product.findById(sellableId).lean();
  if (!product) {
    throw buildPriceError("SELLABLE_NOT_FOUND", "Sellable not found.", 404);
  }

  const book = await ensureDefaultPriceBook({ currency: normalizedCurrency, priceBookId });

  const definitions = await PriceDefinition.findEligibleDefinitions({
    sellableId,
    priceBookId: book._id,
    currency: normalizedCurrency,
    asOf: new Date(asOf),
  });

  const eligibleSale = definitions.filter((definition) => definition.priceKind === "sale");
  const eligibleBase = definitions.filter((definition) => definition.priceKind === "base");

  if (eligibleSale.length > 1 || eligibleBase.length > 1) {
    throw buildPriceError("AMBIGUOUS_PRICE", "More than one eligible definition exists for the same sellable and price context.", 409);
  }

  if (eligibleSale.length === 1) {
    const chosen = eligibleSale[0];
    return {
      sellableId: chosen.sellableId.toString(),
      priceId: chosen._id.toString(),
      revision: chosen.revision,
      priceBookId: chosen.priceBookId.toString(),
      amountMinor: chosen.amountMinor,
      currency: chosen.currency,
      priceKind: chosen.priceKind,
      compareAtAmountMinor: chosen.compareAtAmountMinor,
      resolvedAt: new Date().toISOString(),
    };
  }

  if (eligibleBase.length === 1) {
    const chosen = eligibleBase[0];
    return {
      sellableId: chosen.sellableId.toString(),
      priceId: chosen._id.toString(),
      revision: chosen.revision,
      priceBookId: chosen.priceBookId.toString(),
      amountMinor: chosen.amountMinor,
      currency: chosen.currency,
      priceKind: chosen.priceKind,
      compareAtAmountMinor: chosen.compareAtAmountMinor,
      resolvedAt: new Date().toISOString(),
    };
  }

  throw buildPriceError("PRICE_NOT_FOUND", "No active price definition exists for the requested sellable and currency.", 404);
};

module.exports = {
  DEFAULT_CURRENCY,
  ensureDefaultPriceBook,
  resolvePrice,
};
