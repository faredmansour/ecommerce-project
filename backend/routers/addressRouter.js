const express = require("express");
const router = express.Router();
const { protect } = require("../middlewares/authMiddleware");
const validateRequest = require("../middlewares/validateRequest");
const validateObjectIdParam = require("../middlewares/validateObjectIdParam");
const addressController = require("../controllers/addressController");
const { createAddressSchema, updateAddressSchema } = require("../controllers/validation/addressValidation");

router.use(protect);
router.get("/", addressController.getAddresses);
router.post("/", validateRequest(createAddressSchema), addressController.createAddress);
router.put("/:id", validateObjectIdParam(), validateRequest(updateAddressSchema), addressController.updateAddress);
router.delete("/:id", validateObjectIdParam(), addressController.deleteAddress);

module.exports = router;
