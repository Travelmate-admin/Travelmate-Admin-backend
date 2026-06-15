// routes/adminRoutes.js — admin panel API (login, stats, income, coupons,
// rides/bookings, report moderation, user block). Mounted at /api/admin.

const express = require("express");
const jwt = require("jsonwebtoken");
const router = express.Router();

const User = require("../models/User");
const Ride = require("../models/Ride");
const Coupon = require("../models/Coupon");
const Report = require("../models/Report");
const Booking = require("../models/Booking");
const Subscription = require("../models/Subscription");

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "travelmate@admin";
const JWT_SECRET = process.env.JWT_SECRET || "travelmate_admin_secret_change_me";
const TOKEN_TTL = "12h";

// ---------- helpers ----------
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
  const last10 = String(phone || "").replace(/\D/g, "").slice(-10);
  if (last10.length === 10) return User.findOne({ phone: { $regex: last10 + "$" } });
  return null;
};

function requireAdmin(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ success: false, message: "Admin token required" });
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== "admin") return res.status(403).json({ success: false, message: "Not authorized" });
    req.admin = decoded;
    next();
  } catch {
    return res.status(401).json({ success: false, message: "Invalid or expired token" });
  }
}

// ---------- AUTH ----------
router.post("/login", (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ success: false, message: "Username and password required" });
  if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) return res.status(401).json({ success: false, message: "Invalid credentials" });
  const token = jwt.sign({ role: "admin", username }, JWT_SECRET, { expiresIn: TOKEN_TTL });
  res.json({ success: true, token, username });
});
router.get("/me", requireAdmin, (req, res) => res.json({ success: true, admin: { username: req.admin.username } }));

// ---------- DASHBOARD STATS ----------
router.get("/stats", requireAdmin, async (req, res) => {
  try {
    const todayStr = new Date().toISOString().slice(0, 10);
    const [totalUsers, blockedUsers, totalRides, upcomingRides, totalBookings, completedBookings, coupons, totalReports, pendingReports, subscriptions] = await Promise.all([
      User.countDocuments({}),
      User.countDocuments({ isBlocked: true }),
      Ride.countDocuments({}),
      Ride.countDocuments({ date: { $gte: todayStr } }),
      Booking.countDocuments({}),
      Booking.countDocuments({ status: "completed" }),
      Coupon.find({}),
      Report.countDocuments({}),
      Report.countDocuments({ status: "pending" }),
      Subscription.find({}),
    ]);

    const totalRedemptions = coupons.reduce((s, c) => s + (c.usedCount || 0), 0);
    const uniqueRedeemers = new Set();
    coupons.forEach((c) => (c.usedByPhones || []).forEach((p) => uniqueRedeemers.add(p)));
    const now = new Date();
    const activeCoupons = coupons.filter((c) => c.isActive && (!c.expiresAt || c.expiresAt > now)).length;

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const byPlan = { daily: 0, monthly: 0, yearly: 0 };
    let totalIncome = 0, totalCashback = 0, monthIncome = 0;
    subscriptions.forEach((s) => {
      const paid = s.amountPaid || 0;
      totalIncome += paid;
      totalCashback += s.cashback || 0;
      if (byPlan[s.plan] !== undefined) byPlan[s.plan] += paid;
      if (s.createdAt && new Date(s.createdAt) >= monthStart) monthIncome += paid;
    });

    res.json({
      success: true,
      data: {
        users: { total: totalUsers, blocked: blockedUsers },
        rides: { total: totalRides, upcoming: upcomingRides },
        bookings: { total: totalBookings, completed: completedBookings },
        coupons: { total: coupons.length, active: activeCoupons, redemptions: totalRedemptions, uniqueRedeemers: uniqueRedeemers.size },
        reports: { total: totalReports, pending: pendingReports },
        income: {
          total: totalIncome, thisMonth: monthIncome, payments: subscriptions.length,
          cashbackGiven: totalCashback, avgOrder: subscriptions.length ? Math.round(totalIncome / subscriptions.length) : 0, byPlan,
        },
      },
    });
  } catch (err) {
    console.error("admin/stats error:", err);
    res.status(500).json({ success: false, message: "Failed to load stats" });
  }
});

