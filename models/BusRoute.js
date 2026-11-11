// models/BusRoute.js (admin backend)
// Same schema + collection ("busroutes") as the main app's server/models/BusRoute.js.
// Admin creates/edits/deletes; the customer app reads.

const mongoose = require("mongoose");

const stopSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    lat: { type: Number, default: null },
    lon: { type: Number, default: null },
    // Optional, populated by the Excel/CSV bulk import. Existing manual routes
    // simply leave these empty — fully backward compatible.
    order: { type: Number, default: null },
    arrivalTime: { type: String, default: "", trim: true },
    departureTime: { type: String, default: "", trim: true },
  },
  { _id: false }
);

const busRouteSchema = new mongoose.Schema(
  {
    busNumber: { type: String, required: true, trim: true },
    searchKey: { type: String, required: true, unique: true, index: true },
    operator: { type: String, default: "", trim: true },
    state: { type: String, default: "Tamil Nadu", trim: true },
    from: { type: String, required: true, trim: true },
    to:   { type: String, required: true, trim: true },
    fromLat: { type: Number, default: null },
    fromLon: { type: Number, default: null },
    toLat:   { type: Number, default: null },
    toLon:   { type: Number, default: null },
    stops: { type: [stopSchema], default: [] },
    notes:  { type: String, default: "", maxlength: 500 },
    active: { type: Boolean, default: true },
    // Optional metadata captured by the Excel/CSV bulk import. All optional so
    // existing manually-added routes and the current forms keep working as-is.
    busName: { type: String, default: "", trim: true },
    busType: { type: String, default: "", trim: true },
    distance: { type: String, default: "", trim: true },
    via: { type: [String], default: [] },
  },
  { timestamps: true }
);

busRouteSchema.pre("validate", function (next) {
  if (this.busNumber) {
    this.searchKey = String(this.busNumber).toUpperCase().replace(/[\s-]+/g, "");
  }
  next();
});

module.exports = mongoose.models.BusRoute || mongoose.model("BusRoute", busRouteSchema);
