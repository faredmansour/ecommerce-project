const OBJECT_ID_PATTERN = /^[0-9a-fA-F]{24}$/;

const validateObjectIdParam = (parameter = "id") => (req, res, next) => {
  if (!OBJECT_ID_PATTERN.test(req.params[parameter] || "")) {
    return res.status(400).json({ status: "fail", message: `Invalid ${parameter}` });
  }
  next();
};

module.exports = validateObjectIdParam;