const Brand = require("../models/brandModel");
const { ensureUniqueSlug } = require("../utils/catalogFoundation");
const controllerError = require("../utils/controllerError");

const getBrands = async (req, res) => {
  try {
    const brands = await Brand.find({}).sort({ createdAt: -1 });
    res.status(200).json(brands);
  } catch (err) {
    res.status(500).json({ message: "Server error", error: controllerError(err, req) });
  }
};

const getBrandById = async (req, res) => {
  try {
    const brand = await Brand.findById(req.params.id);
    if (!brand) return res.status(404).json({ message: "Brand not found" });
    res.status(200).json(brand);
  } catch (err) {
    res.status(500).json({ message: "Server error", error: controllerError(err, req) });
  }
};

const createBrand = async (req, res) => {
  try {
    const { name, description, logoId, status } = req.body;
    const slug = req.body.slug || (await ensureUniqueSlug(Brand, name, { fallback: "brand" }));

    const brand = await Brand.create({
      name,
      slug,
      description,
      logoId,
      status: status || "active",
    });

    res.status(201).json(brand);
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({ message: "Brand slug already exists" });
    }
    res.status(500).json({ message: "Server error", error: controllerError(err, req) });
  }
};

const updateBrand = async (req, res) => {
  try {
    const { slug, name, description, logoId, status } = req.body;
    const updateData = { name, description, logoId, status };

    if (slug) {
      const existingSlug = await Brand.findOne({ slug, _id: { $ne: req.params.id } });
      if (existingSlug) {
        return res.status(409).json({ message: "Brand slug already exists" });
      }
      updateData.slug = slug;
    }

    if (!updateData.name && !updateData.description && !updateData.logoId && !updateData.status && !updateData.slug) {
      return res.status(400).json({ message: "No valid update fields provided" });
    }

    const brand = await Brand.findByIdAndUpdate(req.params.id, updateData, { new: true });
    if (!brand) return res.status(404).json({ message: "Brand not found" });

    res.status(200).json(brand);
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({ message: "Brand slug already exists" });
    }
    res.status(500).json({ message: "Server error", error: controllerError(err, req) });
  }
};

const deleteBrand = async (req, res) => {
  try {
    const brand = await Brand.findByIdAndUpdate(req.params.id, { status: "archived" }, { new: true });
    if (!brand) return res.status(404).json({ message: "Brand not found" });
    res.status(200).json({ message: "Brand archived", brand });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: controllerError(err, req) });
  }
};

module.exports = { getBrands, getBrandById, createBrand, updateBrand, deleteBrand };
