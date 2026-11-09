const jwt = require("jsonwebtoken");
const User = require("../models/usermodel");

exports.protect = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ message: "Token not found" });
    }

    let decoded;
    try {
        const token = authHeader.split(" ")[1];
        decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
        return res.status(401).json({ message: "Invalid token" });
    }

    let user;
    try {
        user = await User.findById(decoded.id).select("role emailVerified authVersion +googleSub").lean();
    } catch (err) {
        return next(err);
    }
    if (!user) return res.status(401).json({ message: "Invalid token" });

    if ((decoded.sessionVersion || 0) !== (user.authVersion || 0)) {
        return res.status(401).json({ message: "Invalid token" });
    }

    if (user.role !== "admin" && user.emailVerified !== true && !user.googleSub) {
        return res.status(403).json({ code: "EMAIL_VERIFICATION_REQUIRED", message: "Verify your email before continuing." });
    }

    req.user = { ...decoded, role: user.role };
    return next();
};

// Role-based access control (RBAC)
exports.restrictTo = (...roles) => {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({ message: "Forbidden: Admins only" });
        }
        next();
    };
};
