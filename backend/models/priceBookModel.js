const mongoose = require("mongoose");

const priceBookSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      unique: true,
      index: true,
      maxlength: 60,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 180,
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
    currencyCodes: {
      type: [String],
      required: true,
      validate: {
        validator: (values) => Array.isArray(values) && values.length > 0 && values.every((value) => /^[A-Z]{3}$/.test(value)),
        message: "currencyCodes must contain uppercase ISO 4217 codes",
      },
    },
  },
  { timestamps: true }
);

priceBookSchema.index({ status: 1, isDefault: 1 });

priceBookSchema.pre("save", async function nextHook() {
  if (!this.isDefault || this.status !== "active") {
    return;
  }

  await mongoose.model("PriceBook").updateMany(
    { _id: { $ne: this._id }, isDefault: true, status: "active" },
    { $set: { isDefault: false } }
  );
});

module.exports = mongoose.model("PriceBook", priceBookSchema);
