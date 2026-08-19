// models/RideRequest.js — mirror of the customer app's RideRequest so the
// admin panel can count/list the NEW booking flow (request → confirm → pay).
// Only the fields the admin needs are declared; strict:false keeps any extra
// fields the app writes.
const mongoose = require("mongoose");

const rideRequestSchema = new mongoose.Schema(
  {
    rideId:      { type: mongoose.Schema.Types.ObjectId, ref: "Ride", index: true },
    posterPhone: { type: String, default: "", trim: true },
    riderPhone:  { type: String, default: "", trim: true },
    riderName:   { type: String, default: "" },
    status:      { type: String, default: "pending", index: true }, // pending|accepted|rejected|cancelled|expired
    paymentStatus: { type: String, default: "none" },               // none|pending|paid|failed
    amountPaid:  { type: Number, default: 0 },
    paidAt:      { type: Date, default: null },
  },
  { timestamps: true, strict: false }
);

module.exports = mongoose.model("RideRequest", rideRequestSchema);
