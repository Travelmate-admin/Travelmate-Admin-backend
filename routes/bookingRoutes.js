// routes/bookingRoutes.js — records ride bookings (who booked / who rode).
// The main TravelMate app can POST here. Mounted at /api/bookings.

const express = require("express");
const router = express.Router();
const Booking = require("../models/Booking");
const Ride = require("../models/Ride");
const User = require("../models/User");

const phoneVariants = (raw) => {
  const s = String(raw || "").trim();
  const last10 = s.replace(/\D/g, "").slice(-10);
  const list = s ? [s] : [];
  if (last10.length === 10) list.push("+91" + last10, "91" + last10, last10);
  return [...new Set(list)];
};
const findUserByPhone = async (phone) => {
  for (const p of phoneVariants(phone)) {
    const u = await User.findOne({ phone: p });
    if (u) return u;
  }
  return null;
};

router.post("/", async (req, res) => {
  try {
    const { rideId, riderPhone, status } = req.body || {};
    if (!rideId || !riderPhone) return res.status(400).json({ success: false, message: "rideId and riderPhone are required" });
    const ride = await Ride.findById(rideId);
    if (!ride) return res.status(404).json({ success: false, message: "Ride not found" });
    const [rider, poster] = await Promise.all([findUserByPhone(riderPhone), findUserByPhone(ride.userPhone)]);
    let booking = await Booking.findOne({ rideId, riderPhone });
    if (booking) {
      if (status && booking.status !== status) { booking.status = status; await booking.save(); }
      return res.json({ success: true, message: "Booking updated", data: booking });
    }
    booking = await Booking.create({
      rideId, from: ride.from, to: ride.to, date: ride.date, time: ride.time,
      posterPhone: ride.userPhone || "", posterName: poster?.fullName || "",
      riderPhone, riderName: rider?.fullName || "", status: status || "booked",
    });
    res.status(201).json({ success: true, message: "Booking recorded", data: booking });
  } catch (err) {
    console.error("create booking error:", err);
    res.status(500).json({ success: false, message: "Failed to record booking" });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    const { status } = req.body || {};
    if (!["booked", "completed", "cancelled"].includes(status)) return res.status(400).json({ success: false, message: "Invalid status" });
    const booking = await Booking.findByIdAndUpdate(req.params.id, { $set: { status } }, { new: true });
    if (!booking) return res.status(404).json({ success: false, message: "Booking not found" });
    res.json({ success: true, message: "Booking updated", data: booking });
  } catch {
    res.status(500).json({ success: false, message: "Failed to update booking" });
  }
});

module.exports = router;