// ---------- INCOME ----------
router.get("/income", requireAdmin, async (req, res) => {
  try {
    const subs = await Subscription.find({}).sort({ createdAt: -1 });
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const byPlan = { daily: 0, monthly: 0, yearly: 0 };
    const countByPlan = { daily: 0, monthly: 0, yearly: 0 };
    let total = 0, thisMonth = 0, cashbackGiven = 0;
    subs.forEach((s) => {
      const paid = s.amountPaid || 0;
      total += paid; cashbackGiven += s.cashback || 0;
      if (byPlan[s.plan] !== undefined) { byPlan[s.plan] += paid; countByPlan[s.plan] += 1; }
      if (s.createdAt && new Date(s.createdAt) >= monthStart) thisMonth += paid;
    });
    const payments = subs.map((s) => ({
      _id: s._id, phone: s.phone, plan: s.plan,
      originalAmount: s.originalAmount || 0, cashback: s.cashback || 0, amountPaid: s.amountPaid || 0,
      couponCode: s.couponCode || "", status: s.status, paymentId: s.razorpayPaymentId || "", date: s.createdAt,
    }));
    res.json({
      success: true,
      data: {
        summary: { total, thisMonth, cashbackGiven, payments: subs.length, avgOrder: subs.length ? Math.round(total / subs.length) : 0, byPlan, countByPlan },
        payments,
      },
    });
  } catch (err) {
    console.error("admin/income error:", err);
    res.status(500).json({ success: false, message: "Failed to load income" });
  }
});

// ---------- COUPONS ----------
router.get("/coupons", requireAdmin, async (req, res) => {
  try {
    const coupons = await Coupon.find({}).sort({ createdAt: -1 });
    const now = new Date();
    const data = coupons.map((c) => ({
      _id: c._id, code: c.code, description: c.description, type: c.type, value: c.value, maxCashback: c.maxCashback,
      appliesTo: c.appliesTo || [], expiresAt: c.expiresAt, isActive: c.isActive,
      expired: c.expiresAt && c.expiresAt < now, usageLimit: c.usageLimit,
      usedCount: c.usedCount || 0, uniquePeople: new Set(c.usedByPhones || []).size,
      usedByPhones: c.usedByPhones || [], createdAt: c.createdAt,
    }));
    res.json({ success: true, count: data.length, data });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to load coupons" });
  }
});

router.post("/coupons", requireAdmin, async (req, res) => {
  try {
    const { code, description, type, value, maxCashback, appliesTo, expiresAt, usageLimit, isActive } = req.body || {};
    if (!code || !type || value === undefined || value === null) return res.status(400).json({ success: false, message: "code, type and value are required" });
    if (!["flat", "percent"].includes(type)) return res.status(400).json({ success: false, message: "type must be 'flat' or 'percent'" });
    if (!expiresAt) return res.status(400).json({ success: false, message: "expiresAt is required" });
    const exists = await Coupon.findOne({ code: String(code).toUpperCase().trim() });
    if (exists) return res.status(409).json({ success: false, message: "A coupon with this code already exists" });
    const coupon = await Coupon.create({
      code: String(code).toUpperCase().trim(), description: description || "", type, value: Number(value),
      maxCashback: Number(maxCashback) || 0, appliesTo: Array.isArray(appliesTo) ? appliesTo : [],
      expiresAt: new Date(expiresAt), usageLimit: Number(usageLimit) || 0,
      isActive: isActive === undefined ? true : !!isActive, usedCount: 0, usedByPhones: [],
    });
    res.status(201).json({ success: true, message: "Coupon created", data: coupon });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || "Failed to create coupon" });
  }
});

router.patch("/coupons/:id", requireAdmin, async (req, res) => {
  try {
    const allowed = ["description", "value", "maxCashback", "expiresAt", "usageLimit", "isActive", "appliesTo"];
    const update = {};
    allowed.forEach((k) => { if (req.body[k] !== undefined) update[k] = req.body[k]; });
    const coupon = await Coupon.findByIdAndUpdate(req.params.id, { $set: update }, { new: true });
    if (!coupon) return res.status(404).json({ success: false, message: "Coupon not found" });
    res.json({ success: true, message: "Coupon updated", data: coupon });
  } catch {
    res.status(500).json({ success: false, message: "Failed to update coupon" });
  }
});

router.delete("/coupons/:id", requireAdmin, async (req, res) => {
  try {
    const coupon = await Coupon.findByIdAndDelete(req.params.id);
    if (!coupon) return res.status(404).json({ success: false, message: "Coupon not found" });
    res.json({ success: true, message: "Coupon deleted", data: { _id: coupon._id } });
  } catch {
    res.status(500).json({ success: false, message: "Failed to delete coupon" });
  }
});

