// config/db.js - MongoDB connection for the standalone admin backend.
// Uses the SAME MONGO_URI as the main TravelMate app so it reads the
// same users, rides, coupons and subscriptions.

const mongoose = require("mongoose");

// Remove any database name from the URI path so it can NEVER conflict with the
// pinned dbName below. MongoDB rejects two db names that differ only by case
// (e.g. existing "Travelmate" vs a URI path "/TravelMate"), throwing
// "db already exists with different case". Stripping the path and relying
// solely on dbName: "Travelmate" makes that impossible regardless of casing.
function stripDbNameFromUri(uri) {
  if (!uri) return uri;
  const parts = uri.split("?");
  const beforeQuery = parts[0];
  const query = parts.length > 1 ? parts.slice(1).join("?") : "";

  const schemeSep = "://";
  const schemeIdx = beforeQuery.indexOf(schemeSep);
  if (schemeIdx === -1) return uri;

  const afterScheme = beforeQuery.slice(schemeIdx + schemeSep.length);
  const slashIdx = afterScheme.indexOf("/");
  const hostSection = slashIdx === -1 ? afterScheme : afterScheme.slice(0, slashIdx);

  const rebuilt = beforeQuery.slice(0, schemeIdx + schemeSep.length) + hostSection;
  return rebuilt + "/" + (query ? "?" + query : "");
}

const connectDB = async () => {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error("MONGO_URI is not set. Copy it from the main project's server/.env");
    }
    // Pin the database name to "Travelmate" so the admin panel always reads the
    // SAME database the customer app writes to, regardless of the URI path.
    const cleanUri = stripDbNameFromUri(process.env.MONGO_URI);
    const conn = await mongoose.connect(cleanUri, { dbName: "Travelmate" });
    console.log(`Admin backend connected to MongoDB: host=${conn.connection.host} db=${conn.connection.name}`);
  } catch (err) {
    console.error(`MongoDB Error: ${err.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
