function isPreviewMode() {
  return process.env.PREVIEW_MODE === "true";
}

function blockInPreview(feature) {
  return (req, res, next) => {
    if (!isPreviewMode()) return next();
    return res.status(503).json({
      status: "fail",
      code: "PREVIEW_FEATURE_DISABLED",
      message: `${feature} is unavailable in Preview.`,
    });
  };
}

function blockMutationsInPreview(feature) {
  const mutationMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
  return (req, res, next) => {
    if (!isPreviewMode() || !mutationMethods.has(req.method)) return next();
    return res.status(503).json({
      status: "fail",
      code: "PREVIEW_FEATURE_DISABLED",
      message: `${feature} is unavailable in Preview.`,
    });
  };
}

module.exports = { isPreviewMode, blockInPreview, blockMutationsInPreview };
