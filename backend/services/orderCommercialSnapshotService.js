const Product = require("../models/productModel");
const { resolvePrice, ensureDefaultPriceBook, DEFAULT_CURRENCY } = require("./pricingService");
const AppError = require("../utils/appError");

function fail(code, message, statusCode = 422) {
  const error = new AppError(message, statusCode);
  error.code = code;
  return error;
}

function toLegacyMajorUnits(amountMinor) {
  // Compatibility projection only. Payment authority remains integer minor units.
  return Number((amountMinor / 100).toFixed(2));
}

function toMinorUnits(amount) {
  if (!Number.isFinite(amount)) return null;
  const amountMinor = Math.round(amount * 100);
  if (!Number.isSafeInteger(amountMinor) || Math.abs(amount * 100 - amountMinor) > 1e-6) return null;
  return amountMinor;
}

async function buildOrderCommercialSnapshot(requestedItems, {
  currency = DEFAULT_CURRENCY,
  coupon = null,
  requestedTotalAmount,
} = {}) {
  const normalizedCurrency = String(currency).trim().toUpperCase();
  const priceBook = await ensureDefaultPriceBook({ currency: normalizedCurrency });
  const pricingAsOf = new Date();
  const requestedByProduct = new Map();

  for (const requested of requestedItems) {
    const productId = String(requested.product_id).toLowerCase();
    if (requested.product && String(requested.product).toLowerCase() !== productId) {
      throw fail("PRODUCT_MISMATCH", "The submitted product references do not match.", 422);
    }
    const quantity = requested.quantity;
    if (!Number.isSafeInteger(quantity) || quantity < 1) {
      throw fail("INVALID_QUANTITY", "Order quantities must be positive whole numbers.", 400);
    }

    const entry = requestedByProduct.get(productId) || { quantity, suppliedPrices: [requested.price], productId };
    if (requestedByProduct.has(productId)) {
      entry.quantity += quantity;
      entry.suppliedPrices.push(requested.price);
    }
    if (!Number.isSafeInteger(entry.quantity)) {
      throw fail("ORDER_QUANTITY_OUT_OF_RANGE", "The requested quantity exceeds the supported range.", 422);
    }
    requestedByProduct.set(productId, entry);
  }

  const items = [];
  let subtotalMinor = 0;

  for (const requested of requestedByProduct.values()) {
    const product = await Product.findById(requested.productId).lean();
    if (!product || product.status !== "active" || product.publicationState !== "published") {
      throw fail("SELLABLE_UNAVAILABLE", "One or more requested products are unavailable.", 422);
    }

    if (!Number.isSafeInteger(product.stock) || product.stock < requested.quantity) {
      throw fail("INSUFFICIENT_STOCK", "One or more requested products do not have enough stock.", 409);
    }

    const resolved = await resolvePrice({
      sellableId: product._id,
      currency: normalizedCurrency,
      priceBookId: priceBook._id,
      asOf: pricingAsOf,
    });
    if (resolved.currency !== normalizedCurrency || !Number.isSafeInteger(resolved.amountMinor) || resolved.amountMinor < 0) {
      throw fail("PRICE_INVALID", "A valid authoritative price is unavailable for an Order item.", 422);
    }

    if (requested.suppliedPrices.some((price) => toMinorUnits(price) !== resolved.amountMinor)) {
      throw fail("PRICE_MISMATCH", "One or more submitted item prices are no longer valid.", 422);
    }

    const lineTotalMinor = resolved.amountMinor * requested.quantity;
    if (!Number.isSafeInteger(lineTotalMinor) || !Number.isSafeInteger(subtotalMinor + lineTotalMinor)) {
      throw fail("ORDER_TOTAL_OUT_OF_RANGE", "The Order total exceeds the supported monetary range.", 422);
    }

    subtotalMinor += lineTotalMinor;
    items.push({
      product: product._id,
      product_id: product._id.toString(),
      name: product.name,
      quantity: requested.quantity,
      unitPriceMinor: resolved.amountMinor,
      lineTotalMinor,
      priceReference: {
        priceId: resolved.priceId,
        priceBookId: resolved.priceBookId,
        revision: resolved.revision,
      },
      // Kept for legacy read clients; never used as pricing or payment authority.
      price: toLegacyMajorUnits(resolved.amountMinor),
      image: product.image || "",
      category: product.category?.toString?.() || "",
    });
  }

  if (toMinorUnits(requestedTotalAmount) !== subtotalMinor) {
    throw fail("TOTAL_MISMATCH", "The submitted order subtotal does not match current product prices.", 422);
  }

  let discountMinor = 0;
  if (coupon) {
    const discountValue = Number(coupon.discountValue);
    const minimumAmountMinor = toMinorUnits(Number(coupon.minimumAmount || 0));
    if (!Number.isFinite(discountValue) || discountValue < 0 || minimumAmountMinor === null) {
      throw fail("INVALID_COUPON", "The coupon has an invalid discount configuration.", 422);
    }
    if (minimumAmountMinor > subtotalMinor) {
      throw fail("COUPON_MINIMUM_NOT_MET", "The order does not meet the minimum amount for this coupon.", 422);
    }
    if (coupon.discountType === "percentage" && discountValue <= 100) {
      discountMinor = Math.round(subtotalMinor * discountValue / 100);
    } else if (coupon.discountType === "fixed") {
      discountMinor = toMinorUnits(discountValue);
      if (discountMinor === null) {
        throw fail("INVALID_COUPON", "The coupon has an invalid discount configuration.", 422);
      }
    } else {
      throw fail("INVALID_COUPON", "The coupon has an invalid discount configuration.", 422);
    }
    discountMinor = Math.min(discountMinor, subtotalMinor);
  }

  const shippingMinor = 0;
  const taxMinor = 0;
  const grandTotalMinor = subtotalMinor - discountMinor + shippingMinor + taxMinor;

  if (!Number.isSafeInteger(grandTotalMinor) || grandTotalMinor < 0) {
    throw fail("ORDER_TOTAL_INVALID", "The authoritative Order total is invalid.", 422);
  }

  return {
    items,
    subtotalMinor,
    discountMinor,
    totalAmount: toLegacyMajorUnits(grandTotalMinor),
    discount: toLegacyMajorUnits(discountMinor),
    commercialSnapshot: {
      currency: normalizedCurrency,
      subtotalMinor,
      discountMinor,
      shippingMinor,
      taxMinor,
      grandTotalMinor,
    },
  };
}

module.exports = { buildOrderCommercialSnapshot, toLegacyMajorUnits, toMinorUnits };
