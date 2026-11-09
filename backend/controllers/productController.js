const Products = require("../models/productModel");
const Brand = require("../models/brandModel");
const Categories = require("../models/categoryModel");
const fs = require("fs");
const { getCache, setCache, invalidateCacheByPattern } = require("../utils/cache");
const cloudinary = require("../utils/cloudinary");
const controllerError = require("../utils/controllerError");
const { ensureUniqueSlug } = require("../utils/catalogFoundation");

const PRODUCTS_CACHE_PREFIX = "products:";
const MAX_PAGE_SIZE = 1000;
const MAX_PAGE_NUMBER = 100000;
const MAX_SEARCH_LENGTH = 120;

const parsePositiveInteger = (value, defaultValue) => {
  if (value === undefined) return defaultValue;
  if (typeof value !== "string" && typeof value !== "number") return null;
  if (typeof value === "string" && !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const publicProductFilter = () => ({
  $and: [
    { $or: [{ status: "active" }, { status: { $exists: false } }] },
    { $or: [{ publicationState: "published" }, { publicationState: { $exists: false } }] },
  ],
});

const removeUploadedFile = (req) => {
  if (req.file?.path) fs.unlink(req.file.path, () => {});
};

const categoryReferencesExist = async (category, categoryIds) => {
  const ids = [...new Set([category, ...(Array.isArray(categoryIds) ? categoryIds : [])]
    .filter(Boolean)
    .map(String))];
  if (ids.length === 0) return true;
  return (await Categories.countDocuments({ _id: { $in: ids } })) === ids.length;
};

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
    if (category !== undefined && (typeof category !== "string" || (category && !/^[0-9a-fA-F]{24}$/.test(category)))) {
      return res.status(400).json({ success: false, message: "Invalid category ID" });
    }
    if (search !== undefined && (typeof search !== "string" || search.length > MAX_SEARCH_LENGTH)) {
      return res.status(400).json({ success: false, message: `Search must be a string of at most ${MAX_SEARCH_LENGTH} characters` });
    }
    if (sort !== undefined && typeof sort !== "string") {
      return res.status(400).json({ success: false, message: "Invalid sort value" });
    }

    const pageNumber = parsePositiveInteger(page, 1);
    const requestedPageSize = parsePositiveInteger(limit, 12);
    if (!pageNumber || pageNumber > MAX_PAGE_NUMBER || !requestedPageSize) {
      return res.status(400).json({ success: false, message: "Invalid pagination parameters" });
    }
    const pageSize = Math.min(requestedPageSize, MAX_PAGE_SIZE);
    const filter = publicProductFilter();

    if (category) filter.category = category;

    if (search) {
      const literalSearch = escapeRegex(search);
      filter.$and.push({ $or: [
        { name: { $regex: literalSearch, $options: "i" } },
        { description: { $regex: literalSearch, $options: "i" } },
      ] });
    }

    const sortOptions = {
      "price-asc": { price: 1 },
      "price-desc": { price: -1 },
      rating: { rating: -1 },
      name: { name: 1 },
      latest: { createdAt: -1 },
    };

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
    res.status(500).json({ success: false, message: "Server error", error: controllerError(err, req) });
  }
};

const getProductById = async (req, res) => {
  try {
    const product = await Products.findOne({ _id: req.params.id, ...publicProductFilter() })
      .populate("category", "name description");
    if (!product) return res.status(404).json({ message: "Product not found" });
    res.status(200).json({ success: true, product });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error", error: controllerError(err, req) });
  }
};

const createProduct = async (req, res) => {
  try {
    const {
      name,
      canonicalName,
      description,
      shortDescription,
      longDescription,
      highlights,
      slug,
      status,
      publicationState,
      price,
      category,
      categoryIds,
      brandId,
      stock,
    } = req.body;

    if (!(await categoryReferencesExist(category, categoryIds))) {
      removeUploadedFile(req);
      return res.status(400).json({ success: false, message: "Invalid category reference" });
    }

    if (brandId) {
      const brandExists = await Brand.exists({ _id: brandId });
      if (!brandExists) {
        removeUploadedFile(req);
        return res.status(400).json({ success: false, message: "Invalid brandId" });
      }
    }

    const finalSlug = slug
      ? slug
      : await ensureUniqueSlug(Products, name, { fallback: "product" });

    if (slug) {
      const slugExists = await Products.findOne({ slug: finalSlug });
      if (slugExists) {
        removeUploadedFile(req);
        return res.status(409).json({ success: false, message: "Product slug already exists" });
      }
    }

    const image = await resolveImage(req.file);

    const normalizedHighlights = Array.isArray(highlights)
      ? highlights.map((item) => String(item).trim()).filter(Boolean).slice(0, 20)
      : typeof highlights === "string"
        ? (() => {
            try {
              const parsed = JSON.parse(highlights);
              return Array.isArray(parsed) ? parsed.map((item) => String(item).trim()).filter(Boolean).slice(0, 20) : [];
            } catch {
              return [];
            }
          })()
        : [];

    const product = await Products.create({
      name,
      canonicalName: canonicalName || name,
      description,
      shortDescription: shortDescription || description,
      longDescription: longDescription || description,
      highlights: normalizedHighlights,
      slug: finalSlug,
      status: status || "active",
      publicationState: publicationState || "published",
      price,
      category,
      categoryIds: [...new Set([category, ...(Array.isArray(categoryIds) ? categoryIds : [])]
        .filter(Boolean)
        .map(String))],
      brandId: brandId || null,
      stock,
      image,
      primaryImageId: req.body.primaryImageId || null,
    });

    await product.populate("category", "name description");
    await invalidateCacheByPattern(`${PRODUCTS_CACHE_PREFIX}*`);

    res.status(201).json({ success: true, product });
  } catch (err) {
    removeUploadedFile(req);
    if (err && err.code === 11000) {
      return res.status(409).json({ success: false, message: "Product slug already exists" });
    }
    res.status(500).json({ success: false, message: "Server error", error: controllerError(err, req) });
  }
};

