const Review = require("../models/reviewModel");
const Product = require("../models/productModel");

const getReviewsForProduct = async (req, res) => {
  try {
    const reviews = await Review.find({ product: req.params.productId }).populate("user", "name");
    res.status(200).json({ status: "success", data: reviews });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
};

const submitReview = async (req, res) => {
  try {
    const { rating, title, comment } = req.body;
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ status: "fail", message: "Rating must be between 1 and 5" });
    }

    const review = await Review.create({
      user: req.user.id,
      product: req.params.productId,
      rating,
      title,
      comment,
    });

    const aggregation = await Review.aggregate([
      { $match: { product: review.product } },
      { $group: { _id: "$product", averageRating: { $avg: "$rating" }, count: { $sum: 1 } } },
    ]);

    if (aggregation[0]) {
      await Product.findByIdAndUpdate(review.product, {
        rating: aggregation[0].averageRating,
        reviews_count: aggregation[0].count,
      });
    }

    res.status(201).json({ status: "success", data: review });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ status: "fail", message: "You already submitted a review for this product" });
    }
    res.status(500).json({ status: "error", message: err.message });
  }
};

module.exports = {
  getReviewsForProduct,
  submitReview,
};