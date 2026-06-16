const express = require("express");
const router = express.Router();
const { protect } = require("../middlewares/authMiddleware");
const wishlistController = require("../controllers/wishlistController");

router.use(protect);
router.get("/", wishlistController.getWishlist);
router.post("/", wishlistController.addWishlistItem);
router.delete("/:productId", wishlistController.removeWishlistItem);

module.exports = router;
