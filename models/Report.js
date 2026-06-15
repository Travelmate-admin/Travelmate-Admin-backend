// models/Report.js - "reports" collection. A user reporting another user.
//
// NOTE: This schema is shared with the main TravelMate server
// (travelmatefinal/server/models/Report.js) - both map to the SAME
// "reports" collection in the Tesco database. Keep the two in sync.
//
// `description` is the canonical body text. `details` is a legacy mirror
// written by older TravelMate client builds; the admin route falls back
// to it when `description` is empty.
const mongoose = require("mongoose");

const reportSchema = new mongoose.Schema(
  {
    reporterPhone: { type: String, required: true, trim: true, index: true },
    reporterName:  { type: String, default: "", trim: true },
    reportedPhone: { type: String, required: true, trim: true, index: true },
    reportedName:  { type: String, default: "", trim: true },
    rideId:        { type: mongoose.Schema.Types.ObjectId, ref: "Ride", default: null },
    reason:        { type: String, required: true, trim: true },
    description:   { type: String, default: "", maxlength: 1000 },
    details:       { type: String, default: "", maxlength: 1000 },
    status:        { type: String, enum: ["pending", "reviewing", "resolved", "actioned", "dismissed"], default: "pending", index: true },
    adminNote:     { type: String, default: "" },
    reviewedAt:    { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Report", reportSchema);
