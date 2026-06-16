const express = require("express");
const router = express.Router();
const categoryController = require("../controllers/categoryController.js");
const { protect, restrictTo } = require("../middlewares/authMiddleware");
const validateRequest = require("../middlewares/validateRequest");
const { createCategorySchema, updateCategorySchema } = require("../controllers/validation/categoryValidation");

router.get("/", categoryController.getCategories);
router.get("/:id", categoryController.getCategoryById);
router.post("/", protect, restrictTo("admin"), validateRequest(createCategorySchema), categoryController.createCategory);
router.put("/:id", protect, restrictTo("admin"), validateRequest(updateCategorySchema), categoryController.updateCategory);
router.delete("/:id", protect, restrictTo("admin"), categoryController.deleteCategory);

module.exports = router;
