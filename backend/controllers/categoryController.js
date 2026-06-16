const Categories = require("../models/categoryModel.js");

/**
 * Get all categories.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const getCategories = async (req, res) => {
    try {
        const allcategories = await Categories.find({});
        res.status(200).json(allcategories);
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
};

/**
 * Get a single category by ID.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const getCategoryById = async (req, res) => {
    try {
        const category = await Categories.findById(req.params.id);
        if (!category) return res.status(404).json({ message: "Category not found" });
        res.status(200).json(category);
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
};

const createCategory = async (req, res) => {
    try {
        const cat = await Categories.create(req.body);
        res.status(201).json(cat);
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
};

const updateCategory = async (req, res) => {
    try {
        const category = await Categories.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!category) return res.status(404).json({ message: "Category not found" });
        res.status(200).json(category);
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
};

const deleteCategory = async (req, res) => {
    try {
        const category = await Categories.findByIdAndDelete(req.params.id);
        if (!category) return res.status(404).json({ message: "Category not found" });
        res.status(200).json({ message: "Category deleted" });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
};

module.exports = {
    getCategories,
    getCategoryById,
    createCategory,
    updateCategory,
    deleteCategory,
};