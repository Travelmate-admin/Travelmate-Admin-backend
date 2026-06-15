// server.js — standalone TravelMate Admin backend.
// Runs SEPARATELY from the main app, on its own port, against the same MongoDB.

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");

const adminRoutes = require("./routes/adminRoutes");
const reportRoutes = require("./routes/reportRoutes");
const bookingRoutes = require("./routes/bookingRoutes");

const app = express();

connectDB();

// CORS — allow the admin panel (and localhost dev) to call this API
const corsOrigins = (process.env.CORS_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    if (origin.includes("localhost")) return cb(null, true);
    if (corsOrigins.length === 0) return cb(null, true);
    if (corsOrigins.includes(origin)) return cb(null, true);
    return cb(new Error("CORS: origin not allowed: " + origin));
  },
  credentials: true,
}));

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.use("/api/admin", adminRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/bookings", bookingRoutes);

app.get("/", (req, res) => res.json({ message: "TravelMate Admin API running" }));

// Confirm WHICH database the admin panel is connected to + live counts.
// Open in a browser: http://localhost:5001/api/_dbhealth
// The "database" value here MUST match the customer backend's /api/_dbhealth.
app.get("/api/_dbhealth", async (req, res) => {
  try {
    const mongoose = require("mongoose");
    const conn = mongoose.connection;
    const states = ["disconnected", "connected", "connecting", "disconnecting"];
    const db = conn.db;
    const counts = {};
    if (db) {
      for (const n of ["users", "rides", "subscriptions", "bookings", "reports", "coupons"]) {
        counts[n] = await db.collection(n).countDocuments().catch(() => "n/a");
      }
    }
    res.json({
      ok: true,
      connectionState: states[conn.readyState] || conn.readyState,
      database: conn.name || "(unknown)",
      host: conn.host || "(unknown)",
      counts,
    });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
});
app.use((req, res) => res.status(404).json({ success: false, message: "Route not found" }));
app.use((err, req, res, next) => {
  console.error("❌ ERROR:", err.message);
  if (res.headersSent) return next(err);
  res.status(500).json({ success: false, message: err.message || "Internal Server Error" });
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => console.log(`🚀 Admin backend running on http://localhost:${PORT}`));
