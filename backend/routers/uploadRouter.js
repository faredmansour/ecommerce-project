const express = require("express");
const router = express.Router();

const { protect, restrictTo } = require("../middlewares/authMiddleware");
const { upload, uploadRateLimit, requireUploadedFile, validateUploadedImage, handleMulterError } = require("../middlewares/multer");
const { uploadImageController } = require("../controllers/uploadController");

router.post(
	"/upload",
	protect,
	restrictTo("admin"),
	uploadRateLimit,
	upload.single("image"),
	handleMulterError,
	requireUploadedFile,
	validateUploadedImage,
	uploadImageController
);

module.exports = router;