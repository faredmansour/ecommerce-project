const Cart = require("../models/cartModel");
const Product = require("../models/productModel");
const controllerError = require("../utils/controllerError");

const findAvailableProduct = async (productId) => Product.findOne({
  _id: productId,
  status: "active",
  publicationState: "published",
}).select("stock");

const getCart = async (req, res) => {
  try {
    const cart = await Cart.findOne({ user: req.user.id });
    res.status(200).json({ data: cart?.items || [] });
  } catch (err) {
    res.status(500).json({ status: "error", message: controllerError(err, req) });
  }
};

const addToCart = async (req, res) => {
  try {
    const { product_id, quantity = 1, name, price, image, category } = req.body;
    if (!product_id || !name || !price) {
      return res.status(400).json({ status: "fail", message: "Product data is required" });
    }

    const product = await findAvailableProduct(product_id);
    if (!product) {
      return res.status(404).json({ status: "fail", message: "Product is unavailable." });
    }

    let cart = await Cart.findOne({ user: req.user.id });
    const existingItem = cart?.items.find((item) => item.product_id === product_id);
    const requestedQuantity = (Number(existingItem?.quantity) || 0) + quantity;
    if (requestedQuantity > product.stock) {
      return res.status(409).json({ status: "fail", message: `Only ${product.stock} available.` });
    }

    if (!cart) cart = await Cart.create({ user: req.user.id, items: [] });
    if (existingItem) existingItem.quantity = requestedQuantity;
    else cart.items.push({ product_id, name, price, image, category, quantity });
    await cart.save();
    res.status(200).json({ status: "success", data: cart.items });
  } catch (err) {
    res.status(500).json({ status: "error", message: controllerError(err, req) });
  }
};

const updateCartItem = async (req, res) => {
  try {
    const { quantity } = req.body;
    if (quantity == null || quantity < 1) {
      return res.status(400).json({ status: "fail", message: "Quantity must be at least 1" });
    }

    const cart = await Cart.findOne({ user: req.user.id });
    if (!cart) {
      return res.status(404).json({ status: "fail", message: "Cart not found" });
    }

    const item = cart.items.id(req.params.id);
    if (!item) {
      return res.status(404).json({ status: "fail", message: "Item not found" });
    }

    const product = await findAvailableProduct(item.product_id);
    if (!product) {
      return res.status(404).json({ status: "fail", message: "Product is unavailable." });
    }
    if (quantity > product.stock) {
      return res.status(409).json({ status: "fail", message: `Only ${product.stock} available.` });
    }

    item.quantity = quantity;
    await cart.save();
    res.status(200).json({ status: "success", data: cart.items });
  } catch (err) {
    res.status(500).json({ status: "error", message: controllerError(err, req) });
  }
};

const removeCartItem = async (req, res) => {
  try {
    const cart = await Cart.findOne({ user: req.user.id });
    if (!cart) {
      return res.status(404).json({ status: "fail", message: "Cart not found" });
    }

    cart.items = cart.items.filter((item) => item.id !== req.params.id);
    await cart.save();
    res.status(200).json({ status: "success", data: cart.items });
  } catch (err) {
    res.status(500).json({ status: "error", message: controllerError(err, req) });
  }
};

module.exports = {
  getCart,
  addToCart,
  updateCartItem,
  removeCartItem,
};
