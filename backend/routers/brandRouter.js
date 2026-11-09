const express = require("express");
const router = express.Router();
const brandController = require("../controllers/brandController");
const { protect, restrictTo } = require("../middlewares/authMiddleware");
const validateRequest = require("../middlewares/validateRequest");
const validateObjectIdParam = require("../middlewares/validateObjectIdParam");
const { createBrandSchema, updateBrandSchema } = require("../controllers/validation/brandValidation");

router.get("/", brandController.getBrands);
router.get("/:id", validateObjectIdParam(), brandController.getBrandById);
router.post("/", protect, restrictTo("admin"), validateRequest(createBrandSchema), brandController.createBrand);
router.put("/:id", protect, restrictTo("admin"), validateObjectIdParam(), validateRequest(updateBrandSchema), brandController.updateBrand);
router.delete("/:id", protect, restrictTo("admin"), validateObjectIdParam(), brandController.deleteBrand);

module.exports = router;