const updateProduct = async (req, res) => {
  let oldImagePath;
  try {
    const { name, description, price, category, stock, slug, canonicalName, status, publicationState, shortDescription, longDescription, highlights, brandId, categoryIds, primaryImageId } = req.body;
    const updateData = {
      name,
      description,
      price,
      category,
      stock,
      slug,
      canonicalName,
      status,
      publicationState,
      shortDescription,
      longDescription,
      highlights,
      brandId,
      categoryIds,
      primaryImageId,
    };

    if ((category !== undefined || categoryIds !== undefined)
      && !(await categoryReferencesExist(category, categoryIds === undefined ? [] : categoryIds))) {
      removeUploadedFile(req);
      return res.status(400).json({ success: false, message: "Invalid category reference" });
    }

    if (category !== undefined || categoryIds !== undefined) {
      const currentProduct = await Products.findById(req.params.id).select("category categoryIds").lean();
      const previousPrimaryCategory = currentProduct?.category;
      const primaryCategory = category ?? previousPrimaryCategory;
      const additionalCategoryIds = Array.isArray(categoryIds)
        ? categoryIds
        : (currentProduct?.categoryIds || [])
            .filter((id) => String(id) !== String(previousPrimaryCategory));
      updateData.categoryIds = [...new Set([primaryCategory, ...additionalCategoryIds]
        .filter(Boolean)
        .map(String))];
    }

    if (brandId !== undefined && brandId !== null) {
      const brandExists = await Brand.exists({ _id: brandId });
      if (!brandExists) {
        removeUploadedFile(req);
        return res.status(400).json({ success: false, message: "Invalid brandId" });
      }
    }

    if (slug && slug !== undefined) {
      const existingSlug = await Products.findOne({ slug, _id: { $ne: req.params.id } });
      if (existingSlug) {
        removeUploadedFile(req);
        return res.status(409).json({ success: false, message: "Product slug already exists" });
      }
      updateData.slug = slug;
    }

    if (highlights !== undefined) {
      const parsedHighlights = Array.isArray(highlights)
        ? highlights.map((item) => String(item).trim()).filter(Boolean).slice(0, 20)
        : typeof highlights === "string"
          ? (() => {
              try {
                const value = JSON.parse(highlights);
                return Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean).slice(0, 20) : [];
              } catch {
                return [];
              }
            })()
          : [];
      updateData.highlights = parsedHighlights;
    }

    if (name && !slug && !req.body.slug) {
      updateData.canonicalName = canonicalName || name;
    }

    Object.keys(updateData).forEach((k) => updateData[k] === undefined && delete updateData[k]);

    if (req.file) {
      const oldProduct = await Products.findById(req.params.id).select("image").lean();
      if (oldProduct?.image && oldProduct.image.startsWith("/uploadimage/")) {
        oldImagePath = `.${oldProduct.image}`;
      }
      updateData.image = await resolveImage(req.file);
    }

    const product = await Products.findByIdAndUpdate(req.params.id, updateData, { new: true })
      .populate("category", "name description");

    if (!product) {
      removeUploadedFile(req);
      return res.status(404).json({ message: "Product not found" });
    }

    if (oldImagePath && fs.existsSync(oldImagePath)) fs.unlink(oldImagePath, () => {});

    await invalidateCacheByPattern(`${PRODUCTS_CACHE_PREFIX}*`);
    res.status(200).json({ success: true, product });
  } catch (err) {
    removeUploadedFile(req);
    if (err && err.code === 11000) {
      return res.status(409).json({ success: false, message: "Product slug already exists" });
    }
    res.status(500).json({ success: false, message: "Server error", error: controllerError(err, req) });
  }
};

const deleteProduct = async (req, res) => {
  try {
    const product = await Products.findByIdAndUpdate(
      req.params.id,
      { status: "archived", publicationState: "hidden" },
      { new: true }
    );
    if (!product) return res.status(404).json({ message: "Product not found" });

    await invalidateCacheByPattern(`${PRODUCTS_CACHE_PREFIX}*`);
    res.status(200).json({ success: true, message: "Product archived", product });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error", error: controllerError(err, req) });
  }
};

module.exports = { getProducts, getProductById, createProduct, updateProduct, deleteProduct };
