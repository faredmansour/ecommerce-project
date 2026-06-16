const Wishlist = require("../models/wishlistModel");

const getWishlist = async (req, res) => {
  try {
    const wishlist = await Wishlist.findOne({ user: req.user.id });
    res.status(200).json({ data: wishlist?.items || [] });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
};

const addWishlistItem = async (req, res) => {
  try {
    const { product_id, name, image, category } = req.body;
    if (!product_id || !name) {
      return res.status(400).json({ status: "fail", message: "Product data is required" });
    }

    let wishlist = await Wishlist.findOne({ user: req.user.id });
    if (!wishlist) {
      wishlist = await Wishlist.create({ user: req.user.id, items: [] });
    }

    if (wishlist.items.some((item) => item.product_id === product_id)) {
      return res.status(200).json({ status: "success", data: wishlist.items });
    }

    wishlist.items.push({ product_id, name, image, category });
    await wishlist.save();
    res.status(200).json({ status: "success", data: wishlist.items });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
};

const removeWishlistItem = async (req, res) => {
  try {
    const wishlist = await Wishlist.findOne({ user: req.user.id });
    if (!wishlist) {
      return res.status(404).json({ status: "fail", message: "Wishlist not found" });
    }

    wishlist.items = wishlist.items.filter((item) => item.product_id !== req.params.productId);
    await wishlist.save();
    res.status(200).json({ status: "success", data: wishlist.items });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
};

module.exports = {
  getWishlist,
  addWishlistItem,
  removeWishlistItem,
};
