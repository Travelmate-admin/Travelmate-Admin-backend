// config/db.js — MongoDB connection for the standalone admin backend.
// Uses the SAME MONGO_URI as the main TravelMate app so it reads the
// same users, rides, coupons and subscriptions.

const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error("MONGO_URI is not set. Copy it from the main project's server/.env");
    }
    // Pin the database name to "Tesco" so the admin panel always reads the
    // SAME database the customer app writes to, regardless of the URI path.
    const conn = await mongoose.connect(process.env.MONGO_URI, { dbName: "Tesco" });
    console.log(`Admin backend connected to MongoDB: host=${conn.connection.host} db=${conn.connection.name}`);
  } catch (err) {
    console.error(`MongoDB Error: ${err.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
