const express = require("express");
const router = express.Router();
const { protect } = require("../middlewares/authMiddleware");
const validateRequest = require("../middlewares/validateRequest");
const validateObjectIdParam = require("../middlewares/validateObjectIdParam");
const cartController = require("../controllers/cartController");
const { addToCartSchema, updateCartItemSchema } = require("../controllers/validation/cartValidation");

router.use(protect);
router.get("/", cartController.getCart);
router.post("/", validateRequest(addToCartSchema), cartController.addToCart);
router.patch("/:id", validateObjectIdParam(), validateRequest(updateCartItemSchema), cartController.updateCartItem);
router.delete("/:id", validateObjectIdParam(), cartController.removeCartItem);

module.exports = router;
