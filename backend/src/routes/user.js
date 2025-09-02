const router = require("express").Router();
const {
  createAdmin,
  createManager,
  login,
  logout,
  getAllUsers,
  updateUser,
  deleteUser,
} = require("../controllers/user");
const { requireAdmin, requireAuth, requireAuthOptional } = require("../middlewares/auth");

router.get("/", requireAdmin, getAllUsers);

// Combine into two generic endpoints (Admins only)
router.put("/:id", requireAdmin, updateUser);
router.delete("/:id", requireAdmin, deleteUser);

// Admin creation: by secret OR by authenticated Admin (optional auth to support both)
router.post("/admin", requireAuthOptional, createAdmin);

// Manager auth
router.post("/login", login);
router.post("/logout", logout);

// Manager management (Admins only)
router.post("/managers", requireAdmin, createManager);

// Session restore
router.get("/me", requireAuth, async (req, res) => {
  const User = require("../models/User");
  const me = await User.findById(req.user._id).lean();
  if (!me) return res.status(401).json({ message: "Unauthorized" });
  res.json({ user: me });
});

module.exports = router;

