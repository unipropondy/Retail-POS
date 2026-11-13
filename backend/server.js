// ==============================================================================
// Author: JAVITH, BAVANI 28-10-2026
// Project: Supermarket Retail POS
// File: server.js
// Description: Main HTTP server entry point with non-blocking DB pool connection,
//              CORS support, dynamic cryptographic JWT secret, and auth routes.
// ==============================================================================

// Load secret variables from .env into process.env
require("dotenv").config();

// Express: Fast, unopinionated, minimalist web framework for Node.js
const express = require("express");

// CORS: Enables your React Native / Expo app (on port 8081) to communicate with this server (port 5000)
const cors = require("cors");

// Crypto: Built-in Node tool to generate unpredictable secure keys
const crypto = require("crypto");

// Database pool instance
const { getPool, isDbConnected } = require("./config/db");

// ==============================================================================
// 1. DYNAMIC JWT SECRET GENERATION
// ==============================================================================

// Generates a 64-byte random hex string every time the server boots up.
// This guarantees that security keys are freshly created on every deployment or server restart.
const JWT_SECRET = crypto.randomBytes(64).toString("hex");

// ==============================================================================
// 2. EXPRESS APPLICATION CONFIGURATION
// ==============================================================================

const app = express();
const PORT = process.env.PORT || 5000;

// Enable Cross-Origin requests from Expo web / mobile app
app.use(cors());

// Automatically parse incoming JSON request bodies
app.use(express.json());

// ==============================================================================
// 3. API ROUTES SETUP
// ==============================================================================

// Root health check endpoint to check server & database status
// Developer: JAVITH 28-10-2026
app.get("/", (req, res) => {
  res.json({
    status: "online",
    system: "Supermarket Retail POS Backend",
    database: process.env.DB_NAME,
    sqlServerReachable: isDbConnected(),
    timestamp: new Date().toISOString(),
  });
});

// Mount authentication routes (handles login against tblMausermaster)
const authRoutes = require("./routes/auth")(JWT_SECRET);
app.use("/api/auth", authRoutes);

// [JAVITH - 28-10-2026]: Mount touch screen inventory routes (TBLinventorytsgroup & tblInventoryTSList)
const inventoryRoutes = require("./routes/inventory");
app.use("/api/inventory", inventoryRoutes);

// [JAVITH - 28-10-2026]: Mount dedicated payment mode routes (tblInvPaymode)
const paymodeRoutes = require("./routes/paymode");
app.use("/api/paymode", paymodeRoutes);

// [JAVITH, BAVANI - 30-10-2026]: Mount centralized App.config routes
const configRoutes = require("./routes/configRoutes");
app.use("/api/config", configRoutes);

// Mount temporary cart routes (tblTempSales persistence)
const cartRoutes = require("./routes/cartRoutes");
app.use("/api/cart", cartRoutes);

// Mount Hold & Release routes (F6 Hold / F7 Release)
const holdRoutes = require("./routes/holdRoutes");
app.use("/api/hold", holdRoutes);

// Mount Inventory Search routes (VB.NET frmSearch & clsInventory fncGetMultipleSearchDetails)
const searchRoutes = require("./routes/searchRoutes");
app.use("/api/search", searchRoutes);

// Mount POS Clear routes (F2 Clear) - Exact VB.NET Clear Process
const posClearRoutes = require("./routes/posClearRoutes");
app.use("/api/pos/clear", posClearRoutes);

// Mount Promotion routes (Item Promo, Multi-buy, Pair, Break Price)
const promotionRoutes = require("./routes/promotionRoutes");
app.use("/api/promotions", promotionRoutes);

// Mount Price Change routes (F11 Price Change, exact VB.NET parity)
const priceChangeRoutes = require("./routes/priceChangeRoutes");
app.use("/api/price-change", priceChangeRoutes);

// Mount View Bill / Last Transaction routes (frmLastTransaction.vb & clsInventory)
const billRoutes = require("./routes/billRoutes");
app.use("/api/bills", billRoutes);

// Mount Member management routes (clsMember.vb & frmMember.vb)
const memberRoutes = require("./routes/memberRoutes");
app.use("/api/members", memberRoutes);

// Mount Total Sales routes (frmTotalSales.vb & clsPaymode.vb GetTotalSales)
const totalSalesRoutes = require("./routes/totalSalesRoutes");
app.use("/api/total-sales", totalSalesRoutes);

// Mount Settlement routes (frmSettlement.vb & clsSales.vb Settlement Process)
const settlementRoutes = require("./routes/settlementRoutes");
app.use("/api/settlement", settlementRoutes);

// Mount Paymode Change routes (frmPaymodeModification.vb & btn_PaymodeChange_Click)
const paymodeChangeRoutes = require("./routes/paymodeChangeRoutes");
app.use("/api/paymode-change", paymodeChangeRoutes);

// ==============================================================================
// 4. SERVER STARTUP (NON-BLOCKING)
// ==============================================================================

// Start listening for HTTP connections immediately
app.listen(PORT, async () => {
  console.log("====================================================");
  console.log(`🚀 Retail POS Server is live on port: ${PORT}`);
  console.log(`🌐 Base URL: http://localhost:${PORT}`);
  console.log("🔒 JWT Session Security: Initialized");
  console.log("====================================================");

  // Attempt to connect to MS SQL in the background without blocking the HTTP server
  console.log("🔄 Checking MS SQL Server connection...");
  await getPool();
});