// ---------- RIDES / BOOKINGS ----------
router.get("/rides", requireAdmin, async (req, res) => {
  try {
    const rides = await Ride.find({}).sort({ createdAt: -1 });
    const bookings = await Booking.find({}).sort({ createdAt: -1 });
    const byRide = {};
    bookings.forEach((b) => { (byRide[String(b.rideId)] = byRide[String(b.rideId)] || []).push(b); });
    const data = [];
    for (const r of rides) {
      const poster = await findUserByPhone(r.userPhone);
      const rb = byRide[String(r._id)] || [];
      data.push({
        _id: r._id, from: r.from, to: r.to, date: r.date, time: r.time, vehicle: r.vehicle,
        seatsAvailable: r.seatsAvailable, viewCount: r.viewCount || 0, createdAt: r.createdAt,
        poster: { phone: r.userPhone || "", name: poster?.fullName || "TravelMate Rider", photo: poster?.photo || "" },
        bookedCount: rb.length, rodeCount: rb.filter((b) => b.status === "completed").length,
        riders: rb.map((b) => ({ phone: b.riderPhone, name: b.riderName || "Rider", status: b.status, bookedAt: b.createdAt })),
      });
    }
    res.json({ success: true, count: data.length, data });
  } catch (err) {
    console.error("admin/rides error:", err);
    res.status(500).json({ success: false, message: "Failed to load rides" });
  }
});

router.get("/bookings", requireAdmin, async (req, res) => {
  try {
    const bookings = await Booking.find({}).sort({ createdAt: -1 });
    res.json({ success: true, count: bookings.length, data: bookings });
  } catch {
    res.status(500).json({ success: false, message: "Failed to load bookings" });
  }
});

// ---------- REPORTS ----------
router.get("/reports", requireAdmin, async (req, res) => {
  try {
    const q = {};
    if (req.query.status) q.status = req.query.status;
    const reports = await Report.find(q).sort({ createdAt: -1 });
    const data = [];
    for (const r of reports) {
      const reported = await findUserByPhone(r.reportedPhone);
      data.push({
        _id: r._id, reporterPhone: r.reporterPhone, reporterName: r.reporterName,
        reportedPhone: r.reportedPhone, reportedName: r.reportedName || reported?.fullName || "",
        reason: r.reason, description: r.description || r.details || "", status: r.status, adminNote: r.adminNote,
        createdAt: r.createdAt, reviewedAt: r.reviewedAt, reportedUserBlocked: !!reported?.isBlocked,
      });
    }
    res.json({ success: true, count: data.length, data });
  } catch (err) {
    console.error("admin/reports error:", err);
    res.status(500).json({ success: false, message: "Failed to load reports" });
  }
});

router.post("/reports/:id/resolve", requireAdmin, async (req, res) => {
  try {
    const report = await Report.findByIdAndUpdate(req.params.id, { $set: { status: "resolved", adminNote: req.body.adminNote || "", reviewedAt: new Date() } }, { new: true });
    if (!report) return res.status(404).json({ success: false, message: "Report not found" });
    res.json({ success: true, message: "Report resolved", data: report });
  } catch {
    res.status(500).json({ success: false, message: "Failed to resolve report" });
  }
});

router.post("/reports/:id/block", requireAdmin, async (req, res) => {
  try {
    const report = await Report.findById(req.params.id);
    if (!report) return res.status(404).json({ success: false, message: "Report not found" });
    const user = await findUserByPhone(report.reportedPhone);
    if (!user) return res.status(404).json({ success: false, message: "Reported user not found in system" });
    user.isBlocked = true;
    user.blockReason = req.body.reason || report.reason || "Reported by another user";
    user.blockedAt = new Date();
    await user.save();
    report.status = "actioned";
    report.adminNote = req.body.adminNote || "User blocked";
    report.reviewedAt = new Date();
    await report.save();
    res.json({ success: true, message: "User blocked permanently", data: { report, user: { phone: user.phone, isBlocked: true } } });
  } catch (err) {
    console.error("admin/reports block error:", err);
    res.status(500).json({ success: false, message: "Failed to block user" });
  }
});

// ---------- USERS ----------
router.get("/users", requireAdmin, async (req, res) => {
  try {
    const users = await User.find({}).select("phone fullName email city gender photo isBlocked blockReason blockedAt createdAt").sort({ createdAt: -1 });
    res.json({ success: true, count: users.length, data: users });
  } catch {
    res.status(500).json({ success: false, message: "Failed to load users" });
  }
});

router.post("/users/block", requireAdmin, async (req, res) => {
  try {
    const { phone, reason } = req.body || {};
    const user = await findUserByPhone(phone);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    user.isBlocked = true; user.blockReason = reason || "Blocked by admin"; user.blockedAt = new Date();
    await user.save();
    res.json({ success: true, message: "User blocked", data: { phone: user.phone, isBlocked: true } });
  } catch {
    res.status(500).json({ success: false, message: "Failed to block user" });
  }
});

router.post("/users/unblock", requireAdmin, async (req, res) => {
  try {
    const { phone } = req.body || {};
    const user = await findUserByPhone(phone);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    user.isBlocked = false; user.blockReason = ""; user.blockedAt = null;
    await user.save();
    res.json({ success: true, message: "User unblocked", data: { phone: user.phone, isBlocked: false } });
  } catch {
    res.status(500).json({ success: false, message: "Failed to unblock user" });
  }
});

module.exports = router;
