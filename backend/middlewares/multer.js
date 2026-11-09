const multer = require("multer");
const path   = require("path");
const fs     = require("fs");
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");

const uploadDir = path.resolve(__dirname, "..", "uploadimage");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true, mode: 0o750 });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${crypto.randomBytes(24).toString("hex")}.upload`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Unsupported image type"), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 8, parts: 10 },
});

const uploadRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: "fail", message: "Upload limit reached. Try again later." },
});

const detectImageType = (buffer) => {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { mime: "image/png", extension: ".png" };
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mime: "image/jpeg", extension: ".jpg" };
  }
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    return { mime: "image/webp", extension: ".webp" };
  }
  return null;
};

const requireUploadedFile = (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: "No image uploaded" });
  }
  next();
};

const validateUploadedImage = async (req, res, next) => {
  if (!req.file) return next();

  try {
    const buffer = await fs.promises.readFile(req.file.path);
    const detectedType = detectImageType(buffer);
    const declaredMime = req.file.mimetype === "image/jpg" ? "image/jpeg" : req.file.mimetype;

    if (!detectedType || detectedType.mime !== declaredMime) {
      await fs.promises.unlink(req.file.path).catch(() => {});
      return res.status(400).json({ success: false, message: "Image content does not match a supported image type" });
    }

    const filename = `${crypto.randomBytes(24).toString("hex")}${detectedType.extension}`;
    const safePath = path.join(uploadDir, filename);
    await fs.promises.rename(req.file.path, safePath);
    req.file.filename = filename;
    req.file.path = safePath;
    req.file.destination = uploadDir;
    req.file.mimetype = detectedType.mime;
    next();
  } catch (error) {
    if (req.file?.path) await fs.promises.unlink(req.file.path).catch(() => {});
    next(error);
  }
};

const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ success: false, message: "Image size must be less than 5MB" });
    }
    return res.status(400).json({ success: false, message: "Upload rejected" });
  }
  if (err) {
    return res.status(400).json({ success: false, message: "Upload rejected" });
  }
  next();
};

module.exports = { upload, uploadRateLimit, requireUploadedFile, validateUploadedImage, handleMulterError };
