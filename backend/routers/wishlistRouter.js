const express = require("express");
const router = express.Router();
const { protect } = require("../middlewares/authMiddleware");
const validateRequest = require("../middlewares/validateRequest");
const wishlistController = require("../controllers/wishlistController");
const { addWishlistItemSchema } = require("../controllers/validation/wishlistValidation");

router.use(protect);
router.get("/", wishlistController.getWishlist);
router.post("/", validateRequest(addWishlistItemSchema), wishlistController.addWishlistItem);
router.delete("/:productId", wishlistController.removeWishlistItem);

module.exports = router;
