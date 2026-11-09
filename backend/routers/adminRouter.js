const express = require("express");
const router = express.Router();
const { protect, restrictTo } = require("../middlewares/authMiddleware");
const adminController = require("../controllers/adminController");
const pricingController = require("../controllers/pricingController");
const validateRequest = require("../middlewares/validateRequest");
const validateObjectIdParam = require("../middlewares/validateObjectIdParam");
const {
  createPriceBookSchema,
  updatePriceBookSchema,
  createPriceDefinitionSchema,
  updatePriceDefinitionSchema,
} = require("../controllers/validation/pricingValidation");

router.use(protect, restrictTo("admin"));
router.get("/summary", adminController.getDashboardSummary);
router.get("/analytics", adminController.getAnalytics);

router.get("/pricing/price-books", pricingController.listPriceBooks);
router.post("/pricing/price-books", validateRequest(createPriceBookSchema), pricingController.createPriceBook);
router.patch("/pricing/price-books/:id", validateObjectIdParam("id"), validateRequest(updatePriceBookSchema), pricingController.updatePriceBook);
router.get("/pricing/price-definitions", pricingController.listPriceDefinitions);
router.post("/pricing/price-definitions", validateRequest(createPriceDefinitionSchema), pricingController.createPriceDefinition);
router.patch("/pricing/price-definitions/:id", validateObjectIdParam("id"), validateRequest(updatePriceDefinitionSchema), pricingController.updatePriceDefinition);
router.post("/pricing/price-definitions/:id/deactivate", validateObjectIdParam("id"), pricingController.deactivatePriceDefinition);

module.exports = router;
