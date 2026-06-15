// models/Ride.js — maps to the SAME "rides" collection as the main app.
const mongoose = require("mongoose");

const rideSchema = new mongoose.Schema(
  {
    from: { type: String, trim: true },
    to:   { type: String, trim: true },
    date: { type: String, trim: true },
    time: { type: String, trim: true },
    gender: { type: String },
    distance: { type: String, trim: true },
    duration: { type: String, trim: true },
    fromLat: { type: Number, default: null },
    fromLon: { type: Number, default: null },
    toLat:   { type: Number, default: null },
    toLon:   { type: Number, default: null },
    userPhone: { type: String, default: "", trim: true },
    vehicle:      { type: String, default: "Bike", trim: true },
    vehicleModel: { type: String, default: "", trim: true },
    vehicleColor: { type: String, default: "", trim: true },
    plateNumber:  { type: String, default: "", trim: true },
    seatsAvailable: { type: Number, default: 1, min: 0 },
    additionalInfo: { type: String, default: "", maxlength: 500 },
    viewCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Ride", rideSchema);
