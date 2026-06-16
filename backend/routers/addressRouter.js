const express = require("express");
const router = express.Router();
const { protect } = require("../middlewares/authMiddleware");
const addressController = require("../controllers/addressController");

router.use(protect);
router.get("/", addressController.getAddresses);
router.post("/", addressController.createAddress);
router.put("/:id", addressController.updateAddress);
router.delete("/:id", addressController.deleteAddress);

module.exports = router;
