const express = require("express");
const router = express.Router();
const { protect, restrictTo } = require("../middlewares/authMiddleware");
const orderController = require("../controllers/orderController");

router.use(protect);
router.get("/", orderController.getOrders);
router.get("/:id", orderController.getOrderById);
router.post("/", orderController.createOrder);
router.patch("/:id/status", restrictTo("admin"), orderController.updateOrderStatus);

module.exports = router;
