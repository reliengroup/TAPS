const jwt = require("jsonwebtoken");
const User = require("../models/User");

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";
const isProd = process.env.NODE_ENV === "production";

// ---------- helpers ----------
function signToken(user) {
  return jwt.sign({ sub: String(user._id), role: user.role, name: user.name }, JWT_SECRET, {
    expiresIn: "7d",
  });
}

async function countActiveAdmins() {
  return User.countDocuments({ role: "Admin", isActive: true });
}

// GET /users  (Admins only)
async function getAllUsers(req, res, next) {
  try {
    const {
      role = "all", // "Admin" | "Manager" | "all"
      q, // search query (name/email)
      isActive, // "true" | "false"
      page = "1",
      limit = "50",
      sort = "name", // "name" | "email" | "role" | "createdAt"
      order = "asc", // "asc" | "desc"
    } = req.query;

    const filter = {};
    if (role && role !== "all") {
      const normalized = /^admin$/i.test(role)
        ? "Admin"
        : /^manager$/i.test(role)
          ? "Manager"
          : null;
      if (normalized) filter.role = normalized;
    }

    if (typeof isActive === "string") {
      if (["true", "1"].includes(isActive)) filter.isActive = true;
      if (["false", "0"].includes(isActive)) filter.isActive = false;
    }

    if (q) {
      const rgx = new RegExp(String(q), "i");
      filter.$or = [{ name: rgx }, { email: rgx }];
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
    const skip = (pageNum - 1) * limitNum;

    const sortDir = order === "desc" ? -1 : 1;
    const sortObj = { [String(sort)]: sortDir };

    const [users, total] = await Promise.all([
      User.find(filter)
        .select("-passwordHash -__v")
        .sort(sortObj)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      User.countDocuments(filter),
    ]);

    res.json({
      users,
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.max(1, Math.ceil(total / limitNum)),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /users/:id  (Admins only)
 * Allows updating Admins or Managers in one place.
 * Fields: name, email, password, isActive, role ("Admin" | "Manager")
 * Safeguards:
 *  - Cannot deactivate or demote the last active Admin
 */
async function updateUser(req, res, next) {
  try {
    const { id } = req.params;
    const { name, email, password, isActive, role } = req.body;

    const target = await User.findById(id);
    if (!target) return res.status(404).json({ message: "User not found" });

    const update = {};
    if (name !== undefined) update.name = name;
    if (email !== undefined) update.email = email;
    if (typeof isActive === "boolean") update.isActive = isActive;

    // normalize role if provided
    let nextRole = target.role;
    if (role !== undefined) {
      if (!["Admin", "Manager"].includes(role)) {
        return res.status(400).json({ message: "Invalid role" });
      }
      update.role = role;
      nextRole = role;
    }

    // password change
    if (password) {
      update.passwordHash = await User.hashPassword(password);
    }

    // --- Safeguard: last active admin cannot be deactivated or demoted ---
    const demotingAdmin = target.role === "Admin" && nextRole !== "Admin";
    const deactivatingAdmin =
      target.role === "Admin" &&
      typeof isActive === "boolean" &&
      isActive === false &&
      target.isActive === true;

    if (demotingAdmin || deactivatingAdmin) {
      const active = await countActiveAdmins();
      if (active <= 1) {
        return res
          .status(409)
          .json({
            message: "Cannot modify the last active admin (demote/deactivate)",
          });
      }
    }

    const updated = await User.findByIdAndUpdate(id, update, {
      new: true,
      runValidators: true,
    }).select("-passwordHash -__v");

    return res.json(updated);
  } catch (e) {
    if (e.code === 11000)
      return res.status(409).json({ message: "Email already exists" });
    if (e.name === "CastError")
      return res.status(400).json({ message: "Invalid user id" });
    next(e);
  }
}

/**
 * DELETE /users/:id (Admins only)
 * Safeguards:
 *  - Admins cannot delete themselves
 *  - Cannot delete the last active Admin
 */
async function deleteUser(req, res, next) {
  try {
    const { id } = req.params;

    // prevent self-delete
    if (String(req.user?._id) === String(id)) {
      return res
        .status(409)
        .json({ message: "Admins cannot delete themselves" });
    }

    const target = await User.findById(id);
    if (!target) return res.status(404).json({ message: "User not found" });

    if (target.role === "Admin" && target.isActive) {
      const active = await countActiveAdmins();
      if (active <= 1) {
        return res
          .status(409)
          .json({ message: "Cannot delete the last active admin" });
      }
    }

    await User.deleteOne({ _id: id });
    return res.json({ message: "User deleted", id });
  } catch (e) {
    if (e.name === "CastError")
      return res.status(400).json({ message: "Invalid user id" });
    next(e);
  }
}

// ---------- Admin creation (secret OR existing admin) ----------
async function createAdmin(req, res, next) {
  try {
    const { name, email, password, secret } = req.body;

    const hasValidSecret =
      secret &&
      process.env.ADMIN_CREATION_SECRET &&
      secret === process.env.ADMIN_CREATION_SECRET;
    const isRequesterAdmin = req.user?.role === "Admin";

    if (!hasValidSecret && !isRequesterAdmin) {
      return res.status(401).json({ message: "Unauthorized to create admin" });
    }

    const passwordHash = await User.hashPassword(password);
    const createdBy = isRequesterAdmin ? req.user._id : undefined;

    const user = await User.create({
      name,
      email,
      passwordHash,
      role: "Admin",
      createdBy,
      isActive: true,
    });

    return res.status(201).json(user);
  } catch (e) {
    if (e.code === 11000)
      return res.status(409).json({ message: "Email already exists" });
    next(e);
  }
}

// ---------- Manager create/update/delete ----------
async function createManager(req, res, next) {
  try {
    const { name, email, password } = req.body;
    const createdBy = req.user?._id;
    const user = await User.createManager({ name, email, password, createdBy });
    return res.status(201).json(user);
  } catch (e) {
    if (e.code === 11000)
      return res.status(409).json({ message: "Email already exists" });
    next(e);
  }
}

// ---------- Manager Auth ----------
async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({
      email: email?.toLowerCase(),
      role: { $in: ["Admin", "Manager"] },
      isActive: true,
    });

    if (!user) return res.status(401).json({ message: "Invalid credentials" });

    const ok = await user.comparePassword(password || "");
    if (!ok) return res.status(401).json({ message: "Invalid credentials" });

    const token = signToken(user);

    res.cookie("auth_token", token, {
      httpOnly: true,
      sameSite: isProd ? "none" :"lax",
      secure: isProd,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    // Optional: lastLoginAt
    user.lastLoginAt = new Date();
    await user.save({ validateBeforeSave: false });

    return res.json({ message: "Logged in", user: user.toJSON() });
  } catch (e) {
    next(e);
  }
}

// ✅ Logout for BOTH Admin & Manager
async function logout(_req, res) {
  res.clearCookie("auth_token", {
    httpOnly: true,
    sameSite: isProd ? "none" : "lax",
    secure: isProd,
  });
  return res.json({ message: "Logged out" });
}

module.exports = {
  getAllUsers,
  updateUser,
  deleteUser,
  // Admin
  createAdmin,
  // Manager
  createManager,
  // Auth
  login,
  logout,
};
