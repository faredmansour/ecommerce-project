const express = require("express");
const router = express.Router();
const { protect, restrictTo } = require("../middlewares/authMiddleware");
const validateRequest = require("../middlewares/validateRequest");
const orderController = require("../controllers/orderController");
const { createOrderSchema, updateOrderStatusSchema } = require("../controllers/validation/orderValidation");

router.use(protect);
router.get("/", orderController.getOrders);
router.get("/:id", orderController.getOrderById);
router.post("/", validateRequest(createOrderSchema), orderController.createOrder);
router.patch(
  "/:id/status",
  restrictTo("admin"),
  validateRequest(updateOrderStatusSchema),
  orderController.updateOrderStatus
);

module.exports = router;
