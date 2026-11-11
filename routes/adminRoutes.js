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
const RideRequest = require("../models/RideRequest");
const Subscription = require("../models/Subscription");
const Setting = require("../models/Setting");
const BusRoute = require("../models/BusRoute");
const BusRouteImport = require("../models/BusRouteImport");
const { chennaiRouteError } = require("../utils/chennai");

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
    const [totalUsers, blockedUsers, totalRides, upcomingRides, legacyBookings, legacyCompleted, confirmedReqs, paidReqs, coupons, totalReports, pendingReports, subscriptions] = await Promise.all([
      User.countDocuments({}),
      User.countDocuments({ isBlocked: true }),
      Ride.countDocuments({}),
      Ride.countDocuments({ date: { $gte: todayStr } }),
      Booking.countDocuments({}),
      Booking.countDocuments({ status: "completed" }),
      // NEW flow: confirmed = accepted requests; "rode/completed" = paid.
      RideRequest.countDocuments({ status: "accepted" }),
      RideRequest.countDocuments({ status: "accepted", paymentStatus: "paid" }),
      Coupon.find({}),
      Report.countDocuments({}),
      Report.countDocuments({ status: "pending" }),
      Subscription.find({}),
    ]);
    const totalBookings = legacyBookings + confirmedReqs;
    const completedBookings = legacyCompleted + paidReqs;

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

    // Legacy bookings (old "Booking" collection).
    const bookings = await Booking.find({}).sort({ createdAt: -1 });
    const bookingByRide = {};
    bookings.forEach((b) => { (bookingByRide[String(b.rideId)] = bookingByRide[String(b.rideId)] || []).push(b); });

    // NEW booking flow: a rider is "booked" once the driver CONFIRMS the
    // request (status accepted). "rode" == they also completed payment (paid).
    // pending / rejected / cancelled / expired don't count as booked.
    const reqs = await RideRequest.find({ status: "accepted" }).sort({ createdAt: -1 });
    const reqByRide = {};
    reqs.forEach((r) => { (reqByRide[String(r.rideId)] = reqByRide[String(r.rideId)] || []).push(r); });

    const last10 = (p) => String(p || "").replace(/\D/g, "").slice(-10);

    const data = [];
    for (const r of rides) {
      const poster = await findUserByPhone(r.userPhone);
      const legacy = bookingByRide[String(r._id)] || [];
      const confirmed = reqByRide[String(r._id)] || [];

      // Merge both sources, de-duplicated by rider phone (last-10 digits).
      const ridersMap = new Map();
      legacy.forEach((b) => {
        ridersMap.set(last10(b.riderPhone), {
          phone: b.riderPhone, name: b.riderName || "Rider",
          status: b.status, bookedAt: b.createdAt,
        });
      });
      confirmed.forEach((rq) => {
        ridersMap.set(last10(rq.riderPhone), {
          phone: rq.riderPhone, name: rq.riderName || "Rider",
          // "paid" when payment completed, else "booked" (confirmed).
          status: rq.paymentStatus === "paid" ? "paid" : "booked",
          bookedAt: rq.createdAt,
        });
      });
      const riders = Array.from(ridersMap.values());
      const rodeCount = riders.filter((x) => x.status === "completed" || x.status === "paid").length;

      data.push({
        _id: r._id, from: r.from, to: r.to, date: r.date, time: r.time, vehicle: r.vehicle,
        seatsAvailable: r.seatsAvailable, viewCount: r.viewCount || 0, createdAt: r.createdAt,
        poster: { phone: r.userPhone || "", name: poster?.fullName || "Vooggly Rider", photo: poster?.photo || "" },
        bookedCount: riders.length, rodeCount,
        riders,
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

// ---------- PRICING / PLANS ----------
const PRICING_DEFAULTS = {
  plans: {
    daily:   { price: 30,   durationDays: 1 },
    monthly: { price: 650,  durationDays: 30 },
    yearly:  { price: 1200, durationDays: 365 },
  },
  // dailyPrice = Find Ride Daily plan price (separate from Post Ride Daily).
  findRide: { unlockFee: 49, processingFee: 1, dailyPrice: 1 },
};

const posNum = (v, fallback) =>
  Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : fallback;

// Get-or-create the single pricing document.
async function getPricingDoc() {
  let doc = await Setting.findOne({ key: "pricing" });
  if (!doc) doc = await Setting.create({ key: "pricing", ...PRICING_DEFAULTS });
  return doc;
}

router.get("/pricing", requireAdmin, async (req, res) => {
  try {
    const doc = await getPricingDoc();
    res.json({
      success: true,
      data: {
        plans: {
          daily:   { price: posNum(doc.plans?.daily?.price, 30),    durationDays: posNum(doc.plans?.daily?.durationDays, 1) },
          monthly: { price: posNum(doc.plans?.monthly?.price, 650),  durationDays: posNum(doc.plans?.monthly?.durationDays, 30) },
          yearly:  { price: posNum(doc.plans?.yearly?.price, 1200),  durationDays: posNum(doc.plans?.yearly?.durationDays, 365) },
        },
        findRide: {
          unlockFee:     posNum(doc.findRide?.unlockFee, 49),
          processingFee: posNum(doc.findRide?.processingFee, 1),
          dailyPrice:    posNum(doc.findRide?.dailyPrice, 1),
        },
        updatedAt: doc.updatedAt,
      },
    });
  } catch (err) {
    console.error("admin/pricing GET error:", err);
    res.status(500).json({ success: false, message: "Failed to load pricing" });
  }
});

router.put("/pricing", requireAdmin, async (req, res) => {
  try {
    const body = req.body || {};
    const doc = await getPricingDoc();

    const p = body.plans || {};
    ["daily", "monthly", "yearly"].forEach((k) => {
      if (p[k]) {
        if (p[k].price !== undefined) doc.plans[k].price = posNum(p[k].price, doc.plans[k].price);
        if (p[k].durationDays !== undefined) doc.plans[k].durationDays = posNum(p[k].durationDays, doc.plans[k].durationDays);
      }
    });

    const f = body.findRide || {};
    if (!doc.findRide) doc.findRide = {};
    if (f.unlockFee !== undefined) doc.findRide.unlockFee = posNum(f.unlockFee, doc.findRide.unlockFee);
    if (f.processingFee !== undefined) doc.findRide.processingFee = posNum(f.processingFee, doc.findRide.processingFee);
    if (f.dailyPrice !== undefined) doc.findRide.dailyPrice = posNum(f.dailyPrice, doc.findRide.dailyPrice != null ? doc.findRide.dailyPrice : 1);
    doc.markModified("findRide");

    await doc.save();
    res.json({ success: true, message: "Pricing updated", data: doc });
  } catch (err) {
    console.error("admin/pricing PUT error:", err);
    res.status(500).json({ success: false, message: "Failed to update pricing" });
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

// ---------- BUS ROUTES (admin-managed) ----------
// Normalize + sanitize a bus-route payload from the admin form.
function cleanBusRoutePayload(body) {
  const b = body || {};
  const stops = Array.isArray(b.stops)
    ? b.stops
        .map((s) => (typeof s === "string" ? { name: s } : s))
        .map((s) => ({
          name: String(s?.name || "").trim(),
          lat: Number.isFinite(Number(s?.lat)) ? Number(s.lat) : null,
          lon: Number.isFinite(Number(s?.lon)) ? Number(s.lon) : null,
        }))
        .filter((s) => s.name)
    : [];
  return {
    busNumber: String(b.busNumber || "").trim(),
    operator: String(b.operator || "").trim(),
    state: String(b.state || "Tamil Nadu").trim() || "Tamil Nadu",
    from: String(b.from || "").trim(),
    to: String(b.to || "").trim(),
    fromLat: Number.isFinite(Number(b.fromLat)) ? Number(b.fromLat) : null,
    fromLon: Number.isFinite(Number(b.fromLon)) ? Number(b.fromLon) : null,
    toLat: Number.isFinite(Number(b.toLat)) ? Number(b.toLat) : null,
    toLon: Number.isFinite(Number(b.toLon)) ? Number(b.toLon) : null,
    stops,
    notes: String(b.notes || "").slice(0, 500),
    active: b.active === undefined ? true : !!b.active,
  };
}
function validateBusRoute(p) {
  if (!p.busNumber) return "Bus number is required";
  if (!p.from) return "Starting location is required";
  if (!p.to) return "Destination is required";
  // Chennai-only restriction: start, end and every stop must be within Chennai.
  const cErr = chennaiRouteError(p);
  if (cErr) return cErr + ". Only routes within Chennai city are allowed.";
  return "";
}

// List (with optional search by number/from/to)
router.get("/bus-routes", requireAdmin, async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    let filter = {};
    if (q) {
      const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter = { $or: [{ busNumber: rx }, { from: rx }, { to: rx }] };
    }
    const rows = await BusRoute.find(filter).sort({ updatedAt: -1 }).limit(500).lean();
    res.json({ success: true, count: rows.length, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: "Failed to load bus routes" });
  }
});

// Create
router.post("/bus-routes", requireAdmin, async (req, res) => {
  try {
    const p = cleanBusRoutePayload(req.body);
    const err = validateBusRoute(p);
    if (err) return res.status(400).json({ success: false, message: err });
    const route = await BusRoute.create(p);
    res.status(201).json({ success: true, data: route });
  } catch (e) {
    if (e && e.code === 11000) {
      return res.status(409).json({ success: false, message: "A route with this bus number already exists." });
    }
    res.status(500).json({ success: false, message: "Failed to create bus route" });
  }
});

// Update
router.put("/bus-routes/:id", requireAdmin, async (req, res) => {
  try {
    const p = cleanBusRoutePayload(req.body);
    const err = validateBusRoute(p);
    if (err) return res.status(400).json({ success: false, message: err });
    const route = await BusRoute.findById(req.params.id);
    if (!route) return res.status(404).json({ success: false, message: "Bus route not found" });
    Object.assign(route, p);
    await route.save(); // pre-validate recomputes searchKey
    res.json({ success: true, data: route });
  } catch (e) {
    if (e && e.code === 11000) {
      return res.status(409).json({ success: false, message: "A route with this bus number already exists." });
    }
    res.status(500).json({ success: false, message: "Failed to update bus route" });
  }
});

// Delete
router.delete("/bus-routes/:id", requireAdmin, async (req, res) => {
  try {
    const r = await BusRoute.findByIdAndDelete(req.params.id);
    if (!r) return res.status(404).json({ success: false, message: "Bus route not found" });
    res.json({ success: true, message: "Bus route deleted" });
  } catch (e) {
    res.status(500).json({ success: false, message: "Failed to delete bus route" });
  }
});

// ---------- BUS ROUTE BULK IMPORT (Excel / CSV) ----------
// The admin uploads one Excel/CSV; the frontend parses it (SheetJS), groups
// rows by bus number and validates, then POSTs the clean route objects here.
// This endpoint only writes to the SAME busroutes collection used by the
// manual form — imported and manually-added routes live together.

// Normalize one grouped import route. Mirrors cleanBusRoutePayload but also
// captures the extra optional columns (busName, busType, distance, via, and
// per-stop order / arrival / departure times).
function cleanBulkRoute(r) {
  const b = r || {};
  const stops = Array.isArray(b.stops)
    ? b.stops
        .map((s, i) => ({
          name: String((s && s.name) || "").trim(),
          order: Number.isFinite(Number(s?.order)) ? Number(s.order) : i + 1,
          arrivalTime: String(s?.arrivalTime || "").trim(),
          departureTime: String(s?.departureTime || "").trim(),
          lat: Number.isFinite(Number(s?.lat)) ? Number(s.lat) : null,
          lon: Number.isFinite(Number(s?.lon)) ? Number(s.lon) : null,
        }))
        .filter((s) => s.name)
        .sort((a, c) => (a.order || 0) - (c.order || 0))
    : [];
  const via = Array.isArray(b.via)
    ? b.via.map((v) => String(v || "").trim()).filter(Boolean)
    : String(b.via || "").split(/[,;|]/).map((v) => v.trim()).filter(Boolean);
  const statusRaw = String(b.status ?? "").trim().toLowerCase();
  const active =
    b.active !== undefined
      ? !!b.active
      : !(["inactive", "hidden", "false", "0", "no", "off"].includes(statusRaw));
  return {
    busNumber: String(b.busNumber || "").trim(),
    busName: String(b.busName || "").trim(),
    // keep `operator` populated from Bus Name so the existing table/column still
    // shows something sensible for imported rows.
    operator: String(b.operator || b.busName || "").trim(),
    state: String(b.state || "Tamil Nadu").trim() || "Tamil Nadu",
    from: String(b.from || "").trim(),
    to: String(b.to || "").trim(),
    via,
    busType: String(b.busType || "").trim(),
    distance: String(b.distance || "").trim(),
    stops,
    notes: String(b.notes || "").slice(0, 500),
    active,
  };
}

// Bulk import. mode="add" inserts only new routes (existing are skipped, so
// current data is never overwritten); mode="update" updates existing routes
// and also inserts any new ones (upsert).
router.post("/bus-routes/import", requireAdmin, async (req, res) => {
  try {
    const mode = String(req.body?.mode || "add").toLowerCase() === "update" ? "update" : "add";
    const fileName = String(req.body?.fileName || "").slice(0, 200);
    const routes = Array.isArray(req.body?.routes) ? req.body.routes : [];
    if (!routes.length) return res.status(400).json({ success: false, message: "No routes to import." });

    let created = 0, updated = 0, skipped = 0;
    const errors = [];

    for (const raw of routes) {
      const p = cleanBulkRoute(raw);
      const vErr = validateBusRoute(p);
      if (vErr) { errors.push({ busNumber: p.busNumber || "(blank)", reason: vErr }); continue; }
      const searchKey = String(p.busNumber).toUpperCase().replace(/[\s-]+/g, "");
      try {
        const existing = await BusRoute.findOne({ searchKey });
        if (existing) {
          if (mode === "add") {
            skipped++;
            errors.push({ busNumber: p.busNumber, reason: "Already exists (skipped in Add New mode)" });
            continue;
          }
          Object.assign(existing, p);
          await existing.save(); // pre-validate recomputes searchKey
          updated++;
        } else {
          await BusRoute.create(p);
          created++;
        }
      } catch (e) {
        errors.push({ busNumber: p.busNumber, reason: e.code === 11000 ? "Duplicate bus number" : (e.message || "Save failed") });
      }
    }

    const success = created + updated;
    const failed = errors.length;
    const total = routes.length;

    let historyId = null;
    try {
      const doc = await BusRouteImport.create({
        fileName, mode, total, success, failed, created, updated, skipped,
        errors: errors.slice(0, 50),
        by: req.admin?.username || "",
      });
      historyId = doc._id;
    } catch (_e) { /* history is best-effort */ }

    res.json({ success: true, data: { total, success, failed, created, updated, skipped, errors, importId: historyId } });
  } catch (e) {
    res.status(500).json({ success: false, message: "Import failed. Please try again." });
  }
});

// Import history — most recent bulk imports (total / successful / failed).
router.get("/bus-routes/import-history", requireAdmin, async (req, res) => {
  try {
    const rows = await BusRouteImport.find().sort({ createdAt: -1 }).limit(20).lean();
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: "Failed to load import history" });
  }
});

module.exports = router;
