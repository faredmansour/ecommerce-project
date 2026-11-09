const express = require("express");
const router = express.Router();
const pricingController = require("../controllers/pricingController");
const validateObjectIdParam = require("../middlewares/validateObjectIdParam");

router.get("/quotes/:sellableId", validateObjectIdParam("sellableId"), pricingController.resolveQuote);

module.exports = router;
