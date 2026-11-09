const Categories = require("../models/categoryModel.js");
const controllerError = require("../utils/controllerError");
const { ensureUniqueSlug, validateParentCategory } = require("../utils/catalogFoundation");

const getCategories = async (req, res) => {
  try {
    const allcategories = await Categories.find({}).sort({ displayOrder: 1, createdAt: -1 });
    res.status(200).json(allcategories);
  } catch (err) {
    res.status(500).json({ message: "Server error", error: controllerError(err, req) });
  }
};

const getCategoryById = async (req, res) => {
  try {
    const category = await Categories.findById(req.params.id);
    if (!category) return res.status(404).json({ message: "Category not found" });
    res.status(200).json(category);
  } catch (err) {
    res.status(500).json({ message: "Server error", error: controllerError(err, req) });
  }
};

const createCategory = async (req, res) => {
  try {
    const { name, description, parentCategoryId, status, displayOrder, imageId } = req.body;

    if (parentCategoryId) {
      await validateParentCategory(Categories, parentCategoryId);
    }

    const slug = req.body.slug || (await ensureUniqueSlug(Categories, name, { fallback: "category" }));
    const existingBySlug = await Categories.findOne({ slug });
    if (existingBySlug) {
      return res.status(409).json({ message: "Category slug already exists" });
    }

    const cat = await Categories.create({
      name,
      slug,
      description,
      parentCategoryId: parentCategoryId || null,
      status: status || "active",
      displayOrder: displayOrder ?? 0,
      imageId: imageId || null,
    });

    res.status(201).json(cat);
  } catch (err) {
    if (err && err.message === "Invalid parentCategoryId") {
      return res.status(400).json({ message: "Invalid parentCategoryId" });
    }
    if (err && err.message === "Parent category not found") {
      return res.status(400).json({ message: "Parent category not found" });
    }
    if (err && err.message === "Category cannot be its own parent") {
      return res.status(400).json({ message: "Category cannot be its own parent" });
    }
    if (err && err.message === "Category cycle detected") {
      return res.status(400).json({ message: "Category cycle detected" });
    }
    if (err && err.code === 11000) {
      return res.status(409).json({ message: "Category slug already exists" });
    }
    res.status(500).json({ message: "Server error", error: controllerError(err, req) });
  }
};

const updateCategory = async (req, res) => {
  try {
    const category = await Categories.findById(req.params.id);
    if (!category) return res.status(404).json({ message: "Category not found" });

    const updatePayload = { ...req.body };
    if (updatePayload.parentCategoryId !== undefined && updatePayload.parentCategoryId !== null) {
      await validateParentCategory(Categories, updatePayload.parentCategoryId, req.params.id);
    }

    if (updatePayload.slug) {
      const existingBySlug = await Categories.findOne({ slug: updatePayload.slug, _id: { $ne: req.params.id } });
      if (existingBySlug) {
        return res.status(409).json({ message: "Category slug already exists" });
      }
    }

    if (!updatePayload.slug && updatePayload.name) {
      updatePayload.slug = category.slug;
    }

    if (updatePayload.parentCategoryId === null) {
      updatePayload.parentCategoryId = null;
    }

    const updated = await Categories.findByIdAndUpdate(req.params.id, updatePayload, { new: true });
    res.status(200).json(updated);
  } catch (err) {
    if (err && err.message === "Invalid parentCategoryId") {
      return res.status(400).json({ message: "Invalid parentCategoryId" });
    }
    if (err && err.message === "Parent category not found") {
      return res.status(400).json({ message: "Parent category not found" });
    }
    if (err && err.message === "Category cannot be its own parent") {
      return res.status(400).json({ message: "Category cannot be its own parent" });
    }
    if (err && err.message === "Category cycle detected") {
      return res.status(400).json({ message: "Category cycle detected" });
    }
    if (err && err.code === 11000) {
      return res.status(409).json({ message: "Category slug already exists" });
    }
    res.status(500).json({ message: "Server error", error: controllerError(err, req) });
  }
};

const deleteCategory = async (req, res) => {
  try {
    const category = await Categories.findById(req.params.id);
    if (!category) return res.status(404).json({ message: "Category not found" });
    category.status = "archived";
    await category.save();
    res.status(200).json({ message: "Category archived", category });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: controllerError(err, req) });
  }
};

module.exports = {
  getCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
};