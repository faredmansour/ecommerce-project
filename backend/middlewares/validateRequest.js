const AppError = require("../utils/appError");
const fs = require("fs");

const validateRequest = (schema, property = "body") => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[property], {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      if (req.file?.path) fs.promises.unlink(req.file.path).catch(() => {});
      const details = error.details.map((detail) => detail.message);
      return next(new AppError(details.join(". "), 400));
    }

    req[property] = value;
    next();
  };
};

module.exports = validateRequest;
