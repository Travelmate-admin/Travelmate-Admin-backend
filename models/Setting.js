// models/Setting.js
// Shared pricing document (key: "pricing"), same collection the customer app
// reads. The admin panel edits it here; the customer app picks it up at runtime.

const mongoose = require("mongoose");

const settingSchema = new mongoose.Schema(
  {
    key: { type: String, unique: true, default: "pricing" },
    plans: {
      daily:   { price: { type: Number, default: 30 },   durationDays: { type: Number, default: 1 } },
      monthly: { price: { type: Number, default: 650 },  durationDays: { type: Number, default: 30 } },
      yearly:  { price: { type: Number, default: 1200 }, durationDays: { type: Number, default: 365 } },
    },
    findRide: {
      unlockFee:     { type: Number, default: 49 },
      processingFee: { type: Number, default: 1 },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Setting", settingSchema);
