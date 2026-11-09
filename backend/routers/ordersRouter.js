const express = require("express");
const router = express.Router();
const { protect, restrictTo } = require("../middlewares/authMiddleware");
const validateRequest = require("../middlewares/validateRequest");
const validateObjectIdParam = require("../middlewares/validateObjectIdParam");
const orderController = require("../controllers/orderController");
const { createOrderSchema, updateOrderStatusSchema } = require("../controllers/validation/orderValidation");

router.use(protect);
router.get("/", orderController.getOrders);
router.get("/:id", validateObjectIdParam(), orderController.getOrderById);
router.post("/", validateRequest(createOrderSchema), orderController.createOrder);
router.patch(
  "/:id/status",
  restrictTo("admin"),
  validateObjectIdParam(),
  validateRequest(updateOrderStatusSchema),
  orderController.updateOrderStatus
);

module.exports = router;
