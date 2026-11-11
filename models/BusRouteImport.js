// models/BusRouteImport.js (admin backend)
// Records each bulk Excel/CSV bus-route import so the admin can see import
// history (total / successful / failed). Standalone — does not touch the
// existing BusRoute collection or any current functionality.

const mongoose = require("mongoose");

const busRouteImportSchema = new mongoose.Schema(
  {
    fileName: { type: String, default: "", trim: true },
    mode: { type: String, enum: ["add", "update"], default: "add" },
    total: { type: Number, default: 0 },
    success: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    created: { type: Number, default: 0 },
    updated: { type: Number, default: 0 },
    skipped: { type: Number, default: 0 },
    // Short list of per-route errors for quick reference (not the full report).
    errors: {
      type: [
        new mongoose.Schema(
          { busNumber: { type: String, default: "" }, reason: { type: String, default: "" } },
          { _id: false }
        ),
      ],
      default: [],
    },
    by: { type: String, default: "" }, // admin identifier if available
  },
  { timestamps: true }
);

module.exports =
  mongoose.models.BusRouteImport || mongoose.model("BusRouteImport", busRouteImportSchema);
