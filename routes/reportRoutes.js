// routes/reportRoutes.js — public endpoint for a user to report another user.
// The main TravelMate app can POST here to file a report. Mounted at /api/reports.

const express = require("express");
const router = express.Router();
const Report = require("../models/Report");
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
    const { reporterPhone, reportedPhone, reason, description, rideId } = req.body || {};
    if (!reporterPhone || !reportedPhone || !reason)
      return res.status(400).json({ success: false, message: "reporterPhone, reportedPhone and reason are required" });
    const [reporter, reported] = await Promise.all([findUserByPhone(reporterPhone), findUserByPhone(reportedPhone)]);
    const report = await Report.create({
      reporterPhone, reporterName: reporter?.fullName || "",
      reportedPhone, reportedName: reported?.fullName || "",
      rideId: rideId || null, reason, description: description || "", status: "pending",
    });
    res.status(201).json({ success: true, message: "Report submitted", data: report });
  } catch (err) {
    console.error("create report error:", err);
    res.status(500).json({ success: false, message: "Failed to submit report" });
  }
});

module.exports = router;
