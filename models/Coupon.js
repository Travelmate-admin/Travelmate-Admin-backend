// models/Coupon.js — maps to the SAME "coupons" collection as the main app.
const mongoose = require("mongoose");

const couponSchema = new mongoose.Schema(
  {
    code:        { type: String, required: true, unique: true, uppercase: true, trim: true },
    description: { type: String, default: "" },
    type:        { type: String, enum: ["flat", "percent"], required: true },
    value:       { type: Number, required: true },
    maxCashback: { type: Number, default: 0 },
    appliesTo:   [{ type: String, enum: ["daily", "monthly", "yearly"] }],
    expiresAt:   { type: Date, required: true, index: true },
    isActive:    { type: Boolean, default: true },
    usageLimit:  { type: Number, default: 0 },
    usedCount:   { type: Number, default: 0 },
    usedByPhones: [{ type: String }],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Coupon", couponSchema);
