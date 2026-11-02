// models/BusRoute.js (admin backend)
// Same schema + collection ("busroutes") as the main app's server/models/BusRoute.js.
// Admin creates/edits/deletes; the customer app reads.

const mongoose = require("mongoose");

const stopSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    lat: { type: Number, default: null },
    lon: { type: Number, default: null },
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
