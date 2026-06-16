const Products = require("../models/productModel");
const fs = require("fs");

const getProducts = async (req, res) => {
  try {
    const { category, search, sort, page = 1, limit = 12 } = req.query;
    const filter = {};

    if (category) filter.category = category;

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    const sortOptions = {
      "price-asc": { price: 1 },
      "price-desc": { price: -1 },
      rating: { rating: -1 },
      name: { name: 1 },
      latest: { createdAt: -1 },
    };

    const pageNumber = Math.max(1, parseInt(page, 10) || 1);
    const pageSize = Math.max(1, parseInt(limit, 10) || 12);
    const sortQuery = sortOptions[sort] || { createdAt: -1 };

    const total = await Products.countDocuments(filter);
    const products = await Products.find(filter)
      .populate("category", "name description")
      .sort(sortQuery)
      .skip((pageNumber - 1) * pageSize)
      .limit(pageSize);

    res.status(200).json({
      success: true,
      count: products.length,
      total,
      page: pageNumber,
      limit: pageSize,
      pages: Math.ceil(total / pageSize),
      products,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error", error: err.message });
  }
};

const getProductById = async (req, res) => {
  try {
    const product = await Products.findById(req.params.id).populate("category", "name description");
    if (!product) return res.status(404).json({ message: "Product not found" });
    res.status(200).json({ success: true, product });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error", error: err.message });
  }
};

const createProduct = async (req, res) => {
  try {
    const { name, description, price, category, stock } = req.body;

    const image = req.file ? `/uploadimage/${req.file.filename}` : null;

    const product = await Products.create({
      name,
      description,
      price,
      category,
      stock,
      image,
    });

    await product.populate("category", "name description");

    res.status(201).json({ success: true, product });
  } catch (err) {
    if (req.file) {
      fs.unlink(req.file.path, () => {});
    }
    res.status(500).json({ success: false, message: "Server error", error: err.message });
  }
};

const updateProduct = async (req, res) => {
  try {
    const { name, description, price, category, stock } = req.body;
    const updateData = { name, description, price, category, stock };

    if (req.file) {
      const oldProduct = await Products.findById(req.params.id);
      if (oldProduct?.image) {
        const oldPath = `.${oldProduct.image}`;
        if (fs.existsSync(oldPath)) fs.unlink(oldPath, () => {});
      }
      updateData.image = `/uploadimage/${req.file.filename}`;
    }

    const product = await Products.findByIdAndUpdate(req.params.id, updateData, { new: true })
      .populate("category", "name description");

    if (!product) return res.status(404).json({ message: "Product not found" });

    res.status(200).json({ success: true, product });
  } catch (err) {
    if (req.file) fs.unlink(req.file.path, () => {});
    res.status(500).json({ success: false, message: "Server error", error: err.message });
  }
};

const deleteProduct = async (req, res) => {
  try {
    const product = await Products.findByIdAndDelete(req.params.id);
    if (!product) return res.status(404).json({ message: "Product not found" });

    if (product.image) {
      const imgPath = `.${product.image}`;
      if (fs.existsSync(imgPath)) fs.unlink(imgPath, () => {});
    }

    res.status(200).json({ success: true, message: "Product deleted successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error", error: err.message });
  }
};

module.exports = { getProducts, getProductById, createProduct, updateProduct, deleteProduct };
