// middleware/auth.js
const jwt = require("jsonwebtoken");
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";

function extractToken(req) {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith("Bearer ")) return auth.slice(7).trim();

  // Fallback: parse from cookies without cookie-parser
  const cookie = req.headers.cookie;
  if (cookie) {
    const part = cookie
      .split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith("auth_token="));
    if (part) return decodeURIComponent(part.split("=")[1]);
  }
  return null;
}

function requireAuth(req, res, next) {
  try {
    const token = extractToken(req);
    if (!token) return res.status(401).json({ message: "Unauthorized" });
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = { _id: payload.sub, role: payload.role, name: payload.name };
    next();
  } catch {
    return res.status(401).json({ message: "Unauthorized" });
  }
}

function requireAuthOptional(req, _res, next) {
  try {
    const token = extractToken(req);
    if (token) {
      const payload = jwt.verify(token, JWT_SECRET);
      req.user = { _id: payload.sub, role: payload.role, name: payload.name };
    }
  } catch { }
  next();
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, (err) => {
    if (err) return next(err);
    if (req.user?.role !== "Admin") {
      return res.status(403).json({ message: "Admin privileges required" });
    }
    next();
  });
}

module.exports = { requireAuth, requireAdmin, requireAuthOptional };
