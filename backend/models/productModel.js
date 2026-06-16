const mongoose = require("mongoose");

const prodschema = new mongoose.Schema({

  name: {
    type: String,
    required: true,
    trim: true,
  },

  description: {
    type: String,
    required: true,
    trim: true,
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

  image: {
    type: String,
    default: null,
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

});

module.exports = mongoose.model("products", prodschema);
