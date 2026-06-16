const Products = require("../models/productModel");
const fs = require("fs");
const { getCache, setCache, invalidateCacheByPattern } = require("../utils/cache");
const cloudinary = require("../utils/cloudinary");

const PRODUCTS_CACHE_PREFIX = "products:";

// Resolve the stored image path for an uploaded file. When Cloudinary is
// configured the local temp file is pushed to the cloud and removed; otherwise
// the locally-served path is used.
const resolveImage = async (file) => {
  if (!file) return null;

  if (cloudinary.isConfigured()) {
    try {
      const buffer = fs.readFileSync(file.path);
      const result = await cloudinary.uploadToCloudinary(buffer, file.filename);
      fs.unlink(file.path, () => {});
      return result.secure_url;
    } catch (err) {
      // Fall back to the local file if the upload fails.
      return `/uploadimage/${file.filename}`;
    }
  }

  return `/uploadimage/${file.filename}`;
};

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

    const cacheKey = `${PRODUCTS_CACHE_PREFIX}list:${JSON.stringify({ category, search, sort, pageNumber, pageSize })}`;
    const cached = await getCache(cacheKey);
    if (cached) return res.status(200).json(cached);

    const total = await Products.countDocuments(filter);
    const products = await Products.find(filter)
      .populate("category", "name description")
      .sort(sortQuery)
      .skip((pageNumber - 1) * pageSize)
      .limit(pageSize);

    const payload = {
      success: true,
      count: products.length,
      total,
      page: pageNumber,
      limit: pageSize,
      pages: Math.ceil(total / pageSize),
      products,
    };

    await setCache(cacheKey, payload, 120);
    res.status(200).json(payload);
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
    const image = await resolveImage(req.file);

    const product = await Products.create({
      name,
      description,
      price,
      category,
      stock,
      image,
    });

    await product.populate("category", "name description");
    await invalidateCacheByPattern(`${PRODUCTS_CACHE_PREFIX}*`);

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
      if (oldProduct?.image && oldProduct.image.startsWith("/uploadimage/")) {
        const oldPath = `.${oldProduct.image}`;
        if (fs.existsSync(oldPath)) fs.unlink(oldPath, () => {});
      }
      updateData.image = await resolveImage(req.file);
    }

    // Drop undefined keys so a partial update doesn't overwrite fields with null.
    Object.keys(updateData).forEach((k) => updateData[k] === undefined && delete updateData[k]);

    const product = await Products.findByIdAndUpdate(req.params.id, updateData, { new: true })
      .populate("category", "name description");

    if (!product) return res.status(404).json({ message: "Product not found" });

    await invalidateCacheByPattern(`${PRODUCTS_CACHE_PREFIX}*`);
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

    if (product.image && product.image.startsWith("/uploadimage/")) {
      const imgPath = `.${product.image}`;
      if (fs.existsSync(imgPath)) fs.unlink(imgPath, () => {});
    }

    await invalidateCacheByPattern(`${PRODUCTS_CACHE_PREFIX}*`);
    res.status(200).json({ success: true, message: "Product deleted successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error", error: err.message });
  }
};

module.exports = { getProducts, getProductById, createProduct, updateProduct, deleteProduct };
