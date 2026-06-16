const express = require("express");
const router = express.Router();
const { protect } = require("../middlewares/authMiddleware");
const validateRequest = require("../middlewares/validateRequest");
const cartController = require("../controllers/cartController");
const { addToCartSchema, updateCartItemSchema } = require("../controllers/validation/cartValidation");

router.use(protect);
router.get("/", cartController.getCart);
router.post("/", validateRequest(addToCartSchema), cartController.addToCart);
router.patch("/:id", validateRequest(updateCartItemSchema), cartController.updateCartItem);
router.delete("/:id", cartController.removeCartItem);

module.exports = router;
