const mongoose = require("mongoose");

const slugify = (value) => {
  if (value === null || value === undefined) return "";
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return "";

  return normalized
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .join("-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
};

const ensureUniqueSlug = async (Model, sourceValue, { existingId = null, fallback = "item", fieldName = "slug" } = {}) => {
  const baseSlug = slugify(sourceValue) || fallback;
  let candidate = baseSlug;
  let counter = 1;

  while (true) {
    const filter = { [fieldName]: candidate };
    if (existingId) {
      filter._id = { $ne: new mongoose.Types.ObjectId(existingId) };
    }

    const existing = await Model.findOne(filter).lean();
    if (!existing) return candidate;
    counter += 1;
    candidate = `${baseSlug}-${counter}`;
  }
};

const validateParentCategory = async (CategoryModel, parentCategoryId, currentCategoryId = null) => {
  if (!parentCategoryId) return null;
  if (!mongoose.Types.ObjectId.isValid(parentCategoryId)) {
    throw new Error("Invalid parentCategoryId");
  }

  if (String(parentCategoryId) === String(currentCategoryId)) {
    throw new Error("Category cannot be its own parent");
  }

  const parent = await CategoryModel.findById(parentCategoryId);
  if (!parent) {
    throw new Error("Parent category not found");
  }

  let cursor = parent;
  const visited = new Set();
  while (cursor && cursor.parentCategoryId) {
    const key = String(cursor._id);
    if (visited.has(key)) break;
    visited.add(key);

    if (String(cursor.parentCategoryId) === String(currentCategoryId)) {
      throw new Error("Category cycle detected");
    }

    const next = await CategoryModel.findById(cursor.parentCategoryId).lean();
    if (!next) break;
    cursor = next;
  }

  return parent;
};

module.exports = {
  slugify,
  ensureUniqueSlug,
  validateParentCategory,
};
