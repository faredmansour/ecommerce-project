const mongoose = require("mongoose");

const priceDefinitionSchema = new mongoose.Schema(
  {
    sellableType: {
      type: String,
      enum: ["product"],
      required: true,
      default: "product",
    },
    sellableId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    priceBookId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PriceBook",
      required: true,
      index: true,
    },
    amountMinor: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: "amountMinor must be an integer",
      },
    },
    currency: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      match: /^[A-Z]{3}$/,
    },
    priceKind: {
      type: String,
      enum: ["base", "sale"],
      required: true,
    },
    compareAtAmountMinor: {
      type: Number,
      min: 0,
      default: null,
      validate: {
        validator: (value) => value === null || Number.isInteger(value),
        message: "compareAtAmountMinor must be an integer or null",
      },
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
    effectiveFrom: {
      type: Date,
      required: true,
      index: true,
    },
    effectiveTo: {
      type: Date,
      default: null,
      index: true,
    },
    revision: {
      type: Number,
      min: 1,
      default: 1,
    },
    changedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      default: null,
    },
    changeReason: {
      type: String,
      trim: true,
      default: "",
      maxlength: 255,
    },
  },
  { timestamps: true }
);

priceDefinitionSchema.index({
  sellableType: 1,
  sellableId: 1,
  priceBookId: 1,
  currency: 1,
  priceKind: 1,
  status: 1,
  effectiveFrom: 1,
  effectiveTo: 1,
});

priceDefinitionSchema.statics.findEligibleDefinitions = function findEligibleDefinitions({ sellableId, priceBookId, currency, asOf }) {
  return this.find({
    sellableId,
    priceBookId,
    currency,
    status: "active",
    effectiveFrom: { $lte: asOf },
    $or: [{ effectiveTo: null }, { effectiveTo: { $gt: asOf } }],
  }).sort({ priceKind: 1, effectiveFrom: -1, createdAt: -1 });
};

module.exports = mongoose.model("PriceDefinition", priceDefinitionSchema);
