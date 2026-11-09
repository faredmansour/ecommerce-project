const mongoose = require("mongoose");

const prodschema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    canonicalName: {
      type: String,
      trim: true,
      default: null,
    },

    description: {
      type: String,
      required: true,
      trim: true,
    },

    shortDescription: {
      type: String,
      trim: true,
      default: null,
      maxlength: 300,
    },

    longDescription: {
      type: String,
      trim: true,
      default: null,
      maxlength: 5000,
    },

    highlights: {
      type: [String],
      default: [],
      validate: {
        validator: (value) => Array.isArray(value) && value.every((item) => typeof item === "string" && item.length <= 200),
        message: "Highlights must be an array of short strings",
      },
    },

    slug: {
      type: String,
      trim: true,
      lowercase: true,
      unique: true,
      sparse: true,
      maxlength: 200,
    },

    status: {
      type: String,
      enum: ["draft", "active", "inactive", "archived"],
      default: "active",
    },

    publicationState: {
      type: String,
      enum: ["unpublished", "published", "hidden"],
      default: "published",
    },

    price: {
      type: Number,
      required: true,
      min: 0,
    },

    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Categories",
      required: true,
    },

    categoryIds: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "Categories",
      default: undefined,
    }],

    brandId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Brand",
      default: null,
    },

    image: {
      type: String,
      default: null,
    },

    primaryImageId: {
      type: String,
      default: null,
      trim: true,
    },

    stock: {
      type: Number,
      default: 0,
      min: 0,
    },

    rating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },

    reviews_count: {
      type: Number,
      default: 0,
      min: 0,
    },

    createdAt: {
      type: Date,
      default: Date.now,
    },

    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

prodschema.index({ brandId: 1, status: 1 });
prodschema.index({ categoryIds: 1, status: 1 });
prodschema.index({ category: 1, status: 1 });
prodschema.index({ status: 1, publicationState: 1 });
prodschema.index({ createdAt: -1 });
prodschema.index({ updatedAt: -1 });

module.exports = mongoose.model("products", prodschema);
