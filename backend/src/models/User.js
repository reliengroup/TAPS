
// models/User.js
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const ROLES = ["Admin", "Manager"];

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, "Invalid email"],
      index: true,
    },
    role: {
      type: String,
      enum: ROLES,
      default: "Manager",
      index: true,
    },
    // Store only the hash
    passwordHash: { type: String, required: true },

    // For managers created by an admin (optional)
    createdBy: { type: mongoose.Types.ObjectId, ref: "User" },

    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date },
  },
  { timestamps: true }
);

userSchema.set("autoIndex", true);

// Hide sensitive fields when sending JSON
userSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.passwordHash;
    delete ret.__v;
    return ret;
  },
});

// ----- Instance & Static helpers -----
userSchema.methods.comparePassword = function (plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

userSchema.statics.hashPassword = function (plain) {
  const rounds = Number(process.env.BCRYPT_ROUNDS || 10);
  return bcrypt.hash(plain, rounds);
};

/**
 * Create an Admin user, protected by a secret in env:
 *   ADMIN_CREATION_SECRET=someStrongSecret
 */
userSchema.statics.createAdmin = async function ({ name, email, password, secret }) {
  const expected = process.env.ADMIN_CREATION_SECRET;
  if (!expected || secret !== expected) {
    const err = new Error("Unauthorized to create admin");
    err.status = 401;
    throw err;
  }
  const passwordHash = await this.hashPassword(password);
  return this.create({ name, email, passwordHash, role: "Admin" });
};

/**
 * Create a Manager user (typically called from an Admin-only route).
 * Pass createdBy (admin's _id) if you want to track provenance.
 */
userSchema.statics.createManager = async function ({ name, email, password, createdBy }) {
  const passwordHash = await this.hashPassword(password);
  return this.create({ name, email, passwordHash, role: "Manager", createdBy });
};

module.exports = mongoose.model("User", userSchema);
