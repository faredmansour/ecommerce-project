const express = require("express");
const router = express.Router();
const productController = require("../controllers/productController.js");
const reviewController = require("../controllers/reviewController.js");
const { protect, restrictTo } = require("../middlewares/authMiddleware");
const { upload, handleMulterError } = require("../middlewares/multer");
const validateRequest = require("../middlewares/validateRequest");
const { createProductSchema, updateProductSchema } = require("../controllers/validation/productValidation");
const { submitReviewSchema } = require("../controllers/validation/reviewValidation");

/**
 * @route GET /api/products
 * @desc Get all products, optionally filter by category or search
 * @access Public
 */
router.get("/", productController.getProducts);

/**
 * @route GET /api/products/:id/reviews
 * @desc Get reviews for a product
 * @access Public
 */
router.get("/:id/reviews", reviewController.getReviewsForProduct);

/**
 * @route POST /api/products/:id/reviews
 * @desc Create a review for a product
 * @access User
 */
router.post("/:id/reviews", protect, validateRequest(submitReviewSchema), reviewController.submitReview);

/**
 * @route GET /api/products/:id
 * @desc Get a single product by ID
 * @access Public
 */
router.get("/:id", productController.getProductById);

/**
 * @route POST /api/products
 * @desc Create a new product with optional image upload
 * @access Admin
 */
router.post(
  "/",
  protect,
  restrictTo("admin"),
  upload.single("image"),
  handleMulterError,
  validateRequest(createProductSchema),
  productController.createProduct
);

/**
 * @route PUT /api/products/:id
 * @desc Update a product by ID
 * @access Admin
 */
router.put(
  "/:id",
  protect,
  restrictTo("admin"),
  upload.single("image"),
  handleMulterError,
  validateRequest(updateProductSchema),
  productController.updateProduct
);

/**
 * @route DELETE /api/products/:id
 * @desc Delete a product by ID
 * @access Admin
 */
router.delete("/:id", protect, restrictTo("admin"), productController.deleteProduct);

module.exports = router;
