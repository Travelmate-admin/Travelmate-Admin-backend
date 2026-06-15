// models/Subscription.js — maps to the SAME "subscriptions" collection as the main app.
// Source of truth for income/revenue (amountPaid).
const mongoose = require("mongoose");

const subscriptionSchema = new mongoose.Schema(
  {
    phone:    { type: String, required: true, index: true, trim: true },
    plan:     { type: String, enum: ["daily", "monthly", "yearly"], required: true },
    startDate:{ type: Date, default: Date.now },
    endDate:  { type: Date },
    status:   { type: String, enum: ["active", "expired", "cancelled"], default: "active" },
    razorpayOrderId:   { type: String },
    razorpayPaymentId: { type: String },
    razorpaySignature: { type: String },
    originalAmount: { type: Number },
    couponCode:     { type: String, default: "" },
    cashback:       { type: Number, default: 0 },
    amountPaid:     { type: Number },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Subscription", subscriptionSchema);
