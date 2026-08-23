const express = require("express");
const router = express.Router();
const { protect, restrictTo } = require("../middlewares/authMiddleware");
const adminController = require("../controllers/adminController");

router.use(protect, restrictTo("admin"));
router.get("/summary", adminController.getDashboardSummary);
router.get("/analytics", adminController.getAnalytics);

module.exports = router;
