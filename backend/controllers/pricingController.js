const Product = require("../models/productModel");
const PriceBook = require("../models/priceBookModel");
const PriceDefinition = require("../models/priceDefinitionModel");
const { resolvePrice, ensureDefaultPriceBook } = require("../services/pricingService");

const buildResponse = (payload, status = 200) => ({
  status: "success",
  ...payload,
  statusCode: status,
});

const toApiError = (err) => ({
  status: "fail",
  code: err.code || "INTERNAL_ERROR",
  message: err.message || "An unexpected error occurred.",
});

exports.listPriceBooks = async (req, res) => {
  try {
    const books = await PriceBook.find().sort({ createdAt: -1 }).lean();
    return res.status(200).json(buildResponse({ priceBooks: books }));
  } catch (err) {
    return res.status(500).json(toApiError(err));
  }
};

exports.createPriceBook = async (req, res) => {
  try {
    const payload = { ...req.body };

    if (payload.isDefault) {
      await PriceBook.updateMany(
        { isDefault: true, status: "active" },
        { $set: { isDefault: false } }
      );
    }

    const priceBook = await PriceBook.create(payload);
    return res.status(201).json(buildResponse({ priceBook }, 201));
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ status: "fail", code: "DUPLICATE_PRICE_BOOK", message: "A price book with that code already exists." });
    }
    return res.status(500).json(toApiError(err));
  }
};

exports.updatePriceBook = async (req, res) => {
  try {
    const priceBook = await PriceBook.findById(req.params.id);
    if (!priceBook) {
      return res.status(404).json({ status: "fail", code: "PRICE_BOOK_NOT_FOUND", message: "Price book not found." });
    }

    if (req.body.isDefault === true) {
      await PriceBook.updateMany(
        { _id: { $ne: priceBook._id }, isDefault: true, status: "active" },
        { $set: { isDefault: false } }
      );
    }

    Object.assign(priceBook, req.body);
    await priceBook.save();

    return res.status(200).json(buildResponse({ priceBook }));
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ status: "fail", code: "DUPLICATE_PRICE_BOOK", message: "A price book with that code already exists." });
    }
    return res.status(500).json(toApiError(err));
  }
};

exports.listPriceDefinitions = async (req, res) => {
  try {
    const query = {};
    if (req.query.sellableId) query.sellableId = req.query.sellableId;
    if (req.query.priceBookId) query.priceBookId = req.query.priceBookId;
    if (req.query.currency) query.currency = String(req.query.currency).toUpperCase();
    if (req.query.status) query.status = req.query.status;
    if (req.query.priceKind) query.priceKind = req.query.priceKind;

    const definitions = await PriceDefinition.find(query).sort({ effectiveFrom: -1, createdAt: -1 }).lean();
    return res.status(200).json(buildResponse({ priceDefinitions: definitions }));
  } catch (err) {
    return res.status(500).json(toApiError(err));
  }
};

exports.createPriceDefinition = async (req, res) => {
  try {
    const payload = {
      ...req.body,
      sellableId: req.body.sellableId,
      priceBookId: req.body.priceBookId,
    };

    const productExists = await Product.exists({ _id: payload.sellableId });
    if (!productExists) {
      return res.status(404).json({
        status: "fail",
        code: "SELLABLE_NOT_FOUND",
        message: "Referenced product does not exist.",
      });
    }

    await ensureDefaultPriceBook({ currency: payload.currency, priceBookId: payload.priceBookId });

    const priceDefinition = await PriceDefinition.create(payload);
    return res.status(201).json(buildResponse({ priceDefinition }, 201));
  } catch (err) {
    if (err?.code === "PRICE_BOOK_INACTIVE" || err?.code === "CURRENCY_UNSUPPORTED") {
      return res.status(err.statusCode || 422).json({ status: "fail", code: err.code, message: err.message });
    }
    if (err?.code === 11000) {
      return res.status(409).json({ status: "fail", code: "DUPLICATE_PRICE_DEFINITION", message: "A price definition already exists for the same price configuration." });
    }
    return res.status(500).json(toApiError(err));
  }
};

exports.updatePriceDefinition = async (req, res) => {
  try {
    const priceDefinition = await PriceDefinition.findById(req.params.id);
    if (!priceDefinition) {
      return res.status(404).json({ status: "fail", code: "PRICE_DEFINITION_NOT_FOUND", message: "Price definition not found." });
    }

    Object.assign(priceDefinition, req.body);
    await priceDefinition.save();

    return res.status(200).json(buildResponse({ priceDefinition }));
  } catch (err) {
    return res.status(500).json(toApiError(err));
  }
};

exports.deactivatePriceDefinition = async (req, res) => {
  try {
    const priceDefinition = await PriceDefinition.findById(req.params.id);
    if (!priceDefinition) {
      return res.status(404).json({ status: "fail", code: "PRICE_DEFINITION_NOT_FOUND", message: "Price definition not found." });
    }

    priceDefinition.status = "inactive";
    await priceDefinition.save();

    return res.status(200).json(buildResponse({ priceDefinition }));
  } catch (err) {
    return res.status(500).json(toApiError(err));
  }
};

exports.resolveQuote = async (req, res) => {
  try {
    const currency = req.query.currency || "EGP";
    const price = await resolvePrice({
      sellableId: req.params.sellableId,
      currency,
      asOf: new Date(),
    });

    return res.status(200).json({ price });
  } catch (err) {
    const statusCode = err.statusCode || 500;
    return res.status(statusCode).json({
      status: "fail",
      code: err.code || "INTERNAL_ERROR",
      message: err.message || "Unable to resolve quote.",
    });
  }
};
