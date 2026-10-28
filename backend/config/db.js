// ==============================================================================
// Author: JAVITH,BAVANI 28-10-2026
// Project: Supermarket Retail POS
// File: config/db.js
// Description: Microsoft SQL Server connection pool manager with auto-retry
//              and non-blocking startup (handles temporary network disconnects).
// ==============================================================================

// Load secret variables from .env into process.env
require("dotenv").config();

// Import the official Microsoft SQL driver for Node.js
const sql = require("mssql");

// Database connection configuration object
const dbConfig = {
  // Database user from .env
  user: process.env.DB_USER,

  // Database password from .env
  password: process.env.DB_PASSWORD,

  // IP address of your SQL Server machine
  server: process.env.DB_SERVER,

  // Custom port number for SQL Server
  port: parseInt(process.env.DB_PORT, 10),

  // Target database name
  database: process.env.DB_NAME,

  options: {
    // Disable SSL encryption requirement for local / Radmin VPN network
    encrypt: false,

    // Trust the server certificate to avoid handshake validation errors
    trustServerCertificate: true,
  },

  // Connection pool options for high performance in retail POS
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },

  // Connection timeout in milliseconds (8 seconds)
  connectionTimeout: 8000,
};

// Variable holding the active pool promise
let poolPromise = null;

// Track if database is currently reachable
let isConnected = false;

// Function to establish or retrieve the active database pool
async function getPool() {
  if (poolPromise) {
    return poolPromise;
  }

  try {
    // Create new connection pool to MS SQL Server
    poolPromise = await sql.connect(dbConfig);
    isConnected = true;
    console.log(
      `✅ [DB] Successfully connected to MS SQL Server (${process.env.DB_SERVER}:${process.env.DB_PORT})`,
    );
    return poolPromise;
  } catch (error) {
    isConnected = false;
    poolPromise = null;
    // Log friendly warning without crashing the entire backend server
    console.warn(
      `⚠️ [DB] SQL Server currently unreachable at ${process.env.DB_SERVER}:${process.env.DB_PORT} (${error.message}).`,
    );
    console.warn(
      `ℹ️ [DB] Running in resilient mode. System will retry on next query.`,
    );
    return null;
  }
}

// Helper to check connection status
function isDbConnected() {
  return isConnected;
}

module.exports = {
  sql,
  getPool,
  isDbConnected,
};
