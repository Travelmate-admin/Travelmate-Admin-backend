// models/User.js — maps to the SAME "users" collection as the main app.
const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    phone:      { type: String, required: true, unique: true },
    isVerified: { type: Boolean, default: false },
    fullName:   { type: String, trim: true },
    email:      { type: String, trim: true, lowercase: true },
    dob:        { type: Date },
    city:       { type: String, trim: true },
    about:      { type: String, maxlength: 300 },
    gender:     { type: String, enum: ["Male", "Female", ""], default: "" },
    photo:      { type: String },

    // Admin moderation
    isBlocked:   { type: Boolean, default: false },
    blockReason: { type: String, default: "" },
    blockedAt:   { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
