const express = require("express");
const router = express.Router();
const { protect } = require("../middlewares/authMiddleware");
const cartController = require("../controllers/cartController");

router.use(protect);
router.get("/", cartController.getCart);
router.post("/", cartController.addToCart);
router.patch("/:id", cartController.updateCartItem);
router.delete("/:id", cartController.removeCartItem);

module.exports = router;
