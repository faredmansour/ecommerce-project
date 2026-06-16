const express = require("express");
const router = express.Router();
const categoryController = require("../controllers/categoryController.js");
const { protect, restrictTo } = require("../middlewares/authMiddleware");

router.get("/", categoryController.getCategories);
router.get("/:id", categoryController.getCategoryById);
router.post("/", protect, restrictTo("admin"), categoryController.createCategory);
router.put("/:id", protect, restrictTo("admin"), categoryController.updateCategory);
router.delete("/:id", protect, restrictTo("admin"), categoryController.deleteCategory);

module.exports = router;