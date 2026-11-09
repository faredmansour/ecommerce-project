const controllerError = require("../utils/controllerError");

exports.uploadImageController = (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No image uploaded",
      });
    }

    res.status(200).json({
      success: true,
      message: "Image uploaded successfully",
      imageName: req.file.filename,
      imagePath: `/uploadimage/${req.file.filename}`,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: controllerError(error, req),
    });
  }
};