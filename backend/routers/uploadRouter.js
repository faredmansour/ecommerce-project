const express = require("express");
const router = express.Router();

const { upload } = require("../middlewares/multer");
const { uploadImageController } = require("../controllers/uploadController");

router.post("/upload", upload.single("image"), uploadImageController);

module.exports = router;